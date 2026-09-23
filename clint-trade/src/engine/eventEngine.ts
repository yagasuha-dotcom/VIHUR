import type { ActiveEvent, EconomyState, FactorId, NewsCategory, NewsReliability, RegimeId } from '@/types';
import { CATALOG, CATALOG_MAP } from './catalog';
import { shockAsset, shockFactor, setAllRegimes, type MarketState } from './marketEngine';
import type { Rng } from './rng';
import { publishNews, type NewsResult, type NewsWorld } from './newsEngine';
import { NEWS_MAP, type NewsTemplate } from './newsTemplates';
import { DAY, dayIndexOf } from './time';
import { setRegime } from './regimes';

export type RecoveryPattern = ActiveEvent['pattern'];

export interface WorldEventDef {
  id: string;
  name: string;
  category: NewsCategory;
  prob: number;                       // per game-day at NORMAL difficulty
  sev: [number, number];
  shocks: Partial<Record<FactorId, number>>;   // % per severity unit
  target?: 'company' | 'coin' | 'bank';
  targetShock?: number;
  durationHours: [number, number];
  recovery: Record<RecoveryPattern, number>;   // weights
  headline: (name: string, sev: number) => string;
  body: string;
  reliability: NewsReliability;
  extra?: (ctx: { market: MarketState; rng: Rng; t: number; sev: number; target?: string }) => void;
}

const V: Record<RecoveryPattern, number> = { V: 4, SLOW: 3, CONTINUE: 1.5, SIDEWAYS: 2 };
const SLOW: Record<RecoveryPattern, number> = { V: 1.5, SLOW: 4, CONTINUE: 2, SIDEWAYS: 2.5 };
const CONT: Record<RecoveryPattern, number> = { V: 1, SLOW: 2.5, CONTINUE: 4, SIDEWAYS: 2 };

