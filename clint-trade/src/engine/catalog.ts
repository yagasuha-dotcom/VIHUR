import type { AssetDef, AssetClass, FactorId, Sector, Company } from '@/types';

// ----------------------------------------------------------------------------
// FACTORS: the latent "economy" that drives many assets at once.
// vol = daily volatility (fraction), theta = mean reversion of factor level per day.
// ----------------------------------------------------------------------------
export const FACTORS: { id: FactorId; label: string; vol: number; theta: number }[] = [
  { id: 'USD', label: 'US Dollar strength', vol: 0.0045, theta: 0.06 },
  { id: 'RISK', label: 'Risk appetite', vol: 0.009, theta: 0.12 },
  { id: 'RATES', label: 'Rate expectations', vol: 0.005, theta: 0.1 },
  { id: 'INFL', label: 'Inflation expectations', vol: 0.004, theta: 0.08 },
  { id: 'OIL', label: 'Oil supply tightness', vol: 0.016, theta: 0.1 },
  { id: 'GROWTH', label: 'Economic growth', vol: 0.005, theta: 0.08 },
  { id: 'GEO', label: 'Geopolitical tension', vol: 0.006, theta: 0.18 },
  { id: 'CRYPTO', label: 'Crypto flows', vol: 0.025, theta: 0.1 },
  { id: 'S_TECH', label: 'Tech sector', vol: 0.008, theta: 0.1 },
  { id: 'S_BANKING', label: 'Banking sector', vol: 0.007, theta: 0.1 },
  { id: 'S_ENERGY', label: 'Energy sector', vol: 0.008, theta: 0.1 },
  { id: 'S_HEALTH', label: 'Health sector', vol: 0.006, theta: 0.1 },
  { id: 'S_AUTO', label: 'Auto sector', vol: 0.008, theta: 0.1 },
  { id: 'S_GAMING', label: 'Gaming sector', vol: 0.009, theta: 0.1 },
  { id: 'S_AI', label: 'AI sector', vol: 0.011, theta: 0.1 },
  { id: 'S_RETAIL', label: 'Retail sector', vol: 0.007, theta: 0.1 },
  { id: 'S_TELECOM', label: 'Telecom sector', vol: 0.005, theta: 0.1 },
];
export const SECTOR_FACTOR: Record<Sector, FactorId> = {
  TECH: 'S_TECH', BANKING: 'S_BANKING', ENERGY: 'S_ENERGY', HEALTH: 'S_HEALTH', AUTO: 'S_AUTO',
  GAMING: 'S_GAMING', AI: 'S_AI', RETAIL: 'S_RETAIL', TELECOM: 'S_TELECOM',
};

// Second-order links between factors (probabilistic, delayed): oil shock -> inflation -> rates -> USD -> gold/crypto ...
export interface FactorLink { from: FactorId; to: FactorId; w: number; delayMin: [number, number]; rel: number }
export const FACTOR_LINKS: FactorLink[] = [
  { from: 'OIL', to: 'INFL', w: 0.3, delayMin: [60, 300], rel: 0.8 },
  { from: 'OIL', to: 'RISK', w: -0.2, delayMin: [30, 120], rel: 0.65 },
  { from: 'OIL', to: 'GROWTH', w: -0.12, delayMin: [120, 480], rel: 0.5 },
  { from: 'OIL', to: 'USD', w: 0.1, delayMin: [30, 180], rel: 0.45 },
  { from: 'INFL', to: 'RATES', w: 0.5, delayMin: [120, 600], rel: 0.75 },
  { from: 'INFL', to: 'USD', w: 0.2, delayMin: [30, 240], rel: 0.6 },
  { from: 'RATES', to: 'USD', w: 0.35, delayMin: [5, 60], rel: 0.8 },
  { from: 'RATES', to: 'RISK', w: -0.45, delayMin: [10, 120], rel: 0.75 },
  { from: 'RATES', to: 'CRYPTO', w: -0.5, delayMin: [10, 180], rel: 0.7 },
  { from: 'RATES', to: 'S_BANKING', w: 0.3, delayMin: [10, 120], rel: 0.6 },
  { from: 'RISK', to: 'CRYPTO', w: 0.5, delayMin: [5, 90], rel: 0.7 },
  { from: 'RISK', to: 'USD', w: -0.12, delayMin: [10, 120], rel: 0.5 },
  { from: 'GEO', to: 'RISK', w: -0.55, delayMin: [5, 120], rel: 0.75 },
  { from: 'GEO', to: 'OIL', w: 0.45, delayMin: [10, 180], rel: 0.5 },
  { from: 'GROWTH', to: 'RISK', w: 0.45, delayMin: [10, 90], rel: 0.7 },
  { from: 'GROWTH', to: 'RATES', w: 0.25, delayMin: [60, 360], rel: 0.55 },
  { from: 'GROWTH', to: 'S_RETAIL', w: 0.35, delayMin: [30, 240], rel: 0.6 },
  { from: 'S_AI', to: 'S_TECH', w: 0.5, delayMin: [5, 60], rel: 0.8 },
  { from: 'S_TECH', to: 'S_AI', w: 0.35, delayMin: [5, 60], rel: 0.65 },
  { from: 'S_AI', to: 'S_GAMING', w: 0.15, delayMin: [30, 200], rel: 0.4 },
  { from: 'S_TECH', to: 'RISK', w: 0.15, delayMin: [10, 120], rel: 0.5 },
  { from: 'S_BANKING', to: 'RISK', w: 0.5, delayMin: [5, 90], rel: 0.75 },
  { from: 'S_BANKING', to: 'RATES', w: -0.25, delayMin: [30, 240], rel: 0.5 },
  { from: 'CRYPTO', to: 'RISK', w: 0.1, delayMin: [20, 120], rel: 0.4 },
];

