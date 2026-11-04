import { Analyzer, type AnalysisFrame } from '../src/audio/analyzer';
import { renderPluck } from '../src/audio/ksynth';
import { midiToFreq } from '../src/core/music';

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
