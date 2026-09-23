import type { AssetState, FactorId, NewsCategory, NewsImpact, NewsItem, NewsReliability } from '@/types';
import { CATALOG, CATALOG_MAP, STOCK_SEEDS, SECTOR_FACTOR, FACTORS } from './catalog';
import { NEWS_MAP, NEWS_TEMPLATES, type NewsCtx, type NewsTemplate } from './newsTemplates';
import { addImpulse, shockAsset, shockFactor, type MarketState } from './marketEngine';
import type { Rng } from './rng';
import { dayIndexOf } from './time';

let NEWS_SEQ = 0;
export const NEWS_FACTOR_SCALE = 0.38;
export const NEWS_DIRECT_SCALE = 0.62;
export function setNewsSeq(n: number): void { NEWS_SEQ = n; }
export function getNewsSeq(): number { return NEWS_SEQ; }

export const RELIABILITY_POWER: Record<NewsReliability, number> = { OFFICIAL: 1.0, CONFIRMED: 0.9, BREAKING: 0.8, RUMOR: 0.42, SPECULATION: 0.22 };

export interface NewsWorld {
  market: MarketState;
  rng: Rng;
  t: number;
  activeCompanyIds: () => string[];
  companyName: (id: string) => string;
  sentiment: number;
  diffVol: number;
}

const COINS = CATALOG.filter((a) => a.cls === 'crypto').map((a) => ({ id: a.id, name: a.name }));
const SECTOR_LABELS: { label: string; factor: FactorId }[] = [
  { label: 'technology', factor: 'S_TECH' }, { label: 'banking', factor: 'S_BANKING' }, { label: 'energy', factor: 'S_ENERGY' },
  { label: 'healthcare', factor: 'S_HEALTH' }, { label: 'auto', factor: 'S_AUTO' }, { label: 'gaming', factor: 'S_GAMING' },
  { label: 'AI', factor: 'S_AI' }, { label: 'retail', factor: 'S_RETAIL' }, { label: 'telecom', factor: 'S_TELECOM' },
];

function makeCtx(w: NewsWorld): NewsCtx {
  const rng = w.rng;
  return {
    n: (a, b, d = 1) => Number((a + (b - a) * rng.next()).toFixed(d)),
    pick: (arr) => rng.pick(arr),
    company: () => {
      const ids = w.activeCompanyIds();
      const id = ids.length ? rng.pick(ids) : STOCK_SEEDS[0].id;
      const def = CATALOG_MAP[id];
      return { id, name: w.companyName(id), sector: def?.sector ?? 'TECH', factor: def?.sector ? SECTOR_FACTOR[def.sector] : null };
    },
    coin: () => rng.pick(COINS),
    sector: () => rng.pick(SECTOR_LABELS),
  };
}

/** Expected % impact of a set of factor shocks + direct impact per asset, derived from the relationship network. */
export function expectedImpacts(shocks: Partial<Record<FactorId, number>>, direct: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of CATALOG) {
    if (d.cls === 'index') continue;
    let e = 0;
    for (const k in shocks) e += ((d.loadings[k as FactorId] ?? 0) * (shocks[k as FactorId] ?? 0));
    e += direct[d.id] ?? 0;
    if (Math.abs(e) > 1e-9) out[d.id] = e;
  }
  // indices as weighted average of constituents
  for (const d of CATALOG) {
    if (d.cls !== 'index' || !d.constituents) continue;
    let e = 0;
    for (const c of d.constituents) e += (out[c.id] ?? 0) * c.w;
    if (Math.abs(e) > 1e-9) out[d.id] = e;
  }
  return out;
}

export interface NewsResult { item: NewsItem; followups: { templateId: string; t: number; parentId: string }[] }

/**
 * Create a news item and apply its market effect:
 *  1. reliability decides how much of the expected effect is realised (rumours are weak, official news strong)
 *  2. the reaction is scaled by asset news-sensitivity, regime and market positioning ("priced in")
 *  3. a small chance of reversal models "buy the rumour, sell the news"
 *  4. effects flow through the factor network (chain reaction), plus direct company/coin effects
 */
