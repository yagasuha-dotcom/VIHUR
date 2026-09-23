import type { Candle } from '@/types';

export type Series = (number | null)[];

export function sma(vals: number[], n: number): Series {
  const out: Series = new Array(vals.length).fill(null);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= n) sum -= vals[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(vals: number[], n: number): Series {
  const out: Series = new Array(vals.length).fill(null);
  if (vals.length < n) return out;
  const k = 2 / (n + 1);
  let prev = 0;
  for (let i = 0; i < n; i++) prev += vals[i];
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < vals.length; i++) { prev = vals[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}

export function rsi(vals: number[], n = 14): Series {
  const out: Series = new Array(vals.length).fill(null);
  if (vals.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = vals[i] - vals[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    gain = (gain * (n - 1) + Math.max(0, d)) / n;
    loss = (loss * (n - 1) + Math.max(0, -d)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(vals: number[], fast = 12, slow = 26, sig = 9): { macd: Series; signal: Series; hist: Series } {
  const ef = ema(vals, fast), es = ema(vals, slow);
  const m: Series = vals.map((_, i) => (ef[i] !== null && es[i] !== null ? (ef[i] as number) - (es[i] as number) : null));
  const firstIdx = m.findIndex((x) => x !== null);
  const signal: Series = new Array(vals.length).fill(null);
  const hist: Series = new Array(vals.length).fill(null);
  if (firstIdx >= 0) {
    const sub = m.slice(firstIdx).map((x) => x as number);
    const s = ema(sub, sig);
    for (let i = 0; i < s.length; i++) {
      signal[firstIdx + i] = s[i];
      if (s[i] !== null) hist[firstIdx + i] = (m[firstIdx + i] as number) - (s[i] as number);
    }
  }
  return { macd: m, signal, hist };
}

export function bollinger(vals: number[], n = 20, k = 2): { mid: Series; up: Series; lo: Series } {
  const mid = sma(vals, n);
  const up: Series = new Array(vals.length).fill(null);
  const lo: Series = new Array(vals.length).fill(null);
  for (let i = n - 1; i < vals.length; i++) {
    const m = mid[i] as number;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (vals[j] - m) ** 2;
    const sd = Math.sqrt(s / n);
    up[i] = m + k * sd; lo[i] = m - k * sd;
  }
  return { mid, up, lo };
}

export function atr(c: Candle[], n = 14): Series {
  const out: Series = new Array(c.length).fill(null);
  if (c.length <= n) return out;
  const tr = (i: number) => Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
  let a = 0;
  for (let i = 1; i <= n; i++) a += tr(i);
  a /= n;
  out[n] = a;
  for (let i = n + 1; i < c.length; i++) { a = (a * (n - 1) + tr(i)) / n; out[i] = a; }
  return out;
}

/** VWAP anchored to each game day for intraday bars; rolling window for daily+ bars. */
export function vwap(c: Candle[], anchorSeconds: number | null): Series {
  const out: Series = new Array(c.length).fill(null);
  let pv = 0, vv = 0, curAnchor = -1;
  for (let i = 0; i < c.length; i++) {
    const anchor = anchorSeconds ? Math.floor(c[i].t / anchorSeconds) : 0;
    if (anchorSeconds && anchor !== curAnchor) { pv = 0; vv = 0; curAnchor = anchor; }
    const tp = (c[i].h + c[i].l + c[i].c) / 3;
    pv += tp * c[i].v; vv += c[i].v;
    out[i] = vv > 0 ? pv / vv : tp;
  }
  return out;
}

export type PatternName =
  | 'Doji' | 'Hammer' | 'Shooting Star' | 'Bullish Engulfing' | 'Bearish Engulfing' | 'Pin Bar'
  | 'Inside Bar' | 'Breakout' | 'Fake Breakout' | 'Pullback' | 'Reversal' | 'Consolidation';

export interface PatternHit { name: PatternName; bias: 'bull' | 'bear' | 'neutral'; index: number }

/** Emergent pattern detection: patterns are never forced by the engine, only recognised when they appear. */
export function detectPatterns(c: Candle[], lookback = 3): PatternHit[] {
  const hits: PatternHit[] = [];
  const n = c.length;
  if (n < 25) return hits;
  const atrV = atr(c, 14);
  for (let i = Math.max(21, n - lookback); i < n; i++) {
    const k = c[i], p = c[i - 1];
    const range = k.h - k.l;
    if (range <= 0) continue;
    const body = Math.abs(k.c - k.o);
    const upper = k.h - Math.max(k.o, k.c);
    const lower = Math.min(k.o, k.c) - k.l;
    const a = (atrV[i] as number) || range;
    if (body / range < 0.1 && range > a * 0.4) hits.push({ name: 'Doji', bias: 'neutral', index: i });
    if (lower > body * 2 && upper < body * 0.6 + range * 0.08 && range > a * 0.6 && k.c > c[i - 5].c * 0.0 ) {
      const down = c[i - 4].c > k.c * 1.0 && c[i - 1].c < c[i - 4].c;
      if (down) hits.push({ name: 'Hammer', bias: 'bull', index: i });
    }
    if (upper > body * 2 && lower < body * 0.6 + range * 0.08 && range > a * 0.6) {
      const up = c[i - 4].c < k.c && c[i - 1].c > c[i - 4].c;
      if (up) hits.push({ name: 'Shooting Star', bias: 'bear', index: i });
    }
    if (p.c < p.o && k.c > k.o && k.c >= p.o && k.o <= p.c && body > Math.abs(p.c - p.o)) hits.push({ name: 'Bullish Engulfing', bias: 'bull', index: i });
    if (p.c > p.o && k.c < k.o && k.c <= p.o && k.o >= p.c && body > Math.abs(p.c - p.o)) hits.push({ name: 'Bearish Engulfing', bias: 'bear', index: i });
    if ((upper > range * 0.66 || lower > range * 0.66) && body / range < 0.25 && !hits.some((h) => h.index === i)) hits.push({ name: 'Pin Bar', bias: lower > upper ? 'bull' : 'bear', index: i });
    if (k.h < p.h && k.l > p.l) hits.push({ name: 'Inside Bar', bias: 'neutral', index: i });
    // Breakout / fake breakout vs prior 20-bar range
    let hi = -Infinity, lo = Infinity;
    for (let j = i - 20; j < i; j++) { hi = Math.max(hi, c[j].h); lo = Math.min(lo, c[j].l); }
    if (k.c > hi) hits.push({ name: 'Breakout', bias: 'bull', index: i });
    else if (k.c < lo) hits.push({ name: 'Breakout', bias: 'bear', index: i });
    else if (k.h > hi && k.c < hi && k.c < k.o) hits.push({ name: 'Fake Breakout', bias: 'bear', index: i });
    else if (k.l < lo && k.c > lo && k.c > k.o) hits.push({ name: 'Fake Breakout', bias: 'bull', index: i });
    // Consolidation: last 8 bars in narrow range
    let h8 = -Infinity, l8 = Infinity;
    for (let j = i - 7; j <= i; j++) { h8 = Math.max(h8, c[j].h); l8 = Math.min(l8, c[j].l); }
    if (i === n - 1 && (h8 - l8) < a * 3.2) hits.push({ name: 'Consolidation', bias: 'neutral', index: i });
    // Pullback / reversal relative to short trend
    if (i === n - 1) {
      const t10 = c[i - 10].c, t3 = c[i - 3].c;
      if (k.c > t10 && k.c < t3 && t3 > t10) hits.push({ name: 'Pullback', bias: 'bull', index: i });
      if (k.c < t10 && k.c > t3 && t3 < t10) hits.push({ name: 'Pullback', bias: 'bear', index: i });
      if (t10 > c[i - 20].c && k.c < c[i - 3].c && k.c < c[i - 1].c && p.c < c[i - 2].c) hits.push({ name: 'Reversal', bias: 'bear', index: i });
      if (t10 < c[i - 20].c && k.c > c[i - 3].c && k.c > c[i - 1].c && p.c > c[i - 2].c) hits.push({ name: 'Reversal', bias: 'bull', index: i });
    }
  }
  return hits;
}
