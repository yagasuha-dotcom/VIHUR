import type { RegimeGroup, RegimeId, RegimeState } from '@/types';
import type { Rng } from './rng';

export interface RegimeDef {
  id: RegimeId;
  label: string;
  drift: number;        // sigma per day
  volMult: number;
  momMult: number;
  mrMult: number;       // mean reversion strength multiplier
  sentBias: number;     // pull on sentiment
  spreadMult: number;
  days: [number, number];
  color: string;
  desc: string;
  next: Partial<Record<RegimeId, number>>;
}

export const REGIMES: Record<RegimeId, RegimeDef> = {
  BULL: { id: 'BULL', label: 'Bull', drift: 0.2, volMult: 0.9, momMult: 1.2, mrMult: 0.8, sentBias: 0.25, spreadMult: 0.95, days: [8, 24], color: '#2ED3A0', desc: 'Sustained uptrend with buyers in control.',
    next: { BULL: 0.15, SIDEWAYS: 0.25, DISTRIBUTION: 0.25, EUPHORIA: 0.12, LOW_VOL: 0.1, HIGH_VOL: 0.08, BEAR: 0.05 } },
  BEAR: { id: 'BEAR', label: 'Bear', drift: -0.3, volMult: 1.15, momMult: 1.2, mrMult: 0.8, sentBias: -0.25, spreadMult: 1.15, days: [6, 18], color: '#FF5C74', desc: 'Sustained downtrend and weak sentiment.',
    next: { BEAR: 0.1, SIDEWAYS: 0.2, ACCUMULATION: 0.25, PANIC: 0.1, HIGH_VOL: 0.1, RECOVERY: 0.2, LOW_VOL: 0.05 } },
  SIDEWAYS: { id: 'SIDEWAYS', label: 'Sideways', drift: 0, volMult: 0.72, momMult: 0.55, mrMult: 1.6, sentBias: 0, spreadMult: 0.95, days: [5, 14], color: '#8A93A8', desc: 'Range-bound market without clear direction.',
    next: { BULL: 0.2, BEAR: 0.24, ACCUMULATION: 0.15, DISTRIBUTION: 0.13, LOW_VOL: 0.12, HIGH_VOL: 0.12 } },
  ACCUMULATION: { id: 'ACCUMULATION', label: 'Accumulation', drift: 0.07, volMult: 0.75, momMult: 0.7, mrMult: 1.3, sentBias: -0.05, spreadMult: 1, days: [4, 10], color: '#4FD8F0', desc: 'Quiet base building after weakness.',
    next: { BULL: 0.5, SIDEWAYS: 0.2, RECOVERY: 0.15, BEAR: 0.1, LOW_VOL: 0.05 } },
  DISTRIBUTION: { id: 'DISTRIBUTION', label: 'Distribution', drift: -0.05, volMult: 1.0, momMult: 0.8, mrMult: 1.1, sentBias: 0.1, spreadMult: 1.05, days: [3, 8], color: '#F4B740', desc: 'Smart money sells into strength; rallies fade.',
    next: { BEAR: 0.42, SIDEWAYS: 0.22, HIGH_VOL: 0.15, PANIC: 0.06, BULL: 0.15 } },
  PANIC: { id: 'PANIC', label: 'Panic', drift: -1.5, volMult: 2.4, momMult: 1.6, mrMult: 0.25, sentBias: -0.8, spreadMult: 2.4, days: [1, 3], color: '#FF2D55', desc: 'Forced selling, thin liquidity, wide spreads.',
    next: { BEAR: 0.3, ACCUMULATION: 0.3, RECOVERY: 0.3, SIDEWAYS: 0.1 } },
  EUPHORIA: { id: 'EUPHORIA', label: 'Euphoria', drift: 0.6, volMult: 1.5, momMult: 1.7, mrMult: 0.35, sentBias: 0.7, spreadMult: 1.2, days: [3, 8], color: '#C77DFF', desc: 'Parabolic optimism. Risk of sharp reversals.',
    next: { DISTRIBUTION: 0.4, HIGH_VOL: 0.15, BEAR: 0.12, PANIC: 0.08, SIDEWAYS: 0.15, BULL: 0.1 } },
  RECOVERY: { id: 'RECOVERY', label: 'Recovery', drift: 0.4, volMult: 1.2, momMult: 1.1, mrMult: 0.9, sentBias: 0.15, spreadMult: 1.1, days: [4, 10], color: '#6EE7B7', desc: 'Rebound after stress; volatility fades slowly.',
    next: { BULL: 0.4, SIDEWAYS: 0.25, ACCUMULATION: 0.1, BEAR: 0.1, LOW_VOL: 0.15 } },
  HIGH_VOL: { id: 'HIGH_VOL', label: 'High volatility', drift: 0, volMult: 1.9, momMult: 0.9, mrMult: 1.0, sentBias: 0, spreadMult: 1.6, days: [2, 6], color: '#FF9F43', desc: 'Large swings in both directions.',
    next: { BEAR: 0.25, BULL: 0.25, SIDEWAYS: 0.25, PANIC: 0.05, RECOVERY: 0.1, LOW_VOL: 0.1 } },
  LOW_VOL: { id: 'LOW_VOL', label: 'Low volatility', drift: 0.03, volMult: 0.55, momMult: 0.6, mrMult: 1.4, sentBias: 0.05, spreadMult: 0.9, days: [4, 10], color: '#5C6B8A', desc: 'Calm tape with tight ranges.',
    next: { SIDEWAYS: 0.3, BULL: 0.3, HIGH_VOL: 0.2, BEAR: 0.1, ACCUMULATION: 0.1 } },
};

