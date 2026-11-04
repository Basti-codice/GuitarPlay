import { useSyncExternalStore } from 'react';
import type { Song } from './types';
import { builtinSongs } from '../songs/library';
import { idbAll, idbDelete, idbPut } from './storage';

let user: Song[] = [];
let version = 0;
const subs = new Set<() => void>();
let loaded = false;

const bump = () => {
  version++;
  subs.forEach((s) => s());
};

export async function loadUserSongs() {
  if (loaded) return;
  loaded = true;
  try {
    user = (await idbAll<Song>('songs')).map((s) => ({ ...s, source: 'user' as const }));
  } catch {
    user = [];
  }
  bump();
}

export const allSongs = (): Song[] => [...builtinSongs(), ...user];
export const getSong = (id: string): Song | undefined => allSongs().find((s) => s.id === id);

export async function saveUserSong(s: Song) {
  const song = { ...s, source: 'user' as const, createdAt: s.createdAt ?? Date.now() };
  await idbPut('songs', song);
  user = [...user.filter((x) => x.id !== song.id), song];
  bump();
  return song;
}

export async function deleteUserSong(id: string) {
  await idbDelete('songs', id);
  user = user.filter((x) => x.id !== id);
  bump();
}

export function useSongs(): Song[] {
  useSyncExternalStore((fn) => (subs.add(fn), () => subs.delete(fn)), () => version);
  return allSongs();
}

export const userSongs = () => user;
