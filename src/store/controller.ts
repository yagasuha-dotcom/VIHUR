import { create } from 'zustand';
import { CATALOG, CATALOG_MAP } from '@/engine/catalog';
import { World, LIVE_DT, type DailyReport } from '@/engine/world';
import { seedFromLabel, seedLabel } from '@/engine/rng';
import { DIFFICULTY } from '@/engine/difficulty';
import { DAY, dayIndexOf, fmtGameTime, marketHours, type MarketHours } from '@/engine/time';
import type { AssetClass, CalendarEvent, Company, Difficulty, NewsItem, RegimeId, TimeframeId } from '@/types';
import {
  accountOf, cancelOrder as cancelOrderFn, closePosition as closePositionFn, modifyPosition as modifyFn, newPlayer, positionPnl, previewOrder as previewFn,
  processTick, rolloverPositions, submitOrder as submitFn, clamp, notionalUSD,
} from '@/features/trading/engine';
import { processLoansDaily, dailyCreditDrift, takeLoan as takeLoanFn, repayLoan as repayFn, restructureLoan as restructFn, doSideJob, claimDailyReward, declareBankruptcy as bankruptFn, isBroke } from '@/features/banking/bank';
import { checkMissions } from '@/features/missions/missions';
import { updateJournal } from '@/features/journal/journal';
import { rollLifeEvent } from '@/features/lifeEvents';
import type { Account, Drawing, Notification, OrderPreview, OrderRequest, PlayerState, Position, Quote } from '@/features/types';
import { playSound, setSoundEnabled } from '@/utils/sound';
import { clearSave, exportRaw, importRaw, readMeta, readSave, writeSave, type SaveMeta } from './persistence';

export type View = 'markets' | 'portfolio' | 'news' | 'calendar' | 'orders' | 'journal' | 'missions' | 'bank' | 'analytics' | 'fundamentals' | 'settings';

export interface PriceView { price: number; bid: number; ask: number; spread: number; changePct: number; open: boolean; status: string; sentiment: number }
export interface PositionView extends Position { pnl: number; current: number; pnlPct: number }
export interface Snapshot {
  t: number; day: number; mh: MarketHours; prices: Record<string, PriceView>; account: Account; positions: PositionView[]; player: PlayerState;
  news: NewsItem[]; upcoming: CalendarEvent[]; regime: RegimeId; sentiment: number; broke: boolean; speed: number; paused: boolean; ipoOpen: Company[];
  bubble: string | null; version: number;
}
export interface Toast { id: number; kind: Notification['kind']; title: string; msg: string }

interface UI {
  phase: 'welcome' | 'loading' | 'playing'; progress: number; meta: SaveMeta | null; view: View; selected: string; tf: TimeframeId;
  indicators: string[]; tool: 'cursor' | 'hline' | 'support' | 'resistance' | 'trend'; sheet: boolean; tutorial: boolean; debug: boolean;
  toasts: Toast[]; report: DailyReport | null; brokeOpen: boolean; snap: Snapshot | null; orderSide: 'BUY' | 'SELL'; rightTab: string; watchQuery: string;
  mobileTab: 'chart' | 'watch' | 'info';
}
export const useGame = create<UI>(() => ({
  phase: 'welcome', progress: 0, meta: null, view: 'markets', selected: 'BTC/USD', tf: '5m', indicators: ['EMA20', 'VOL'], tool: 'cursor', sheet: false, tutorial: false, debug: false,
  toasts: [], report: null, brokeOpen: false, snap: null, orderSide: 'BUY', rightTab: 'order', watchQuery: '', mobileTab: 'chart',
}));
const ui = (patch: Partial<UI>) => useGame.setState(patch);

export const TICKS_PER_SEC_1X = 60 / LIVE_DT;   // 1x: one real second == one game minute

class GameController {
  world!: World;
  player!: PlayerState;
  speed = 1;
  paused = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private acc = 0;
  private lastFlush = 0;
  private lastSave = 0;
  private flushN = 0;
  private toastSeq = 0;
  private dayFlag = false;
  private fastSubs = new Set<() => void>();
  private version = 0;
  private pendingReports: DailyReport[] = [];

  // ---------------------------------------------------------------------------------------------
  subscribeFast(cb: () => void): () => void { this.fastSubs.add(cb); return () => { this.fastSubs.delete(cb); }; }

