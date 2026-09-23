import type { World } from '@/engine/world';
import { dayIndexOf } from '@/engine/time';
import { accountOf, clamp, type Notify } from '../trading/engine';
import { activeDebt } from '../banking/bank';
import type { PlayerState } from '../types';

export interface MissionDef {
  id: string; title: string; desc: string; target: number; xp: number; cash: number; rep: number; challenge?: boolean; minRep?: number; lowRisk?: boolean;
  progress: (p: PlayerState, nw: number, w: World) => number;
}
const day = (w: World) => dayIndexOf(w.t);

export const MISSIONS: MissionDef[] = [
  { id: 'first_trade', title: 'First trade', desc: 'Open your first position.', target: 1, xp: 30, cash: 50, rep: 3, progress: (p) => p.counters.opened },
  { id: 'first_profit', title: 'First profit', desc: 'Close a trade in profit.', target: 1, xp: 40, cash: 75, rep: 3, progress: (p) => p.counters.wins },
  { id: 'make_1000', title: 'Make $1,000', desc: 'Reach $1,000 of total realised profit.', target: 1000, xp: 120, cash: 150, rep: 3, progress: (p) => Math.max(0, p.realized) },
  { id: 'survive_7', title: 'Survive 7 days', desc: 'Stay in the game for a full game-week.', target: 7, xp: 80, cash: 100, rep: 2, progress: (p, _n, w) => day(w) - p.startDay },
  { id: 'sl_five', title: 'Protect the downside', desc: 'Open 5 trades with a stop loss.', target: 5, xp: 70, cash: 100, rep: 3, lowRisk: true, progress: (p) => p.counters.slTrades },
  { id: 'news_trade', title: 'Trade during news', desc: 'Open a position within 15 minutes of important news or a data release.', target: 1, xp: 60, cash: 100, rep: 2, progress: (p) => p.counters.newsTrades },
  { id: 'tp_win', title: 'Hit the target', desc: 'Win a trade by take profit.', target: 1, xp: 50, cash: 75, rep: 2, progress: (p) => p.counters.tpWins },
  { id: 'diversify', title: 'Diversifier', desc: 'Trade 4 different asset classes.', target: 4, xp: 90, cash: 120, rep: 2, progress: (p) => p.counters.classesTraded.length },
  { id: 'no_call_30', title: 'Calm waters', desc: 'No margin call for 30 days.', target: 30, xp: 250, cash: 400, rep: 5, progress: (p) => p.counters.noMarginCallDays },
  { id: 'crash_profit', title: 'Profit from a crash', desc: 'Close a profitable short during a bear or panic regime.', target: 1, xp: 200, cash: 400, rep: 5, progress: (p) => p.counters.crashProfits },
  { id: 'trades_100', title: '100 trades', desc: 'Close 100 trades.', target: 100, xp: 300, cash: 500, rep: 4, progress: (p) => p.counters.closed },
  { id: 'debt_free', title: 'Debt free', desc: 'Take a loan and repay every one of them.', target: 1, xp: 120, cash: 150, rep: 4, progress: (p) => (p.counters.debtFreeAfterDebt ? 1 : 0) },
  { id: 'recover', title: 'Recover from bankruptcy', desc: 'After declaring bankruptcy, rebuild to $10,000 net worth.', target: 1, xp: 500, cash: 1000, rep: 10, progress: (p) => p.counters.recoveredFromBankruptcy },
  { id: 'nw_25k', title: 'Quarter of a hundred', desc: 'Reach $25,000 net worth.', target: 25000, xp: 200, cash: 300, rep: 4, progress: (_p, nw) => nw },
  // reputation-gated challenges
  { id: 'ch_lowlev', title: 'Challenge: Steady hands', desc: 'Close 10 profitable trades that all used 5x leverage or less and a stop loss.', target: 10, xp: 400, cash: 800, rep: 6, challenge: true, minRep: 60, progress: (p) => p.trades.filter((t) => t.pnl > 0 && t.leverage <= 5 && t.slSet).length },
  { id: 'ch_short', title: 'Challenge: Bear hunter', desc: 'Win 5 short trades.', target: 5, xp: 300, cash: 600, rep: 5, challenge: true, minRep: 60, progress: (p) => p.counters.shortWins },
  { id: 'ch_100k', title: 'Challenge: Six figures', desc: 'Reach $100,000 net worth.', target: 100000, xp: 800, cash: 2000, rep: 8, challenge: true, minRep: 60, progress: (_p, nw) => nw },
];

