import type { PlayerState } from '../types';

export interface Stats {
  totalPL: number; winRate: number; avgWin: number; avgLoss: number; profitFactor: number; maxDD: number; sharpe: number; largestTrade: number;
  bestTrade: number; worstTrade: number; totalTrades: number; expectancy: number; avgHold: number; byClass: Record<string, { n: number; pnl: number }>;
}
export function computeStats(p: PlayerState): Stats {
  const t = p.trades;
  const wins = t.filter((x) => x.pnl > 0), losses = t.filter((x) => x.pnl < 0);
  const gw = wins.reduce((s, x) => s + x.pnl, 0), gl = Math.abs(losses.reduce((s, x) => s + x.pnl, 0));
  const eq = p.equityHistory;
  const rets: number[] = [];
  for (let i = 1; i < eq.length; i++) if (eq[i - 1].netWorth > 0) rets.push(eq[i].netWorth / eq[i - 1].netWorth - 1);
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) : 0;
  const byClass: Stats['byClass'] = {};
  for (const x of t) { const b = (byClass[x.cls] ??= { n: 0, pnl: 0 }); b.n++; b.pnl += x.pnl; }
  return {
    totalPL: p.realized, winRate: t.length ? (wins.length / t.length) * 100 : 0, avgWin: wins.length ? gw / wins.length : 0, avgLoss: losses.length ? -gl / losses.length : 0,
    profitFactor: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0, maxDD: p.maxDD * 100, sharpe: sd > 0 ? (mean / sd) * Math.sqrt(365) : 0, largestTrade: p.counters.largestTrade,
    bestTrade: p.counters.bestTrade, worstTrade: p.counters.worstTrade, totalTrades: p.counters.closed, expectancy: t.length ? t.reduce((s, x) => s + x.pnl, 0) / t.length : 0,
    avgHold: t.length ? t.reduce((s, x) => s + (x.closeT - x.openT), 0) / t.length : 0, byClass,
  };
}