  notify = (n: Omit<Notification, 'id' | 't' | 'read'>): void => {
    const p = this.player;
    const note: Notification = { ...n, id: `n${++p.seq}`, t: this.world.t, read: false };
    p.notifications.unshift(note);
    if (p.notifications.length > 120) p.notifications.length = 120;
    const id = ++this.toastSeq;
    const toasts = [...useGame.getState().toasts, { id, kind: n.kind, title: n.title, msg: n.msg }].slice(-5);
    ui({ toasts });
    if (p.settings.sound && n.sound) playSound(n.sound);
    setTimeout(() => ui({ toasts: useGame.getState().toasts.filter((x) => x.id !== id) }), n.kind === 'margin' ? 9000 : 5200);
  };

  private attachWorld(w: World): void {
    this.world = w;
    w.listeners = {
      onNews: (n) => { if (n.severity >= 3 && (n.breaking || n.severity >= 4)) this.notify({ kind: 'news', title: n.breaking ? 'BREAKING NEWS' : 'NEWS', msg: n.headline, sound: 'news' }); },
      onDayEnd: (r) => { this.dayFlag = true; this.pendingReports.push(r); },
      onIpo: (c) => this.fillIpo(c),
      onCrash: () => this.notify({ kind: 'margin', title: 'GLOBAL MARKET PANIC', msg: 'Stocks, crypto and oil are plunging. Spreads are widening.', sound: 'margin' }),
      onCompanyAlert: (c, kind) => { if (this.player.positions.some((x) => x.assetId === c.assetId) && (kind === 'BANKRUPT' || kind === 'DELIST' || kind === 'WARNING')) this.notify({ kind: 'bad', title: `${c.name}: ${kind}`, msg: 'You hold a position in this company.', sound: 'loss' }); },
    };
    setSoundEnabled(this.player?.settings.sound ?? true);
  }

  // ---------------------------------------------------------------------------------------------
  async init(): Promise<void> { const meta = await readMeta(); ui({ meta }); }

  async newGame(seedText: string | null, difficulty: Difficulty, tutorial: boolean): Promise<void> {
    this.stop();
    ui({ phase: 'loading', progress: 0 });
    await new Promise((r) => setTimeout(r, 30));
    const seed = seedText ? seedFromLabel(seedText) : Math.floor(Math.random() * 900000) + 100000;
    const w = World.create(seed, difficulty);
    await w.warmup((p) => ui({ progress: p }));
    this.player = newPlayer(difficulty, 0);
    this.player.settings.tutorialDone = !tutorial;
    this.attachWorld(w);
    w.saveRng();
    this.speed = 1; this.paused = true;
    this.flush(true);                                    // snapshot must exist before the game screen mounts
    ui({ phase: 'playing', view: 'markets', selected: 'BTC/USD', tf: '5m', tutorial, toasts: [] });
    this.notify({ kind: 'info', title: `DAY 1 - ${seedLabel(seed)}`, msg: 'Markets are calm. US CPI is due at 08:30. Press play (or Space) to start the clock.' });
    await this.save();
  }

  async continueGame(): Promise<boolean> {
    const s = await readSave();
    if (!s) return false;
    ui({ phase: 'loading', progress: 0.4 });
    const w = new World(s.world);
    this.player = s.player;
    this.attachWorld(w);
    w.ensureCalendar(w.day, 6);
    this.speed = s.speed || 1; this.paused = true;
    this.flush(true);
    ui({ phase: 'playing', view: 'markets', progress: 1, selected: this.player.watch[0] ?? 'BTC/USD' });
    return true;
  }

  async save(): Promise<void> {
    if (!this.world) return;
    this.world.saveRng();
    const acc = accountOf(this.player, this.world);
    const meta: SaveMeta = { savedAt: Date.now(), day: this.world.day, netWorth: acc.netWorth, difficulty: this.world.s.difficulty, seed: this.world.s.seed, level: Math.floor(Math.sqrt(this.player.xp / 100)) + 1 };
    try { await writeSave({ version: 1, world: this.world.s, player: this.player, speed: this.speed, meta }); ui({ meta }); this.lastSave = performance.now(); } catch (e) { console.warn('save failed', e); }
  }
  async exportSave(): Promise<string | null> { await this.save(); return exportRaw(); }
  async importSave(text: string): Promise<boolean> { const ok = await importRaw(text); if (ok) return this.continueGame(); return false; }
  async resetAll(): Promise<void> { this.stop(); await clearSave(); ui({ phase: 'welcome', meta: null, snap: null }); }
  toWelcome(): void { this.stop(); void this.save(); ui({ phase: 'welcome' }); void readMeta().then((m) => ui({ meta: m })); }

