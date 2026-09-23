import { useState } from 'react';
import { game, useGame } from '@/store/controller';
import { CATALOG_MAP } from '@/engine/catalog';
import { fmtGameTime } from '@/engine/time';
import { fmtDuration } from '@/features/journal/journal';
import type { JournalEntry } from '@/features/types';
import { Chip, Delta, Empty, Panel, Tabs } from '@/components/ui';
import { px } from '@/utils/format';

function Entry({ j }: { j: JournalEntry }) {
  const d = CATALOG_MAP[j.assetId];
  const [note, setNote] = useState(j.note); const [lesson, setLesson] = useState(j.lesson); const [reason, setReason] = useState(j.reason);
  const dirty = note !== j.note || lesson !== j.lesson || reason !== j.reason;
  return (
    <article className="rounded-xl border border-white/5 bg-abyss/40 p-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold">{d.id}</span><Chip tone={j.side === 'LONG' ? 'up' : 'down'}>{j.side}</Chip>
        <Chip tone={j.result === 'PROFIT' ? 'up' : j.result === 'LOSS' ? 'down' : j.result === 'OPEN' ? 'brand' : 'mute'}>{j.result === 'OPEN' ? 'OPEN' : `RESULT: ${j.result}`}</Chip>
        <span className="num ml-auto text-[11px] text-mute">{fmtGameTime(j.openT)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        <div><div className="label">Entry</div><div className="num">{px(j.entry, d.decimals)}</div></div>
        <div><div className="label">Exit</div><div className="num">{j.exit ? px(j.exit, d.decimals) : '-'}</div></div>
        <div><div className="label">P/L</div>{j.pnl !== undefined ? <Delta v={j.pnl} prefix="$" /> : <span className="text-mute">-</span>}</div>
        <div><div className="label">Duration</div><div className="num">{j.durationSec !== undefined ? fmtDuration(j.durationSec) : 'running'}</div></div>
      </div>
      <div className="mt-2 rounded-lg bg-white/[.03] px-2.5 py-1.5 text-[11.5px] text-mute"><span className="text-soft">Market condition:</span> {j.condition}</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label><span className="label">Reason for the trade</span><input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why did you enter?" /></label>
        <label><span className="label">Notes</span><input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observations while in the trade" /></label>
      </div>
      <label className="mt-2 block"><span className="label">Lesson</span><input className="input mt-1" value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder='e.g. "Breakout confirmation was successful."' /></label>
      {j.auto ? <div className="mt-2 text-[11.5px] text-brand2"><b>Review:</b> {j.auto}</div> : null}
      {dirty ? <div className="mt-2 flex justify-end"><button className="btn-brand !py-1" onClick={() => game.journal(j.id, { note, lesson, reason })}>Save notes</button></div> : null}
    </article>
  );
}

export function JournalPage() {
  const journal = useGame((s) => s.snap!.player.journal);
  const [f, setF] = useState<'all' | 'open' | 'profit' | 'loss'>('all');
  const list = journal.filter((j) => f === 'all' || (f === 'open' ? j.result === 'OPEN' : f === 'profit' ? j.result === 'PROFIT' : j.result === 'LOSS')).slice(-60).reverse();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-3 md:p-5">
      <Panel><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-[15px] font-semibold">Trading journal</h2><p className="text-[12px] text-mute">Every trade is recorded automatically. Add your reasoning now and your lesson later. Reviewing losses is where most improvement comes from.</p></div><Tabs value={f} onChange={setF} items={[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'profit', label: 'Wins' }, { id: 'loss', label: 'Losses' }]} /></div></Panel>
      {list.length ? list.map((j) => <Entry key={j.id + j.result} j={j} />) : <Empty>No journal entries yet. Your first trade will appear here.</Empty>}
    </div>
  );
}
