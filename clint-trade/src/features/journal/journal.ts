import type { PlayerState } from '../types';
export function updateJournal(p: PlayerState, id: string, patch: { note?: string; lesson?: string; reason?: string }): void {
  const j = p.journal.find((x) => x.id === id);
  if (!j) return;
  if (patch.note !== undefined) j.note = patch.note;
  if (patch.lesson !== undefined) j.lesson = patch.lesson;
  if (patch.reason !== undefined) j.reason = patch.reason;
}
export function fmtDuration(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}
