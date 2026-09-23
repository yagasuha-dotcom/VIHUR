// Headless gameplay test: trading, SL/TP, margin, liquidation, loans, missions, save/load round-trip.
import { World, LIVE_DT } from '../src/engine/world';
import { DAY } from '../src/engine/time';
import { accountOf, closePosition, newPlayer, previewOrder, processTick, submitOrder, rolloverPositions, modifyPosition } from '../src/features/trading/engine';
import { loanOffers, takeLoan, processLoansDaily, repayLoan, declareBankruptcy, isBroke } from '../src/features/banking/bank';
import { checkMissions } from '../src/features/missions/missions';
import type { Notification } from '../src/features/types';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const notes: string[] = [];
const notify = (n: Omit<Notification, 'id' | 't' | 'read'>) => { notes.push(n.title); };

const w = World.create(739241, 'NORMAL'); w.warmupSync();
const p = newPlayer('NORMAL', 0);
ok(Math.abs(w.asset('BTC/USD').price - 104231.2) < 1e-6, 'BTC starts at $104,231.20');
ok(Math.abs(w.asset('EUR/USD').price - 1.1742) < 1e-9 && Math.abs(w.asset('GOLD/USD').price - 2912) < 1e-6, 'EUR/USD 1.1742 and GOLD 2912 at launch');
ok(w.s.news.length === 1 && w.s.news[0].headline.startsWith('Markets open relatively calm'), 'opening bulletin scripted');
w.step(LIVE_DT);

// --- preview validation
let pv = previewOrder(p, w, { assetId: 'BTC/USD', side: 'BUY', type: 'MARKET', size: 0.05, leverage: 10 });
ok(pv.ok && Math.abs(pv.margin - pv.notional / 10) < 1e-6, `BTC 0.05 @10x margin $${pv.margin.toFixed(0)} (notional $${pv.notional.toFixed(0)})`);
pv = previewOrder(p, w, { assetId: 'BTC/USD', side: 'BUY', type: 'MARKET', size: 5, leverage: 1 });
ok(!pv.ok && /margin/i.test(pv.error ?? ''), 'rejects order exceeding free margin');
pv = previewOrder(p, w, { assetId: 'NEXA', side: 'BUY', type: 'MARKET', size: 10, leverage: 1 });
ok(!pv.ok && /closed/i.test(pv.error ?? ''), 'stocks closed at 08:00 -> market order rejected');
pv = previewOrder(p, w, { assetId: 'EUR/USD', side: 'BUY', type: 'MARKET', size: 0.5, leverage: 20, sl: 1.19 });
ok(!pv.ok && /wrong side/i.test(pv.error ?? ''), 'rejects stop loss on wrong side');

// --- open, SL/TP, close
const bal0 = p.balance;
let r = submitOrder(p, w, { assetId: 'EUR/USD', side: 'BUY', type: 'MARKET', size: 0.5, leverage: 20, sl: 1.1690, tp: 1.1790, reason: 'test' }, notify);
ok(r.ok && !!r.position, 'EUR/USD 0.5 lot long opened');
const pos = r.position!;
ok(Math.abs(pos.notional - 0.5 * 100000 * pos.entry) < 1e-6 && Math.abs(pos.margin - pos.notional / 20) < 1e-6, `forex notional/margin: ${pos.notional.toFixed(0)} / ${pos.margin.toFixed(0)}`);
const bpos = submitOrder(p, w, { assetId: 'ETH/USD', side: 'BUY', type: 'MARKET', size: 0.1, leverage: 2 }, notify);
ok(bpos.ok && p.balance < bal0 - 0.0001 + 0, 'fee deducted at open (crypto)');
if (bpos.position) closePosition(p, w, bpos.position.id, 'MANUAL', notify);
let acc = accountOf(p, w);
ok(Math.abs(acc.equity - (p.balance + acc.unrealized)) < 1e-6 && acc.freeMargin < acc.equity, 'equity/free margin consistent');
const j = p.journal.find((x) => x.positionId === pos.id);
ok(!!j && j.result === 'OPEN' && j.reason === 'test', 'journal entry created with reason');
// run until it resolves via SL/TP (or 3 days)
let steps = 0;
while (p.positions.length && steps++ < 3 * DAY / LIVE_DT) { w.step(LIVE_DT); processTick(p, w, notify); }
const tr = p.trades.find((x) => x.journalId === pos.journalId);
ok(!!tr && (tr.closeReason === 'SL' || tr.closeReason === 'TP'), `position resolved by ${tr?.closeReason} after ${(steps * LIVE_DT / 3600).toFixed(1)}h, P/L $${tr?.pnl.toFixed(2)}`);
ok(p.journal.find((x) => x.id === pos.journalId)?.result !== 'OPEN', 'journal closed with result + auto lesson');
ok(p.counters.opened === 2 && p.counters.closed === 2, 'counters updated (EUR/USD + ETH trades)');

