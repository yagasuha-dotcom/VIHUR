import { useMemo, useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG, CATALOG_MAP } from '@/engine/catalog';
import { debtEquity, marketCapB, peOf, roeOf } from '@/engine/companyEngine';
import { FundamentalsCard } from '@/components/Fundamentals';
import { Chip, Panel, Tabs } from '@/components/ui';
import { cn, compact, pct } from '@/utils/format';

export function FundamentalsPage() {
  const selected = useGame((s) => s.selected);
  const ver = useGame((s) => Math.floor((s.snap?.version ?? 0) / 16));
  const [tab, setTab] = useState<'stock' | 'crypto' | 'forex'>('stock');
  const [sort, setSort] = useState<'cap' | 'pe' | 'growth' | 'de'>('cap');
  const w = game.world;
  const rows = useMemo(() => {
    if (tab !== 'stock') return [];
    const r = CATALOG.filter((d) => d.cls === 'stock' && w.s.companies[d.id] && w.s.companies[d.id].status !== 'PRE_IPO').map((d) => { const c = w.s.companies[d.id]; const a = w.asset(d.id); return { d, c, a, pe: peOf(c, a.price), cap: marketCapB(c, a.price), de: debtEquity(c), roe: roeOf(c) }; });
    r.sort((x, y) => sort === 'cap' ? y.cap - x.cap : sort === 'pe' ? (x.pe ?? 999) - (y.pe ?? 999) : sort === 'growth' ? y.c.growth - x.c.growth : y.de - x.de);
    return r;
  }, [tab, sort, ver]);
  const coins = CATALOG.filter((d) => d.cls === 'crypto');
  const pairs = CATALOG.filter((d) => d.cls === 'forex');
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-3 md:p-5">
      <Tabs value={tab} onChange={setTab} items={[{ id: 'stock', label: 'Stocks' }, { id: 'crypto', label: 'Crypto' }, { id: 'forex', label: 'Forex' }]} />
      {tab === 'stock' ? (
        <Panel title="Company fundamentals" pad={false} right={<select className="input !w-auto !py-1" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="cap">Sort: market cap</option><option value="pe">Sort: P/E</option><option value="growth">Sort: growth</option><option value="de">Sort: debt/equity</option></select>}>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-white/5"><th className="th">Company</th><th className="th">Sector</th><th className="th text-right">P/E</th><th className="th text-right">Growth</th><th className="th text-right">Margin</th><th className="th text-right">D/E</th><th className="th text-right">ROE</th><th className="th text-right">Mkt cap</th><th className="th text-right">Div</th><th className="th">Status</th></tr></thead><tbody>
            {rows.map(({ d, c, pe, cap, de, roe }) => (
              <tr key={d.id} onClick={() => useGame.setState({ selected: d.id })} className={cn('cursor-pointer border-b border-white/[.04] hover:bg-white/[.03]', selected === d.id && 'bg-brand/10')}>
                <td className="td"><div className="font-medium">{d.symbol}</div><div className="text-[10.5px] text-mute">{d.name}</div></td><td className="td text-mute">{c.sector}</td>
                <td className="td num text-right">{pe ? pe.toFixed(1) : '-'}</td><td className={cn('td num text-right', c.growth >= 0 ? 'text-up' : 'text-down')}>{pct(c.growth * 100, 1)}</td><td className="td num text-right">{pct(c.margin * 100, 1)}</td>
                <td className={cn('td num text-right', de > 2.5 ? 'text-down' : de > 1.6 ? 'text-warn' : '')}>{de.toFixed(2)}</td><td className="td num text-right">{pct(roe * 100, 1)}</td><td className="td num text-right">${compact(cap * 1e9)}</td><td className="td num text-right">{c.dividendYield ? pct(c.dividendYield * 100, 1) : '-'}</td>
                <td className="td"><Chip tone={c.status === 'ACTIVE' ? 'up' : c.status === 'WARNING' ? 'warn' : 'down'}>{c.status}</Chip></td>
              </tr>))}
          </tbody></table></div>
        </Panel>
      ) : null}
      {tab === 'crypto' ? <div className="flex flex-wrap gap-1.5">{coins.map((d) => <button key={d.id} onClick={() => useGame.setState({ selected: d.id })} className={cn('chip !px-3 !py-1.5 text-[12px]', selected === d.id ? 'bg-brand/25 text-snow' : 'bg-white/5 text-mute')}>{d.symbol}{d.fictional ? ' ✦' : ''}</button>)}</div> : null}
      {tab === 'forex' ? <div className="flex flex-wrap gap-1.5">{pairs.map((d) => <button key={d.id} onClick={() => useGame.setState({ selected: d.id })} className={cn('chip !px-3 !py-1.5 text-[12px]', selected === d.id ? 'bg-brand/25 text-snow' : 'bg-white/5 text-mute')}>{d.id}</button>)}</div> : null}
      <Panel title={`${CATALOG_MAP[selected].name} · fundamentals`} right={<button className="btn-line !py-1 text-[12px]" onClick={() => useGame.setState({ view: 'markets' })}>Open chart</button>}><FundamentalsCard assetId={selected} /></Panel>
    </div>
  );
}