export const WORLD_EVENTS: WorldEventDef[] = [
  { id: 'bank_failure', name: 'BANK FAILURE', category: 'BANKING', prob: 0.009, sev: [3, 5], shocks: { S_BANKING: -2.4, RISK: -1.1, RATES: -0.4, GEO: 0.3 }, target: 'bank', targetShock: -9, durationHours: [24, 96], recovery: SLOW, reliability: 'OFFICIAL',
    headline: (n) => `${n} collapses; regulators seize assets`, body: 'Depositors are protected but contagion fears spread across lenders.' },
  { id: 'cyber_attack', name: 'CYBER ATTACK', category: 'TECHNOLOGY', prob: 0.012, sev: [2, 4], shocks: { S_TECH: -1.5, RISK: -0.4 }, target: 'company', targetShock: -5, durationHours: [12, 48], recovery: V, reliability: 'CONFIRMED',
    headline: (n) => `${n} hit by large-scale cyber attack; systems offline`, body: 'The company is working with authorities to restore services.' },
  { id: 'oil_discovery', name: 'OIL DISCOVERY', category: 'ENERGY', prob: 0.007, sev: [2, 4], shocks: { OIL: -2.2, S_ENERGY: -0.4, INFL: -0.2 }, target: 'company', targetShock: 4, durationHours: [24, 120], recovery: SLOW, reliability: 'OFFICIAL',
    headline: () => 'Giant offshore oil field discovered, could reshape supply outlook', body: 'Analysts expect years before output, but futures react immediately.' },
  { id: 'oil_shortage', name: 'OIL SHORTAGE', category: 'ENERGY', prob: 0.009, sev: [3, 5], shocks: { OIL: 3.0, S_ENERGY: 1.6, INFL: 0.5, RISK: -0.5 }, durationHours: [24, 120], recovery: SLOW, reliability: 'CONFIRMED',
    headline: () => 'Pipeline outage and refinery fire trigger oil shortage', body: 'Fuel prices surge as inventories draw sharply.' },
  { id: 'major_hack', name: 'MAJOR HACK', category: 'CRYPTO', prob: 0.011, sev: [3, 5], shocks: { CRYPTO: -3.2, RISK: -0.3 }, target: 'coin', targetShock: -7, durationHours: [12, 72], recovery: V, reliability: 'CONFIRMED',
    headline: (n) => `Major exchange hack drains hundreds of millions; ${n} among tokens hit`, body: 'Withdrawals are frozen while the exchange investigates.' },
  { id: 'ceo_resign', name: 'CEO RESIGNS', category: 'COMPANY', prob: 0.02, sev: [2, 3], shocks: {}, target: 'company', targetShock: -5.5, durationHours: [12, 48], recovery: SLOW, reliability: 'OFFICIAL',
    headline: (n) => `${n} CEO resigns with immediate effect`, body: 'The board has begun a search for a successor.' },
  { id: 'scandal', name: 'COMPANY SCANDAL', category: 'COMPANY', prob: 0.012, sev: [3, 4], shocks: {}, target: 'company', targetShock: -9, durationHours: [24, 96], recovery: CONT, reliability: 'BREAKING',
    headline: (n) => `Scandal engulfs ${n} as internal documents surface`, body: 'Investors fear fines, lawsuits and reputational damage.',
    extra: ({ market, target }) => { if (target && market.assets[target]) market.assets[target].sentiment = -0.9; } },
  { id: 'new_tech', name: 'NEW TECHNOLOGY', category: 'TECHNOLOGY', prob: 0.014, sev: [2, 4], shocks: { S_TECH: 1.5, S_AI: 1.0, RISK: 0.3 }, target: 'company', targetShock: 5, durationHours: [24, 96], recovery: SLOW, reliability: 'OFFICIAL',
    headline: (n) => `${n} demonstrates breakthrough technology; peers rally`, body: 'Analysts raise long-term estimates across the sector.' },
  { id: 'war', name: 'WAR ESCALATION', category: 'GEOPOLITICS', prob: 0.008, sev: [3, 5], shocks: { GEO: 3.0, RISK: -1.8, OIL: 1.4, USD: 0.5, INFL: 0.3 }, durationHours: [24, 168], recovery: CONT, reliability: 'BREAKING',
    headline: () => 'Military escalation shakes markets; investors flee to safe havens', body: 'Energy and defence-sensitive assets react most.' },
  { id: 'peace', name: 'PEACE AGREEMENT', category: 'GEOPOLITICS', prob: 0.007, sev: [2, 4], shocks: { GEO: -2.4, RISK: 1.3, OIL: -0.8 }, durationHours: [24, 96], recovery: V, reliability: 'OFFICIAL',
    headline: () => 'Peace agreement signed; risk appetite jumps', body: 'Safe-haven demand fades and global growth hopes improve.' },
  { id: 'rate_cut', name: 'EMERGENCY RATE CUT', category: 'INTEREST RATE', prob: 0.005, sev: [3, 4], shocks: { RATES: -1.8, RISK: 1.5, USD: -0.8, S_BANKING: -0.4 }, durationHours: [24, 96], recovery: SLOW, reliability: 'OFFICIAL',
    headline: () => 'Central bank delivers surprise emergency rate cut', body: 'Policymakers cite tightening financial conditions.' },
  { id: 'rate_hike', name: 'EMERGENCY RATE HIKE', category: 'INTEREST RATE', prob: 0.005, sev: [3, 4], shocks: { RATES: 1.8, RISK: -1.5, USD: 0.9, S_BANKING: 0.5, INFL: -0.3 }, durationHours: [24, 96], recovery: SLOW, reliability: 'OFFICIAL',
    headline: () => 'Central bank stuns markets with an unscheduled rate hike', body: 'Officials say inflation risks have turned entrenched.' },
  { id: 'emergency_policy', name: 'EMERGENCY POLICY', category: 'ECONOMY', prob: 0.006, sev: [2, 4], shocks: { RISK: 1.0, GROWTH: 0.6, INFL: 0.3 }, durationHours: [24, 72], recovery: SLOW, reliability: 'OFFICIAL',
    headline: () => 'Government unveils emergency stimulus package', body: 'Support measures target households and small businesses.' },
  { id: 'disaster', name: 'NATURAL DISASTER', category: 'ECONOMY', prob: 0.008, sev: [2, 4], shocks: { GROWTH: -0.8, RISK: -0.7, S_RETAIL: -0.6, OIL: 0.3 }, durationHours: [24, 120], recovery: SLOW, reliability: 'CONFIRMED',
    headline: () => 'Powerful storm disrupts ports and power grids; insurers brace for losses', body: 'Supply chains face delays.' },
  { id: 'etf_inflow', name: 'MASSIVE ETF INFLOW', category: 'CRYPTO', prob: 0.012, sev: [2, 4], shocks: { CRYPTO: 2.6, RISK: 0.3 }, durationHours: [24, 96], recovery: SLOW, reliability: 'CONFIRMED',
    headline: () => 'Record ETF inflows lift crypto to fresh weekly highs', body: 'Institutional demand accelerates.' },
  { id: 'whale', name: 'WHALE MOVEMENT', category: 'CRYPTO', prob: 0.02, sev: [1, 3], shocks: { CRYPTO: -1.4 }, target: 'coin', targetShock: -3, durationHours: [6, 24], recovery: V, reliability: 'RUMOR',
    headline: (n) => `On-chain data: dormant whale moves large ${n} balance to exchange`, body: 'Traders worry about potential selling pressure.' },
  { id: 'short_squeeze', name: 'SHORT SQUEEZE', category: 'COMPANY', prob: 0.014, sev: [2, 4], shocks: {}, target: 'company', targetShock: 11, durationHours: [6, 30], recovery: V, reliability: 'BREAKING',
    headline: (n) => `${n} soars as short sellers scramble to cover`, body: 'Heavy short interest fuels a violent move higher.',
    extra: ({ market, target, rng }) => { if (target && market.assets[target]) { market.assets[target].volBoost += 1.5; market.assets[target].supplyDemand += 1 + rng.next(); } } },
  { id: 'liq_cascade', name: 'LIQUIDATION CASCADE', category: 'CRYPTO', prob: 0.01, sev: [3, 4], shocks: { CRYPTO: -3.8, RISK: -0.4 }, durationHours: [6, 30], recovery: V, reliability: 'CONFIRMED',
    headline: () => 'Leveraged crypto longs liquidated in a violent cascade', body: 'Over a billion dollars of positions are wiped out within hours.',
    extra: ({ market }) => { for (const d of CATALOG) if (d.cls === 'crypto') { market.assets[d.id].liquidityNow *= 0.5; market.assets[d.id].spreadBoost += 3; } } },
];

