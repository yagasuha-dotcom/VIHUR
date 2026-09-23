import type { AssetDef, AssetState, FactorId, FactorState, Impulse, RegimeGroup, RegimeId, RegimeState } from '@/types';
import { CATALOG, FACTOR_LINKS, FACTORS, CATALOG_MAP } from './catalog';
import { Rng } from './rng';
import { emptyCandles, pushGapTick, pushTick, rescaleCandles } from './candles';
import { REGIMES, advanceRegime, newRegime } from './regimes';
import { DAY, dayIndexOf, isOpenFor, marketHours, type MarketHours } from './time';
import type { DifficultyCfg } from './difficulty';
import { CALIB } from './calibration';

export interface DelayedShock { t: number; f: FactorId; mag: number; depth: number; tau: number }

export const REGIME_OF_CLASS: Record<string, RegimeGroup> = {
  stock: 'EQUITY', index: 'EQUITY', crypto: 'CRYPTO', forex: 'FOREX', commodity: 'COMMODITY', bond: 'FOREX',
};

const MAX_TICK_RET = 0.08;
const REGIME_GROUP_LIST: RegimeGroup[] = ['GLOBAL', 'EQUITY', 'CRYPTO', 'FOREX', 'COMMODITY'];
const INDEX_DEFS = CATALOG.filter((d) => d.cls === 'index' && d.constituents);
const NON_INDEX = CATALOG.filter((d) => d.cls !== 'index');
const FACTOR_LIST = FACTORS.map((f) => ({ id: f.id, kind: f.id === 'RISK' ? 1 : f.id === 'CRYPTO' ? 2 : f.id.startsWith('S_') ? 3 : 0 }));
const FLAT: Record<string, { keys: FactorId[]; w: number[] }> = {};
for (const d of CATALOG) {
  const keys = Object.keys(d.loadings) as FactorId[];
  FLAT[d.id] = { keys, w: keys.map((k) => d.loadings[k] as number) };
}

export interface MarketState {
  assets: Record<string, AssetState>;
  factors: Record<FactorId, FactorState>;
  regimes: Record<RegimeGroup, RegimeState>;
  delayed: DelayedShock[];
  eventStress: Record<string, number>;   // assetId -> 0..1 stress from calendar proximity
  lastLoadNoiseT: number;
  regimeDay: number;
  regimeAcc: number;
  idxAcc: number;
  delayedAsset?: { t: number; id: string; mag: number; tau: number }[];
  pendingRecovery?: { t: number; path: 'V' | 'SLOW' | 'SIDEWAYS' | 'CONTINUE'; scale: number };
}

export function idioVolOf(d: AssetDef): number {
  if (d.cls === 'index') return 0;
  const cal = CALIB[d.id];
  if (cal) return cal.idio;
  let sys = 0;
  for (const f of FACTORS) {
    const l = d.loadings[f.id];
    if (l) sys += (l * f.vol) ** 2;
  }
  const idio2 = d.dailyVol ** 2 - sys;
  return Math.sqrt(Math.max(idio2, (d.dailyVol * 0.4) ** 2));
}

