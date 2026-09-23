import { useEffect, useMemo, useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { leverageOptions, notionalUSD, roundPrice } from '@/features/trading/engine';
import type { OrderRequest } from '@/features/types';
import { cn, money, px } from '@/utils/format';
import { Chip, Modal } from './ui';

type OType = 'MARKET' | 'LIMIT' | 'STOP';

export function OrderPanel({ compact = false }: { compact?: boolean }) {
  const selected = useGame((s) => s.selected);
  const side = useGame((s) => s.orderSide);
  const snap = useGame((s) => s.snap)!;
  const def = CATALOG_MAP[selected];
  const q = snap.prices[selected];
  const p = snap.player;
  const acc = snap.account;
  const [otype, setOtype] = useState<OType>('MARKET');
  const [size, setSize] = useState('');
  const [lev, setLev] = useState(1);
  const [trig, setTrig] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const levs = leverageOptions(def, p);

  useEffect(() => { setSize(''); setTrig(''); setSl(''); setTp(''); setLev((l) => (levs.includes(l) ? l : Math.min(...levs))); }, [selected]);

  const isBuy = side === 'BUY';
  const entry = otype === 'MARKET' ? (q ? (isBuy ? q.ask : q.bid) : 0) : Number(trig) || 0;
  const num = (v: string) => (v.trim() === '' || isNaN(Number(v)) ? undefined : Number(v));
  const req: OrderRequest = { assetId: selected, side, type: otype, size: Number(size) || 0, leverage: lev, price: otype === 'MARKET' ? undefined : num(trig), sl: num(sl), tp: num(tp), reason };
  const pv = useMemo(() => (game.world ? game.preview(req) : null), [snap.version, selected, side, otype, size, lev, trig, sl, tp]);

  const setPct = (pc: number) => {
    if (!entry) return;
    const notionalPerUnit = notionalUSD(def, 1, entry);
    let s = (Math.max(0, acc.freeMargin) * pc * lev) / notionalPerUnit;
    s = Math.floor(s / def.sizeStep) * def.sizeStep;
    setSize(s > 0 ? String(Number(s.toFixed(6))) : '');
  };
  const setStopPct = (kind: 'sl' | 'tp', pc: number) => {
    if (!entry) return;
    const dir = isBuy ? 1 : -1;
    const v = kind === 'sl' ? entry * (1 - dir * pc / 100) : entry * (1 + dir * pc / 100);
    (kind === 'sl' ? setSl : setTp)(String(roundPrice(def, v)));
  };
  const sizeLabel = def.cls === 'forex' ? 'Lots' : def.unit === 'shares' ? 'Shares' : def.unit;
  const tradable = q && q.status === 'ACTIVE';

  const doSubmit = () => {
    const r = game.submit(req);
    if (r.ok) { setConfirm(false); setSize(''); setSl(''); setTp(''); setTrig(''); setReason(''); if (compact) useGame.setState({ sheet: false }); }
    else game.notify({ kind: 'warn', title: 'Order rejected', msg: r.error ?? 'Unknown error' });
  };
  const onSubmit = () => { if (!pv?.ok) return; if (p.settings.confirmOrders) setConfirm(true); else doSubmit(); };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => useGame.setState({ orderSide: 'SELL' })} className={cn('rounded-xl border p-2.5 text-left transition', side === 'SELL' ? 'border-down bg-down/15' : 'border-edge bg-abyss/40 hover:border-down/40')}>
          <div className="text-[11px] font-semibold text-down">SELL / SHORT</div>
          <div className="num text-[16px] font-medium">{q ? px(q.bid, def.decimals) : '-'}</div>
        </button>
        <button onClick={() => useGame.setState({ orderSide: 'BUY' })} className={cn('rounded-xl border p-2.5 text-left transition', side === 'BUY' ? 'border-up bg-up/15' : 'border-edge bg-abyss/40 hover:border-up/40')}>
          <div className="text-[11px] font-semibold text-up">BUY / LONG</div>
          <div className="num text-[16px] font-medium">{q ? px(q.ask, def.decimals) : '-'}</div>
        </button>
      </div>
      <div className="flex items-center justify-between text-[11.5px] text-mute">
        <span>Spread <span className="num text-soft">{q ? (q.spread * 100).toFixed(3) : '-'}%</span></span>
        {q && !q.open ? <Chip tone="warn">Market closed</Chip> : <Chip tone="mute">{def.cls === 'forex' ? `1 lot = ${(def.lotSize ?? 0).toLocaleString()}` : `Min ${def.minSize} ${def.unit}`}</Chip>}
      </div>

      <div className="flex gap-1 rounded-lg bg-abyss/50 p-0.5">
        {(['MARKET', 'LIMIT', 'STOP'] as OType[]).map((t) => <button key={t} onClick={() => setOtype(t)} className={cn('flex-1 rounded-md py-1 text-[12px] font-medium', otype === t ? 'bg-brand/20 text-snow' : 'text-mute')}>{t[0] + t.slice(1).toLowerCase()}</button>)}
      </div>
      {otype !== 'MARKET' ? (
        <label className="block"><span className="label">{otype === 'LIMIT' ? 'Limit price' : 'Stop trigger price'}</span>
          <input className="input num mt-1" inputMode="decimal" value={trig} onChange={(e) => setTrig(e.target.value)} placeholder={q ? px(q.price, def.decimals) : ''} />
          <span className="mt-1 block text-[10.5px] text-mute">{otype === 'LIMIT' ? (isBuy ? 'Buys when price falls to this level.' : 'Sells when price rises to this level.') : (isBuy ? 'Buys when price breaks above this level.' : 'Sells when price breaks below this level.')}</span>
        </label>
      ) : null}

      <label className="block"><span className="label">Size ({sizeLabel})</span>
        <input className="input num mt-1" inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} placeholder={`min ${def.minSize}`} />
      </label>
      <div className="flex gap-1">{[0.1, 0.25, 0.5, 1].map((x) => <button key={x} onClick={() => setPct(x)} className="btn-line flex-1 !py-1 text-[11.5px]">{x === 1 ? 'Max' : `${x * 100}%`}</button>)}</div>

      <div>
        <div className="mb-1 flex items-center justify-between"><span className="label">Leverage</span>{lev >= 20 ? <Chip tone="down">Very high risk</Chip> : lev >= 10 ? <Chip tone="warn">High risk</Chip> : null}</div>
        <div className="flex gap-1">{levs.map((l) => <button key={l} onClick={() => setLev(l)} className={cn('num flex-1 rounded-md border py-1 text-[12px]', lev === l ? (l >= 20 ? 'border-down bg-down/15 text-down' : l >= 10 ? 'border-warn bg-warn/15 text-warn' : 'border-brand bg-brand/15 text-snow') : 'border-edge text-mute hover:text-soft')}>{l}x</button>)}</div>
        {def.maxLeverage > 20 && p.reputation < 40 ? <div className="mt-1 text-[10.5px] text-mute">50x unlocks at reputation 40.</div> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="label">Stop loss</span><input className="input num mt-1" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="optional" />
          <div className="mt-1 flex gap-1">{[0.5, 1, 2].map((x) => <button key={x} onClick={() => setStopPct('sl', x)} className="chip bg-down/10 text-down hover:bg-down/20">{x}%</button>)}</div></label>
        <label className="block"><span className="label">Take profit</span><input className="input num mt-1" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="optional" />
          <div className="mt-1 flex gap-1">{[1, 2, 4].map((x) => <button key={x} onClick={() => setStopPct('tp', x)} className="chip bg-up/10 text-up hover:bg-up/20">{x}%</button>)}</div></label>
      </div>
      <label className="block"><span className="label">Reason (saved to your journal)</span><input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. bought because of breakout" /></label>

      {pv ? (
        <div className="rounded-xl border border-white/5 bg-abyss/40 p-2.5 text-[12px]">
          <Row k="Entry" v={pv.price ? px(pv.price, def.decimals) : '-'} />
          <Row k="Notional" v={money(pv.notional)} />
          <Row k="Margin" v={money(pv.margin)} />
          <Row k="Fee" v={money(pv.fee)} />
          <Row k="Risk to stop" v={pv.riskPct !== null ? `${money(pv.riskUSD ?? 0)} (${pv.riskPct.toFixed(2)}%)` : 'undefined'} tone={pv.riskPct === null ? 'warn' : pv.riskPct > 3 ? 'down' : undefined} />
          <Row k="Est. liquidation" v={pv.liqPrice ? px(pv.liqPrice, def.decimals) : '-'} tone="down" />
        </div>
      ) : null}
      {pv && !pv.ok && size ? <div className="rounded-lg bg-down/10 px-2.5 py-2 text-[12px] text-down">{pv.error}</div> : null}
      {pv?.ok ? pv.warnings.map((w) => <div key={w.code} className={cn('rounded-lg px-2.5 py-2 text-[11.5px]', w.severity === 'danger' ? 'bg-down/10 text-down' : 'bg-warn/10 text-warn')}><b className="font-semibold">{w.title}.</b> <span className="opacity-90">{w.msg}</span></div>) : null}

      <button disabled={!tradable || !pv?.ok} onClick={onSubmit} className={cn('rounded-xl py-3 text-[14px] font-bold transition disabled:opacity-40', isBuy ? 'bg-up text-abyss hover:brightness-110' : 'bg-down text-white hover:brightness-110')}>
        {otype === 'MARKET' ? (isBuy ? 'BUY' : 'SELL') : `PLACE ${otype} ${isBuy ? 'BUY' : 'SELL'}`} {def.symbol}
      </button>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={<span className={isBuy ? 'text-up' : 'text-down'}>{isBuy ? 'BUY' : 'SELL'} {def.id}</span>} width="max-w-sm">
        {pv?.ok ? (
          <div className="flex flex-col gap-2.5">
            <div className="rounded-xl bg-abyss/50 p-3 text-[13px]">
              <Row k="Price" v={px(pv.price, def.decimals)} /><Row k="Size" v={`${req.size} ${def.unit}`} /><Row k="Margin" v={money(pv.margin)} />
              <Row k="SL" v={req.sl ? px(req.sl, def.decimals) : 'none'} tone={req.sl ? undefined : 'warn'} /><Row k="TP" v={req.tp ? px(req.tp, def.decimals) : 'none'} />
              <Row k="Risk" v={pv.riskPct !== null ? `${pv.riskPct.toFixed(2)}%` : 'undefined'} /><Row k="Leverage" v={`${lev}x`} />
              {pv.slippagePct > 0.001 ? <Row k="Est. slippage" v={`${pv.slippagePct.toFixed(3)}%`} /> : null}
            </div>
            {pv.warnings.filter((w) => w.severity !== 'info').slice(0, 3).map((w) => <div key={w.code} className={cn('rounded-lg px-2.5 py-1.5 text-[11.5px]', w.severity === 'danger' ? 'bg-down/10 text-down' : 'bg-warn/10 text-warn')}><b>{w.title}.</b> {w.msg}</div>)}
            <div className="flex gap-2"><button className="btn-line flex-1" onClick={() => setConfirm(false)}>Cancel</button><button className={cn('flex-[2] rounded-lg py-2 text-[13.5px] font-bold', isBuy ? 'bg-up text-abyss' : 'bg-down text-white')} onClick={doSubmit}>CONFIRM {isBuy ? 'BUY' : 'SELL'}</button></div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'warn' | 'down' }) {
  return <div className="flex justify-between py-0.5"><span className="text-mute">{k}</span><span className={cn('num', tone === 'warn' ? 'text-warn' : tone === 'down' ? 'text-down' : 'text-snow')}>{v}</span></div>;
}
