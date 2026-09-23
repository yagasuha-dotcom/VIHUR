import { useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { NEWS_TEMPLATES } from '@/engine/newsTemplates';
import { WORLD_EVENTS } from '@/engine/eventEngine';
import { REGIMES } from '@/engine/regimes';
import { seedLabel } from '@/engine/rng';
import type { RegimeId } from '@/types';
import { Modal } from '@/components/ui';

export function DebugPanel() {
  const open = useGame((s) => s.debug);
  const selected = useGame((s) => s.selected);
  useGame((s) => s.snap?.version);
  const [tpl, setTpl] = useState(NEWS_TEMPLATES[0].id);
  const [ev, setEv] = useState(WORLD_EVENTS[0].id);
  if (!open) return null;
  const w = game.world;
  const a = w.asset(selected);
  const def = CATALOG_MAP[selected];
  const m = w.s.market;
  const F = Object.values(m.factors).map((f) => `${f.id}: lvl ${(f.level * 100).toFixed(2)}% ret ${(f.ret * 1e4).toFixed(2)}bp`).join('\n');
  return (
    <Modal open onClose={() => useGame.setState({ debug: false })} title="Developer panel (Ctrl+Shift+D)" width="max-w-3xl">
      <div className="grid gap-4 text-[12px] md:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-lg bg-abyss/60 p-3 num leading-relaxed">
            <div>Seed <b className="text-brand2">{seedLabel(w.s.seed)}</b> · RNG state {w.rng.s} · {w.s.difficulty}</div>
            <div>Regimes: {Object.entries(m.regimes).map(([g, r]) => `${g}=${r.current}(${r.remaining.toFixed(1)}d)`).join(' ')}</div>
            <div>Eco: sentiment {w.s.eco.sentiment.toFixed(2)} · USD rate {w.s.eco.rates.USD} · infl {w.s.eco.inflation.USD.toFixed(1)} · growth {w.s.eco.growth.USD.toFixed(1)} · bubble {w.s.eco.bubble ? `${w.s.eco.bubble.group} ${w.s.eco.bubble.size.toFixed(2)}` : 'none'}</div>
            <div>Active events: {w.s.activeEvents.slice(-4).map((e) => e.name).join(', ') || 'none'}</div>
            <div>Delayed shocks queued: {m.delayed.length} · news {w.s.news.length}</div>
          </div>
          <div className="rounded-lg bg-abyss/60 p-3 num leading-relaxed"><div className="mb-1 font-semibold text-soft">{def.id} price engine</div>
            {Object.entries({ price: a.price, fair: a.fair, trend: a.trend, momentum: a.momentum, sentiment: a.sentiment, supplyDemand: a.supplyDemand, volBoost: a.volBoost, spreadBoost: a.spreadBoost, spread: a.spread, liquidity: a.liquidityNow, idioVol: a.idioVol, bubble: a.bubble, hiddenAcc: a.acc, impulses: a.impulses.length }).map(([k, v]) => <div key={k}>{k.padEnd(13)} {typeof v === 'number' ? v.toPrecision(5) : String(v)}</div>)}</div>
          <pre className="max-h-40 overflow-auto rounded-lg bg-abyss/60 p-3 num text-[10.5px] leading-snug text-mute">{F}</pre>
        </div>
        <div className="space-y-3">
          <div><div className="label mb-1">Force news</div><div className="flex gap-1.5"><select className="input" value={tpl} onChange={(e) => setTpl(e.target.value)}>{NEWS_TEMPLATES.map((t) => <option key={t.id}>{t.id}</option>)}</select><button className="btn-line" onClick={() => game.debug.news(tpl, 4, 1)}>+</button><button className="btn-line" onClick={() => game.debug.news(tpl, 4, -1)}>-</button></div></div>
          <div><div className="label mb-1">Force world event</div><div className="flex gap-1.5"><select className="input" value={ev} onChange={(e) => setEv(e.target.value)}>{WORLD_EVENTS.map((t) => <option key={t.id}>{t.id}</option>)}</select><button className="btn-line" onClick={() => game.debug.event(ev)}>Fire</button></div></div>
          <div className="flex flex-wrap gap-1.5"><button className="btn-line !border-down/50 text-down" onClick={() => game.debug.crash()}>Force crash</button><button className="btn-line" onClick={() => game.debug.regime('BULL')}>Force bull</button><button className="btn-line" onClick={() => game.debug.regime('BEAR')}>Force bear</button></div>
          <div><div className="label mb-1">Force regime</div><div className="flex flex-wrap gap-1">{(Object.keys(REGIMES) as RegimeId[]).map((r) => <button key={r} className="chip bg-white/5 text-mute hover:text-snow" onClick={() => game.debug.regime(r)}>{r}</button>)}</div></div>
          <div><div className="label mb-1">Advance time</div><div className="flex gap-1.5">{[['+1h', 3600], ['+6h', 21600], ['+1d', 86400], ['+7d', 604800]].map(([l, s]) => <button key={l as string} className="btn-line" onClick={() => game.debug.advance(s as number)}>{l}</button>)}</div></div>
          <div><div className="label mb-1">Give money</div><div className="flex gap-1.5">{[1000, 10000, 100000].map((n) => <button key={n} className="btn-line" onClick={() => game.debug.money(n)}>+${n.toLocaleString()}</button>)}</div></div>
          <p className="text-[11px] text-mute">For development only. Using these tools can break the intended balance of a career.</p>
        </div>
      </div>
    </Modal>
  );
}