export function createMarket(rng: Rng, diff: DifficultyCfg, startDay: number): MarketState {
  const assets: Record<string, AssetState> = {};
  for (const d of CATALOG) {
    assets[d.id] = {
      id: d.id, price: d.price0, fair: d.price0, dayOpen: d.price0, prevClose: d.price0, trend: rng.gauss() * 0.15,
      momentum: 0, ewVar: (d.dailyVol * d.dailyVol) / 8640, sentiment: rng.gauss() * 0.1, newsMemory: 0, supplyDemand: 0,
      emaSlow: d.price0, emaFast: d.price0, volBoost: 0, spreadBoost: 0, spread: d.baseSpread, liquidityNow: d.liquidity, acc: 0,
      open: true, status: d.tags.includes('ipo') ? 'PRE_IPO' : 'ACTIVE', loadNoise: {}, impulses: [], candles: emptyCandles(),
      idioVol: idioVolOf(d), volume24: 0, lastRet: 0, networkActivity: 50 + rng.gauss() * 8, bubble: 0,
    };
    for (const k of Object.keys(d.loadings)) assets[d.id].loadNoise[k as FactorId] = rng.gauss() * 0.2;
  }
  const factors = {} as Record<FactorId, FactorState>;
  for (const f of FACTORS) factors[f.id] = { id: f.id, level: 0, ret: 0, vol: f.vol, theta: f.theta, drift: 0, impulses: [] };
  const regimes = {} as Record<RegimeGroup, RegimeState>;
  regimes.GLOBAL = newRegime(rng, startDay, undefined, diff.regimeDur);
  for (const g of ['EQUITY', 'CRYPTO', 'FOREX', 'COMMODITY'] as RegimeGroup[]) regimes[g] = newRegime(rng, startDay, undefined, diff.regimeDur);
  return { assets, factors, regimes, delayed: [], eventStress: {}, lastLoadNoiseT: 0, regimeDay: startDay, regimeAcc: 0, idxAcc: 0 };
}

// ---------------------------------------------------------------------------------------------
// Impulses: decaying pushes with a time constant. total effect = `left` (log-return) spread over ~3*tau.
// ---------------------------------------------------------------------------------------------
export function addImpulse(list: Impulse[], total: number, tau: number): void {
  if (!isFinite(total) || Math.abs(total) < 1e-9) return;
  list.push({ left: total, tau });
  if (list.length > 40) list.shift();
}
function drainImpulses(list: Impulse[], dt: number): number {
  let out = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const im = list[i];
    const frac = 1 - Math.exp(-dt / im.tau);
    const part = im.left * frac;
    out += part;
    im.left -= part;
    if (Math.abs(im.left) < 1e-7) list.splice(i, 1);
  }
  return out;
}

/**
 * Apply a factor shock (in log-return units). Realised as fast (jump-like) + slow (drift) parts, then cascaded through the
 * economic relationship network probabilistically with delays.
 */
export function shockFactor(m: MarketState, rng: Rng, now: number, f: FactorId, mag: number, horizonMin = 120, depth = 0): void {
  const fs = m.factors[f];
  const fastShare = 0.55;
  addImpulse(fs.impulses, mag * fastShare, Math.max(45, horizonMin * 60 * 0.06));
  addImpulse(fs.impulses, mag * (1 - fastShare), Math.max(300, horizonMin * 60 * 0.4));
  if (depth >= 2 || Math.abs(mag) < 0.0008) return;
  for (const link of FACTOR_LINKS) {
    if (link.from !== f) continue;
    if (!rng.chance(link.rel)) continue;
    const delay = rng.range(link.delayMin[0], link.delayMin[1]) * 60;
    m.delayed.push({ t: now + delay, f: link.to, mag: mag * link.w * rng.range(0.7, 1.3), depth: depth + 1, tau: horizonMin });
  }
}

export function shockAsset(m: MarketState, id: string, total: number, horizonMin = 90): void {
  const a = m.assets[id];
  if (!a || a.status !== 'ACTIVE') return;
  addImpulse(a.impulses, total * 0.55, Math.max(40, horizonMin * 60 * 0.06));
  addImpulse(a.impulses, total * 0.45, Math.max(300, horizonMin * 60 * 0.4));
}

// ---------------------------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------------------------
export interface StepCtx {
  t: number;
  dt: number;                // seconds advanced
  rng: Rng;
  diff: DifficultyCfg;
  mh: MarketHours;
  sentiment: number;         // global sentiment (-1..1)
  warm: boolean;
  onFlurry?: (assetId: string, ret: number) => void;
}

function sessionVolMult(cls: string, mh: MarketHours, hour: number): number {
  if (cls === 'crypto') return mh.weekend ? 0.72 : hour >= 9 && hour < 17 ? 1.1 : 0.9;
  if (cls === 'forex') return mh.session === 'ASIA' ? 0.75 : mh.session === 'EUROPE' ? 1.05 : mh.session === 'US' ? 1.2 : 0.8;
  if (cls === 'stock') return hour < 10.3 || hour > 15.2 ? 1.3 : hour > 11.5 && hour < 14 ? 0.75 : 1;
  return 1;
}

