import { hash01 } from './rng';

export interface BookLevel { price: number; size: number }
export interface OrderBook { bids: BookLevel[]; asks: BookLevel[]; depthUnits: number }

/**
 * Synthetic order book. Deterministic given (asset seed, tick bucket) so it can be rendered without touching the world RNG.
 * Depth shrinks when liquidity is low, spreads are wide, or an event is imminent.
 */
export function buildBook(
  mid: number, spreadRel: number, depthUSD: number, liquidityNow: number, seedA: number, seedB: number, levels = 10,
): OrderBook {
  const halfSpread = (mid * spreadRel) / 2;
  const step = Math.max(mid * spreadRel * 0.6, mid * 0.00002);
  const totalUnits = (depthUSD * Math.max(0.05, liquidityNow)) / mid;
  const bids: BookLevel[] = [], asks: BookLevel[] = [];
  let wsum = 0;
  const weights: number[] = [];
  for (let i = 0; i < levels; i++) { const w = 0.5 + i * 0.35; weights.push(w); wsum += w; }
  for (let i = 0; i < levels; i++) {
    const base = (totalUnits * weights[i]) / wsum;
    const nb = 0.6 + hash01(seedA, seedB, i * 2) * 0.8;
    const na = 0.6 + hash01(seedA, seedB, i * 2 + 1) * 0.8;
    bids.push({ price: mid - halfSpread - step * i, size: base * nb });
    asks.push({ price: mid + halfSpread + step * i, size: base * na });
  }
  return { bids, asks, depthUnits: totalUnits };
}

/** Walk the book for a market order. Returns average fill price and slippage vs the touch. */
export function walkBook(book: OrderBook, side: 'BUY' | 'SELL', size: number, stress = 1): { avg: number; slipRel: number; filledDepth: number } {
  const lv = side === 'BUY' ? book.asks : book.bids;
  const touch = lv[0].price;
  let remaining = size, cost = 0;
  for (const l of lv) {
    const take = Math.min(remaining, l.size);
    cost += take * l.price;
    remaining -= take;
    if (remaining <= 1e-12) break;
  }
  if (remaining > 1e-12) {
    // beyond visible depth: price walks away progressively
    const worst = lv[lv.length - 1].price;
    const extra = remaining / Math.max(1e-9, book.depthUnits);
    const px = side === 'BUY' ? worst * (1 + 0.003 * extra * stress) : worst * (1 - 0.003 * extra * stress);
    cost += remaining * px;
  }
  const avg = cost / size;
  const slipRel = Math.abs(avg - touch) / touch;
  return { avg, slipRel, filledDepth: size / Math.max(1e-9, book.depthUnits) };
}
