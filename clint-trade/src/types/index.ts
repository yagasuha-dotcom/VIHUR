// ============================================================================
// CLINT TRADE - shared types. Everything in this game is VIRTUAL.
// ============================================================================

export type AssetClass = 'forex' | 'crypto' | 'stock' | 'commodity' | 'index' | 'bond';
export type Sector = 'TECH' | 'BANKING' | 'ENERGY' | 'HEALTH' | 'AUTO' | 'GAMING' | 'AI' | 'RETAIL' | 'TELECOM';
export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'CHAOS';

export type FactorId =
  | 'USD' | 'RISK' | 'RATES' | 'INFL' | 'OIL' | 'GROWTH' | 'GEO' | 'CRYPTO'
  | 'S_TECH' | 'S_BANKING' | 'S_ENERGY' | 'S_HEALTH' | 'S_AUTO' | 'S_GAMING' | 'S_AI' | 'S_RETAIL' | 'S_TELECOM';

export type TimeframeId = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D' | '1W';

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

export type RegimeId =
  | 'BULL' | 'BEAR' | 'SIDEWAYS' | 'ACCUMULATION' | 'DISTRIBUTION'
  | 'PANIC' | 'EUPHORIA' | 'RECOVERY' | 'HIGH_VOL' | 'LOW_VOL';

export type RegimeGroup = 'GLOBAL' | 'EQUITY' | 'CRYPTO' | 'FOREX' | 'COMMODITY';

export interface RegimeState { current: RegimeId; remaining: number; since: number; history: { regime: RegimeId; day: number }[] }

export interface Impulse { left: number; tau: number }

export interface AssetDef {
  id: string;
  symbol: string;
  name: string;
  cls: AssetClass;
  sector?: Sector;
  price0: number;
  dailyVol: number;
  liquidity: number;           // 0..1 relative depth
  depthUSD: number;            // approx USD depth within ~10 book levels
  decimals: number;
  loadings: Partial<Record<FactorId, number>>;
  newsSens: number;
  meanRev: number;             // per day
  momStrength: number;
  baseSpread: number;          // fraction of price
  dailyVolume: number;         // units per day
  maxLeverage: number;
  feePct: number;
  fictional?: boolean;
  base?: string;               // forex base currency
  quote?: string;              // forex quote currency
  pipSize?: number;
  lotSize?: number;            // units per lot (forex)
  supply?: number;             // crypto circulating supply
  companyId?: string;
  constituents?: { id: string; w: number }[]; // indices
  indexBase?: number;
  duration?: number;           // bonds
  unit: string;                // 'lot','BTC','shares','oz','bbl','contracts'
  minSize: number;
  sizeStep: number;
  tags: string[];
  desc: string;
}

export interface AssetState {
  id: string;
  price: number;
  fair: number;
  dayOpen: number;
  prevClose: number;
  trend: number;
  momentum: number;
  ewVar: number;
  sentiment: number;
  newsMemory: number;
  supplyDemand: number;
  emaSlow: number;
  emaFast: number;
  volBoost: number;
  spreadBoost: number;
  spread: number;              // current relative spread
  liquidityNow: number;
  acc: number;                 // hidden accumulated return while closed
  open: boolean;
  status: 'ACTIVE' | 'PRE_IPO' | 'DELISTED' | 'HALTED';
  loadNoise: Partial<Record<FactorId, number>>;
  impulses: Impulse[];
  candles: Record<TimeframeId, Candle[]>;
  idioVol: number;
  volume24: number;
  lastRet: number;
  networkActivity: number;     // crypto fundamentals
  bubble: number;              // 0..1 bubble score
  ipoHype?: number;
  refPrice?: number;           // index constituents reference
}

export interface FactorState {
  id: FactorId;
  level: number;
  ret: number;
  vol: number;                 // daily vol fraction
  theta: number;
  drift: number;               // sigma/day
  impulses: Impulse[];
}

