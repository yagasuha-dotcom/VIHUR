import type { AssetDef, AssetState } from '@/types';
import type { World } from '@/engine/world';
import { CATALOG_MAP } from '@/engine/catalog';
import { buildBook, walkBook } from '@/engine/orderBook';
import { hash01, hashString } from '@/engine/rng';
import { DIFFICULTY } from '@/engine/difficulty';
import { dayIndexOf, secOfDay } from '@/engine/time';
import type {
  Account, ClosedTrade, CloseReason, Counters, JournalEntry, Notification, OrderPreview, OrderRequest, PendingOrder, PlayerState, Position, Quote,
} from '../types';

export type Notify = (n: Omit<Notification, 'id' | 't' | 'read'>) => void;

export function newCounters(): Counters {
  return {
    opened: 0, closed: 0, wins: 0, losses: 0, newsTrades: 0, crashProfits: 0, marginCalls: 0, liquidations: 0, loansTaken: 0, loansRepaid: 0, loansLate: 0,
    noMarginCallDays: 0, bankruptcies: 0, recoveredFromBankruptcy: 0, daysPlayed: 0, everDebt: false, debtFreeAfterDebt: false, slTrades: 0, tpWins: 0,
    bearProfit: 0, bullProfit: 0, shortWins: 0, leverageMax: 1, sideJobs: 0, dailyRewards: 0, overtradeFlags: 0, revengeFlags: 0, ipoWins: 0, lifeEvents: 0,
    bestTrade: 0, worstTrade: 0, largestTrade: 0, tradedForexAndCrypto: 0, classesTraded: [],
  };
}

export function newPlayer(difficulty: PlayerState['difficulty'], startDay = 0): PlayerState {
  return {
    balance: 10000, startCapital: 10000, realized: 0, positions: [], orders: [], trades: [], loans: [], journal: [], xp: 0, reputation: 20, credit: 680,
    discipline: 60, patience: 60, riskControl: 60, counters: newCounters(), peakEquity: 10000, maxDD: 0, equityHistory: [{ day: startDay, equity: 10000, netWorth: 10000 }],
    missionsDone: {}, achievements: {}, marginState: 'OK', lastMarginCallDay: -99, notifications: [], ipoSubs: [], dailyRewardDay: -1, sideJobDay: -1, psychFlags: [],
    drawings: {}, settings: { sound: true, tutorialDone: false, showPatterns: true, confirmOrders: true }, difficulty, seq: 0, startDay, brokeDay: -1,
    dayStartEquity: 10000, lastEquityDay: startDay, rewardStreak: 0, watch: ['BTC/USD', 'EUR/USD', 'GOLD/USD', 'NEXA'], bankruptcyBaseline: null, reports: [],
  };
}

const uid = (p: PlayerState, prefix: string) => `${prefix}${++p.seq}`;

// ------------------------------------------------------------------------------------------------
// Instrument math (all values in USD)
// ------------------------------------------------------------------------------------------------
export function unitsOf(def: AssetDef, size: number): number { return def.cls === 'forex' ? size * (def.lotSize ?? 100000) : size; }
export function notionalUSD(def: AssetDef, size: number, price: number): number {
  if (def.cls === 'forex') { const u = size * (def.lotSize ?? 100000); return def.base === 'USD' ? u : u * price; }
  return size * price;
}
export function pnlUSD(def: AssetDef, side: 'LONG' | 'SHORT', size: number, entry: number, exit: number): number {
  const dir = side === 'LONG' ? 1 : -1;
  if (def.cls === 'forex') {
    const u = size * (def.lotSize ?? 100000);
    return def.quote === 'USD' ? (exit - entry) * u * dir : ((exit - entry) * u * dir) / exit;
  }
  return (exit - entry) * size * dir;
}
export function pipValueLabel(def: AssetDef): string { return def.cls === 'forex' ? `${def.pipSize}` : ''; }

export function quoteOf(a: AssetState): Quote {
  return { bid: a.price * (1 - a.spread / 2), ask: a.price * (1 + a.spread / 2), mid: a.price, spread: a.spread, open: a.open && a.status === 'ACTIVE' };
}
export function exitPrice(pos: Position, a: AssetState): number {
  return pos.side === 'LONG' ? a.price * (1 - a.spread / 2) : a.price * (1 + a.spread / 2);
}
export function positionPnl(pos: Position, a: AssetState): number {
  return pnlUSD(CATALOG_MAP[pos.assetId], pos.side, pos.size, pos.entry, exitPrice(pos, a));
}
export function roundPrice(def: AssetDef, p: number): number { const f = 10 ** def.decimals; return Math.round(p * f) / f; }

