import { it, expect } from 'vitest';
import { importWithAlphaTab } from '../src/songs/import/gp';
import { parseAsciiTab } from '../src/songs/import/asciitab';
import { importAbcText } from '../src/songs/import';

it('imports alphaTex with repeats, tuning and chord names', async () => {
  const tex = `\\title "Test Song" \\artist "Me" \\tempo 100 \\tuning E4 B3 G3 D3 A2 E2 .
    \\chord "Am" 3.3.4 0.2.4 2.1.4 0.2.4 | \\ro 5.6.4 3.5.4 0.4.2 \\rc 2 | 3.1.1 |`;
  const r = await importWithAlphaTab(new TextEncoder().encode(tex), 'test.alphatex');
  const t = r.song.tracks[0];
  console.log(r.song.title, r.song.bpm, t.events.map((e) => `${e.beat}:${e.notes.map((n) => `${n.string}.${n.fret}`).join('+')}`).join(' '), r.song.lengthBeats);
  expect(r.song.title).toBe('Test Song');
  // alphaTex "3.3" = fret 3 on string 3 (G) => our string index 3 (G string), fret 3
  expect(t.events[0].notes[0]).toMatchObject({ string: 3, fret: 3 });
  // repeat bar (2 passes) -> 4 + 3*2 + 4 beats
  expect(r.song.lengthBeats).toBe(4 + 8 * 2 + 4);
});

it('parses ascii tab', () => {
  const s = parseAsciiTab(`e|--0--3--|
B|--1-----|
G|--0-----|
D|--2-----|
A|--3--0--|
E|--------|`);
  expect(s.tracks[0].events.length).toBe(2);
  expect(s.tracks[0].events[0].notes.length).toBe(5);
  expect(s.tracks[0].events[1].notes.map((n) => `${n.string}.${n.fret}`).sort()).toEqual(['1.0', '5.3']);
});

it('imports abc text', () => {
  const r = importAbcText(`X:1\nT:Mini\nM:4/4\nL:1/4\nK:C\n"C"C D E F | "G"G4 |]`);
  expect(r.song.tracks.length).toBeGreaterThan(0);
});
