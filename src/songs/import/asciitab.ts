import type { NoteEvent, Song, TabNote } from '../../core/types';
import { STANDARD } from '../../core/music';

/**
 * Parse plain-text guitar tab:
 *   e|--0--3--|
 *   B|--1-----|
 * Columns are treated as an even grid; `perBeat` columns = one beat.
 */
export function parseAsciiTab(text: string, opts: { bpm?: number; perBeat?: number; title?: string } = {}): Song {
  const lines = text.replace(/\r/g, '').split('\n');
  const rowRe = /^\s*([eEBGDAb]?)\s*[|:]?([-0-9a-zA-Z|/\\~^().*x\s]+)$/;
  const names = ['e', 'B', 'G', 'D', 'A', 'E'];
  // collect blocks of 6 consecutive tab lines
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^\s*[eEBGDAb]?\s*\|?[-\d|hpbrsx/\\~^()]{4,}/.test(l) && /-/.test(l)) {
      const m = rowRe.exec(l);
      if (m) cur.push(l.replace(/^\s*[eEBGDAb]?\s*[|:]?/, ''));
      if (cur.length === 6) {
        blocks.push(cur);
        cur = [];
      }
    } else cur = [];
  }
  if (!blocks.length) throw new Error('No tab lines found. Expected six lines like “e|--0--3--|”.');
  const perBeat = opts.perBeat ?? 2;
  const events: NoteEvent[] = [];
  let col0 = 0;
  for (const b of blocks) {
    const width = Math.max(...b.map((r) => r.length));
    let c = 0;
    while (c < width) {
      const notes: TabNote[] = [];
      let used = 0;
      for (let row = 0; row < 6; row++) {
        const ch = b[row][c];
        if (ch && /\d/.test(ch)) {
          // two-digit frets
          let f = ch;
          if (/\d/.test(b[row][c + 1] ?? '') ) f += b[row][c + 1];
          used = Math.max(used, f.length);
          notes.push({ string: 5 - row, fret: parseInt(f) });
        }
      }
      if (notes.length) {
        // strings are listed e..E -> our string index 0 = low E; row 0 is high e -> index 5
        events.push({ beat: (col0 + c) / perBeat, dur: 1 / perBeat, notes });
      }
      c += Math.max(1, used);
    }
    col0 += width + 1;
  }
  for (let i = 0; i < events.length; i++) {
    const n = events[i + 1];
    events[i].dur = n ? Math.min(2, Math.max(1 / perBeat, n.beat - events[i].beat)) : 1;
  }
  const end = events[events.length - 1].beat + 1;
  return {
    id: `import-tab-${Date.now().toString(36)}`,
    title: opts.title ?? 'Pasted tab',
    artist: 'Imported (text tab)',
    genre: 'Imported',
    difficulty: 3,
    bpm: opts.bpm ?? 90,
    beatsPerBar: 4,
    beatUnit: 4,
    tuning: STANDARD,
    capo: 0,
    tracks: [{ id: 'main', name: 'Tab', kind: 'other', events }],
    chords: [],
    lengthBeats: Math.ceil(end / 4) * 4,
    source: 'user',
    tags: ['imported', 'text tab'],
    pickup: 0,
    createdAt: Date.now(),
  };
}
void ((): void => void 0);
export const _names = ['e', 'B', 'G', 'D', 'A', 'E'];