export const REGIME_GROUPS: RegimeGroup[] = ['GLOBAL', 'EQUITY', 'CRYPTO', 'FOREX', 'COMMODITY'];

export function newRegime(rng: Rng, day: number, start?: RegimeId, durMult = 1): RegimeState {
  const id = start ?? rng.weighted(['BULL', 'SIDEWAYS', 'LOW_VOL', 'ACCUMULATION', 'BEAR'] as RegimeId[], (r) => (r === 'BULL' ? 2 : r === 'SIDEWAYS' ? 3 : r === 'BEAR' ? 2 : 1.5));
  const [a, b] = REGIMES[id].days;
  return { current: id, remaining: rng.range(a, b) * durMult, since: day, history: [{ regime: id, day }] };
}

/** Advance regime clock by dtDays; on expiry choose a successor with probabilities biased by sentiment/bubble/stress. */
export function advanceRegime(
  st: RegimeState, dtDays: number, rng: Rng, day: number, ctx: { sentiment: number; bubble: number; durMult: number; chaos: number },
): boolean {
  st.remaining -= dtDays;
  if (st.remaining > 0) return false;
  const def = REGIMES[st.current];
  const opts = Object.entries(def.next) as [RegimeId, number][];
  const pick = rng.weighted(opts, ([id, w]) => {
    let m = w;
    if (id === 'EUPHORIA') m *= 0.4 + Math.max(0, ctx.sentiment) * 2.2 + ctx.bubble;
    if (id === 'PANIC') m *= (0.4 + Math.max(0, -ctx.sentiment) * 2 + ctx.bubble * 2) * (1 + ctx.chaos * 0.6);
    if (id === 'BULL' || id === 'RECOVERY') m *= 1 + ctx.sentiment * 0.6;
    if (id === 'BEAR') m *= 1 - ctx.sentiment * 0.5;
    if (id === 'DISTRIBUTION') m *= 1 + ctx.bubble * 1.5;
    if (id === 'HIGH_VOL') m *= 1 + ctx.chaos;
    return m;
  })[0];
  setRegime(st, pick, rng, day, ctx.durMult);
  return true;
}

export function setRegime(st: RegimeState, id: RegimeId, rng: Rng, day: number, durMult = 1, fixedDays?: number): void {
  st.current = id;
  const [a, b] = REGIMES[id].days;
  st.remaining = fixedDays ?? rng.range(a, b) * durMult;
  st.since = day;
  st.history.push({ regime: id, day });
  if (st.history.length > 60) st.history.shift();
}
