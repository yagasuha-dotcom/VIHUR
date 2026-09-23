import type { World } from '@/engine/world';
import { DIFFICULTY } from '@/engine/difficulty';
import { dayIndexOf } from '@/engine/time';
import { accountOf, clamp, type Notify } from '../trading/engine';
import type { Loan, PlayerState } from '../types';

export interface LoanTier { id: string; amount: number; rate: number; days: number; minRep: number; label: string }
export const LOAN_TIERS: LoanTier[] = [
  { id: 't1', amount: 5000, rate: 0.08, days: 7, minRep: 0, label: 'Starter' },
  { id: 't2', amount: 10000, rate: 0.12, days: 14, minRep: 30, label: 'Standard' },
  { id: 't3', amount: 25000, rate: 0.18, days: 30, minRep: 50, label: 'Premium' },
];

/** Credit score sets the price of borrowing: 850 -> 0.6x, 300 -> 1.6x. */
export function creditMultiplier(score: number): number { return 1.6 - ((score - 300) / 550) * 1.0; }
export function creditLabel(score: number): string { return score >= 800 ? 'Exceptional' : score >= 740 ? 'Very good' : score >= 670 ? 'Good' : score >= 580 ? 'Fair' : 'Poor'; }
export function activeDebt(p: PlayerState): number { return p.loans.filter((l) => l.status !== 'PAID').reduce((s, l) => s + l.remaining, 0); }

export interface LoanOffer { tier: LoanTier; rate: number; repay: number; allowed: boolean; reason?: string }
export function loanOffers(p: PlayerState, w: World): LoanOffer[] {
  const diff = DIFFICULTY[w.s.difficulty];
  const debt = activeDebt(p);
  const hasDefault = p.loans.some((l) => l.status === 'DEFAULT');
  return LOAN_TIERS.map((tier) => {
    const rate = tier.rate * creditMultiplier(p.credit) * diff.loanRate;
    let reason: string | undefined;
    if (p.reputation < tier.minRep) reason = `Requires reputation ${tier.minRep}`;
    else if (hasDefault) reason = 'Clear your defaulted loan first';
    else if (p.credit < 400) reason = 'Credit score too low (min 400)';
    else if (debt + tier.amount > 40000) reason = 'Debt limit reached ($40,000)';
    return { tier, rate, repay: tier.amount * (1 + rate), allowed: !reason, reason };
  });
}

export function takeLoan(p: PlayerState, w: World, tierId: string, notify: Notify): string | null {
  const offer = loanOffers(p, w).find((o) => o.tier.id === tierId);
  if (!offer) return 'Unknown loan';
  if (!offer.allowed) return offer.reason ?? 'Not available';
  const day = dayIndexOf(w.t);
  const loan: Loan = {
    id: `L${++p.seq}`, principal: offer.tier.amount, rate: offer.rate, repay: offer.repay, remaining: offer.repay, takenDay: day, dueDay: day + offer.tier.days, termDays: offer.tier.days,
    status: 'ACTIVE', lateDays: 0, restructured: false, label: offer.tier.label,
  };
  p.loans.push(loan);
  p.balance += loan.principal;
  p.counters.loansTaken++; p.counters.everDebt = true;
  notify({ kind: 'info', title: 'Loan approved', msg: `$${loan.principal.toLocaleString()} credited. Repay $${loan.repay.toFixed(2)} by day ${loan.dueDay + 1}.` });
  return null;
}

export function repayLoan(p: PlayerState, w: World, id: string, amount: number | 'all', notify: Notify): string | null {
  const l = p.loans.find((x) => x.id === id);
  if (!l || l.status === 'PAID') return 'Loan not found';
  const acc = accountOf(p, w);
  const avail = Math.max(0, Math.min(p.balance, acc.freeMargin));
  const pay = amount === 'all' ? l.remaining : Math.min(amount, l.remaining);
  if (pay <= 0) return 'Enter an amount';
  if (pay > avail + 1e-6) return `Only $${avail.toFixed(2)} of free cash is available`;
  p.balance -= pay; l.remaining -= pay;
  if (l.remaining < 0.005) settle(p, w, l, notify, true);
  else notify({ kind: 'info', title: 'Partial repayment', msg: `$${pay.toFixed(2)} paid. Remaining $${l.remaining.toFixed(2)}.` });
  return null;
}

function settle(p: PlayerState, w: World, l: Loan, notify: Notify, manual: boolean): void {
  const day = dayIndexOf(w.t);
  l.remaining = 0; l.paidDay = day;
  const early = manual && day < l.dueDay && l.status === 'ACTIVE';
  const wasLate = l.status === 'LATE' || l.status === 'DEFAULT';
  l.status = 'PAID';
  p.counters.loansRepaid++;
  const boost = wasLate ? 6 : early ? 26 : 18;
  p.credit = clamp(p.credit + boost * Math.min(1.5, l.principal / 10000 + 0.5), 300, 850);
  p.reputation = clamp(p.reputation + (wasLate ? 0.5 : 2), 0, 100);
  if (!p.loans.some((x) => x.status !== 'PAID') && p.counters.everDebt) p.counters.debtFreeAfterDebt = true;
  notify({ kind: 'good', title: 'Loan repaid', msg: `${l.label} loan cleared${early ? ' early' : ''}. Credit score improved.` });
}