export function publishNews(
  w: NewsWorld, tpl: NewsTemplate, opts: { sev?: number; sign?: number; reliability?: NewsReliability; parentId?: string; forceTarget?: string; overrideHeadline?: string; overrideBody?: string; noImpact?: boolean } = {},
): NewsResult {
  const { rng, market } = w;
  const ctx = makeCtx(w);
  const sev = opts.sev ?? Math.max(tpl.sev[0], Math.min(tpl.sev[1], Math.round(rng.range(tpl.sev[0], tpl.sev[1] + 0.49))));
  const sign = opts.sign ?? (tpl.dir === 0 ? (rng.chance(0.5) ? 1 : -1) : tpl.dir);
  const relW = tpl.rel ?? { CONFIRMED: 4, BREAKING: 2 };
  const reliability: NewsReliability = opts.reliability ?? (Object.entries(relW) as [NewsReliability, number][]).reduce((best, cur, _i, arr) => {
    void best; return rng.weighted(arr, (x) => x[1]);
  })[0];
  const cred = RELIABILITY_POWER[reliability];

  let tgt: { id: string; name: string } | null = null;
  if (tpl.target === 'company') { const c = ctx.company(); tgt = { id: c.id, name: c.name }; }
  if (tpl.target === 'coin') tgt = ctx.coin();
  if (opts.forceTarget) tgt = { id: opts.forceTarget, name: CATALOG_MAP[opts.forceTarget]?.name ?? opts.forceTarget };

  const headline = opts.overrideHeadline ?? tpl.headline(ctx, { name: tgt?.name ?? '', sev, sign });
  const sevBase = Math.pow(sev, 1.15);
  const sevScale = sevBase * NEWS_FACTOR_SCALE;      // factor shocks are scaled to factor volatility
  const dirScale = sevBase * NEWS_DIRECT_SCALE;      // direct company/coin shocks

  // expected shocks: "what the narrative implies" (before positioning/randomness), in factor % units and direct % units
  const shocksExp: Partial<Record<FactorId, number>> = {};
  for (const k in tpl.shocks) shocksExp[k as FactorId] = (tpl.shocks[k as FactorId] as number) * sevScale * sign * cred;
  const directExp: Record<string, number> = {};
  if (tgt && tpl.targetShock) directExp[tgt.id] = tpl.targetShock * dirScale * sign * cred * (CATALOG_MAP[tgt.id]?.newsSens ?? 1) * (CATALOG_MAP[tgt.id]?.cls === 'crypto' ? 1.5 : 1);
  const expected = expectedImpacts(shocksExp, directExp);

  // measured baseline prices for later "actual" comparison
  const priceAtPublish: Record<string, number> = {};
  const ranked = Object.entries(expected).filter(([id]) => market.assets[id]?.status === 'ACTIVE').sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  const affected: NewsImpact[] = ranked.map(([id, e]) => { priceAtPublish[id] = market.assets[id].price; return { assetId: id, expected: Math.round(e * 100) / 100 }; });

  if (!opts.noImpact) {
    // --- realise the reaction ---
    const gsent = w.sentiment;
    // positioning: if sentiment already extreme in the direction of the news, the reaction is dampened; reversal odds rise
    const align = gsent * sign;
    const damp = align > 0.35 ? 1 - Math.min(0.55, (align - 0.35) * 0.9) : align < -0.35 ? 1 + Math.min(0.45, (-align - 0.35) * 0.6) : 1;
    const reversalP = 0.06 + Math.max(0, align - 0.3) * 0.28 + (reliability === 'RUMOR' ? 0.08 : 0);
    const reversed = rng.chance(reversalP);
    const reaction = (reversed ? -0.55 : 1) * damp * Math.exp(rng.gauss() * 0.28);
    const horizon = tpl.horizon ?? 150;
    const fireShocks = () => {
      for (const k in tpl.shocks) {
        const f = k as FactorId;
        const mag = (tpl.shocks[f] as number) * sevScale * sign * cred * reaction * 0.01;
        shockFactor(market, rng, w.t, f, mag, horizon);
      }
      if (tgt) {
        const a = market.assets[tgt.id];
        if (a && a.status === 'ACTIVE' && tpl.targetShock) {
          const mag = tpl.targetShock * dirScale * sign * cred * reaction * 0.01 * (CATALOG_MAP[tgt.id]?.newsSens ?? 1) * (CATALOG_MAP[tgt.id]?.cls === 'crypto' ? 1.5 : 1);
          shockAsset(market, tgt.id, mag, horizon);
          a.sentiment = clamp(a.sentiment + sign * 0.18 * cred * sev / 3, -1, 1);
          a.newsMemory += sign * sev * cred;
        }
      }
    };
    fireShocks();
    // vol / spread flurry for affected assets
    for (const af of affected) {
      const a = market.assets[af.assetId];
      a.volBoost = Math.min(3.5, a.volBoost + 0.15 * sev * cred);
      a.spreadBoost = Math.min(6, a.spreadBoost + 0.25 * sev * cred);
      a.sentiment = clamp(a.sentiment + Math.sign(af.expected) * 0.05 * sev * cred, -1, 1);
    }
    if (reversed) { /* remembered on the item for the "sell the news" tag */ }
    var reversedFlag = reversed;
  } else var reversedFlag = false;

  const category: NewsCategory = tpl.category;
  const item: NewsItem = {
    id: `N${++NEWS_SEQ}`, t: w.t, day: dayIndexOf(w.t), headline, body: opts.overrideBody ?? tpl.body ?? '', category,
    sentiment: sign * (tpl.dir === 0 ? 1 : 1) * Math.min(1, 0.25 * sev) * (tpl.shocks.RISK !== undefined && tpl.shocks.RISK < 0 ? -1 : 1),
    severity: sev, reliability, breaking: sev >= 3 && (reliability === 'BREAKING' || reliability === 'OFFICIAL' || sev >= 4),
    affected, priceAtPublish, resolveAt: w.t + Math.max(3600, (tpl.horizon ?? 150) * 60), resolved: false, parentId: opts.parentId,
    templateId: tpl.id, tags: [category], reversed: reversedFlag,
  };
  // sentiment as a market-direction signal: derive from the mean expected effect on major risk assets
  const riskMean = (['NEXA', 'BTC/USD', 'CLINT100'] as string[]).reduce((s, id) => s + (expected[id] ?? 0), 0);
  if (Math.abs(riskMean) > 0.001) item.sentiment = Math.max(-1, Math.min(1, riskMean * 0.4));
  else item.sentiment = sign * 0.05;

  const followups: NewsResult['followups'] = [];
  if (tpl.follow && !opts.noImpact) {
    for (const f of tpl.follow) if (rng.chance(f.p)) followups.push({ templateId: f.id, t: w.t + rng.range(f.delay[0], f.delay[1]) * 60, parentId: item.id });
  }
  return { item, followups };
}

