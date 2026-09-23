// Headless soak test of the whole living world. Run: npm run simtest
import { World, LIVE_DT } from '../src/engine/world';
import { CATALOG } from '../src/engine/catalog';
import { DAY, dayLabel, dayIndexOf } from '../src/engine/time';

const seed = Number(process.argv[2] ?? 739241);
const days = Number(process.argv[3] ?? 60);
const t0 = performance.now();
const w = World.create(seed, 'NORMAL');
w.warmupSync();
console.log(`warm-up: ${Math.round(performance.now() - t0)} ms  t=${dayLabel(w.day)}`);
const chk = ['BTC/USD', 'EUR/USD', 'GOLD/USD', 'NEXA', 'CLINT100'];
for (const id of chk) console.log(id.padEnd(10), w.asset(id).price.toFixed(4), 'candles 1m/1H/1D/1W:', w.asset(id).candles['1m'].length, w.asset(id).candles['1H'].length, w.asset(id).candles['1D'].length, w.asset(id).candles['1W'].length);
console.log('news at start:', w.s.news.length, '| upcoming:', w.upcoming(3).map((e) => `${e.name}@D${e.day + 1}`).join(', '));

let crashes = 0, events = 0, earn = 0, delist = 0, ipos = 0, nan = 0;
w.listeners = { onCrash: () => crashes++, onEvent: () => events++, onEarnings: () => earn++, onDelist: () => delist++, onIpo: () => ipos++ };
const t1 = performance.now();
const start = w.t;
let maxDD: Record<string, number> = {}, peak: Record<string, number> = {};
while (w.t - start < days * DAY) {
  w.step(LIVE_DT);
  if (Math.floor((w.t - start) / 600) !== Math.floor((w.t - start - LIVE_DT) / 600)) {
    for (const d of CATALOG) {
      const p = w.asset(d.id).price;
      if (!isFinite(p) || p <= 0) { nan++; continue; }
      peak[d.id] = Math.max(peak[d.id] ?? p, p);
      maxDD[d.id] = Math.min(maxDD[d.id] ?? 0, p / peak[d.id] - 1);
    }
  }
}
const ms = performance.now() - t1;
console.log(`\nsimulated ${days} days in ${Math.round(ms)} ms (${(ms / days).toFixed(0)} ms/day)  -> at 50x a game-day is ~29 s real, sim cost fine`);
console.log({ crashes, events, earnings: earn, delistings: delist, ipos, badPrices: nan, news: w.s.news.length, reports: w.s.reports.length });
console.log('global regime:', w.s.market.regimes.GLOBAL.current, '| sentiment', w.s.eco.sentiment.toFixed(2), '| USD rate', w.s.eco.rates.USD, 'infl', w.s.eco.inflation.USD);
const rows = ['BTC/USD', 'EUR/USD', 'GOLD/USD', 'OIL/USD', 'NEXA', 'NOVM', 'CLINT100', 'FLUX/USD'].map((id) => ({ id, price: +w.asset(id).price.toFixed(3), maxDrawdownPct: +(maxDD[id] * 100).toFixed(1) }));
console.table(rows);
const big = w.s.news.filter((n) => n.severity >= 4).slice(-6);
for (const n of big) console.log(`D${n.day + 1} [${n.reliability}] sev${n.severity} ${n.headline}\n     ` + n.affected.slice(0, 4).map((a) => `${a.assetId} exp ${a.expected}% act ${a.actual ?? '?'}%`).join(' | '));
const er = Object.values(w.s.companies).filter((c) => c.lastReport).slice(0, 4);
for (const c of er) console.log(c.name, 'EPS', c.lastReport!.epsActual, 'vs', c.lastReport!.epsExpected, 'reaction', c.lastReport!.reaction + '%', '|', c.lastReport!.note);
const status = Object.values(w.s.companies).filter((c) => c.status !== 'ACTIVE').map((c) => `${c.id}:${c.status}(h${c.health.toFixed(0)})`);
console.log('non-active companies:', status.join(' '));
