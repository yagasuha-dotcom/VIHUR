import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/format';

export function Panel({ title, right, children, className, pad = true }: { title?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('glass rounded-xl', className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 border-b border-white/5 px-3.5 py-2.5">
          <h3 className="text-[13px] font-semibold text-snow">{title}</h3>
          {right}
        </header>
      )}
      <div className={pad ? 'p-3.5' : ''}>{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; badge?: number }[]; className?: string }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto rounded-lg bg-abyss/50 p-0.5', className)}>
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)} className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition', value === it.id ? 'bg-brand/15 text-snow shadow-[inset_0_0_0_1px_rgba(124,140,255,.35)]' : 'text-mute hover:text-soft')}>
          {it.label}
          {it.badge ? <span className="rounded-full bg-brand/25 px-1.5 text-[10px] text-brand">{it.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' | 'warn' | 'brand'; className?: string }) {
  const c = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : tone === 'brand' ? 'text-brand' : 'text-snow';
  return (
    <div className={cn('min-w-0', className)}>
      <div className="label truncate">{label}</div>
      <div className={cn('num truncate text-[17px] font-medium leading-tight', c)}>{value}</div>
      {sub ? <div className="num truncate text-[11px] text-mute">{sub}</div> : null}
    </div>
  );
}

export function Delta({ v, dec = 2, prefix = '', suffix = '', className }: { v: number; dec?: number; prefix?: string; suffix?: string; className?: string }) {
  const t = v > 0.00001 ? 'text-up' : v < -0.00001 ? 'text-down' : 'text-mute';
  return <span className={cn('num', t, className)}>{v >= 0 ? '+' : '-'}{prefix}{Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}{suffix}</span>;
}

export function Chip({ children, tone = 'mute', className }: { children: ReactNode; tone?: 'up' | 'down' | 'warn' | 'brand' | 'mute' | 'cyan'; className?: string }) {
  const m = { up: 'bg-up/12 text-up', down: 'bg-down/12 text-down', warn: 'bg-warn/12 text-warn', brand: 'bg-brand/15 text-brand', cyan: 'bg-brand2/12 text-brand2', mute: 'bg-white/5 text-mute' }[tone];
  return <span className={cn('chip', m, className)}>{children}</span>;
}

export function Modal({ open, onClose, title, children, width = 'max-w-md', dismiss = true }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: string; dismiss?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (dismiss && e.target === e.currentTarget) onClose(); }}>
      <div className={cn('glass max-h-[92vh] w-full animate-slideIn overflow-y-auto rounded-t-2xl sm:rounded-2xl', width)}>
        {title ? (
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {dismiss ? <button className="btn-ghost !px-2 !py-1 text-mute" onClick={onClose} aria-label="Close">✕</button> : null}
          </div>
        ) : null}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) { return <div className="px-4 py-8 text-center text-[13px] text-mute">{children}</div>; }

export function Meter({ value, max = 100, tone = 'brand', label }: { value: number; max?: number; tone?: 'up' | 'down' | 'warn' | 'brand'; label?: ReactNode }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  const c = tone === 'up' ? 'bg-up' : tone === 'down' ? 'bg-down' : tone === 'warn' ? 'bg-warn' : 'bg-gradient-to-r from-brand to-brand2';
  return (
    <div>
      {label ? <div className="mb-1 flex justify-between text-[11.5px]"><span className="text-mute">{label}</span><span className="num text-soft">{value.toFixed(0)}</span></div> : null}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className={cn('h-full rounded-full transition-all duration-500', c)} style={{ width: `${w}%` }} /></div>
    </div>
  );
}

/** Flashes green/red when the value changes. Keeps re-render cost low by remounting only the span. */
export function FlashNum({ value, text, className }: { value: number; text: string; className?: string }) {
  const prev = useRef(value);
  const [dir, setDir] = useState<'' | 'up' | 'down'>('');
  const [k, setK] = useState(0);
  useEffect(() => {
    if (value !== prev.current) { setDir(value > prev.current ? 'up' : 'down'); setK((x) => x + 1); prev.current = value; }
  }, [value]);
  return <span key={k} className={cn('num rounded px-0.5', dir === 'up' && 'animate-flashUp', dir === 'down' && 'animate-flashDown', className)}>{text}</span>;
}

export function Sparkline({ data, className, up }: { data: number[]; className?: string; up?: boolean }) {
  if (data.length < 2) return <div className={className} />;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / rng) * 100}`).join(' ');
  const c = up === undefined ? (data[data.length - 1] >= data[0] ? '#2ED3A0' : '#FF5C74') : up ? '#2ED3A0' : '#FF5C74';
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className}><polyline fill="none" stroke={c} strokeWidth="2.4" vectorEffect="non-scaling-stroke" points={pts} /></svg>;
}

export function AreaChart({ points, height = 140, color = '#7C8CFF', zeroLine }: { points: { x: string; y: number }[]; height?: number; color?: string; zeroLine?: number }) {
  if (points.length < 2) return <div className="flex items-center justify-center text-[12px] text-mute" style={{ height }}>The curve appears after a few game days.</div>;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (zeroLine !== undefined) { min = Math.min(min, zeroLine); max = Math.max(max, zeroLine); }
  const rng = max - min || 1;
  const W = 600, H = 140, pad = 6;
  const X = (i: number) => (i / (points.length - 1)) * W;
  const Y = (v: number) => H - pad - ((v - min) / rng) * (H - pad * 2);
  const line = points.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const id = 'g' + color.replace('#', '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {zeroLine !== undefined ? <line x1="0" x2={W} y1={Y(zeroLine)} y2={Y(zeroLine)} stroke="#7C88A6" strokeDasharray="4 4" strokeWidth="1" opacity=".5" /> : null}
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return <label className="block"><span className="label mb-1 block">{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] text-mute">{hint}</span> : null}</label>;
}