export function liqPriceOf(pos: { side: 'LONG' | 'SHORT'; entry: number; leverage: number }, stopOut: number): number {
  const loss = Math.max(0.0005, (1 - stopOut / 100) / pos.leverage);
  return pos.side === 'LONG' ? pos.entry * (1 - loss) : pos.entry * (1 + loss);
}

export function accountOf(p: PlayerState, w: World): Account {
  let unreal = 0, used = 0;
  const holdings: Record<string, number> = {};
  for (const pos of p.positions) {
    const a = w.asset(pos.assetId);
    const pnl = positionPnl(pos, a);
    unreal += pnl; used += pos.margin;
    const cls = CATALOG_MAP[pos.assetId].cls;
    holdings[cls] = (holdings[cls] ?? 0) + pos.margin + pnl;
  }
  const equity = p.balance + unreal;
  let debt = 0;
  for (const l of p.loans) if (l.status !== 'PAID') debt += l.remaining;
  const freeMargin = equity - used;
  return {
    balance: p.balance, equity, usedMargin: used, freeMargin, unrealized: unreal, marginLevel: used > 0 ? (equity / used) * 100 : Infinity,
    debt, netWorth: equity - debt, holdings, cash: p.balance - used,
  };
}

export function marketCondition(w: World, assetId: string): string {
  const def = CATALOG_MAP[assetId];
  const reg = w.s.market.regimes[def.cls === 'stock' || def.cls === 'index' ? 'EQUITY' : def.cls === 'crypto' ? 'CRYPTO' : def.cls === 'forex' || def.cls === 'bond' ? 'FOREX' : 'COMMODITY'].current;
  const sent = w.asset(assetId).sentiment;
  return `${reg.replace('_', ' ')} regime, sentiment ${sent > 0.25 ? 'positive' : sent < -0.25 ? 'negative' : 'neutral'}`;
}

// ------------------------------------------------------------------------------------------------
// Order preview / validation
// ------------------------------------------------------------------------------------------------
export function maxLeverageFor(def: AssetDef, p: PlayerState): number {
  let m = def.maxLeverage;
  if (m > 20 && p.reputation < 40) m = 20;             // 50x is a reputation unlock
  return m;
}
export function leverageOptions(def: AssetDef, p: PlayerState): number[] {
  const mx = maxLeverageFor(def, p);
  return [1, 2, 5, 10, 20, 50].filter((l) => l <= mx);
}

function fillEstimate(w: World, def: AssetDef, a: AssetState, side: 'BUY' | 'SELL', size: number): { avg: number; slipRel: number } {
  const slipK = DIFFICULTY[w.s.difficulty].slip;
  const unitsPer = def.cls === 'forex' ? (def.lotSize ?? 100000) : 1;
  const notionalPerUnit = def.cls === 'forex' ? (def.base === 'USD' ? 1 : a.price) : a.price;
  const depthAdj = (def.depthUSD * a.price) / notionalPerUnit;
  const book = buildBook(a.price, a.spread, depthAdj, a.liquidityNow, hashString(def.id), Math.floor(w.t / 30), 10);
  const units = size * unitsPer;
  const res = walkBook(book, side, units, slipK);
  const stress = 1 + (w.s.market.eventStress[def.id] ?? 0) * 3 + a.volBoost * 0.5;
  const rand = hash01(Math.floor(w.t), hashString(def.id), 7);
  const extra = a.spread * 0.35 * (stress - 1 + rand * 0.6) * slipK;
  const slipRel = res.slipRel * slipK + Math.max(0, extra);
  const touch = side === 'BUY' ? a.price * (1 + a.spread / 2) : a.price * (1 - a.spread / 2);
  const avg = side === 'BUY' ? touch * (1 + slipRel) : touch * (1 - slipRel);
  return { avg, slipRel };
}

