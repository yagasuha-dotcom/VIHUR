import type { AssetState, Candle, TimeframeId } from '@/types';
import { TIMEFRAMES, TF_CAP, TF_SECONDS, EPOCH } from './time';

export function emptyCandles(): Record<TimeframeId, Candle[]> {
  return { '1m': [], '5m': [], '15m': [], '30m': [], '1H': [], '4H': [], '1D': [], '1W': [] };
}

/**
 * Tick -> price movement -> OHLC aggregation -> candle.
 * `wick` (fraction of price) synthesises intra-tick extremes when the simulation step is coarser than the candle.
 */
export function pushTick(a: AssetState, t: number, price: number, vol: number, wickHi = 0, wickLo = 0): void {
  const hi = wickHi > 0 ? price * (1 + wickHi) : price;
  const lo = wickLo > 0 ? price * (1 - wickLo) : price;
  for (let i = 0; i < TIMEFRAMES.length; i++) {
    const tf = TIMEFRAMES[i];
    const p = TF_SECONDS[tf];
    const bucket = EPOCH + Math.floor((t - EPOCH) / p) * p;
    const arr = a.candles[tf];
    const last = arr.length ? arr[arr.length - 1] : undefined;
    if (!last || last.t < bucket) {
      // first tick of a fresh candle: open = previous close for continuity when market was open
      const o = last && bucket - last.t <= p * 1.01 ? last.c : price;
      arr.push({ t: bucket, o, h: Math.max(o, hi), l: Math.min(o, lo), c: price, v: vol });
      const cap = TF_CAP[tf];
      if (arr.length > cap + 40) arr.splice(0, arr.length - cap);
    } else {
      if (hi > last.h) last.h = hi;
      if (lo < last.l) last.l = lo;
      last.c = price;
      last.v += vol;
    }
  }
}

/** Gap-aware variant: first tick after a closed market opens the candle at the new price (visible gap). */
export function pushGapTick(a: AssetState, t: number, price: number, vol: number): void {
  for (let i = 0; i < TIMEFRAMES.length; i++) {
    const tf = TIMEFRAMES[i];
    const p = TF_SECONDS[tf];
    const bucket = EPOCH + Math.floor((t - EPOCH) / p) * p;
    const arr = a.candles[tf];
    const last = arr.length ? arr[arr.length - 1] : undefined;
    if (!last || last.t < bucket) {
      arr.push({ t: bucket, o: price, h: price, l: price, c: price, v: vol });
      const cap = TF_CAP[tf];
      if (arr.length > cap + 40) arr.splice(0, arr.length - cap);
    } else {
      if (price > last.h) last.h = price;
      if (price < last.l) last.l = price;
      last.c = price;
      last.v += vol;
    }
  }
}

export function rescaleCandles(a: AssetState, k: number): void {
  for (const tf of TIMEFRAMES) {
    for (const c of a.candles[tf]) { c.o *= k; c.h *= k; c.l *= k; c.c *= k; }
  }
}

export function lastCandle(a: AssetState, tf: TimeframeId): Candle | undefined {
  const arr = a.candles[tf];
  return arr[arr.length - 1];
}
