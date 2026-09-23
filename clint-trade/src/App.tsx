import { useEffect, useState, type ReactNode } from 'react';
import { game, useGame, type View } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { REGIMES } from '@/engine/regimes';
import { dayLabel } from '@/engine/time';
import { Header } from '@/components/Header';
import { BottomNav, Sidebar } from '@/components/Nav';
import { NewsTicker } from '@/components/News';
import { Chip, Modal } from '@/components/ui';
import { canSideJob, loanOffers } from '@/features/banking/bank';
import { cn, money, pct } from '@/utils/format';
import { WelcomePage } from '@/pages/WelcomePage';
import { MarketsPage } from '@/pages/MarketsPage';
import { PortfolioPage } from '@/pages/PortfolioPage';
import { NewsPage } from '@/pages/NewsPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { JournalPage } from '@/pages/JournalPage';
import { MissionsPage } from '@/pages/MissionsPage';
import { BankPage } from '@/pages/BankPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { FundamentalsPage } from '@/pages/FundamentalsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TutorialModal } from '@/pages/TutorialModal';
import { DebugPanel } from '@/pages/DebugPanel';

const PAGES: Record<View, () => JSX.Element> = {
  markets: MarketsPage, portfolio: PortfolioPage, news: NewsPage, calendar: CalendarPage, orders: OrdersPage, journal: JournalPage,
  missions: MissionsPage, bank: BankPage, analytics: AnalyticsPage, fundamentals: FundamentalsPage, settings: SettingsPage,
};

const TONE: Record<string, string> = {
  info: 'border-brand/40', good: 'border-up/50', bad: 'border-down/50', warn: 'border-warn/50', news: 'border-brand2/50', margin: 'border-down bg-down/10 animate-shake',
  life: 'border-warn/40', levelup: 'border-brand/60', mission: 'border-up/50', achievement: 'border-warn/60', report: 'border-brand/30',
};
const ICON: Record<string, string> = { info: 'ℹ', good: '▲', bad: '▼', warn: '⚠', news: '≋', margin: '⛔', life: '☕', levelup: '⬆', mission: '★', achievement: '🏆', report: '▤' };

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-3 top-16 z-[70] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={cn('glass pointer-events-auto animate-slideIn rounded-xl border px-3.5 py-2.5', TONE[t.kind] ?? 'border-white/10')}>
          <div className="flex items-start gap-2.5"><span className="mt-0.5 text-[13px]">{ICON[t.kind]}</span><div className="min-w-0"><div className="text-[13px] font-semibold leading-snug">{t.title}</div><div className="text-[12px] leading-snug text-soft">{t.msg}</div></div></div>
        </div>
      ))}
    </div>
  );
}

function Notifications({ open, onClose }: { open: boolean; onClose: () => void }) {
  const list = useGame((s) => s.snap!.player.notifications);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[65]" onClick={onClose}>
      <div className="glass absolute right-2 top-14 flex max-h-[75vh] w-[min(380px,calc(100vw-16px))] flex-col rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3"><h3 className="text-[14px] font-semibold">Notifications</h3><button className="btn-ghost !py-0.5 text-[12px] text-mute" onClick={() => game.markRead()}>Mark all read</button></div>
        <div className="overflow-y-auto p-2">
          {list.length === 0 ? <div className="py-8 text-center text-[12.5px] text-mute">Nothing yet.</div> : list.slice(0, 40).map((n) => (
            <div key={n.id} className={cn('mb-1.5 rounded-xl border px-3 py-2', n.read ? 'border-white/5 opacity-70' : 'border-white/10 bg-white/[.03]')}>
              <div className="flex items-start gap-2"><span className="text-[12px]">{ICON[n.kind]}</span><div className="min-w-0 flex-1"><div className="text-[12.5px] font-semibold">{n.title}</div><div className="text-[11.5px] text-soft">{n.msg}</div>
                {n.actions?.length ? <div className="mt-1.5 flex gap-1.5">{n.actions.map((a) => <button key={a.label} className={a.action === 'dismiss' ? 'btn-line !py-0.5 text-[11.5px]' : 'btn-brand !py-0.5 text-[11.5px]'} onClick={() => game.notifAction(n.id, a.action)}>{a.label}</button>)}</div> : null}</div></div>
            </div>))}
        </div>
      </div>
    </div>
  );
}