  // ---------------------------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------------------------
  play(): void {
    if (!this.paused && this.timer) return;
    this.paused = false; this.last = performance.now();
    if (!this.timer) this.timer = setInterval(() => this.loop(), 40);
    this.flush(true);
  }
  pause(): void { this.paused = true; this.flush(true); void this.save(); }
  toggle(): void { this.paused ? this.play() : this.pause(); }
  setSpeed(s: number): void { this.speed = s; if (this.paused) this.play(); else this.flush(true); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.paused = true; }

  private loop(): void {
    if (this.paused || !this.world) return;
    const now = performance.now();
    const elapsed = Math.min(now - this.last, 250);
    this.last = now;
    this.acc += (elapsed / 1000) * this.speed * TICKS_PER_SEC_1X;
    let n = Math.min(Math.floor(this.acc), 240);
    this.acc -= Math.floor(this.acc);
    if (n <= 0) return;
    while (n-- > 0) {
      this.world.step(LIVE_DT);
      processTick(this.player, this.world, this.notify);
      if (this.dayFlag) { this.dayFlag = false; this.onDay(); }
    }
    for (const cb of this.fastSubs) cb();
    if (now - this.lastFlush > 240) this.flush(false);
    if (now - this.lastSave > 30000) void this.save();
  }

  /** Advance the world by a chunk of seconds without a real-time delay (debug / skip). */
  advance(seconds: number): void {
    let left = seconds;
    while (left > 0) {
      const dt = Math.min(left, LIVE_DT * 3); left -= dt;
      this.world.step(dt); processTick(this.player, this.world, this.notify);
      if (this.dayFlag) { this.dayFlag = false; this.onDay(); }
    }
    for (const cb of this.fastSubs) cb();
    this.flush(true);
  }

  // ---------------------------------------------------------------------------------------------
  // Daily player rollover
  // ---------------------------------------------------------------------------------------------
  private onDay(): void {
    const p = this.player, w = this.world;
    const day = dayIndexOf(w.t);
    rolloverPositions(p, w);
    processLoansDaily(p, w, this.notify);
    dailyCreditDrift(p, w);
    p.counters.daysPlayed = day - p.startDay;
    if (p.lastMarginCallDay < day - 0) p.counters.noMarginCallDays++;
    p.xp += 15;
    // reputation drift from behaviour
    const debtOn = p.loans.some((l) => l.status !== 'PAID');
    p.reputation = clamp(p.reputation + (debtOn ? (p.loans.some((l) => l.status === 'LATE' || l.status === 'DEFAULT') ? -0.6 : -0.05) : 0.12) + (p.discipline > 70 ? 0.12 : p.discipline < 35 ? -0.3 : 0) + (p.riskControl > 70 ? 0.1 : 0), 0, 100);
    p.discipline += (60 - p.discipline) * 0.015; p.patience += (60 - p.patience) * 0.015; p.riskControl += (60 - p.riskControl) * 0.01;
    const acc = accountOf(p, w);
    p.equityHistory.push({ day, equity: acc.equity, netWorth: acc.netWorth });
    if (p.equityHistory.length > 1200) p.equityHistory.shift();
    p.dayStartEquity = acc.equity;
    rollLifeEvent(p, w, this.notify);
    checkMissions(p, w, this.notify);
    p.psychFlags = p.psychFlags.filter((f) => w.t - f.t < 3 * DAY);
    const rep = this.pendingReports.pop();
    this.pendingReports = [];
    if (rep) {
      const g = rep.topGainer.id ? `${CATALOG_MAP[rep.topGainer.id]?.symbol ?? rep.topGainer.id} +${rep.topGainer.pct.toFixed(1)}%` : '-';
      p.reports.push({ day: rep.day, text: `Sentiment ${rep.sentiment}. Top gainer ${g}.` });
      if (p.reports.length > 400) p.reports.shift();
      if (this.speed <= 5) ui({ report: rep });
      else this.notify({ kind: 'report', title: `Daily report - DAY ${rep.day + 1}`, msg: `${rep.sentiment} sentiment, ${rep.majorNews}` });
    }
    if (p.marginState === 'OK') void 0;
    void this.save();
  }

