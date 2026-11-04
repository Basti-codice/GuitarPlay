import type { ChordMark, Genre, NoteEvent, Song, TabNote, Tech, Track } from '../../core/types';
import { STANDARD } from '../../core/music';
import { makeChordTrack, makePickingTrack, slug } from '../arrange';

export interface ProgEntry {
  title: string;
  /** one string per bar; several chords separated by spaces share the bar equally */
  bars: string[];
  loops?: number;
  bpm: number;
  num?: number;
  den?: number;
  style?: Song['style'];
  genre: Genre | string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  capo?: number;
  picking?: 'arp' | 'travis';
  tags?: string[];
  description?: string;
  key?: string;
  tracks?: ('chords' | 'picking')[];
  id?: string;
}

export function progressionSong(e: ProgEntry): Song {
  const num = e.num ?? 4,
    den = e.den ?? 4;
  const barLen = (num * 4) / den;
  const loops = e.loops ?? 1;
  const chords: ChordMark[] = [];
  let t = 0;
  for (let l = 0; l < loops; l++) {
    for (const bar of e.bars) {
      const cs = bar.split(/\s+/).filter(Boolean);
      const each = barLen / cs.length;
      cs.forEach((c, i) => chords.push({ beat: t + i * each, dur: each, name: c }));
      t += barLen;
    }
  }
  const len = t;
  const merged: ChordMark[] = [];
  for (const c of chords) {
    const last = merged[merged.length - 1];
    if (last && last.name === c.name && Math.abs(last.beat + last.dur - c.beat) < 1e-6) last.dur += c.dur;
    else merged.push({ ...c });
  }
  const want = e.tracks ?? ['chords', 'picking'];
  const tracks: Track[] = [];
  if (want.includes('chords')) tracks.push({ id: 'chords', name: 'Chords (strumming)', kind: 'chords', events: makeChordTrack(merged, num, den, e.style, 0, len) });
  if (want.includes('picking')) tracks.push({ id: 'picking', name: e.picking === 'travis' ? 'Travis picking' : 'Fingerpicking', kind: 'picking', events: makePickingTrack(merged, num, den, 0, len, e.picking) });
  return {
    id: e.id ?? slug(e.title),
    title: e.title,
    artist: 'GuitarPlay',
    genre: e.genre,
    difficulty: e.difficulty,
    bpm: e.bpm,
    beatsPerBar: num,
    beatUnit: den,
    tuning: STANDARD,
    capo: e.capo ?? 0,
    key: e.key,
    tracks,
    chords: merged,
    lengthBeats: len,
    source: 'builtin',
    tags: e.tags ?? [],
    description: e.description,
    style: e.style,
    pickup: 0,
  };
}

