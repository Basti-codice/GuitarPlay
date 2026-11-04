import { it, expect } from 'vitest';
import { builtinSongs } from '../src/songs/library';
import { simulateTrack } from './helpers';

// Every track of every built-in song, played back by a perfect virtual guitarist (KS synth, 20 ms jitter),
// must be recognised by the analyser + judge. Catches regressions in detection or in arrangements.
it('virtual guitarist is recognised on all built-in tracks', () => {
  const bad: string[] = [];
  let n = 0;
  for (const s of builtinSongs()) {
    for (const t of s.tracks) {
      const r = simulateTrack(s.id, t.id, { max: 24, jitter: 0.02 });
      n++;
      const acc = r.ok / r.n;
      if (acc < 0.85) bad.push(`${s.id}/${t.id}: ${(acc * 100).toFixed(0)}% (${r.ok}/${r.n})`);
    }
  }
  console.log(`${n} tracks simulated; below 85%:\n${bad.join('\n') || 'none'}`);
  expect(bad).toEqual([]);
}, 600000);