export function previewOrder(p: PlayerState, w: World, req: OrderRequest): OrderPreview {
  const def = CATALOG_MAP[req.assetId];
  const a = w.asset(req.assetId);
  const acc = accountOf(p, w);
  const diff = DIFFICULTY[w.s.difficulty];
  const bad = (error: string): OrderPreview => ({ ok: false, error, price: a.price, size: req.size, notional: 0, margin: 0, fee: 0, slippagePct: 0, riskPct: null, riskUSD: null, warnings: [], spreadPct: a.spread * 100, liqPrice: 0 });
  if (!def || a.status === 'PRE_IPO') return bad('This asset is not trading yet.');
  if (a.status === 'DELISTED') return bad('This asset was delisted.');
  if (!(req.size > 0)) return bad('Enter a position size.');
  if (req.size < def.minSize - 1e-9) return bad(`Minimum size is ${def.minSize} ${def.unit}.`);
  const lev = req.leverage;
  if (lev > maxLeverageFor(def, p)) return bad(`Max leverage for ${def.name} is ${maxLeverageFor(def, p)}x (50x unlocks at reputation 40).`);
  const isBuy = req.side === 'BUY';
  let price: number, slipRel = 0;
  if (req.type === 'MARKET') {
    if (!a.open) return bad('Market is closed. Use a pending order to trade the open.');
    const f = fillEstimate(w, def, a, req.side, req.size);
    price = f.avg; slipRel = f.slipRel;
  } else {
    if (req.price === undefined || !(req.price > 0)) return bad('Enter the trigger price.');
    price = req.price;
    const q = quoteOf(a);
    if (req.type === 'LIMIT' && ((isBuy && price >= q.ask) || (!isBuy && price <= q.bid))) return bad(isBuy ? 'Buy limit must be below the current ask.' : 'Sell limit must be above the current bid.');
    if (req.type === 'STOP' && ((isBuy && price <= q.ask) || (!isBuy && price >= q.bid))) return bad(isBuy ? 'Buy stop must be above the current ask.' : 'Sell stop must be below the current bid.');
  }
  const side = isBuy ? 'LONG' : 'SHORT';
  if (req.sl !== undefined && ((side === 'LONG' && req.sl >= price) || (side === 'SHORT' && req.sl <= price))) return bad('Stop loss is on the wrong side of the entry price.');
  if (req.tp !== undefined && ((side === 'LONG' && req.tp <= price) || (side === 'SHORT' && req.tp >= price))) return bad('Take profit is on the wrong side of the entry price.');
  const notional = notionalUSD(def, req.size, price);
  const margin = notional / lev;
  const fee = notional * def.feePct;
  if (p.positions.length >= 40) return bad('Too many open positions (max 40).');
  if (margin + fee > acc.freeMargin + 1e-6) return bad(`Not enough free margin. Need $${(margin + fee).toFixed(2)}, have $${Math.max(0, acc.freeMargin).toFixed(2)}.`);
  let riskUSD: number | null = null, riskPct: number | null = null;
  if (req.sl !== undefined) {
    riskUSD = Math.abs(pnlUSD(def, side, req.size, price, req.sl)) + fee * 2;
    riskPct = acc.equity > 0 ? (riskUSD / acc.equity) * 100 : null;
  }
  const warnings: OrderPreview['warnings'] = [];
  if (lev >= 20) warnings.push({ code: 'LEV', title: 'Very high leverage', msg: `${lev}x magnifies profit and loss. A ${(100 / lev).toFixed(1)}% move against you wipes out this margin.`, severity: 'danger' });
  else if (lev >= 10) warnings.push({ code: 'LEV', title: 'High leverage', msg: `${lev}x leverage raises liquidation risk.`, severity: 'warn' });
  if (req.sl === undefined) warnings.push({ code: 'NOSL', title: 'No stop loss', msg: 'Without a stop loss, your risk is undefined.', severity: 'warn' });
  if (riskPct !== null && riskPct > 3) warnings.push({ code: 'RISK', title: 'Risk above 3% of equity', msg: `This trade risks ${riskPct.toFixed(1)}% of your account if the stop is hit.`, severity: riskPct > 6 ? 'danger' : 'warn' });
  const newUsed = acc.usedMargin + margin;
  if (acc.equity > 0 && newUsed / acc.equity > 0.6) warnings.push({ code: 'EXPO', title: 'Heavy exposure', msg: `Margin used would be ${((newUsed / acc.equity) * 100).toFixed(0)}% of equity.`, severity: 'warn' });
  const st = w.s.market.eventStress[def.id] ?? 0;
  if (st > 0.25) warnings.push({ code: 'NEWS', title: 'Major event imminent', msg: 'Spreads are wide and volatility is elevated around a scheduled release.', severity: 'warn' });
  if (a.spread > def.baseSpread * 3) warnings.push({ code: 'SPREAD', title: 'Wide spread', msg: `Spread is ${(a.spread / def.baseSpread).toFixed(1)}x normal. Entry cost is elevated.`, severity: 'warn' });
  if (slipRel > 0.0015) warnings.push({ code: 'SLIP', title: 'Slippage expected', msg: `Estimated slippage ${(slipRel * 100).toFixed(2)}% because liquidity is thin for this size.`, severity: 'warn' });
  const rec = p.trades[p.trades.length - 1];
  if (rec && rec.pnl < 0 && w.t - rec.closeT < 1800 && notional > rec.notional * 1.5) warnings.push({ code: 'REVENGE', title: 'Possible revenge trade', msg: 'You are sizing up right after a loss. Take a breath and stick to your plan.', severity: 'warn' });
  const recentOpens = p.trades.filter((t) => w.t - t.openT < 6 * 3600).length + p.positions.filter((x) => w.t - x.openT < 6 * 3600).length;
  const lossStreak = (() => { let n = 0; for (let i = p.trades.length - 1; i >= 0 && p.trades[i].pnl < 0; i--) n++; return n; })();
  if (recentOpens >= 6 && lossStreak >= 2) warnings.push({ code: 'OVERTRADE', title: 'Possible overtrading', msg: 'Your recent trading frequency has increased significantly after consecutive losses.', severity: 'warn' });
  void diff;
  return { ok: true, price, size: req.size, notional, margin, fee, slippagePct: slipRel * 100, riskPct, riskUSD, warnings, spreadPct: a.spread * 100, liqPrice: liqPriceOf({ side, entry: price, leverage: lev }, diff.stopOut) };
}

