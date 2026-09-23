import { useMemo } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { fmtGameTime } from '@/engine/time';
import type { NewsItem } from '@/types';
import { cn, pct } from '@/utils/format';
import { Chip } from './ui';

const REL_TONE = { OFFICIAL: 'cyan', CONFIRMED: 'up', BREAKING: 'down', RUMOR: 'warn', SPECULATION: 'mute' } as const;
const SEV_LABEL = ['', 'LOW', 'LOW', 'MEDIUM', 'HIGH', 'EXTREME'];

export function impactWord(e: number): string { const a = Math.abs(e); return a >= 5 ? 'Strong' : a >= 1.5 ? 'Medium' : 'Mild'; }

export function NewsCard({ n, compact = false, showAssets = true }: { n: NewsItem; compact?: boolean; showAssets?: boolean }) {
  const shown = compact ? n.affected.slice(0, 3) : n.affected.slice(0, 6);
  return (
    <article className={cn('rounded-xl border p-3 transition', n.breaking ? 'border-down/35 bg-down/[.06]' : 'border-white/5 bg-abyss/40')}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {n.breaking ? <Chip tone="down"><span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-down" />BREAKING</Chip> : null}
        <Chip tone={REL_TONE[n.reliability]}>{n.reliability}</Chip>
        <Chip tone="mute">{n.category}</Chip>
        <Chip tone={n.severity >= 4 ? 'warn' : 'mute'}>{SEV_LABEL[n.severity]}</Chip>
        <span className="num ml-auto text-[10.5px] text-mute">{fmtGameTime(n.t)}</span>
      </div>
      <h4 className="text-[13.5px] font-semibold leading-snug">{n.headline}</h4>
      {!compact && n.body ? <p className="mt-1 text-[12px] leading-relaxed text-mute">{n.body}</p> : null}
      {n.reversed ? <p className="mt-1 text-[11px] text-warn">Positioning was crowded: the market leaned against the headline.</p> : null}
      {showAssets && shown.length ? (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {shown.map((a) => {
            const d = CATALOG_MAP[a.assetId];
            return (
              <div key={a.assetId} className="flex items-center justify-between rounded-md bg-white/[.03] px-2 py-1 text-[11.5px]">
                <span className="truncate text-soft">{d?.symbol ?? a.assetId}</span>
                <span className="num flex items-center gap-2">
                  <span className={a.expected >= 0 ? 'text-up/80' : 'text-down/80'} title="Expected impact">{impactWord(a.expected)} {a.expected >= 0 ? '↑' : '↓'}</span>
                  {a.actual !== undefined ? <span className={cn('font-medium', a.actual >= 0 ? 'text-up' : 'text-down')} title="Actual move">{pct(a.actual, 2)}</span> : <span className="text-mute/60">...</span>}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

export function NewsTicker() {
  const news = useGame((s) => s.snap!.news);
  const items = useMemo(() => news.slice(-14).reverse(), [news.length, news[news.length - 1]?.id]);
  if (!items.length) return null;
  const row = items.map((n) => (
    <button key={n.id} onClick={() => useGame.setState({ view: 'news' })} className="mx-5 inline-flex items-center gap-2 whitespace-nowrap text-[12px] text-soft hover:text-snow">
      <span className={cn('h-1.5 w-1.5 rounded-full', n.breaking ? 'bg-down' : n.sentiment > 0.05 ? 'bg-up' : n.sentiment < -0.05 ? 'bg-warn' : 'bg-mute')} />
      {n.breaking ? <b className="text-down">BREAKING</b> : null}{n.headline}
    </button>
  ));
  return (
    <div className="glass-flat relative shrink-0 overflow-hidden border-x-0 py-1.5">
      <div className="tick-scroll flex w-max">{row}{row}</div>
    </div>
  );
}

export function AssetNews({ assetId }: { assetId: string }) {
  useGame((s) => s.snap!.news.length);
  const list = game.world.s.news.filter((n) => n.affected.some((a) => a.assetId === assetId)).slice(-8).reverse();
  if (!list.length) return <div className="py-6 text-center text-[12px] text-mute">No recent headlines mention this asset.</div>;
  return <div className="flex flex-col gap-2">{list.map((n) => <NewsCard key={n.id} n={n} compact />)}</div>;
}
