import type { AssetState, Company, EarningsReport, EconomyState } from '@/types';
import type { Rng } from './rng';
import { IPO_SEEDS, STOCK_SEEDS, makeCompany } from './catalog';

export const EARNINGS_CYCLE = 30;         // game days per "quarter"
export const EARNINGS_WINDOW_START = 6;   // season runs days 6..10 of each cycle

export function createCompanies(rng: Rng, startDay: number): Record<string, Company> {
  const out: Record<string, Company> = {};
  STOCK_SEEDS.forEach((s, i) => {
    const c = makeCompany(s, 0);
    c.nextEarningsDay = nextSeasonDay(startDay, i, STOCK_SEEDS.length);
    c.earningsHour = i % 2 === 0 ? 16.5 : 8;
    out[c.id] = c;
  });
  IPO_SEEDS.forEach((s) => {
    const c = makeCompany(s, 0, { ipoPrice: s.ipoPrice, ipoDay: s.ipoDay, hype: s.hype });
    c.nextEarningsDay = s.ipoDay + 40;
    out[c.id] = c;
  });
  void rng;
  return out;
}

/** Each company reports on a staggered day inside the season window of a 30-day cycle. */
export function nextSeasonDay(fromDay: number, idx: number, n: number): number {
  const slot = Math.floor((idx / n) * 5); // 0..4
  const cycle = Math.floor((fromDay - EARNINGS_WINDOW_START) / EARNINGS_CYCLE);
  for (let c = cycle; c < cycle + 3; c++) {
    const d = c * EARNINGS_CYCLE + EARNINGS_WINDOW_START + slot;
    if (d >= fromDay) return d;
  }
  return fromDay + EARNINGS_CYCLE;
}

export function epsTTM(c: Company): number { return c.epsQ * 4; }

/** Fair value anchor: earnings power x baseline P/E, adjusted for rates and health. */
export function fairValueOf(c: Company, eco: EconomyState): number {
  const usRate = eco.rates.USD;
  const rateMult = Math.exp(-0.055 * (usRate - 4.25));
  const healthMult = 0.75 + 0.25 * Math.min(1, c.health / 75);
  const eps = Math.max(epsTTM(c), c.status === 'PRE_IPO' ? 0.2 : 0);
  if (eps <= 0) return Math.max(0.5, c.revenue * 4 * 0.6 / c.shares);   // price-to-sales fallback for loss makers
  return eps * c.pe0 * rateMult * healthMult;
}

export interface EarningsOutcome {
  report: EarningsReport;
  reactionPct: number;        // realised initial reaction target (%)
  guidance: 'RAISED' | 'MAINTAINED' | 'LOWERED';
  overvalued: boolean;
  headline: string;
  body: string;
  severity: number;
  sentiment: number;
}

