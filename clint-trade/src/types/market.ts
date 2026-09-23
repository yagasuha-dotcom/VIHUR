// ─────────────────────────────────────────────────────────────
// Market domain types. Everything in CLINT TRADE is virtual.
// ─────────────────────────────────────────────────────────────

export type AssetClass =
  | 'forex'
  | 'stock'
  | 'crypto'
  | 'commodity'
  | 'index'
  | 'bond';

export type Sector =
  | 'TECH'
  | 'BANKING'
  | 'ENERGY'
  | 'HEALTH'
  | 'AUTO'
  | 'GAMING'
  | 'AI'
  | 'RETAIL'
  | 'TELECOM';

export type Region = 'US' | 'EU' | 'UK' | 'JP' | 'CH' | 'AU' | 'CA' | 'NZ' | 'GLOBAL';

export type MarketRegime =
  | 'BULL'
  | 'BEAR'
  | 'SIDEWAYS'
  | 'ACCUMULATION'
  | 'DISTRIBUTION'
  | 'PANIC'
  | 'EUPHORIA'
  | 'RECOVERY'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY';

export type SessionName = 'ASIA' | 'EUROPE' | 'US' | 'OFF_HOURS' | 'WEEKEND';

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D' | '1W';

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
  '1W': 604800,
};

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W'];

export interface Candle {
  /** Bucket start, in game-time seconds since world epoch. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Direction = 'LONG' | 'SHORT';

export interface FundamentalsStock {
  kind: 'stock';
  pe: number;
  eps: number;
  revenueGrowth: number; // fraction
  profitMargin: number; // fraction
  debt: number; // USD
  roe: number; // fraction
  marketCap: number; // USD
  dividendYield: number; // fraction
}

export interface FundamentalsCrypto {
  kind: 'crypto';
  marketCap: number;
  circulatingSupply: number;
  volume24h: number;
  networkActivity: number; // 0..100
  sentiment: number; // -1..1
}

export interface FundamentalsForex {
  kind: 'forex';
  baseCurrency: string;
  quoteCurrency: string;
  baseRate: number; // %
  quoteRate: number; // %
  baseInflation: number; // %
  quoteInflation: number; // %
  baseGrowth: number; // %
  quoteGrowth: number; // %
  baseEmployment: number; // %
  quoteEmployment: number; // %
}

export interface FundamentalsCommodity {
  kind: 'commodity';
  supplyIndex: number; // 0..100 (100 = abundant)
  demandIndex: number; // 0..100
  inventoryDays: number;
  sentiment: number;
}

export interface FundamentalsIndex {
  kind: 'index';
  constituents: number;
  avgPe: number;
  breadth: number; // fraction of constituents up
  sentiment: number;
}

export type Fundamentals =
  | FundamentalsStock
  | FundamentalsCrypto
  | FundamentalsForex
  | FundamentalsCommodity
  | FundamentalsIndex;

/** Static definition of a tradable instrument. */
export interface AssetDef {
  symbol: string; // e.g. BTC/USD, NEXA
  name: string;
  cls: AssetClass;
  sector?: Sector;
  region: Region;
  /** Starting price. */
  basePrice: number;
  /** Decimal places shown in UI. */
  decimals: number;
  /** Minimum price increment. */
  tick: number;
  /** Annualised-ish volatility scale (per-tick sigma is derived). */
  vol: number;
  /** 0..1 how strongly news moves this asset. */
  newsSensitivity: number;
  /** 0..1 how strongly macro/economic prints move this asset. */
  econSensitivity: number;
  /** 0..1 pull toward fair value. */
  meanReversion: number;
  /** 0..1 how much momentum persists. */
  momentumStrength: number;
  /** Baseline liquidity 0..1 (1 = deep). */
  liquidity: number;
  /** Baseline spread as a fraction of price. */
  baseSpread: number;
  /** Contract / lot size units per 1.0 lot (forex uses 100_000). */
  lotSize: number;
  /** Max leverage allowed by asset class. */
  maxLeverage: number;
  /** Trades around the clock? */
  is24h: boolean;
  /** Fictional coin / IPO company etc. */
  fictional: boolean;
  /** For forex: pip size. */
  pipSize?: number;
  /** For forex: swap in account-currency per lot per day (long, short). */
  swapLong?: number;
  swapShort?: number;
  /** For stocks: id of the owning company. */
  companyId?: string;
  /** Percent of price that is an annual dividend (stocks). */
  dividendYield?: number;
  /** For indices: constituent symbols and weights. */
  constituents?: { symbol: string; weight: number }[];
}

/** Live mutable state for an asset inside the simulation. */
export interface AssetState {
  symbol: string;
  price: number;
  prevClose: number; // previous day close for daily change
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  /** Fair value the price gravitates toward (drifts over time). */
  fairValue: number;
  /** Slow drift of fair value per game-day. */
  fairDrift: number;
  /** Trend component, per-tick log-return bias. */
  trend: number;
  /** Accumulated momentum (decays, reinforced by returns). */
  momentum: number;
  /** Realised volatility estimate (EWMA of |return|). */
  realizedVol: number;
  /** Current volatility multiplier (regime + events). */
  volMult: number;
  /** -1..1 asset-specific sentiment. */
  sentiment: number;
  /** Supply/demand imbalance -1..1 (buy pressure positive). */
  flow: number;
  /** 0..1 current liquidity (drops before events / off-session). */
  liquidity: number;
  /** Fraction of price. */
  spread: number;
  /** Decaying queue of pending shocks (news-driven drift) in log-return units per tick. */
  pendingImpulse: number;
  /** Ticks remaining for the impulse to fully play out. */
  impulseTicks: number;
  /** Cumulative news impact today (for history/analytics). */
  newsImpactToday: number;
  /** Bubble metric 0..1. */
  bubble: number;
  /** Last tick volume. */
  lastVolume: number;
  /** Tick-level return of the latest tick. */
  lastReturn: number;
  /** Is trading halted (delisted / bankrupt)? */
  halted: boolean;
  /** Is this asset currently tradable (listed)? */
  listed: boolean;
  /** Trend age in ticks (for trend regime persistence). */
  trendAge: number;
}

export interface RegimeState {
  regime: MarketRegime;
  /** Ticks remaining before a regime transition is evaluated. */
  remaining: number;
  /** How long the regime has been active in ticks. */
  age: number;
}

export interface GlobalMarketState {
  regime: RegimeState;
  /** -1..1 global risk sentiment. */
  sentiment: number;
  /** 1 = normal volatility. */
  volatility: number;
  /** USD strength index around 100. */
  usdIndex: number;
  /** 0..1 fear/greed proxy (0 = extreme fear, 1 = extreme greed). */
  greed: number;
  /** Ticks since last crash (for crash rarity). */
  ticksSinceCrash: number;
  /** Active crash-recovery path, if any. */
  recovery: RecoveryState | null;
}

export type RecoveryPath = 'CONTINUE_FALLING' | 'SIDEWAYS' | 'SLOW_RECOVERY' | 'V_SHAPED';

export interface RecoveryState {
  path: RecoveryPath;
  ticksLeft: number;
  totalTicks: number;
  /** Per-tick drift applied to risk assets. */
  drift: number;
}

export interface Tick {
  symbol: string;
  time: number;
  price: number;
  bid: number;
  ask: number;
  volume: number;
}

export interface DepthLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  mid: number;
}

export interface PatternHit {
  name: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  index: number;
}
