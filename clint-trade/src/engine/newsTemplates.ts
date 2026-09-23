import type { FactorId, NewsCategory, NewsReliability } from '@/types';

export interface NewsCtx {
  n: (a: number, b: number, d?: number) => number;         // random number in range
  pick: <T>(arr: readonly T[]) => T;
  company: () => { id: string; name: string; sector: string; factor: FactorId | null };
  coin: () => { id: string; name: string };
  sector: () => { label: string; factor: FactorId };
}

export interface NewsTemplate {
  id: string;
  category: NewsCategory;
  weight: number;
  sev: [number, number];
  dir: 1 | -1 | 0;                   // sign of the effect on risk assets (0 = random)
  shocks: Partial<Record<FactorId, number>>; // % move (of factor) per severity unit
  target?: 'company' | 'coin';
  targetShock?: number;              // % move on target asset per severity unit
  rel?: Partial<Record<NewsReliability, number>>;
  horizon?: number;                  // minutes of reaction
  headline: (c: NewsCtx, t: { name: string; sev: number; sign: number }) => string;
  body?: string;
  follow?: { id: string; delay: [number, number]; p: number }[];
  hours?: [number, number];          // typical local hours
}

const R = (o: Partial<Record<NewsReliability, number>>) => o;
const OFF = R({ OFFICIAL: 6, CONFIRMED: 4, BREAKING: 2 });
const MIX = R({ CONFIRMED: 4, BREAKING: 3, RUMOR: 2.2, SPECULATION: 1 });
const RUM = R({ RUMOR: 5, SPECULATION: 3, BREAKING: 1.5, CONFIRMED: 1 });

