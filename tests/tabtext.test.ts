import { it, expect } from 'vitest';
import { parseTabText, serializeTabText, parseTuningText } from '../src/songs/import/tabtext';
import { builtinSongs } from '../src/songs/library';
import { tabMidi } from '../src/core/music';

const SAMPLE = `\`\`\`
Title: Test Song
Artist: Me
Tempo: 96
Meter: 4/4
Grid: 1/8
Tuning: Drop D
Capo: 2
Key: Em
Difficulty: 2
Genre: Pop
Style: ballad

[Intro]
Chords: Em | G | D A | -
e|-0---0--|-3---3--|-2---2--|-0---0--|
B|-3---3--|-0---0--|-3---3--|-2---2--|
G|-0---0--|-0---0--|-2---2--|-2---2--|
D|-2---2--|-0---0--|-0---0--|-2---2--|
A|-2---2--|-2---2--|--------|-0---0--|
E|-0---0--|-3---3--|--------|--------|
\`\`\``;

it('parses headers, systems, chords and bars', () => {
  const r = parseTabText(SAMPLE);
  console.log(r.warnings.join('\n') || 'no warnings');
  expect(r.song.title).toBe('Test Song');
  expect(r.song.bpm).toBe(96);
  expect(r.song.capo).toBe(2);
  expect(r.song.tuning[0]).toBe(38); // Drop D
  expect(r.bars).toBe(4);
  expect(r.song.style).toBe('ballad');
  expect(r.warnings).toEqual([]);
  const main = r.song.tracks[0].events;
  // first column of bar 1: 6 strings
  expect(main[0].beat).toBe(0.5);
  expect(main[0].notes.length).toBe(6);
  expect(main[1].beat).toBe(2.5);
  expect(r.song.chords.map((c) => c.name)).toEqual(['Em', 'G', 'D', 'A']);
  expect(r.song.tracks.map((t) => t.id)).toEqual(['main', 'chords', 'picking']);
  expect(r.song.chords[2].beat).toBe(8);
  expect(r.song.chords[3].beat).toBe(10);
});

it('handles two-digit frets, repeats, techniques and ragged bars', () => {
  const r = parseTabText(`Tempo: 80
Meter: 4/4
Grid: 1/8
e|:-12-10-8-7-|-5h7-0-----:|
B|-----------|--------0--|
G|-----------|-----------|
D|-----------|-----------|
A|-----------|-----------|
E|-----------|-----------|`);
  const ev = r.song.tracks[0].events;
  // bar1 repeated -> 2 bars + 2 bars = 4 bars... first bar has pad columns for 2-digit frets
  expect(r.bars).toBe(4);
  const first = ev[0];
  expect(first.notes[0]).toMatchObject({ string: 5, fret: 12 });
  expect(ev[1].notes[0].fret).toBe(10);
  // legato marker: 5h7
  const h = ev.find((e) => e.notes[0].fret === 5)!;
  expect(h.notes[0].tech).toContain('h');
  expect(ev.find((e) => e.notes[0].fret === 7 && e.legato)).toBeTruthy();
});

it('reports missing settings and bad bars helpfully', () => {
  const r = parseTabText(`e|---0---|--0--|
B|-------|-----|
G|-------|-----|
D|-------|-----|
A|-------|-----|
E|-------|-----|`);
  expect(r.defaulted).toContain('tempo');
  expect(r.warnings.some((w) => /columns/.test(w))).toBe(true);
  expect(() => parseTabText('hello world')).toThrow(/No tab found/);
});

it('parses tuning names and note lists', () => {
  expect(parseTuningText('DADGAD')![0]).toBe(38);
  expect(parseTuningText('standard')![5]).toBe(64);
  expect(parseTuningText('D A D G B E')![0]).toBe(38);
  expect(parseTuningText('E B G D A E')![0]).toBe(40); // high->low order is detected
});

it('round-trips built-in exercises through the text format', () => {
  for (const id of ['chromatic-spider', 'a-minor-pentatonic-1', 'blues-boogie-e', 'celtic-jig-d', 'chromatic-walk-down']) {
    const s = builtinSongs().find((x) => x.id === id)!;
    const txt = serializeTabText(s);
    const back = parseTabText(txt);
    const a = s.tracks[0].events.map((e) => `${e.beat.toFixed(3)}:${e.notes.map((n) => tabMidi(s.tuning, 0, n.string, n.fret)).sort().join('+')}`);
    const b = back.song.tracks[0].events.map((e) => `${e.beat.toFixed(3)}:${e.notes.map((n) => tabMidi(back.song.tuning, 0, n.string, n.fret)).sort().join('+')}`);
    expect(b, id).toEqual(a);
    expect(back.warnings, id).toEqual([]);
  }
});

import { buildAiPrompt } from '../src/songs/import/prompt';

it('the example inside the AI prompt parses cleanly (the AI copies this pattern)', () => {
  const p = buildAiPrompt({ tempo: '88', capo: '2' });
  expect(p).toContain('KNOWN SETTINGS');
  const m = /EXAMPLE[^\n]*\n```\n([\s\S]*?)```/.exec(p);
  expect(m).toBeTruthy();
  const r = parseTabText(m![1]);
  expect(r.warnings).toEqual([]);
  expect(r.bars).toBe(4);
  expect(r.defaulted).toEqual([]);
  expect(r.song.tracks.length).toBe(3); // tab + strumming + picking from the Chords line
});

it('tolerates typical AI formatting slips', () => {
  const r = parseTabText(`Here is your tab:

**Title:** Slip Test
Tempo: ~ 92 BPM
Meter: 4/4
Grid: eighth notes

Chords:  Am  |  F  |  C | G
E |-0-----0-|-1-----1-|
B |-1-----1-|-1-----1-|
G |-2-----2-|-2-----2-|
D |-2-----2-|-3-----3-|
A |-0-----0-|-3-----3-|
E |---------|---------|

Hope this helps!`);
  expect(r.song.title).toBe('Slip Test');
  expect(r.song.bpm).toBe(92);
  expect(r.bars).toBe(2);
  expect(r.warnings.some((w) => /Chords:/.test(w))).toBe(true); // 4 chord entries for 2 bars is reported, not fatal
});