export function reportEarnings(
  c: Company, a: AssetState, eco: EconomyState, factorGrowth: number, rng: Rng, day: number,
): EarningsOutcome {
  const prevEps = c.epsQ;
  // Quarterly EPS growth: earnings power compounds more slowly than headline revenue growth (0.5x), plus macro, health and noise.
  // A game 'quarter' is EARNINGS_CYCLE (30) days, so ~12 reports a year: scale annual growth to one cycle.
  const cyc = EARNINGS_CYCLE / 365;
  const gq = c.growth * 0.6 * cyc + factorGrowth * 0.003 + (c.health - 60) * 0.0001 + rng.gauss() * 0.03;
  const consensusG = c.growth * 0.6 * cyc + 0.0005 + c.sentiment * 0.005;
  const epsExpected = Math.round(prevEps * (1 + consensusG) * 100) / 100;
  const epsActual = Math.round(prevEps * (1 + gq) * 100) / 100;
  const surprise = epsExpected !== 0 ? (epsActual - epsExpected) / Math.abs(epsExpected) : 0;
  const revGrowth = gq * 0.8 + rng.gauss() * 0.02;
  const revenue = Math.max(0.05, c.revenue * (1 + revGrowth));

  // reaction: surprise effect, minus priced-in penalties, plus guidance & noise
  const valuation = a.price / Math.max(0.01, a.fair);
  const overvalued = valuation > 1.18;
  const guideRoll = rng.gauss() + surprise * 6;
  const guidance = guideRoll > 0.7 ? 'RAISED' : guideRoll < -0.7 ? 'LOWERED' : 'MAINTAINED';
  const guideEffect = guidance === 'RAISED' ? 2.2 : guidance === 'LOWERED' ? -3.2 : 0;
  let base = Math.max(-16, Math.min(16, surprise * 55)) + guideEffect + rng.gauss() * 2.6;
  const pricedIn = Math.max(0, valuation - 1.12) * 14 + Math.max(0, a.sentiment - 0.35) * 5;
  if (base > 0) base -= pricedIn;                  // good news, already priced for perfection
  else base -= pricedIn * 0.35;                    // bad news hits harder when expectations are high
  // stocks trading cheaply react more strongly to good news
  if (valuation < 0.88 && base > 0) base *= 1.25;
  const reaction = Math.max(-28, Math.min(24, base));

  const report: EarningsReport = { day, quarter: Math.floor(day / EARNINGS_CYCLE), epsExpected, epsActual, revenue: Math.round(revenue * 10) / 10, reaction: Math.round(reaction * 10) / 10, note: '' };

  // update fundamentals
  const newEps = epsActual;
  c.epsQ = newEps;
  c.revenue = revenue;
  c.netIncome = newEps * c.shares;
  c.margin = c.revenue > 0 ? Math.max(-0.5, Math.min(0.6, c.netIncome / c.revenue)) : c.margin;
  // growth mean-reverts to the company's long-run rate (it used to be a driftless random walk)
  c.growth = Math.max(-0.3, Math.min(0.7, c.growth * 0.8 + c.baseGrowth * 0.2 + (gq / cyc / 0.6 - c.baseGrowth) * 0.05));
  const bs = (4 * EARNINGS_CYCLE) / 365;                 // balance sheet moves at annual pace, not per report
  const cashflow = c.netIncome - c.debt * 0.012;
  c.debt = Math.max(0, c.debt - (Math.max(0, cashflow) * 0.35 - Math.max(0, -cashflow) * 0.9) * bs);
  c.equity = Math.max(0.1, c.equity + c.netIncome * (1 - Math.min(0.6, c.dividendYield * 8)) * bs);
  c.sentiment = Math.max(-1, Math.min(1, c.sentiment * 0.5 + Math.sign(surprise) * Math.min(0.6, Math.abs(surprise) * 3)));
  c.badQuarters = c.netIncome <= 0 ? c.badQuarters + 1 : 0;
  c.health = Math.max(0, Math.min(100, c.health + surprise * 18 + (c.netIncome > 0 ? 0 : -6) + rng.gauss() * 1.2));

  const beat = surprise > 0.01 ? 'beats' : surprise < -0.01 ? 'misses' : 'meets';
  const move = reaction >= 0 ? `+${reaction.toFixed(1)}%` : `${reaction.toFixed(1)}%`;
  const contrarian = (surprise > 0.01 && reaction < 0) || (surprise < -0.01 && reaction > 0);
  report.note = contrarian ? (surprise > 0 ? 'Beat, but the stock was priced for perfection.' : 'Miss, but expectations were low.') : `Guidance ${guidance.toLowerCase()}.`;
  const headline = `${c.name} ${beat} earnings: EPS $${epsActual.toFixed(2)} vs $${epsExpected.toFixed(2)} expected`;
  const body = `Revenue $${report.revenue.toFixed(1)}B. Guidance ${guidance.toLowerCase()}. ${report.note} Indicated market reaction ${move}.`;
  c.lastReport = report;
  c.reports.push(report);
  if (c.reports.length > 12) c.reports.shift();
  return { report, reactionPct: reaction, guidance, overvalued, headline, body, severity: Math.abs(reaction) > 10 ? 4 : Math.abs(reaction) > 5 ? 3 : 2, sentiment: Math.sign(reaction) * Math.min(1, Math.abs(reaction) / 12) };
}