// ------------------------------------------------------------------------------------------------
// Execution
// ------------------------------------------------------------------------------------------------
export interface ExecResult { ok: boolean; error?: string; position?: Position; order?: PendingOrder }

function openPositionAt(p: PlayerState, w: World, req: OrderRequest, price: number, slipPct: number, notify: Notify, triggered = false): Position {
  const def = CATALOG_MAP[req.assetId];
  const side = req.side === 'BUY' ? 'LONG' : 'SHORT';
  const notional = notionalUSD(def, req.size, price);
  const margin = notional / req.leverage;
  const fee = notional * def.feePct;
  const acc = accountOf(p, w);
  let riskPct = 0;
  if (req.sl !== undefined) riskPct = acc.equity > 0 ? ((Math.abs(pnlUSD(def, side, req.size, price, req.sl)) + fee * 2) / acc.equity) * 100 : 0;
  const jid = uid(p, 'J');
  const pos: Position = {
    id: uid(p, 'P'), assetId: req.assetId, side, size: req.size, entry: price, leverage: req.leverage, margin, notional, sl: req.sl, tp: req.tp, openT: w.t, swap: 0, fees: fee,
    journalId: jid, reason: req.reason ?? '', slippage: slipPct, riskPct, condition: marketCondition(w, req.assetId),
  };
  p.balance -= fee;
  p.positions.push(pos);
  const entry: JournalEntry = { id: jid, positionId: pos.id, assetId: pos.assetId, side, entry: price, reason: pos.reason, condition: pos.condition, note: '', lesson: '', result: 'OPEN', openT: w.t };
  p.journal.push(entry);
  // counters
  const c = p.counters;
  c.opened++;
  c.leverageMax = Math.max(c.leverageMax, req.leverage);
  c.largestTrade = Math.max(c.largestTrade, notional);
  if (!c.classesTraded.includes(def.cls)) c.classesTraded.push(def.cls);
  const recentNews = w.s.news.some((n) => n.severity >= 3 && w.t - n.t < 900 && n.affected.some((x) => x.assetId === req.assetId));
  if (recentNews || (w.s.market.eventStress[req.assetId] ?? 0) > 0.2) c.newsTrades++;
  if (req.sl !== undefined) c.slTrades++;
  applyPsychOpen(p, w, pos);
  notify({ kind: 'info', title: `${triggered ? 'Order triggered: ' : ''}${side === 'LONG' ? 'BUY' : 'SELL'} ${def.name}`, msg: `${fmtSize(def, pos.size)} @ ${fmtPx(def, price)} with ${pos.leverage}x leverage`, sound: side === 'LONG' ? 'buy' : 'sell' });
  return pos;
}

export function fmtPx(def: AssetDef, v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: def.decimals, maximumFractionDigits: def.decimals });
}
export function fmtSize(def: AssetDef, s: number): string { return `${s} ${def.unit}${def.cls === 'forex' && s !== 1 ? 's' : ''}`; }

export function submitOrder(p: PlayerState, w: World, req: OrderRequest, notify: Notify): ExecResult {
  const pv = previewOrder(p, w, req);
  if (!pv.ok) return { ok: false, error: pv.error };
  const def = CATALOG_MAP[req.assetId];
  if (req.type === 'MARKET') {
    const price = roundPrice(def, pv.price);
    const pos = openPositionAt(p, w, req, price, pv.slippagePct, notify);
    if (req.assetId.startsWith('BTC') || true) { /* market impact: large orders push price on thin books */
      const a = w.asset(req.assetId);
      const impact = Math.min(0.6, (pv.notional / Math.max(1, def.depthUSD * Math.max(0.1, a.liquidityNow))) * 0.5);
      a.supplyDemand = Math.max(-1.5, Math.min(1.5, a.supplyDemand + (req.side === 'BUY' ? impact : -impact)));
    }
    return { ok: true, position: pos };
  }
  const order: PendingOrder = { id: uid(p, 'O'), assetId: req.assetId, type: req.type, side: req.side, size: req.size, price: req.price!, leverage: req.leverage, sl: req.sl, tp: req.tp, createdT: w.t, reason: req.reason ?? '' };
  p.orders.push(order);
  notify({ kind: 'info', title: `${req.type} order placed`, msg: `${req.side} ${fmtSize(def, req.size)} ${def.name} @ ${fmtPx(def, req.price!)}` });
  return { ok: true, order };
}

