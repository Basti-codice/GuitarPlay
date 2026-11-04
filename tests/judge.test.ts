import { describe, it, expect } from 'vitest';
import { Analyzer } from '../src/audio/analyzer';
import { Judge, STRICTNESS, type Target, type Grade } from '../src/game/judge';
import { FS, mixSignal, runAnalyzer, type Played } from './helpers';

function simulate(targets: { t: number; midis: number[] }[], played: Played[], total: number, strict: 'easy' | 'normal' | 'strict' = 'normal', noise = 0.0008) {
  const tg: Target[] = targets.map((x, i) => ({ id: i, time: x.t, midis: x.midis, legato: false, chord: x.midis.length > 1, index: i }));
  const j = new Judge(tg, STRICTNESS[strict]);
  const an = new Analyzer(FS);
  const grades: Grade[] = [];
  j.onResult = (r) => (grades[r.id] = r.grade);
  const sig = mixSignal(played, total, { noise });
  runAnalyzer(an, sig, (f, a) => {
    j.feed(f, a, f.t, f.onsetTime);
    j.tick(f.t);
  });
  return { grades, j };
}

describe('judge', () => {
  it('scores a correct melody with timing jitter', () => {
    const notes = [64, 66, 67, 69, 71, 69, 67, 66, 64, 62, 60, 59, 55];
    const times = notes.map((_, i) => 1 + i * 0.5);
    const jitter = [0.02, -0.03, 0.04, -0.01, 0.0, 0.05, -0.04, 0.02, 0.03, -0.02, 0.01, 0.0, -0.05];
    const targets = notes.map((m, i) => ({ t: times[i], midis: [m] }));
    const played = notes.map((m, i) => ({ t: times[i] + jitter[i], midis: [m], dur: 0.9 }));
    const { grades } = simulate(targets, played, 9);
    console.log('melody:', grades.join(','));
    expect(grades.filter((g) => g === 'perfect' || g === 'good').length).toBeGreaterThanOrEqual(notes.length - 1);
  });

  it('flags wrong notes and misses', () => {
    const notes = [64, 66, 67, 69, 71, 69];
    const times = notes.map((_, i) => 1 + i * 0.6);
    const targets = notes.map((m, i) => ({ t: times[i], midis: [m] }));
    const played: Played[] = [
      { t: times[0], midis: [64], dur: 0.9 },
      { t: times[1], midis: [65], dur: 0.9 }, // wrong (semitone off)
      // times[2] not played
      { t: times[3], midis: [69], dur: 0.9 },
      { t: times[4], midis: [59], dur: 0.9 }, // wrong (octave+)
      { t: times[5], midis: [69], dur: 0.9 },
    ];
    const { grades } = simulate(targets, played, 6);
    console.log('wrong/miss:', grades.join(','));
    expect(grades[0]).toMatch(/perfect|good/);
    expect(grades[1]).toBe('wrong');
    expect(grades[2]).toBe('miss');
    expect(grades[3]).toMatch(/perfect|good/);
    expect(grades[4]).toBe('wrong');
    expect(grades[5]).toMatch(/perfect|good/);
  });

  it('handles repeated identical notes and strummed chords', () => {
    const C = [48, 52, 55, 60, 64], G = [43, 47, 50, 55, 59, 67], Am = [45, 52, 57, 60, 64];
    const targets = [
      { t: 1, midis: [64] }, { t: 1.4, midis: [64] }, { t: 1.8, midis: [64] },
      { t: 2.6, midis: C }, { t: 3.6, midis: G }, { t: 4.6, midis: Am }, { t: 5.6, midis: C },
    ];
    const played: Played[] = [
      { t: 1.01, midis: [64], dur: 0.6 }, { t: 1.42, midis: [64], dur: 0.6 }, { t: 1.78, midis: [64], dur: 0.6 },
      { t: 2.62, midis: C, dur: 1, strum: 0.015 }, { t: 3.58, midis: G, dur: 1, strum: 0.015 }, { t: 4.63, midis: Am, dur: 1, strum: 0.015 },
      { t: 5.7, midis: G, dur: 1, strum: 0.015 }, // wrong chord
    ];
    const { grades } = simulate(targets, played, 7);
    console.log('repeat/chord:', grades.join(','));
    expect(grades.slice(0, 3).every((g) => g === 'perfect' || g === 'good')).toBe(true);
    expect(grades.slice(3, 6).every((g) => g === 'perfect' || g === 'good')).toBe(true);
    expect(grades[6]).toMatch(/wrong|miss/);
  });

  it('is robust against noise and does not hallucinate hits', () => {
    const targets = [{ t: 1, midis: [64] }, { t: 2, midis: [67] }];
    const { grades } = simulate(targets, [], 4, 'normal', 0.004);
    expect(grades).toEqual(['miss', 'miss']);
  });
});