export interface EventWorld extends NewsWorld {
  eco: EconomyState;
  active: ActiveEvent[];
  diffEvent: number;
  diffCrash: number;
  chaos: number;
  day: number;
  banks: () => { id: string; name: string }[];
  addNews: (r: NewsResult) => void;
  seq: number;
}

let EVENT_SEQ = 0;
export function setEventSeq(n: number): void { EVENT_SEQ = n; }
export function getEventSeq(): number { return EVENT_SEQ; }

function eventTpl(def: WorldEventDef): NewsTemplate {
  return {
    id: 'event_' + def.id, category: def.category, weight: 0, sev: def.sev, dir: 0, shocks: {}, rel: { [def.reliability]: 1 } as Partial<Record<NewsReliability, number>>,
    headline: () => '', body: def.body,
  };
}

/** Trigger a world event: publish news, shock factors/assets, schedule the recovery pattern. */
export function triggerEvent(w: EventWorld, def: WorldEventDef, sevIn?: number): ActiveEvent {
  const { rng, market } = w;
  const sev = sevIn ?? Math.round(rng.range(def.sev[0], def.sev[1] + 0.49));
  const sevScale = Math.pow(sev, 1.1) * 0.55;
  let target: { id: string; name: string } | undefined;
  if (def.target === 'company') { const ids = w.activeCompanyIds(); if (ids.length) { const id = rng.pick(ids); target = { id, name: w.companyName(id) }; } }
  if (def.target === 'coin') { const coins = CATALOG.filter((a) => a.cls === 'crypto'); const c = rng.pick(coins); target = { id: c.id, name: c.name }; }
  if (def.target === 'bank') { const b = w.banks(); if (b.length) target = rng.pick(b); }
  const name = target?.name ?? '';
  const headline = def.headline(name, sev);

  const durMin = rng.range(def.durationHours[0], def.durationHours[1]) * 60;
  const factorPos = (def.id === 'peace' || def.id === 'oil_discovery' || def.id === 'rate_cut' || def.id === 'emergency_policy' || def.id === 'etf_inflow' || def.id === 'new_tech' || def.id === 'short_squeeze') ? 1 : -1;
  void factorPos;
  const tpl: NewsTemplate = { ...eventTpl(def), shocks: def.shocks, target: def.target === 'coin' ? 'coin' : def.target === 'company' ? 'company' : undefined, targetShock: def.targetShock ? Math.abs(def.targetShock) : undefined, horizon: Math.min(480, durMin * 0.6) };
  // sign already embedded in shock signs; publish with sign = +1 and let the shocks carry direction
  const tShockSign = def.targetShock !== undefined ? Math.sign(def.targetShock) : 1;
  const res = publishNews(w, { ...tpl, dir: 1 }, {
    sev, sign: tShockSign < 0 && def.targetShock ? 1 : 1, reliability: def.reliability, overrideHeadline: headline, overrideBody: def.body,
    forceTarget: target?.id, noImpact: true,
  });
  // apply the impact ourselves so negative target shocks keep their sign
  for (const k in def.shocks) shockFactor(market, rng, w.t, k as FactorId, (def.shocks[k as FactorId] as number) * sevScale * 0.01, Math.min(480, durMin * 0.5));
  if (target && def.targetShock !== undefined) shockAsset(market, target.id, def.targetShock * sevScale * 0.01, Math.min(480, durMin * 0.5));
  const affectedIds = new Set<string>();
  const shockMap = def.shocks;
  const exp: Record<string, number> = {};
  for (const d of CATALOG) {
    if (d.cls === 'index') continue;
    let e = 0;
    for (const k in shockMap) e += (d.loadings[k as FactorId] ?? 0) * (shockMap[k as FactorId] as number) * sevScale;
    if (target && d.id === target.id && def.targetShock !== undefined) e += def.targetShock * sevScale;
    if (Math.abs(e) > 0.05) exp[d.id] = e;
  }
  for (const d of CATALOG) {
    if (d.cls !== 'index' || !d.constituents) continue;
    let e = 0; for (const c of d.constituents) e += (exp[c.id] ?? 0) * c.w;
    if (Math.abs(e) > 0.03) exp[d.id] = e;
  }
  const ranked = Object.entries(exp).filter(([id]) => market.assets[id].status === 'ACTIVE').sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  res.item.affected = ranked.map(([id, e]) => { affectedIds.add(id); res.item.priceAtPublish[id] = market.assets[id].price; return { assetId: id, expected: Math.round(e * 100) / 100 }; });
  res.item.breaking = true;
  res.item.severity = sev;
  res.item.sentiment = Math.max(-1, Math.min(1, ((exp['CLINT100'] ?? 0) + (exp['BTC/USD'] ?? 0) * 0.3) * 0.25));
  res.item.resolveAt = w.t + Math.max(4 * 3600, durMin * 30);
  w.addNews(res);

  for (const id of affectedIds) {
    const a = market.assets[id];
    a.volBoost = Math.min(4, a.volBoost + 0.25 * sev);
    a.spreadBoost = Math.min(8, a.spreadBoost + 0.5 * sev);
    if (Math.abs(exp[id]) > 0.5) a.sentiment = Math.max(-1, Math.min(1, a.sentiment + Math.sign(exp[id]) * 0.12 * sev));
  }
  def.extra?.({ market, rng, t: w.t, sev, target: target?.id });

  // --- recovery pattern ---
  const pattern = rng.weighted(Object.keys(def.recovery) as RecoveryPattern[], (p) => def.recovery[p]);
  const mid = w.t + durMin * 60 * 0.5;
  const end = w.t + durMin * 60;
  const sched = (t: number, mult: number, tau: number) => {
    for (const k in def.shocks) market.delayed.push({ t, f: k as FactorId, mag: (def.shocks[k as FactorId] as number) * sevScale * 0.01 * mult, depth: 2, tau });
    if (target && def.targetShock !== undefined) market.delayedAsset = [...(market.delayedAsset ?? []), { t, id: target.id, mag: def.targetShock * sevScale * 0.01 * mult, tau }];
  };
  if (pattern === 'V') sched(mid, -0.75, durMin * 0.3);
  else if (pattern === 'SLOW') { sched(mid, -0.35, durMin * 0.6); sched(end, -0.3, durMin * 0.8); }
  else if (pattern === 'CONTINUE') sched(mid, 0.45, durMin * 0.5);
  else { sched(end, -0.15, durMin * 0.4); }

  const ev: ActiveEvent = { id: `E${++EVENT_SEQ}`, name: def.name, startT: w.t, endT: end, severity: sev, affected: Array.from(affectedIds), pattern, newsId: res.item.id };
  w.active.push(ev);
  if (w.active.length > 30) w.active.shift();
  return ev;
}

