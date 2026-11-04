import type { NoteEvent, Song, Track } from '../../core/types';
import { STANDARD } from '../../core/music';
import { fitOctave, fretChord, fretLine } from '../fretting';

interface MidiNote {
  tick: number;
  dur: number;
  pitch: number;
}
interface MidiTrack {
  name: string;
  notes: MidiNote[];
}

/** Minimal Standard MIDI File reader. */
export function parseMidi(buf: Uint8Array) {
  let p = 0;
  const u32 = () => ((buf[p++] << 24) | (buf[p++] << 16) | (buf[p++] << 8) | buf[p++]) >>> 0;
  const u16 = () => (buf[p++] << 8) | buf[p++];
  const vlq = () => {
    let v = 0,
      b;
    do {
      b = buf[p++];
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };
  const tag = () => String.fromCharCode(buf[p++], buf[p++], buf[p++], buf[p++]);
  if (tag() !== 'MThd') throw new Error('Not a MIDI file');
  u32();
  u16();
  const ntr = u16();
  const division = u16();
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  const tempos: { tick: number; mpq: number }[] = [];
  let num = 4,
    den = 4;
  const tracks: MidiTrack[] = [];
  for (let t = 0; t < ntr; t++) {
    if (tag() !== 'MTrk') throw new Error('Bad track chunk');
    const len = u32();
    const end = p + len;
    let tick = 0,
      status = 0,
      name = '';
    const open = new Map<number, number>();
    const notes: MidiNote[] = [];
    while (p < end) {
      tick += vlq();
      let b = buf[p];
      if (b & 0x80) {
        status = b;
        p++;
      } else b = status;
      const type = status & 0xf0;
      if (status === 0xff) {
        const mt = buf[p++];
        const l = vlq();
        if (mt === 0x51) tempos.push({ tick, mpq: (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2] });
        else if (mt === 0x58) {
          num = buf[p];
          den = 1 << buf[p + 1];
        } else if (mt === 0x03) name = new TextDecoder().decode(buf.slice(p, p + l));
        p += l;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
      } else if (type === 0x90 || type === 0x80) {
        const key = buf[p++],
          vel = buf[p++];
        const ch = status & 0x0f;
        if (ch === 9) continue; // drums
        if (type === 0x90 && vel > 0) open.set(key, tick);
        else if (open.has(key)) {
          notes.push({ tick: open.get(key)!, dur: tick - open.get(key)!, pitch: key });
          open.delete(key);
        }
      } else if (type === 0xc0 || type === 0xd0) p += 1;
      else p += 2;
    }
    p = end;
    tracks.push({ name, notes: notes.sort((a, b) => a.tick - b.tick) });
  }
  return { tracks, division, tempos, num, den };
}

/** Convert a MIDI file into a guitar tab song with automatic fretting. */
export function midiToSong(buf: Uint8Array, filename: string): Song {
  const m = parseMidi(buf);
  const cand = m.tracks.filter((t) => t.notes.length > 4);
  if (!cand.length) throw new Error('No note data found in this MIDI file.');
  const bpm = m.tempos.length ? Math.round(60000000 / m.tempos[0].mpq) : 100;
  const q = m.division;
  const tracks: Track[] = [];
  cand.slice(0, 6).forEach((t, k) => {
    // group notes by start tick into chords (max 6 voices)
    const groups: { beat: number; dur: number; pitches: number[] }[] = [];
    for (const n of t.notes) {
      const beat = n.tick / q;
      const g = groups[groups.length - 1];
      if (g && Math.abs(g.beat - beat) < 0.06) {
        if (g.pitches.length < 6) g.pitches.push(n.pitch);
        g.dur = Math.max(g.dur, n.dur / q);
      } else groups.push({ beat, dur: n.dur / q, pitches: [n.pitch] });
    }
    // avoid overlap: trim durations to next start
    groups.forEach((g, i) => {
      if (groups[i + 1]) g.dur = Math.min(g.dur, groups[i + 1].beat - g.beat);
    });
    const allP = groups.flatMap((g) => g.pitches);
    const shift = fitOctave(allP, STANDARD);
    const mono = groups.every((g) => g.pitches.length === 1);
    const events: NoteEvent[] = [];
    if (mono) {
      const fr = fretLine(groups.map((g) => g.pitches[0] + shift), { tuning: STANDARD });
      groups.forEach((g, i) => fr[i] && events.push({ beat: g.beat, dur: g.dur, notes: [{ string: fr[i]!.string, fret: fr[i]!.fret }] }));
    } else {
      for (const g of groups) {
        const notes = fretChord(g.pitches.map((p) => p + shift), { tuning: STANDARD });
        if (notes.length) events.push({ beat: g.beat, dur: g.dur, notes });
      }
    }
    if (events.length) tracks.push({ id: `t${k + 1}`, name: t.name || `Track ${k + 1}`, kind: 'other', events });
  });
  if (!tracks.length) throw new Error('Could not convert any track to guitar tab.');
  const last = Math.max(...tracks.map((t) => t.events[t.events.length - 1].beat + t.events[t.events.length - 1].dur));
  return {
    id: `import-midi-${Date.now().toString(36)}`,
    title: filename.replace(/\.[^.]+$/, ''),
    artist: 'Imported (MIDI)',
    genre: 'Imported',
    difficulty: 3,
    bpm,
    beatsPerBar: m.num,
    beatUnit: m.den,
    tuning: STANDARD,
    capo: 0,
    tracks,
    chords: [],
    lengthBeats: Math.ceil(last),
    source: 'user',
    tags: ['imported', 'midi'],
    pickup: 0,
    createdAt: Date.now(),
  };
}