export const NEWS_TEMPLATES: NewsTemplate[] = [
  // --- economy / macro (ambient commentary, low severity) ---
  { id: 'calm_open', category: 'GLOBAL MARKET', weight: 5, sev: [1, 1], dir: 0, shocks: { RISK: 0.15 }, rel: OFF, horizon: 60,
    headline: (c, t) => t.sign > 0 ? 'Global stocks edge higher as traders position ahead of key data' : 'Global markets drift lower in quiet trade' },
  { id: 'consumer_conf', category: 'CONSUMER', weight: 4, sev: [1, 2], dir: 0, shocks: { GROWTH: 0.4, S_RETAIL: 0.5 }, rel: OFF, horizon: 120,
    headline: (c, t) => `Consumer confidence ${t.sign > 0 ? 'improves' : 'slips'} to ${c.n(92, 112, 1)}` },
  { id: 'housing', category: 'ECONOMY', weight: 3, sev: [1, 2], dir: 0, shocks: { GROWTH: 0.4, S_BANKING: 0.3 }, rel: OFF, horizon: 120,
    headline: (c, t) => `Housing starts ${t.sign > 0 ? 'climb' : 'fall'} ${c.n(1, 5, 1)}% as mortgage costs ${t.sign > 0 ? 'ease' : 'bite'}` },
  { id: 'inflation_exp', category: 'INFLATION', weight: 3, sev: [1, 3], dir: -1, shocks: { INFL: 0.8, RATES: 0.4, USD: 0.3, RISK: -0.3 }, rel: MIX, horizon: 180,
    headline: (c, t) => `Survey: consumers see ${t.sign < 0 ? 'higher' : 'lower'} inflation ahead at ${c.n(2.8, 5.4, 1)}%` },
  { id: 'trade_data', category: 'ECONOMY', weight: 3, sev: [1, 2], dir: 0, shocks: { GROWTH: 0.5, USD: -0.2 }, rel: OFF, horizon: 120,
    headline: (c, t) => `Trade deficit ${t.sign > 0 ? 'narrows' : 'widens'} to $${c.n(52, 86, 1)}B` },
  { id: 'central_bank_hint', category: 'CENTRAL BANK', weight: 3, sev: [2, 3], dir: 0, shocks: { RATES: 0.8, USD: 0.6, RISK: -0.7 }, rel: MIX, horizon: 150,
    headline: (c, t) => t.sign < 0 ? 'Policymakers hint at further tightening if price pressures persist' : 'Central bank officials signal patience as inflation cools' },
  { id: 'rate_expectations', category: 'INTEREST RATE', weight: 2.5, sev: [2, 3], dir: 0, shocks: { RATES: 0.9, USD: 0.5, RISK: -0.6 }, rel: MIX, horizon: 150,
    headline: (c, t) => `Futures price ${t.sign < 0 ? 'fewer' : 'more'} rate cuts this year after fresh economic data` },
  { id: 'employment_wage', category: 'EMPLOYMENT', weight: 2.5, sev: [1, 3], dir: -1, shocks: { INFL: 0.5, RATES: 0.5, USD: 0.3, GROWTH: 0.3 }, rel: OFF, horizon: 120,
    headline: (c, t) => `Wage growth ${t.sign < 0 ? 'accelerates' : 'cools'} to ${c.n(3.1, 5, 1)}% annualised` },
  { id: 'gdp_nowcast', category: 'GDP', weight: 2, sev: [1, 3], dir: 0, shocks: { GROWTH: 0.8, RISK: 0.5 }, rel: MIX, horizon: 150,
    headline: (c, t) => `Growth nowcast ${t.sign > 0 ? 'upgraded' : 'cut'} to ${c.n(0.6, 3.2, 1)}% for the quarter` },
  // --- energy / geopolitics ---
  { id: 'oil_supply', category: 'ENERGY', weight: 2.2, sev: [2, 4], dir: 1, shocks: { OIL: 2.2, S_ENERGY: 1.3, GEO: 0.3 }, rel: MIX, horizon: 240,
    headline: (c, t) => t.sign > 0 ? 'Oil supply disruption tightens crude market' : 'Crude inventories jump, easing supply worries',
    follow: [{ id: 'oil_followup_airlines', delay: [60, 240], p: 0.5 }] },
  { id: 'oil_followup_airlines', category: 'ENERGY', weight: 0, sev: [1, 2], dir: 0, shocks: { OIL: 0.3, S_AUTO: -0.4, INFL: 0.3 }, rel: OFF, horizon: 120,
    headline: () => 'Transport firms warn higher fuel costs will squeeze margins' },
  { id: 'nat_gas', category: 'ENERGY', weight: 2, sev: [1, 3], dir: 0, shocks: { OIL: 0.6, S_ENERGY: 0.5 }, rel: MIX, horizon: 180,
    headline: (c, t) => `Natural gas ${t.sign > 0 ? 'jumps' : 'slides'} on ${t.sign > 0 ? 'cold-weather forecasts' : 'record storage builds'}` },
  { id: 'geo_tension', category: 'GEOPOLITICS', weight: 2.2, sev: [2, 4], dir: -1, shocks: { GEO: 1.6, RISK: -0.8, OIL: 0.6 }, rel: MIX, horizon: 240,
    headline: (c, t) => t.sign < 0 ? 'Tensions flare after border incident; investors seek safety' : 'Diplomats report progress in regional security talks',
    follow: [{ id: 'flight_to_safety', delay: [30, 180], p: 0.55 }] },
  { id: 'flight_to_safety', category: 'GLOBAL MARKET', weight: 0, sev: [1, 2], dir: -1, shocks: { GEO: 0.8, RISK: -0.4 }, rel: OFF, horizon: 120,
    headline: () => 'Safe-haven demand lifts gold and government bonds' },
  { id: 'trade_tariff', category: 'GEOPOLITICS', weight: 1.6, sev: [2, 4], dir: -1, shocks: { GROWTH: -1.0, RISK: -0.9, USD: 0.4, GEO: 0.5 }, rel: MIX, horizon: 240,
    headline: (c, t) => t.sign < 0 ? 'New tariff threat rattles trade-sensitive sectors' : 'Trade truce lifts hopes for global growth' },
  // --- banking / regulation ---
  { id: 'bank_stress', category: 'BANKING', weight: 1.4, sev: [2, 4], dir: -1, shocks: { S_BANKING: 1.8, RISK: -0.7, RATES: -0.3 }, rel: RUM, horizon: 240,
    headline: (c, t) => 'Regulators probe regional lenders over loan-book risks' },
  { id: 'bank_profit', category: 'BANKING', weight: 2, sev: [1, 2], dir: 1, shocks: { S_BANKING: 0.9, RATES: 0.1 }, rel: OFF, horizon: 120,
    headline: () => 'Bank lending picks up as credit conditions stabilise' },
  { id: 'crypto_reg', category: 'REGULATION', weight: 2.4, sev: [2, 4], dir: 0, shocks: { CRYPTO: 2.4, RISK: 0.15 }, rel: MIX, horizon: 180,
    headline: (c, t) => t.sign > 0 ? 'Regulators outline clearer framework for digital assets' : 'Lawmakers push tougher rules on crypto exchanges' },
  { id: 'crypto_etf', category: 'CRYPTO', weight: 2, sev: [2, 4], dir: 0, shocks: { CRYPTO: 2.0, RISK: 0.2 }, rel: MIX, horizon: 240,
    headline: (c, t) => t.sign > 0 ? `Crypto funds record $${c.n(300, 1400, 0)}M of net inflows` : `Crypto funds see $${c.n(200, 900, 0)}M outflows` },
  { id: 'crypto_coin', category: 'CRYPTO', weight: 3, sev: [1, 3], dir: 0, target: 'coin', targetShock: 2.6, shocks: { CRYPTO: 0.2 }, rel: MIX, horizon: 150,
    headline: (c, t) => t.sign > 0 ? `${t.name} network activity hits multi-week high` : `${t.name} developers delay major upgrade` },
  { id: 'crypto_rumor', category: 'CRYPTO', weight: 2, sev: [1, 3], dir: 0, target: 'coin', targetShock: 3.4, shocks: {}, rel: RUM, horizon: 120,
    headline: (c, t) => t.sign > 0 ? `Rumor: major exchange preparing to list ${t.name} pairs` : `Speculation grows that large ${t.name} holders are preparing to sell` },
  // --- companies ---
  { id: 'co_product', category: 'COMPANY', weight: 3, sev: [1, 3], dir: 1, target: 'company', targetShock: 2.6, shocks: {}, rel: MIX, horizon: 180,
    headline: (c, t) => `${t.name} unveils ${c.pick(['new flagship product', 'next-generation platform', 'long-awaited update', 'major partnership'])}` },
  { id: 'co_downgrade', category: 'COMPANY', weight: 2.5, sev: [1, 3], dir: -1, target: 'company', targetShock: 2.6, shocks: {}, rel: MIX, horizon: 150,
    headline: (c, t) => `Analysts ${t.sign > 0 ? 'upgrade' : 'downgrade'} ${t.name} on ${t.sign > 0 ? 'stronger demand outlook' : 'margin concerns'}` },
  { id: 'co_ma', category: 'COMPANY', weight: 1.4, sev: [2, 4], dir: 1, target: 'company', targetShock: 5, shocks: {}, rel: RUM, horizon: 200,
    headline: (c, t) => `${t.name} reported in talks to ${c.pick(['acquire a smaller rival', 'merge with a peer', 'buy a fast-growing startup'])}` },
  { id: 'co_probe', category: 'COMPANY', weight: 1.4, sev: [2, 4], dir: -1, target: 'company', targetShock: 4.5, shocks: {}, rel: MIX, horizon: 200,
    headline: (c, t) => `${t.name} under investigation over ${c.pick(['accounting practices', 'safety complaints', 'data handling', 'pricing conduct'])}` },
  { id: 'sector_ai', category: 'TECHNOLOGY', weight: 2.2, sev: [2, 4], dir: 0, shocks: { S_AI: 2.0, S_TECH: 0.8, RISK: 0.3 }, rel: MIX, horizon: 240,
    headline: (c, t) => t.sign > 0 ? 'AI spending boom: cloud giants raise capex plans again' : 'AI spending questions emerge as returns lag hype',
    follow: [{ id: 'sector_semis', delay: [45, 200], p: 0.5 }] },
  { id: 'sector_semis', category: 'TECHNOLOGY', weight: 0, sev: [1, 2], dir: 1, shocks: { S_TECH: 0.7, S_AI: 0.4 }, rel: OFF, horizon: 120,
    headline: () => 'Chipmakers extend gains on strong data-centre orders' },
  { id: 'sector_health', category: 'TECHNOLOGY', weight: 1.6, sev: [1, 3], dir: 0, shocks: { S_HEALTH: 1.4 }, rel: MIX, horizon: 180,
    headline: (c, t) => t.sign > 0 ? 'Regulator fast-tracks breakthrough therapy approvals' : 'Drug-pricing proposal weighs on healthcare shares' },
  { id: 'sector_auto', category: 'CONSUMER', weight: 1.6, sev: [1, 3], dir: 0, shocks: { S_AUTO: 1.4, GROWTH: 0.2 }, rel: MIX, horizon: 180,
    headline: (c, t) => t.sign > 0 ? 'Vehicle sales climb as EV demand accelerates' : 'Auto makers cut production amid weak orders' },
  { id: 'sector_gaming', category: 'TECHNOLOGY', weight: 1.5, sev: [1, 3], dir: 0, shocks: { S_GAMING: 1.5 }, rel: MIX, horizon: 180,
    headline: (c, t) => t.sign > 0 ? 'Blockbuster launch drives record gaming engagement' : 'Gaming studios brace for slower spending' },
  { id: 'sector_telecom', category: 'TECHNOLOGY', weight: 1.2, sev: [1, 2], dir: 0, shocks: { S_TELECOM: 1.0 }, rel: OFF, horizon: 150,
    headline: (c, t) => t.sign > 0 ? 'Telecom carriers win spectrum deal, boosting coverage plans' : 'Price war hits mobile carriers' },
  { id: 'sector_retail', category: 'CONSUMER', weight: 1.6, sev: [1, 3], dir: 0, shocks: { S_RETAIL: 1.4, GROWTH: 0.2 }, rel: OFF, horizon: 150,
    headline: (c, t) => t.sign > 0 ? 'Retailers report strong foot traffic ahead of the season' : 'Retailers warn of softer consumer spending' },
  { id: 'dollar_move', category: 'ECONOMY', weight: 2, sev: [1, 3], dir: 0, shocks: { USD: 0.9, RISK: -0.2 }, rel: OFF, horizon: 150,
    headline: (c, t) => `Dollar ${t.sign > 0 ? 'firms' : 'softens'} as yields ${t.sign > 0 ? 'rise' : 'ease'}` },
  { id: 'growth_scare', category: 'GLOBAL MARKET', weight: 1.4, sev: [2, 4], dir: -1, shocks: { GROWTH: -1.0, RISK: -1.2, OIL: -0.6, USD: 0.3 }, rel: MIX, horizon: 240,
    headline: () => 'Growth scare hits markets as leading indicators weaken' },
  { id: 'risk_on', category: 'GLOBAL MARKET', weight: 1.0, sev: [1, 3], dir: 1, shocks: { RISK: 1.2, GROWTH: 0.3, USD: -0.2 }, rel: MIX, horizon: 200,
    headline: () => 'Risk appetite returns as investors buy the dip' },
  { id: 'risk_off', category: 'GLOBAL MARKET', weight: 1.0, sev: [1, 3], dir: -1, shocks: { RISK: 1.2, GROWTH: 0.3, USD: -0.2 }, rel: MIX, horizon: 200,
    headline: () => 'Risk appetite fades as investors take profits' },
];

export const NEWS_MAP: Record<string, NewsTemplate> = Object.fromEntries(NEWS_TEMPLATES.map((t) => [t.id, t]));
