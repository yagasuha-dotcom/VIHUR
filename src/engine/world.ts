import type {
  ActiveEvent, AssetState, CalendarEvent, Company, Difficulty, EconomyState, FactorId, NewsItem, RegimeGroup, RegimeId,
} from '@/types';
import { CATALOG, CATALOG_MAP, CURRENCIES, STOCK_SEEDS, IPO_SEEDS, SECTOR_FACTOR } from './catalog';
import { Rng, type RngState } from './rng';
import { DIFFICULTY, type DifficultyCfg } from './difficulty';
import {
  addImpulse, createMarket, marketHoursAt, rescaleAsset, setAllRegimes, shockAsset, shockFactor, stepMarket, type MarketState,
} from './marketEngine';
import { CAL_TEMPLATES, createEconomy, evolveEconomyDaily, impactWeight, makeCalendarEvent, releaseEvent, templatesOnDay } from './economyEngine';
import {
  createCompanies, fairValueOf, ipoOpenPrice, reportEarnings, updateHealthDaily, nextSeasonDay, EARNINGS_CYCLE,
} from './companyEngine';
import {
  getNewsSeq, pickAmbientTemplate, publishNews, resolveNews, scriptedItem, setNewsSeq, type NewsResult, type NewsWorld,
} from './newsEngine';
import { NEWS_MAP } from './newsTemplates';
import {
  applyPendingRecovery, crashHazardPerDay, getEventSeq, maybeStartBubble, rollEvents, setEventSeq, triggerCrash, triggerEvent,
  updateBubbleDaily, WORLD_EVENTS, type EventWorld,
} from './eventEngine';
import { DAY, EPOCH, dayIndexOf, marketHours, secOfDay, tOf, type MarketHours } from './time';
import { REGIMES } from './regimes';
import { emptyCandles, pushGapTick } from './candles';
import { hashString } from './rng';

export const SAVE_VERSION = 1;
export const LIVE_DT = 10;              // game seconds per live tick
export const WARM_START_DAY = -91;

export interface DailyReport {
  day: number;
  sentiment: string;
  sentimentValue: number;
  topGainer: { id: string; pct: number };
  topLoser: { id: string; pct: number };
  majorNews: string;
  regime: RegimeId;
  events: number;
  notes: string[];
}

export interface WorldState {
  version: number;
  seed: number;
  difficulty: Difficulty;
  t: number;
  market: MarketState;
  eco: EconomyState;
  companies: Record<string, Company>;
  news: NewsItem[];
  calendar: CalendarEvent[];
  activeEvents: ActiveEvent[];
  reports: DailyReport[];
  rng: RngState;
  newsSeq: number;
  eventSeq: number;
  nextAmbientT: number;
  nextEventRollT: number;
  nextCrashRollDay: number;
  lastDay: number;
  lastDailyDay: number;
  followups: { templateId: string; t: number; parentId: string }[];
  ipoSubscribed: Record<string, boolean>;
  lastNewsPerAsset: Record<string, number>;
  debtNotes: string[];
  playable: boolean;
}

export type WorldListener = {
  onNews?: (n: NewsItem) => void;
  onEvent?: (e: ActiveEvent) => void;
  onCalendarRelease?: (e: CalendarEvent) => void;
  onDayEnd?: (r: DailyReport) => void;
  onIpo?: (c: Company) => void;
  onDelist?: (c: Company) => void;
  onEarnings?: (c: Company) => void;
  onCrash?: () => void;
  onCompanyAlert?: (c: Company, kind: string) => void;
};

export class World {
  s: WorldState;
  rng: Rng;
  diff: DifficultyCfg;
  listeners: WorldListener = {};
  warm = false;
  private nw: NewsWorld;
  private ew: EventWorld;

  constructor(s: WorldState) {
    this.s = s;
    this.rng = new Rng(1);
    this.rng.setState(s.rng);
    this.diff = DIFFICULTY[s.difficulty];
    setNewsSeq(s.newsSeq);
    setEventSeq(s.eventSeq);
    const self = this;
    this.nw = {
      get market() { return self.s.market; }, get rng() { return self.rng; }, get t() { return self.s.t; },
      get sentiment() { return self.s.eco.sentiment; }, diffVol: this.diff.vol,
      activeCompanyIds: () => self.activeCompanyIds(),
      companyName: (id) => self.s.companies[id]?.name ?? id,
    } as NewsWorld;
    // EventWorld view: live getters (Object.assign would freeze their values at construction time)
    const ew = Object.create(this.nw) as EventWorld;
    Object.defineProperties(ew, {
      eco: { get: () => self.s.eco },
      active: { get: () => self.s.activeEvents },
      day: { get: () => dayIndexOf(self.s.t) },
      market: { get: () => self.s.market },
      rng: { get: () => self.rng },
      t: { get: () => self.s.t },
      sentiment: { get: () => self.s.eco.sentiment },
      diffEvent: { value: this.diff.eventFreq },
      diffCrash: { value: this.diff.crashMult },
      chaos: { value: this.diff.chaos },
      seq: { value: 0 },
      banks: { value: () => Object.values(self.s.companies).filter((c) => c.sector === 'BANKING' && c.status === 'ACTIVE').map((c) => ({ id: c.id, name: c.name })) },
      addNews: { value: (r: NewsResult) => self.addNews(r) },
    });
    this.ew = ew;
  }