export function cancelOrder(p: PlayerState, id: string): void { p.orders = p.orders.filter((o) => o.id !== id); }

export function modifyPosition(p: PlayerState, w: World, id: string, sl: number | undefined, tp: number | undefined): string | null {
  const pos = p.positions.find((x) => x.id === id);
  if (!pos) return 'Position not found';
  const a = w.asset(pos.assetId);
  const px = exitPrice(pos, a);
  if (sl !== undefined && ((pos.side === 'LONG' && sl >= px) || (pos.side === 'SHORT' && sl <= px))) return 'Stop loss is on the wrong side of the current price';
  if (tp !== undefined && ((pos.side === 'LONG' && tp <= px) || (pos.side === 'SHORT' && tp >= px))) return 'Take profit is on the wrong side of the current price';
  // moving a stop further away from price is a discipline hit
  if (pos.sl !== undefined && sl !== undefined && ((pos.side === 'LONG' && sl < pos.sl) || (pos.side === 'SHORT' && sl > pos.sl))) { p.discipline = clamp(p.discipline - 2.5, 0, 100); flag(p, w, 'SL_WIDEN', 'You moved your stop loss further from price. Stops are meant to be respected.'); }
  if (pos.sl !== undefined && sl === undefined) { p.discipline = clamp(p.discipline - 3, 0, 100); flag(p, w, 'SL_REMOVED', 'Removing a stop loss leaves your risk undefined.'); }
  if (pos.sl === undefined && sl !== undefined) { p.discipline = clamp(p.discipline + 1, 0, 100); p.counters.slTrades++; }
  pos.sl = sl; pos.tp = tp;
  return null;
}