export function stepMarket(m: MarketState, ctx: StepCtx): void {
  const { t, dt, rng, diff, mh } = ctx;
  const dtDays = dt / DAY;
  const hour = ((t / 3600) % 24 + 24) % 24;
  const sqrtDt = Math.sqrt(dtDays);

  // --- regimes -----------------------------------------------------------------------------
  const day = dayIndexOf(t);
  m.regimeDay = day;
  m.regimeAcc += dt;
  if (m.regimeAcc >= 60) {
    const adv = m.regimeAcc / DAY;
    m.regimeAcc = 0;
    for (let gi = 0; gi < REGIME_GROUP_LIST.length; gi++) {
      advanceRegime(m.regimes[REGIME_GROUP_LIST[gi]], adv, rng, day, { sentiment: ctx.sentiment, bubble: 0, durMult: diff.regimeDur, chaos: diff.chaos });
    }
  }
  const gReg = REGIMES[m.regimes.GLOBAL.current];

  // --- delayed cascaded shocks --------------------------------------------------------------
  if (m.delayed.length) {
    for (let i = m.delayed.length - 1; i >= 0; i--) {
      const d = m.delayed[i];
      if (t >= d.t) { m.delayed.splice(i, 1); shockFactor(m, rng, t, d.f, d.mag, d.tau, d.depth); }
    }
  }

  if (m.delayedAsset && m.delayedAsset.length) {
    for (let i = m.delayedAsset.length - 1; i >= 0; i--) {
      const d = m.delayedAsset[i];
      if (t >= d.t) { m.delayedAsset.splice(i, 1); shockAsset(m, d.id, d.mag, d.tau); }
    }
  }

  // --- factors ---------------------------------------------------------------------------------
  const cryptoRp = REGIMES[m.regimes.CRYPTO.current];
  const eqRp = REGIMES[m.regimes.EQUITY.current];
  const riskDrift = gReg.drift * 0.6 + gReg.sentBias * 0.15;
  for (let fi = 0; fi < FACTOR_LIST.length; fi++) {
    const fl = FACTOR_LIST[fi];
    const fs = m.factors[fl.id];
    let regDrift = fs.drift;
    if (fl.kind === 1) regDrift += riskDrift * 0.35;
    else if (fl.kind === 2) regDrift += cryptoRp.drift * 0.3;
    else if (fl.kind === 3) regDrift += eqRp.drift * 0.12;
    const volM = (fl.kind === 2 ? cryptoRp.volMult : gReg.volMult) * diff.vol;
    const noise = fs.vol * volM * sqrtDt * rng.fat();
    const imp = fs.impulses.length ? drainImpulses(fs.impulses, dt) : 0;
    fs.ret = noise + imp - fs.theta * fs.level * dtDays + regDrift * fs.vol * dtDays;
    fs.level += fs.ret;
    if (fs.level > 0.3) fs.level = 0.3; else if (fs.level < -0.3) fs.level = -0.3;
  }

  // --- refresh time-varying loadings (imperfect correlation) ------------------------------------
  if (t - m.lastLoadNoiseT > 3600) {
    m.lastLoadNoiseT = t;
    const drift = 0.06 + diff.chaos * 0.06;
    for (const d of CATALOG) {
      const a = m.assets[d.id];
      for (const k in a.loadNoise) {
        const key = k as FactorId;
        a.loadNoise[key] = (a.loadNoise[key] ?? 0) * 0.985 + rng.gauss() * drift;
      }
    }
  }

  // --- assets -------------------------------------------------------------------------------------
  for (let i = 0; i < NON_INDEX.length; i++) {
    const d = NON_INDEX[i];
    const a = m.assets[d.id];
    if (a.status === 'PRE_IPO' || a.status === 'DELISTED') continue;
    stepAsset(m, d, a, ctx, dtDays, sqrtDt, hour);
  }

  // --- indices from constituents --------------------------------------------------------------------
  m.idxAcc += dt;
  const slow = m.idxAcc >= 60;
  if (slow) m.idxAcc = 0;
  for (let ii = 0; ii < INDEX_DEFS.length; ii++) {
    const d = INDEX_DEFS[ii];
    const cons = d.constituents!;
    const a = m.assets[d.id];
    const open = isOpenFor('index', d.id, mh);
    let acc = 0, wsum = 0, sSum = 0, spr = 0, liq = 0, cnt = 0;
    for (let k = 0; k < cons.length; k++) {
      const c = cons[k];
      const ca = m.assets[c.id];
      if (!ca || ca.status === 'PRE_IPO') continue;
      const ref = ca.refPrice ?? CATALOG_MAP[c.id].price0;
      acc += c.w * (ca.status === 'DELISTED' ? 0.02 : ca.price / ref);
      wsum += c.w;
      if (slow) { sSum += ca.sentiment; spr += ca.spread; liq += ca.liquidityNow; cnt++; }
    }
    const base = d.indexBase ?? d.price0;
    const price = wsum > 0 ? base * (acc / wsum) : a.price;
    const wasOpen = a.open;
    a.open = open;
    if (open) {
      const ret = Math.log(price / a.price);
      a.lastRet = ret;
      a.price = price;
      const vol = (d.dailyVolume / 1440) * (dt / 60) * (0.6 + Math.min(3, Math.abs(ret) / 0.0004));
      if (!wasOpen) pushGapTick(a, t, price, vol);
      else {
        const w = ctx.dt > 45 ? Math.abs(rng.gauss()) * 0.0004 : 0;
        pushTick(a, t, price, vol, w, w);
      }
      a.emaFast += (price - a.emaFast) * (1 - Math.exp(-dt / 3600));
      a.emaSlow += (price - a.emaSlow) * (1 - Math.exp(-dt / 172800));
    } else {
      a.lastRet = 0;
    }
    if (slow && cnt) {
      a.sentiment = sSum / cnt;
      a.spread = Math.max(d.baseSpread, (spr / cnt) * 0.35) * (open ? 1 : 6);
      a.liquidityNow = liq / cnt;
    }
  }
}