export const PROGRESSIONS: ProgEntry[] = [
  { title: 'Four-Chord Pop Loop', bars: ['C', 'G', 'Am', 'F'], loops: 4, bpm: 100, style: 'rock', genre: 'Pop', difficulty: 2, key: 'C', tags: ['I-V-vi-IV', 'open chords'], description: 'The most common progression in pop music. Practise clean changes and steady strumming.' },
  { title: 'Slow Pop Ballad', bars: ['Am', 'F', 'C', 'G'], loops: 4, bpm: 72, style: 'ballad', genre: 'Pop', difficulty: 2, key: 'C', tags: ['vi-IV-I-V', 'ballad'], description: 'Same four chords, starting on the minor. Let the chords ring.' },
  { title: '50s Doo-Wop Changes', bars: ['C', 'Am', 'F', 'G'], loops: 4, bpm: 96, style: 'folk', genre: 'Pop', difficulty: 2, key: 'C', tags: ['I-vi-IV-V'] },
  { title: 'Campfire Strum in G (Capo 2)', bars: ['G', 'D', 'Em', 'C'], loops: 4, bpm: 104, style: 'folk', genre: 'Folk', difficulty: 2, capo: 2, key: 'A', tags: ['capo', 'folk strum'], description: 'Play G-shapes with a capo on fret 2 – sounds in A.' },
  { title: 'Canon-Style Progression in D', bars: ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'], loops: 2, bpm: 80, style: 'ballad', genre: 'Classical', difficulty: 3, key: 'D', tags: ['barre', 'F#m'], description: 'The classic baroque chord loop. Needs an F#m barre chord.' },
  { title: 'Andalusian Cadence', bars: ['Am', 'G', 'F', 'E'], loops: 6, bpm: 108, style: 'rock', genre: 'World', difficulty: 3, key: 'Am', tags: ['flamenco', 'minor'], description: 'Descending minor cadence. The E major resolves back to Am.' },
  { title: 'Three-Chord Rock in A', bars: ['A', 'A', 'D', 'E'], loops: 4, bpm: 120, style: 'rock', genre: 'Rock', difficulty: 2, key: 'A', tags: ['I-IV-V', 'eighth notes'] },
  { title: 'Folk Strum in D', bars: ['D', 'G', 'D', 'A'], loops: 4, bpm: 108, style: 'folk', genre: 'Folk', difficulty: 2, key: 'D', tags: ['I-IV-V'] },
  { title: 'Country Road in G', bars: ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G'], loops: 2, bpm: 112, style: 'folk', genre: 'Country', difficulty: 2, key: 'G', tags: ['I-IV-V', 'boom-chick'] },
  { title: 'Reggae One-Drop in C', bars: ['C', 'F', 'C', 'F', 'Am', 'F', 'G', 'C'], loops: 2, bpm: 84, style: 'reggae', genre: 'World', difficulty: 3, key: 'C', tags: ['offbeat', 'upstrokes'], description: 'Upstrokes on the offbeats with short, muted chords.' },
  { title: 'Minor Rock in Em', bars: ['Em', 'C', 'G', 'D'], loops: 4, bpm: 100, style: 'rock', genre: 'Rock', difficulty: 3, key: 'Em', tags: ['i-VI-III-VII'] },
  { title: 'Shimmer: Sus & Add9', bars: ['Cadd9', 'G', 'Em7', 'Dsus4 D'], loops: 4, bpm: 92, style: 'folk', genre: 'Pop', difficulty: 3, key: 'G', tags: ['add9', 'sus4', 'extended'] },
  { title: 'Barre Chord Workout in F', bars: ['F', 'Bb', 'C', 'Dm', 'F', 'Bb', 'C', 'F'], loops: 2, bpm: 76, style: 'ballad', genre: 'Exercise', difficulty: 4, key: 'F', tags: ['barre', 'F shape'], description: 'Movable E-shape and A-shape barre chords all the way through.' },
  { title: 'ii–V–I Jazz Changes in C', bars: ['Dm7', 'G7', 'Cmaj7', 'Am7'], loops: 4, bpm: 84, style: 'ballad', genre: 'Jazz', difficulty: 4, key: 'C', tags: ['7th chords', 'jazz'] },
  { title: 'Funk Vamp: Em7 – A7', bars: ['Em7', 'A7', 'Em7', 'A7'], loops: 4, bpm: 100, style: 'rock', genre: 'Pop', difficulty: 4, key: 'E', tags: ['7th chords', 'syncopation'] },
  { title: '12-Bar Blues in E', bars: ['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7'], loops: 1, bpm: 100, style: 'shuffle', genre: 'Blues', difficulty: 3, key: 'E', tags: ['12-bar', 'dominant 7'], description: 'The blues form. Every guitarist needs this one.' },
  { title: '12-Bar Blues in A (Quick Change)', bars: ['A7', 'D7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'], loops: 1, bpm: 96, style: 'shuffle', genre: 'Blues', difficulty: 3, key: 'A', tags: ['12-bar', 'quick change'] },
  { title: 'Minor Blues in Am', bars: ['Am7', 'Am7', 'Am7', 'Am7', 'Dm7', 'Dm7', 'Am7', 'Am7', 'E7', 'Dm7', 'Am7', 'E7'], loops: 1, bpm: 80, style: 'ballad', genre: 'Blues', difficulty: 4, key: 'Am', tags: ['12-bar', 'minor'] },
  { title: 'Waltz in C', bars: ['C', 'F', 'C', 'G', 'C', 'F', 'G', 'C'], loops: 2, bpm: 108, num: 3, den: 4, style: 'waltz', genre: 'Folk', difficulty: 2, key: 'C', tags: ['3/4', 'waltz'] },
  { title: 'Ballad in 6/8 (D)', bars: ['D', 'Bm', 'G', 'A'], loops: 4, bpm: 60, num: 6, den: 8, style: 'ballad', genre: 'Pop', difficulty: 3, key: 'D', tags: ['6/8'] },
  { title: 'Power Chord Anthem in E', bars: ['E5', 'G5', 'A5', 'C5 D5'], loops: 4, bpm: 118, style: 'rock', genre: 'Rock', difficulty: 2, key: 'E', tags: ['power chords'] },
  {
    title: 'House of the Rising Sun (Chords)', bars: ['Am', 'C', 'D', 'F', 'Am', 'C', 'E', 'E'], loops: 2, bpm: 60, num: 6, den: 8, style: 'ballad', genre: 'Folk', difficulty: 3, key: 'Am', tags: ['traditional', 'arpeggio', '6/8'],
    description: 'Traditional American folk song. Play the famous arpeggio pattern in the fingerpicking track. Sing the melody yourself!',
  },
  { title: 'Slow 6/8 Arpeggio in C', bars: ['C', 'Am', 'C', 'Am', 'F', 'G', 'C', 'C'], loops: 2, bpm: 54, num: 6, den: 8, style: 'ballad', genre: 'Pop', difficulty: 3, key: 'C', tags: ['6/8', 'arpeggio'] },
  { title: 'Travis Picking in C', bars: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C'], loops: 2, bpm: 88, picking: 'travis', tracks: ['picking', 'chords'], style: 'folk', genre: 'Exercise', difficulty: 4, key: 'C', tags: ['fingerstyle', 'thumb independence'], description: 'Alternate your thumb between two bass strings while the fingers pick the top strings.' },
  { title: 'Fingerpicking Pattern in Am', bars: ['Am', 'Am', 'C', 'G', 'Am', 'Am', 'F', 'E'], loops: 2, bpm: 76, tracks: ['picking', 'chords'], style: 'ballad', genre: 'Exercise', difficulty: 3, key: 'Am', tags: ['fingerstyle', 'arpeggio'] },
  { title: 'Open Chord Changes Drill', bars: ['G', 'C', 'G', 'D', 'Em', 'C', 'Am', 'D'], loops: 2, bpm: 70, style: 'quarter', genre: 'Exercise', difficulty: 2, key: 'G', tags: ['chord changes', 'warm-up'], description: 'Slow quarter-note strums so you can concentrate on clean changes.' },
  { title: 'Rhythm Workout: Folk Pattern in E', bars: ['E', 'A', 'E', 'B7'], loops: 4, bpm: 96, style: 'folk', genre: 'Exercise', difficulty: 3, key: 'E', tags: ['D-DU-UDU'], description: 'The universal folk strumming pattern: down, down-up, up-down-up.' },
];

// ---------------------------------------------------------------------------
// Tab-based exercises
// ---------------------------------------------------------------------------
/** tab notation: string number as written on a tab (1 = high e ... 6 = low E). */
const n = (s: number, f: number, tech?: Tech[]): TabNote => ({ string: 6 - s, fret: f, ...(tech ? { tech } : {}) });

type Spec = [number, number, Tech[]?];
const line = (specs: Spec[], step = 0.5, start = 0): NoteEvent[] =>
  specs.map((s, i) => ({ beat: start + i * step, dur: step, notes: [n(s[0], s[1], s[2])], legato: !!s[2]?.some((t) => t === 'h' || t === 'p') }));

function exercise(o: { id: string; title: string; bpm: number; events: NoteEvent[]; difficulty: 1 | 2 | 3 | 4 | 5; tags?: string[]; description?: string; chords?: ChordMark[]; style?: Song['style']; kind?: Track['kind']; num?: number; den?: number; trackName?: string; genre?: string }): Song {
  const end = Math.max(...o.events.map((e) => e.beat + e.dur));
  const num = o.num ?? 4,
    den = o.den ?? 4;
  const bl = (num * 4) / den;
  return {
    id: o.id,
    title: o.title,
    artist: 'GuitarPlay',
    genre: o.genre ?? 'Exercise',
    difficulty: o.difficulty,
    bpm: o.bpm,
    beatsPerBar: num,
    beatUnit: den,
    tuning: STANDARD,
    capo: 0,
    tracks: [{ id: 'main', name: o.trackName ?? 'Exercise', kind: o.kind ?? 'lead', events: o.events }],
    chords: o.chords ?? [],
    lengthBeats: Math.ceil(end / bl) * bl,
    source: 'builtin',
    tags: o.tags ?? [],
    description: o.description,
    style: o.style,
    pickup: 0,
  };
}

const rev = <T,>(a: T[]) => [...a].reverse();

function spider(): NoteEvent[] {
  // 1-2-3-4 on each string, ascending strings from 6 to 1, then descending
  const out: Spec[] = [];
  for (let s = 6; s >= 1; s--) for (const f of [1, 2, 3, 4]) out.push([s, f]);
  const down: Spec[] = [];
  for (let s = 1; s <= 6; s++) for (const f of [4, 3, 2, 1]) down.push([s, f]);
  return line([...out, ...down], 0.5);
}

function scaleLine(positions: Spec[], upDown = true): Spec[] {
  return upDown ? [...positions, ...rev(positions).slice(1)] : positions;
}

const C_MAJOR_OPEN: Spec[] = [[5, 3], [4, 0], [4, 2], [4, 3], [3, 0], [3, 2], [2, 0], [2, 1], [1, 0], [1, 1], [1, 3]];
const G_MAJOR_2OCT: Spec[] = [[6, 3], [5, 0], [5, 2], [5, 3], [4, 0], [4, 2], [3, 0], [3, 2], [2, 0], [2, 1], [2, 3], [1, 0], [1, 2], [1, 3]];
const A_MIN_PENT_BOX1: Spec[] = [[6, 5], [6, 8], [5, 5], [5, 7], [4, 5], [4, 7], [3, 5], [3, 7], [2, 5], [2, 8], [1, 5], [1, 8]];
const E_MIN_PENT_BOX1: Spec[] = [[6, 0], [6, 3], [5, 0], [5, 2], [4, 0], [4, 2], [3, 0], [3, 2], [2, 0], [2, 3], [1, 0], [1, 3]];
const A_BLUES: Spec[] = [[6, 5], [6, 8], [5, 5], [5, 6], [5, 7], [4, 5], [4, 7], [3, 5], [3, 7], [2, 5], [2, 8], [1, 5], [1, 8]];

function boogie(rootStr: number, rootFret: number, bars: number): Spec[] {
  // root-5th-root-6th-root-b7-root-6th feel on two strings
  const r = rootStr,
    a = rootStr - 1;
  const out: Spec[] = [];
  for (let b = 0; b < bars; b++) out.push([r, rootFret], [a, rootFret + 2], [r, rootFret], [a, rootFret + 4], [r, rootFret], [a, rootFret + 5], [r, rootFret], [a, rootFret + 4]);
  return out;
}

function bluesBoogie(): Song {
  const form = [0, 0, 0, 0, 1, 1, 0, 0, 2, 1, 0, 2]; // I I I I IV IV I I V IV I V
  const specs: Spec[] = [];
  for (const deg of form) {
    if (deg === 0) specs.push(...boogie(6, 0, 1)); // E
    else if (deg === 1) specs.push(...boogie(5, 0, 1)); // A
    else specs.push(...boogie(5, 2, 1)); // B
  }
  const chords: ChordMark[] = form.map((d, i) => ({ beat: i * 4, dur: 4, name: ['E7', 'A7', 'B7'][d] }));
  return exercise({ id: 'blues-boogie-e', title: '12-Bar Blues Boogie in E', bpm: 96, events: line(specs, 0.5), difficulty: 3, chords, style: 'shuffle', genre: 'Blues', tags: ['12-bar', 'boogie', 'bass line'], description: 'Walking boogie bass line on the two lowest strings through the whole blues form.' });
}

export const EXERCISES: Song[] = [
  exercise({ id: 'open-strings', title: 'Open String Warm-up', bpm: 72, difficulty: 1, tags: ['warm-up', 'open strings'], description: 'Pick each open string cleanly: E A D G B e and back.', events: line([6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6].map((s) => [s, 0] as Spec), 1) }),
  exercise({ id: 'chromatic-spider', title: 'Chromatic Spider (1-2-3-4)', bpm: 80, difficulty: 2, tags: ['warm-up', 'dexterity', 'chromatic'], description: 'One finger per fret on every string, up and down. Classic finger-independence drill.', events: spider() }),
  exercise({ id: 'c-major-scale', title: 'C Major Scale (open position)', bpm: 88, difficulty: 1, tags: ['scale', 'major'], events: line(scaleLine(C_MAJOR_OPEN), 1) }),
  exercise({ id: 'g-major-scale-2oct', title: 'G Major Scale – Two Octaves', bpm: 92, difficulty: 2, tags: ['scale', 'major', 'two octaves'], events: line(scaleLine(G_MAJOR_2OCT), 0.5) }),
  exercise({ id: 'a-minor-pentatonic-1', title: 'A Minor Pentatonic – Box 1', bpm: 100, difficulty: 2, tags: ['scale', 'pentatonic', 'lead'], description: 'The shape behind thousands of solos. Fret 5 position.', events: line(scaleLine(A_MIN_PENT_BOX1), 0.5) }),
  exercise({ id: 'e-minor-pentatonic-1', title: 'E Minor Pentatonic – Open Position', bpm: 100, difficulty: 2, tags: ['scale', 'pentatonic', 'open position'], events: line(scaleLine(E_MIN_PENT_BOX1), 0.5) }),
  exercise({ id: 'a-blues-scale', title: 'A Blues Scale', bpm: 96, difficulty: 3, tags: ['scale', 'blues', 'blue note'], description: 'Pentatonic plus the blue note (b5) on the 6th fret of the A string.', events: line(scaleLine(A_BLUES), 0.5) }),
  exercise({
    id: 'hammer-pull-drill', title: 'Hammer-on & Pull-off Drill', bpm: 84, difficulty: 3, tags: ['legato', 'hammer-on', 'pull-off'],
    description: 'Pick only the first note of each pair – the second sounds from the left hand (legato).',
    events: line([[3, 7], [3, 9, ['h']], [3, 7, ['p']], [3, 5, ['p']], [2, 7], [2, 8, ['h']], [2, 7, ['p']], [2, 5, ['p']], [1, 5], [1, 7, ['h']], [1, 5, ['p']], [1, 3, ['p']], [2, 5], [2, 7, ['h']], [2, 5, ['p']], [3, 7]], 0.5),
  }),
  exercise({ id: 'alt-picking-16ths', title: 'Alternate Picking – 16th Notes', bpm: 70, difficulty: 3, tags: ['picking', 'speed', 'sixteenth notes'], description: 'Down-up-down-up on a single string. Start slow, build speed with the speed trainer.', events: line([...Array(16).fill(0).map(() => [2, 3] as Spec), ...Array(16).fill(0).map(() => [3, 2] as Spec)], 0.25) }),
  exercise({ id: 'string-skipping', title: 'String-Skipping Arpeggio', bpm: 76, difficulty: 4, tags: ['arpeggio', 'string skipping', 'picking accuracy'], events: line([[6, 3], [4, 0], [3, 0], [2, 3], [1, 3], [2, 3], [3, 0], [4, 0], [5, 3], [3, 0], [2, 0], [1, 0], [2, 0], [3, 0], [4, 2], [5, 3]], 0.5) }),
  bluesBoogie(),
  exercise({
    id: 'rock-riff-em', title: 'Rock Riff in E Minor', bpm: 112, difficulty: 3, tags: ['riff', 'rock', 'palm mute'], genre: 'Rock', style: 'rock',
    description: 'Driving eighth-note riff on the low strings. Palm-mute the open E for extra punch.',
    chords: [{ beat: 0, dur: 8, name: 'Em' }, { beat: 8, dur: 4, name: 'G' }, { beat: 12, dur: 4, name: 'D' }],
    events: line([[6, 0], [6, 0], [6, 3], [6, 0], [6, 0], [6, 5], [6, 3], [6, 0], [6, 0], [6, 0], [6, 3], [6, 0], [5, 2], [5, 2], [6, 5], [6, 3], [6, 3], [6, 3], [6, 5], [6, 3], [6, 3], [6, 7], [6, 5], [6, 3], [5, 0], [5, 0], [5, 2], [5, 0], [5, 0], [5, 4], [5, 2], [5, 0]], 0.5),
  }),
  exercise({
    id: 'pentatonic-lick-a', title: 'Pentatonic Lick in A Minor', bpm: 92, difficulty: 3, tags: ['lick', 'lead', 'pentatonic'], genre: 'Blues',
    description: 'A bluesy two-bar phrase. Pay attention to the rhythm: some notes are held.',
    events: [
      ...line([[1, 5], [1, 8], [1, 5], [2, 8], [2, 5], [3, 7]], 0.5, 0),
      { beat: 3, dur: 1, notes: [n(3, 5)] },
      ...line([[2, 8], [2, 5], [3, 7], [3, 5], [4, 7], [4, 5]], 0.5, 4),
      { beat: 7, dur: 1, notes: [n(5, 7)] },
      { beat: 8, dur: 2, notes: [n(5, 5)] },
    ],
    chords: [{ beat: 0, dur: 8, name: 'Am7' }, { beat: 8, dur: 2, name: 'Am7' }],
  }),
  exercise({
    id: 'spanish-study-em', title: 'Spanish Study in Em (Arpeggio)', bpm: 72, difficulty: 4, tags: ['classical', 'arpeggio', 'p-i-m-a'], genre: 'Classical',
    description: 'An original arpeggio study in the Spanish tradition: thumb on the bass, i-m-a on strings 3-2-1.',
    chords: [{ beat: 0, dur: 4, name: 'Em' }, { beat: 4, dur: 4, name: 'Am' }, { beat: 8, dur: 4, name: 'B7' }, { beat: 12, dur: 4, name: 'Em' }],
    events: [
      ...line([[6, 0], [3, 0], [2, 0], [1, 0], [2, 0], [3, 0], [6, 0], [3, 0]], 0.5, 0),
      ...line([[5, 0], [3, 2], [2, 1], [1, 0], [2, 1], [3, 2], [5, 0], [3, 2]], 0.5, 4),
      ...line([[5, 2], [4, 1], [3, 2], [1, 2], [3, 2], [4, 1], [5, 2], [4, 1]], 0.5, 8),
      ...line([[6, 0], [3, 0], [2, 0], [1, 0], [2, 0], [3, 0], [4, 2], [3, 0]], 0.5, 12),
    ],
  }),
  exercise({
    id: 'celtic-jig-d', title: 'Celtic Jig in D (Original)', bpm: 120, difficulty: 3, tags: ['6/8', 'celtic', 'melody'], genre: 'Folk', num: 6, den: 8, style: 'folk',
    description: 'A short original jig melody, picked on the top strings.',
    chords: [{ beat: 0, dur: 3, name: 'D' }, { beat: 3, dur: 3, name: 'G' }, { beat: 6, dur: 3, name: 'D' }, { beat: 9, dur: 3, name: 'A' }, { beat: 12, dur: 3, name: 'D' }, { beat: 15, dur: 3, name: 'G' }, { beat: 18, dur: 3, name: 'A' }, { beat: 21, dur: 3, name: 'D' }],
    events: line([
      [1, 2], [1, 2], [1, 3], [1, 2], [2, 3], [3, 2],
      [2, 3], [2, 3], [1, 0], [2, 3], [2, 0], [2, 3],
      [1, 2], [1, 2], [1, 3], [1, 2], [1, 0], [2, 3],
      [2, 2], [2, 0], [3, 2], [2, 2], [2, 0], [3, 2],
      [1, 2], [1, 3], [1, 5], [1, 3], [1, 2], [2, 3],
      [2, 3], [1, 0], [1, 3], [1, 0], [2, 3], [2, 0],
      [2, 2], [3, 2], [2, 2], [2, 0], [3, 2], [3, 0],
      [3, 2], [4, 0], [3, 2], [4, 0], [4, 0], [4, 0],
    ], 0.5),
  }),
];
