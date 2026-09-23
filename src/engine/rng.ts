// Deterministic seeded RNG (mulberry32) with serialisable state.
export interface RngState { s: number; spare: number | null }

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return h >>> 0;
}

/** Stateless hash noise in [0,1): used by UI (order book) so rendering never consumes the world RNG. */
export function hash01(a: number, b: number = 0, c: number = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Rng {
  s: number;
  spare: number | null = null;
  constructor(seed: number) { this.s = seed >>> 0 || 0x9e3779b9; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  gauss(): number {
    if (this.spare !== null) { const v = this.spare; this.spare = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    v = this.next();
    const m = Math.sqrt(-2 * Math.log(u));
    this.spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  }
  /** Fat-tailed noise: gaussian with occasional wide-scale mixture. Unit-ish variance. */
  fat(): number {
    // mixture: 96% N(0,0.93^2) + 4% N(0,2.4^2) -> variance ~1.09, normalised to unit variance below
    const g = this.gauss();
    return (this.next() < 0.04 ? g * 2.4 : g * 0.93) * 0.9578;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(a + (b - a + 1) * this.next()); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  weighted<T>(items: readonly T[], w: (x: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, w(it));
    if (total <= 0) return items[0];
    let r = this.next() * total;
    for (const it of items) { r -= Math.max(0, w(it)); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  getState(): RngState { return { s: this.s, spare: this.spare }; }
  setState(st: RngState): void { this.s = st.s >>> 0; this.spare = st.spare; }
}

export function seedLabel(seed: number): string { return 'CLINT-' + String(seed % 1000000).padStart(6, '0'); }
export function seedFromLabel(label: string): number {
  const m = /^CLINT-(\d{1,9})$/i.exec(label.trim());
  if (m) return parseInt(m[1], 10);
  return hashString(label.trim()) % 1000000;
}