/** Called every game-hour (or fraction). Event probabilities are per game-day, scaled by difficulty. */
export function rollEvents(w: EventWorld, dtDays: number): void {
  const { rng } = w;
  for (const def of WORLD_EVENTS) {
    const p = def.prob * w.diffEvent * dtDays * 0.6;
    if (rng.next() < p) triggerEvent(w, def);
  }
  // clean expired
  for (let i = w.active.length - 1; i >= 0; i--) if (w.active[i].endT < w.t - DAY * 2) w.active.splice(i, 1);
}

// ---------------------------------------------------------------------------------------------
// CRASH / BUBBLE / RECOVERY
// ---------------------------------------------------------------------------------------------
export function crashHazardPerDay(w: EventWorld): number {
  const eco = w.eco;
  if (w.day < 6 || w.day < eco.crashCooldownUntil) return 0;
  const base = 0.0013;                                     // ~ 0.5 per game-year
  const bubbleAdd = eco.bubble && eco.bubble.active ? 0.0022 * eco.bubble.size : 0;
  const greed = Math.max(0, eco.sentiment - 0.45) * 0.002;
  const rates = Math.max(0, eco.rates.USD - 5) * 0.0008;
  return (base + bubbleAdd + greed + rates) * w.diffCrash * (1 + w.chaos * 0.4);
}

