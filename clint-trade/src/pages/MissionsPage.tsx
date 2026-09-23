import { useGame } from '@/store/controller';
import { ACHIEVEMENTS, MISSIONS, careerRank, levelOf } from '@/features/missions/missions';
import { dayLabel } from '@/engine/time';
import { Chip, Meter, Panel } from '@/components/ui';
import { cn, money } from '@/utils/format';

export function MissionsPage() {
  const snap = useGame((s) => s.snap)!;
  const p = snap.player;
  const lv = levelOf(p.xp);
  const days = p.counters.daysPlayed;
  const nw = snap.account.netWorth;
  const prog = (m: (typeof MISSIONS)[number]) => Math.min(m.target, m.progress(p, nw, { t: snap.t } as never));
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-3 md:p-5">
      <Panel>
        <div className="flex flex-wrap items-center gap-5">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand2 text-[24px] font-bold text-abyss">{lv.level}</div>
          <div className="min-w-[200px] flex-1"><div className="text-[11px] text-mute">Career rank</div><div className="text-[18px] font-semibold tracking-wide">{careerRank(days)}</div><div className="mt-1.5"><Meter value={lv.cur} max={lv.next} label={`Level ${lv.level} · ${lv.cur}/${lv.next} XP`} /></div></div>
          <div className="grid grid-cols-3 gap-5 text-center"><div><div className="label">Day</div><div className="num text-[18px]">{days + 1}</div></div><div><div className="label">Reputation</div><div className="num text-[18px]">{p.reputation.toFixed(0)}</div></div><div><div className="label">Credit</div><div className="num text-[18px]">{p.credit.toFixed(0)}</div></div></div>
        </div>
        <div className="mt-4 grid gap-1.5 text-[11.5px] text-mute sm:grid-cols-4">{[['DAY 1', 'NOVICE', days < 30], ['DAY 30', 'TRADER', days >= 30 && days < 100], ['DAY 100', 'EXPERIENCED TRADER', days >= 100 && days < 365], ['DAY 365', 'MARKET VETERAN', days >= 365]].map(([d, n, on]) => <div key={String(d)} className={cn('rounded-lg border px-2.5 py-1.5', on ? 'border-brand/50 bg-brand/10 text-snow' : 'border-white/5')}><b className="text-soft">{d}</b> {n}</div>)}</div>
      </Panel>
      <Panel title="Reputation unlocks">
        <div className="grid gap-2 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">{[[25, 'Bollinger, VWAP, MACD, ATR'], [30, 'Standard loan ($10,000)'], [35, 'Market depth (order book)'], [40, '50x leverage'], [50, 'Premium loan ($25,000)'], [60, 'Special challenges']].map(([r, t]) => <div key={String(r)} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2', p.reputation >= (r as number) ? 'border-up/30 bg-up/[.06]' : 'border-white/5 text-mute')}><span className="num w-7 text-right font-semibold">{r}</span><span>{t}</span>{p.reputation >= (r as number) ? <span className="ml-auto text-up">✓</span> : <span className="ml-auto">🔒</span>}</div>)}</div>
      </Panel>
      <Panel title="Missions">
        <div className="grid gap-2.5 md:grid-cols-2">
          {MISSIONS.map((m) => {
            const done = p.missionsDone[m.id] !== undefined;
            const locked = !!m.minRep && p.reputation < m.minRep && !done;
            const v = done ? m.target : prog(m);
            return (
              <div key={m.id} className={cn('rounded-xl border p-3', done ? 'border-up/30 bg-up/[.05]' : locked ? 'border-white/5 opacity-55' : 'border-white/8 bg-abyss/40')}>
                <div className="mb-1 flex items-center gap-2"><span className="text-[13.5px] font-semibold">{m.title}</span>{m.challenge ? <Chip tone="warn">Challenge</Chip> : null}{m.lowRisk ? <Chip tone="cyan">Low risk</Chip> : null}{done ? <Chip tone="up" className="ml-auto">Done {dayLabel(p.missionsDone[m.id])}</Chip> : locked ? <Chip tone="mute" className="ml-auto">Rep {m.minRep}</Chip> : null}</div>
                <p className="mb-2 text-[12px] text-mute">{m.desc}</p>
                <Meter value={v} max={m.target} tone={done ? 'up' : 'brand'} />
                <div className="mt-1.5 flex justify-between text-[11px] text-mute"><span className="num">{m.target >= 1000 ? `${money(v, 0)} / ${money(m.target, 0)}` : `${Math.floor(v)} / ${m.target}`}</span><span>+{m.xp} XP · {money(m.cash, 0)} · +{m.rep} rep</span></div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Achievements">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">{ACHIEVEMENTS.map((a) => { const on = p.achievements[a.id] !== undefined; return <div key={a.id} className={cn('rounded-xl border p-3 text-center', on ? 'border-warn/40 bg-warn/[.06]' : 'border-white/5 opacity-50')}><div className="mb-1 text-[20px]">{on ? '🏆' : '🔒'}</div><div className="text-[12px] font-semibold">{a.title}</div><div className="mt-0.5 text-[10.5px] text-mute">{a.desc}</div></div>; })}</div>
      </Panel>
    </div>
  );
}