  get t(): number { return this.s.t; }
  get day(): number { return dayIndexOf(this.s.t); }
  get mh(): MarketHours { return marketHours(this.s.t); }
  asset(id: string): AssetState { return this.s.market.assets[id]; }
  activeCompanyIds(): string[] {
    return Object.values(this.s.companies).filter((c) => c.status === 'ACTIVE' || c.status === 'WARNING').map((c) => c.id);
  }
  saveRng(): void { this.s.rng = this.rng.getState(); this.s.newsSeq = getNewsSeq(); this.s.eventSeq = getEventSeq(); }

  // -------------------------------------------------------------------------------------------
  static create(seed: number, difficulty: Difficulty): World {
    const rng = new Rng(seed);
    const diff = DIFFICULTY[difficulty];
    const startDay = WARM_START_DAY;
    const s: WorldState = {
      version: SAVE_VERSION, seed, difficulty, t: tOf(startDay), market: createMarket(rng, diff, startDay), eco: createEconomy(rng),
      companies: createCompanies(rng, startDay), news: [], calendar: [], activeEvents: [], reports: [], rng: rng.getState(), newsSeq: 0, eventSeq: 0,
      nextAmbientT: tOf(startDay, 6), nextEventRollT: tOf(startDay, 1), nextCrashRollDay: startDay + 1, lastDay: startDay, lastDailyDay: startDay - 1,
      followups: [], ipoSubscribed: {}, lastNewsPerAsset: {}, debtNotes: [], playable: false,
    };
    const w = new World(s);
    w.initFundamentals();
    return w;
  }

  private initFundamentals(): void {
    const m = this.s.market;
    for (const c of Object.values(this.s.companies)) {
      const a = m.assets[c.assetId];
      a.fair = fairValueOf(c, this.s.eco);
    }
    // bring stocks to their fair value at t0 (prices start at target/fair mix)
    for (const d of CATALOG) if (d.cls === 'stock') m.assets[d.id].fair = m.assets[d.id].price;
  }

