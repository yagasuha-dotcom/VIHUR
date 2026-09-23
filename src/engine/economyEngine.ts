import type { CalendarEvent, EconomyState, FactorId, ImpactLevel } from '@/types';
import type { Rng } from './rng';
import { CURRENCY_FLAG, CURRENCIES } from './catalog';
import { DAY, EPOCH, weekdayOf } from './time';

// ---------------------------------------------------------------------------------------------
// Economic state per currency area. "True" values drift slowly; releases reveal noisy measurements.
// ---------------------------------------------------------------------------------------------
export function createEconomy(rng: Rng): EconomyState {
  const rates: Record<string, number> = { USD: 4.25, EUR: 2.75, GBP: 4.5, JPY: 0.5, CHF: 0.5, AUD: 4.1, CAD: 3.0, NZD: 4.25 };
  const inflTrue: Record<string, number> = { USD: 3.4, EUR: 2.4, GBP: 3.6, JPY: 2.6, CHF: 0.8, AUD: 3.1, CAD: 2.7, NZD: 2.9 };
  const growthTrue: Record<string, number> = { USD: 2.4, EUR: 1.0, GBP: 1.2, JPY: 0.8, CHF: 1.3, AUD: 2.0, CAD: 1.8, NZD: 1.9 };
  const unempTrue: Record<string, number> = { USD: 4.2, EUR: 6.3, GBP: 4.4, JPY: 2.5, CHF: 2.3, AUD: 4.0, CAD: 6.1, NZD: 4.3 };
  const st: EconomyState = {
    rates, inflation: { ...inflTrue }, growth: { ...growthTrue }, unemployment: { ...unempTrue },
    inflTrue, growthTrue, unempTrue, sentiment: 0, bubble: null, crashCooldownUntil: 0,
  };
  for (const c of CURRENCIES) { st.inflation[c] += rng.gauss() * 0.1; st.growth[c] += rng.gauss() * 0.1; }
  return st;
}

/** Slow daily evolution of the true macro state (Ornstein-Uhlenbeck around anchors, with rate feedback). */
export function evolveEconomyDaily(eco: EconomyState, rng: Rng): void {
  for (const c of CURRENCIES) {
    const targetInfl = 2.6 - (eco.rates[c] - 3) * 0.12 + 0.6;
    eco.inflTrue[c] += (targetInfl - eco.inflTrue[c]) * 0.01 + rng.gauss() * 0.045 - (eco.rates[c] - 3.5) * 0.004;
    eco.growthTrue[c] += (1.8 - eco.growthTrue[c]) * 0.012 + rng.gauss() * 0.04 - (eco.rates[c] - 3.5) * 0.004;
    eco.unempTrue[c] += (4.5 - eco.unempTrue[c]) * 0.004 - (eco.growthTrue[c] - 1.8) * 0.006 + rng.gauss() * 0.015;
    eco.inflTrue[c] = Math.max(-0.5, Math.min(12, eco.inflTrue[c]));
    eco.growthTrue[c] = Math.max(-5, Math.min(7, eco.growthTrue[c]));
    eco.unempTrue[c] = Math.max(1.5, Math.min(14, eco.unempTrue[c]));
  }
}

export interface CalTemplate {
  id: string; currency: string; name: string; kind: CalendarEvent['kind']; impact: ImpactLevel;
  every: number; offset: number; time: number;  // hour in decimal
  unit: string; tags: string[];
}