export function closePosition(p: PlayerState, w: World, id: string, reason: CloseReason, notify: Notify, forcedPrice?: number): ClosedTrade | null {
  const idx = p.positions.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  const pos = p.positions[idx];
  const def = CATALOG_MAP[pos.assetId];
  const a = w.asset(pos.assetId);
  let px = forcedPrice ?? exitPrice(pos, a);
  if (reason === 'MANUAL' && forcedPrice === undefined) {
    // closing is a market order too: apply slippage for big sizes
    const f = fillEstimate(w, def, a, pos.side === 'LONG' ? 'SELL' : 'BUY', pos.size);
    px = f.avg;
  }
  px = roundPrice(def, px);
  const gross = pnlUSD(def, pos.side, pos.size, pos.entry, px);
  const closeFee = notionalUSD(def, pos.size, px) * def.feePct;
  const net = gross - closeFee + pos.swap;
  p.balance += gross - closeFee + pos.swap;
  p.positions.splice(idx, 1);
  p.realized += net - 0;   // fees at open already deducted from balance; include for reporting below
  const totalFees = pos.fees + closeFee;
  const trade: ClosedTrade = {
    id: uid(p, 'T'), assetId: pos.assetId, side: pos.side, size: pos.size, entry: pos.entry, exit: px, pnl: net - pos.fees, fees: totalFees, openT: pos.openT, closeT: w.t,
    leverage: pos.leverage, notional: pos.notional, closeReason: reason, slSet: pos.sl !== undefined, condition: pos.condition, reason: pos.reason, journalId: pos.journalId, cls: def.cls, riskPct: pos.riskPct,
  };
  p.realized -= pos.fees;
  p.trades.push(trade);
  if (p.trades.length > 2000) p.trades.shift();
  // journal
  const j = p.journal.find((x) => x.id === pos.journalId);
  if (j) {
    j.exit = px; j.pnl = trade.pnl; j.closeT = w.t; j.durationSec = w.t - pos.openT; j.result = trade.pnl > 0.005 ? 'PROFIT' : trade.pnl < -0.005 ? 'LOSS' : 'BREAKEVEN';
    j.auto = autoLesson(trade, pos);
  }
  // counters, xp, reputation
  const c = p.counters;
  c.closed++;
  if (trade.pnl > 0) { c.wins++; if (reason === 'TP') c.tpWins++; if (pos.side === 'SHORT') c.shortWins++; } else c.losses++;
  c.bestTrade = Math.max(c.bestTrade, trade.pnl); c.worstTrade = Math.min(c.worstTrade, trade.pnl);
  const regime = w.s.market.regimes.GLOBAL.current;
  if (trade.pnl > 0 && (regime === 'PANIC' || regime === 'BEAR') && pos.side === 'SHORT') c.crashProfits++;
  if (trade.pnl > 0 && regime === 'PANIC') c.crashProfits += 0;
  if (trade.pnl > 0 && regime === 'PANIC' && pos.side === 'LONG') c.crashProfits += 0;
  if (pos.assetId && trade.pnl > 0) { if (regime === 'BEAR' || regime === 'PANIC') c.bearProfit++; else c.bullProfit++; }
  const xpGain = Math.round(8 + (trade.pnl > 0 ? 12 : 3) + (pos.sl !== undefined ? 6 : 0) + Math.min(25, Math.abs(trade.pnl) / 40));
  p.xp += xpGain;
  applyPsychClose(p, w, trade);
  if (reason === 'LIQUIDATION') { c.liquidations++; p.reputation = clamp(p.reputation - 4, 0, 100); }
  else if (trade.pnl > 0 && pos.sl !== undefined) p.reputation = clamp(p.reputation + 0.6, 0, 100);
  else if (trade.pnl < 0 && pos.sl === undefined) p.reputation = clamp(p.reputation - 0.3, 0, 100);
  const label = { MANUAL: 'Closed', SL: 'Stop loss hit', TP: 'Take profit hit', LIQUIDATION: 'LIQUIDATED', DELISTED: 'Delisted' }[reason];
  notify({
    kind: reason === 'LIQUIDATION' ? 'margin' : trade.pnl >= 0 ? 'good' : 'bad', title: `${label}: ${def.name}`,
    msg: `${trade.pnl >= 0 ? '+' : '-'}$${Math.abs(trade.pnl).toFixed(2)} (${pos.side} ${fmtSize(def, pos.size)}, ${fmtPx(def, pos.entry)} to ${fmtPx(def, px)})`, sound: reason === 'LIQUIDATION' ? 'margin' : trade.pnl >= 0 ? 'profit' : 'loss',
  });
  return trade;
}

function autoLesson(t: ClosedTrade, pos: Position): string {
  if (t.closeReason === 'LIQUIDATION') return 'Liquidated: leverage and size left no room for normal volatility.';
  if (t.closeReason === 'SL') return t.pnl < 0 ? 'Stop loss worked as designed: the loss was capped before it grew.' : 'Trailing stop protected profit.';
  if (t.closeReason === 'TP') return 'Plan executed: the target was reached.';
  if (t.pnl < 0 && !t.slSet) return 'No stop loss was set. Loss size was decided by the market, not by you.';
  if (t.pnl > 0 && t.riskPct > 0 && t.riskPct <= 2) return 'Small defined risk with a positive result. Repeatable process.';
  if (t.pnl < 0 && t.leverage >= 10) return 'High leverage made a normal pullback expensive.';
  void pos;
  return t.pnl >= 0 ? 'Profitable exit. Review whether the exit followed your plan.' : 'Loss taken. Compare the entry reason with what the market actually did.';
}