  // -------------------------------------------------------------------------------------------
  // WARM-UP: simulate history so charts have candles, fundamentals have reports, news archive exists.
  // -------------------------------------------------------------------------------------------
  async warmup(progress?: (p: number) => void): Promise<void> {
    this.warm = true;
    const endT = tOf(0, 8);
    const total = endT - this.s.t;
    const phaseB = tOf(0, 8) - 8.4 * DAY;
    let sinceYield = 0;
    while (this.s.t < endT) {
      const dt = this.s.t < phaseB ? 900 : 60;
      const step = Math.min(dt, endT - this.s.t);
      this.step(step);
      sinceYield += step / dt;
      if (sinceYield > 400) {
        sinceYield = 0;
        progress?.(1 - (endT - this.s.t) / total);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    this.finishWarmup();
    progress?.(1);
  }

  /** Synchronous variant (Node tests). */
  warmupSync(): void {
    this.warm = true;
    const endT = tOf(0, 8);
    const phaseB = endT - 8.4 * DAY;
    while (this.s.t < endT) { const dt = this.s.t < phaseB ? 900 : 60; this.step(Math.min(dt, endT - this.s.t)); }
    this.finishWarmup();
  }

  private finishWarmup(): void {
    const s = this.s, m = s.market;
    // --- rescale so day-1 prices match the intended launch levels -------------------------------
    for (const d of CATALOG) {
      if (d.cls === 'index') continue;
      const a = m.assets[d.id];
      if (a.status !== 'ACTIVE') continue;
      const k = d.price0 / a.price;
      rescaleAsset(a, k);
      a.refPrice = a.price;
      if (d.cls === 'stock') this.realignCompany(d.id, a);
      else a.fair = a.price;
    }
    for (const d of CATALOG) {
      if (d.cls !== 'index' || !d.constituents) continue;
      const a = m.assets[d.id];
      const idxNow = a.price; // computed with old reference
      const k = d.price0 / idxNow;
      rescaleAsset(a, k);
      a.price = d.price0;
      a.fair = a.price;
    }
    // reference prices for index constituents are now the launch prices
    for (const d of CATALOG) if (d.cls !== 'index') { const a = m.assets[d.id]; if (a.status === 'ACTIVE') a.refPrice = a.price; else a.refPrice = d.price0; }
    for (const d of CATALOG) {
      if (d.cls !== 'stock' && d.cls !== 'crypto' && d.cls !== 'forex' && d.cls !== 'commodity' && d.cls !== 'bond') continue;
      const a = m.assets[d.id];
      if (a.status === 'ACTIVE') { a.dayOpen = a.price; a.prevClose = a.price; a.emaFast = a.price; a.emaSlow = a.price; }
    }
    // --- calm start: no panic/euphoria, neutral sentiment, no leftover shocks ------------------------
    for (const g of Object.keys(m.regimes) as RegimeGroup[]) {
      const r = m.regimes[g];
      if (r.current === 'PANIC' || r.current === 'EUPHORIA' || r.current === 'HIGH_VOL') { r.current = 'SIDEWAYS'; r.remaining = this.rng.range(4, 8); }
      r.remaining = Math.max(r.remaining, 3);
    }
    m.regimes.GLOBAL.current = 'SIDEWAYS'; m.regimes.GLOBAL.remaining = this.rng.range(5, 9);
    s.eco.sentiment = 0; s.eco.crashCooldownUntil = 5; s.eco.bubble = null;
    for (const d of CATALOG) {
      const a = m.assets[d.id];
      a.sentiment = Math.max(-0.25, Math.min(0.25, a.sentiment)); a.volBoost = 0; a.spreadBoost = 0; a.supplyDemand = 0; a.impulses.length = 0; a.acc = 0;
      a.newsMemory = 0;
    }
    for (const f of Object.values(m.factors)) { f.impulses.length = 0; f.drift = 0; f.level = Math.max(-0.05, Math.min(0.05, f.level)); }
    m.delayed.length = 0; m.delayedAsset = []; m.pendingRecovery = undefined; s.activeEvents.length = 0; s.followups.length = 0;
    // pre-game news are dropped; the opening bulletin is scripted
    s.news = []; setNewsSeq(0);
    this.warm = false;
    // reset calendar & schedule from DAY 1
    s.calendar = s.calendar.filter((e) => e.day >= 0);
    s.lastDay = dayIndexOf(s.t) - 1;
    s.lastDailyDay = dayIndexOf(s.t) - 1;
    this.ensureCalendar(0, 6);
    s.nextAmbientT = s.t + 3 * 3600;
    s.nextEventRollT = s.t + 3600;
    s.nextCrashRollDay = 1;
    const opening = scriptedItem(this.nw, "Markets open relatively calm as investors await today's inflation data.", 'US CPI is due at 08:30. Traders are positioned cautiously; liquidity thins into the release.', 'GLOBAL MARKET');
    s.news.push(opening);
    for (const d of CATALOG) { const a = m.assets[d.id]; a.volume24 = d.dailyVolume * 0.5; }
    s.playable = true;
    this.saveRng();
  }

  /** After the price rescale, keep P/E sane: derive EPS from price and the company's baseline multiple. */
  private realignCompany(id: string, a: AssetState): void {
    const c = this.s.companies[id];
    if (!c) return;
    const targetPE = c.pe0 * Math.exp(this.rng.gauss() * 0.1);
    const newEpsQ = a.price / targetPE / 4;
    const k = newEpsQ / c.epsQ;
    c.epsQ = newEpsQ;
    c.revenue *= k; c.netIncome *= k;
    if (c.lastReport) { c.lastReport.epsActual *= k; c.lastReport.epsExpected *= k; c.lastReport.revenue *= k; }
    for (const r of c.reports) { r.epsActual *= k; r.epsExpected *= k; r.revenue *= k; }
    c.margin = c.revenue > 0 ? c.netIncome / c.revenue : c.margin;
    a.fair = fairValueOf(c, this.s.eco) * (0.94 + this.rng.next() * 0.12);
  }

  // -------------------------------------------------------------------------------------------
  // THE STEP
  // -------------------------------------------------------------------------------------------
  step(dt: number = LIVE_DT): void {
    const s = this.s;
    s.t += dt;
    const t = s.t;
    const mh = marketHours(t);
    const day = dayIndexOf(t);

    // day boundary
    if (day !== s.lastDay) { this.onNewDay(day); s.lastDay = day; }

    // calendar: pre-event stress and releases
    this.updateCalendar(t);

    // ipo / earnings timers (checked once a minute)
    this.tickCompanies(t, mh, dt);

    // market
    const cfgSent = s.eco.sentiment;
    stepMarket(s.market, { t, dt, rng: this.rng, diff: this.diff, mh, sentiment: cfgSent, warm: this.warm });

    // sentiment aggregate (slow)
    this.updateSentiment(dt);

    // news and events
    this.runNews(t, dt);
    if (!this.warm || dt >= 60) this.runEvents(t, dt);

    if (s.market.pendingRecovery) applyPendingRecovery(this.ew);

    // resolve news windows
    this.resolveNewsWindows(t);
  }

  private lastSentT = 0;
  private updateSentiment(dt: number): void {
    const s = this.s;
    if (s.t - this.lastSentT < 300) return;
    this.lastSentT = s.t;
    let acc = 0, n = 0;
    for (const d of CATALOG) {
      if (d.cls === 'stock' || d.cls === 'crypto' || d.cls === 'index') {
        const a = s.market.assets[d.id];
        if (a.status === 'ACTIVE') { acc += a.sentiment; n++; }
      }
    }
    const avg = n ? acc / n : 0;
    s.eco.sentiment += (avg * 1.1 - s.eco.sentiment) * (1 - Math.exp(-dt / 21600 * 6));
    s.eco.sentiment = Math.max(-1, Math.min(1, s.eco.sentiment));
    void dt;
  }

  // -------------------------------------------------------------------------------------------
  // Day rollover
  // -------------------------------------------------------------------------------------------
  private onNewDay(day: number): void {
    const s = this.s, m = s.market;
    if (day > s.lastDailyDay + 0) {
      // finalise the day that just ended
      const finished = day - 1;
      if (!this.warm && finished >= 0) this.finishDay(finished);
      for (const d of CATALOG) {
        const a = m.assets[d.id];
        a.prevClose = a.price; a.dayOpen = a.price;
      }
      evolveEconomyDaily(s.eco, this.rng);
      updateBubbleDaily(this.ew);
      maybeStartBubble(this.ew);
      this.dailyCompanies(day);
      this.ensureCalendar(day, 5);
      // per-asset bubble score
      for (const d of CATALOG) {
        const a = m.assets[d.id];
        if (a.status !== 'ACTIVE') continue;
        const val = a.price / Math.max(1e-9, a.fair);
        a.bubble = Math.max(0, Math.min(1, ((val - 1.25) / 0.9) * 0.6 + Math.max(0, a.sentiment - 0.5) * 0.6 + Math.max(0, a.momentum > 0 ? 0.1 : 0)));
      }
      // crash roll (once per day)
      if (this.warm && day < 5) { /* no crash in early warm-up? allow later */ }
      const hz = crashHazardPerDay(this.ew);
      if (hz > 0 && this.rng.next() < hz && (!this.warm || day < -8)) { triggerCrash(this.ew); this.listeners.onCrash?.(); }
      // trim archives
      if (s.news.length > 1800) s.news.splice(0, s.news.length - 1500);
      if (s.calendar.length > 500) s.calendar = s.calendar.filter((e) => e.day >= day - 40);
      s.lastDailyDay = day;
    }
  }

  private finishDay(day: number): void {
    const s = this.s, m = s.market;
    let best = { id: '', pct: -1e9 }, worst = { id: '', pct: 1e9 };
    for (const d of CATALOG) {
      if (d.cls === 'index' || d.cls === 'bond') continue;
      const a = m.assets[d.id];
      if (a.status !== 'ACTIVE' || a.dayOpen <= 0) continue;
      const pct = (a.price / a.dayOpen - 1) * 100;
      if (pct > best.pct) best = { id: d.id, pct };
      if (pct < worst.pct) worst = { id: d.id, pct };
    }
    void best; void worst;
    // dayOpen was already reset in onNewDay before finishDay? compute from prevClose snapshot stored at previous rollover
    // (finishDay is invoked before the reset above, so dayOpen is the day's opening price)
    const news = s.news.filter((n) => n.day === day).sort((a, b) => b.severity - a.severity || b.t - a.t);
    const sent = s.eco.sentiment;
    const label = sent > 0.55 ? 'Extreme greed' : sent > 0.2 ? 'Greed' : sent < -0.55 ? 'Extreme fear' : sent < -0.2 ? 'Fear' : 'Neutral';
    const evCount = s.calendar.filter((e) => e.day === day).length;
    const notes: string[] = [];
    if (s.eco.bubble?.active) notes.push(`Bubble watch: ${s.eco.bubble.group} valuations are stretched.`);
    const report: DailyReport = {
      day, sentiment: label, sentimentValue: sent, topGainer: best, topLoser: worst, majorNews: news[0]?.headline ?? 'No major headlines',
      regime: m.regimes.GLOBAL.current, events: evCount, notes,
    };
    s.reports.push(report);
    if (s.reports.length > 800) s.reports.shift();
    this.listeners.onDayEnd?.(report);
  }

  // -------------------------------------------------------------------------------------------
  // Calendar
  // -------------------------------------------------------------------------------------------
  private calHorizon = -9999;
  ensureCalendar(fromDay: number, ahead: number): void {
    const s = this.s;
    const to = fromDay + ahead;
    const start = Math.max(this.calHorizon + 1, fromDay);
    for (let d = start; d <= to; d++) {
      for (const tpl of templatesOnDay(d)) {
        if (s.calendar.some((e) => e.id === `${tpl.id}-${d}`)) continue;
        s.calendar.push(makeCalendarEvent(tpl, d, s.eco, this.rng));
      }
    }
    if (to > this.calHorizon) this.calHorizon = to;
    s.calendar.sort((a, b) => a.t - b.t);
  }

  /** Next high-impact calendar events (for header countdown). */
  upcoming(limit = 8, minImpact: CalendarEvent['impact'] = 'LOW'): CalendarEvent[] {
    const order = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 } as const;
    const out: CalendarEvent[] = [];
    for (const e of this.s.calendar) {
      if (e.t >= this.s.t && order[e.impact] >= order[minImpact] && !e.released) { out.push(e); if (out.length >= limit) break; }
    }
    return out;
  }

  private lastStressT = 0;
  private updateCalendar(t: number): void {
    const s = this.s;
    // release due events
    for (const e of s.calendar) {
      if (!e.released && e.t <= t && e.day >= dayIndexOf(t) - 1) this.release(e);
    }
    // pre-event stress: refresh once per game-minute
    if (t - this.lastStressT < 60) return;
    this.lastStressT = t;
    const stress = s.market.eventStress;
    for (const k in stress) stress[k] *= 0.6;
    for (const e of s.calendar) {
      if (e.t < t - 900) continue;
      if (e.t > t + 900) break;
      const dtE = e.t - t;
      const w = impactWeight(e.impact);
      let intensity = 0;
      if (dtE > 0 && dtE <= 600) intensity = (1 - dtE / 600) * w;      // ramp-up in the final 10 minutes
      else if (dtE <= 0 && dtE > -900) intensity = w * (1 + dtE / 900) * 1.1; // aftershock
      if (intensity <= 0.05) continue;
      for (const d of CATALOG) {
        if (d.cls === 'index') continue;
        if (e.tags.some((tg) => d.tags.includes(tg)) || (d.cls === 'forex' && (d.base === e.country || d.quote === e.country))) {
          stress[d.id] = Math.max(stress[d.id] ?? 0, Math.min(1.3, intensity * 0.55));
        }
      }
    }
  }

  private release(e: CalendarEvent): void {
    const s = this.s;
    e.released = true;
    if (e.kind === 'EARNINGS' || e.kind === 'IPO') return;
    const r = releaseEvent(e, s.eco, this.rng);
    e.actual = r.actual;
    // apply factor shocks
    for (const k of Object.keys(r.factorShocks) as FactorId[]) {
      const v = r.factorShocks[k];
      if (v !== undefined) shockFactor(s.market, this.rng, s.t, k, v, e.impact === 'EXTREME' ? 240 : 120);
    }
    s.eco.sentiment = Math.max(-1, Math.min(1, s.eco.sentiment + r.sentiment * 0.08 * impactWeight(e.impact)));
    // vol/spread flurry
    for (const d of CATALOG) {
      if (d.cls === 'index') continue;
      if (e.tags.some((tg) => d.tags.includes(tg)) || (d.cls === 'forex' && (d.base === e.country || d.quote === e.country))) {
        const a = s.market.assets[d.id];
        if (a.status === 'ACTIVE') { a.volBoost = Math.min(3, a.volBoost + 0.4 * impactWeight(e.impact)); a.spreadBoost = Math.min(6, a.spreadBoost + 0.6 * impactWeight(e.impact)); }
      }
    }
    if (r.headline) {
      // expected impacts for display
      const exp = this.expectedFromShocks(r.factorShocks);
      const ranked = Object.entries(exp).filter(([id]) => s.market.assets[id].status === 'ACTIVE').sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
      const pp: Record<string, number> = {};
      const item: NewsItem = {
        id: `N${getNewsSeq() + 1}`, t: s.t, day: dayIndexOf(s.t), headline: r.headline, body: r.body + (e.forecast !== undefined && e.actual !== undefined ? ` Actual ${e.actual}${e.unit} / Forecast ${e.forecast}${e.unit}.` : ''),
        category: e.kind === 'CPI' ? 'INFLATION' : e.kind === 'RATE' ? (e.country === 'USD' ? 'CENTRAL BANK' : 'INTEREST RATE') : e.kind === 'GDP' ? 'GDP' : e.kind === 'EMP' || e.kind === 'CLAIMS' ? 'EMPLOYMENT' : e.kind === 'OPEC' ? 'ENERGY' : e.kind === 'SPEECH' ? 'CENTRAL BANK' : 'ECONOMY',
        sentiment: r.sentiment, severity: e.impact === 'EXTREME' ? 5 : e.impact === 'HIGH' ? 4 : e.impact === 'MEDIUM' ? 3 : 2, reliability: 'OFFICIAL',
        breaking: e.impact === 'EXTREME' || e.impact === 'HIGH', affected: ranked.map(([id, ex]) => { pp[id] = s.market.assets[id].price; return { assetId: id, expected: Math.round(ex * 100) / 100 }; }),
        priceAtPublish: pp, resolveAt: s.t + 3 * 3600, resolved: false, templateId: 'cal_' + e.templateId, tags: [e.country],
      };
      setNewsSeq(getNewsSeq() + 1);
      this.pushNews(item);
    }
    this.listeners.onCalendarRelease?.(e);
  }

  private expectedFromShocks(shocks: Partial<Record<FactorId, number>>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const d of CATALOG) {
      if (d.cls === 'index') continue;
      let e = 0;
      for (const k in shocks) e += (d.loadings[k as FactorId] ?? 0) * (shocks[k as FactorId] as number) * 100;
      if (Math.abs(e) > 0.02) out[d.id] = e;
    }
    for (const d of CATALOG) {
      if (d.cls !== 'index' || !d.constituents) continue;
      let e = 0; for (const c of d.constituents) e += (out[c.id] ?? 0) * c.w;
      if (Math.abs(e) > 0.02) out[d.id] = e;
    }
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // News / events
  // -------------------------------------------------------------------------------------------
  private addNews(r: NewsResult): void {
    this.pushNews(r.item);
    for (const f of r.followups) this.s.followups.push(f);
  }
  private pushNews(item: NewsItem): void {
    this.s.news.push(item);
    for (const af of item.affected) this.s.lastNewsPerAsset[af.assetId] = item.t;
    if (!this.warm) this.listeners.onNews?.(item);
  }

  private runNews(t: number, dt: number): void {
    const s = this.s;
    // follow-up chain news
    if (s.followups.length) {
      for (let i = s.followups.length - 1; i >= 0; i--) {
        const f = s.followups[i];
        if (t >= f.t) {
          s.followups.splice(i, 1);
          const tpl = NEWS_MAP[f.templateId];
          if (tpl) { const res = publishNews(this.nw, tpl, { parentId: f.parentId }); this.addNews(res); }
        }
      }
    }
    if (t >= s.nextAmbientT) {
      const mh = marketHours(t);
      const busy = mh.weekend ? 0.55 : 1;
      const tpl = pickAmbientTemplate(this.nw, { inflHigh: s.eco.inflation.USD > 4, bubble: !!s.eco.bubble?.active });
      // crash/bubble-like heavy items are rare; ambient news is mostly minor
      const res = publishNews(this.nw, tpl);
      this.addNews(res);
      const meanGap = (86400 / 13) / (this.diff.eventFreq * 0.8 + 0.2) / busy;
      s.nextAmbientT = t + Math.max(600, this.rng.range(meanGap * 0.4, meanGap * 1.7));
    }
    void dt;
  }

  private runEvents(t: number, dt: number): void {
    const s = this.s;
    if (t >= s.nextEventRollT) {
      const gap = this.warm ? 6 * 3600 : 3600;
      rollEvents(this.ew, gap / DAY);
      s.nextEventRollT = t + gap;
      // hook newly-created active events to listener
      for (const e of s.activeEvents) if (e.startT >= t - gap && !this.warm) this.listeners.onEvent?.(e);
    }
    void dt;
  }

  private lastResolveT = 0;
  private resolveNewsWindows(t: number): void {
    if (t - this.lastResolveT < 300) return;
    this.lastResolveT = t;
    const news = this.s.news;
    for (let i = news.length - 1; i >= Math.max(0, news.length - 160); i--) {
      const n = news[i];
      if (!n.resolved && t >= n.resolveAt) resolveNews(n, this.s.market.assets, t);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Companies: earnings, IPO, health
  // -------------------------------------------------------------------------------------------
  private lastCompT = 0;
  private tickCompanies(t: number, mh: MarketHours, dt: number): void {
    const s = this.s;
    if (t - this.lastCompT < 60) return;
    this.lastCompT = t;
    const day = dayIndexOf(t);
    const hour = secOfDay(t) / 3600;
    for (const c of Object.values(s.companies)) {
      const a = s.market.assets[c.assetId];
      if (c.status === 'PRE_IPO') {
        if (c.ipoDay !== undefined && day >= c.ipoDay && hour >= 9.5 && mh.stock && (!this.warm || false)) this.listIpo(c);
        else if (c.ipoDay !== undefined && day + 3 === c.ipoDay && !s.ipoSubscribed['ann_' + c.id] && hour >= 8) { s.ipoSubscribed['ann_' + c.id] = true; this.announceIpo(c); }
        continue;
      }
      if (c.status === 'DELISTED') continue;
      if (c.status === 'ACTIVE' || c.status === 'WARNING') {
        if (day === c.nextEarningsDay && hour >= c.earningsHour && !s.ipoSubscribed[`earn_${c.id}_${day}`]) {
          s.ipoSubscribed[`earn_${c.id}_${day}`] = true;
          this.doEarnings(c, a, day);
        }
      }
    }
    void dt;
  }

  private doEarnings(c: Company, a: AssetState, day: number): void {
    const s = this.s;
    const gLevel = s.market.factors.GROWTH.level;
    const out = reportEarnings(c, a, s.eco, gLevel * 100 * 0.3, this.rng, day);
    // schedule next report
    const idx = STOCK_SEEDS.findIndex((x) => x.id === c.id);
    c.nextEarningsDay = nextSeasonDay(day + 10, idx >= 0 ? idx : 0, STOCK_SEEDS.length);
    // apply reaction as direct impulse (opening gap for closed markets happens through acc)
    const total = out.reactionPct / 100;
    shockAsset(s.market, c.assetId, total * 0.9, 45);
    const sec = CATALOG_MAP[c.assetId]?.sector;
    if (sec) shockFactor(s.market, this.rng, s.t, SECTOR_FACTOR[sec], total * 0.12, 240);
    a.volBoost = Math.min(3, a.volBoost + 0.9); a.spreadBoost += 1.5;
    a.sentiment = Math.max(-1, Math.min(1, a.sentiment + out.sentiment * 0.4));
    // fair value follows earnings power
    a.fair = fairValueOf(c, s.eco) * (0.97 + this.rng.next() * 0.06);
    const pp = { [c.assetId]: a.price };
    const item: NewsItem = {
      id: `N${getNewsSeq() + 1}`, t: s.t, day, headline: `EARNINGS: ${out.headline}`, body: out.body, category: 'COMPANY', sentiment: out.sentiment,
      severity: out.severity, reliability: 'OFFICIAL', breaking: out.severity >= 4, affected: [{ assetId: c.assetId, expected: Math.round(total * 1000) / 10 }],
      priceAtPublish: pp, resolveAt: s.t + 12 * 3600, resolved: false, templateId: 'earnings', tags: ['COMPANY', c.id],
    };
    setNewsSeq(getNewsSeq() + 1);
    this.pushNews(item);
    // calendar mirror
    s.calendar.push({ id: `EARN-${c.id}-${day}`, templateId: 'EARNINGS', t: s.t, day, country: 'USD', flag: '📊', name: `${c.name} earnings`, kind: 'EARNINGS', impact: out.severity >= 3 ? 'HIGH' : 'MEDIUM', tags: [c.id], unit: '$', forecast: out.report.epsExpected, actual: out.report.epsActual, released: true });
    if (!this.warm) this.listeners.onEarnings?.(c);
  }

  private announceIpo(c: Company): void {
    const s = this.s;
    const day = c.ipoDay ?? 0;
    s.calendar.push({ id: `IPO-${c.id}`, templateId: 'IPO', t: tOf(day, 9, 30), day, country: 'USD', flag: '🔔', name: `${c.name} IPO at $${c.ipoPrice}`, kind: 'IPO', impact: 'HIGH', tags: [c.id, 'stock'], unit: '$', released: false, note: c.id });
    s.calendar.sort((a, b) => a.t - b.t);
    const res = scriptedItem(this.nw, `${c.name} sets IPO price at $${c.ipoPrice}; listing in 3 days`, `${c.blurb} Retail investors can subscribe before the listing (Orders > IPO).`, 'COMPANY');
    res.severity = 3; res.tags = ['COMPANY', c.id, 'IPO'];
    this.pushNews(res);
  }

  private listIpo(c: Company): void {
    const s = this.s, m = s.market;
    const a = m.assets[c.assetId];
    const { price, hype } = ipoOpenPrice(c, this.rng);
    c.status = 'ACTIVE';
    a.status = 'ACTIVE';
    a.price = price; a.fair = fairValueOf(c, s.eco) * 0.9 + (c.ipoPrice ?? price) * 0.1; a.dayOpen = price; a.prevClose = c.ipoPrice ?? price;
    a.emaFast = price; a.emaSlow = price; a.refPrice = price; a.candles = emptyCandles();
    a.ipoHype = hype; a.volBoost = 2.5; a.spreadBoost = 3; a.sentiment = Math.max(-0.5, Math.min(0.9, hype)); a.open = true;
    a.trend = hype * 1.2;
    pushGapTick(a, s.t, price, CATALOG_MAP[c.assetId].dailyVolume * 0.05);
    c.nextEarningsDay = dayIndexOf(s.t) + 32;
    const res = scriptedItem(this.nw, `${c.name} debuts on the exchange, opens at $${price.toFixed(2)} (IPO price $${c.ipoPrice})`, hype > 0.3 ? 'Heavy demand fuels a strong first-day pop.' : hype < -0.05 ? 'Trading opens flat as investors weigh valuation.' : 'Shares open modestly above the offer price.', 'COMPANY');
    res.severity = 3; res.tags = ['COMPANY', c.id, 'IPO'];
    this.pushNews(res);
    for (const cl of s.calendar) if (cl.templateId === 'IPO' && cl.note === c.id) cl.released = true;
    this.listeners.onIpo?.(c);
  }

  private dailyCompanies(day: number): void {
    const s = this.s, m = s.market;
    const gLevel = m.factors.GROWTH.level;
    const rLevel = m.factors.RATES.level;
    for (const c of Object.values(s.companies)) {
      if (c.status === 'PRE_IPO' || c.status === 'DELISTED') continue;
      const a = m.assets[c.assetId];
      const act = updateHealthDaily(c, a, s.eco, gLevel, rLevel, day, this.rng, this.diff.eventFreq);
      c.sentiment *= 0.97;
      if (act.type === 'NONE') continue;
      const cat = 'COMPANY' as const;
      if (act.type === 'WARNING') {
        shockAsset(m, c.assetId, -0.14, 240); a.volBoost += 1.2; a.spreadBoost += 3;
        const it = scriptedItem(this.nw, act.headline!, act.body!, cat); it.severity = 4; it.breaking = true; it.reliability = 'CONFIRMED'; it.tags = ['COMPANY', c.id, 'BANKRUPTCY'];
        it.affected = [{ assetId: c.assetId, expected: -14 }]; it.priceAtPublish = { [c.assetId]: a.price }; it.resolved = false; it.resolveAt = s.t + 8 * 3600;
        this.pushNews(it); this.listeners.onCompanyAlert?.(c, 'WARNING');
      } else if (act.type === 'BANKRUPT') {
        shockAsset(m, c.assetId, -0.65, 120); a.volBoost += 3; a.spreadBoost += 8; a.status = 'ACTIVE';
        const it = scriptedItem(this.nw, act.headline!, act.body!, cat); it.severity = 5; it.breaking = true; it.reliability = 'OFFICIAL'; it.tags = ['COMPANY', c.id, 'BANKRUPTCY'];
        it.affected = [{ assetId: c.assetId, expected: -65 }]; it.priceAtPublish = { [c.assetId]: a.price }; it.resolved = false; it.resolveAt = s.t + 8 * 3600;
        this.pushNews(it); this.listeners.onCompanyAlert?.(c, 'BANKRUPT');
        shockFactor(m, this.rng, s.t, SECTOR_FACTOR[c.sector], -0.02, 600);
      } else if (act.type === 'RECOVER') {
        shockAsset(m, c.assetId, 0.16, 240); a.volBoost += 1;
        const it = scriptedItem(this.nw, act.headline!, act.body!, cat); it.severity = 3; it.reliability = 'CONFIRMED'; it.tags = ['COMPANY', c.id];
        this.pushNews(it); this.listeners.onCompanyAlert?.(c, 'RECOVER');
      } else if (act.type === 'DELIST') {
        a.status = 'DELISTED'; a.price = Math.max(0.01, a.price * 0.05); a.acc = 0;
        const it = scriptedItem(this.nw, act.headline!, act.body!, cat); it.severity = 4; it.reliability = 'OFFICIAL'; it.breaking = true; it.tags = ['COMPANY', c.id, 'BANKRUPTCY'];
        this.pushNews(it); this.listeners.onDelist?.(c); this.listeners.onCompanyAlert?.(c, 'DELIST');
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Debug / manual hooks
  // -------------------------------------------------------------------------------------------
  forceNews(templateId: string, sev = 4, sign = 1): NewsItem | undefined {
    const tpl = NEWS_MAP[templateId];
    if (!tpl) return undefined;
    const res = publishNews(this.nw, tpl, { sev, sign, reliability: 'OFFICIAL' });
    this.addNews(res);
    this.saveRng();
    return res.item;
  }
  forceEvent(id: string): void {
    const def = WORLD_EVENTS.find((e) => e.id === id);
    if (def) { const e = triggerEvent(this.ew, def); this.listeners.onEvent?.(e); this.saveRng(); }
  }
  forceCrash(): void { triggerCrash(this.ew, { force: true }); this.listeners.onCrash?.(); this.saveRng(); }
  forceRegime(id: RegimeId): void { setAllRegimes(this.s.market, this.rng, id, this.day); this.saveRng(); }
  advance(seconds: number): void {
    let left = seconds;
    while (left > 0) { const dt = Math.min(left, 30); this.step(dt); left -= dt; }
    this.saveRng();
  }

  ipoCandidates(): Company[] { return Object.values(this.s.companies).filter((c) => c.status === 'PRE_IPO' && c.ipoDay !== undefined && c.ipoDay - this.day <= 3 && c.ipoDay >= this.day); }
}

export function newsFor(w: World, assetId: string, limit = 12): NewsItem[] {
  const out: NewsItem[] = [];
  const news = w.s.news;
  for (let i = news.length - 1; i >= 0 && out.length < limit; i--) if (news[i].affected.some((a) => a.assetId === assetId)) out.push(news[i]);
  return out;
}
export { REGIMES, CURRENCIES, hashString, EPOCH, IPO_SEEDS, CAL_TEMPLATES, EARNINGS_CYCLE, addImpulse };