export interface CrashPlan { stocks: number; crypto: number; oil: number; gold: number }

export function triggerCrash(w: EventWorld, opts: { force?: boolean; scale?: number } = {}): void {
  const { rng, market, eco } = w;
  const scale = opts.scale ?? rng.range(0.8, 1.25);
  const plan: CrashPlan = { stocks: -0.12 * scale, crypto: -0.18 * scale, oil: -0.09 * scale, gold: 0.05 * scale };
  const t = w.t;
  // Stocks: RISK factor plus sector factors; crypto: CRYPTO factor; oil: OIL factor; gold via GEO (safe haven) + explicit shock
  shockFactor(market, rng, t, 'RISK', plan.stocks * 0.75, 1080);
  for (const f of ['S_TECH', 'S_AI', 'S_GAMING', 'S_AUTO', 'S_RETAIL', 'S_BANKING'] as FactorId[]) shockFactor(market, rng, t, f, plan.stocks * 0.4, 900, 2);
  shockFactor(market, rng, t, 'CRYPTO', plan.crypto * 0.7, 900);
  shockFactor(market, rng, t, 'OIL', plan.oil * 0.9, 1200, 2);
  shockFactor(market, rng, t, 'GEO', 0.02 * scale, 1200);
  shockAsset(market, 'GOLD/USD', plan.gold, 1200);
  shockAsset(market, 'T10Y', 0.012 * scale, 900);
  shockAsset(market, 'T30Y', 0.02 * scale, 900);
  setAllRegimes(market, rng, 'PANIC', w.day, rng.range(1.1, 2.6));
  for (const d of CATALOG) {
    const a = market.assets[d.id];
    if (a.status === 'PRE_IPO' || a.status === 'DELISTED') continue;
    a.volBoost = Math.min(4, a.volBoost + 2.2);
    a.spreadBoost += 4;
    a.sentiment = Math.max(-1, a.sentiment - 0.6);
    a.supplyDemand -= 0.8;
  }
  eco.sentiment = -0.85;
  eco.crashCooldownUntil = w.day + 45;
  if (eco.bubble) { eco.bubble.phase = 'BURST'; eco.bubble.active = false; }
  const tpl = eventTpl(WORLD_EVENTS[0]);
  const res = publishNews(w, { ...tpl, category: 'GLOBAL MARKET', dir: -1 }, {
    sev: 5, sign: -1, reliability: 'OFFICIAL', overrideHeadline: 'GLOBAL MARKET PANIC: stocks, crypto and oil plunge as selling accelerates',
    overrideBody: `Stocks ${(plan.stocks * 100).toFixed(0)}%, Crypto ${(plan.crypto * 100).toFixed(0)}%, Oil ${(plan.oil * 100).toFixed(0)}%, Gold +${(plan.gold * 100).toFixed(0)}%. Liquidity is thin and spreads are wide.`, noImpact: true,
  });
  res.item.breaking = true; res.item.category = 'GLOBAL MARKET';
  const wanted = ['CLINT100', 'GLOBAL500', 'CRYPTOIDX', 'BTC/USD', 'OIL/USD', 'GOLD/USD', 'NEXA', 'NOVM'];
  res.item.affected = wanted.map((id) => { res.item.priceAtPublish[id] = market.assets[id].price; const e = id === 'GOLD/USD' ? plan.gold * 100 : id.includes('BTC') || id === 'CRYPTOIDX' ? plan.crypto * 100 : id === 'OIL/USD' ? plan.oil * 100 : plan.stocks * 100; return { assetId: id, expected: Math.round(e * 10) / 10 }; });
  res.item.resolveAt = w.t + 2 * DAY;
  w.addNews(res);
  w.active.push({ id: `E${++EVENT_SEQ}`, name: 'GLOBAL MARKET PANIC', startT: t, endT: t + 2 * DAY, severity: 5, affected: wanted, pattern: 'V', newsId: res.item.id });

  // --- recovery path: continue falling / sideways / slow recovery / V-shaped ---
  const path = rng.weighted(['V', 'SLOW', 'SIDEWAYS', 'CONTINUE'] as RecoveryPattern[], (p) => (p === 'V' ? 2.2 : p === 'SLOW' ? 3.2 : p === 'SIDEWAYS' ? 2 : 1.6));
  const panicEnd = t + 1.5 * DAY;
  market.pendingRecovery = { t: panicEnd, path, scale };
}

