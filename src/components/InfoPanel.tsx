import { useMemo, useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { buildBook } from '@/engine/orderBook';
import { hashString } from '@/engine/rng';
import { analyze } from '@/features/analytics/ai';
import { cn, compact, money, pct, px } from '@/utils/format';
import { Chip, Tabs } from './ui';
import { FundamentalsCard } from './Fundamentals';
import { AssetNews } from './News';
import { OrderPanel } from './OrderPanel';

type Tab = 'trade' | 'analysis' | 'book' | 'news';

export function InfoPanel({ withTrade = true }: { withTrade?: boolean }) {
  const tab = useGame((s) => s.rightTab) as Tab;
  const items: { id: Tab; label: string }[] = [...(withTrade ? [{ id: 'trade' as Tab, label: 'Trade' }] : []), { id: 'analysis', label: 'Analysis' }, { id: 'book', label: 'Depth' }, { id: 'news', label: 'News' }];
  const cur: Tab = !withTrade && tab === 'trade' ? 'analysis' : tab === 'order' as string ? 'trade' : tab;
  const selected = useGame((s) => s.selected);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-2"><Tabs value={cur} onChange={(v) => useGame.setState({ rightTab: v })} items={items} className="w-full [&>button]:flex-1 [&>button]:justify-center" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {cur === 'trade' ? <OrderPanel /> : null}
        {cur === 'analysis' ? <Analysis assetId={selected} /> : null}
        {cur === 'book' ? <Depth assetId={selected} /> : null}
        {cur === 'news' ? <AssetNews assetId={selected} /> : null}
      </div>
    </div>
  );
}

function Analysis({ assetId }: { assetId: string }) {
  const tf = useGame((s) => s.tf);
  const ver = useGame((s) => Math.floor((s.snap?.version ?? 0) / 16));
  const rep = useGame((s) => s.snap!.player.reputation);
  const out = useMemo(() => analyze(game.world, assetId, tf), [assetId, tf, ver]);
  const def = CATALOG_MAP[assetId];
  const a = game.world.asset(assetId);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-brand/20 bg-gradient-to-br from-brand/10 to-transparent p-3">
        <div className="mb-1.5 flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-md bg-brand/20 text-[11px] font-bold text-brand">AI</span><div><div className="text-[12.5px] font-semibold">CLINT AI</div><div className="text-[10.5px] text-mute">Descriptive analysis only. No trade advice.</div></div></div>
        <div className="mb-2 flex flex-wrap gap-1">{out.tags.map((t) => <Chip key={t.label} tone={t.tone === 'up' ? 'up' : t.tone === 'down' ? 'down' : t.tone === 'warn' ? 'warn' : 'mute'}>{t.label}</Chip>)}</div>
        <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-soft">{out.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      </div>
      <div className="rounded-xl border border-white/5 p-3">
        <div className="mb-1.5 text-[12.5px] font-semibold">Market information</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
          <span className="text-mute">Max leverage</span><span className="num text-right">{def.maxLeverage}x</span>
          <span className="text-mute">Base daily vol.</span><span className="num text-right">{pct(def.dailyVol * 100, 1)}</span>
          <span className="text-mute">Spread</span><span className="num text-right">{(a.spread * 100).toFixed(3)}%</span>
          <span className="text-mute">Liquidity</span><span className="num text-right">{(a.liquidityNow * 100).toFixed(0)}%</span>
          <span className="text-mute">24h volume</span><span className="num text-right">{compact(a.volume24)} {def.unit}</span>
          <span className="text-mute">Fee</span><span className="num text-right">{(def.feePct * 100).toFixed(3)}%</span>
        </div>
        {rep < 25 ? <p className="mt-2 text-[10.5px] text-mute">Tip: raise reputation to 25 to unlock Bollinger, VWAP, MACD and ATR.</p> : null}
      </div>
      <div className="rounded-xl border border-white/5 p-3"><div className="mb-1.5 text-[12.5px] font-semibold">Fundamentals</div><FundamentalsCard assetId={assetId} /></div>
    </div>
  );
}

function Depth({ assetId }: { assetId: string }) {
  const rep = useGame((s) => s.snap!.player.reputation);
  const snap = useGame((s) => s.snap)!;
  const def = CATALOG_MAP[assetId];
  const a = game.world.asset(assetId);
  const [n] = useState(10);
  if (rep < 35) return <div className="rounded-xl border border-white/5 p-4 text-center text-[12.5px] text-mute"><div className="mb-1 text-[20px]">🔒</div>Market depth unlocks at reputation 35.<br />Currently {rep.toFixed(0)}. Trade with stops and complete missions to earn it.</div>;
  const notionalPerUnit = def.cls === 'forex' ? (def.base === 'USD' ? 1 : a.price) : a.price;
  const book = buildBook(a.price, a.spread, (def.depthUSD * a.price) / notionalPerUnit, a.liquidityNow, hashString(def.id), Math.floor(snap.t / 30), n);
  const unit = def.cls === 'forex' ? def.lotSize ?? 1 : 1;
  const max = Math.max(...book.bids.map((b) => b.size), ...book.asks.map((b) => b.size));
  const Row = ({ l, bid }: { l: { price: number; size: number }; bid: boolean }) => (
    <div className="relative flex justify-between px-2 py-[3px] text-[12px]">
      <div className={cn('absolute inset-y-0 right-0', bid ? 'bg-up/12' : 'bg-down/12')} style={{ width: `${(l.size / max) * 100}%` }} />
      <span className={cn('num relative', bid ? 'text-up' : 'text-down')}>{px(l.price, def.decimals)}</span>
      <span className="num relative text-soft">{compact(l.size / unit)}</span>
    </div>
  );
  return (
    <div>
      <div className="mb-1 flex justify-between px-2 text-[10.5px] text-mute"><span>Price</span><span>Size ({def.cls === 'forex' ? 'lots' : def.unit})</span></div>
      <div className="rounded-lg bg-abyss/40">{[...book.asks].reverse().map((l, i) => <Row key={'a' + i} l={l} bid={false} />)}
        <div className="num border-y border-white/5 py-1.5 text-center text-[13px] font-medium">{px(a.price, def.decimals)} <span className="text-[10.5px] text-mute">spread {(a.spread * 100).toFixed(3)}%</span></div>
        {book.bids.map((l, i) => <Row key={'b' + i} l={l} bid />)}</div>
      <p className="mt-2 text-[11px] leading-relaxed text-mute">Large market orders walk this book and fill at worse prices (slippage). Depth thins when liquidity drops, spreads widen, or a major release is near. Total visible depth ≈ {money(book.depthUnits * notionalPerUnit)}.</p>
    </div>
  );
}
