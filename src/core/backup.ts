import { idbAll, idbPut } from './storage';
import { getSettings, updateSettings } from './settings';
import { getProgress, replaceProgress } from './progress';
import type { Song } from './types';
import { loadUserSongs, saveUserSong } from './songs-store';

export interface SheetItem {
  id: string;
  name: string;
  addedAt: number;
  blob: Blob;
  songId?: string;
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
const dataUrlToBlob = async (u: string) => (await fetch(u)).blob();

export async function exportBackup(): Promise<Blob> {
  const songs = await idbAll<Song>('songs');
  const sheets = await idbAll<SheetItem>('sheets');
  const sheetsOut = await Promise.all(sheets.map(async (s) => ({ ...s, blob: await blobToDataUrl(s.blob) })));
  const data = { app: 'guitarplay', version: 1, exportedAt: Date.now(), settings: { ...getSettings(), apiKey: '' }, progress: getProgress(), songs, sheets: sheetsOut };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function importBackup(file: File) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'guitarplay') throw new Error('This is not a GuitarPlay backup file.');
  await loadUserSongs();
  if (data.settings) updateSettings({ ...data.settings, apiKey: getSettings().apiKey });
  if (data.progress) replaceProgress(data.progress);
  for (const s of data.songs ?? []) await saveUserSong(s);
  for (const sh of data.sheets ?? []) await idbPut('sheets', { ...sh, blob: await dataUrlToBlob(sh.blob) });
}
