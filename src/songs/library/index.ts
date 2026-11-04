import type { Song, SongMeta } from '../../core/types';
import { buildSong } from '../arrange';
import { FOLK } from './folk';
import { EXERCISES, PROGRESSIONS, progressionSong } from './generated';

let cache: Song[] | null = null;

export function builtinSongs(): Song[] {
  if (cache) return cache;
  const out: Song[] = [];
  for (const e of FOLK) {
    try {
      out.push(buildSong(e));
    } catch (err) {
      console.error('Failed to build song', e.abc.slice(0, 40), err);
    }
  }
  for (const p of PROGRESSIONS) out.push(progressionSong(p));
  out.push(...EXERCISES);
  // unique ids
  const seen = new Set<string>();
  for (const s of out) {
    let id = s.id,
      k = 2;
    while (seen.has(id)) id = `${s.id}-${k++}`;
    s.id = id;
    seen.add(id);
  }
  cache = out;
  return out;
}

export const songMeta = (s: Song): SongMeta => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  genre: s.genre,
  difficulty: s.difficulty,
  source: s.source,
  tags: s.tags ?? [],
  tracks: s.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind })),
});
