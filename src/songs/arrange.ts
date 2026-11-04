import type { ChordMark, NoteEvent, Song, TabNote, Track } from '../core/types';
import { STANDARD } from '../core/music';
import { parseAbc, type AbcTune } from './abc';
import { chordInfo, shapeNotes, parseChordName } from './chords';
import { fitOctave, fretChord, fretLine } from './fretting';

export interface LibraryEntry {
  abc: string;
  genre: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  style?: Song['style'];
  id?: string;
  tags?: string[];
  description?: string;
  capo?: number;
  /** Which tracks to generate (default: melody, chords, picking). */
  tracks?: ('melody' | 'chords' | 'picking')[];
  /** Octave shift for melody in semitones (override auto). */
  octave?: number;
  /** Picking pattern style for the fingerpicking track. */
  picking?: 'arp' | 'travis';
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const barBeats = (s: Pick<Song, 'beatsPerBar' | 'beatUnit'>) => (s.beatsPerBar * 4) / s.beatUnit;

type StrumStep = { at: number; dir: 'd' | 'u'; strings?: 'all' | 'top' | 'bass' };

function strumPattern(num: number, den: number, style?: Song['style']): StrumStep[] {
  const D = (at: number, strings: StrumStep['strings'] = 'all'): StrumStep => ({ at, dir: 'd', strings });
  const U = (at: number): StrumStep => ({ at, dir: 'u', strings: 'top' });
  if (den === 8 && num % 3 === 0) {
    const bars = num / 3; // groups of dotted quarter
    const out: StrumStep[] = [];
    for (let g = 0; g < bars; g++) {
      const o = g * 1.5;
      if (style === 'ballad') out.push(D(o));
      else out.push(D(o), U(o + 0.75));
    }
    return out;
  }
  if (num === 3 && den === 4) return style === 'ballad' ? [D(0), D(1.5, 'top'), D(2, 'top')] : [D(0), D(1, 'top'), D(2, 'top')];
  if (num === 2) return [D(0), D(1)];
  if (num === 4 && den === 4) {
    switch (style) {
      case 'ballad':
        return [D(0), D(2)];
      case 'folk':
        return [D(0), D(1), U(1.5), U(2.5), D(3), U(3.5)];
      case 'rock':
        return [D(0), U(0.5), D(1), U(1.5), D(2), U(2.5), D(3), U(3.5)];
      case 'reggae':
        return [U(0.5), U(1.5), U(2.5), U(3.5)];
      case 'shuffle':
        return [D(0), D(1), D(2), D(3)];
      case 'march':
        return [D(0), D(1), D(2), D(3)];
      default:
        return [D(0), D(1), D(2), D(3)];
    }
  }
  // generic: down on each beat
  const bl = (num * 4) / den;
  const out: StrumStep[] = [];
  for (let b = 0; b < bl; b++) out.push(D(b));
  return out;
}

function chordNotesFor(name: string, which: StrumStep['strings'] = 'all'): TabNote[] {
  const info = chordInfo(name);
  if (!info) return [];
  let ns = shapeNotes(info.shape).map((n) => ({ string: n.string, fret: n.fret }));
  if (which === 'top') ns = ns.filter((n) => n.string >= 2).length >= 3 ? ns.filter((n) => n.string >= 2) : ns;
  if (which === 'bass') ns = ns.slice(0, 2);
  return ns;
}

export function chordAt(chords: ChordMark[], beat: number): ChordMark | undefined {
  let r: ChordMark | undefined;
  for (const c of chords) if (c.beat <= beat + 1e-6 && beat < c.beat + c.dur - 1e-6) r = c;
  return r;
}

export function makeChordTrack(chords: ChordMark[], num: number, den: number, style: Song['style'], pickup: number, length: number): NoteEvent[] {
  const bl = (num * 4) / den;
  const pat = strumPattern(num, den, style);
  const events: NoteEvent[] = [];
  // pickup: no strum; first full bar begins at `pickup`
  for (let barStart = pickup; barStart < length - 1e-6; barStart += bl) {
    for (const st of pat) {
      const at = barStart + st.at;
      if (at >= length - 1e-6) continue;
      const ch = chordAt(chords, at);
      if (!ch) continue;
      const notes = chordNotesFor(ch.name, st.strings);
      if (notes.length) events.push({ beat: at, dur: 0.5, notes, chord: ch.name, strum: st.dir });
    }
  }
  for (let i = 0; i < events.length; i++) {
    const nxt = events[i + 1];
    events[i].dur = nxt ? Math.max(0.25, nxt.beat - events[i].beat) : Math.min(bl, length - events[i].beat);
  }
  return events;
}

export function makePickingTrack(chords: ChordMark[], num: number, den: number, pickup: number, length: number, mode: 'arp' | 'travis' = 'arp'): NoteEvent[] {
  const bl = (num * 4) / den;
  const step = 0.5;
  const nSteps = Math.round(bl / step);
  const events: NoteEvent[] = [];
  for (let barStart = pickup; barStart < length - 1e-6; barStart += bl) {
    for (let k = 0; k < nSteps; k++) {
      const at = barStart + k * step;
      if (at >= length - 1e-6) break;
      const ch = chordAt(chords, at);
      if (!ch) continue;
      const info = chordInfo(ch.name);
      if (!info) continue;
      const S = shapeNotes(info.shape);
      if (S.length < 3) continue;
      const bass = S[0];
      const alt = S.length > 4 ? S[1] : S[0];
      const hi = S.slice(-3);
      let pick: { string: number; fret: number } | undefined;
      const pat4 = mode === 'travis' ? [bass, hi[1], alt, hi[2], bass, hi[1], alt, hi[2]] : [bass, hi[0], hi[1], hi[2], alt, hi[0], hi[1], hi[2]];
      const pat3 = [bass, hi[0], hi[1], alt, hi[1], hi[0]];
      const pat2 = [bass, hi[0], hi[1], hi[0]];
      const pat = nSteps === 8 ? pat4 : nSteps === 6 ? pat3 : nSteps === 4 ? pat2 : pat4;
      pick = pat[k % pat.length];
      events.push({ beat: at, dur: step, notes: [{ string: pick.string, fret: pick.fret }], chord: k === 0 ? ch.name : undefined });
    }
  }
  for (let i = 0; i < events.length; i++) {
    const nxt = events[i + 1];
    events[i].dur = nxt ? Math.max(0.25, Math.min(1, nxt.beat - events[i].beat)) : 0.5;
  }
  return events;
}

export function buildSong(entry: LibraryEntry, tune: AbcTune = parseAbc(entry.abc)): Song {
  const tuning = STANDARD;
  const capo = entry.capo ?? 0;
  const id = entry.id ?? slug(tune.title);
  const length = Math.ceil(tune.lengthBeats - 1e-6);
  const chords: ChordMark[] = tune.chords.map((c, i) => ({ beat: c.beat, name: c.name, dur: (tune.chords[i + 1]?.beat ?? tune.lengthBeats) - c.beat }));
  const want = entry.tracks ?? (chords.length ? ['melody', 'chords', 'picking'] : ['melody']);
  const tracks: Track[] = [];

  if (want.includes('melody')) {
    const mel = tune.items.filter((it) => it.pitches.length);
    const singles = mel.map((it) => it.pitches[it.pitches.length - 1]);
    const shift = entry.octave ?? fitOctave(singles, tuning, capo);
    const fretted = fretLine(
      mel.map((it) => it.pitches[it.pitches.length - 1] + shift),
      { tuning, capo },
    );
    const events: NoteEvent[] = [];
    mel.forEach((it, i) => {
      let notes: TabNote[];
      if (it.pitches.length > 1) notes = fretChord(it.pitches.map((p) => p + shift), { tuning, capo });
      else {
        const f = fretted[i];
        notes = f ? [{ string: f.string, fret: f.fret }] : [];
      }
      if (notes.length) events.push({ beat: it.beat, dur: it.dur, notes });
    });
    tracks.push({ id: 'melody', name: 'Melody', kind: 'melody', events });
  }
  if (chords.length && want.includes('chords')) {
    tracks.push({ id: 'chords', name: 'Chords (strumming)', kind: 'chords', events: makeChordTrack(chords, tune.meterNum, tune.meterDen, entry.style, tune.pickup, length) });
  }
  if (chords.length && want.includes('picking')) {
    tracks.push({ id: 'picking', name: 'Fingerpicking', kind: 'picking', events: makePickingTrack(chords, tune.meterNum, tune.meterDen, tune.pickup, length, entry.picking) });
  }
  return {
    id,
    title: tune.title,
    artist: tune.composer || 'Traditional',
    genre: entry.genre,
    difficulty: entry.difficulty,
    bpm: tune.bpm,
    beatsPerBar: tune.meterNum,
    beatUnit: tune.meterDen,
    tuning,
    capo,
    key: tune.key,
    tracks,
    chords,
    lengthBeats: length + (tune.pickup ? 0 : 0),
    source: 'builtin',
    tags: entry.tags ?? [],
    description: entry.description,
    style: entry.style,
    pickup: tune.pickup,
  };
}

export function chordRoot(name: string) {
  return parseChordName(name)?.root;
}
