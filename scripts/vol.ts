import { Rng } from '../src/engine/rng';
import { createMarket, stepMarket } from '../src/engine/marketEngine';
import { DIFFICULTY } from '../src/engine/difficulty';
import { CATALOG } from '../src/engine/catalog';
import { marketHours, tOf, DAY } from '../src/engine/time';

const ids = ['EUR/USD', 'BTC/USD', 'DOGE/USD', 'FLUX/USD', 'NEXA', 'SYNP', 'GOLD/USD', 'OIL/USD', 'CLINT100', 'T10Y'];
const acc: Record<string, number[]> = {};
for (const seed of [1, 2, 3, 4]) {
  const rng = new Rng(seed); const diff = DIFFICULTY.NORMAL; const m = createMarket(rng, diff, -60);
  let t = tOf(-60); const dt = 60; const last: Record<string, number> = {};
  for (let i = 0; i < 60 * DAY / dt; i++) {
    t += dt; stepMarket(m, { t, dt, rng, diff, mh: marketHours(t), sentiment: 0, warm: true });
    if (i % (DAY / dt) === 0) {
      for (const id of ids) { const p = m.assets[id].price; if (last[id]) (acc[id] ??= []).push(Math.log(p / last[id])); last[id] = p; }
    }
  }
}
for (const id of ids) {
  const r = acc[id]; const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1));
  const kurt = r.reduce((a, b) => a + ((b - mean) / sd) ** 4, 0) / r.length;
  const d = CATALOG.find((x) => x.id === id)!;
  console.log(id.padEnd(10), 'target', (d.dailyVol * 100).toFixed(2), 'realised', (sd * 100).toFixed(2), 'ratio', (sd / d.dailyVol).toFixed(2), 'kurt', kurt.toFixed(1), 'n', r.length);
}
