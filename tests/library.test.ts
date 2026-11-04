import { it, expect } from 'vitest';
import { FOLK } from '../src/songs/library/folk';
import { parseAbc } from '../src/songs/abc';
import { builtinSongs } from '../src/songs/library';
import { tabMidi } from '../src/core/music';

it('all ABC tunes have consistent bar lengths', () => {
  const problems: string[] = [];
  for (const e of FOLK) {
    const t = parseAbc(e.abc);
    if (t.warnings.length) problems.push(`${t.title}: ${t.warnings.join('; ')}`);
  }
  console.log(problems.join('\n') || 'no bar problems');
  expect(problems).toEqual([]);
});

it('built-in songs are playable', () => {
  const songs = builtinSongs();
  console.log('songs:', songs.length);
  for (const s of songs) {
    expect(s.tracks.length, s.title).toBeGreaterThan(0);
    for (const t of s.tracks) {
      expect(t.events.length, `${s.title}/${t.id}`).toBeGreaterThan(0);
      for (const ev of t.events) {
        expect(ev.notes.length, `${s.title}/${t.id}@${ev.beat}`).toBeGreaterThan(0);
        const used = new Set<number>();
        for (const nn of ev.notes) {
          expect(nn.fret).toBeGreaterThanOrEqual(0);
          expect(nn.fret).toBeLessThanOrEqual(24);
          expect(used.has(nn.string)).toBe(false);
          used.add(nn.string);
          const m = tabMidi(s.tuning, s.capo, nn.string, nn.fret);
          expect(m).toBeGreaterThan(35);
          expect(m).toBeLessThan(90);
        }
      }
    }
  }
});