// ----------------------------------------------------------------------------
// Helpers to build asset definitions
// ----------------------------------------------------------------------------
type Partialdef = Partial<AssetDef> & Pick<AssetDef, 'id' | 'name' | 'cls' | 'price0' | 'dailyVol' | 'decimals'>;

function mk(p: Partialdef): AssetDef {
  const cls = p.cls;
  const d: AssetDef = {
    symbol: p.id,
    liquidity: 0.6,
    depthUSD: 2_000_000,
    loadings: {},
    newsSens: 1,
    meanRev: 0.05,
    momStrength: 1,
    baseSpread: 0.0004,
    dailyVolume: 1_000_000,
    maxLeverage: 10,
    feePct: 0.0002,
    unit: 'units',
    minSize: 0.01,
    sizeStep: 0.01,
    tags: [],
    desc: '',
    ...p,
  } as AssetDef;
  d.tags = Array.from(new Set([cls, ...(p.tags ?? [])]));
  return d;
}

const FX_TAGS = (b: string, q: string) => ['forex', b, q];

function fx(id: string, base: string, quote: string, price0: number, vol: number, load: Partial<Record<FactorId, number>>, spread: number, decimals = 5): AssetDef {
  const jpy = quote === 'JPY';
  return mk({
    id, name: `${base}/${quote}`, cls: 'forex', price0, dailyVol: vol, decimals, loadings: load,
    liquidity: 0.98, depthUSD: 90_000_000, baseSpread: spread, maxLeverage: 50, feePct: 0,
    base, quote, pipSize: jpy ? 0.01 : 0.0001, lotSize: 100000, unit: 'lot', minSize: 0.01, sizeStep: 0.01,
    dailyVolume: 5_000_000, meanRev: 0.06, momStrength: 0.8, newsSens: 1.1,
    tags: FX_TAGS(base, quote), desc: `${base} against ${quote}. Driven by rate differentials, inflation and risk appetite.`,
  });
}

function crypto(id: string, name: string, price0: number, vol: number, load: Partial<Record<FactorId, number>>, opts: Partial<AssetDef> = {}): AssetDef {
  return mk({
    id: `${id}/USD`, symbol: id, name, cls: 'crypto', price0, dailyVol: vol, decimals: price0 > 1000 ? 2 : price0 > 10 ? 3 : price0 > 1 ? 4 : 5,
    loadings: load, liquidity: 0.7, depthUSD: 3_000_000, baseSpread: 0.0004, maxLeverage: 20, feePct: 0.0004,
    unit: id, minSize: price0 > 1000 ? 0.001 : price0 > 10 ? 0.01 : 1, sizeStep: price0 > 1000 ? 0.001 : price0 > 10 ? 0.01 : 1,
    dailyVolume: 30000, meanRev: 0.03, momStrength: 1.4, newsSens: 1.4, tags: ['crypto', id], ...opts,
  });
}

interface StockSeed {
  id: string; name: string; sector: Sector; price: number; pe: number; vol: number; beta: number;
  ceo: string; emp: number; margin: number; debtRatio: number; growth: number; div: number; blurb: string; sens?: number;
  extra?: Partial<Record<FactorId, number>>;
}

