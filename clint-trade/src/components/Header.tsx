import { useEffect, useState } from 'react';
import { game, useGame } from '@/store/controller';
import { REGIMES } from '@/engine/regimes';
import { clockOf, dayLabel, dayIndexOf } from '@/engine/time';
import { cn, countdown, money, moneyCompact } from '@/utils/format';
import { Chip } from './ui';

const SPEEDS = [1, 2, 5, 10, 25, 50];

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <div className="grid place-items-center rounded-[10px] p-[1.5px]" style={{ width: size, height: size, background: 'linear-gradient(135deg,#7C8CFF,#4FD8F0)' }}>
      <div className="grid h-full w-full place-items-center rounded-[9px] bg-deep text-[13px] font-bold tracking-tight" style={{ fontSize: size * 0.4 }}><span className="bg-gradient-to-br from-brand to-brand2 bg-clip-text text-transparent">CT</span></div>
    </div>
  );
}

function SentimentGauge({ v }: { v: number }) {
  const pos = ((v + 1) / 2) * 100;
  const label = v > 0.55 ? 'Extreme greed' : v > 0.2 ? 'Greed' : v < -0.55 ? 'Extreme fear' : v < -0.2 ? 'Fear' : 'Neutral';
  return (
    <div className="flex items-center gap-2" title={`Market sentiment ${v.toFixed(2)}`}>
      <div className="relative h-1.5 w-20 rounded-full" style={{ background: 'linear-gradient(90deg,#FF5C74,#F4B740 50%,#2ED3A0)' }}>
        <div className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-sm bg-white shadow transition-all duration-700" style={{ left: `calc(${pos}% - 2px)` }} />
      </div>
      <span className="hidden text-[11.5px] text-soft xl:inline">{label}</span>
    </div>
  );
}

export function Header({ onBell, unread }: { onBell: () => void; unread: number }) {
  const snap = useGame((s) => s.snap)!;
  const [now, setNow] = useState(0);
  useEffect(() => { setNow((x) => x + 1); }, [snap.version]);
  const reg = REGIMES[snap.regime];
  const next = snap.upcoming.find((e) => e.impact === 'HIGH' || e.impact === 'EXTREME') ?? snap.upcoming[0];
  const secs = next ? next.t - snap.t : 0;
  const soon = next && secs < 600;
  const acc = snap.account;
  const sessionColor = snap.mh.weekend ? 'text-mute' : snap.mh.session === 'US' ? 'text-up' : 'text-brand2';
  void now;
  return (
    <header className="glass z-20 flex h-14 shrink-0 items-center gap-3 rounded-none border-x-0 border-t-0 px-3 md:px-4">
      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="hidden leading-none md:block">
          <div className="text-[15px] font-bold tracking-wide">CLINT TRADE</div>
          <div className="mt-0.5 text-[9.5px] tracking-[.18em] text-mute">TRADE. ANALYZE. SURVIVE.</div>
        </div>
      </div>

      <div className="mx-1 hidden h-7 w-px bg-white/10 lg:block" />
      <div className="hidden items-center gap-3 lg:flex">
        <div className="leading-tight">
          <div className={cn('text-[11px] font-semibold', sessionColor)}><span className="mr-1 inline-block h-1.5 w-1.5 animate-pulseDot rounded-full bg-current align-middle" />{snap.mh.weekend ? 'WEEKEND' : `${snap.mh.session} SESSION`}</div>
          <div className="text-[10.5px] text-mute">{snap.mh.stock ? 'Stocks open' : snap.mh.preMarket ? 'Stocks pre-market' : 'Stocks closed'} · Crypto 24/7</div>
        </div>
        <Chip tone={snap.regime === 'PANIC' || snap.regime === 'BEAR' ? 'down' : snap.regime === 'BULL' || snap.regime === 'RECOVERY' || snap.regime === 'EUPHORIA' ? 'up' : 'brand'}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: reg.color }} />{reg.label}
        </Chip>
        <SentimentGauge v={snap.sentiment} />
        {next ? (
          <div className={cn('rounded-lg border px-2 py-1 leading-tight', soon ? 'animate-pulseDot border-warn/50 bg-warn/10' : 'border-white/10')}>
            <div className="text-[10.5px] text-mute">{soon ? '⚠ HIGH VOLATILITY EXPECTED' : 'Next event'}</div>
            <div className="num text-[11.5px]"><span className="text-soft">{next.flag} {next.name.split(' (')[0]}</span> <span className={soon ? 'text-warn' : 'text-brand2'}>{countdown(secs)}</span></div>
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <div className="text-right leading-tight">
          <div className="num text-[13px] font-semibold md:text-[15px]">{dayLabel(dayIndexOf(snap.t))} <span className="text-brand2">{clockOf(snap.t)}</span></div>
          <div className="text-[10px] text-mute lg:hidden">{snap.mh.weekend ? 'Weekend' : snap.mh.session}</div>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-abyss/60 p-0.5">
          <button className={cn('grid h-7 w-8 place-items-center rounded-md text-[13px]', snap.paused ? 'bg-brand/25 text-snow' : 'text-soft hover:bg-white/5')} onClick={() => game.toggle()} aria-label={snap.paused ? 'Play' : 'Pause'}>{snap.paused ? '▶' : '❚❚'}</button>
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => game.setSpeed(s)} className={cn('num hidden h-7 min-w-[30px] rounded-md px-1.5 text-[11.5px] sm:block', !snap.paused && snap.speed === s ? 'bg-brand/25 text-snow' : 'text-mute hover:text-soft')}>{s}x</button>
          ))}
          <select className="num h-7 rounded-md bg-transparent px-1 text-[12px] text-soft outline-none sm:hidden" value={snap.speed} onChange={(e) => game.setSpeed(Number(e.target.value))}>{SPEEDS.map((s) => <option key={s} value={s} className="bg-deep">{s}x</option>)}</select>
        </div>
        <div className="hidden text-right leading-tight md:block">
          <div className="label">Balance</div>
          <div className="num text-[14px] font-medium">{money(acc.balance)}</div>
        </div>
        <div className="text-right leading-tight">
          <div className="label">Net worth</div>
          <div className={cn('num text-[13px] font-semibold md:text-[15px]', acc.netWorth >= snap.player.startCapital ? 'text-up' : 'text-down')}>{moneyCompact(acc.netWorth)}</div>
        </div>
        <button className="relative grid h-8 w-8 place-items-center rounded-lg text-soft hover:bg-white/5" onClick={onBell} aria-label="Notifications">
          🔔{unread > 0 ? <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-down px-1 text-[9.5px] font-bold text-white">{Math.min(unread, 99)}</span> : null}
        </button>
      </div>
    </header>
  );
}
