import type { World } from '@/engine/world';
import { accountOf, clamp, type Notify } from './trading/engine';
import type { PlayerState } from './types';

interface LifeEvent { id: string; title: string; msg: (n: number) => string; cost?: number; gain?: number; kind: 'good' | 'bad' | 'life'; weight: number; premium?: boolean }

const EVENTS: LifeEvent[] = [
  { id: 'laptop', title: 'Your laptop broke', msg: (n) => `Repair bill: -$${n.toFixed(0)}.`, cost: 800, kind: 'bad', weight: 2 },
  { id: 'side_biz', title: 'Your side business earned money', msg: (n) => `A weekend project paid +$${n.toFixed(0)}.`, gain: 1200, kind: 'good', weight: 3 },
  { id: 'expense', title: 'Unexpected expense', msg: (n) => `A surprise bill cost you $${n.toFixed(0)}.`, cost: 350, kind: 'bad', weight: 3 },
  { id: 'tax_refund', title: 'Tax refund arrived', msg: (n) => `+$${n.toFixed(0)} landed in your account.`, gain: 450, kind: 'good', weight: 2 },
  { id: 'premium', title: 'Bank offers you a premium account', msg: () => 'Pay a $60 fee for a +12 credit score boost and faster support.', kind: 'life', weight: 1.5, premium: true },
  { id: 'gift', title: 'Family sends a small gift', msg: (n) => `A relative wired you $${n.toFixed(0)} for luck.`, gain: 200, kind: 'good', weight: 1 },
];

/** Optional, low-frequency, scaled to the player's balance so it is never crippling. */
export function rollLifeEvent(p: PlayerState, w: World, notify: Notify): void {
  const eq = accountOf(p, w).equity;
  if (eq < 500 || w.s.difficulty === 'EASY' && Math.random() < 0.5) return;
  const rng = w.rng;
  if (!rng.chance(0.07)) return;
  const ev = rng.weighted(EVENTS, (e) => e.weight);
  const scale = clamp(eq / 10000, 0.25, 3);
  if (ev.premium) {
    notify({ kind: 'life', title: ev.title, msg: ev.msg(0), actions: [{ label: 'Accept', action: 'premium' }, { label: 'No thanks', action: 'dismiss' }] });
    return;
  }
  if (ev.cost) { const cost = Math.min(ev.cost * scale, p.balance * 0.08); if (cost < 5) return; p.balance -= cost; p.counters.lifeEvents++; notify({ kind: 'life', title: ev.title, msg: ev.msg(cost) }); }
  else if (ev.gain) { const g = ev.gain * scale; p.balance += g; p.counters.lifeEvents++; notify({ kind: 'good', title: ev.title, msg: ev.msg(g) }); }
}
