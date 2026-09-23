// One full game-year per seed at coarse dt: counts the rare, career-shaping events.
import { World } from '../src/engine/world';
import { DAY } from '../src/engine/time';
for (const seed of [101, 202, 303, 404]) {
  const w = World.create(seed, (process.argv[2] as 'NORMAL') ?? 'NORMAL'); w.warmupSync();
  const c = { crash: 0, event: 0, bankrupt: 0, delist: 0, warn: 0, ipo: 0 };
  w.listeners = { onCrash: () => c.crash++, onEvent: () => c.event++, onDelist: () => c.delist++, onIpo: () => c.ipo++, onCompanyAlert: (_x, k) => { if (k === 'WARNING') c.warn++; if (k === 'BANKRUPT') c.bankrupt++; } };
  let bubbles = 0, prev = false; const t0 = w.t; let nan = 0, minIdx = 1e9, maxIdx = 0; const idx0 = w.asset('CLINT100').price;
  while (w.t - t0 < 365 * DAY) {
    w.step(60);
    const b = !!w.s.eco.bubble?.active; if (b && !prev) bubbles++; prev = b;
    const p = w.asset('CLINT100').price; if (!isFinite(p)) nan++; minIdx = Math.min(minIdx, p / idx0); maxIdx = Math.max(maxIdx, p / idx0);
  }
  const unresolved = w.s.news.filter((n) => n.affected.length && !n.resolved).length;
  console.log(`seed ${seed}:`, JSON.stringify(c), 'bubbles', bubbles, '| CLINT100 range', minIdx.toFixed(2), '-', maxIdx.toFixed(2), 'end', (w.asset('CLINT100').price / idx0).toFixed(2), '| BTC', (w.asset('BTC/USD').price / 104231.2).toFixed(2), '| nan', nan, '| stuck-unresolved news', unresolved);
}
