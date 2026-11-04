import { NOTE_NAMES, FLAT_NAMES, parsePitchClass, STANDARD } from '../core/music';

/** Frets per string (low E -> high e). -1 = muted. */
export type Shape = number[];

export interface ChordInfo {
  name: string;
  root: number; // pitch class
  quality: string;
  bass?: number;
  shape: Shape;
  /** first fret shown in diagrams */
  baseFret: number;
}

const QUALITY_ALIASES: Record<string, string> = {
  '': 'maj', maj: 'maj', M: 'maj',
  m: 'm', min: 'm', '-': 'm',
  '7': '7', dom7: '7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  maj7: 'maj7', M7: 'maj7', '△7': 'maj7', '△': 'maj7',
  sus4: 'sus4', sus: 'sus4', sus2: 'sus2',
  '5': '5', '6': '6', m6: 'm6',
  dim: 'dim', o: 'dim', dim7: 'dim7', '°': 'dim', '°7': 'dim7',
  aug: 'aug', '+': 'aug', m7b5: 'm7b5', 'ø': 'm7b5',
  add9: 'add9', '9': '9', m9: 'm9', '7sus4': '7sus4', maj9: 'maj9',
};

export const QUALITY_LABEL: Record<string, string> = {
  maj: '', m: 'm', '7': '7', m7: 'm7', maj7: 'maj7', sus4: 'sus4', sus2: 'sus2', '5': '5', '6': '6', m6: 'm6', dim: 'dim', dim7: 'dim7',
  aug: 'aug', m7b5: 'm7b5', add9: 'add9', '9': '9', m9: 'm9', '7sus4': '7sus4', maj9: 'maj9',
};

// Open / commonly used first-position shapes (keyed by "<root><quality>")
const OPEN: Record<string, Shape> = {
  C: [-1, 3, 2, 0, 1, 0], D: [-1, -1, 0, 2, 3, 2], E: [0, 2, 2, 1, 0, 0], F: [1, 3, 3, 2, 1, 1], G: [3, 2, 0, 0, 0, 3], A: [-1, 0, 2, 2, 2, 0], B: [-1, 2, 4, 4, 4, 2],
  Am: [-1, 0, 2, 2, 1, 0], Bm: [-1, 2, 4, 4, 3, 2], Cm: [-1, 3, 5, 5, 4, 3], Dm: [-1, -1, 0, 2, 3, 1], Em: [0, 2, 2, 0, 0, 0], Fm: [1, 3, 3, 1, 1, 1], Gm: [3, 5, 5, 3, 3, 3],
  C7: [-1, 3, 2, 3, 1, 0], D7: [-1, -1, 0, 2, 1, 2], E7: [0, 2, 0, 1, 0, 0], G7: [3, 2, 0, 0, 0, 1], A7: [-1, 0, 2, 0, 2, 0], B7: [-1, 2, 1, 2, 0, 2],
  Am7: [-1, 0, 2, 0, 1, 0], Dm7: [-1, -1, 0, 2, 1, 1], Em7: [0, 2, 0, 0, 0, 0], Bm7: [-1, 2, 0, 2, 0, 2],
  Cmaj7: [-1, 3, 2, 0, 0, 0], Dmaj7: [-1, -1, 0, 2, 2, 2], Fmaj7: [-1, -1, 3, 2, 1, 0], Gmaj7: [3, 2, 0, 0, 0, 2], Amaj7: [-1, 0, 2, 1, 2, 0], Emaj7: [0, 2, 1, 1, 0, 0],
  Asus2: [-1, 0, 2, 2, 0, 0], Asus4: [-1, 0, 2, 2, 3, 0], Dsus2: [-1, -1, 0, 2, 3, 0], Dsus4: [-1, -1, 0, 2, 3, 3], Esus4: [0, 2, 2, 2, 0, 0], Gsus4: [3, 3, 0, 0, 1, 3],
  Cadd9: [-1, 3, 2, 0, 3, 0], Gadd9: [3, 0, 0, 2, 0, 3], Dadd9: [-1, -1, 0, 2, 3, 0], G6: [3, 2, 0, 0, 0, 0], C6: [-1, 3, 2, 2, 1, 0], A6: [-1, 0, 2, 2, 2, 2], E6: [0, 2, 2, 1, 2, 0],
  E5: [0, 2, 2, -1, -1, -1], A5: [-1, 0, 2, 2, -1, -1], D5: [-1, -1, 0, 2, 3, -1], G5: [3, 5, 5, -1, -1, -1], C5: [-1, 3, 5, 5, -1, -1],
  B7sus4: [-1, 2, 2, 2, 0, 2], E9: [0, 2, 0, 1, 0, 2], A9: [-1, 0, 2, 4, 2, 3], G9: [3, 0, 0, 2, 0, 1],
  Fdim: [1, 2, 3, 1, -1, -1], Bdim: [-1, 2, 3, 4, 3, -1], Ddim: [-1, -1, 0, 1, 3, 1], Cdim: [-1, 3, 4, 2, 4, -1],
  Edim7: [0, 1, 2, 0, 2, -1], Cdim7: [-1, 3, 4, 2, 4, 2],
  Caug: [-1, 3, 2, 1, 1, 0], Eaug: [0, 3, 2, 1, 1, 0], Gaug: [3, 2, 1, 0, 0, 3],
  Bm7b5: [-1, 2, 3, 2, 3, -1], Am7b5: [-1, 0, 1, 0, 1, -1],
  'D/F#': [2, 0, 0, 2, 3, 2], 'G/B': [-1, 2, 0, 0, 0, 3], 'C/G': [3, 3, 2, 0, 1, 0], 'C/E': [0, 3, 2, 0, 1, 0], 'A/C#': [-1, 4, 2, 2, 2, 0], 'Am/G': [3, 0, 2, 2, 1, 0], 'Em/B': [-1, 2, 2, 0, 0, 0], 'E/G#': [4, 2, 2, 1, 0, 0], 'F/C': [-1, 3, 3, 2, 1, 1], 'Am/E': [0, 0, 2, 2, 1, 0], 'D/A': [-1, 0, 0, 2, 3, 2], 'G/D': [-1, -1, 0, 0, 0, 3], 'C/B': [-1, 2, 2, 0, 1, 0],
};