// ----------------------------------------------------------------------------
// FICTIONAL COMPANIES
// ----------------------------------------------------------------------------
export const STOCK_SEEDS: StockSeed[] = [
  { id: 'NEXA', name: 'NEXA TECH', sector: 'TECH', price: 185, pe: 22, vol: 0.017, beta: 1.15, ceo: 'Mira Volkov', emp: 84000, margin: 0.24, debtRatio: 0.4, growth: 0.11, div: 0.004, blurb: 'Cloud platforms and consumer devices.', extra: { RATES: -0.35 } },
  { id: 'QUBE', name: 'QUBE SYSTEMS', sector: 'TECH', price: 92, pe: 27, vol: 0.021, beta: 1.25, ceo: 'Idris Kwame', emp: 21000, margin: 0.18, debtRatio: 0.5, growth: 0.16, div: 0, blurb: 'Enterprise software and quantum-ready security.', extra: { RATES: -0.4 } },
  { id: 'CLBK', name: 'CLINT BANK', sector: 'BANKING', price: 78, pe: 11, vol: 0.014, beta: 1.0, ceo: 'Harold Finch', emp: 152000, margin: 0.28, debtRatio: 2.2, growth: 0.04, div: 0.032, blurb: 'The flagship retail and investment bank of the Clint economy.', extra: { RATES: 0.4 } },
  { id: 'HRBR', name: 'HARBOR TRUST', sector: 'BANKING', price: 41, pe: 9.5, vol: 0.016, beta: 1.05, ceo: 'Elena Marquez', emp: 38000, margin: 0.22, debtRatio: 2.5, growth: 0.03, div: 0.038, blurb: 'Regional lender focused on mortgages and small business.', extra: { RATES: 0.35 } },
  { id: 'VRTX', name: 'VORTEX ENERGY', sector: 'ENERGY', price: 67, pe: 10, vol: 0.018, beta: 0.8, ceo: 'Dmitri Aksoy', emp: 47000, margin: 0.16, debtRatio: 0.9, growth: 0.05, div: 0.041, blurb: 'Integrated oil and gas producer.', extra: { OIL: 0.65 } },
  { id: 'SLRA', name: 'SOLARA POWER', sector: 'ENERGY', price: 28, pe: 25, vol: 0.026, beta: 1.3, ceo: 'Anya Petrenko', emp: 9500, margin: 0.09, debtRatio: 1.6, growth: 0.22, div: 0, blurb: 'Solar and storage developer. High growth, heavy debt.', extra: { OIL: -0.15, RATES: -0.5 } },
  { id: 'MEDV', name: 'MEDIVA LABS', sector: 'HEALTH', price: 134, pe: 24, vol: 0.016, beta: 0.7, ceo: 'Dr. Sana Okafor', emp: 31000, margin: 0.21, debtRatio: 0.5, growth: 0.09, div: 0.006, blurb: 'Diagnostics and biotech.', extra: {} },
  { id: 'ZNTH', name: 'ZENITH PHARMA', sector: 'HEALTH', price: 59, pe: 15, vol: 0.015, beta: 0.65, ceo: 'Viktor Lindqvist', emp: 52000, margin: 0.19, debtRatio: 0.8, growth: 0.04, div: 0.022, blurb: 'Generic drugs at global scale.', extra: {} },
  { id: 'NOVM', name: 'NOVA MOTORS', sector: 'AUTO', price: 212, pe: 30, vol: 0.026, beta: 1.4, ceo: 'Rex Calloway', emp: 118000, margin: 0.11, debtRatio: 0.9, growth: 0.19, div: 0, blurb: 'Electric vehicles and autonomous driving.', extra: { OIL: -0.1, RATES: -0.3 } },
  { id: 'IRWL', name: 'IRONWHEEL AUTO', sector: 'AUTO', price: 36, pe: 8, vol: 0.02, beta: 1.1, ceo: 'Gunnar Holt', emp: 96000, margin: 0.05, debtRatio: 2.8, growth: -0.01, div: 0.03, blurb: 'Legacy combustion carmaker carrying heavy debt.', extra: { OIL: -0.2 } },
  { id: 'PXLG', name: 'PIXEL GAMES', sector: 'GAMING', price: 47, pe: 26, vol: 0.024, beta: 1.3, ceo: 'Kai Nakamura', emp: 12500, margin: 0.2, debtRatio: 0.3, growth: 0.14, div: 0, blurb: 'Studio behind blockbuster franchises and a live-service platform.', extra: { CRYPTO: 0.05 } },
  { id: 'ARCD', name: 'ARCADIA INTERACTIVE', sector: 'GAMING', price: 23, pe: 18, vol: 0.027, beta: 1.35, ceo: 'Bianca Rossi', emp: 4300, margin: 0.12, debtRatio: 0.6, growth: 0.08, div: 0, blurb: 'Mobile gaming and esports.', extra: {} },
  { id: 'SYNP', name: 'SYNAPTIC AI', sector: 'AI', price: 120, pe: 45, vol: 0.027, beta: 1.5, ceo: 'Lena Hartmann', emp: 15000, margin: 0.2, debtRatio: 0.3, growth: 0.35, div: 0, blurb: 'Foundation models and AI accelerators.', extra: { RATES: -0.5 } },
  { id: 'CGNT', name: 'COGNITA', sector: 'AI', price: 76, pe: 38, vol: 0.026, beta: 1.4, ceo: 'Joaquin Reyes', emp: 8200, margin: 0.15, debtRatio: 0.4, growth: 0.28, div: 0, blurb: 'AI assistants for enterprises.', extra: { RATES: -0.45 } },
  { id: 'MRCD', name: 'MERCADO', sector: 'RETAIL', price: 64, pe: 18, vol: 0.014, beta: 0.85, ceo: 'Tomas Ibarra', emp: 210000, margin: 0.06, debtRatio: 0.9, growth: 0.05, div: 0.015, blurb: 'Hypermarket and online retail chain.', extra: { OIL: -0.05 } },
  { id: 'URBC', name: 'URBANCART', sector: 'RETAIL', price: 22, pe: 35, vol: 0.03, beta: 1.3, ceo: 'Mei Lin Zhao', emp: 18000, margin: 0.03, debtRatio: 1.8, growth: 0.1, div: 0, blurb: 'Quick-commerce delivery. Burns cash, chases growth.', extra: { RATES: -0.4 } },
  { id: 'ORBT', name: 'ORBIT TELECOM', sector: 'TELECOM', price: 54, pe: 13, vol: 0.011, beta: 0.6, ceo: 'Samuel Adeyemi', emp: 74000, margin: 0.17, debtRatio: 1.4, growth: 0.03, div: 0.045, blurb: 'Mobile networks and satellite broadband.', extra: { RATES: -0.15 } },
  { id: 'LNKW', name: 'LINKWAVE', sector: 'TELECOM', price: 31, pe: 12, vol: 0.013, beta: 0.7, ceo: 'Ingrid Sjoberg', emp: 26000, margin: 0.14, debtRatio: 1.2, growth: 0.02, div: 0.04, blurb: 'Fiber and cable operator.', extra: {} },
];

