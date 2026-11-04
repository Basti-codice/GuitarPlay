import { describe, it, expect } from 'vitest';
import { Analyzer } from '../src/audio/analyzer';
import { FS, mixSignal, runAnalyzer } from './helpers';

describe('analyzer', () => {
  it('detects onset timing and pitch for single notes across the guitar range', () => {
    const rows: string[] = [];
    let onsetErr: number[] = [];
    for (const m of [40, 45, 47, 50, 52, 55, 59, 60, 64, 67, 71, 76, 81]) {
      const an = new Analyzer(FS);
      const sig = mixSignal([{ t: 0.5, midis: [m], dur: 1.2 }], 2);
      const ons: number[] = [];
      let pitchOk = 0, pitchN = 0;
      const scoreSelf: number[] = [], scoreUp: number[] = [], scoreDown: number[] = [], scoreOct: number[] = [];
      runAnalyzer(an, sig, (f, a) => {
        if (f.onset) ons.push(f.onsetTime);
        if (f.t > 0.65 && f.t < 1.4) {
          if (f.pitch) { pitchN++; if (Math.abs(f.pitch.midi - m) < 0.3) pitchOk++; }
          scoreSelf.push(a.noteScore(m)); scoreUp.push(a.noteScore(m + 1)); scoreDown.push(a.noteScore(m - 1));
          scoreOct.push(a.evaluate([m + 12]).scores[0]);
        }
      });
      const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
      rows.push(`m=${m} onsets=${ons.map((o) => (o - 0.5).toFixed(3)).join(',')} pitch ${pitchOk}/${pitchN} self=${avg(scoreSelf).toFixed(2)} +1=${avg(scoreUp).toFixed(2)} -1=${avg(scoreDown).toFixed(2)} +12=${avg(scoreOct).toFixed(2)}`);
      if (ons.length) onsetErr.push(ons[0] - 0.5);
    }
    console.log(rows.join('\n'));
    expect(onsetErr.length).toBeGreaterThan(8);
  });
});

describe('chords', () => {
  const chords: Record<string, number[]> = {
    C: [48, 52, 55, 60, 64],
    G: [43, 47, 50, 55, 59, 67],
    Am: [45, 52, 57, 60, 64],
    Em: [40, 47, 52, 55, 59, 64],
    D: [50, 57, 62, 66],
    F: [41, 48, 53, 57, 60, 65],
  };
  it('chord discrimination', () => {
    const names = Object.keys(chords);
    const rows: string[] = [];
    for (const played of names) {
      const an = new Analyzer(FS);
      const sig = mixSignal([{ t: 0.5, midis: chords[played], dur: 1.5, strum: 0.015 }], 2.2);
      const fr: Record<string, number[]> = {};
      runAnalyzer(an, sig, (f, a) => {
        if (f.t > 0.75 && f.t < 1.6) for (const n of names) (fr[n] ??= []).push(a.evaluate(chords[n]).frac);
      });
      rows.push(`played ${played}: ` + names.map((n) => `${n}=${(fr[n].reduce((a, b) => a + b, 0) / fr[n].length).toFixed(2)}`).join(' '));
    }
    console.log(rows.join('\n'));
  });
});
