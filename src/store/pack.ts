import type { Candle, TimeframeId } from '@/types';

// Compact save format: candles become flat number arrays with rounded prices (~45% smaller JSON).
const TFS: TimeframeId[] = ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W'];
const r9 = (x: number) => Number(x.toPrecision(9));

export function packCandles(c: Record<TimeframeId, Candle[]>): Record<string, unknown> {
  const out: Record<string, unknown> = { __packed: 1 };
  for (const tf of TFS) {
    const arr = c[tf] ?? [];
    const flat = new Array<number>(arr.length * 6);
    for (let i = 0; i < arr.length; i++) { const k = arr[i]; flat[i * 6] = k.t; flat[i * 6 + 1] = r9(k.o); flat[i * 6 + 2] = r9(k.h); flat[i * 6 + 3] = r9(k.l); flat[i * 6 + 4] = r9(k.c); flat[i * 6 + 5] = r9(k.v); }
    out[tf] = flat;
  }
  return out;
}
export function unpackCandles(p: Record<string, unknown>): Record<TimeframeId, Candle[]> {
  const out = {} as Record<TimeframeId, Candle[]>;
  for (const tf of TFS) {
    const flat = (p[tf] as number[]) ?? [];
    const arr: Candle[] = [];
    for (let i = 0; i + 5 < flat.length; i += 6) arr.push({ t: flat[i], o: flat[i + 1], h: flat[i + 2], l: flat[i + 3], c: flat[i + 4], v: flat[i + 5] });
    out[tf] = arr;
  }
  return out;
}
export function stringifyPacked(v: unknown): string {
  return JSON.stringify(v, (k, val) => (k === 'candles' && val && typeof val === 'object' && !Array.isArray(val) && !(val as { __packed?: number }).__packed ? packCandles(val as Record<TimeframeId, Candle[]>) : val));
}
export function parsePacked<T>(s: string): T {
  return JSON.parse(s, (k, val) => (k === 'candles' && val && typeof val === 'object' && (val as { __packed?: number }).__packed ? unpackCandles(val as Record<string, unknown>) : val)) as T;
}