// Companies that will list on the exchange later in the game (IPO system).
export const IPO_SEEDS: (StockSeed & { ipoPrice: number; ipoDay: number; hype: number })[] = [
  { id: 'AURI', name: 'AURORA AI', sector: 'AI', price: 25, pe: 60, vol: 0.04, beta: 1.6, ceo: 'Naomi Sato', emp: 2400, margin: 0.06, debtRatio: 0.2, growth: 0.6, div: 0, blurb: 'Autonomous research agents. Fast growth, thin profits.', ipoPrice: 25, ipoDay: 9, hype: 0.35, extra: { RATES: -0.5 } },
  { id: 'VLTG', name: 'VOLTGRID', sector: 'ENERGY', price: 18, pe: 30, vol: 0.038, beta: 1.4, ceo: 'Oskar Brandt', emp: 3800, margin: 0.05, debtRatio: 1.2, growth: 0.4, div: 0, blurb: 'Smart-grid and battery storage.', ipoPrice: 18, ipoDay: 47, hype: 0.1, extra: { OIL: -0.1 } },
  { id: 'VITL', name: 'VITALIS HEALTH', sector: 'HEALTH', price: 32, pe: 40, vol: 0.033, beta: 1.0, ceo: 'Dr. Amara Nwosu', emp: 5100, margin: 0.08, debtRatio: 0.4, growth: 0.3, div: 0, blurb: 'Telehealth and wearable diagnostics.', ipoPrice: 32, ipoDay: 96, hype: -0.05, extra: {} },
  { id: 'KTWK', name: 'KITEWORKS', sector: 'TECH', price: 44, pe: 35, vol: 0.035, beta: 1.4, ceo: 'Luca Ferrante', emp: 6200, margin: 0.1, debtRatio: 0.3, growth: 0.32, div: 0, blurb: 'Developer tools and edge infrastructure.', ipoPrice: 44, ipoDay: 150, hype: 0.2, extra: { RATES: -0.4 } },
];