export function applyPendingRecovery(w: EventWorld): void {
  const m = w.market;
  const pr = m.pendingRecovery;
  if (!pr || w.t < pr.t) return;
  m.pendingRecovery = undefined;
  const { rng } = w;
  const next: RegimeId = pr.path === 'V' ? 'RECOVERY' : pr.path === 'SLOW' ? 'RECOVERY' : pr.path === 'SIDEWAYS' ? 'ACCUMULATION' : 'BEAR';
  for (const g of Object.keys(m.regimes) as (keyof typeof m.regimes)[]) setRegime(m.regimes[g], next, rng, w.day, 1, pr.path === 'V' ? rng.range(3, 6) : rng.range(6, 14));
  if (pr.path === 'V') { shockFactor(m, rng, w.t, 'RISK', 0.07 * pr.scale, 900); shockFactor(m, rng, w.t, 'CRYPTO', 0.1 * pr.scale, 900); }
  else if (pr.path === 'SLOW') { shockFactor(m, rng, w.t, 'RISK', 0.04 * pr.scale, 4000); shockFactor(m, rng, w.t, 'CRYPTO', 0.05 * pr.scale, 4000); }
  else if (pr.path === 'CONTINUE') { shockFactor(m, rng, w.t, 'RISK', -0.035 * pr.scale, 1800); shockFactor(m, rng, w.t, 'CRYPTO', -0.05 * pr.scale, 1800); }
  const msg = { V: 'V-shaped rebound: dip buyers return in force', SLOW: 'Markets stabilise; a slow recovery begins', SIDEWAYS: 'Markets stop falling but stay range-bound', CONTINUE: 'Selling resumes as fresh worries emerge after the crash' }[pr.path];
  w.addNews({ item: { id: `N-rec-${Math.floor(w.t)}`, t: w.t, day: dayIndexOf(w.t), headline: msg, body: 'After the panic, investors reassess valuations and risk.', category: 'GLOBAL MARKET', sentiment: pr.path === 'CONTINUE' ? -0.4 : 0.4, severity: 3, reliability: 'CONFIRMED', breaking: false, affected: [], priceAtPublish: {}, resolveAt: w.t, resolved: true, templateId: 'recovery', tags: ['GLOBAL MARKET'] }, followups: [] });
}