// Cycle model: game "month" = 30 days, "quarter" = 90 days. Day index 0 (DAY 1) has US CPI at 08:30 by design.
export const CAL_TEMPLATES: CalTemplate[] = [
  { id: 'US_CPI', currency: 'USD', name: 'US CPI (YoY)', kind: 'CPI', impact: 'HIGH', every: 30, offset: 0, time: 8.5, unit: '%', tags: ['USD', 'inflation', 'stock', 'crypto', 'GOLD', 'forex'] },
  { id: 'US_GDP', currency: 'USD', name: 'US GDP (QoQ ann.)', kind: 'GDP', impact: 'HIGH', every: 90, offset: 2, time: 10, unit: '%', tags: ['USD', 'stock', 'forex'] },
  { id: 'US_NFP', currency: 'USD', name: 'US Non-Farm Payrolls', kind: 'EMP', impact: 'HIGH', every: 30, offset: 4, time: 8.5, unit: 'K', tags: ['USD', 'stock', 'GOLD', 'forex', 'crypto'] },
  { id: 'US_RETAIL', currency: 'USD', name: 'US Retail Sales (MoM)', kind: 'RETAIL', impact: 'MEDIUM', every: 30, offset: 14, time: 8.5, unit: '%', tags: ['USD', 'RETAIL', 'stock'] },
  { id: 'US_PMI', currency: 'USD', name: 'US Manufacturing PMI', kind: 'PMI', impact: 'MEDIUM', every: 30, offset: 1, time: 10, unit: '', tags: ['USD', 'stock', 'OIL'] },
  { id: 'US_CLAIMS', currency: 'USD', name: 'US Jobless Claims', kind: 'CLAIMS', impact: 'LOW', every: 7, offset: 3, time: 8.5, unit: 'K', tags: ['USD'] },
  { id: 'FED_RATE', currency: 'USD', name: 'FED Rate Decision', kind: 'RATE', impact: 'EXTREME', every: 42, offset: 17, time: 14, unit: '%', tags: ['USD', 'stock', 'crypto', 'GOLD', 'forex', 'bond', 'index'] },
  { id: 'FED_SPEECH', currency: 'USD', name: 'FED Chair Speech', kind: 'SPEECH', impact: 'MEDIUM', every: 14, offset: 9, time: 19, unit: '', tags: ['USD', 'stock', 'crypto', 'GOLD', 'bond'] },
  { id: 'EU_CPI', currency: 'EUR', name: 'Eurozone CPI (YoY)', kind: 'CPI', impact: 'MEDIUM', every: 30, offset: 12, time: 5, unit: '%', tags: ['EUR', 'forex'] },
  { id: 'EU_GDP', currency: 'EUR', name: 'Eurozone GDP (QoQ ann.)', kind: 'GDP', impact: 'MEDIUM', every: 90, offset: 40, time: 5, unit: '%', tags: ['EUR', 'forex'] },
  { id: 'ECB_RATE', currency: 'EUR', name: 'ECB Rate Decision', kind: 'RATE', impact: 'HIGH', every: 42, offset: 24, time: 14, unit: '%', tags: ['EUR', 'forex', 'bond'] },
  { id: 'UK_CPI', currency: 'GBP', name: 'UK CPI (YoY)', kind: 'CPI', impact: 'MEDIUM', every: 30, offset: 16, time: 2, unit: '%', tags: ['GBP', 'forex'] },
  { id: 'BOE_RATE', currency: 'GBP', name: 'BOE Rate Decision', kind: 'RATE', impact: 'HIGH', every: 42, offset: 30, time: 7, unit: '%', tags: ['GBP', 'forex'] },
  { id: 'JP_CPI', currency: 'JPY', name: 'Japan CPI (YoY)', kind: 'CPI', impact: 'LOW', every: 30, offset: 20, time: 19, unit: '%', tags: ['JPY', 'forex'] },
  { id: 'BOJ_RATE', currency: 'JPY', name: 'BOJ Rate Decision', kind: 'RATE', impact: 'HIGH', every: 42, offset: 9, time: 22, unit: '%', tags: ['JPY', 'forex'] },
  { id: 'SNB_RATE', currency: 'CHF', name: 'SNB Rate Decision', kind: 'RATE', impact: 'MEDIUM', every: 90, offset: 36, time: 3.5, unit: '%', tags: ['CHF', 'forex'] },
  { id: 'AU_EMP', currency: 'AUD', name: 'Australia Employment Change', kind: 'EMP', impact: 'MEDIUM', every: 30, offset: 18, time: 20.5, unit: 'K', tags: ['AUD', 'forex'] },
  { id: 'RBA_RATE', currency: 'AUD', name: 'RBA Rate Decision', kind: 'RATE', impact: 'MEDIUM', every: 30, offset: 6, time: 22.5, unit: '%', tags: ['AUD', 'forex'] },
  { id: 'CA_EMP', currency: 'CAD', name: 'Canada Employment Change', kind: 'EMP', impact: 'MEDIUM', every: 30, offset: 4, time: 8.5, unit: 'K', tags: ['CAD', 'forex'] },
  { id: 'BOC_RATE', currency: 'CAD', name: 'BOC Rate Decision', kind: 'RATE', impact: 'MEDIUM', every: 45, offset: 22, time: 10, unit: '%', tags: ['CAD', 'forex', 'OIL'] },
  { id: 'RBNZ_RATE', currency: 'NZD', name: 'RBNZ Rate Decision', kind: 'RATE', impact: 'LOW', every: 45, offset: 27, time: 21, unit: '%', tags: ['NZD', 'forex'] },
  { id: 'OPEC', currency: 'USD', name: 'OPEC Production Meeting', kind: 'OPEC', impact: 'HIGH', every: 60, offset: 33, time: 7, unit: '', tags: ['OIL', 'ENERGY', 'NATGAS'] },
];