function stockDef(s: StockSeed, ipo = false): AssetDef {
  const sf = SECTOR_FACTOR[s.sector];
  const loadings: Partial<Record<FactorId, number>> = {
    RISK: 0.55 * s.beta, GROWTH: 0.25 * s.beta, [sf]: 1.0, ...(s.extra ?? {}),
  };
  if (s.sector === 'TECH' || s.sector === 'AI' || s.sector === 'GAMING') loadings.RATES = loadings.RATES ?? -0.3;
  return mk({
    id: s.id, name: s.name, cls: 'stock', sector: s.sector, price0: s.price, dailyVol: s.vol, decimals: 2,
    loadings, liquidity: 0.55, depthUSD: 400_000 + s.price * 3000, baseSpread: 0.0005 + (s.vol > 0.025 ? 0.0004 : 0),
    maxLeverage: 10, feePct: 0.0003, unit: 'shares', minSize: 1, sizeStep: 1, companyId: s.id,
    dailyVolume: Math.round(6_000_000 / Math.max(10, s.price / 6)), meanRev: 0.035, momStrength: 1.0, newsSens: 1.2,
    tags: ['stock', s.sector, 'equity', ipo ? 'ipo' : 'listed'], desc: s.blurb, fictional: true,
  });
}

export function makeCompany(s: StockSeed, day0: number, ipoInfo?: { ipoPrice: number; ipoDay: number; hype: number }): Company {
  const epsTTM = s.price / s.pe;
  const epsQ = epsTTM / 4;
  const capB = (s.price * (2 + (s.emp / 40000))) / 1; // pseudo shares(B) scale
  const shares = Math.max(0.15, Math.round((s.emp / 8000 + 1.2) * 100) / 100);
  const netIncome = epsQ * shares;
  const revenue = netIncome / s.margin;
  const equity = (s.price * shares) / Math.max(1.2, s.pe * 0.18);
  void capB;
  return {
    id: s.id, assetId: s.id, name: s.name, ceo: s.ceo, sector: s.sector, employees: s.emp,
    revenue, netIncome, debt: equity * s.debtRatio, equity, shares, epsQ, growth: s.growth, baseGrowth: s.growth, margin: s.margin,
    pe0: s.pe, dividendYield: s.div, sentiment: 0, health: 78 - Math.max(0, s.debtRatio - 1.3) * 18 - (s.margin < 0.06 ? 10 : 0),
    status: ipoInfo ? 'PRE_IPO' : 'ACTIVE', nextEarningsDay: day0, earningsHour: 16.5, reports: [], badQuarters: 0,
    ipoDay: ipoInfo?.ipoDay, ipoPrice: ipoInfo?.ipoPrice, ipoHype: ipoInfo?.hype, blurb: s.blurb,
  };
}

