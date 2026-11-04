import { it, expect } from 'vitest';
import { parseAbc } from '../src/songs/abc';

it('parses a simple tune with repeats and chords', () => {
  const t = parseAbc(`X:1
T:Test
M:4/4
L:1/4
Q:1/4=100
K:G
"G"G A B c | "D"d2 d2 :|
"C"e e e e |1 "G"g4 :|2 "G"g4 |]
`);
  expect(t.title).toBe('Test');
  expect(t.bpm).toBe(100);
  // bars: 1,2 | 1,2 | 3,4(1st) | 3,5(2nd)  => 2 bars repeated + volta
  const first = t.items[0];
  expect(first.pitches[0]).toBe(67);
  console.log(t.items.map((i) => `${i.beat}:${i.pitches.join('+')}(${i.dur})`).join(' '));
  console.log(t.chords.map((c) => `${c.beat}${c.name}`).join(' '), t.lengthBeats);
});
it('key signature and accidentals', () => {
  const t = parseAbc(`T:K
M:3/4
L:1/8
K:D
F G ^F =F z2 c'2`);
  expect(t.items[0].pitches[0]).toBe(66); // F# in D
  expect(t.items[2].pitches[0]).toBe(66);
  expect(t.items[3].pitches[0]).toBe(65);
});