/** Daily: due dates, late penalties, defaults, garnishment. */
export function processLoansDaily(p: PlayerState, w: World, notify: Notify): void {
  const day = dayIndexOf(w.t);
  for (const l of p.loans) {
    if (l.status === 'PAID') continue;
    if (day >= l.dueDay) {
      const acc = accountOf(p, w);
      const avail = Math.max(0, Math.min(p.balance, acc.freeMargin));
      const pay = Math.min(l.remaining, avail);
      if (pay > 0) { p.balance -= pay; l.remaining -= pay; }
      if (l.remaining < 0.005) { settle(p, w, l, notify, false); continue; }
      if (l.status === 'ACTIVE') { l.status = 'LATE'; p.counters.loansLate++; p.reputation = clamp(p.reputation - 4, 0, 100); }
      l.lateDays++;
      l.remaining *= 1.015;
      p.credit = clamp(p.credit - 5, 300, 850);
      if (l.lateDays === 1) notify({ kind: 'bad', title: 'Loan payment missed', msg: `${l.label} loan is overdue: $${l.remaining.toFixed(2)}. Late fees of 1.5%/day apply. Restructure or repay now.`, sound: 'loss' });
      if (l.lateDays >= 7 && l.status === 'LATE') { l.status = 'DEFAULT'; p.credit = clamp(p.credit - 60, 300, 850); p.reputation = clamp(p.reputation - 12, 0, 100); notify({ kind: 'bad', title: 'LOAN DEFAULT', msg: `${l.label} loan has defaulted. Any cash you hold will be collected. New loans are blocked.`, sound: 'margin' }); }
    }
  }
}

export function restructureLoan(p: PlayerState, id: string, notify: Notify): string | null {
  const l = p.loans.find((x) => x.id === id);
  if (!l || l.status === 'PAID') return 'Loan not found';
  if (l.restructured) return 'This loan was already restructured';
  l.restructured = true;
  l.remaining *= 1.03;
  l.dueDay += 14; l.lateDays = 0;
  if (l.status === 'DEFAULT' || l.status === 'LATE') l.status = 'ACTIVE';
  p.credit = clamp(p.credit - 20, 300, 850);
  notify({ kind: 'warn', title: 'Debt restructured', msg: '14 extra days granted for a 3% fee and -20 credit score.' });
  return null;
}

export function dailyCreditDrift(p: PlayerState, w: World): void {
  const acc = accountOf(p, w);
  if (activeDebt(p) === 0) p.credit = clamp(p.credit + 0.08, 300, 850);
  else if (acc.netWorth > 0 && activeDebt(p) < acc.netWorth * 0.5) p.credit = clamp(p.credit + 0.03, 300, 850);
  else if (activeDebt(p) > Math.max(1, acc.netWorth) * 0.9) p.credit = clamp(p.credit - 0.35, 300, 850);
}

// ------------------------------------------------------------------------------------------------
// Recovery paths: side jobs, daily reward, bankruptcy
// ------------------------------------------------------------------------------------------------
export function canSideJob(p: PlayerState, w: World): boolean { return p.sideJobDay < dayIndexOf(w.t); }
export function doSideJob(p: PlayerState, w: World, notify: Notify): string | null {
  if (!canSideJob(p, w)) return 'You already worked today. Come back tomorrow.';
  const pay = Math.round(110 + ((w.s.seed + dayIndexOf(w.t) * 31) % 150));
  p.balance += pay; p.sideJobDay = dayIndexOf(w.t); p.counters.sideJobs++; p.xp += 8;
  notify({ kind: 'good', title: 'Side job complete', msg: `You earned $${pay} freelancing on the side. Low risk, low reward.` });
  return null;
}
export function canDailyReward(p: PlayerState, w: World): boolean { return p.dailyRewardDay < dayIndexOf(w.t); }
export function claimDailyReward(p: PlayerState, w: World, notify: Notify): string | null {
  const day = dayIndexOf(w.t);
  if (p.dailyRewardDay >= day) return 'Already claimed today';
  p.rewardStreak = p.dailyRewardDay === day - 1 ? p.rewardStreak + 1 : 1;
  const amount = 40 + Math.min(p.rewardStreak, 10) * 10;
  p.balance += amount; p.dailyRewardDay = day; p.counters.dailyRewards++; p.xp += 10;
  notify({ kind: 'good', title: 'Daily reward', msg: `+$${amount} (streak ${p.rewardStreak}).` });
  return null;
}

export function isBroke(p: PlayerState, w: World): boolean {
  const acc = accountOf(p, w);
  return p.positions.length === 0 && acc.equity < 25 && p.orders.length === 0;
}

export function declareBankruptcy(p: PlayerState, w: World, notify: Notify): string | null {
  if (p.positions.length) return 'Close all positions first.';
  const debtBefore = activeDebt(p);
  p.loans = p.loans.map((l) => ({ ...l, status: 'PAID' as const, remaining: 0 }));
  p.credit = 300; p.reputation = Math.max(5, p.reputation * 0.3);
  p.balance = 1500; p.counters.bankruptcies++; p.brokeDay = dayIndexOf(w.t);
  p.bankruptcyBaseline = accountOf(p, w).netWorth;
  p.discipline = 50; p.patience = 50; p.riskControl = 50;
  notify({ kind: 'warn', title: 'BANKRUPTCY DECLARED', msg: `$${debtBefore.toFixed(0)} in debts were discharged. A court-supervised $1,500 allowance restarts your career. Credit score reset to 300.`, sound: 'margin' });
  return null;
}