// --- Bubble: a boom that may or may not burst ---
export function maybeStartBubble(w: EventWorld): void {
  const eco = w.eco;
  if (eco.bubble && eco.bubble.active) return;
  if (w.day < 12 || w.day < eco.crashCooldownUntil - 20) return;
  const p = 0.006 * w.diffEvent;
  if (!w.rng.chance(p)) return;
  const group = w.rng.weighted(['AI', 'CRYPTO', 'TECH', 'GAMING'], (g) => (g === 'AI' ? 3 : g === 'CRYPTO' ? 3 : 2));
  eco.bubble = { active: true, group, startDay: w.day, size: 0.2, burstAt: w.rng.range(1.5, 3.4), phase: 'BUILD' };
  const label = ({ AI: 'AI', CRYPTO: 'crypto', TECH: 'tech', GAMING: 'gaming' } as Record<string, string>)[group] ?? group;
  const h = `${label.toUpperCase()} MANIA: prices soar as retail investors pile in`;
  const res = publishNews(w, { ...eventTpl(WORLD_EVENTS[7]), category: group === 'CRYPTO' ? 'CRYPTO' : 'TECHNOLOGY', dir: 1 }, { sev: 3, sign: 1, reliability: 'CONFIRMED', overrideHeadline: h, overrideBody: 'Valuations are stretching fast. Boom or bubble?', noImpact: true });
  w.addNews(res);
}

export function bubbleFactor(group: string): FactorId {
  return group === 'CRYPTO' ? 'CRYPTO' : group === 'AI' ? 'S_AI' : group === 'GAMING' ? 'S_GAMING' : 'S_TECH';
}

/** Daily bubble update: builds parabolic drift; may soften, correct or burst — never guaranteed to crash at the peak. */
export function updateBubbleDaily(w: EventWorld): void {
  const b = w.eco.bubble;
  if (!b || !b.active) return;
  const f = bubbleFactor(b.group);
  const fs = w.market.factors[f];
  const age = w.day - b.startDay;
  b.size = Math.min(3.5, b.size + 0.11 + b.size * 0.05 + w.rng.range(-0.02, 0.04));
  fs.drift = 1.2 + b.size * 0.9;                                  // parabolic pressure, in sigma per day
  if (b.size > 1.5 && b.phase === 'BUILD') b.phase = 'PEAK';
  const hazard = Math.max(0, (b.size - 1.1) * 0.09) + (age > 30 ? 0.03 : 0);
  if (b.size >= b.burstAt || w.rng.chance(hazard)) {
    fs.drift = 0;
    const soft = w.rng.chance(0.3);
    b.phase = 'BURST'; b.active = false;
    const mag = -(soft ? 0.08 : 0.2) * Math.min(2, b.size);
    shockFactor(w.market, w.rng, w.t, f, mag, 2400);
    if (b.group !== 'CRYPTO') shockFactor(w.market, w.rng, w.t, 'RISK', mag * 0.25, 1500);
    w.addNews(publishNews(w, { ...eventTpl(WORLD_EVENTS[0]), category: b.group === 'CRYPTO' ? 'CRYPTO' : 'TECHNOLOGY', dir: -1 }, { sev: soft ? 3 : 4, sign: -1, reliability: 'CONFIRMED', overrideHeadline: soft ? `${b.group} boom cools as valuations reset` : `${b.group} bubble bursts: sharp sell-off wipes out weeks of gains`, overrideBody: soft ? 'Prices correct but remain well above pre-boom levels.' : 'Investors rush for the exits after a parabolic run.', noImpact: true }));
  } else if (age > 45) { fs.drift *= 0.9; }
}

export { NEWS_MAP, CATALOG_MAP };
export function dayOfT(t: number): number { return dayIndexOf(t); }