function clamp(x: number, a: number, b: number): number { return Math.max(a, Math.min(b, x)); }

/** After the reaction window, measure what actually happened so the player can compare expected vs actual. */
export function resolveNews(item: NewsItem, assets: Record<string, AssetState>, now: number): void {
  let pending = 0;
  for (const af of item.affected) {
    if (af.actual !== undefined) continue;
    const a = assets[af.assetId];
    const p0 = item.priceAtPublish[af.assetId];
    if (!a || !p0) continue;
    // a closed market has not reacted yet: wait for the open (give up after 4 game-days)
    if (!a.open && now - item.t < 4 * 86400) { pending++; continue; }
    af.actual = Math.round(((a.price / p0) - 1) * 10000) / 100;
  }
  item.resolved = pending === 0;
}

/** Choose the next ambient news template, biased by the current world state. */
export function pickAmbientTemplate(w: NewsWorld, bias: { inflHigh: boolean; bubble: boolean }): NewsTemplate {
  const pool = NEWS_TEMPLATES.filter((t) => t.weight > 0);
  return w.rng.weighted(pool, (t) => {
    let m = t.weight;
    if (t.id === 'inflation_exp' && bias.inflHigh) m *= 1.6;
    if (t.id === 'sector_ai' && bias.bubble) m *= 1.4;
    return m;
  });
}

export function scriptedItem(w: NewsWorld, headline: string, body: string, category: NewsCategory = 'GLOBAL MARKET'): NewsItem {
  return {
    id: `N${++NEWS_SEQ}`, t: w.t, day: dayIndexOf(w.t), headline, body, category, sentiment: 0, severity: 1, reliability: 'OFFICIAL', breaking: false,
    affected: [], priceAtPublish: {}, resolveAt: w.t, resolved: true, templateId: 'scripted', tags: [category],
  };
}

export { NEWS_MAP, FACTORS, addImpulse };