function ReportModal() {
  const rep = useGame((s) => s.report);
  if (!rep) return null;
  const close = () => useGame.setState({ report: null });
  const row = (l: string, v: ReactNode) => <div className="flex justify-between border-b border-white/5 py-2 text-[13px] last:border-0"><span className="text-mute">{l}</span><span className="num text-right">{v}</span></div>;
  return (
    <Modal open onClose={close} title={<span>DAILY MARKET REPORT <span className="ml-1 text-[12px] font-normal text-mute">{dayLabel(rep.day)}</span></span>} width="max-w-md">
      {row('Global sentiment', rep.sentiment)}
      {row('Top gainer', <span className="text-up">{rep.topGainer.id ? `${CATALOG_MAP[rep.topGainer.id]?.symbol} ${pct(rep.topGainer.pct, 1)}` : '-'}</span>)}
      {row('Top loser', <span className="text-down">{rep.topLoser.id ? `${CATALOG_MAP[rep.topLoser.id]?.symbol} ${pct(rep.topLoser.pct, 1)}` : '-'}</span>)}
      {row('Market regime', <Chip tone="brand">{REGIMES[rep.regime].label}</Chip>)}
      {row('Economic events', rep.events)}
      <div className="py-2 text-[13px]"><div className="mb-1 text-mute">Major news</div><div>{rep.majorNews}</div></div>
      {rep.notes.map((n, i) => <div key={i} className="mt-1 rounded-lg bg-warn/10 px-3 py-2 text-[12px] text-warn">{n}</div>)}
      <button className="btn-brand mt-4 w-full" onClick={close}>Continue</button>
    </Modal>
  );
}

function BrokeModal() {
  const open = useGame((s) => s.brokeOpen);
  const snap = useGame((s) => s.snap)!;
  if (!open) return null;
  const close = () => useGame.setState({ brokeOpen: false });
  const p = snap.player;
  const offers = loanOffers(p, game.world).filter((o) => o.allowed);
  return (
    <Modal open onClose={close} title="ACCOUNT DEPLETED" width="max-w-md">
      <p className="mb-3 text-[13px] leading-relaxed text-soft">Your trading capital is gone. Every trader hits a wall sometimes. You have options, and none of them is "double down".</p>
      <div className="flex flex-col gap-2">
        <button className="btn-line justify-between !py-2.5" disabled={!canSideJob(p, game.world)} onClick={() => { game.sideJob(); close(); }}><span>Take a side job</span><span className="text-mute">$110-$260, no risk</span></button>
        <button className="btn-line justify-between !py-2.5" onClick={() => { game.dailyReward(); close(); }}><span>Claim daily reward</span><span className="text-mute">small bonus</span></button>
        {offers[0] ? <button className="btn-line justify-between !py-2.5" onClick={() => { game.takeLoan(offers[0].tier.id); close(); }}><span>Emergency bank loan {money(offers[0].tier.amount, 0)}</span><span className="text-warn">{(offers[0].rate * 100).toFixed(0)}% / {offers[0].tier.days}d</span></button> : null}
        <button className="btn-line justify-between !py-2.5 hover:!border-down hover:!text-down" onClick={() => { game.bankrupt(); }}><span>Declare bankruptcy</span><span className="text-mute">restart with $1,500</span></button>
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-mute">A loan buys time, not skill. If you borrow, use small size and a stop loss. Interest and late penalties compound the damage of a second loss.</p>
      <button className="btn-ghost mt-2 w-full text-mute" onClick={close}>Dismiss</button>
    </Modal>
  );
}

export default function App() {
  const phase = useGame((s) => s.phase);
  const view = useGame((s) => s.view);
  const unread = useGame((s) => s.snap?.player.notifications.filter((n) => !n.read).length ?? 0);
  const [bell, setBell] = useState(false);

  useEffect(() => { void game.init(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); if (useGame.getState().phase === 'playing') useGame.setState({ debug: !useGame.getState().debug }); }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === ' ' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && useGame.getState().phase === 'playing') { e.preventDefault(); game.toggle(); }
    };
    const onHide = () => { if (document.hidden && useGame.getState().phase === 'playing') { game.pause(); } };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    const onUnload = () => { if (useGame.getState().phase === 'playing') void game.save(); };
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', onUnload); };
  }, []);

  if (phase !== 'playing') return <WelcomePage />;
  const Page = PAGES[view];
  return (
    <div className="flex h-full flex-col">
      <Header onBell={() => setBell((b) => !b)} unread={unread} />
      <NewsTicker />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{view === 'markets' ? <div className="h-full"><Page /></div> : <Page />}</main>
      </div>
      <BottomNav />
      <Toasts />
      <Notifications open={bell} onClose={() => setBell(false)} />
      <ReportModal />
      <BrokeModal />
      <TutorialModal />
      <DebugPanel />
    </div>
  );
}
