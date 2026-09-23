import type { World } from '@/engine/world';
import type { TimeframeId } from '@/types';
import { CATALOG_MAP } from '@/engine/catalog';
import { atr, detectPatterns, ema, rsi, sma } from '@/engine/indicators';
import { REGIMES } from '@/engine/regimes';
import { epsTTM, peOf } from '@/engine/companyEngine';
import { fmtGameTime } from '@/engine/time';

export interface AiReadout { headline: string; lines: string[]; tags: { label: string; tone: 'up' | 'down' | 'neutral' | 'warn' }[] }

/** CLINT AI: descriptive, never prescriptive. Reads price, trend, volume, news, sentiment and indicators. */
export function analyze(w: World, assetId: string, tf: TimeframeId): AiReadout {
  const def = CATALOG_MAP[assetId];
  const a = w.asset(assetId);
  const c = a.candles[tf];
  const lines: string[] = [];
  const tags: AiReadout['tags'] = [];
  if (!def || c.length < 30) return { headline: `${def?.name ?? assetId}`, lines: ['Not enough history on this timeframe yet.'], tags };
  const closes = c.map((x) => x.c);
  const last = closes[closes.length - 1];
  const e20 = ema(closes, 20), e50 = ema(closes, 50), s200 = sma(closes, Math.min(100, closes.length));
  const r = rsi(closes, 14);
  const at = atr(c, 14);
  const rv = r[r.length - 1] ?? 50;
  const a1 = at[at.length - 1] ?? 0;
  const aAvg = (() => { let s = 0, n = 0; for (let i = Math.max(0, at.length - 60); i < at.length; i++) if (at[i] !== null) { s += at[i] as number; n++; } return n ? s / n : a1; })();
  const grp = def.cls === 'stock' || def.cls === 'index' ? 'EQUITY' : def.cls === 'crypto' ? 'CRYPTO' : def.cls === 'forex' || def.cls === 'bond' ? 'FOREX' : 'COMMODITY';
  const reg = REGIMES[w.s.market.regimes[grp].current];
  const v20 = e20[e20.length - 1] ?? last, v50 = e50[e50.length - 1] ?? last;
  const slope = ((e20[e20.length - 1] ?? last) - (e20[e20.length - 6] ?? last)) / last;

  const trend = last > v20 && v20 > v50 ? 'up' : last < v20 && v20 < v50 ? 'down' : 'mixed';
  const volRatio = aAvg > 0 ? a1 / aAvg : 1;
  const volDesc = volRatio > 1.4 ? 'an elevated-volatility environment' : volRatio < 0.75 ? 'a low-volatility environment' : 'a normal volatility environment';
  const momDesc = rv > 68 ? 'RSI is approaching an overbought region' : rv < 32 ? 'RSI is in oversold territory' : rv > 55 ? 'momentum is mildly positive' : rv < 45 ? 'momentum is mildly negative' : 'momentum is neutral';
  lines.push(`${def.name} is currently in ${volDesc}. ${trend === 'up' ? 'Price sits above its short and medium averages, and the trend is rising' : trend === 'down' ? 'Price sits below its short and medium averages, and the trend is falling' : 'Price is between its moving averages, so the trend is unclear'}, while ${momDesc} (RSI ${rv.toFixed(0)}).`);
  if (Math.abs(slope) > 0.0002) tags.push({ label: slope > 0 ? 'Trend up' : 'Trend down', tone: slope > 0 ? 'up' : 'down' });
  tags.push({ label: `${reg.label} regime`, tone: reg.drift > 0.1 ? 'up' : reg.drift < -0.1 ? 'down' : 'neutral' });
  if (rv > 68) tags.push({ label: 'Overbought', tone: 'warn' }); else if (rv < 32) tags.push({ label: 'Oversold', tone: 'warn' });
  if (volRatio > 1.4) tags.push({ label: 'High volatility', tone: 'warn' });

  const vols = c.slice(-20).map((x) => x.v);
  const vAvg = vols.slice(0, -1).reduce((s, x) => s + x, 0) / Math.max(1, vols.length - 1);
  const vNow = vols[vols.length - 1];
  if (vAvg > 0 && vNow / vAvg > 1.8) lines.push('Volume on the latest bar is well above its recent average, which often accompanies decisive moves.');
  else if (vAvg > 0 && vNow / vAvg < 0.5) lines.push('Volume is thin compared with recent bars, so moves carry less conviction.');

  const pats = detectPatterns(c, 2);
  if (pats.length) { const pn = pats.slice(-2).map((p) => p.name + (p.bias === 'bull' ? ' (bullish bias)' : p.bias === 'bear' ? ' (bearish bias)' : '')); lines.push(`Recent candle structure: ${pn.join(', ')}. Patterns describe what happened; they do not promise what comes next.`); }
  const s200v = s200[s200.length - 1];
  if (s200v) lines.push(`Price is ${((last / s200v - 1) * 100).toFixed(1)}% ${last >= s200v ? 'above' : 'below'} its long-run average.`);

  const sentV = a.sentiment;
  lines.push(`Market sentiment for this asset reads ${sentV > 0.5 ? 'strongly positive' : sentV > 0.2 ? 'positive' : sentV < -0.5 ? 'strongly negative' : sentV < -0.2 ? 'negative' : 'neutral'}. The ${grp.toLowerCase()} regime is ${reg.label.toLowerCase()}: ${reg.desc.toLowerCase()}`);
  if (a.bubble > 0.55) { lines.push('Valuation, sentiment and momentum are all stretched. Stretched markets can correct sharply, but they can also run further than expected.'); tags.push({ label: 'Bubble risk', tone: 'warn' }); }

  const recent = w.s.news.filter((n) => n.affected.some((x) => x.assetId === assetId) && w.t - n.t < 86400).slice(-2);
  if (recent.length) lines.push(`Recent headline${recent.length > 1 ? 's' : ''}: ${recent.map((n) => `"${n.headline}" (${n.reliability.toLowerCase()})`).join('; ')}.`);
  const evs = w.s.calendar.filter((e) => !e.released && e.t > w.t && e.t - w.t < 6 * 3600 && (e.tags.some((tg) => def.tags.includes(tg)) || e.tags.includes(assetId)) && (e.impact === 'HIGH' || e.impact === 'EXTREME'));
  if (evs.length) { lines.push(`Upcoming: ${evs[0].name} at ${fmtGameTime(evs[0].t)}. Liquidity often thins and spreads widen just before major releases.`); tags.push({ label: 'Event risk', tone: 'warn' }); }
  if (def.cls === 'stock' && w.s.companies[def.id]) {
    const co = w.s.companies[def.id];
    const pe = peOf(co, a.price);
    if (pe) lines.push(`Valuation: P/E ${pe.toFixed(1)} against a baseline of ${co.pe0}. EPS (TTM) $${epsTTM(co).toFixed(2)}. ${pe > co.pe0 * 1.3 ? 'The stock trades at a premium, so good news may already be priced in.' : pe < co.pe0 * 0.8 ? 'The stock trades at a discount to its usual multiple.' : 'Valuation is close to its usual range.'}`);
    if (co.status === 'WARNING') { lines.push('The company has a bankruptcy warning outstanding. Risk of severe losses is elevated.'); tags.push({ label: 'Bankruptcy warning', tone: 'down' }); }
  }
  if (a.spread > def.baseSpread * 2.5) lines.push('Spreads are wide relative to normal, which raises the cost of entering and exiting.');
  return { headline: `${def.name} outlook (${tf})`, lines, tags };
}