// ----------------------------------------------------------------------------
// THE CATALOG
// ----------------------------------------------------------------------------
function buildCatalog(): AssetDef[] {
  const list: AssetDef[] = [];

  // FOREX
  list.push(fx('EUR/USD', 'EUR', 'USD', 1.1742, 0.0048, { USD: -0.95, RISK: 0.1, RATES: -0.12 }, 0.00005));
  list.push(fx('GBP/USD', 'GBP', 'USD', 1.3418, 0.0055, { USD: -0.85, RISK: 0.18 }, 0.00007));
  list.push(fx('USD/JPY', 'USD', 'JPY', 152.4, 0.0058, { USD: 0.8, RISK: 0.35, RATES: 0.4, GEO: -0.3 }, 0.00006, 3));
  list.push(fx('USD/CHF', 'USD', 'CHF', 0.8921, 0.0046, { USD: 0.8, RISK: 0.1, GEO: -0.3 }, 0.00008));
  list.push(fx('AUD/USD', 'AUD', 'USD', 0.6612, 0.0062, { USD: -0.75, RISK: 0.55, GROWTH: 0.3, OIL: 0.05 }, 0.00009));
  list.push(fx('USD/CAD', 'USD', 'CAD', 1.3782, 0.0045, { USD: 0.6, OIL: -0.12, RISK: -0.1 }, 0.00009));
  list.push(fx('NZD/USD', 'NZD', 'USD', 0.6047, 0.0064, { USD: -0.7, RISK: 0.5, GROWTH: 0.2 }, 0.00012));

  // CRYPTO - real-named (virtual prices)
  list.push(crypto('BTC', 'Bitcoin', 104231.2, 0.026, { CRYPTO: 0.85, RISK: 0.9, RATES: -0.3, INFL: 0.1 }, { depthUSD: 9_000_000, baseSpread: 0.00003, liquidity: 0.9, dailyVolume: 28000, desc: 'The largest crypto asset. Responds to liquidity, ETF flows and risk appetite.', supply: 19_800_000, tags: ['crypto', 'BTC', 'major'] }));
  list.push(crypto('ETH', 'Ethereum', 3842.5, 0.034, { CRYPTO: 1.0, RISK: 1.1, RATES: -0.3, S_TECH: 0.1 }, { depthUSD: 5_500_000, baseSpread: 0.00008, liquidity: 0.85, dailyVolume: 320000, supply: 120_400_000, desc: 'Smart-contract platform. Higher beta to BTC.', tags: ['crypto', 'ETH', 'major'] }));
  list.push(crypto('SOL', 'Solana', 218.4, 0.045, { CRYPTO: 1.15, RISK: 1.2, S_TECH: 0.1 }, { depthUSD: 2_400_000, baseSpread: 0.00015, supply: 470_000_000, dailyVolume: 4_500_000, desc: 'High-throughput chain. Momentum heavy.' }));
  list.push(crypto('BNB', 'BNB', 642.8, 0.03, { CRYPTO: 0.8, RISK: 0.8, S_BANKING: 0.05 }, { depthUSD: 1_800_000, baseSpread: 0.0001, supply: 145_900_000, dailyVolume: 1_200_000, desc: 'Exchange token. Sensitive to regulation.', newsSens: 1.6 }));
  list.push(crypto('XRP', 'XRP', 2.86, 0.04, { CRYPTO: 0.9, RISK: 0.8, GEO: -0.05 }, { depthUSD: 2_000_000, baseSpread: 0.0002, supply: 57_000_000_000, dailyVolume: 900_000_000, desc: 'Payments token. Reacts strongly to regulatory headlines.', newsSens: 1.9 }));
  list.push(crypto('DOGE', 'Dogecoin', 0.3184, 0.055, { CRYPTO: 1.0, RISK: 1.0 }, { depthUSD: 900_000, baseSpread: 0.0003, supply: 147_000_000_000, dailyVolume: 4_000_000_000, desc: 'Meme coin. Sentiment and whales dominate.', newsSens: 1.6, momStrength: 1.8 }));
  // CRYPTO - fictional coins (higher volatility)
  list.push(crypto('CLNT', 'Clint Coin', 12.48, 0.065, { CRYPTO: 1.1, RISK: 0.9, S_BANKING: 0.15 }, { fictional: true, depthUSD: 350_000, baseSpread: 0.0008, liquidity: 0.45, supply: 900_000_000, dailyVolume: 60_000_000, desc: 'Native coin of the Clint ecosystem.', newsSens: 1.7, momStrength: 1.7 }));
  list.push(crypto('NOVA', 'Nova Token', 4.21, 0.075, { CRYPTO: 1.3, RISK: 1.1, S_AUTO: 0.1 }, { fictional: true, depthUSD: 220_000, baseSpread: 0.0011, liquidity: 0.4, supply: 1_400_000_000, dailyVolume: 90_000_000, desc: 'Mobility payments network token.', newsSens: 1.8, momStrength: 1.9 }));
  list.push(crypto('VOLT', 'Volt Network', 1.86, 0.085, { CRYPTO: 1.3, RISK: 0.9, S_ENERGY: 0.3 }, { fictional: true, depthUSD: 160_000, baseSpread: 0.0014, liquidity: 0.35, supply: 3_500_000_000, dailyVolume: 300_000_000, desc: 'Energy-trading protocol. Follows power markets.', newsSens: 1.9, momStrength: 2.0 }));
  list.push(crypto('AURA', 'Aura Protocol', 7.9, 0.08, { CRYPTO: 1.2, RISK: 1.1, S_AI: 0.35 }, { fictional: true, depthUSD: 190_000, baseSpread: 0.0013, liquidity: 0.38, supply: 800_000_000, dailyVolume: 70_000_000, desc: 'Decentralised AI compute market.', newsSens: 1.8, momStrength: 2.0 }));
  list.push(crypto('NEON', 'Neon Chain', 0.642, 0.095, { CRYPTO: 1.4, RISK: 1.0, S_GAMING: 0.3 }, { fictional: true, depthUSD: 110_000, baseSpread: 0.0018, liquidity: 0.3, supply: 6_200_000_000, dailyVolume: 900_000_000, desc: 'Gaming chain with speculative retail flows.', newsSens: 2.0, momStrength: 2.2 }));
  list.push(crypto('FLUX', 'Flux Finance', 0.238, 0.11, { CRYPTO: 1.5, RISK: 1.2, GEO: -0.1 }, { fictional: true, depthUSD: 80_000, baseSpread: 0.0024, liquidity: 0.25, supply: 12_000_000_000, dailyVolume: 2_500_000_000, desc: 'DeFi lending token. Extreme volatility.', newsSens: 2.2, momStrength: 2.4 }));

  // STOCKS
  for (const s of STOCK_SEEDS) list.push(stockDef(s));
  for (const s of IPO_SEEDS) list.push(stockDef(s, true));

  // COMMODITIES
  list.push(mk({ id: 'GOLD/USD', symbol: 'GOLD', name: 'Gold', cls: 'commodity', price0: 2912, dailyVol: 0.009, decimals: 2,
    loadings: { USD: -0.6, RATES: -0.5, INFL: 0.5, GEO: 0.6, RISK: -0.15 }, liquidity: 0.9, depthUSD: 12_000_000, baseSpread: 0.00012,
    maxLeverage: 20, feePct: 0.0001, unit: 'oz', minSize: 0.1, sizeStep: 0.1, dailyVolume: 600000, meanRev: 0.04, momStrength: 0.9, newsSens: 1.0,
    tags: ['commodity', 'GOLD', 'safe-haven', 'USD'], desc: 'Safe-haven metal. Rises with inflation fear and falls with real yields.' }));
  list.push(mk({ id: 'SILVER/USD', symbol: 'SILVER', name: 'Silver', cls: 'commodity', price0: 33.4, dailyVol: 0.016, decimals: 3,
    loadings: { USD: -0.55, RATES: -0.4, INFL: 0.35, GEO: 0.35, GROWTH: 0.3, RISK: 0.1 }, liquidity: 0.75, depthUSD: 3_000_000, baseSpread: 0.0003,
    maxLeverage: 20, feePct: 0.0001, unit: 'oz', minSize: 1, sizeStep: 1, dailyVolume: 40_000_000, meanRev: 0.05, momStrength: 1.0, newsSens: 1.1,
    tags: ['commodity', 'SILVER', 'USD'], desc: 'Industrial and monetary metal. Higher beta to gold.' }));
  list.push(mk({ id: 'OIL/USD', symbol: 'OIL', name: 'Crude Oil', cls: 'commodity', price0: 78.6, dailyVol: 0.02, decimals: 2,
    loadings: { OIL: 1.0, GROWTH: 0.5, USD: -0.2, GEO: 0.3, RISK: 0.2 }, liquidity: 0.85, depthUSD: 8_000_000, baseSpread: 0.0003,
    maxLeverage: 20, feePct: 0.0001, unit: 'bbl', minSize: 1, sizeStep: 1, dailyVolume: 1_200_000, meanRev: 0.05, momStrength: 1.1, newsSens: 1.4,
    tags: ['commodity', 'OIL', 'energy', 'USD'], desc: 'Benchmark crude. Reacts to supply shocks, growth and geopolitics.' }));
  list.push(mk({ id: 'NATGAS/USD', symbol: 'NATGAS', name: 'Natural Gas', cls: 'commodity', price0: 3.42, dailyVol: 0.03, decimals: 3,
    loadings: { OIL: 0.5, GROWTH: 0.2, GEO: 0.25 }, liquidity: 0.6, depthUSD: 2_000_000, baseSpread: 0.0009,
    maxLeverage: 10, feePct: 0.0002, unit: 'mmBtu', minSize: 100, sizeStep: 100, dailyVolume: 500_000_000, meanRev: 0.07, momStrength: 0.9, newsSens: 1.4,
    tags: ['commodity', 'NATGAS', 'energy', 'USD'], desc: 'Weather- and supply-driven energy commodity.' }));

  // BONDS
  list.push(mk({ id: 'T10Y', symbol: 'T10Y', name: 'Clint 10Y Treasury', cls: 'bond', price0: 96.4, dailyVol: 0.0045, decimals: 3,
    loadings: { RATES: -0.9, INFL: -0.4, RISK: -0.2, GEO: 0.2, GROWTH: -0.1 }, liquidity: 0.95, depthUSD: 20_000_000, baseSpread: 0.0002,
    maxLeverage: 20, feePct: 0.0001, unit: 'units', minSize: 1, sizeStep: 1, duration: 7.5, dailyVolume: 10_000_000, meanRev: 0.05, momStrength: 0.8, newsSens: 1.0,
    tags: ['bond', 'rates', 'USD'], desc: 'Price of a 10-year government note. Falls when yields rise.' }));
  list.push(mk({ id: 'T30Y', symbol: 'T30Y', name: 'Clint 30Y Treasury', cls: 'bond', price0: 88.2, dailyVol: 0.0085, decimals: 3,
    loadings: { RATES: -1.6, INFL: -0.7, RISK: -0.3, GEO: 0.3, GROWTH: -0.15 }, liquidity: 0.9, depthUSD: 12_000_000, baseSpread: 0.00025,
    maxLeverage: 20, feePct: 0.0001, unit: 'units', minSize: 1, sizeStep: 1, duration: 17, dailyVolume: 5_000_000, meanRev: 0.05, momStrength: 0.8, newsSens: 1.1,
    tags: ['bond', 'rates', 'USD'], desc: 'Long bond. More sensitive to yield changes than the 10Y.' }));

  // INDICES (derived from constituents)
  const stockIds = STOCK_SEEDS.map((s) => s.id);
  const bySector = (secs: Sector[]) => STOCK_SEEDS.filter((s) => secs.includes(s.sector)).map((s) => s.id);
  const equalW = (ids: string[]) => ids.map((id) => ({ id, w: 1 / ids.length }));
  const capW = (ids: string[]) => {
    const raw = ids.map((id) => { const s = STOCK_SEEDS.find((x) => x.id === id)!; return { id, w: s.price * (s.emp / 8000 + 1.2) }; });
    const tot = raw.reduce((a, b) => a + b.w, 0);
    return raw.map((r) => ({ id: r.id, w: r.w / tot }));
  };
  const idx = (id: string, name: string, base: number, constituents: { id: string; w: number }[], desc: string, tags: string[]): AssetDef =>
    mk({ id, symbol: id, name, cls: 'index', price0: base, dailyVol: 0.01, decimals: 2, loadings: {}, liquidity: 0.9, depthUSD: 15_000_000,
      baseSpread: 0.00008, maxLeverage: 20, feePct: 0.0001, unit: 'contracts', minSize: 0.1, sizeStep: 0.1, indexBase: base, constituents,
      dailyVolume: 300000, meanRev: 0, momStrength: 0, newsSens: 1, tags: ['index', ...tags], desc, fictional: true });
  list.push(idx('CLINT100', 'CLINT 100', 12480.5, capW(stockIds.slice()), 'Cap-weighted index of the 18 largest listed companies.', ['equity']));
  list.push(idx('TECH50', 'TECH 50', 8215.3, equalW(bySector(['TECH', 'AI', 'GAMING', 'TELECOM'])), 'Technology, AI, gaming and telecom leaders.', ['equity', 'TECH', 'AI']));
  list.push(idx('GLOBAL500', 'GLOBAL 500', 5462.8, equalW(stockIds.slice()), 'Broad equal-weighted market gauge.', ['equity']));
  const cIds: [string, number][] = [['BTC/USD', 0.44], ['ETH/USD', 0.24], ['SOL/USD', 0.09], ['BNB/USD', 0.07], ['XRP/USD', 0.06], ['DOGE/USD', 0.03], ['CLNT/USD', 0.02], ['NOVA/USD', 0.01], ['VOLT/USD', 0.01], ['AURA/USD', 0.01], ['NEON/USD', 0.01], ['FLUX/USD', 0.01]];
  list.push(idx('CRYPTOIDX', 'CRYPTO INDEX', 3940.6, cIds.map(([id, w]) => ({ id, w })), 'Weighted basket of major and fictional coins. Trades 24/7.', ['crypto']));
  return list;
}

