import type { ChordMark, NoteEvent, Song, Track } from '../core/types';
import { NOTE_NAMES, SCALES, STANDARD, parsePitchClass } from '../core/music';
import { progressionSong, type ProgEntry } from './library/generated';
import { fretLine } from './fretting';
import { pcName } from './chords';

// ---------------------------------------------------------------------------
// Roman-numeral progression builder ("Jam builder")
// ---------------------------------------------------------------------------
const DEGREE: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };

export interface Roman {
  semitone: number;
  minor: boolean;
  suffix: string;
}

export function parseRoman(tok: string): Roman | null {
  const m = /^([b#]?)([ivIV]+)(°|dim|maj7|m7|7|sus4|sus2|add9|6|5)?$/.exec(tok.trim());
  if (!m) return null;
  const up = m[2].toUpperCase();
  if (!(up in DEGREE)) return null;
  let semi = DEGREE[up];
  if (m[1] === 'b') semi -= 1;
  if (m[1] === '#') semi += 1;
  const minor = m[2] === m[2].toLowerCase();
  let suffix = m[3] ?? '';
  if (suffix === '°') suffix = 'dim';
  return { semitone: (semi + 12) % 12, minor, suffix };
}

const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm']);

export function romanToChords(keyName: string, minorKey: boolean, numerals: string[]): string[] {
  const tonic = parsePitchClass(keyName) ?? 0;
  const flats = FLAT_KEYS.has(keyName) || FLAT_KEYS.has(keyName + (minorKey ? 'm' : ''));
  const out: string[] = [];
  for (const tok of numerals) {
    const r = parseRoman(tok);
    if (!r) continue;
    // minor keys are written relative to the natural minor (i, III, iv, v, VI, VII)
    const base = minorKey ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    let semi = r.semitone;
    if (minorKey) {
      const idx = Object.values(DEGREE).indexOf(r.semitone);
      if (idx >= 0) semi = base[idx];
    }
    const root = pcName(tonic + semi, flats);
    let q = r.suffix;
    if (r.minor && (q === '' || q === '7' || q === 'maj7')) q = 'm' + (q === 'maj7' ? 'maj7' : q);
    if (r.minor && q === 'dim') q = 'dim';
    out.push(root + q);
  }
  return out;
}

export interface JamOpts {
  key: string;
  minor: boolean;
  numerals: string[];
  bpm: number;
  style: NonNullable<Song['style']>;
  loops: number;
  barsPerChord?: number;
  num?: number;
  den?: number;
  picking?: 'arp' | 'travis';
  title?: string;
}

export function buildJam(o: JamOpts): Song {
  const chords = romanToChords(o.key, o.minor, o.numerals);
  const bars = chords.flatMap((c) => Array(o.barsPerChord ?? 1).fill(c));
  const entry: ProgEntry = {
    title: o.title ?? `Jam: ${o.numerals.join(' ')} in ${o.key}${o.minor ? ' minor' : ''}`,
    bars,
    loops: o.loops,
    bpm: o.bpm,
    num: o.num ?? 4,
    den: o.den ?? 4,
    style: o.style,
    genre: 'Custom',
    difficulty: 3,
    picking: o.picking,
    key: o.key + (o.minor ? 'm' : ''),
    tags: ['jam builder'],
    id: `jam-${Date.now().toString(36)}`,
    description: `Chords: ${chords.join(' – ')}`,
  };
  const s = progressionSong(entry);
  s.source = 'user';
  return s;
}

// ---------------------------------------------------------------------------
// Scale practice songs
// ---------------------------------------------------------------------------
export interface ScaleOpts {
  root: number; // pitch class
  scale: keyof typeof SCALES;
  /** lowest fret to use (0 = open position) */
  position: number;
  span?: number;
  bpm: number;
  pattern: 'updown' | 'up' | 'thirds' | 'sequence4';
}

export function scaleMidis(root: number, scale: keyof typeof SCALES, low: number, high: number): number[] {
  const steps = SCALES[scale].steps;
  const out: number[] = [];
  for (let m = low; m <= high; m++) if (steps.includes(((m - root) % 12 + 12) % 12)) out.push(m);
  return out;
}

export function buildScaleSong(o: ScaleOpts): Song {
  const span = o.span ?? 4;
  const lo = o.position === 0 ? 0 : o.position;
  const hi = lo + span;
  // collect all scale notes reachable within the fret window
  const notes = new Set<number>();
  STANDARD.forEach((open) => {
    for (let f = lo; f <= hi; f++) notes.add(open + f);
  });
  const avail = [...notes].sort((a, b) => a - b);
  const steps = SCALES[o.scale].steps;
  const inScale = avail.filter((m) => steps.includes((((m - o.root) % 12) + 12) % 12));
  // start on the lowest root
  const start = inScale.findIndex((m) => ((m - o.root) % 12 + 12) % 12 === 0);
  const seq0 = inScale.slice(Math.max(0, start));
  let seq = [...seq0];
  if (o.pattern === 'updown') seq = [...seq0, ...[...seq0].reverse().slice(1)];
  else if (o.pattern === 'thirds') {
    const up: number[] = [];
    for (let i = 0; i + 2 < seq0.length; i++) up.push(seq0[i], seq0[i + 2]);
    seq = [...up, ...[...up].reverse()];
  } else if (o.pattern === 'sequence4') {
    const up: number[] = [];
    for (let i = 0; i + 3 < seq0.length; i++) up.push(seq0[i], seq0[i + 1], seq0[i + 2], seq0[i + 3]);
    seq = up;
  }
  const fretted = fretLine(seq, { tuning: STANDARD, capo: 0, maxFret: hi, minFret: lo });
  const events: NoteEvent[] = [];
  fretted.forEach((f, i) => {
    if (f) events.push({ beat: i * 0.5, dur: 0.5, notes: [{ string: f.string, fret: f.fret }] });
  });
  const len = Math.ceil((events.length * 0.5) / 4) * 4;
  const name = `${NOTE_NAMES[o.root]} ${SCALES[o.scale].name}`;
  const track: Track = { id: 'main', name: 'Scale', kind: 'lead', events };
  const root = NOTE_NAMES[o.root];
  void root;
  return {
    id: `scale-${NOTE_NAMES[o.root]}-${o.scale}-${o.position}-${o.pattern}`.replace('#', 's'),
    title: `${name} (fret ${lo}–${hi})`,
    artist: 'GuitarPlay',
    genre: 'Exercise',
    difficulty: 3,
    bpm: o.bpm,
    beatsPerBar: 4,
    beatUnit: 4,
    tuning: STANDARD,
    capo: 0,
    tracks: [track],
    chords: [],
    lengthBeats: len,
    source: 'user',
    tags: ['scale'],
    pickup: 0,
  };
}

// ---------------------------------------------------------------------------
// Chord change drill
// ---------------------------------------------------------------------------
export function buildChordDrill(chords: string[], bpm: number, style: Song['style'] = 'quarter', title?: string, barsEach = 1): Song {
  const s = progressionSong({
    title: title ?? `Chord Drill: ${chords.join(' – ')}`,
    bars: chords.flatMap((c) => Array(barsEach).fill(c)),
    loops: 2,
    bpm,
    style,
    genre: 'Exercise',
    difficulty: 2,
    tracks: ['chords'],
    id: `drill-${chords.join('-')}-${bpm}`.replace(/[#/]/g, 's'),
  });
  s.source = 'user';
  return s;
}

export function singleChordSong(chord: string, bpm = 70, bars = 4): Song {
  return buildChordDrill([chord], bpm, 'quarter', `Hold ${chord}`, bars);
}

export type { ChordMark };
