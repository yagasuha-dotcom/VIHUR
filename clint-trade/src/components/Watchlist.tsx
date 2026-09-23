import { useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG, CLASS_LABEL, CLASS_ORDER } from '@/engine/catalog';
import { cn, pct, px } from '@/utils/format';
import { FlashNum } from './ui';

export function Watchlist({ onPick }: { onPick?: () => void }) {
  const q = useGame((s) => s.watchQuery);
  const selected = useGame((s) => s.selected);
  const prices = useGame((s) => s.snap!.prices);
  const watch = useGame((s) => s.snap!.player.watch);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const term = q.trim().toLowerCase();
  const visible = CATALOG.filter((d) => prices[d.id] && (!term || d.name.toLowerCase().includes(term) || d.id.toLowerCase().includes(term) || d.symbol.toLowerCase().includes(term)));
  const groups = CLASS_ORDER.map((cls) => ({ cls, items: visible.filter((d) => d.cls === cls) })).filter((g) => g.items.length);
  const favs = visible.filter((d) => watch.includes(d.id));

  const Row = ({ id }: { id: string }) => {
    const d = CATALOG.find((x) => x.id === id)!;
    const p = prices[id];
    return (
      <div onClick={() => { useGame.setState({ selected: id }); onPick?.(); }} className={cn('group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition', selected === id ? 'bg-brand/15 shadow-[inset_2px_0_0_#7C8CFF]' : 'hover:bg-white/5')}>
        <button aria-label="Toggle favourite" onClick={(e) => { e.stopPropagation(); game.toggleWatch(id); }} className={cn('text-[12px]', watch.includes(id) ? 'text-warn' : 'text-white/15 group-hover:text-mute')}>★</button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-[12.5px] font-medium">{d.symbol.length > 9 ? d.symbol.slice(0, 9) : d.symbol}{d.fictional && d.cls !== 'index' ? <span className="text-[9px] text-brand/70">FIC</span> : null}{!p.open ? <span className="text-[9px] text-warn/80">CLOSED</span> : null}{p.status === 'HALTED' ? <span className="text-[9px] text-down">HALT</span> : null}</div>
          <div className="truncate text-[10.5px] text-mute">{d.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[12.5px]"><FlashNum value={p.price} text={px(p.price, d.decimals)} /></div>
          <div className={cn('num text-[11px]', p.changePct >= 0 ? 'text-up' : 'text-down')}>{pct(p.changePct)}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-2"><input className="input" placeholder="Search markets" value={q} onChange={(e) => useGame.setState({ watchQuery: e.target.value })} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {favs.length && !term ? <div className="mb-1"><div className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-warn/80">Favourites</div>{favs.map((d) => <Row key={'f' + d.id} id={d.id} />)}</div> : null}
        {groups.map((g) => (
          <div key={g.cls} className="mb-1">
            <button onClick={() => setCollapsed((c) => ({ ...c, [g.cls]: !c[g.cls] }))} className="flex w-full items-center justify-between px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-mute hover:text-soft"><span>{CLASS_LABEL[g.cls]} <span className="text-white/25">{g.items.length}</span></span><span>{collapsed[g.cls] ? '▸' : '▾'}</span></button>
            {!collapsed[g.cls] ? g.items.map((d) => <Row key={d.id} id={d.id} />) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
