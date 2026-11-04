import { it } from 'vitest';
import { Analyzer, type AnalysisFrame } from '../src/audio/analyzer';
import { Judge, STRICTNESS, type Target, type JudgeResult } from '../src/game/judge';
import { builtinSongs } from '../src/songs/library';
import { Timeline } from '../src/core/timeline';
import { tabMidi } from '../src/core/music';
import { FS, mixSignal, runAnalyzer, type Played } from './helpers';

export function simulateTrack(songId: string, trackId: string, opts: { jitter?: number; max?: number; noise?: number; verbose?: boolean } = {}) {
  const song = builtinSongs().find((s) => s.id === songId)!;
  const track = song.tracks.find((t) => t.id === trackId)!;
  const tl = Timeline.fromSong(song);
  const evs = track.events.slice(0, opts.max ?? 80);
  const targets: Target[] = evs.map((ev, i) => ({ id: i, index: i, time: tl.toSec(ev.beat) + 1, midis: ev.notes.map((n) => tabMidi(song.tuning, song.capo, n.string, n.fret)), legato: !!ev.legato, chord: ev.notes.length > 1 }));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const played: Played[] = targets.map((t) => ({ t: t.time + rnd() * (opts.jitter ?? 0.02), midis: t.midis, dur: 1.4, strum: 0.012 }));
  const total = targets[targets.length - 1].time + 2.5;
  const judge = new Judge(targets, STRICTNESS.normal);
  const results: JudgeResult[] = [];
  judge.onResult = (r) => results.push(r);
  const an = new Analyzer(FS);
  const onsets: number[] = [];
  runAnalyzer(an, mixSignal(played, total, { noise: opts.noise ?? 0.0008 }), (f: AnalysisFrame, a) => {
    if (f.onset) onsets.push(f.onsetTime);
    judge.feed(f, a, f.t, f.onsetTime);
    judge.tick(f.t);
  });
  const ok = results.filter((r) => r.grade === 'perfect' || r.grade === 'good' || r.grade === 'ok').length;
  return { song, targets, results, onsets, played, ok, n: targets.length };
}

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
