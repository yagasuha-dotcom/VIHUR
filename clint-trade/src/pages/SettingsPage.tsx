import { useRef, useState } from 'react';
import { game, useGame } from '@/store/controller';
import { seedLabel } from '@/engine/rng';
import { DIFFICULTY } from '@/engine/difficulty';
import { Panel } from '@/components/ui';
import { cn } from '@/utils/format';

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 py-2 text-left"><span><span className="block text-[13px]">{label}</span>{sub ? <span className="block text-[11.5px] text-mute">{sub}</span> : null}</span><span className={cn('relative h-5 w-9 shrink-0 rounded-full transition', on ? 'bg-brand' : 'bg-white/10')}><i className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} /></span></button>;
}

export function SettingsPage() {
  const snap = useGame((s) => s.snap)!;
  const st = snap.player.settings;
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const w = game.world;
  const exportIt = async () => {
    const raw = await game.exportSave();
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `clint-trade-${seedLabel(w.s.seed)}-day${w.day + 1}.json`; a.click(); URL.revokeObjectURL(url);
    setMsg('Save exported.');
  };
  const importIt = async (f: File | undefined) => { if (!f) return; const ok = await game.importSave(await f.text()); setMsg(ok ? 'Save imported.' : 'That file is not a valid CLINT TRADE save.'); };
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-3 md:p-5">
      <Panel title="Game">
        <div className="grid grid-cols-2 gap-3 text-[12.5px]"><div><div className="label">World seed</div><div className="num text-brand2">{seedLabel(w.s.seed)}</div></div><div><div className="label">Difficulty</div><div>{DIFFICULTY[w.s.difficulty].label}</div></div></div>
        <p className="mt-2 text-[11.5px] text-mute">{DIFFICULTY[w.s.difficulty].blurb} The same seed always produces the same starting world and the same random sequence.</p>
      </Panel>
      <Panel title="Preferences">
        <div className="divide-y divide-white/5">
          <Toggle on={st.sound} onChange={(v) => game.setSetting('sound', v)} label="Sound effects" sub="Buy, sell, profit, loss, breaking news and margin call alerts." />
          <Toggle on={st.confirmOrders} onChange={(v) => game.setSetting('confirmOrders', v)} label="Confirm market orders" sub="Show a confirmation with risk details before every order." />
          <Toggle on={st.showPatterns} onChange={(v) => game.setSetting('showPatterns', v)} label="Show candle patterns on chart" sub="Marks doji, hammer, engulfing, breakouts. Patterns are never guaranteed." />
        </div>
        <button className="btn-line mt-3" onClick={() => useGame.setState({ tutorial: true })}>Open tutorial</button>
      </Panel>
      <Panel title="Save data">
        <p className="mb-3 text-[12px] text-mute">Progress is saved automatically in your browser (IndexedDB) and survives refreshes.</p>
        <div className="flex flex-wrap gap-2"><button className="btn-line" onClick={() => void game.save().then(() => setMsg('Saved.'))}>Save now</button><button className="btn-line" onClick={() => void exportIt()}>Export</button><button className="btn-line" onClick={() => file.current?.click()}>Import</button><input ref={file} type="file" accept="application/json" hidden onChange={(e) => void importIt(e.target.files?.[0])} /></div>
        {msg ? <div className="mt-2 text-[12px] text-brand2">{msg}</div> : null}
      </Panel>
      <Panel title="Session">
        <div className="flex flex-wrap gap-2"><button className="btn-line" onClick={() => game.toWelcome()}>Main menu</button><button className="btn-line hover:!border-down hover:!text-down" onClick={() => { if (confirm('Delete your career and all save data?')) void game.resetAll(); }}>Delete save</button></div>
        <p className="mt-3 text-[11.5px] text-mute">Tip: press <kbd className="rounded border border-edge px-1">Ctrl</kbd>+<kbd className="rounded border border-edge px-1">Shift</kbd>+<kbd className="rounded border border-edge px-1">D</kbd> for the developer panel.</p>
      </Panel>
    </div>
  );
}
