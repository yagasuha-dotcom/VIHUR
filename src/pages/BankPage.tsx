import { useState } from 'react';
import { game, useGame } from '@/store/controller';
import { LOAN_TIERS, activeDebt, canDailyReward, canSideJob, creditLabel, loanOffers } from '@/features/banking/bank';
import { dayIndexOf } from '@/engine/time';
import { Chip, Empty, Meter, Panel } from '@/components/ui';
import { cn, money } from '@/utils/format';

export function BankPage() {
  const snap = useGame((s) => s.snap)!;
  const p = snap.player;
  const w = game.world;
  const offers = loanOffers(p, w);
  const debt = activeDebt(p);
  const acc = snap.account;
  const [pay, setPay] = useState<Record<string, string>>({});
  const active = p.loans.filter((l) => l.status !== 'PAID');
  const paid = p.loans.filter((l) => l.status === 'PAID').slice(-5).reverse();
  const day = dayIndexOf(snap.t);
  const spiral = debt > Math.max(1, acc.netWorth) * 0.8 && debt > 0;
  const pct = ((p.credit - 300) / 550) * 100;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-3 md:p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Credit score" className="md:col-span-1">
          <div className="flex items-baseline gap-2"><span className="num text-[38px] font-semibold leading-none">{p.credit.toFixed(0)}</span><Chip tone={p.credit >= 670 ? 'up' : p.credit >= 580 ? 'warn' : 'down'}>{creditLabel(p.credit)}</Chip></div>
          <div className="relative mt-3 h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#FF5C74,#F4B740 45%,#2ED3A0)' }}><div className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded bg-white" style={{ left: `calc(${pct}% - 3px)` }} /></div>
          <div className="mt-1 flex justify-between text-[10.5px] text-mute"><span>300</span><span>850</span></div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-mute">Higher credit means cheaper loans. On-time repayment raises it. Late payment, default and bankruptcy lower it. Trading history matters too.</p>
        </Panel>
        <Panel title="Your debt" className="md:col-span-2">
          <div className="grid grid-cols-3 gap-3"><div><div className="label">Total debt</div><div className={cn('num text-[22px]', debt > 0 ? 'text-down' : 'text-up')}>{money(debt)}</div></div><div><div className="label">Net worth</div><div className="num text-[22px]">{money(acc.netWorth)}</div></div><div><div className="label">Free cash</div><div className="num text-[22px]">{money(Math.max(0, acc.cash))}</div></div></div>
          {spiral ? <div className="mt-3 rounded-lg bg-down/10 px-3 py-2 text-[12px] text-down"><b>Debt spiral warning.</b> Your debt is close to your net worth. Borrowing to trade after losses is how accounts die. Use the recovery tools below.</div> : null}
          <div className="mt-3"><Meter value={Math.min(100, (debt / Math.max(1, acc.netWorth + debt)) * 100)} tone="down" label="Debt as share of assets" /></div>
        </Panel>
      </div>

      {active.length ? (
        <Panel title="Active loans" pad={false}>
          <div className="divide-y divide-white/[.05]">{active.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              <div className="min-w-[140px] flex-1"><div className="flex items-center gap-2 text-[13.5px] font-semibold">{l.label} <Chip tone={l.status === 'ACTIVE' ? 'brand' : l.status === 'LATE' ? 'warn' : 'down'}>{l.status}</Chip></div><div className="num text-[11.5px] text-mute">Principal {money(l.principal, 0)} · {(l.rate * 100).toFixed(1)}% · due day {l.dueDay + 1} ({Math.max(0, l.dueDay - day)}d left){l.lateDays ? ` · ${l.lateDays}d late` : ''}</div></div>
              <div className="text-right"><div className="label">Remaining</div><div className="num text-[16px] text-down">{money(l.remaining)}</div></div>
              <div className="flex items-center gap-1.5"><input className="input num !w-24" placeholder="amount" value={pay[l.id] ?? ''} onChange={(e) => setPay({ ...pay, [l.id]: e.target.value })} /><button className="btn-line" onClick={() => game.repay(l.id, Number(pay[l.id]) || 0)}>Pay</button><button className="btn-brand" onClick={() => game.repay(l.id, 'all')}>Pay all</button>{!l.restructured ? <button className="btn-line" title="+14 days for a 3% fee and -20 credit" onClick={() => game.restructure(l.id)}>Restructure</button> : null}</div>
            </div>))}</div>
        </Panel>
      ) : null}

      <Panel title="Bank loans" right={<span className="text-[11.5px] text-mute">Rates adjusted for your credit score and difficulty</span>}>
        <div className="grid gap-3 md:grid-cols-3">{offers.map((o) => (
          <div key={o.tier.id} className={cn('rounded-xl border p-3.5', o.allowed ? 'border-white/8 bg-abyss/40' : 'border-white/5 opacity-60')}>
            <div className="text-[11.5px] text-mute">{o.tier.label}</div><div className="num text-[24px] font-semibold">{money(o.tier.amount, 0)}</div>
            <div className="mt-1 text-[12px] text-soft"><span className="num">{(o.rate * 100).toFixed(1)}%</span> for <span className="num">{o.tier.days}</span> days</div>
            <div className="num text-[11.5px] text-mute">Repay {money(o.repay)}</div>
            <button disabled={!o.allowed} className="btn-brand mt-3 w-full" onClick={() => game.takeLoan(o.tier.id)}>Take loan</button>
            {!o.allowed ? <div className="mt-1.5 text-[11px] text-warn">{o.reason}</div> : null}
          </div>))}</div>
        <p className="mt-3 text-[11.5px] text-mute">Base terms: {LOAN_TIERS.map((t) => `$${t.amount / 1000}K ${(t.rate * 100).toFixed(0)}%/${t.days}d`).join(' · ')}. Missing the due date adds 1.5% per day, damages credit, and after 7 days becomes a default.</p>
      </Panel>

      <Panel title="Recovery tools" right={<span className="text-[11.5px] text-mute">Low risk ways back into the game</span>}>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-abyss/40 p-3.5"><div className="text-[13.5px] font-semibold">Daily reward</div><p className="mb-3 mt-1 text-[12px] text-mute">A small bonus that grows with your daily streak.</p><button className="btn-brand w-full" disabled={!canDailyReward(p, w)} onClick={() => game.dailyReward()}>{canDailyReward(p, w) ? 'Claim reward' : 'Claimed today'}</button></div>
          <div className="rounded-xl border border-white/8 bg-abyss/40 p-3.5"><div className="text-[13.5px] font-semibold">Side job</div><p className="mb-3 mt-1 text-[12px] text-mute">Freelance for $110-$260. Once per day, zero market risk.</p><button className="btn-brand w-full" disabled={!canSideJob(p, w)} onClick={() => game.sideJob()}>{canSideJob(p, w) ? 'Work today' : 'Worked today'}</button></div>
          <div className="rounded-xl border border-white/8 bg-abyss/40 p-3.5"><div className="text-[13.5px] font-semibold">Declare bankruptcy</div><p className="mb-3 mt-1 text-[12px] text-mute">Wipes all debt, resets credit to 300, cuts reputation, and gives a $1,500 restart. Last resort.</p><button className="btn-line w-full hover:!border-down hover:!text-down" onClick={() => { if (confirm('Declare bankruptcy? All loans are discharged, credit resets to 300, and your account restarts with $1,500.')) game.bankrupt(); }}>Declare bankruptcy</button></div>
        </div>
      </Panel>
      {paid.length ? <Panel title="Repaid loans" pad={false}>{paid.map((l) => <div key={l.id} className="num flex justify-between px-3.5 py-2 text-[12px] text-mute"><span>{l.label} {money(l.principal, 0)}</span><span className="text-up">Paid day {(l.paidDay ?? 0) + 1}</span></div>)}</Panel> : !active.length ? <Empty>No loans yet. Borrowing is optional. It magnifies both opportunity and ruin.</Empty> : null}
    </div>
  );
}