export type NewsCategory =
  | 'ECONOMY' | 'INFLATION' | 'INTEREST RATE' | 'EMPLOYMENT' | 'GDP' | 'CENTRAL BANK' | 'COMPANY' | 'CRYPTO'
  | 'REGULATION' | 'GEOPOLITICS' | 'ENERGY' | 'BANKING' | 'TECHNOLOGY' | 'CONSUMER' | 'GLOBAL MARKET';

export type NewsReliability = 'OFFICIAL' | 'CONFIRMED' | 'BREAKING' | 'RUMOR' | 'SPECULATION';

export interface NewsImpact { assetId: string; expected: number; actual?: number }

export interface NewsItem {
  id: string;
  t: number;
  day: number;
  headline: string;
  body: string;
  category: NewsCategory;
  sentiment: number;           // -1..1 (risk sentiment)
  severity: number;            // 1..5
  reliability: NewsReliability;
  breaking: boolean;
  affected: NewsImpact[];
  priceAtPublish: Record<string, number>;
  resolveAt: number;
  resolved: boolean;
  parentId?: string;
  templateId: string;
  tags: string[];
  reversed?: boolean;
}

export type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface CalendarEvent {
  id: string;
  templateId: string;
  t: number;
  day: number;
  country: string;
  flag: string;
  name: string;
  kind: 'CPI' | 'RATE' | 'GDP' | 'EMP' | 'PMI' | 'RETAIL' | 'SPEECH' | 'CLAIMS' | 'EARNINGS' | 'IPO' | 'OPEC';
  impact: ImpactLevel;
  tags: string[];
  unit: string;
  forecast?: number;
  previous?: number;
  actual?: number;
  released: boolean;
  note?: string;
}

export interface ActiveEvent {
  id: string;
  name: string;
  startT: number;
  endT: number;
  severity: number;
  affected: string[];
  pattern: 'V' | 'SLOW' | 'CONTINUE' | 'SIDEWAYS';
  newsId?: string;
}

export interface EconomyState {
  rates: Record<string, number>;        // policy rates by currency (%)
  inflation: Record<string, number>;
  growth: Record<string, number>;
  unemployment: Record<string, number>;
  inflTrue: Record<string, number>;
  growthTrue: Record<string, number>;
  unempTrue: Record<string, number>;
  sentiment: number;                    // global market sentiment -1..1
  bubble: { active: boolean; group: string; startDay: number; size: number; burstAt: number; phase: 'BUILD' | 'PEAK' | 'BURST' | 'DONE' } | null;
  crashCooldownUntil: number;
}

export type CompanyStatus = 'PRE_IPO' | 'ACTIVE' | 'WARNING' | 'BANKRUPT' | 'DELISTED';

export interface EarningsReport {
  day: number;
  quarter: number;
  epsExpected: number;
  epsActual: number;
  revenue: number;             // $B
  reaction: number;            // %
  note: string;
}

export interface Company {
  id: string;
  assetId: string;
  name: string;
  ceo: string;
  sector: Sector;
  employees: number;
  revenue: number;             // quarterly, $B
  netIncome: number;           // quarterly, $B
  debt: number;                // $B
  equity: number;              // $B
  shares: number;              // B
  epsQ: number;
  growth: number;              // yoy fraction
  baseGrowth: number;          // long-run growth the company reverts to
  margin: number;
  pe0: number;                 // "fair" PE baseline
  dividendYield: number;
  sentiment: number;
  health: number;              // 0..100
  status: CompanyStatus;
  nextEarningsDay: number;
  earningsHour: number;        // 8 pre-market / 16.5 after close
  lastReport?: EarningsReport;
  reports: EarningsReport[];
  ipoDay?: number;
  ipoPrice?: number;
  ipoHype?: number;
  badQuarters: number;
  bankruptDay?: number;
  blurb: string;
}

export interface Tick {
  t: number;
}

export interface WorldSnapshotForSave { version: number }
