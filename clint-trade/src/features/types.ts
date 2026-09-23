import type { AssetClass, Difficulty } from '@/types';

export type Side = 'LONG' | 'SHORT';
export type CloseReason = 'MANUAL' | 'SL' | 'TP' | 'LIQUIDATION' | 'DELISTED';

export interface Position {
  id: string; assetId: string; side: Side; size: number; entry: number; leverage: number; margin: number;
  notional: number; sl?: number; tp?: number; openT: number; swap: number; fees: number; journalId: string; reason: string;
  slippage: number; riskPct: number; condition: string;
}
export interface PendingOrder {
  id: string; assetId: string; type: 'LIMIT' | 'STOP'; side: 'BUY' | 'SELL'; size: number; price: number; leverage: number;
  sl?: number; tp?: number; createdT: number; reason: string;
}
export interface ClosedTrade {
  id: string; assetId: string; side: Side; size: number; entry: number; exit: number; pnl: number; fees: number; openT: number; closeT: number;
  leverage: number; notional: number; closeReason: CloseReason; slSet: boolean; condition: string; reason: string; journalId: string; cls: AssetClass; riskPct: number;
}
export interface Loan {
  id: string; principal: number; rate: number; repay: number; remaining: number; takenDay: number; dueDay: number; termDays: number;
  status: 'ACTIVE' | 'PAID' | 'LATE' | 'DEFAULT'; lateDays: number; restructured: boolean; label: string; paidDay?: number;
}
export interface JournalEntry {
  id: string; positionId: string; assetId: string; side: Side; entry: number; exit?: number; pnl?: number; durationSec?: number;
  reason: string; condition: string; note: string; lesson: string; result: 'OPEN' | 'PROFIT' | 'LOSS' | 'BREAKEVEN'; openT: number; closeT?: number; auto?: string;
}
export interface Notification {
  id: string; kind: 'info' | 'good' | 'bad' | 'warn' | 'news' | 'margin' | 'life' | 'levelup' | 'mission' | 'achievement' | 'report';
  title: string; msg: string; t: number; read: boolean; actions?: { label: string; action: string; payload?: string }[]; sound?: string; done?: boolean;
}
export interface Counters {
  opened: number; closed: number; wins: number; losses: number; newsTrades: number; crashProfits: number; marginCalls: number; liquidations: number;
  loansTaken: number; loansRepaid: number; loansLate: number; noMarginCallDays: number; bankruptcies: number; recoveredFromBankruptcy: number;
  daysPlayed: number; everDebt: boolean; debtFreeAfterDebt: boolean; slTrades: number; tpWins: number; bearProfit: number; bullProfit: number;
  shortWins: number; leverageMax: number; sideJobs: number; dailyRewards: number; overtradeFlags: number; revengeFlags: number; ipoWins: number;
  lifeEvents: number; bestTrade: number; worstTrade: number; largestTrade: number; tradedForexAndCrypto: number;
  classesTraded: string[];
}
export interface EquityPoint { day: number; equity: number; netWorth: number; }
export interface Drawing { id: string; kind: 'hline' | 'support' | 'resistance' | 'trend'; p1: { time: number; price: number }; p2?: { time: number; price: number } }
export interface IpoSub { id: string; assetId: string; amount: number; day: number; filled: boolean }
export interface Settings { sound: boolean; tutorialDone: boolean; showPatterns: boolean; confirmOrders: boolean; }

export interface PlayerState {
  balance: number; startCapital: number; realized: number; positions: Position[]; orders: PendingOrder[]; trades: ClosedTrade[]; loans: Loan[];
  journal: JournalEntry[]; xp: number; reputation: number; credit: number; discipline: number; patience: number; riskControl: number;
  counters: Counters; peakEquity: number; maxDD: number; equityHistory: EquityPoint[]; missionsDone: Record<string, number>;
  achievements: Record<string, number>; marginState: 'OK' | 'CALL'; lastMarginCallDay: number; notifications: Notification[];
  ipoSubs: IpoSub[]; dailyRewardDay: number; sideJobDay: number; psychFlags: { code: string; msg: string; t: number }[];
  drawings: Record<string, Drawing[]>; settings: Settings; difficulty: Difficulty; seq: number; startDay: number; brokeDay: number;
  dayStartEquity: number; lastEquityDay: number; rewardStreak: number; watch: string[]; bankruptcyBaseline: number | null;
  reports: { day: number; text: string }[];
}

export interface Quote { bid: number; ask: number; mid: number; spread: number; open: boolean }

export interface Account {
  balance: number; equity: number; usedMargin: number; freeMargin: number; unrealized: number; marginLevel: number; debt: number; netWorth: number;
  holdings: Record<string, number>; cash: number;
}
export interface OrderRequest {
  assetId: string; side: 'BUY' | 'SELL'; type: 'MARKET' | 'LIMIT' | 'STOP'; size: number; leverage: number; price?: number; sl?: number; tp?: number; reason?: string;
}
export interface OrderPreview {
  ok: boolean; error?: string; price: number; size: number; notional: number; margin: number; fee: number; slippagePct: number; riskPct: number | null;
  riskUSD: number | null; warnings: { code: string; title: string; msg: string; severity: 'info' | 'warn' | 'danger' }[]; spreadPct: number; liqPrice: number;
}