// ------------------------------------------------------------------------------------------------
// Per-tick processing: pending orders, SL/TP, margin call, liquidation
// ------------------------------------------------------------------------------------------------
export function processTick(p: PlayerState, w: World, notify: Notify): void {
  const diff = DIFFICULTY[w.s.difficulty];
  // delisted assets: forced close at near-zero
  for (const pos of [...p.positions]) {
    const a = w.asset(pos.assetId);
    if (a.status === 'DELISTED') closePosition(p, w, pos.id, 'DELISTED', notify, a.price);
  }
  // pending orders
  if (p.orders.length) {
    for (const o of [...p.orders]) {
      const a = w.asset(o.assetId);
      if (!a.open || a.status !== 'ACTIVE') continue;
      const q = quoteOf(a);
      let fill: number | null = null;
      if (o.type === 'LIMIT') { if (o.side === 'BUY' && q.ask <= o.price) fill = o.price; if (o.side === 'SELL' && q.bid >= o.price) fill = o.price; }
      else { if (o.side === 'BUY' && q.ask >= o.price) fill = q.ask; if (o.side === 'SELL' && q.bid <= o.price) fill = q.bid; }
      if (fill === null) continue;
      p.orders = p.orders.filter((x) => x.id !== o.id);
      const req: OrderRequest = { assetId: o.assetId, side: o.side, type: 'MARKET', size: o.size, leverage: o.leverage, sl: o.sl, tp: o.tp, reason: o.reason };
      const acc = accountOf(p, w);
      const def = CATALOG_MAP[o.assetId];
      const margin = notionalUSD(def, o.size, fill) / o.leverage;
      if (margin > acc.freeMargin) { notify({ kind: 'warn', title: 'Order cancelled', msg: `Not enough free margin to trigger ${o.type} ${o.side} ${def.name}.` }); continue; }
      // a stop order fills like a market order; sl/tp validity re-checked
      const valid = (o.sl === undefined || (o.side === 'BUY' ? o.sl < fill : o.sl > fill)) && (o.tp === undefined || (o.side === 'BUY' ? o.tp > fill : o.tp < fill));
      openPositionAt(p, w, { ...req, sl: valid ? o.sl : undefined, tp: valid ? o.tp : undefined }, roundPrice(def, fill), 0, notify, true);
    }
  }
  // SL / TP
  for (const pos of [...p.positions]) {
    const a = w.asset(pos.assetId);
    if (!a.open || a.status !== 'ACTIVE') continue;
    const q = quoteOf(a);
    if (pos.side === 'LONG') {
      if (pos.sl !== undefined && q.bid <= pos.sl) { closePosition(p, w, pos.id, 'SL', notify, q.bid); continue; }
      if (pos.tp !== undefined && q.bid >= pos.tp) { closePosition(p, w, pos.id, 'TP', notify, q.bid - pos.tp < pos.tp * 0.0015 ? pos.tp : q.bid); continue; }
    } else {
      if (pos.sl !== undefined && q.ask >= pos.sl) { closePosition(p, w, pos.id, 'SL', notify, q.ask); continue; }
      if (pos.tp !== undefined && q.ask <= pos.tp) { closePosition(p, w, pos.id, 'TP', notify, pos.tp - q.ask < pos.tp * 0.0015 ? pos.tp : q.ask); continue; }
    }
  }
  // margin
  if (!p.positions.length) { p.marginState = 'OK'; return; }
  let acc = accountOf(p, w);
  if (acc.marginLevel < diff.marginCall && p.marginState === 'OK') {
    p.marginState = 'CALL';
    p.counters.marginCalls++; p.lastMarginCallDay = dayIndexOf(w.t);
    p.reputation = clamp(p.reputation - 1.5, 0, 100);
    p.counters.noMarginCallDays = 0;
    notify({ kind: 'margin', title: 'MARGIN CALL', msg: `Margin level ${acc.marginLevel.toFixed(0)}%. Deposit funds, reduce risk, or close positions before liquidation at ${diff.stopOut}%.`, sound: 'margin' });
  } else if (p.marginState === 'CALL' && acc.marginLevel > diff.marginCall * 1.35) p.marginState = 'OK';
  if (acc.marginLevel < diff.stopOut) {
    notify({ kind: 'margin', title: 'LIQUIDATION', msg: 'Equity fell below the stop-out level. Positions are being force-closed.', sound: 'margin' });
    let guard = 0;
    while (p.positions.length && acc.marginLevel < diff.marginCall && guard++ < 50) {
      let worst: Position | null = null, worstPnl = Infinity;
      for (const pos of p.positions) { const pl = positionPnl(pos, w.asset(pos.assetId)); if (pl < worstPnl) { worstPnl = pl; worst = pos; } }
      if (!worst) break;
      const t = closePosition(p, w, worst.id, 'LIQUIDATION', notify);
      if (t) { const fee = t.notional * 0.003; p.balance -= fee; }
      acc = accountOf(p, w);
    }
    if (p.balance < 0) {
      const deficit = -p.balance;
      p.balance = 0;
      const day = dayIndexOf(w.t);
      p.loans.push({ id: uid(p, 'L'), principal: deficit, rate: 0.1, repay: deficit * 1.1, remaining: deficit * 1.1, takenDay: day, dueDay: day + 7, termDays: 7, status: 'ACTIVE', lateDays: 0, restructured: false, label: 'Margin deficit' });
      p.credit = clamp(p.credit - 40, 300, 850);
      p.counters.everDebt = true;
      notify({ kind: 'bad', title: 'Negative balance covered by the bank', msg: `Losses exceeded your account by $${deficit.toFixed(2)}. It has become a 7-day loan at 10%. Credit score -40.` });
    }
    p.marginState = 'OK';
  }
}

// ------------------------------------------------------------------------------------------------
// Psychology
// ------------------------------------------------------------------------------------------------
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function flag(p: PlayerState, w: World, code: string, msg: string): void {
  p.psychFlags.push({ code, msg, t: w.t });
  if (p.psychFlags.length > 40) p.psychFlags.shift();
}

