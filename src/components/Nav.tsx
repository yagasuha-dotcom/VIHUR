import { useState } from 'react';
import { useGame, type View } from '@/store/controller';
import { cn } from '@/utils/format';

export const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'markets', label: 'Markets', icon: '◈' },
  { id: 'portfolio', label: 'Portfolio', icon: '▤' },
  { id: 'news', label: 'News', icon: '≋' },
  { id: 'calendar', label: 'Calendar', icon: '◷' },
  { id: 'orders', label: 'Orders', icon: '⇄' },
  { id: 'journal', label: 'Journal', icon: '✎' },
  { id: 'missions', label: 'Missions', icon: '★' },
  { id: 'bank', label: 'Bank', icon: '⌂' },
  { id: 'analytics', label: 'Analytics', icon: '◔' },
  { id: 'fundamentals', label: 'Fundamentals', icon: '≡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar() {
  const view = useGame((s) => s.view);
  const badge = useGame((s) => s.snap?.player.loans.filter((l) => l.status === 'LATE' || l.status === 'DEFAULT').length ?? 0);
  return (
    <nav className="glass hidden w-[188px] shrink-0 flex-col gap-0.5 rounded-none border-y-0 border-l-0 p-2 md:flex">
      {NAV.map((n) => (
        <button key={n.id} onClick={() => useGame.setState({ view: n.id })} className={cn('group flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition', view === n.id ? 'bg-brand/15 text-snow shadow-[inset_2px_0_0_#7C8CFF]' : 'text-mute hover:bg-white/5 hover:text-soft')}>
          <span className={cn('w-4 text-center text-[14px]', view === n.id ? 'text-brand' : '')}>{n.icon}</span>
          <span>{n.label}</span>
          {n.id === 'bank' && badge > 0 ? <span className="ml-auto h-2 w-2 rounded-full bg-down" /> : null}
        </button>
      ))}
      <div className="mt-auto rounded-lg border border-white/5 p-2.5 text-[10.5px] leading-relaxed text-mute">All money, assets and companies here are <span className="text-soft">virtual</span>. No real trading.</div>
    </nav>
  );
}

export function BottomNav() {
  const view = useGame((s) => s.view);
  const [more, setMore] = useState(false);
  const main = NAV.filter((n) => ['markets', 'portfolio', 'news', 'bank'].includes(n.id));
  const rest = NAV.filter((n) => !['markets', 'portfolio', 'news', 'bank'].includes(n.id));
  return (
    <>
      {more ? (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMore(false)}>
          <div className="glass absolute bottom-16 left-2 right-2 grid grid-cols-4 gap-1 rounded-2xl p-2" onClick={(e) => e.stopPropagation()}>
            {rest.map((n) => (
              <button key={n.id} onClick={() => { useGame.setState({ view: n.id }); setMore(false); }} className={cn('flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11px]', view === n.id ? 'bg-brand/15 text-snow' : 'text-mute')}>
                <span className="text-[17px]">{n.icon}</span>{n.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <nav className="glass safe-bottom z-30 flex shrink-0 items-stretch justify-around rounded-none border-x-0 border-b-0 md:hidden">
        {main.map((n) => (
          <button key={n.id} onClick={() => useGame.setState({ view: n.id })} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px]', view === n.id ? 'text-brand' : 'text-mute')}>
            <span className="text-[17px] leading-none">{n.icon}</span>{n.label}
          </button>
        ))}
        <button onClick={() => setMore((m) => !m)} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px]', rest.some((r) => r.id === view) ? 'text-brand' : 'text-mute')}>
          <span className="text-[17px] leading-none">⋯</span>More
        </button>
      </nav>
    </>
  );
}
