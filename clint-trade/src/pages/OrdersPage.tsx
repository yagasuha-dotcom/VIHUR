import { useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { dayLabel } from '@/engine/time';
import { HistoryTable, OrdersTable, PositionsTable } from '@/components/BottomPanel';
import { Chip, Empty, Panel } from '@/components/ui';
import { money, px } from '@/utils/format';

export function OrdersPage() {
  const snap = useGame((s) => s.snap)!;
  const ipos = snap.ipoOpen;
  const subs = snap.player.ipoSubs.filter((s) => !s.filled);
  const [amt, setAmt] = useState<Record<string, string>>({});
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-3 md:p-5">
      {ipos.length || subs.length ? (
        <Panel title="IPO subscriptions" right={<Chip tone="brand">New listings</Chip>}>
          <div className="flex flex-col gap-3">
            {ipos.map((c) => {
              const mine = subs.find((s) => s.assetId === c.assetId);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-abyss/40 p-3">
                  <div className="min-w-[180px] flex-1"><div className="text-[14px] font-semibold">{c.name}</div><div className="text-[12px] text-mute">{c.blurb}</div><div className="num mt-1 text-[12px]">IPO price <b className="text-snow">${c.ipoPrice}</b> · lists {dayLabel(c.ipoDay ?? 0)} 09:30</div></div>
                  {mine ? <Chip tone="up">Subscribed {money(mine.amount, 0)}</Chip> : (
                    <div className="flex items-center gap-2"><input className="input num !w-28" placeholder="$ amount" value={amt[c.id] ?? ''} onChange={(e) => setAmt({ ...amt, [c.id]: e.target.value })} /><button className="btn-brand" onClick={() => { const err = game.subscribeIpo(c.assetId, Number(amt[c.id])); if (err) game.notify({ kind: 'warn', title: 'IPO', msg: err }); }}>Subscribe</button></div>
                  )}
                </div>
              );
            })}
            <p className="text-[11.5px] leading-relaxed text-mute">Cash is reserved until listing. Hot IPOs may only fill part of your order; unfilled cash is refunded. After listing, the market engine sets the price: it can pop, fade, or collapse.</p>
          </div>
        </Panel>
      ) : null}
      <Panel title="Open positions" pad={false}><PositionsTable /></Panel>
      <Panel title="Pending orders" pad={false}><OrdersTable /></Panel>
      <Panel title="Trade history" pad={false}><HistoryTable limit={100} /></Panel>
      <span className="hidden">{CATALOG_MAP['BTC/USD'].id}{px(1, 1)}<Empty>.</Empty></span>
    </div>
  );
}
