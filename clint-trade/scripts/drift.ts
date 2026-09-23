import { World, LIVE_DT } from '../src/engine/world';
import { DAY } from '../src/engine/time';
const ids = ['BTC/USD', 'ETH/USD', 'FLUX/USD', 'NEXA', 'NOVM', 'CLINT100', 'OIL/USD', 'GOLD/USD', 'EUR/USD'];
const days = 45;
const res: Record<string, number[]> = {};
for (const seed of [11, 222, 3333, 44, 555, 6, 77]) {
  const w = World.create(seed, 'NORMAL'); w.warmupSync();
  const p0: Record<string, number> = {}; for (const id of ids) p0[id] = w.asset(id).price;
  const start = w.t;
  while (w.t - start < days * DAY) w.step(300);
  for (const id of ids) (res[id] ??= []).push(+(((w.asset(id).price / p0[id]) - 1) * 100).toFixed(0));
}
console.log(`% change over ${days} days, 3 seeds`); console.table(res);
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
console.log('MEDIAN %:', Object.fromEntries(ids.map((id) => [id, med(res[id])])));