function sysScaleOf(id: string, m: MarketState): number {
  const o = (m as unknown as { __sysScale?: Record<string, number> }).__sysScale;
  if (o !== undefined && o[id] !== undefined) return o[id];
  const c = CALIB[id];
  return c !== undefined ? c.sys : 1;
}

function stepAsset(m: MarketState, d: AssetDef, a: AssetState, ctx: StepCtx, dtDays: number, sqrtDt: number, hour: number): void {
  const { t, dt, rng, diff, mh } = ctx;
  const grp = REGIME_OF_CLASS[d.cls] ?? 'EQUITY';
  const rp = REGIMES[m.regimes[grp].current];
  const gp = REGIMES[m.regimes.GLOBAL.current];
  const open = isOpenFor(d.cls, d.id, mh) && a.status !== 'HALTED';

  // systematic part via factor loadings (with time-varying noise on each loading)
  let sys = 0;
  const fl = FLAT[d.id];
  for (let q = 0; q < fl.keys.length; q++) {
    const key = fl.keys[q];
    let nz = a.loadNoise[key] ?? 0;
    if (nz > 0.9) nz = 0.9; else if (nz < -0.9) nz = -0.9;
    sys += fl.w[q] * (1 + nz) * m.factors[key].ret;
  }
  sys *= sysScaleOf(d.id, m);

  // market-memory volatility (GARCH-like): current vol blends baseline and recent realised variance
  const baseTickVar = (d.dailyVol * d.dailyVol) * dtDays;
  const memMult = Math.min(2.6, Math.max(0.6, Math.sqrt(a.ewVar / Math.max(1e-14, baseTickVar))));
  const stress = m.eventStress[d.id] ?? 0;
  const volMult = rp.volMult * (0.5 * gp.volMult + 0.5) * diff.vol * (1 + a.volBoost + stress * 0.9) * (0.6 + 0.4 * memMult) * sessionVolMult(d.cls, mh, hour);
  const closedDamp = open ? 1 : 0.4;
  const idio = a.idioVol * volMult * sqrtDt * rng.fat() * closedDamp;

  // drift components (all expressed in sigma-per-day units)
  const sigD = d.dailyVol;
  const regimeDrift = rp.drift * sigD * dtDays * 0.4 * (d.cls === 'forex' ? 0.3 : d.cls === 'bond' ? 0.3 : 1) * (d.cls === 'crypto' && grp !== 'CRYPTO' ? 1 : 1);
  const trendDrift = a.trend * sigD * dtDays;
  const logDev = Math.log(a.price / a.fair);
  const meanRev = -d.meanRev * rp.mrMult * logDev * dtDays;
  const z = Math.log(a.price / a.emaSlow) / (sigD * 3);
  const over = Math.abs(z) > 1.5 ? -Math.sign(z) * (Math.abs(z) - 1.5) * 0.4 * sigD * dtDays * 3 : 0;
  const momTerm = 0.08 * d.momStrength * rp.momMult * a.momentum;
  const sentTerm = a.sentiment * sigD * 0.05 * dtDays;
  const sdTerm = a.supplyDemand * sigD * 0.15 * dtDays * 8;
  const imp = drainImpulses(a.impulses, dt);
  // rare idiosyncratic shock: ~1 per 6 game-days on average (rate is per day, not per tick)
  const jump = rng.next() < (dtDays / 6) * (1 + diff.chaos * 0.8) ? rng.gauss() * sigD * 0.9 : 0;

  let r = sys + idio + regimeDrift + trendDrift + meanRev + over + momTerm + sentTerm + sdTerm + imp + jump;
  if (!isFinite(r)) r = 0;
  if (r > MAX_TICK_RET) r = MAX_TICK_RET; else if (r < -MAX_TICK_RET) r = -MAX_TICK_RET;

  // --- memory updates ---------------------------------------------------------------------------
  const aM = 1 - Math.exp(-dt / 10800);              // momentum half-life ~ 2h (tau 3h)
  a.momentum += (r - a.momentum) * aM * 1.0;
  const aV = 1 - Math.exp(-dt / 21600);
  a.ewVar += (r * r - a.ewVar) * aV;
  a.trend += (-a.trend * 0.12 * dtDays * 1.5) + rng.gauss() * 0.9 * sqrtDt;
  if (a.trend > 1.4) a.trend = 1.4; else if (a.trend < -1.4) a.trend = -1.4;
  a.sentiment += (rp.sentBias * 0.4 - a.sentiment) * (dtDays / 2) * 0.35 + Math.sign(a.momentum) * Math.min(1, Math.abs(a.momentum) / (baseTickVar ** 0.5 || 1)) * 0.01 * dtDays * 5;
  if (a.sentiment > 1) a.sentiment = 1; else if (a.sentiment < -1) a.sentiment = -1;
  a.newsMemory *= Math.exp(-dtDays / 1.5);
  a.supplyDemand *= Math.exp(-dtDays / 0.15);
  a.volBoost *= Math.exp(-dt / 5400);
  a.spreadBoost *= Math.exp(-dt / 3600);
  a.fair *= Math.exp(rng.gauss() * sigD * 0.02 * sqrtDt + (d.cls === 'crypto' ? 0.0 : 0));
  // crypto fair anchor follows price slowly (weak fundamentals), forex/commodity fair follows too but slower
  if (d.cls === 'crypto') a.fair += (a.price - a.fair) * (dtDays / 25);
  else if (d.cls === 'forex' || d.cls === 'commodity' || d.cls === 'bond') a.fair += (a.price - a.fair) * (dtDays / 60);
  a.emaFast += (a.price - a.emaFast) * (1 - Math.exp(-dt / 3600));
  a.emaSlow += (a.price - a.emaSlow) * (1 - Math.exp(-dt / 172800));
  if (d.cls === 'crypto') a.networkActivity += (50 + a.sentiment * 25 + Math.log(a.price / a.fair) * 60 - a.networkActivity) * dtDays * 0.5 + rng.gauss() * 1.2 * sqrtDt;
  if (ctx.onFlurry && Math.abs(r) > d.dailyVol * 0.1) ctx.onFlurry(d.id, r);

  // --- liquidity & spread --------------------------------------------------------------------------
  const hourFactor = d.cls === 'forex' ? (mh.session === 'ASIA' ? 0.85 : 1) : d.cls === 'crypto' && mh.weekend ? 0.75 : 1;
  const stressLiq = 1 - Math.min(0.75, stress * 0.6 + a.volBoost * 0.25 + Math.max(0, gp.volMult - 1) * 0.12);
  a.liquidityNow = Math.max(0.05, d.liquidity * hourFactor * stressLiq * (a.status === 'HALTED' ? 0.2 : 1));
  const volStress = Math.max(0, volMult - 1);
  const sMult = (1 + volStress * 0.9 + stress * 3 + a.spreadBoost) * rp.spreadMult * diff.spread / Math.max(0.35, a.liquidityNow / d.liquidity);
  a.spread = d.baseSpread * Math.min(60, sMult) * (open ? 1 : 12);

  if (!open) {
    a.acc += r;
    a.open = false;
    a.lastRet = 0;
    return;
  }

  let gap = false;
  if (!a.open) {
    // market just opened: apply hidden accumulated return as an opening gap
    const g = a.acc * (0.82 + rng.range(0, 0.3)) ;
    a.acc = 0;
    a.price *= Math.exp(Math.max(-0.35, Math.min(0.35, g)));
    gap = true;
  }
  a.open = true;
  a.price *= Math.exp(r);
  a.lastRet = r;

  // --- tick -> candle ---------------------------------------------------------------------------------
  const act = 0.5 + 1.6 * Math.min(4, Math.abs(r) / Math.max(1e-9, sigD * Math.sqrt(dtDays)));
  const sess = d.cls === 'crypto' ? (mh.weekend ? 0.6 : 1) : 1;
  const vol = (d.dailyVolume / 1440) * (dt / 60) * act * (1 + a.volBoost * 2) * sess * (0.8 + rng.next() * 0.4);
  a.volume24 = a.volume24 * (1 - dt / DAY) + vol;
  if (gap) pushGapTick(a, t, a.price, vol);
  else {
    const wick = dt > 45 ? Math.abs(rng.gauss()) * sigD * Math.sqrt(dt / DAY) * 0.6 : 0;
    pushTick(a, t, a.price, vol, wick, dt > 45 ? Math.abs(rng.gauss()) * sigD * Math.sqrt(dt / DAY) * 0.6 : 0);
  }
}

// ---------------------------------------------------------------------------------------------
// helpers used by the world
// ---------------------------------------------------------------------------------------------
export function rescaleAsset(a: AssetState, k: number): void {
  a.price *= k; a.fair *= k; a.dayOpen *= k; a.prevClose *= k; a.emaFast *= k; a.emaSlow *= k;
  rescaleCandles(a, k);
}

export function bid(a: AssetState): number { return a.price * (1 - a.spread / 2); }
export function ask(a: AssetState): number { return a.price * (1 + a.spread / 2); }

export function setAllRegimes(m: MarketState, rng: Rng, id: RegimeId, day: number, days?: number): void {
  for (const g of Object.keys(m.regimes) as RegimeGroup[]) {
    const st = m.regimes[g];
    st.current = id; st.since = day;
    st.remaining = days ?? rng.range(REGIMES[id].days[0], REGIMES[id].days[1]);
    st.history.push({ regime: id, day });
  }
}
export function marketHoursAt(t: number): MarketHours { return marketHours(t); }