function adjustToWeekday(day: number): number {
  const wd = ((day % 7) + 7) % 7;
  if (wd === 5) return day - 1;
  if (wd === 6) return day + 1;
  return day;
}

/** All calendar templates that fire on a given game day (deterministic, no RNG). */
export function templatesOnDay(day: number): CalTemplate[] {
  const out: CalTemplate[] = [];
  for (const t of CAL_TEMPLATES) {
    for (const cand of [day, day + 1, day - 1]) {
      const rel = ((cand - t.offset) % t.every + t.every) % t.every;
      if (rel === 0 && adjustToWeekday(cand) === day && !(t.kind === 'SPEECH' && false)) { out.push(t); break; }
    }
  }
  return out;
}

export function forecastFor(t: CalTemplate, eco: EconomyState, rng: Rng): { forecast?: number; previous?: number; trueVal?: number } {
  const c = t.currency;
  switch (t.kind) {
    case 'CPI': { const v = eco.inflTrue[c]; return { previous: round1(eco.inflation[c]), forecast: round1(v + rng.gauss() * 0.15), trueVal: v }; }
    case 'GDP': { const v = eco.growthTrue[c]; return { previous: round1(eco.growth[c]), forecast: round1(v + rng.gauss() * 0.25), trueVal: v }; }
    case 'EMP': {
      if (t.unit === 'K') { const v = 160 - (eco.unempTrue[c] - 4.2) * 60 + (eco.growthTrue[c] - 2) * 35; return { previous: Math.round(v + rng.gauss() * 30), forecast: Math.round(v + rng.gauss() * 25), trueVal: v }; }
      const v = eco.unempTrue[c]; return { previous: round1(eco.unemployment[c]), forecast: round1(v + rng.gauss() * 0.1), trueVal: v };
    }
    case 'RETAIL': { const v = (eco.growthTrue[c] - 1.8) * 0.4 + 0.3; return { previous: round1(v + rng.gauss() * 0.3), forecast: round1(v + rng.gauss() * 0.2), trueVal: v }; }
    case 'PMI': { const v = 50 + (eco.growthTrue[c] - 1.8) * 3; return { previous: round1(v + rng.gauss()), forecast: round1(v + rng.gauss() * 0.6), trueVal: v }; }
    case 'CLAIMS': { const v = 215 + (eco.unempTrue[c] - 4.2) * 25; return { previous: Math.round(v + rng.gauss() * 8), forecast: Math.round(v + rng.gauss() * 6), trueVal: v }; }
    case 'RATE': return { previous: eco.rates[c], forecast: eco.rates[c] + expectedMove(eco, c, rng), trueVal: eco.rates[c] };
    default: return {};
  }
}
function expectedMove(eco: EconomyState, c: string, rng: Rng): number {
  const gap = eco.inflTrue[c] - 2.4;
  const raw = gap > 1.2 ? 0.25 : gap < -0.5 ? -0.25 : 0;
  return rng.chance(0.75) ? raw : 0;
}
export function round1(x: number): number { return Math.round(x * 10) / 10; }