export const CATALOG: AssetDef[] = buildCatalog();
export const CATALOG_MAP: Record<string, AssetDef> = Object.fromEntries(CATALOG.map((a) => [a.id, a]));
export const CLASS_LABEL: Record<AssetClass, string> = {
  forex: 'Forex', crypto: 'Crypto', stock: 'Stocks', commodity: 'Commodities', index: 'Indices', bond: 'Bonds',
};
export const CLASS_ORDER: AssetClass[] = ['crypto', 'forex', 'stock', 'commodity', 'index', 'bond'];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
export const CURRENCY_FLAG: Record<string, string> = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭', AUD: '🇦🇺', CAD: '🇨🇦', NZD: '🇳🇿' };
export const CURRENCY_BANK: Record<string, string> = { USD: 'FED', EUR: 'ECB', GBP: 'BOE', JPY: 'BOJ', CHF: 'SNB', AUD: 'RBA', CAD: 'BOC', NZD: 'RBNZ' };

export const ASSET_ALIASES: Record<string, string> = { BTC: 'BTC/USD', ETH: 'ETH/USD', GOLD: 'GOLD/USD', OIL: 'OIL/USD' };
export function assetId(x: string): string { return ASSET_ALIASES[x] ?? x; }

/** Which assets carry a given tag (used by news, calendar and event targeting). */
export function assetsWithTag(tag: string): AssetDef[] {
  return CATALOG.filter((a) => a.tags.includes(tag) || a.id === tag || a.symbol === tag);
}
