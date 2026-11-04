// Music theory helpers shared by the whole app.
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export const A4 = 440;
export const midiToFreq = (m: number, a4 = A4) => a4 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f: number, a4 = A4) => 69 + 12 * Math.log2(f / a4);
export const pc = (m: number) => ((Math.round(m) % 12) + 12) % 12;
export const noteName = (m: number, withOctave = true, flats = false) => {
  const r = Math.round(m);
  const n = (flats ? FLAT_NAMES : NOTE_NAMES)[pc(r)];
  return withOctave ? `${n}${Math.floor(r / 12) - 1}` : n;
};
export const centsOff = (m: number) => (m - Math.round(m)) * 100;

/** Tuning = MIDI numbers from lowest string (6th) to highest (1st). */
export interface Tuning {
  id: string;
  name: string;
  notes: number[];
}
export const TUNINGS: Tuning[] = [
  { id: 'standard', name: 'Standard (E A D G B e)', notes: [40, 45, 50, 55, 59, 64] },
  { id: 'dropd', name: 'Drop D (D A D G B e)', notes: [38, 45, 50, 55, 59, 64] },
  { id: 'dadgad', name: 'DADGAD', notes: [38, 45, 50, 55, 57, 62] },
  { id: 'halfdown', name: 'Half step down (Eb)', notes: [39, 44, 49, 54, 58, 63] },
  { id: 'fulldown', name: 'Full step down (D)', notes: [38, 43, 48, 53, 57, 62] },
  { id: 'opend', name: 'Open D (D A D F# A d)', notes: [38, 45, 50, 54, 57, 62] },
  { id: 'openg', name: 'Open G (D G D G B d)', notes: [38, 43, 50, 55, 59, 62] },
  { id: 'dropc', name: 'Drop C (C G C F A d)', notes: [36, 43, 48, 53, 57, 62] },
];
export const STANDARD = TUNINGS[0].notes;
export const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
export const tuningLabels = (t: number[]) => t.map((m, i) => (i === 5 ? noteName(m, false).toLowerCase() : noteName(m, false)));

export const STRING_COLORS = ['#ff5d73', '#ff9f43', '#ffd93d', '#4be08c', '#3ec9ff', '#a98bff'];

export const INTERVAL_NAMES = ['Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Octave'];

export const SCALES: Record<string, { name: string; steps: number[] }> = {
  major: { name: 'Major (Ionian)', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Natural Minor (Aeolian)', steps: [0, 2, 3, 5, 7, 8, 10] },
  majpent: { name: 'Major Pentatonic', steps: [0, 2, 4, 7, 9] },
  minpent: { name: 'Minor Pentatonic', steps: [0, 3, 5, 7, 10] },
  blues: { name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  dorian: { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  harmminor: { name: 'Harmonic Minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  melminor: { name: 'Melodic Minor', steps: [0, 2, 3, 5, 7, 9, 11] },
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** MIDI value of a tab note. `fret` is relative to the capo. */
export const tabMidi = (tuning: number[], capo: number, string: number, fret: number) => tuning[string] + capo + fret;

export function parsePitchClass(s: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]?)$/.exec(s.trim());
  if (!m) return null;
  const base: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  let v = base[m[1].toLowerCase()];
  if (m[2] === '#' || m[2] === '♯') v += 1;
  if (m[2] === 'b' || m[2] === '♭') v -= 1;
  return ((v % 12) + 12) % 12;
}