export function makeCalendarEvent(t: CalTemplate, day: number, eco: EconomyState, rng: Rng): CalendarEvent {
  const f = forecastFor(t, eco, rng);
  const tt = EPOCH + day * DAY + Math.round(t.time * 3600);
  return {
    id: `${t.id}-${day}`, templateId: t.id, t: tt, day, country: t.currency, flag: CURRENCY_FLAG[t.currency] ?? '', name: t.name,
    kind: t.kind, impact: t.impact, tags: t.tags, unit: t.unit, forecast: f.forecast, previous: f.previous, released: false,
    note: (f as { trueVal?: number }).trueVal !== undefined ? String((f as { trueVal?: number }).trueVal) : undefined,
  };
}

export interface ReleaseResult {
  actual?: number;
  surprise: number;               // normalised, + = "hawkish/strong currency" direction
  factorShocks: Partial<Record<FactorId, number>>;
  headline: string;
  body: string;
  sentiment: number;
  rateChange?: number;
}

const IMPACT_SCALE: Record<ImpactLevel, number> = { LOW: 0.35, MEDIUM: 0.7, HIGH: 1.2, EXTREME: 2.0 };
export function impactWeight(i: ImpactLevel): number { return IMPACT_SCALE[i]; }

/** Compute the actual value, update the economy, and translate the surprise into factor shocks (the reaction). */
export function releaseEvent(ev: CalendarEvent, eco: EconomyState, rng: Rng): ReleaseResult {
  const c = ev.country;
  const isUS = c === 'USD';
  const w = IMPACT_SCALE[ev.impact] * (isUS ? 1 : 0.7);
  const fx = (m: number) => (isUS ? m : m * 0.6);
  const shocks: Partial<Record<FactorId, number>> = {};
  let actual: number | undefined, surprise = 0, headline = '', body = '', sentiment = 0, rateChange: number | undefined;
  const trueVal = ev.note !== undefined ? parseFloat(ev.note) : undefined;
  const fmt = (v: number | undefined, u: string) => (v === undefined ? '-' : `${v}${u === 'K' ? 'K' : u}`);
  const name = ev.name.replace(/\s*\(.*\)/, '');

  switch (ev.kind) {
    case 'CPI': {
      actual = round1((trueVal ?? eco.inflTrue[c]) + rng.gauss() * 0.1);
      surprise = actual - (ev.forecast ?? actual);
      eco.inflation[c] = actual;
      shocks.INFL = surprise * 1.6 * w * 0.012 * 4;
      shocks.RATES = surprise * 1.1 * w * 0.01 * 4;
      if (isUS) { shocks.USD = surprise * 0.9 * w * 0.01 * 4; shocks.RISK = -surprise * 0.9 * w * 0.01 * 4; }
      else shocks.USD = -surprise * 0.25 * w * 0.01 * 4;
      const dir = surprise > 0.05 ? 'rises to' : surprise < -0.05 ? 'falls to' : 'holds at';
      const unexp = Math.abs(surprise) > 0.2 ? 'unexpectedly ' : '';
      headline = `${c === 'USD' ? 'US' : name.split(' ')[0]} inflation ${unexp}${dir} ${actual}%`;
      body = `${name} printed ${actual}% versus a ${ev.forecast}% forecast (previous ${ev.previous}%).`;
      sentiment = -Math.sign(surprise) * Math.min(1, Math.abs(surprise) / 0.6);
      break;
    }
    case 'GDP': {
      actual = round1((trueVal ?? eco.growthTrue[c]) + rng.gauss() * 0.2);
      surprise = actual - (ev.forecast ?? actual);
      eco.growth[c] = actual;
      shocks.GROWTH = surprise * 1.3 * w * 0.01 * 4;
      shocks.RISK = surprise * 1.0 * w * 0.01 * 4;
      shocks.USD = (isUS ? 1 : -0.3) * surprise * 0.5 * w * 0.01 * 4;
      headline = `${c === 'USD' ? 'US' : name.split(' ')[0]} GDP ${surprise > 0.15 ? 'beats forecasts at' : surprise < -0.15 ? 'misses forecasts at' : 'comes in at'} ${actual}%`;
      body = `${name}: ${actual}% vs ${ev.forecast}% expected.`;
      sentiment = Math.sign(surprise) * Math.min(1, Math.abs(surprise) / 0.8);
      break;
    }
    case 'EMP': {
      if (ev.unit === 'K') {
        actual = Math.round((trueVal ?? 150) + rng.gauss() * 35);
        surprise = (actual - (ev.forecast ?? actual)) / 60;
        eco.unemployment[c] = Math.max(1.5, eco.unempTrue[c] + rng.gauss() * 0.05);
        headline = `${c === 'USD' ? 'US' : name.split(' ')[0]} payrolls ${surprise > 0.2 ? 'surge to' : surprise < -0.2 ? 'slump to' : 'come in at'} ${actual}K`;
        body = `${name}: ${actual}K vs ${ev.forecast}K forecast.`;
      } else {
        actual = round1(trueVal ?? eco.unempTrue[c]);
        surprise = -(actual - (ev.forecast ?? actual)) / 0.3;
        eco.unemployment[c] = actual;
        headline = `${name.split(' ')[0]} unemployment ${surprise > 0 ? 'falls to' : 'rises to'} ${actual}%`;
        body = `${name}: ${actual}% vs ${ev.forecast}% forecast.`;
      }
      shocks.GROWTH = surprise * 0.6 * w * 0.01 * 4;
      shocks.RATES = surprise * 0.7 * w * 0.01 * 4;
      shocks.USD = (isUS ? 1 : -0.3) * surprise * 0.7 * w * 0.01 * 4;
      shocks.RISK = surprise * 0.3 * w * 0.01 * 4;
      sentiment = Math.sign(surprise) * Math.min(1, Math.abs(surprise));
      break;
    }
    case 'RETAIL': {
      actual = round1((trueVal ?? 0.3) + rng.gauss() * 0.25);
      surprise = (actual - (ev.forecast ?? actual)) / 0.4;
      shocks.GROWTH = surprise * 0.4 * w * 0.01 * 4;
      shocks.S_RETAIL = surprise * 1.0 * w * 0.01 * 4;
      shocks.USD = surprise * 0.3 * w * 0.01 * 4;
      headline = `US retail sales ${surprise > 0 ? 'beat' : 'miss'} expectations at ${actual}%`;
      body = `Retail sales ${actual}% MoM vs ${ev.forecast}% forecast.`;
      sentiment = Math.sign(surprise) * Math.min(1, Math.abs(surprise));
      break;
    }
    case 'PMI': {
      actual = round1((trueVal ?? 50) + rng.gauss() * 0.8);
      surprise = (actual - (ev.forecast ?? actual)) / 1.2;
      shocks.GROWTH = surprise * 0.5 * w * 0.01 * 4;
      shocks.RISK = surprise * 0.4 * w * 0.01 * 4;
      shocks.OIL = surprise * 0.3 * w * 0.01 * 4;
      headline = `US manufacturing PMI ${actual > 50 ? 'expands' : 'contracts'} at ${actual}`;
      body = `PMI ${actual} vs ${ev.forecast} expected. Readings above 50 signal expansion.`;
      sentiment = Math.sign(surprise) * Math.min(1, Math.abs(surprise));
      break;
    }
    case 'CLAIMS': {
      actual = Math.round((trueVal ?? 215) + rng.gauss() * 9);
      surprise = -(actual - (ev.forecast ?? actual)) / 15;
      shocks.USD = surprise * 0.2 * w * 0.01 * 4;
      headline = `US jobless claims at ${actual}K`;
      body = `Weekly claims ${actual}K vs ${ev.forecast}K expected.`;
      sentiment = Math.sign(surprise) * 0.2;
      break;
    }
    case 'RATE': {
      const prev = eco.rates[c];
      const exp = (ev.forecast ?? prev) - prev;
      const gap = eco.inflTrue[c] - 2.4;
      let move = exp;
      const roll = rng.next();
      if (roll < 0.22) move = exp + (rng.chance(0.5) ? 0.25 : -0.25);          // surprise
      else if (roll < 0.30) move = exp === 0 ? (gap > 0 ? 0.25 : -0.25) : 0;
      move = Math.round(move * 100) / 100;
      const newRate = Math.max(0, Math.round((prev + move) * 100) / 100);
      rateChange = newRate - prev;
      eco.rates[c] = newRate;
      actual = newRate;
      surprise = (rateChange - exp) / 0.25;
      shocks.RATES = (rateChange - exp) * 4.0 * w * 0.01 * 2.2 + rateChange * 0.6 * w * 0.01;
      shocks.USD = (isUS ? 1 : -0.3) * (rateChange - exp) * 5 * w * 0.01 * 2 + (isUS ? 0.15 : 0) * Math.sign(rateChange) * 0.01;
      shocks.RISK = -(rateChange - exp) * 3 * w * 0.01 * 2;
      if (isUS) shocks.S_BANKING = (rateChange - exp) * 1.2 * w * 0.01 * 2;
      const verb = rateChange > 0 ? `raises rates by ${(rateChange * 100).toFixed(0)}bp to ${newRate.toFixed(2)}%` : rateChange < 0 ? `cuts rates by ${(Math.abs(rateChange) * 100).toFixed(0)}bp to ${newRate.toFixed(2)}%` : `holds rates at ${newRate.toFixed(2)}%`;
      const bank = { USD: 'Fed', EUR: 'ECB', GBP: 'Bank of England', JPY: 'Bank of Japan', CHF: 'SNB', AUD: 'RBA', CAD: 'Bank of Canada', NZD: 'RBNZ' }[c] ?? 'Central bank';
      headline = `${bank} ${verb}`;
      body = `${name} outcome: ${newRate.toFixed(2)}% (expected ${((ev.forecast ?? prev)).toFixed(2)}%).`;
      sentiment = -Math.sign(rateChange - exp) * Math.min(1, Math.abs(rateChange - exp) / 0.25) * 0.8;
      break;
    }
    case 'SPEECH': {
      const tone = rng.gauss();
      surprise = tone;
      shocks.RATES = tone * 0.5 * w * 0.01;
      shocks.USD = tone * 0.4 * w * 0.01;
      shocks.RISK = -tone * 0.6 * w * 0.01;
      headline = tone > 0.4 ? 'Fed Chair signals rates could stay higher for longer' : tone < -0.4 ? 'Fed Chair opens door to easier policy' : 'Fed Chair speech offers few new signals';
      body = 'Markets parse the tone of the speech for hints on the next policy meeting.';
      sentiment = -Math.sign(tone) * Math.min(1, Math.abs(tone) * 0.5);
      break;
    }
    case 'OPEC': {
      const cut = rng.gauss();
      surprise = cut;
      shocks.OIL = cut * 3.2 * w * 0.01;
      shocks.INFL = cut * 0.4 * w * 0.01;
      headline = cut > 0.35 ? 'OPEC agrees to extend production cuts' : cut < -0.35 ? 'OPEC signals higher output from next quarter' : 'OPEC meeting ends with no change to output';
      body = 'Producers reviewed supply quotas and market balance.';
      sentiment = -cut * 0.2;
      break;
    }
    default:
      break;
  }
  void fx; void fmt;
  for (const k of Object.keys(shocks) as FactorId[]) { const v = shocks[k]; if (v === undefined || !isFinite(v)) delete shocks[k]; else shocks[k] = Math.max(-0.09, Math.min(0.09, v)); }
  return { actual, surprise, factorShocks: shocks, headline, body, sentiment, rateChange };
}

export function isWeekday(t: number): boolean { return weekdayOf(t) < 5; }