export type HealthAction = { type: 'WARNING' | 'BANKRUPT' | 'RECOVER' | 'DELIST' | 'NONE'; headline?: string; body?: string };

/** Daily corporate health update. Debt, revenue trend, cashflow, sentiment and macro stress determine survival. */
export function updateHealthDaily(c: Company, a: AssetState, eco: EconomyState, factorGrowthLevel: number, ratesLevel: number, day: number, rng: Rng, riskMult: number): HealthAction {
  if (c.status === 'PRE_IPO' || c.status === 'DELISTED') return { type: 'NONE' };
  if (c.status === 'BANKRUPT') {
    if (c.bankruptDay !== undefined && day - c.bankruptDay >= 3) { c.status = 'DELISTED'; return { type: 'DELIST', headline: `${c.name} delisted from the exchange`, body: 'Shares have been removed from trading after the bankruptcy filing. Holders of the stock receive little or nothing.' }; }
    return { type: 'NONE' };
  }
  // Health mean-reverts to a set point that reflects the balance sheet: heavy debt and thin margins make a company fragile.
  const leverage = c.debt / Math.max(0.5, c.equity);
  const levPenalty = c.sector === 'BANKING' ? Math.max(0, leverage - 1.5) * 8 : Math.max(0, leverage - 1) * 22;
  const setPoint = 86 - levPenalty - (c.margin < 0.06 ? 12 : 0) - (c.netIncome < 0 ? 25 : 0)
    - Math.max(0, -factorGrowthLevel) * 120 - Math.max(0, ratesLevel) * 60 * Math.max(0, leverage - 0.8) + Math.max(0, c.sentiment) * 4;
  c.health += (setPoint - c.health) * 0.03 * riskMult + rng.gauss() * 1.7;
  c.health = Math.max(0, Math.min(100, c.health));
  if (c.status === 'ACTIVE' && c.health < 32) { c.status = 'WARNING'; return { type: 'WARNING', headline: `BANKRUPTCY WARNING: ${c.name} faces liquidity crisis`, body: `Debt load and weak cashflow raise the odds that ${c.name} cannot meet its obligations. Creditors are watching closely.` }; }
  if (c.status === 'WARNING') {
    if (c.health > 46) { c.status = 'ACTIVE'; return { type: 'RECOVER', headline: `${c.name} secures restructuring deal, avoids default`, body: 'Lenders agreed to extend maturities. The stock rebounds as bankruptcy fears fade.' }; }
    if (c.health < 12 && rng.chance(0.35)) { c.status = 'BANKRUPT'; c.bankruptDay = day; return { type: 'BANKRUPT', headline: `${c.name} files for bankruptcy protection`, body: 'The company could not refinance its debt. Trading may continue briefly before delisting.' }; }
  }
  return { type: 'NONE' };
}

/** Called when an IPO lists. Returns the opening price and hype used by the market engine. */
export function ipoOpenPrice(c: Company, rng: Rng): { price: number; hype: number } {
  const hype = (c.ipoHype ?? 0) + rng.gauss() * 0.25;
  const pop = Math.max(-0.35, Math.min(0.9, hype));
  return { price: (c.ipoPrice ?? 20) * (1 + pop), hype };
}

export function marketCapB(c: Company, price: number): number { return price * c.shares; }
export function peOf(c: Company, price: number): number | null { const e = epsTTM(c); return e > 0 ? price / e : null; }
export function roeOf(c: Company): number { return c.equity > 0 ? (c.netIncome * 4) / c.equity : 0; }
export function debtEquity(c: Company): number { return c.debt / Math.max(0.1, c.equity); }