export interface AchievementDef { id: string; title: string; desc: string; test: (p: PlayerState, nw: number, w: World) => boolean }
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'survivor', title: 'THE SURVIVOR', desc: 'Survive 30 days.', test: (p, _n, w) => day(w) - p.startDay >= 30 },
  { id: 'analyst', title: 'THE ANALYST', desc: 'Win 10 trades.', test: (p) => p.counters.wins >= 10 },
  { id: 'news_hunter', title: 'NEWS HUNTER', desc: 'Trade around 10 news events.', test: (p) => p.counters.newsTrades >= 10 },
  { id: 'risk_manager', title: 'RISK MANAGER', desc: 'Keep risk control above 80.', test: (p) => p.riskControl >= 80 },
  { id: 'bull_runner', title: 'BULL RUNNER', desc: 'Make 10 profitable trades in bull conditions.', test: (p) => p.counters.bullProfit >= 10 },
  { id: 'bear_hunter', title: 'BEAR HUNTER', desc: 'Make 5 profitable trades in bear or panic conditions.', test: (p) => p.counters.bearProfit >= 5 },
  { id: 'debt_free', title: 'DEBT FREE', desc: 'Repay all loans after borrowing.', test: (p) => p.counters.debtFreeAfterDebt },
  { id: 'veteran', title: 'MARKET VETERAN', desc: 'Reach day 365.', test: (p, _n, w) => day(w) - p.startDay >= 364 },
  { id: 'crash_survivor', title: 'CRASH SURVIVOR', desc: 'Stay solvent through a global panic.', test: (p, _n, w) => w.s.market.regimes.GLOBAL.history.some((h) => h.regime === 'PANIC' && h.day >= p.startDay) && p.counters.daysPlayed > 3 && p.balance > 0 },
  { id: 'trades_1000', title: '1000 TRADES', desc: 'Close 1000 trades.', test: (p) => p.counters.closed >= 1000 },
  { id: 'million', title: '$1M NET WORTH', desc: 'Reach $1,000,000 net worth.', test: (_p, nw) => nw >= 1_000_000 },
  { id: 'ten_million', title: '$10M NET WORTH', desc: 'Reach $10,000,000 net worth.', test: (_p, nw) => nw >= 10_000_000 },
];

export function careerRank(daysPlayed: number): string {
  return daysPlayed >= 365 ? 'MARKET VETERAN' : daysPlayed >= 100 ? 'EXPERIENCED TRADER' : daysPlayed >= 30 ? 'TRADER' : 'NOVICE';
}
export function levelOf(xp: number): { level: number; cur: number; next: number } {
  let level = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; level++; need = Math.round(100 * Math.pow(level, 1.35)); }
  return { level, cur: xp - acc, next: need };
}

export function checkMissions(p: PlayerState, w: World, notify: Notify): void {
  const nw = accountOf(p, w).netWorth;
  // recovered flag
  if (p.bankruptcyBaseline !== null && p.counters.bankruptcies > 0 && nw >= 10000 && p.counters.recoveredFromBankruptcy === 0) p.counters.recoveredFromBankruptcy = 1;
  const before = levelOf(p.xp).level;
  for (const m of MISSIONS) {
    if (p.missionsDone[m.id] !== undefined) continue;
    if (m.minRep && p.reputation < m.minRep) continue;
    if (m.progress(p, nw, w) >= m.target) {
      p.missionsDone[m.id] = day(w);
      p.xp += m.xp; p.balance += m.cash; p.reputation = clamp(p.reputation + m.rep, 0, 100);
      notify({ kind: 'mission', title: `Mission complete: ${m.title}`, msg: `+${m.xp} XP, +$${m.cash}, +${m.rep} reputation`, sound: 'profit' });
    }
  }
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id] !== undefined) continue;
    if (a.test(p, nw, w)) { p.achievements[a.id] = day(w); notify({ kind: 'achievement', title: `Achievement: ${a.title}`, msg: a.desc, sound: 'profit' }); }
  }
  const after = levelOf(p.xp).level;
  if (after > before) notify({ kind: 'levelup', title: `Level ${after}`, msg: 'Your trader level increased.', sound: 'profit' });
  void activeDebt;
}
