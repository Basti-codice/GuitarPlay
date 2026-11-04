import { Analyzer, type AnalysisFrame } from '../src/audio/analyzer';
import { renderPluck } from '../src/audio/ksynth';
import { midiToFreq, tabMidi } from '../src/core/music';
import { Judge, STRICTNESS, type Target, type JudgeResult } from '../src/game/judge';
import { builtinSongs } from '../src/songs/library';
import { Timeline } from '../src/core/timeline';

export const FS = 48000;

export interface Played {
  t: number; // start second
  midis: number[];
  dur?: number;
  strum?: number; // seconds between strings
  amp?: number;
}

export function mixSignal(played: Played[], totalSec: number, opts: { noise?: number; fs?: number; seed?: number } = {}): Float32Array {
  const fs = opts.fs ?? FS;
  const sig = new Float32Array(Math.floor(totalSec * fs));
  let s = opts.seed ?? 1234;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const noise = opts.noise ?? 0.0008;
  for (let i = 0; i < sig.length; i++) sig[i] = (rnd() - 0.5) * 2 * noise;
  for (const p of played) {
    const sorted = [...p.midis].sort((a, b) => a - b);
    sorted.forEach((m, k) => {
      const note = renderPluck(midiToFreq(m), p.dur ?? 1.2, fs, { seed: m * 7 + k, amp: (p.amp ?? 0.5) / Math.sqrt(sorted.length) });
      const off = Math.floor((p.t + k * (p.strum ?? 0.012)) * fs);
      for (let i = 0; i < note.length && off + i < sig.length; i++) sig[off + i] += note[i];
    });
  }
  return sig;
}

export function runAnalyzer(an: Analyzer, sig: Float32Array, onFrame: (f: AnalysisFrame, an: Analyzer) => void, fs = FS) {
  const B = 128;
  for (let i = 0; i < sig.length; i += B) {
    const blk = sig.subarray(i, Math.min(sig.length, i + B));
    const frames = an.push(blk, (i + blk.length) / fs);
    for (const f of frames) onFrame(f, an);
  }
}

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

