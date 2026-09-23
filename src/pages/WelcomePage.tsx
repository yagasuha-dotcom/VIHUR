import { useState } from 'react';
import { game, useGame } from '@/store/controller';
import { DIFFICULTY } from '@/engine/difficulty';
import { seedLabel } from '@/engine/rng';
import type { Difficulty } from '@/types';
import { Logo } from '@/components/Header';
import { cn, money } from '@/utils/format';

export function WelcomePage() {
  const meta = useGame((s) => s.meta);
  const phase = useGame((s) => s.phase);
  const progress = useGame((s) => s.progress);
  const [diff, setDiff] = useState<Difficulty>('NORMAL');
  const [seed, setSeed] = useState(() => seedLabel(Math.floor(Math.random() * 900000) + 100000));
  const loading = phase === 'loading';
  return (
    <div className="scanline relative flex h-full flex-col items-center justify-center overflow-y-auto px-5 py-8">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(600px 300px at 50% 30%, rgba(124,140,255,.18), transparent 70%)' }} />
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={64} />
          <h1 className="mt-4 text-[34px] font-bold leading-none tracking-wide">CLINT TRADE</h1>
          <div className="mt-1.5 text-[11px] tracking-[.32em] text-mute">GLOBAL MARKET SIMULATOR</div>
          <p className="mt-5 text-[19px] font-medium leading-snug">Trade.<br />Analyze.<br /><span className="bg-gradient-to-r from-brand to-brand2 bg-clip-text text-transparent">Survive.</span></p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-end justify-between"><div><div className="label">Starting capital</div><div className="num text-[28px] font-semibold">{money(10000, 0)}</div></div><div className="text-right text-[11px] text-mute">Virtual money only</div></div>
          <div className="mt-4"><div className="label mb-1.5">Difficulty</div>
            <div className="grid grid-cols-4 gap-1.5">{(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => <button key={d} disabled={loading} onClick={() => setDiff(d)} className={cn('rounded-lg border py-2 text-[12px] font-semibold transition', diff === d ? (d === 'CHAOS' ? 'border-down bg-down/15 text-down' : 'border-brand bg-brand/15 text-snow') : 'border-edge text-mute hover:text-soft')}>{d}</button>)}</div>
            <p className="mt-1.5 text-[11.5px] text-mute">{DIFFICULTY[diff].blurb}</p>
          </div>
          <label className="mt-4 block"><span className="label">World seed</span><input disabled={loading} className="input num mt-1 text-brand2" value={seed} onChange={(e) => setSeed(e.target.value)} /></label>

          {loading ? (
            <div className="mt-5"><div className="mb-1.5 flex justify-between text-[12px] text-mute"><span>Simulating 90 days of market history...</span><span className="num">{Math.round(progress * 100)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand2 transition-all" style={{ width: `${progress * 100}%` }} /></div><p className="mt-2 text-[11px] text-mute">Building candles, news, earnings and regimes so the world already has a past.</p></div>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              <button className="btn-brand !py-3 text-[14px]" onClick={() => void game.newGame(seed, diff, false)}>START CAREER</button>
              <button className="btn-line !py-2.5" onClick={() => void game.newGame(seed, diff, true)}>LEARN TRADING</button>
              {meta ? <button className="btn-line !py-2.5 !border-brand/40" onClick={() => void game.continueGame()}>Continue career <span className="num ml-1 text-mute">DAY {meta.day + 1} · {money(meta.netWorth, 0)} · Lv {meta.level}</span></button> : null}
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-mute">All money, assets, companies and news are fictional. No real trading, no broker, no real funds.</p>
      </div>
    </div>
  );
}