// moveable templates, fret offsets from the barre fret
const E_SHAPES: Record<string, Shape> = {
  maj: [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, 2, 1, 1, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0], '5': [0, 2, 2, -1, -1, -1], '6': [0, 2, 2, 1, 2, 0], '9': [0, 2, 0, 1, 0, 2], m6: [0, 2, 2, 0, 2, 0],
  aug: [0, 3, 2, 1, 1, 0], dim: [0, 1, 2, 0, -1, -1], '7sus4': [0, 2, 0, 2, 0, 0], add9: [0, 2, 4, 1, 0, 0],
};
const A_SHAPES: Record<string, Shape> = {
  maj: [-1, 0, 2, 2, 2, 0], m: [-1, 0, 2, 2, 1, 0], '7': [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0], maj7: [-1, 0, 2, 1, 2, 0],
  sus4: [-1, 0, 2, 2, 3, 0], sus2: [-1, 0, 2, 2, 0, 0], '5': [-1, 0, 2, 2, -1, -1], '6': [-1, 0, 2, 2, 2, 2], '9': [-1, 0, 2, 4, 2, 3], dim: [-1, 0, 1, 2, 1, -1],
  add9: [-1, 0, 2, 4, 2, 0], m6: [-1, 0, 2, 2, 1, 2], m9: [-1, 0, 2, 4, 1, 0], maj9: [-1, 0, 2, 1, 0, 0], m7b5: [-1, 0, 1, 0, 1, -1], dim7: [-1, 0, 1, 2, 1, 2],
  aug: [-1, 0, 3, 2, 2, -1], '7sus4': [-1, 0, 2, 0, 3, 0],
};

export function pcName(pc: number, flats = false) {
  return (flats ? FLAT_NAMES : NOTE_NAMES)[((pc % 12) + 12) % 12];
}

