import { useGame } from '@/store/controller';
import { CLASS_LABEL } from '@/engine/catalog';
import { computeStats } from '@/features/analytics/stats';
import { cn, money } from '@/utils/format';
import { AreaChart, Panel, Stat } from '@/components/ui';
import { PositionsTable } from '@/components/BottomPanel';
import { useMemo } from 'react';

const CLS_COLOR: Record<string, string> = { crypto: '#F4B740', forex: '#4FD8F0', stock: '#7C8CFF', commodity: '#C77DFF', index: '#2ED3A0', bond: '#A9B3CC', cash: '#3B4A72' };

export function PortfolioPage() {
  const snap = useGame((s) => s.snap)!;
  const a = snap.account, p = snap.player;
  const stats = useMemo(() => computeStats(p), [p.trades.length]);
  const parts = [{ id: 'cash', label: 'Cash (free)', v: Math.max(0, a.cash) }, ...Object.entries(a.holdings).map(([k, v]) => ({ id: k, label: CLASS_LABEL[k as keyof typeof CLASS_LABEL] ?? k, v: Math.max(0, v) }))];
  const total = parts.reduce((s, x) => s + x.v, 0) || 1;
  const nwPoints = p.equityHistory.map((e) => ({ x: `D${e.day + 1}`, y: e.netWorth })).concat([{ x: 'now', y: a.netWorth }]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-3 md:p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Balance', money(a.balance), undefined], ['Equity', money(a.equity), a.equity >= a.balance ? 'up' : 'down'], ['Free margin', money(a.freeMargin), undefined], ['Used margin', money(a.usedMargin), undefined], ['Unrealised P/L', money(a.unrealized), a.unrealized >= 0 ? 'up' : 'down'], ['Realised P/L', money(p.realized), p.realized >= 0 ? 'up' : 'down'], ['Debt', money(a.debt), a.debt > 0 ? 'down' : undefined], ['Net worth', money(a.netWorth), a.netWorth >= p.startCapital ? 'up' : 'down']] as const).map(([k, v, t]) => (
          <Panel key={k} className="!rounded-xl"><Stat label={k} value={v} tone={t as 'up' | 'down' | undefined} className="[&>div:nth-child(2)]:!text-[19px]" /></Panel>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Net worth" className="lg:col-span-3" right={<span className="num text-[12px] text-mute">start {money(p.startCapital, 0)}</span>}>
          <AreaChart points={nwPoints} height={170} zeroLine={p.startCapital} />
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-mute"><span>Margin level <b className="num font-medium text-soft">{isFinite(a.marginLevel) ? `${a.marginLevel.toFixed(0)}%` : 'n/a'}</b></span><span>Max drawdown <b className="num font-medium text-soft">{(p.maxDD * 100).toFixed(1)}%</b></span><span>Win rate <b className="num font-medium text-soft">{stats.winRate.toFixed(0)}%</b></span></div>
        </Panel>
        <Panel title="Where your wealth sits" className="lg:col-span-2">
          <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-white/5">{parts.map((x) => <div key={x.id} style={{ width: `${(x.v / total) * 100}%`, background: CLS_COLOR[x.id] ?? '#7C8CFF' }} />)}</div>
          <div className="flex flex-col gap-1.5 text-[12.5px]">
            {parts.map((x) => <div key={x.id} className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: CLS_COLOR[x.id] ?? '#7C8CFF' }} />{x.label}</span><span className="num text-soft">{money(x.v)}</span></div>)}
            <div className="flex items-center justify-between text-down"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-down" />Debt</span><span className="num">-{money(a.debt)}</span></div>
            <div className={cn('mt-1 flex items-center justify-between border-t border-white/5 pt-2 font-semibold', a.netWorth >= 0 ? 'text-snow' : 'text-down')}><span>Net worth</span><span className="num">{money(a.netWorth)}</span></div>
          </div>
          <p className="mt-2 text-[11px] text-mute">Net worth = cash + holdings − debt.</p>
        </Panel>
      </div>
      <Panel title="Open positions" pad={false}><PositionsTable /></Panel>
    </div>
  );
}
