import type { NoteEvent, Song, TabNote, Tech, Track, ChordMark } from '../../core/types';
import { STANDARD } from '../../core/music';
import { slug } from '../arrange';

/** Parsed (but not yet saved) result of an import, possibly with several tracks to choose from. */
export interface ImportResult {
  song: Song;
  info: string[];
}

interface AtNote {
  string: number;
  fret: number;
  isDead: boolean;
  isTieDestination: boolean;
  isHammerPullOrigin: boolean;
  isHammerPullDestination?: boolean;
  isStaccato: boolean;
  isPalmMute: boolean;
  slideOutType: number;
  slideInType: number;
  bendType: number;
  vibrato: number;
  isLetRing: boolean;
  isGhost?: boolean;
  isTrill?: boolean;
  harmonicType?: number;
}

/** Load a Guitar Pro (3-7) / MusicXML / alphaTex file with alphaTab and convert guitar tracks to our Song model. */
export async function importWithAlphaTab(bytes: Uint8Array, filename: string): Promise<ImportResult> {
  const at = await import('@coderline/alphatab');
  const settings = new at.Settings();
  let score;
  if (/\.(atex|alphatex)$/i.test(filename)) {
    const imp = new at.importer.AlphaTexImporter();
    imp.initFromString(new TextDecoder().decode(bytes), settings);
    score = imp.readScore();
  } else {
    score = at.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  }
  const info: string[] = [];
  const masterBars = score.masterBars;
  // --- unfold repeats into an ordered list of master bars ---
  const order: number[] = [];
  let i = 0,
    repStart = 0,
    pass = 1,
    guard = 0;
  while (i < masterBars.length && guard++ < 20000) {
    const mb = masterBars[i];
    if (mb.isRepeatStart) {
      if (repStart !== i) pass = 1;
      repStart = i;
    }
    if (mb.alternateEndings && mb.alternateEndings !== 0 && !(mb.alternateEndings & (1 << (pass - 1)))) {
      i++;
      continue;
    }
    order.push(i);
    if (mb.isRepeatEnd && mb.repeatCount > 0) {
      if (pass < mb.repeatCount) {
        pass++;
        i = repStart;
        continue;
      }
      pass = 1;
      repStart = i + 1;
    }
    i++;
  }
  // --- tempo map (in unfolded quarter-note beats) ---
  const TPQ = 960;
  const barStartBeat = new Map<number, number>();
  const tempoMap: { beat: number; bpm: number }[] = [];
  let beatPos = 0;
  let curTempo = score.tempo || 120;
  tempoMap.push({ beat: 0, bpm: curTempo });
  const order2: { idx: number; start: number }[] = [];
  order.forEach((mbIdx) => {
    const mb = masterBars[mbIdx];
    order2.push({ idx: mbIdx, start: beatPos });
    for (const ta of mb.tempoAutomations ?? []) {
      const b = beatPos + ta.ratioPosition * (mb.calculateDuration() / TPQ);
      if (ta.value !== curTempo) {
        curTempo = ta.value;
        tempoMap.push({ beat: b, bpm: ta.value });
      }
    }
    beatPos += mb.calculateDuration() / TPQ;
  });
  void barStartBeat;
  const total = beatPos;
  const tracks: Track[] = [];
  const chords: ChordMark[] = [];
  let tuning = STANDARD;
  let capo = 0;
  let trackNo = 0;
  for (const tr of score.tracks) {
    const staff = tr.staves[0];
    if (!staff || !staff.isStringed || staff.stringTuning.tunings.length !== 6) continue;
    const tun = staff.stringTuning.tunings.slice().reverse(); // lowest first
    if (tracks.length === 0) {
      tuning = tun;
      capo = staff.capo || 0;
    }
    const events: NoteEvent[] = [];
    for (const o of order2) {
      const bar = staff.bars[o.idx];
      if (!bar) continue;
      for (const voice of bar.voices.slice(0, 1)) {
        for (const beat of voice.beats) {
          if (beat.isEmpty || beat.isRest || !beat.notes.length) continue;
          const notes: TabNote[] = [];
          let legato = false;
          for (const n of beat.notes as unknown as AtNote[]) {
            const tech: Tech[] = [];
            if (n.isHammerPullOrigin) tech.push('h');
            if (n.isPalmMute) tech.push('pm');
            if (n.slideOutType || n.slideInType) tech.push('s');
            if (n.bendType) tech.push('b');
            if (n.vibrato) tech.push('v');
            if (n.isHammerPullDestination) legato = true;
            const idxStr = tun.length - n.string; // alphaTab: 1 = lowest string
            if (idxStr < 0 || idxStr > 5) continue;
            notes.push({ string: idxStr, fret: n.fret, tech: tech.length ? tech : undefined, tie: n.isTieDestination || undefined, dead: n.isDead || undefined });
          }
          if (!notes.length) continue;
          const startBeat = o.start + beat.playbackStart / TPQ;
          const ev: NoteEvent = { beat: startBeat, dur: Math.max(0.0625, beat.playbackDuration / TPQ), notes, legato: legato || undefined };
          if (beat.chord) {
            ev.chord = beat.chord.name;
            if (tracks.length === 0 && !chords.some((c) => Math.abs(c.beat - startBeat) < 1e-6)) chords.push({ beat: startBeat, dur: 0, name: beat.chord.name });
          }
          events.push(ev);
        }
      }
    }
    if (!events.length) continue;
    trackNo++;
    tracks.push({ id: `t${trackNo}`, name: tr.name || `Track ${trackNo}`, kind: /bass/i.test(tr.name) ? 'bass' : /lead|solo/i.test(tr.name) ? 'lead' : /rhythm/i.test(tr.name) ? 'rhythm' : 'other', events });
  }
  if (!tracks.length) throw new Error('No six-string guitar track found in this file.');
  chords.sort((a, b) => a.beat - b.beat);
  chords.forEach((c, k) => (c.dur = (chords[k + 1]?.beat ?? total) - c.beat));
  const mb0 = masterBars[0];
  const song: Song = {
    id: `import-${slug(score.title || 'song')}-${Date.now().toString(36)}`,
    title: score.title?.trim() || filename.replace(/\.[^.]+$/, ''),
    artist: score.artist?.trim() || 'Imported',
    genre: 'Imported',
    difficulty: 3,
    bpm: score.tempo || 100,
    tempoMap: tempoMap.length > 1 ? tempoMap : undefined,
    beatsPerBar: mb0?.timeSignatureNumerator ?? 4,
    beatUnit: mb0?.timeSignatureDenominator ?? 4,
    tuning,
    capo,
    tracks,
    chords,
    lengthBeats: Math.ceil(total),
    source: 'user',
    tags: ['imported'],
    pickup: 0,
    createdAt: Date.now(),
  };
  info.push(`${tracks.length} guitar track(s), ${Math.round(total)} beats, ${song.bpm} BPM`);
  return { song, info };
}
