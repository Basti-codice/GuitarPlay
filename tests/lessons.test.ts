import { it, expect } from 'vitest';
import { LESSONS } from '../src/learn/lessons';
import { builtinSongs } from '../src/songs/library';

it('every lesson exercise points at an existing song/track', () => {
  const songs = builtinSongs();
  const ids = new Set(songs.map((s) => s.id));
  const missing: string[] = [];
  for (const l of LESSONS) {
    expect(l.exercises.length, l.id).toBeGreaterThan(0);
    for (const ex of l.exercises) {
      if (ex.link) continue;
      const song = ex.songId ? songs.find((s) => s.id === ex.songId) : ex.make?.();
      if (!song) { missing.push(`${l.id}: ${ex.songId}`); continue; }
      const tid = ex.track ?? song.tracks.find((t) => t.kind === 'melody')?.id ?? song.tracks[0].id;
      if (!song.tracks.some((t) => t.id === tid)) missing.push(`${l.id}: track ${tid} not in ${song.id}`);
    }
  }
  console.log(missing.join('\n') || 'all ok', ids.size);
  expect(missing).toEqual([]);
  expect(LESSONS.length).toBeGreaterThanOrEqual(30);
});