export function parseChordName(name: string): { root: number; quality: string; bass?: number; rootStr: string } | null {
  const m = /^([A-G][#b♯♭]?)([^/]*)(?:\/([A-G][#b♯♭]?))?$/.exec(name.trim());
  if (!m) return null;
  const root = parsePitchClass(m[1]);
  if (root == null) return null;
  const qRaw = m[2];
  const quality = QUALITY_ALIASES[qRaw];
  if (quality === undefined) return null;
  const bass = m[3] ? parsePitchClass(m[3]) ?? undefined : undefined;
  return { root, quality, bass, rootStr: m[1] };
}

const cache = new Map<string, ChordInfo | null>();

function openKey(root: number, q: string): string[] {
  const keys: string[] = [];
  for (const flats of [false, true]) {
    const rn = pcName(root, flats);
    const qs = q === 'maj' ? '' : q;
    keys.push(rn + qs);
  }
  return keys;
}

export function chordInfo(name: string): ChordInfo | null {
  if (cache.has(name)) return cache.get(name)!;
  const info = buildChord(name);
  cache.set(name, info);
  return info;
}

function buildChord(name: string): ChordInfo | null {
  const p = parseChordName(name);
  if (!p) return null;
  const { root, quality, bass } = p;
  let shape: Shape | undefined;
  if (bass !== undefined) {
    // slash chord: explicit entry, else fall back to the plain chord
    for (const k of [name.replace('♯', '#').replace('♭', 'b')]) if (OPEN[k]) shape = OPEN[k];
  }
  if (!shape) {
    for (const k of openKey(root, quality)) if (OPEN[k]) { shape = OPEN[k]; break; }
  }
  if (!shape) {
    const cands: { shape: Shape; barre: number }[] = [];
    const e = E_SHAPES[quality];
    if (e) {
      const b = (root - 4 + 12) % 12;
      cands.push({ shape: e.map((f) => (f < 0 ? -1 : f + b)), barre: b === 0 ? 12 : b });
    }
    const a = A_SHAPES[quality];
    if (a) {
      const b = (root - 9 + 12) % 12;
      cands.push({ shape: a.map((f) => (f < 0 ? -1 : f + b)), barre: b === 0 ? 12 : b });
    }
    cands.sort((x, y) => x.barre - y.barre);
    if (cands.length) shape = cands[0].shape;
  }
  if (!shape) return null;
  const fretted = shape.filter((f) => f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const maxF = fretted.length ? Math.max(...fretted) : 1;
  const baseFret = maxF <= 4 ? 1 : minF;
  return { name, root, quality, bass, shape, baseFret };
}

/** Notes (string, fret) of a chord shape; only sounding strings. */
export function shapeNotes(shape: Shape) {
  const out: { string: number; fret: number }[] = [];
  shape.forEach((f, s) => {
    if (f >= 0) out.push({ string: s, fret: f });
  });
  return out;
}

export function shapeMidis(shape: Shape, tuning = STANDARD, capo = 0) {
  return shapeNotes(shape).map((n) => tuning[n.string] + capo + n.fret);
}

export const ROOTS_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const ROOT_FLAT_PREF = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const BROWSER_QUALITIES = ['maj', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'add9', '6', '5', 'dim', 'aug', '9', 'm7b5'];
export const chordLabel = (root: string, q: string) => root + (QUALITY_LABEL[q] ?? q);

/** Roman numeral / diatonic helpers for lessons */
export function diatonicChords(keyRoot: number, minor = false): string[] {
  const major = [0, 2, 4, 5, 7, 9, 11];
  const qm = ['', 'm', 'm', '', '', 'm', 'dim'];
  const natMinor = [0, 2, 3, 5, 7, 8, 10];
  const qn = ['m', 'dim', '', 'm', 'm', '', ''];
  const steps = minor ? natMinor : major;
  const q = minor ? qn : qm;
  return steps.map((s, i) => pcName(keyRoot + s, true) + q[i]);
}
