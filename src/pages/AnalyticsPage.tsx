import { useMemo } from 'react';
import { game, useGame } from '@/store/controller';
import { CLASS_LABEL } from '@/engine/catalog';
import { computeStats } from '@/features/analytics/stats';
import { psychSummary } from '@/features/trading/engine';
import { fmtDuration } from '@/features/journal/journal';
import { AreaChart, Delta, Meter, Panel, Stat } from '@/components/ui';
import { money } from '@/utils/format';

export function AnalyticsPage() {
  const snap = useGame((s) => s.snap)!;
  const p = snap.player;
  const st = useMemo(() => computeStats(p), [p.trades.length, snap.day]);
  const ps = psychSummary(p);
  const eq = p.equityHistory.map((e) => ({ x: `D${e.day + 1}`, y: e.equity })).concat([{ x: 'now', y: snap.account.equity }]);
  const flags = [...p.psychFlags].reverse().slice(0, 6);
  const tone = (v: number) => (v >= 65 ? 'up' : v >= 40 ? 'warn' : 'down') as 'up' | 'warn' | 'down';
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-3 md:p-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([['Total P/L', money(st.totalPL), st.totalPL >= 0 ? 'up' : 'down'], ['Win rate', `${st.winRate.toFixed(1)}%`, undefined], ['Avg win', money(st.avgWin), 'up'], ['Avg loss', money(st.avgLoss), 'down'], ['Profit factor', isFinite(st.profitFactor) ? st.profitFactor.toFixed(2) : '∞', undefined], ['Max drawdown', `${st.maxDD.toFixed(1)}%`, st.maxDD > 25 ? 'down' : undefined], ['Sharpe-like', st.sharpe.toFixed(2), undefined], ['Expectancy', money(st.expectancy), st.expectancy >= 0 ? 'up' : 'down'], ['Best trade', money(st.bestTrade), 'up'], ['Worst trade', money(st.worstTrade), 'down'], ['Largest trade', money(st.largestTrade, 0), undefined], ['Total trades', String(st.totalTrades), undefined]] as const).map(([k, v, t]) => <Panel key={k}><Stat label={k} value={v} tone={t as 'up' | 'down' | undefined} /></Panel>)}
      </div>
      <Panel title="Equity curve"><AreaChart points={eq} height={180} zeroLine={p.startCapital} /><div className="mt-2 text-[11.5px] text-mute">Average hold {st.totalTrades ? fmtDuration(st.avgHold) : '-'} · Margin calls {p.counters.marginCalls} · Liquidations {p.counters.liquidations}</div></Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Trading psychology" right={<span className="text-[11px] text-mute">Updates with every trade</span>}>
          <div className="flex flex-col gap-3"><Meter value={ps.discipline} tone={tone(ps.discipline)} label="Discipline" /><Meter value={ps.patience} tone={tone(ps.patience)} label="Patience" /><Meter value={ps.riskControl} tone={tone(ps.riskControl)} label="Risk control" /></div>
          <div className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-[12px] text-soft"><b>Coach:</b> {ps.advice}</div>
          <p className="mt-2 text-[11px] leading-relaxed text-mute">Discipline: stops and sticking to plans. Patience: overtrading and hold time. Risk control: leverage, position risk and exposure. These feed your reputation, which unlocks tools and loan limits.</p>
        </Panel>
        <Panel title="Behaviour feedback">
          {flags.length ? <div className="flex flex-col gap-2">{flags.map((f, i) => <div key={i} className="rounded-lg border border-warn/25 bg-warn/[.06] px-3 py-2 text-[12px]"><div className="mb-0.5 font-semibold text-warn">⚠ {f.code === 'OVERTRADE' ? 'POSSIBLE OVERTRADING' : f.code === 'REVENGE' ? 'POSSIBLE REVENGE TRADE' : f.code.replace('_', ' ')}</div><div className="text-soft">"{f.msg}"</div></div>)}</div> : <div className="py-6 text-center text-[12.5px] text-mute">No behavioural warnings. Keep sizing consistent and use stop losses.</div>}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11.5px]"><div className="rounded-lg bg-white/[.03] p-2"><div className="num text-[16px]">{p.counters.overtradeFlags}</div><div className="text-mute">Overtrading</div></div><div className="rounded-lg bg-white/[.03] p-2"><div className="num text-[16px]">{p.counters.revengeFlags}</div><div className="text-mute">Revenge</div></div><div className="rounded-lg bg-white/[.03] p-2"><div className="num text-[16px]">{p.counters.leverageMax}x</div><div className="text-mute">Max leverage</div></div></div>
        </Panel>
      </div>
      <Panel title="Results by market" pad={false}>
        <table className="w-full text-left"><thead><tr className="border-b border-white/5"><th className="th">Class</th><th className="th text-right">Trades</th><th className="th text-right">P/L</th></tr></thead><tbody>
          {Object.entries(st.byClass).length ? Object.entries(st.byClass).map(([k, v]) => <tr key={k} className="border-b border-white/[.04]"><td className="td">{CLASS_LABEL[k as keyof typeof CLASS_LABEL]}</td><td className="td num text-right">{v.n}</td><td className="td text-right"><Delta v={v.pnl} prefix="$" /></td></tr>) : <tr><td className="td text-mute" colSpan={3}>No closed trades yet.</td></tr>}
        </tbody></table>
      </Panel>
      <span className="hidden">{String(game.world.day)}</span>
    </div>
  );
}