function applyPsychOpen(p: PlayerState, w: World, pos: Position): void {
  const prev = p.trades[p.trades.length - 1];
  const acc = accountOf(p, w);
  p.discipline = clamp(p.discipline + (pos.sl !== undefined ? 0.9 : -1.6), 0, 100);
  p.riskControl = clamp(p.riskControl + (pos.leverage <= 5 ? 0.7 : pos.leverage >= 20 ? -4 : pos.leverage >= 10 ? -1.5 : 0) + (pos.riskPct > 0 && pos.riskPct <= 2 ? 1 : pos.riskPct > 5 ? -3 : 0), 0, 100);
  if (acc.equity > 0 && acc.usedMargin / acc.equity > 0.7) p.riskControl = clamp(p.riskControl - 2, 0, 100);
  if (prev && prev.pnl < 0 && w.t - prev.closeT < 1800 && pos.notional > prev.notional * 1.5) {
    p.discipline = clamp(p.discipline - 6, 0, 100); p.patience = clamp(p.patience - 4, 0, 100); p.counters.revengeFlags++;
    flag(p, w, 'REVENGE', 'Revenge trade: you sized up within minutes of a loss.');
  }
  const opens = p.trades.filter((t) => w.t - t.openT < 6 * 3600).length + p.positions.filter((x) => w.t - x.openT < 6 * 3600).length;
  let streak = 0; for (let i = p.trades.length - 1; i >= 0 && p.trades[i].pnl < 0; i--) streak++;
  if (opens >= 6 && streak >= 2) { p.patience = clamp(p.patience - 5, 0, 100); p.counters.overtradeFlags++; flag(p, w, 'OVERTRADE', 'Your recent trading frequency has increased significantly after consecutive losses.'); }
}

function applyPsychClose(p: PlayerState, w: World, t: ClosedTrade): void {
  const hold = t.closeT - t.openT;
  if (hold > 3600) p.patience = clamp(p.patience + 0.5, 0, 100);
  if (hold < 300 && t.pnl < 0 && t.closeReason === 'MANUAL') p.patience = clamp(p.patience - 1.5, 0, 100);
  if (t.closeReason === 'SL' || t.closeReason === 'TP') p.discipline = clamp(p.discipline + 0.7, 0, 100);
  if (t.closeReason === 'MANUAL' && t.pnl < 0 && t.slSet && t.riskPct > 0 && Math.abs(t.pnl) > 0) { /* closed manually before stop: fine */ }
  void w;
}

export function psychSummary(p: PlayerState): { discipline: number; patience: number; riskControl: number; advice: string } {
  const worst = Math.min(p.discipline, p.patience, p.riskControl);
  const advice = worst === p.discipline && p.discipline < 50 ? 'Use a stop loss on every trade and avoid moving it away.' : worst === p.patience && p.patience < 50 ? 'Slow down. Fewer, better trades beat frequent reactions.' : worst === p.riskControl && p.riskControl < 50 ? 'Reduce leverage and keep risk per trade under 2% of equity.' : 'Process is healthy. Stay consistent.';
  return { discipline: p.discipline, patience: p.patience, riskControl: p.riskControl, advice };
}

// ------------------------------------------------------------------------------------------------
// Daily rollover: swaps, dividends, equity history
// ------------------------------------------------------------------------------------------------
export function rolloverPositions(p: PlayerState, w: World): void {
  const eco = w.s.eco;
  for (const pos of p.positions) {
    const def = CATALOG_MAP[pos.assetId];
    const a = w.asset(pos.assetId);
    let swap = 0;
    if (def.cls === 'forex') {
      const rb = eco.rates[def.base!] ?? 0, rq = eco.rates[def.quote!] ?? 0;
      const diff = pos.side === 'LONG' ? rb - rq : rq - rb;
      swap = (pos.notional * (diff - 0.5)) / 100 / 365;
    } else {
      const borrowed = pos.notional * (1 - 1 / pos.leverage);
      const fin = pos.side === 'LONG' ? borrowed * ((eco.rates.USD + 2.5) / 100) / 365 : 0;
      swap = -fin;
      if (def.cls === 'stock' && w.s.companies[def.id]) {
        const dy = w.s.companies[def.id].dividendYield;
        swap += (pos.side === 'LONG' ? 1 : -1) * pos.notional * dy / 365;
      }
      void a;
    }
    pos.swap += swap; p.balance += swap;
  }
}

export function fmtMoney(n: number, dec = 2): string {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (n < 0 ? '-$' : '$') + s;
}
export { secOfDay };
