import { useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { game, useGame } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { TIMEFRAMES, dayIndexOf, pad2, secOfDay } from '@/engine/time';
import { atr, bollinger, detectPatterns, ema, macd, rsi, sma, vwap, type Series } from '@/engine/indicators';
import { TF_SECONDS } from '@/engine/time';
import type { Candle, TimeframeId } from '@/types';
import { cn, pct, px } from '@/utils/format';
import { REGIMES } from '@/engine/regimes';
import { FlashNum } from './ui';
import type { Drawing } from '@/features/types';

const UP = '#2ED3A0', DOWN = '#FF5C74';
export const OVERLAYS = ['SMA20', 'SMA50', 'EMA20', 'EMA50', 'BB', 'VWAP'];
export const PANES = ['VOL', 'RSI', 'MACD', 'ATR'];
const ADVANCED = ['BB', 'VWAP', 'MACD', 'ATR'];

function fmtTime(t: number, tf: TimeframeId | 'full'): string {
  const d = dayIndexOf(t), s = secOfDay(t);
  const hm = `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}`;
  if (tf === 'full') return `D${d + 1} ${hm}`;
  if (tf === '1D' || tf === '1W' || s === 0) return `D${d + 1}`;
  return hm;
}
const toBar = (c: Candle) => ({ time: c.t as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c });
const toVol = (c: Candle) => ({ time: c.t as UTCTimestamp, value: c.v, color: c.c >= c.o ? 'rgba(46,211,160,.32)' : 'rgba(255,92,116,.32)' });
function lineData(times: number[], s: Series) { return times.map((t, i) => (s[i] === null ? { time: t as UTCTimestamp } : { time: t as UTCTimestamp, value: s[i] as number })); }

const baseOpts = (h?: number): any => ({
  layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7C88A6', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 },
  grid: { vertLines: { color: 'rgba(124,140,255,.045)' }, horzLines: { color: 'rgba(124,140,255,.055)' } },
  crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(124,140,255,.5)', labelBackgroundColor: '#26314F' }, horzLine: { color: 'rgba(124,140,255,.5)', labelBackgroundColor: '#26314F' } },
  rightPriceScale: { borderColor: 'rgba(124,140,255,.12)', scaleMargins: { top: 0.08, bottom: 0.08 } },
  timeScale: { borderColor: 'rgba(124,140,255,.12)', timeVisible: true, secondsVisible: false, rightOffset: 6 },
  localization: { timeFormatter: (t: any) => fmtTime(Number(t), 'full') },
  ...(h ? { height: h } : {}),
});

export function PriceChart() {
  const selected = useGame((s) => s.selected);
  const tf = useGame((s) => s.tf);
  const indicators = useGame((s) => s.indicators);
  const tool = useGame((s) => s.tool);
  const showPatterns = useGame((s) => s.snap?.player.settings.showPatterns ?? true);
  const rep = useGame((s) => s.snap?.player.reputation ?? 0);
  const price = useGame((s) => s.snap?.prices[selected]);
  const positions = useGame((s) => s.snap?.positions);
  const drawings = useGame((s) => s.snap?.player.drawings[selected]);
  const def = CATALOG_MAP[selected];

  const host = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  const refs = useRef<{ candle: any; vol: any; over: Record<string, any>; lines: any[]; drawLines: any[]; drawSeries: any[]; pendingTrend: { time: number; price: number } | null }>({ candle: null, vol: null, over: {}, lines: [], drawLines: [], drawSeries: [], pendingTrend: null });
  const [legend, setLegend] = useState<{ o: number; h: number; l: number; c: number } | null>(null);
  const [pattern, setPattern] = useState<string>('');
  const unlocked = (id: string) => !ADVANCED.includes(id) || rep >= 25;

  // ---- create chart once -----------------------------------------------------------------------
  useEffect(() => {
    if (!host.current) return;
    const ch = createChart(host.current, { ...baseOpts(), autoSize: true, timeScale: { ...baseOpts().timeScale, tickMarkFormatter: (t: any) => fmtTime(Number(t), useGame.getState().tf) } });
    const candle = ch.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN, priceLineColor: '#7C8CFF' });
    const vol = ch.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    refs.current.candle = candle; refs.current.vol = vol;
    ch.subscribeCrosshairMove((p: any) => {
      const d = p?.seriesData?.get?.(candle);
      if (d) setLegend({ o: d.open, h: d.high, l: d.low, c: d.close }); else setLegend(null);
    });
    ch.subscribeClick((p: any) => {
      const st = useGame.getState();
      if (st.tool === 'cursor' || !p.point || p.time === undefined) return;
      const pr = candle.coordinateToPrice(p.point.y);
      if (pr === null || pr === undefined) return;
      const sel = st.selected;
      const cur = game.player.drawings[sel] ?? [];
      const id = 'D' + Date.now();
      if (st.tool === 'trend') {
        const r = refs.current;
        if (!r.pendingTrend) { r.pendingTrend = { time: p.time as number, price: pr }; return; }
        const a = r.pendingTrend, b = { time: p.time as number, price: pr };
        r.pendingTrend = null;
        game.setDrawings(sel, [...cur, { id, kind: 'trend', p1: a, p2: b }]);
        useGame.setState({ tool: 'cursor' });
      } else {
        game.setDrawings(sel, [...cur, { id, kind: st.tool, p1: { time: p.time as number, price: pr } }]);
        useGame.setState({ tool: 'cursor' });
      }
    });
    setChart(ch);
    return () => { ch.remove(); setChart(null); refs.current = { candle: null, vol: null, over: {}, lines: [], drawLines: [], drawSeries: [], pendingTrend: null }; };
  }, []);

  // precision follows the instrument
  useEffect(() => {
    if (!chart || !refs.current.candle) return;
    refs.current.candle.applyOptions({ priceFormat: { type: 'price', precision: def.decimals, minMove: 1 / 10 ** def.decimals } });
  }, [chart, selected, def.decimals]);

  // ---- data ---------------------------------------------------------------------------------------
  const wantVol = indicators.includes('VOL');
  const overlayIds = useMemo(() => OVERLAYS.filter((o) => indicators.includes(o) && unlocked(o)), [indicators, rep]);
  const paint = (full: boolean, overlays = full) => {
    const r = refs.current;
    if (!chart || !r.candle) return;
    const arr = game.world.asset(selected).candles[tf];
    if (!arr.length) { r.candle.setData([]); r.vol.setData([]); return; }
    if (full) {
      r.candle.setData(arr.map(toBar));
      r.vol.setData(wantVol ? arr.map(toVol) : []);
    } else {
      const last = arr[arr.length - 1];
      r.candle.update(toBar(last));
      if (wantVol) r.vol.update(toVol(last));
    }
    if (!overlays) return;
    const times = arr.map((c) => c.t);
    const closes = arr.map((c) => c.c);
    const set = (id: string, color: string, s: Series, width = 1.5, dash?: number) => {
      if (!r.over[id]) r.over[id] = chart.addLineSeries({ color, lineWidth: width as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...(dash ? { lineStyle: dash } : {}) });
      r.over[id].setData(lineData(times, s));
    };
    for (const id of Object.keys(r.over)) if (!overlayIds.includes(id) && !(id.startsWith('BB') && overlayIds.includes('BB'))) { chart.removeSeries(r.over[id]); delete r.over[id]; }
    if (overlayIds.includes('SMA20')) set('SMA20', '#F4B740', sma(closes, 20));
    if (overlayIds.includes('SMA50')) set('SMA50', '#C77DFF', sma(closes, 50));
    if (overlayIds.includes('EMA20')) set('EMA20', '#4FD8F0', ema(closes, 20));
    if (overlayIds.includes('EMA50')) set('EMA50', '#7C8CFF', ema(closes, 50));
    if (overlayIds.includes('VWAP')) set('VWAP', '#FF9F43', vwap(arr, TF_SECONDS[tf] < 86400 ? 86400 : null), 1.5, LineStyle.Dashed);
    if (overlayIds.includes('BB')) { const b = bollinger(closes, 20, 2); set('BBU', 'rgba(124,140,255,.75)', b.up, 1); set('BBM', 'rgba(124,140,255,.4)', b.mid, 1, LineStyle.Dotted); set('BBL', 'rgba(124,140,255,.75)', b.lo, 1); }
    if (full) chart.timeScale().fitContent();
    // markers: patterns + trades
    const markers: any[] = [];
    if (showPatterns && arr.length > 40) {
      const hits = detectPatterns(arr, Math.min(60, arr.length - 22));
      const seen = new Set<number>();
      for (const h of hits) {
        if (seen.has(h.index) || h.name === 'Consolidation' || h.name === 'Pullback' || h.name === 'Inside Bar' || h.name === 'Reversal') continue;
        seen.add(h.index);
        markers.push({ time: arr[h.index].t as UTCTimestamp, position: h.bias === 'bear' ? 'aboveBar' : 'belowBar', color: h.bias === 'bull' ? UP : h.bias === 'bear' ? DOWN : '#7C88A6', shape: h.bias === 'bull' ? 'arrowUp' : h.bias === 'bear' ? 'arrowDown' : 'circle', text: h.name === 'Bullish Engulfing' ? 'Engulf' : h.name === 'Bearish Engulfing' ? 'Engulf' : h.name === 'Shooting Star' ? 'Star' : h.name });
      }
      const lastHits = detectPatterns(arr, 2).filter((h) => h.index === arr.length - 1).map((h) => h.name);
      setPattern(lastHits.join(' · '));
    } else setPattern('');
    for (const t of game.player.trades.slice(-40)) {
      if (t.assetId !== selected) continue;
      const bucket = (x: number) => { const p = TF_SECONDS[tf]; return Math.floor(x / p) * p; };
      markers.push({ time: bucket(t.openT) as UTCTimestamp, position: t.side === 'LONG' ? 'belowBar' : 'aboveBar', color: '#7C8CFF', shape: t.side === 'LONG' ? 'arrowUp' : 'arrowDown', text: t.side === 'LONG' ? 'B' : 'S' });
    }
    markers.sort((a, b) => a.time - b.time);
    // lightweight-charts requires unique-ordered markers per time; drop duplicates on the same bar
    const uniq: any[] = []; for (const m of markers) if (!uniq.length || uniq[uniq.length - 1].time !== m.time) uniq.push(m);
    r.candle.setMarkers(uniq);
  };

  useEffect(() => { paint(true); }, [chart, selected, tf, overlayIds.join(','), wantVol, showPatterns]);
  useEffect(() => {
    if (!chart) return;
    let last = 0, lastFull = 0;
    return game.subscribeFast(() => {
      const now = performance.now();
      if (now - last < 90) return;
      last = now;
      const slow = now - lastFull > 1200;     // overlays/markers refresh ~1/s; the live candle every ~90ms
      if (slow) lastFull = now;
      paint(false, slow);
    });
  }, [chart, selected, tf, overlayIds.join(','), wantVol, showPatterns]);

  // ---- position lines ---------------------------------------------------------------------------------
  const posKey = (positions ?? []).filter((p) => p.assetId === selected).map((p) => `${p.id}:${p.sl}:${p.tp}`).join('|');
  useEffect(() => {
    const r = refs.current;
    if (!r.candle) return;
    for (const l of r.lines) { try { r.candle.removePriceLine(l); } catch { /* gone */ } }
    r.lines = [];
    for (const p of (positions ?? []).filter((x) => x.assetId === selected)) {
      const col = p.side === 'LONG' ? UP : DOWN;
      r.lines.push(r.candle.createPriceLine({ price: p.entry, color: col, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `${p.side === 'LONG' ? 'BUY' : 'SELL'} ${p.leverage}x` }));
      if (p.sl) r.lines.push(r.candle.createPriceLine({ price: p.sl, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'SL' }));
      if (p.tp) r.lines.push(r.candle.createPriceLine({ price: p.tp, color: UP, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'TP' }));
    }
  }, [chart, selected, posKey]);

  // ---- drawings ------------------------------------------------------------------------------------------
  useEffect(() => {
    const r = refs.current;
    if (!chart || !r.candle) return;
    for (const l of r.drawLines) { try { r.candle.removePriceLine(l); } catch { /* gone */ } }
    for (const s of r.drawSeries) { try { chart.removeSeries(s); } catch { /* gone */ } }
    r.drawLines = []; r.drawSeries = [];
    for (const d of drawings ?? []) {
      if (d.kind === 'trend' && d.p2) {
        const s = chart.addLineSeries({ color: '#F4B740', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        const pts = [d.p1, d.p2].sort((a, b) => a.time - b.time).map((p) => ({ time: p.time as UTCTimestamp, value: p.price }));
        if (pts[0].time !== pts[1].time) s.setData(pts);
        r.drawSeries.push(s);
      } else {
        const cfg = d.kind === 'support' ? { color: UP, title: 'Support', style: LineStyle.Dotted } : d.kind === 'resistance' ? { color: DOWN, title: 'Resistance', style: LineStyle.Dotted } : { color: '#A9B3CC', title: '', style: LineStyle.Dashed };
        r.drawLines.push(r.candle.createPriceLine({ price: d.p1.price, color: cfg.color, lineWidth: 1, lineStyle: cfg.style, axisLabelVisible: true, title: cfg.title }));
      }
    }
  }, [chart, selected, drawings]);

  const paneIds = PANES.filter((p) => p !== 'VOL' && indicators.includes(p) && unlocked(p));
  const last = price;
  const regimeGroup = def.cls === 'stock' || def.cls === 'index' ? 'EQUITY' : def.cls === 'crypto' ? 'CRYPTO' : def.cls === 'forex' || def.cls === 'bond' ? 'FOREX' : 'COMMODITY';
  const reg = REGIMES[game.world.s.market.regimes[regimeGroup].current];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar tf={tf} indicators={indicators} tool={tool} rep={rep} hasDrawings={!!drawings?.length} selected={selected} />
      <div className="relative min-h-0 flex-1">
        <div ref={host} className={cn('absolute inset-0', tool !== 'cursor' && 'cursor-crosshair')} />
        <div className="pointer-events-none absolute left-3 top-2 z-10 max-w-[80%]">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold">{def.name}</span>
            <span className="text-[11px] text-mute">{def.id} · {tf}</span>
            {last ? <FlashNum value={last.price} text={px(last.price, def.decimals)} className="text-[15px] font-medium" /> : null}
            {last ? <span className={cn('num text-[12px]', last.changePct >= 0 ? 'text-up' : 'text-down')}>{pct(last.changePct)}</span> : null}
          </div>
          <div className="num mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-mute">
            {legend ? (<><span>O <b className="font-normal text-soft">{px(legend.o, def.decimals)}</b></span><span>H <b className="font-normal text-soft">{px(legend.h, def.decimals)}</b></span><span>L <b className="font-normal text-soft">{px(legend.l, def.decimals)}</b></span><span>C <b className="font-normal text-soft">{px(legend.c, def.decimals)}</b></span></>) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="chip bg-white/5 text-mute"><span className="h-1.5 w-1.5 rounded-full" style={{ background: reg.color }} />{reg.label}</span>
            {pattern ? <span className="chip bg-brand/15 text-brand">{pattern}</span> : null}
            {last && !last.open ? <span className="chip bg-warn/15 text-warn">Market closed</span> : null}
            {last && last.status === 'HALTED' ? <span className="chip bg-down/15 text-down">Halted</span> : null}
            {tool !== 'cursor' ? <span className="chip bg-warn/15 text-warn">{tool === 'trend' ? 'Click two points' : 'Click to place'}</span> : null}
          </div>
        </div>
      </div>
      {paneIds.map((id) => <IndicatorPane key={id} kind={id} main={chart} />)}
    </div>
  );
}

function Toolbar({ tf, indicators, tool, rep, hasDrawings, selected }: { tf: TimeframeId; indicators: string[]; tool: string; rep: number; hasDrawings: boolean; selected: string }) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => useGame.setState({ indicators: indicators.includes(id) ? indicators.filter((x) => x !== id) : [...indicators, id] });
  return (
    <div className="relative flex shrink-0 flex-wrap items-center gap-1 border-b border-white/5 px-2 py-1.5">
      <div className="flex gap-0.5">
        {TIMEFRAMES.map((t) => <button key={t} onClick={() => useGame.setState({ tf: t })} className={cn('num rounded-md px-2 py-1 text-[11.5px]', tf === t ? 'bg-brand/20 text-snow' : 'text-mute hover:bg-white/5 hover:text-soft')}>{t}</button>)}
      </div>
      <div className="mx-1 h-4 w-px bg-white/10" />
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost !px-2 !py-1 text-[12px]">ƒ Indicators <span className="text-mute">{indicators.length}</span></button>
      <div className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
      <div className="flex gap-0.5">
        {([['cursor', '↖', 'Cursor'], ['hline', '—', 'Horizontal line'], ['support', '⌄', 'Support'], ['resistance', '⌃', 'Resistance'], ['trend', '⟋', 'Trendline']] as const).map(([id, ic, tt]) => (
          <button key={id} title={tt} onClick={() => useGame.setState({ tool: id })} className={cn('grid h-7 w-7 place-items-center rounded-md text-[13px]', tool === id ? 'bg-warn/20 text-warn' : 'text-mute hover:bg-white/5 hover:text-soft')}>{ic}</button>
        ))}
        {hasDrawings ? <button title="Clear drawings" onClick={() => game.setDrawings(selected, [])} className="grid h-7 w-7 place-items-center rounded-md text-[12px] text-mute hover:bg-down/15 hover:text-down">⌫</button> : null}
      </div>
      {open ? (
        <div className="glass absolute left-2 top-full z-30 mt-1 w-64 rounded-xl p-2 shadow-2xl">
          <div className="px-1 pb-1 text-[11px] text-mute">Overlays</div>
          <div className="mb-2 flex flex-wrap gap-1">{OVERLAYS.map((o) => { const locked = ADVANCED.includes(o) && rep < 25; return <button key={o} disabled={locked} onClick={() => toggle(o)} className={cn('chip !px-2 !py-1 text-[11.5px]', indicators.includes(o) ? 'bg-brand/25 text-snow' : 'bg-white/5 text-mute', locked && 'opacity-40')}>{o}{locked ? ' 🔒' : ''}</button>; })}</div>
          <div className="px-1 pb-1 text-[11px] text-mute">Panes</div>
          <div className="flex flex-wrap gap-1">{PANES.map((o) => { const locked = ADVANCED.includes(o) && rep < 25; return <button key={o} disabled={locked} onClick={() => toggle(o)} className={cn('chip !px-2 !py-1 text-[11.5px]', indicators.includes(o) ? 'bg-brand/25 text-snow' : 'bg-white/5 text-mute', locked && 'opacity-40')}>{o}{locked ? ' 🔒' : ''}</button>; })}</div>
          {rep < 25 ? <div className="mt-2 rounded-lg bg-white/5 p-2 text-[11px] text-mute">Advanced tools (Bollinger, VWAP, MACD, ATR) unlock at reputation 25. Complete missions and trade with a stop loss to earn it.</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function IndicatorPane({ kind, main }: { kind: string; main: IChartApi | null }) {
  const host = useRef<HTMLDivElement>(null);
  const selected = useGame((s) => s.selected);
  const tf = useGame((s) => s.tf);
  const ref = useRef<{ chart: IChartApi | null; s: any[] }>({ chart: null, s: [] });
  useEffect(() => {
    if (!host.current || !main) return;
    const ch = createChart(host.current, { ...baseOpts(), autoSize: true, rightPriceScale: { borderColor: 'rgba(124,140,255,.12)', scaleMargins: { top: 0.15, bottom: 0.15 } }, timeScale: { ...baseOpts().timeScale, visible: false, tickMarkFormatter: (t: any) => fmtTime(Number(t), useGame.getState().tf) }, crosshair: { ...baseOpts().crosshair, mode: CrosshairMode.Normal } });
    ref.current.chart = ch; ref.current.s = [];
    if (kind === 'RSI') {
      const s = ch.addLineSeries({ color: '#C77DFF', lineWidth: 1.5 as any, priceLineVisible: false, lastValueVisible: true });
      s.createPriceLine({ price: 70, color: 'rgba(255,92,116,.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
      s.createPriceLine({ price: 30, color: 'rgba(46,211,160,.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
      ref.current.s = [s];
    } else if (kind === 'MACD') {
      ref.current.s = [ch.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }), ch.addLineSeries({ color: '#4FD8F0', lineWidth: 1.5 as any, priceLineVisible: false, lastValueVisible: false }), ch.addLineSeries({ color: '#F4B740', lineWidth: 1.5 as any, priceLineVisible: false, lastValueVisible: false })];
    } else ref.current.s = [ch.addLineSeries({ color: '#F4B740', lineWidth: 1.5 as any, priceLineVisible: false, lastValueVisible: true })];
    const sync = (r: any) => { if (r) ch.timeScale().setVisibleLogicalRange(r); };
    main.timeScale().subscribeVisibleLogicalRangeChange(sync);
    const cur = main.timeScale().getVisibleLogicalRange();
    if (cur) ch.timeScale().setVisibleLogicalRange(cur);
    return () => { main.timeScale().unsubscribeVisibleLogicalRangeChange(sync); ch.remove(); ref.current.chart = null; };
  }, [main, kind]);
  const paint = () => {
    const arr = game.world.asset(selected).candles[tf];
    const st = ref.current.s; if (!st.length || !arr.length) return;
    const times = arr.map((c) => c.t), closes = arr.map((c) => c.c);
    if (kind === 'RSI') st[0].setData(lineData(times, rsi(closes, 14)));
    else if (kind === 'ATR') st[0].setData(lineData(times, atr(arr, 14)));
    else if (kind === 'MACD') {
      const m = macd(closes);
      st[0].setData(times.map((t, i) => (m.hist[i] === null ? { time: t as UTCTimestamp } : { time: t as UTCTimestamp, value: m.hist[i] as number, color: (m.hist[i] as number) >= 0 ? 'rgba(46,211,160,.5)' : 'rgba(255,92,116,.5)' })));
      st[1].setData(lineData(times, m.macd)); st[2].setData(lineData(times, m.signal));
    }
  };
  useEffect(() => { paint(); }, [main, selected, tf, kind]);
  useEffect(() => {
    let last = 0;
    return game.subscribeFast(() => { const n = performance.now(); if (n - last > 700) { last = n; paint(); } });
  }, [selected, tf, kind, main]);
  return (
    <div className="relative h-[92px] shrink-0 border-t border-white/5">
      <span className="pointer-events-none absolute left-2 top-1 z-10 text-[10.5px] font-medium text-mute">{kind}{kind === 'RSI' ? ' 14' : kind === 'ATR' ? ' 14' : ' 12 26 9'}</span>
      <div ref={host} className="absolute inset-0" />
    </div>
  );
}
