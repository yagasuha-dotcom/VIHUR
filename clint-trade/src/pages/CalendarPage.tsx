import { useMemo, useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { dayLabel, clockOf, dayIndexOf, WEEKDAYS } from '@/engine/time';
import type { CalendarEvent, ImpactLevel } from '@/types';
import { Chip, Empty, Panel, Tabs } from '@/components/ui';
import { cn, countdown } from '@/utils/format';

const IMP: Record<ImpactLevel, 'mute' | 'cyan' | 'warn' | 'down'> = { LOW: 'mute', MEDIUM: 'cyan', HIGH: 'warn', EXTREME: 'down' };

export function CalendarPage() {
  const snap = useGame((s) => s.snap)!;
  const [tab, setTab] = useState<'up' | 'past'>('up');
  const [minImp, setMinImp] = useState<ImpactLevel>('LOW');
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 };
  const cal = game.world.s.calendar;
  const today = dayIndexOf(snap.t);
  const list = useMemo(() => cal.filter((e) => order[e.impact] >= order[minImp] && (tab === 'up' ? (!e.released && e.t >= snap.t - 60 && e.day <= today + 7) : e.released && e.day >= today - 6 && e.kind !== 'EARNINGS'))
    .sort((a, b) => (tab === 'up' ? a.t - b.t : b.t - a.t)), [cal.length, tab, minImp, Math.floor(snap.t / 300), today]);
  const groups: Record<number, CalendarEvent[]> = {};
  for (const e of list) (groups[e.day] ??= []).push(e);
  const days = Object.keys(groups).map(Number).sort((a, b) => (tab === 'up' ? a - b : b - a));
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-3 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'up', label: 'Upcoming' }, { id: 'past', label: 'Released' }]} />
        <select className="input !w-auto" value={minImp} onChange={(e) => setMinImp(e.target.value as ImpactLevel)}>{(['LOW', 'MEDIUM', 'HIGH', 'EXTREME'] as ImpactLevel[]).map((i) => <option key={i} value={i}>{i === 'LOW' ? 'All impact' : `${i}+ impact`}</option>)}</select>
      </div>
      {days.length === 0 ? <Empty>No events in this window.</Empty> : days.map((d) => (
        <Panel key={d} title={<span>{dayLabel(d)} <span className="ml-1 text-[11.5px] font-normal text-mute">{WEEKDAYS[((d % 7) + 7) % 7]}</span></span>} pad={false}>
          <div className="divide-y divide-white/[.05]">
            {groups[d].map((e) => {
              const secs = e.t - snap.t;
              const soon = !e.released && secs > 0 && secs < 900;
              const surprise = e.actual !== undefined && e.forecast !== undefined ? e.actual - e.forecast : 0;
              return (
                <div key={e.id} className={cn('flex items-center gap-3 px-3.5 py-2.5', soon && 'bg-warn/[.06]')}>
                  <div className="num w-12 shrink-0 text-[12.5px] text-soft">{clockOf(e.t, false)}</div>
                  <div className="w-6 shrink-0 text-center text-[16px]">{e.flag}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{e.kind === 'IPO' ? e.name : e.name}</div>
                    <div className="num text-[11px] text-mute">{e.forecast !== undefined ? `Forecast ${e.forecast}${e.unit === '$' ? '' : e.unit}` : ''}{e.previous !== undefined ? ` · Prev ${e.previous}${e.unit}` : ''}{e.kind === 'EARNINGS' ? ` · EPS est. $${e.forecast}` : ''}</div>
                  </div>
                  <div className="text-right">
                    {e.released && e.actual !== undefined ? <div className={cn('num text-[13px] font-medium', Math.abs(surprise) < 1e-9 ? 'text-soft' : surprise > 0 ? 'text-up' : 'text-down')}>{e.kind === 'EARNINGS' ? `$${e.actual}` : `${e.actual}${e.unit}`}</div> : !e.released ? <div className={cn('num text-[12px]', soon ? 'text-warn' : 'text-brand2')}>{countdown(secs)}</div> : null}
                  </div>
                  <Chip tone={IMP[e.impact]} className="w-[62px] justify-center">{e.impact}</Chip>
                </div>
              );
            })}
          </div>
        </Panel>
      ))}
      <p className="text-[11.5px] leading-relaxed text-mute">Around HIGH and EXTREME events liquidity thins, spreads widen and volatility rises in the final 10 minutes. After the release, prices react to the surprise (actual vs forecast), not the number itself.</p>
      <span className="hidden">{CATALOG_MAP['BTC/USD'].id}</span>
    </div>
  );
}
