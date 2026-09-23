import type { AssetClass, TimeframeId } from '@/types';

// Game clock. dayIndex 0 == "DAY 1" (Monday). Negative days are the pre-game warm-up history.
export const EPOCH = Date.UTC(2031, 0, 6) / 1000; // a Monday 00:00 UTC
export const DAY = 86400;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const TF_SECONDS: Record<TimeframeId, number> = {
  '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '4H': 14400, '1D': 86400, '1W': 604800,
};
export const TIMEFRAMES: TimeframeId[] = ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W'];
export const TF_CAP: Record<TimeframeId, number> = {
  '1m': 400, '5m': 400, '15m': 400, '30m': 300, '1H': 400, '4H': 300, '1D': 400, '1W': 104,
};

export function tOf(dayIndex: number, hour = 0, minute = 0, second = 0): number {
  return EPOCH + dayIndex * DAY + hour * 3600 + minute * 60 + second;
}
export function dayIndexOf(t: number): number { return Math.floor((t - EPOCH) / DAY); }
export function secOfDay(t: number): number { return t - EPOCH - dayIndexOf(t) * DAY; }
export function weekdayOf(t: number): number { return ((dayIndexOf(t) % 7) + 7) % 7; } // 0=Mon
export function dayLabel(dayIndex: number): string { return dayIndex >= 0 ? `DAY ${dayIndex + 1}` : `D${dayIndex}`; }
export function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }
export function clockOf(t: number, withSeconds = true): string {
  const s = secOfDay(t);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return withSeconds ? `${pad2(h)}:${pad2(m)}:${pad2(sec)}` : `${pad2(h)}:${pad2(m)}`;
}
export function fmtGameTime(t: number): string { return `${dayLabel(dayIndexOf(t))} ${clockOf(t, false)}`; }

export type SessionName = 'ASIA' | 'EUROPE' | 'US' | 'AFTER HOURS' | 'WEEKEND';

export interface MarketHours {
  session: SessionName;
  weekend: boolean;
  forex: boolean;
  stock: boolean;
  commodity: boolean;
  crypto: boolean;
  bond: boolean;
  preMarket: boolean;
}

// Session model (game "market time"): ASIA 19:00-03:00, EUROPE 03:00-09:30, US 09:30-16:00, AFTER HOURS 16:00-19:00.
export function marketHours(t: number): MarketHours {
  const wd = weekdayOf(t);
  const h = secOfDay(t) / 3600;
  const weekend = wd >= 5;
  let session: SessionName;
  if (h >= 9.5 && h < 16) session = 'US';
  else if (h >= 3 && h < 9.5) session = 'EUROPE';
  else if (h >= 16 && h < 19) session = 'AFTER HOURS';
  else session = 'ASIA';
  if (weekend) session = 'WEEKEND';
  const fxOpen = wd < 4 || (wd === 4 && h < 17);
  const stock = wd < 5 && h >= 9.5 && h < 16;
  const commodity = (wd < 4 || (wd === 4 && h < 17)) && h >= 1 && h < 17 || (wd < 4 && (h >= 1 || h < 17));
  const bond = wd < 5 && h >= 8 && h < 17;
  return {
    session, weekend,
    forex: fxOpen,
    stock,
    commodity: wd < 5 && h >= 1 && h < 17,
    crypto: true,
    bond,
    preMarket: wd < 5 && h >= 4 && h < 9.5,
  };
}
export function isOpenFor(cls: AssetClass, id: string, mh: MarketHours): boolean {
  if (cls === 'forex') return mh.forex;
  if (cls === 'crypto') return true;
  if (cls === 'stock') return mh.stock;
  if (cls === 'commodity') return mh.commodity;
  if (cls === 'bond') return mh.bond;
  if (cls === 'index') return id === 'CRYPTOIDX' ? true : mh.stock;
  return true;
}

export function bucketStart(t: number, tf: TimeframeId): number {
  const p = TF_SECONDS[tf];
  return EPOCH + Math.floor((t - EPOCH) / p) * p;
}
