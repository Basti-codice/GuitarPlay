import { it, expect } from 'vitest';
import { Analyzer } from '../src/audio/analyzer';
import { FS, mixSignal } from './helpers';

it('analyser runs far faster than real time', () => {
  const sec = 20;
  const played = Array.from({ length: 40 }, (_, i) => ({ t: 0.5 + i * 0.45, midis: i % 4 === 0 ? [48, 52, 55, 60, 64] : [60 + (i % 7)], dur: 1 }));
  const sig = mixSignal(played, sec);
  const an = new Analyzer(FS);
  const t0 = performance.now();
  let frames = 0;
  for (let i = 0; i < sig.length; i += 512) {
    const fr = an.push(sig.subarray(i, i + 512), (i + 512) / FS);
    for (const f of fr) {
      frames++;
      if (f.gate) an.evaluate([48, 52, 55, 60, 64, 67]); // worst case: judge evaluates a 6-note chord every frame
    }
  }
  const ms = performance.now() - t0;
  console.log(`analysed ${sec}s in ${ms.toFixed(0)} ms -> ${(ms / (sec * 1000) * 100).toFixed(1)}% of one core, ${frames} frames`);
  expect(ms).toBeLessThan(sec * 1000 * 0.25);
});
