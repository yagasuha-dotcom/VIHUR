import { useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { fmtGameTime } from '@/engine/time';
import { fmtDuration } from '@/features/journal/journal';
import { liqPriceOf } from '@/features/trading/engine';
import { DIFFICULTY } from '@/engine/difficulty';
import { cn, money, px } from '@/utils/format';
import { Chip, Delta, Empty, Modal, Tabs } from './ui';
import type { PositionView } from '@/store/controller';

export function PositionsTable({ compact = false }: { compact?: boolean }) {
  const positions = useGame((s) => s.snap!.positions);
  const [edit, setEdit] = useState<PositionView | null>(null);
  const diff = DIFFICULTY[game.world.s.difficulty];
  if (!positions.length) return <Empty>No open positions. Pick a market, size your risk, and place your first trade.</Empty>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead><tr className="border-b border-white/5"><th className="th">Asset</th><th className="th">Side</th><th className="th text-right">Size</th><th className="th text-right">Entry</th><th className="th text-right">Current</th><th className="th text-right">P/L</th><th className="th text-right">SL</th><th className="th text-right">TP</th><th className="th text-right">Margin</th><th className="th text-right">Lev</th><th className="th text-right">Liq ≈</th><th className="th" /></tr></thead>
          <tbody>
            {positions.map((p) => {
              const d = CATALOG_MAP[p.assetId];
              return (
                <tr key={p.id} className="border-b border-white/[.04] hover:bg-white/[.02]">
                  <td className="td"><button className="font-medium hover:text-brand" onClick={() => useGame.setState({ selected: p.assetId, view: 'markets' })}>{d.id}</button></td>
                  <td className="td"><Chip tone={p.side === 'LONG' ? 'up' : 'down'}>{p.side}</Chip></td>
                  <td className="td num text-right">{p.size}</td>
                  <td className="td num text-right">{px(p.entry, d.decimals)}</td>
                  <td className="td num text-right">{px(p.current, d.decimals)}</td>
                  <td className="td text-right"><Delta v={p.pnl} prefix="$" /><div className="num text-[10.5px] text-mute">{p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(1)}%</div></td>
                  <td className="td num text-right text-down/90">{p.sl ? px(p.sl, d.decimals) : <span className="text-warn/70">-</span>}</td>
                  <td className="td num text-right text-up/90">{p.tp ? px(p.tp, d.decimals) : '-'}</td>
                  <td className="td num text-right">{money(p.margin)}</td>
                  <td className="td num text-right">{p.leverage}x</td>
                  <td className="td num text-right text-mute">{px(liqPriceOf(p, diff.stopOut), d.decimals)}</td>
                  <td className="td"><div className="flex justify-end gap-1"><button className="btn-line !px-2 !py-0.5 text-[11.5px]" onClick={() => setEdit(p)}>Edit</button><button className="btn-line !px-2 !py-0.5 text-[11.5px] hover:!border-down hover:!text-down" onClick={() => game.close(p.id)}>Close</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!compact && positions.length > 1 ? <div className="flex justify-end p-2"><button className="btn-line text-[12px]" onClick={() => game.closeAll()}>Close all</button></div> : null}
      <EditModal p={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function EditModal({ p, onClose }: { p: PositionView | null; onClose: () => void }) {
  const [sl, setSl] = useState(''); const [tp, setTp] = useState(''); const [id, setId] = useState('');
  if (p && p.id !== id) { setId(p.id); setSl(p.sl ? String(p.sl) : ''); setTp(p.tp ? String(p.tp) : ''); }
  if (!p) return null;
  const d = CATALOG_MAP[p.assetId];
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  return (
    <Modal open={!!p} onClose={onClose} title={`Edit ${d.id} ${p.side}`} width="max-w-sm">
      <div className="flex flex-col gap-3">
        <div className="num text-[12px] text-mute">Entry {px(p.entry, d.decimals)} · Current {px(p.current, d.decimals)}</div>
        <label><span className="label">Stop loss</span><input className="input num mt-1" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="none" /></label>
        <label><span className="label">Take profit</span><input className="input num mt-1" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="none" /></label>
        <div className="flex gap-2"><button className="btn-line flex-1" onClick={onClose}>Cancel</button><button className="btn-brand flex-[2]" onClick={() => { const e = game.modify(p.id, num(sl), num(tp)); if (!e) onClose(); }}>Save</button></div>
      </div>
    </Modal>
  );
}

export function OrdersTable() {
  const orders = useGame((s) => s.snap!.player.orders);
  if (!orders.length) return <Empty>No pending orders. Limit and stop orders wait here until the price reaches them.</Empty>;
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead><tr className="border-b border-white/5"><th className="th">Asset</th><th className="th">Type</th><th className="th">Side</th><th className="th text-right">Size</th><th className="th text-right">Trigger</th><th className="th text-right">SL / TP</th><th className="th text-right">Lev</th><th className="th" /></tr></thead>
      <tbody>{orders.map((o) => { const d = CATALOG_MAP[o.assetId]; return (
        <tr key={o.id} className="border-b border-white/[.04]"><td className="td font-medium">{d.id}</td><td className="td">{o.type}</td><td className="td"><Chip tone={o.side === 'BUY' ? 'up' : 'down'}>{o.side}</Chip></td><td className="td num text-right">{o.size}</td><td className="td num text-right">{px(o.price, d.decimals)}</td><td className="td num text-right text-mute">{o.sl ? px(o.sl, d.decimals) : '-'} / {o.tp ? px(o.tp, d.decimals) : '-'}</td><td className="td num text-right">{o.leverage}x</td><td className="td text-right"><button className="btn-line !px-2 !py-0.5 text-[11.5px]" onClick={() => game.cancel(o.id)}>Cancel</button></td></tr>); })}</tbody></table></div>
  );
}

export function HistoryTable({ limit = 30 }: { limit?: number }) {
  const trades = useGame((s) => s.snap!.player.trades);
  if (!trades.length) return <Empty>Closed trades will be listed here.</Empty>;
  const list = trades.slice(-limit).reverse();
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left"><thead><tr className="border-b border-white/5"><th className="th">Closed</th><th className="th">Asset</th><th className="th">Side</th><th className="th text-right">Entry</th><th className="th text-right">Exit</th><th className="th text-right">P/L</th><th className="th text-right">Held</th><th className="th">Reason</th></tr></thead>
      <tbody>{list.map((t) => { const d = CATALOG_MAP[t.assetId]; return (
        <tr key={t.id} className="border-b border-white/[.04]"><td className="td num text-mute">{fmtGameTime(t.closeT)}</td><td className="td font-medium">{d.id}</td><td className="td"><Chip tone={t.side === 'LONG' ? 'up' : 'down'}>{t.side}</Chip></td><td className="td num text-right">{px(t.entry, d.decimals)}</td><td className="td num text-right">{px(t.exit, d.decimals)}</td><td className="td text-right"><Delta v={t.pnl} prefix="$" /></td><td className="td num text-right text-mute">{fmtDuration(t.closeT - t.openT)}</td><td className="td"><Chip tone={t.closeReason === 'LIQUIDATION' ? 'down' : t.closeReason === 'TP' ? 'up' : t.closeReason === 'SL' ? 'warn' : 'mute'}>{t.closeReason}</Chip></td></tr>); })}</tbody></table></div>
  );
}

export function BottomPanel() {
  const [tab, setTab] = useState<'pos' | 'ord' | 'hist'>('pos');
  const np = useGame((s) => s.snap!.positions.length);
  const no = useGame((s) => s.snap!.player.orders.length);
  const pnl = useGame((s) => s.snap!.account.unrealized);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-2 pt-2">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'pos', label: 'Positions', badge: np }, { id: 'ord', label: 'Orders', badge: no }, { id: 'hist', label: 'History' }]} />
        <div className="hidden pr-2 text-[12px] text-mute sm:block">Unrealised <Delta v={pnl} prefix="$" className="text-[13px] font-medium" /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{tab === 'pos' ? <PositionsTable /> : tab === 'ord' ? <OrdersTable /> : <HistoryTable />}</div>
    </div>
  );
}
