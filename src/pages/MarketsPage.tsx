import { useGame } from '@/store/controller';
import { PriceChart } from '@/components/PriceChart';
import { Watchlist } from '@/components/Watchlist';
import { InfoPanel } from '@/components/InfoPanel';
import { BottomPanel } from '@/components/BottomPanel';
import { OrderPanel } from '@/components/OrderPanel';
import { CATALOG_MAP } from '@/engine/catalog';
import { cn, px, pct } from '@/utils/format';
import { Tabs } from '@/components/ui';
import { useMedia } from '@/hooks/useMedia';

export function MarketsPage() {
  const mobileTab = useGame((s) => s.mobileTab);
  const sheet = useGame((s) => s.sheet);
  const selected = useGame((s) => s.selected);
  const price = useGame((s) => s.snap!.prices[selected]);
  const def = CATALOG_MAP[selected];
  const npos = useGame((s) => s.snap!.positions.length);
  const desktop = useMedia('(min-width: 768px)');
  return (
    <>
      {/* Desktop terminal */}
      {desktop ? <div className="flex h-full min-h-0">
        <aside className="glass-flat w-[236px] shrink-0 border-y-0 border-l-0 xl:w-[262px]"><Watchlist /></aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-[3]"><PriceChart /></div>
          <div className="glass-flat h-[228px] shrink-0 border-x-0 border-b-0"><BottomPanel /></div>
        </div>
        <aside className="glass-flat w-[330px] shrink-0 border-y-0 border-r-0 xl:w-[352px]"><InfoPanel /></aside>
      </div> : (

      /* Mobile: chart first */
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-2 pt-2"><Tabs value={mobileTab} onChange={(v) => useGame.setState({ mobileTab: v })} items={[{ id: 'chart', label: 'Chart' }, { id: 'watch', label: 'Markets' }, { id: 'info', label: 'Analysis' }, { id: 'pos' as 'chart', label: 'Positions', badge: npos }]} className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-1" /></div>
        <div className="min-h-0 flex-1">
          {mobileTab === 'chart' ? <PriceChart /> : null}
          {mobileTab === 'watch' ? <Watchlist onPick={() => useGame.setState({ mobileTab: 'chart' })} /> : null}
          {mobileTab === 'info' ? <InfoPanel withTrade={false} /> : null}
          {(mobileTab as string) === 'pos' ? <div className="h-full overflow-y-auto"><BottomPanel /></div> : null}
        </div>
        {mobileTab === 'chart' ? (
          <div className="glass safe-bottom flex shrink-0 items-center gap-2 rounded-none border-x-0 border-b-0 px-3 py-2">
            <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-[12.5px] font-semibold">{def.symbol}</div><div className="num text-[12px]"><span>{px(price?.price ?? 0, def.decimals)}</span> <span className={cn(price && price.changePct >= 0 ? 'text-up' : 'text-down')}>{pct(price?.changePct ?? 0)}</span></div></div>
            <button className="btn-down !px-5 !py-2.5" onClick={() => useGame.setState({ orderSide: 'SELL', sheet: true })}>SELL</button>
            <button className="btn-up !px-5 !py-2.5" onClick={() => useGame.setState({ orderSide: 'BUY', sheet: true })}>BUY</button>
          </div>
        ) : null}
        {sheet ? (
          <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm" onClick={() => useGame.setState({ sheet: false })}>
            <div className="glass max-h-[90vh] w-full animate-slideIn overflow-y-auto rounded-t-2xl p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
              <div className="mb-3 flex items-center justify-between"><h3 className="text-[15px] font-semibold">{def.name}</h3><button className="btn-ghost !px-2" onClick={() => useGame.setState({ sheet: false })}>✕</button></div>
              <OrderPanel compact />
            </div>
          </div>
        ) : null}
      </div>)}
    </>
  );
}