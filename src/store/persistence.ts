import { del, get, set } from 'idb-keyval';
import type { WorldState } from '@/engine/world';
import type { PlayerState } from '@/features/types';
import { parsePacked, stringifyPacked } from './pack';

const KEY = 'clint-trade-save-v1';
const META = 'clint-trade-meta-v1';

export interface SaveMeta { savedAt: number; day: number; netWorth: number; difficulty: string; seed: number; level: number }
export interface SaveBlob { version: number; world: WorldState; player: PlayerState; speed: number; meta: SaveMeta }

async function gzip(str: string): Promise<Blob | string> {
  try {
    if (typeof CompressionStream === 'undefined') return str;
    const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  } catch { return str; }
}
async function gunzip(v: Blob | string): Promise<string> {
  if (typeof v === 'string') return v;
  const stream = v.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function writeSave(blob: SaveBlob): Promise<void> {
  const data = await gzip(stringifyPacked(blob));
  await set(KEY, data);
  await set(META, blob.meta);
}
export async function readSave(): Promise<SaveBlob | null> {
  try { const v = await get<Blob | string>(KEY); return v ? parsePacked<SaveBlob>(await gunzip(v)) : null; } catch { return null; }
}
export async function readMeta(): Promise<SaveMeta | null> { try { return (await get<SaveMeta>(META)) ?? null; } catch { return null; } }
export async function clearSave(): Promise<void> { await del(KEY); await del(META); }
export async function exportRaw(): Promise<string | null> { try { const v = await get<Blob | string>(KEY); return v ? await gunzip(v) : null; } catch { return null; } }
export async function importRaw(s: string): Promise<boolean> {
  try { const b = parsePacked<SaveBlob>(s); if (!b.world || !b.player) return false; await set(KEY, await gzip(s)); await set(META, b.meta); return true; } catch { return false; }
}
