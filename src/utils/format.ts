export function money(n: number, dec = 2): string {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (n < 0 ? '-$' : '$') + s;
}
export function moneyCompact(n: number): string {
  const a = Math.abs(n);
  const s = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(1) + 'K' : a.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return (n < 0 ? '-$' : '$') + s;
}
export function signed(n: number, dec = 2, prefix = ''): string { return (n >= 0 ? '+' : '-') + prefix + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
export function pct(n: number, dec = 2): string { return `${n >= 0 ? '+' : ''}${n.toFixed(dec)}%`; }
export function px(n: number, dec: number): string { return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(a < 10 ? 2 : 0);
}
export function cn(...c: (string | false | null | undefined)[]): string { return c.filter(Boolean).join(' '); }
export function countdown(sec: number): string {
  if (sec <= 0) return 'now';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
