import { it } from 'vitest';
import { simulateTrack } from './helpers';
it('sim: tracks', () => {
  for (const [s, t] of [['four-chord-pop-loop', 'chords'], ['folk-strum-in-d', 'picking'], ['four-chord-pop-loop', 'picking'], ['twinkle-twinkle-little-star', 'melody']]) {
    const r = simulateTrack(s, t, { max: 48 });
    const bad = r.results.filter((x) => x.grade === 'miss' || x.grade === 'wrong');
    console.log(`${s}/${t}: ${r.ok}/${r.n} ok; onsets=${r.onsets.length}`);
    for (const b of bad.slice(0, 8)) {
      const tg = r.targets[b.id];
      console.log(`   bad #${b.id} t=${tg.time.toFixed(2)} ${b.grade} midis=${tg.midis.join(',')} frac=${b.frac.toFixed(2)} heard=${b.heard.map((h) => (h ? 1 : 0)).join('')}`);
    }
  }
});