// --- pending order + modify
r = submitOrder(p, w, { assetId: 'BTC/USD', side: 'BUY', type: 'LIMIT', size: 0.02, leverage: 5, price: w.asset('BTC/USD').price * 0.9995, reason: 'limit' }, notify);
ok(r.ok && p.orders.length === 1, 'limit order placed');
for (let i = 0; i < 20000 && p.orders.length; i++) { w.step(LIVE_DT); processTick(p, w, notify); }
ok(p.positions.length === 1, 'limit order eventually triggered into a position');
const mp = p.positions[0];
ok(modifyPosition(p, w, mp.id, mp.entry * 0.98, mp.entry * 1.02) === null, 'modify SL/TP accepted');
ok(modifyPosition(p, w, mp.id, mp.entry * 1.5, undefined) !== null, 'modify rejects SL above price on long');
closePosition(p, w, mp.id, 'MANUAL', notify);

// --- liquidation: max leverage on a volatile coin
let liq = false;
for (let attempt = 0; attempt < 6 && !liq; attempt++) {
  const eq = accountOf(p, w).freeMargin;
  const px = w.asset('FLUX/USD').price;
  const size = Math.floor((eq * 20 * 0.85) / px);
  const rr = submitOrder(p, w, { assetId: 'FLUX/USD', side: 'BUY', type: 'MARKET', size, leverage: 20 }, notify);
  if (!rr.ok) { console.log('   (skip)', rr.error); break; }
  for (let i = 0; i < 4 * DAY / LIVE_DT && p.positions.length; i++) { w.step(LIVE_DT); processTick(p, w, notify); }
  liq = p.trades.some((t) => t.closeReason === 'LIQUIDATION');
  if (p.positions.length) closePosition(p, w, p.positions[0].id, 'MANUAL', notify);
}
ok(liq || p.counters.marginCalls > 0, `20x on a high-vol coin got a margin call/liquidation (calls ${p.counters.marginCalls}, liquidations ${p.counters.liquidations})`);
ok(notes.some((n) => /MARGIN CALL|LIQUIDAT/i.test(n)) || !liq, 'margin call/liquidation notified');
console.log('   balance after test trades:', p.balance.toFixed(2));

// --- loans & credit
p.reputation = 55;
const offers = loanOffers(p, w);
ok(offers.every((o) => o.allowed), 'all three loan tiers available at reputation 55');
const before = p.balance;
ok(takeLoan(p, w, 't2', notify) === null && Math.abs(p.balance - before - 10000) < 1e-6, 'loan credited $10,000');
ok(accountOf(p, w).debt > 10000, `debt = $${accountOf(p, w).debt.toFixed(0)} (principal + interest)`);
const credit0 = p.credit;
for (let d = 0; d < 16; d++) { w.advance(DAY); processLoansDaily(p, w, notify); rolloverPositions(p, w); }
ok(p.loans[0].status === 'PAID' || p.loans[0].status === 'LATE', `loan after due date: ${p.loans[0].status}, credit ${credit0.toFixed(0)} -> ${p.credit.toFixed(0)}`);
checkMissions(p, w, notify);
ok(p.missionsDone['first_trade'] !== undefined, 'mission FIRST TRADE completed');

// --- bankruptcy recovery path
const q = newPlayer('NORMAL', 0); q.balance = 3;
ok(isBroke(q, w), 'account with $3 is flagged as broke');
ok(declareBankruptcy(q, w, notify) === null && q.balance === 1500 && q.credit === 300, 'bankruptcy resets to $1,500 / credit 300');

// --- save / load round trip and determinism
w.saveRng();
import('../src/store/pack').then(() => {});
const json = JSON.stringify({ world: w.s, player: p });
console.log('   save size:', (json.length / 1e6).toFixed(2), 'MB');
const back = JSON.parse(json);
const { stringifyPacked, parsePacked } = await import('../src/store/pack');
const packed = stringifyPacked({ world: w.s, player: p });
console.log('   packed save:', (packed.length / 1e6).toFixed(2), 'MB (vs', (json.length / 1e6).toFixed(2), 'MB raw)');
const rt = parsePacked<{ world: typeof w.s }>(packed);
ok(rt.world.market.assets['BTC/USD'].candles['5m'].length === w.s.market.assets['BTC/USD'].candles['5m'].length && Math.abs(rt.world.market.assets['BTC/USD'].price - w.s.market.assets['BTC/USD'].price) < 1e-9, 'packed save round-trips candles and prices');
const w2 = new World(back.world);
w2.ensureCalendar(w2.day, 6);
const a = new World(JSON.parse(JSON.stringify(w.s)));
a.ensureCalendar(a.day, 6);
for (let i = 0; i < 3000; i++) { a.step(LIVE_DT); w2.step(LIVE_DT); }
const same = ['BTC/USD', 'NEXA', 'EUR/USD', 'GOLD/USD'].every((id) => a.asset(id).price === w2.asset(id).price);
ok(same, 'two worlds restored from the same save evolve identically (deterministic RNG)');
ok(w2.s.news.length === a.s.news.length, 'news generation identical after restore');

console.log(fails ? `\n${fails} FAILED` : '\nALL PLAYTESTS PASSED');
process.exit(fails ? 1 : 0);