  private fillIpo(c: Company): void {
    const p = this.player, w = this.world;
    const subs = p.ipoSubs.filter((s) => s.assetId === c.assetId && !s.filled);
    if (!subs.length) return;
    const def = CATALOG_MAP[c.assetId];
    const hype = c.ipoHype ?? 0;
    const alloc = clamp(0.55 + Math.max(0, -hype) * 0.8 + 0.1 * w.rng.next(), 0.35, 1);
    for (const s of subs) {
      const shares = Math.floor((s.amount * alloc) / (c.ipoPrice ?? 1));
      const cost = shares * (c.ipoPrice ?? 1);
      p.balance += s.amount - cost;                 // refund unallocated cash
      s.filled = true;
      if (shares <= 0) continue;
      const pos: Position = {
        id: `P${++p.seq}`, assetId: c.assetId, side: 'LONG', size: shares, entry: c.ipoPrice ?? 1, leverage: 1, margin: cost, notional: cost, openT: w.t, swap: 0, fees: 0,
        journalId: `J${++p.seq}`, reason: 'IPO allocation', slippage: 0, riskPct: 0, condition: 'IPO listing',
      };
      p.positions.push(pos);
      p.journal.push({ id: pos.journalId, positionId: pos.id, assetId: pos.assetId, side: 'LONG', entry: pos.entry, reason: 'IPO allocation', condition: 'IPO listing', note: '', lesson: '', result: 'OPEN', openT: w.t });
      p.counters.opened++;
      this.notify({ kind: 'good', title: `IPO allocation: ${def.name}`, msg: `${shares} shares at $${c.ipoPrice} (${(alloc * 100).toFixed(0)}% of your order filled).`, sound: 'buy' });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Player actions
  // ---------------------------------------------------------------------------------------------
  preview(req: OrderRequest): OrderPreview { return previewFn(this.player, this.world, req); }
  submit(req: OrderRequest) { const r = submitFn(this.player, this.world, req, this.notify); this.flush(true); void 0; return r; }
  close(id: string) { closePositionFn(this.player, this.world, id, 'MANUAL', this.notify); checkMissions(this.player, this.world, this.notify); this.flush(true); }
  closeAll() { for (const p of [...this.player.positions]) closePositionFn(this.player, this.world, p.id, 'MANUAL', this.notify); checkMissions(this.player, this.world, this.notify); this.flush(true); }
  modify(id: string, sl?: number, tp?: number) { const e = modifyFn(this.player, this.world, id, sl, tp); if (e) this.notify({ kind: 'warn', title: 'Cannot modify', msg: e }); this.flush(true); return e; }
  cancel(id: string) { cancelOrderFn(this.player, id); this.flush(true); }
  takeLoan(tier: string) { const e = takeLoanFn(this.player, this.world, tier, this.notify); if (e) this.notify({ kind: 'warn', title: 'Loan declined', msg: e }); this.flush(true); return e; }
  repay(id: string, amt: number | 'all') { const e = repayFn(this.player, this.world, id, amt, this.notify); if (e) this.notify({ kind: 'warn', title: 'Repayment failed', msg: e }); checkMissions(this.player, this.world, this.notify); this.flush(true); return e; }
  restructure(id: string) { const e = restructFn(this.player, id, this.notify); if (e) this.notify({ kind: 'warn', title: 'Not possible', msg: e }); this.flush(true); return e; }
  sideJob() { const e = doSideJob(this.player, this.world, this.notify); if (e) this.notify({ kind: 'warn', title: 'Side job', msg: e }); this.flush(true); }
  dailyReward() { const e = claimDailyReward(this.player, this.world, this.notify); if (e) this.notify({ kind: 'warn', title: 'Daily reward', msg: e }); this.flush(true); }
  bankrupt() { const e = bankruptFn(this.player, this.world, this.notify); if (e) this.notify({ kind: 'warn', title: 'Bankruptcy', msg: e }); ui({ brokeOpen: false }); this.flush(true); }
  journal(id: string, patch: { note?: string; lesson?: string; reason?: string }) { updateJournal(this.player, id, patch); this.flush(true); }
  subscribeIpo(assetId: string, amount: number): string | null {
    const p = this.player;
    if (amount < 100) return 'Minimum subscription is $100';
    if (amount > p.balance) return 'Not enough cash';
    if (p.ipoSubs.some((s) => s.assetId === assetId && !s.filled)) return 'You already subscribed';
    p.balance -= amount; p.ipoSubs.push({ id: `S${++p.seq}`, assetId, amount, day: this.world.day, filled: false });
    this.notify({ kind: 'info', title: 'IPO subscription placed', msg: `$${amount.toFixed(0)} reserved for ${CATALOG_MAP[assetId].name}. Allocation may be partial.` });
    this.flush(true); return null;
  }
  notifAction(id: string, action: string) {
    const p = this.player; const n = p.notifications.find((x) => x.id === id); if (!n || n.done) return;
    n.done = true; n.actions = undefined;
    if (action === 'premium') { if (p.balance >= 60) { p.balance -= 60; p.credit = clamp(p.credit + 12, 300, 850); this.notify({ kind: 'info', title: 'Premium account active', msg: 'Credit score +12.' }); } }
    this.flush(true);
  }
  markRead() { for (const n of this.player.notifications) n.read = true; this.flush(true); }
  setDrawings(assetId: string, d: Drawing[]) { this.player.drawings[assetId] = d; this.flush(true); }
  setSetting<K extends keyof PlayerState['settings']>(k: K, v: PlayerState['settings'][K]) { this.player.settings[k] = v; if (k === 'sound') setSoundEnabled(v as boolean); this.flush(true); }
  toggleWatch(id: string) { const p = this.player; p.watch = p.watch.includes(id) ? p.watch.filter((x) => x !== id) : [...p.watch, id]; this.flush(true); }

  // Debug
  debug = {
    news: (tpl: string, sev = 4, sign = 1) => { this.world.forceNews(tpl, sev, sign); this.flush(true); },
    event: (id: string) => { this.world.forceEvent(id); this.flush(true); },
    crash: () => { this.world.forceCrash(); this.flush(true); },
    regime: (r: RegimeId) => { this.world.forceRegime(r); this.flush(true); },
    advance: (sec: number) => this.advance(sec),
    money: (n: number) => { this.player.balance += n; this.flush(true); },
  };

  // ---------------------------------------------------------------------------------------------
  // Snapshot for React (4 Hz). The simulation itself runs at up to hundreds of ticks per second.
  // ---------------------------------------------------------------------------------------------
  flush(force: boolean): void {
    if (!this.world || !this.player) return;
    const w = this.world, p = this.player;
    this.lastFlush = performance.now();
    const prices: Record<string, PriceView> = {};
    for (const d of CATALOG) {
      const a = w.s.market.assets[d.id];
      if (a.status === 'PRE_IPO') continue;
      prices[d.id] = { price: a.price, bid: a.price * (1 - a.spread / 2), ask: a.price * (1 + a.spread / 2), spread: a.spread, changePct: a.dayOpen > 0 ? (a.price / a.dayOpen - 1) * 100 : 0, open: a.open, status: a.status, sentiment: a.sentiment };
    }
    const acc = accountOf(p, w);
    if (acc.equity > p.peakEquity) p.peakEquity = acc.equity;
    else if (p.peakEquity > 0) p.maxDD = Math.max(p.maxDD, 1 - acc.equity / p.peakEquity);
    const positions: PositionView[] = p.positions.map((pos) => {
      const a = w.asset(pos.assetId); const pnl = positionPnl(pos, a);
      return { ...pos, pnl, current: pos.side === 'LONG' ? a.price * (1 - a.spread / 2) : a.price * (1 + a.spread / 2), pnlPct: pos.margin > 0 ? (pnl / pos.margin) * 100 : 0 };
    });
    if (force || ++this.flushN % 8 === 0) checkMissions(p, w, this.notify);
    const broke = isBroke(p, w);
    const s = useGame.getState();
    if (broke && !s.brokeOpen && p.brokeDay < dayIndexOf(w.t) - 0 && !this.paused) ui({ brokeOpen: true });
    const bubble = w.s.eco.bubble && w.s.eco.bubble.active ? w.s.eco.bubble.group : null;
    const snap: Snapshot = {
      t: w.t, day: w.day, mh: marketHours(w.t), prices, account: acc, positions, player: { ...p, positions: p.positions, notifications: p.notifications, trades: p.trades, journal: p.journal, loans: p.loans, orders: p.orders },
      news: w.s.news.slice(-80), upcoming: w.upcoming(10), regime: w.s.market.regimes.GLOBAL.current, sentiment: w.s.eco.sentiment, broke, speed: this.speed, paused: this.paused,
      ipoOpen: w.ipoCandidates(), bubble, version: ++this.version,
    };
    ui({ snap });
  }
}

export const game = new GameController();
export { fmtGameTime, notionalUSD, DIFFICULTY };
export type { AssetClass, Quote };
