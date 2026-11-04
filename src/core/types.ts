export type Tech = 'h' | 'p' | 's' | 'b' | 'v' | 'pm' | 'x' | 'gh' | 'tap' | 'slap';

export interface TabNote {
  /** 0 = lowest string (6th), 5 = highest (1st). */
  string: number;
  /** Fret relative to capo; 0 = open. */
  fret: number;
  tech?: Tech[];
  /** Tied to previous note: no new attack required. */
  tie?: boolean;
  /** Dead / muted note — displayed but never judged. */
  dead?: boolean;
}

export interface NoteEvent {
  /** Position in quarter-note beats from the start of the song. */
  beat: number;
  dur: number;
  notes: TabNote[];
  chord?: string;
  strum?: 'd' | 'u';
  /** Event is a legato (hammer/pull) so no fresh pick attack is required. */
  legato?: boolean;
}

export type TrackKind = 'melody' | 'chords' | 'picking' | 'lead' | 'rhythm' | 'bass' | 'other';
export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  events: NoteEvent[];
}

export interface ChordMark {
  beat: number;
  dur: number;
  name: string;
}

export interface TempoPoint {
  beat: number;
  bpm: number;
}

export type Genre = 'Folk' | 'Classical' | 'Christmas' | 'Children' | 'Blues' | 'Rock' | 'Pop' | 'Country' | 'German' | 'World' | 'Exercise' | 'Imported' | 'Custom';

export interface Song {
  id: string;
  title: string;
  artist: string;
  genre: Genre | string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  bpm: number;
  tempoMap?: TempoPoint[];
  beatsPerBar: number;
  beatUnit: number;
  tuning: number[];
  capo: number;
  key?: string;
  tracks: Track[];
  chords: ChordMark[];
  lengthBeats: number;
  source: 'builtin' | 'user';
  tags?: string[];
  description?: string;
  /** Backing band style hint. */
  style?: 'quarter' | 'rock' | 'folk' | 'ballad' | 'waltz' | 'shuffle' | 'reggae' | 'none' | 'march' | 'latin';
  sheetIds?: string[];
  createdAt?: number;
  /** Length of an anacrusis in beats; first full bar starts here. */
  pickup?: number;
}

export interface SongMeta {
  id: string;
  title: string;
  artist: string;
  genre: string;
  difficulty: number;
  source: 'builtin' | 'user';
  tags: string[];
  tracks: { id: string; name: string; kind: TrackKind }[];
}
