import { useMemo, useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG, CATALOG_MAP } from '@/engine/catalog';
import { REGIMES } from '@/engine/regimes';
import { dayLabel } from '@/engine/time';
import type { NewsCategory, NewsItem } from '@/types';
import { NewsCard } from '@/components/News';
import { Chip, Empty, Panel, Tabs } from '@/components/ui';
import { pct } from '@/utils/format';

const CATS: NewsCategory[] = ['ECONOMY', 'INFLATION', 'INTEREST RATE', 'EMPLOYMENT', 'GDP', 'CENTRAL BANK', 'COMPANY', 'CRYPTO', 'REGULATION', 'GEOPOLITICS', 'ENERGY', 'BANKING', 'TECHNOLOGY', 'CONSUMER', 'GLOBAL MARKET'];

export function NewsPage() {
  const [tab, setTab] = useState<'live' | 'archive' | 'history'>('live');
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-3 md:p-5">
      <Tabs value={tab} onChange={setTab} items={[{ id: 'live', label: 'Live feed' }, { id: 'archive', label: 'Archive & search' }, { id: 'history', label: 'Market history' }]} />
      {tab === 'live' ? <Live /> : tab === 'archive' ? <Archive /> : <History />}
    </div>
  );
}

function Live() {
  const news = useGame((s) => s.snap!.news);
  const list = news.slice(-40).reverse();
  return <div className="flex flex-col gap-2.5">{list.map((n) => <NewsCard key={n.id} n={n} />)}</div>;
}

function Archive() {
  useGame((s) => Math.floor((s.snap?.version ?? 0) / 20));
  const [q, setQ] = useState(''); const [cat, setCat] = useState<string>(''); const [asset, setAsset] = useState(''); const [minSev, setMinSev] = useState(1); const [day, setDay] = useState('');
  const all = game.world.s.news;
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out: NewsItem[] = [];
    for (let i = all.length - 1; i >= 0 && out.length < 60; i--) {
      const n = all[i];
      if (n.severity < minSev) continue;
      if (cat && n.category !== cat) continue;
      if (asset && !n.affected.some((a) => a.assetId === asset)) continue;
      if (day && n.day + 1 !== Number(day)) continue;
      if (term && !(n.headline.toLowerCase().includes(term) || n.body.toLowerCase().includes(term))) continue;
      out.push(n);
    }
    return out;
  }, [q, cat, asset, minSev, day, all.length]);
  return (
    <>
      <Panel><div className="grid gap-2 sm:grid-cols-5">
        <input className="input sm:col-span-2" placeholder="Search headlines" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="input" value={asset} onChange={(e) => setAsset(e.target.value)}><option value="">All assets</option>{CATALOG.map((d) => <option key={d.id} value={d.id}>{d.id}</option>)}</select>
        <div className="flex gap-2"><input className="input num" placeholder="Day #" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} /><select className="input !w-24" value={minSev} onChange={(e) => setMinSev(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>Sev {s}+</option>)}</select></div>
      </div></Panel>
      {list.length ? <div className="flex flex-col gap-2.5">{list.map((n) => <NewsCard key={n.id} n={n} />)}</div> : <Empty>No news matches these filters.</Empty>}
    </>
  );
}

function History() {
  const [sel, setSel] = useState<number | null>(null);
  const reports = game.world.s.reports;
  const days = reports.slice(-40).reverse();
  const cur = sel ?? (days[0]?.day ?? 0);
  const rep = reports.find((r) => r.day === cur);
  const big = game.world.s.news.filter((n) => n.day === cur && n.severity >= 3).sort((a, b) => b.severity - a.severity).slice(0, 12);
  if (!days.length) return <Empty>History fills in after your first full game day.</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-[180px_1fr]">
      <div className="flex max-h-[70vh] gap-1 overflow-auto md:flex-col">{days.map((r) => <button key={r.day} onClick={() => setSel(r.day)} className={`shrink-0 rounded-lg px-3 py-2 text-left text-[12.5px] ${cur === r.day ? 'bg-brand/20 text-snow' : 'text-mute hover:bg-white/5'}`}><div className="font-medium">{dayLabel(r.day)}</div><div className="text-[10.5px]">{r.sentiment}</div></button>)}</div>
      <div className="flex flex-col gap-3">
        {rep ? (
          <Panel title={`Daily market report · ${dayLabel(rep.day)}`}>
            <div className="grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-3">
              <div><div className="label">Global sentiment</div><div>{rep.sentiment}</div></div>
              <div><div className="label">Market regime</div><div><Chip tone="brand">{REGIMES[rep.regime].label}</Chip></div></div>
              <div><div className="label">Economic events</div><div className="num">{rep.events}</div></div>
              <div><div className="label">Top gainer</div><div className="num text-up">{rep.topGainer.id ? `${CATALOG_MAP[rep.topGainer.id]?.symbol} ${pct(rep.topGainer.pct, 1)}` : '-'}</div></div>
              <div><div className="label">Top loser</div><div className="num text-down">{rep.topLoser.id ? `${CATALOG_MAP[rep.topLoser.id]?.symbol} ${pct(rep.topLoser.pct, 1)}` : '-'}</div></div>
              <div className="col-span-2 sm:col-span-3"><div className="label">Major news</div><div>{rep.majorNews}</div></div>
            </div>
          </Panel>
        ) : null}
        <div className="text-[12px] text-mute">Notable events on {dayLabel(cur)} (with measured market reactions)</div>
        {big.length ? big.map((n) => <NewsCard key={n.id} n={n} />) : <Empty>Nothing major that day.</Empty>}
      </div>
    </div>
  );
}
