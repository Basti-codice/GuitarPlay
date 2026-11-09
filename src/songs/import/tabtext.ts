import type { ChordMark, NoteEvent, Song, TabNote, Tech, Track } from '../../core/types';
import { STANDARD, TUNINGS, parsePitchClass } from '../../core/music';
import { chordInfo } from '../chords';
import { makeChordTrack, makePickingTrack } from '../arrange';

/**
 * “GuitarPlay Tab Format” – plain text with a few `Key: value` header lines followed by classic ASCII tab.
 * See `prompt.ts` for the specification that is handed to AI assistants.
 */
export interface TabMeta {
  title?: string;
  artist?: string;
  tempo?: number;
  num?: number;
  den?: number;
  /** 1/N note per character column, N given here (8 = eighth notes) */
  grid?: number;
  /** characters per grid step (2 = a separator dash after every column, avoids “1”+“2” being read as “12”) */
  spacing?: number;
  tuning?: number[];
  capo?: number;
  key?: string;
  difficulty?: number;
  genre?: string;
  style?: Song['style'];
  description?: string;
}

export interface TabTextResult {
  song: Song;
  /** effective settings after header + overrides + defaults */
  meta: Required<Pick<TabMeta, 'title' | 'artist' | 'tempo' | 'num' | 'den' | 'tuning' | 'capo' | 'difficulty' | 'genre'>> & TabMeta;
  warnings: string[];
  bars: number;
  /** settings that were not in the text and therefore defaulted */
  defaulted: string[];
}

const STYLES = ['quarter', 'rock', 'folk', 'ballad', 'waltz', 'shuffle', 'reggae', 'none', 'march', 'latin'];

const HEADER_KEYS: Record<string, keyof TabMeta | 'meter'> = {
  title: 'title', name: 'title', song: 'title',
  artist: 'artist', composer: 'artist', band: 'artist',
  tempo: 'tempo', bpm: 'tempo',
  meter: 'meter', time: 'meter', timesignature: 'meter', 'time signature': 'meter',
  grid: 'grid', resolution: 'grid', gridresolution: 'grid',
  spacing: 'spacing', charsperstep: 'spacing', 'chars per step': 'spacing',
  tuning: 'tuning', capo: 'capo', key: 'key',
  difficulty: 'difficulty', level: 'difficulty',
  genre: 'genre', style: 'style', description: 'description', notes: 'description',
};

const CHORD_TOKEN = /^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|-)?\d*(?:(?:sus|add|maj|b|#)\d+)*(?:\/[A-G][#b]?)?$/;

export function parseTuningText(s: string): number[] | null {
  const t = s.toLowerCase().replace(/[()]/g, ' ').trim();
  if (!t) return null;
  if (/^(standard|e standard|std|eadgbe)\b/.test(t) && !/drop|down|open/.test(t)) return STANDARD;
  const named: [RegExp, string][] = [
    [/drop\s*c\b/, 'dropc'], [/drop\s*d\b/, 'dropd'], [/dadgad/, 'dadgad'], [/open\s*d\b/, 'opend'], [/open\s*g\b/, 'openg'],
    [/(half[\s-]*step\s*down|eb standard|e\s*flat|d#\s*standard|1\/2 step)/, 'halfdown'], [/(full[\s-]*step\s*down|d standard|whole[\s-]*step)/, 'fulldown'],
  ];
  for (const [re, id] of named) if (re.test(t)) return TUNINGS.find((x) => x.id === id)!.notes;
  const toks = [...s.matchAll(/([A-Ga-g])([#b♯♭]?)/g)].map((m) => parsePitchClass(m[1] + (m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2])));
  if (toks.length !== 6 || toks.some((x) => x === null)) return null;
  const build = (pcs: number[]) => pcs.map((pc, i) => {
    let best = STANDARD[i];
    let bd = Infinity;
    for (let m = 28; m < 80; m++) if (m % 12 === pc && Math.abs(m - STANDARD[i]) < bd) { bd = Math.abs(m - STANDARD[i]); best = m; }
    return best;
  });
  const dev = (arr: number[]) => arr.reduce((a, m, i) => a + Math.abs(m - STANDARD[i]), 0);
  const a = build(toks as number[]);
  const b = build([...(toks as number[])].reverse());
  return dev(b) < dev(a) ? b : a;
}

function parseGrid(v: string): number | null {
  const s = v.toLowerCase().trim();
  const m = /(?:1\s*\/\s*)?(\d+)/.exec(s);
  if (/quarter/.test(s)) return 4;
  if (/eighth|8th/.test(s)) return 8;
  if (/sixteenth|16th/.test(s)) return 16;
  if (/32/.test(s) && !m) return 32;
  if (!m) return null;
  const n = parseInt(m[1]);
  return n >= 1 && n <= 64 ? n : null;
}

interface RawRow {
  /** content after the label, starting at its first bar line */
  text: string;
  /** index in the original line where `text` starts */
  base: number;
}

interface TabLine extends RawRow {
  lineNo: number;
}

function normalizeLine(l: string) {
  return l.replace(/[│┃‖║]/g, '|').replace(/[–—_−]/g, '-').replace(/\t/g, ' ');
}

function tabLine(raw: string, lineNo: number): TabLine | null {
  const l = normalizeLine(raw).replace(/\s+$/, '');
  const m = /^(\s*)([A-Ga-g][#b]?)?(\s*)(\|[-0-9xXhpbrsvt/\\~^()*.|:<>=\s?]*)$/.exec(l);
  if (!m) return null;
  const body = m[4];
  if (!/[-0-9]/.test(body) || body.length < 3) return null;
  return { text: body, base: l.length - body.length, lineNo };
}

interface Seg {
  text: string;
  start: number;
  repeatStart: boolean;
  repeatEnd: boolean;
}

function splitBars(row: RawRow): Seg[] {
  const out: Seg[] = [];
  let cur = '';
  let curStart = row.base + 1;
  const t = row.text;
  for (let i = 1; i <= t.length; i++) {
    const ch = i < t.length ? t[i] : '|';
    if (ch === '|') {
      if (cur.replace(/[:\s]/g, '').length > 0) {
        const trimmed = cur;
        out.push({ text: trimmed.replace(/:/g, '').replace(/[()?]/g, '-').replace(/ /g, '-'), start: curStart, repeatStart: trimmed.startsWith(':'), repeatEnd: trimmed.endsWith(':') && trimmed.length > 1 });
      }
      cur = '';
      curStart = row.base + i + 1;
    } else cur += ch;
  }
  return out;
}

interface Bar {
  rows: string[];
  start0: number;
  repeatStart: boolean;
  repeatEnd: boolean;
  chords: { frac: number; name: string }[];
  line: number;
  logicalWidth: number;
  skip: boolean[];
}

function barLayout(rows: string[]) {
  const width = Math.max(...rows.map((r) => r.length));
  const skip: boolean[] = new Array(width).fill(false);
  for (const r of rows) for (let i = 1; i < r.length; i++) if (/\d/.test(r[i]) && /\d/.test(r[i - 1])) skip[i] = true;
  let n = 0;
  for (const s of skip) if (!s) n++;
  return { width, skip, logicalWidth: n };
}

function parseChordBarLine(s: string): string[][] {
  return s
    .split('|')
    .map((x) => x.trim())
    .filter((x, i, a) => !(x === '' && (i === 0 || i === a.length - 1)))
    .map((x) => x.split(/\s+/).filter((c) => c && c !== '-' && c !== '%' && !/^n\.?c\.?$/i.test(c)));
}

export function parseTabText(input: string, forced: TabMeta = {}): TabTextResult {
  const warnings: string[] = [];
  const header: TabMeta & { meterStr?: string } = {};
  const lines = input
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*```/.test(l))
    .map((l) => l.replace(/\*\*/g, ''));

  // --- classify lines ---
  type Item = { kind: 'tab'; t: TabLine } | { kind: 'chordsBars'; v: string[][]; lineNo: number } | { kind: 'chordsAligned'; tokens: { name: string; idx: number }[]; lineNo: number } | { kind: 'other' };
  const items: Item[] = lines.map((raw, i) => {
    const t = tabLine(raw, i + 1);
    if (t) return { kind: 'tab', t };
    const hm = /^\s*([A-Za-z][A-Za-z ]{1,20}?)\s*[:=]\s*(.*?)\s*$/.exec(raw);
    if (hm) {
      const k = hm[1].toLowerCase().replace(/\s+/g, ' ');
      if (k === 'chords' || k === 'chord') return { kind: 'chordsBars', v: parseChordBarLine(hm[2]), lineNo: i + 1 };
      const key = HEADER_KEYS[k] ?? HEADER_KEYS[k.replace(/ /g, '')];
      if (key) {
        const val = hm[2].replace(/^["“]|["”]$/g, '');
        applyHeader(header, key, val, warnings, i + 1);
        return { kind: 'other' };
      }
    }
    const toks = [...normalizeLine(raw).matchAll(/\S+/g)];
    if (toks.length && toks.every((m) => CHORD_TOKEN.test(m[0]))) return { kind: 'chordsAligned', tokens: toks.map((m) => ({ name: m[0], idx: m.index ?? 0 })), lineNo: i + 1 };
    return { kind: 'other' };
  });

  // --- effective meta ---
  const defaulted: string[] = [];
  const pick = <K extends keyof TabMeta>(k: K, def: NonNullable<TabMeta[K]>): NonNullable<TabMeta[K]> => {
    const v = forced[k] ?? header[k];
    if (v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v))) {
      defaulted.push(String(k));
      return def;
    }
    return v as NonNullable<TabMeta[K]>;
  };
  const tempo = pick('tempo', 100);
  let num = forced.num ?? header.num;
  let den = forced.den ?? header.den;
  if (!num || !den) {
    defaulted.push('meter');
    num = 4;
    den = 4;
  }
  const barBeats = (num * 4) / den;
  const tuning = pick('tuning', STANDARD);
  const capo = pick('capo', 0);
  const gridN = forced.grid ?? header.grid ?? null;
  const stepBeats = gridN ? 4 / gridN : null;
  const spacing = Math.max(1, Math.min(3, forced.spacing ?? header.spacing ?? 1));
  const expectedCols = stepBeats ? Math.max(1, Math.round(barBeats / stepBeats) * spacing) : null;

  // --- group tab rows into systems ---
  const systems: { rows: TabLine[]; chordsBars?: string[][]; chordsAligned?: { name: string; idx: number }[] }[] = [];
  let i = 0;
  let pendingBars: string[][] | undefined;
  let pendingAligned: { name: string; idx: number }[] | undefined;
  while (i < items.length) {
    const it = items[i];
    if (it.kind === 'chordsBars') {
      pendingBars = it.v;
      pendingAligned = undefined;
      i++;
    } else if (it.kind === 'chordsAligned') {
      pendingAligned = it.tokens;
      pendingBars = undefined;
      i++;
    } else if (it.kind === 'tab') {
      const run: TabLine[] = [];
      while (i < items.length && items[i].kind === 'tab') run.push((items[i] as { kind: 'tab'; t: TabLine }).t), i++;
      if (run.length % 6 !== 0) warnings.push(`Line ${run[0].lineNo}: found ${run.length} tab lines in a row – a system needs exactly 6 (e B G D A E). The extra lines were ignored.`);
      for (let k = 0; k + 6 <= run.length; k += 6) {
        systems.push({ rows: run.slice(k, k + 6), chordsBars: k === 0 ? pendingBars : undefined, chordsAligned: k === 0 ? pendingAligned : undefined });
        if (k === 0) {
          pendingBars = undefined;
          pendingAligned = undefined;
        }
      }
    } else {
      // free text between a chord line and its tab breaks the association only on blank lines
      if (lines[i].trim() === '') {
        /* keep pending chords across a single blank line */
      }
      i++;
    }
  }
  if (!systems.length) throw new Error('No tab found. Expected six lines per system, e.g.  e|--0--3--|  B|--1-----|  G|--0-----|  D|--2-----|  A|--3-----|  E|--------|');

  // --- build bars ---
  const bars: Bar[] = [];
  for (const sys of systems) {
    const segRows = sys.rows.map(splitBars);
    const counts = segRows.map((s) => s.length);
    const nb = Math.min(...counts);
    if (Math.max(...counts) !== nb) warnings.push(`Line ${sys.rows[0].lineNo}: the six strings have different numbers of bar lines (${counts.join('/')}). Using ${nb}.`);
    const firstBar = bars.length;
    for (let b = 0; b < nb; b++) {
      const rows = segRows.map((s) => s[b].text);
      const w = Math.max(...rows.map((r) => r.length));
      const padded = rows.map((r) => r.padEnd(w, '-'));
      const lay = barLayout(padded);
      bars.push({
        rows: padded,
        start0: segRows[0][b].start,
        repeatStart: segRows.some((s) => s[b].repeatStart),
        repeatEnd: segRows.some((s) => s[b].repeatEnd),
        chords: [],
        line: sys.rows[0].lineNo,
        logicalWidth: lay.logicalWidth,
        skip: lay.skip,
      });
    }
    // chords
    if (sys.chordsBars) {
      sys.chordsBars.forEach((cs, b) => {
        const bar = bars[firstBar + b];
        if (!bar) return;
        cs.forEach((name, k) => bar.chords.push({ frac: k / cs.length, name }));
      });
      if (sys.chordsBars.length !== nb) warnings.push(`Line ${sys.rows[0].lineNo}: “Chords:” lists ${sys.chordsBars.length} bar(s) but the system has ${nb}.`);
    } else if (sys.chordsAligned) {
      for (const tk of sys.chordsAligned) {
        for (let b = 0; b < nb; b++) {
          const bar = bars[firstBar + b];
          const rel = tk.idx - bar.start0;
          if (rel >= -1 && rel <= bar.rows[0].length) {
            const raw = Math.max(0, rel);
            const logical = raw - bar.skip.slice(0, raw).filter(Boolean).length;
            bar.chords.push({ frac: logical / Math.max(1, bar.logicalWidth), name: tk.name });
            break;
          }
        }
      }
    }
  }
  if (!bars.length) throw new Error('Found tab lines but no bars. Each system needs bar lines (|) at the start and end of every bar.');

  // --- width statistics ---
  const freq = new Map<number, number>();
  bars.forEach((b) => freq.set(b.logicalWidth, (freq.get(b.logicalWidth) ?? 0) + 1));
  const modal = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const colsPerBar = expectedCols ?? modal;
  const bad = bars.map((b, idx) => ({ b, idx })).filter(({ b }) => b.logicalWidth !== colsPerBar);
  if (expectedCols && modal !== expectedCols) warnings.push(`The header says Grid 1/${gridN} in ${num}/${den}, i.e. ${expectedCols} columns per bar, but most bars have ${modal}${spacing > 1 ? ` (Spacing ${spacing})` : ''}. Check the Grid and Meter settings (you can change them below without asking the AI again).`);
  for (const { b, idx } of bad.slice(0, 6)) warnings.push(`Bar ${idx + 1} (line ${b.line}) has ${b.logicalWidth} columns instead of ${colsPerBar}. Its notes were spread evenly over the bar.`);
  if (bad.length > 6) warnings.push(`…and ${bad.length - 6} more bars with an unexpected width.`);

  // --- unfold repeats ---
  const order: number[] = [];
  let ri = 0,
    rs = 0,
    pass = 1,
    guard = 0;
  while (ri < bars.length && guard++ < 10000) {
    if (bars[ri].repeatStart) {
      if (rs !== ri) pass = 1;
      rs = ri;
    }
    order.push(ri);
    if (bars[ri].repeatEnd) {
      if (pass < 2) {
        pass++;
        ri = rs;
        continue;
      }
      pass = 1;
      rs = ri + 1;
    }
    ri++;
  }

  // --- events ---
  const events: NoteEvent[] = [];
  const chordMarks: ChordMark[] = [];
  let outOfRange = 0;
  order.forEach((bi, pos) => {
    const bar = bars[bi];
    const start = pos * barBeats;
    const denom = Math.max(bar.logicalWidth, colsPerBar);
    // map raw col -> logical col
    const logical: number[] = [];
    let n = 0;
    for (let c = 0; c < bar.skip.length; c++) {
      logical[c] = n;
      if (!bar.skip[c]) n++;
    }
    type Pending = { fret: number; dead: boolean; tech: Tech[]; legato: boolean };
    const byCol = new Map<number, (Pending | undefined)[]>();
    for (let r = 0; r < 6; r++) {
      const row = bar.rows[r];
      let prevLegato = false;
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        let note: Pending | null = null;
        let consumed = 0;
        if (/\d/.test(ch) && !(c > 0 && /\d/.test(row[c - 1]))) {
          const two = /\d/.test(row[c + 1] ?? '');
          const fret = parseInt(two ? ch + row[c + 1] : ch);
          consumed = two ? 2 : 1;
          note = { fret, dead: false, tech: [], legato: prevLegato };
        } else if ((ch === 'x' || ch === 'X') && !/[0-9]/.test(row[c - 1] ?? '')) {
          note = { fret: 0, dead: true, tech: ['x'], legato: false };
          consumed = 1;
        }
        if (!note) continue;
        prevLegato = false;
        const after = row[c + consumed] ?? '';
        const after2 = row[c + consumed + 1] ?? '';
        if ((after === 'h' || after === 'p') && /\d/.test(after2)) {
          note.tech.push(after as Tech);
          prevLegato = true;
        } else if ((after === '/' || after === '\\' || after === 's') && /\d/.test(after2)) note.tech.push('s');
        else if (after === 'b') note.tech.push('b');
        else if (after === '~') note.tech.push('v');
        if (!note.dead && (note.fret < 0 || note.fret > 24)) {
          outOfRange++;
          continue;
        }
        const arr = byCol.get(c) ?? [undefined, undefined, undefined, undefined, undefined, undefined];
        arr[5 - r] = note;
        byCol.set(c, arr);
      }
    }
    for (const [c, arr] of [...byCol.entries()].sort((a, b) => a[0] - b[0])) {
      const notes: TabNote[] = [];
      let legato = false;
      arr.forEach((p, s) => {
        if (!p) return;
        notes.push({ string: s, fret: p.fret, ...(p.tech.length ? { tech: p.tech } : {}), ...(p.dead ? { dead: true } : {}) });
        if (p.legato) legato = true;
      });
      if (!notes.length) continue;
      events.push({ beat: start + (logical[c] / denom) * barBeats, dur: 0.5, notes, ...(legato ? { legato: true } : {}) });
    }
    for (const ch of bar.chords) chordMarks.push({ beat: start + ch.frac * barBeats, name: ch.name, dur: 0 });
  });
  if (outOfRange) warnings.push(`${outOfRange} fret number(s) above 24 were ignored.`);
  if (!events.length) throw new Error('The tab contains no fret numbers.');
  events.sort((a, b) => a.beat - b.beat);
  const total = order.length * barBeats;
  events.forEach((e, k) => {
    const nx = events[k + 1];
    e.dur = Math.min(4, Math.max(0.125, (nx ? nx.beat : total) - e.beat));
  });

  chordMarks.sort((a, b) => a.beat - b.beat);
  chordMarks.forEach((m, k) => (m.dur = (chordMarks[k + 1]?.beat ?? total) - m.beat));
  // label events with the chord that starts on them
  for (const m of chordMarks) {
    const ev = events.find((e) => Math.abs(e.beat - m.beat) < 1e-6);
    if (ev && !ev.chord) ev.chord = m.name;
  }
  const unknown = [...new Set(chordMarks.map((m) => m.name).filter((n) => !chordInfo(n)))];
  if (unknown.length) warnings.push(`Unknown chord name(s): ${unknown.join(', ')} – they are shown but not used for strumming tracks.`);

  const style = (forced.style ?? header.style ?? (num === 3 ? 'waltz' : 'folk')) as Song['style'];
  const tracks: Track[] = [{ id: 'main', name: 'Tab', kind: 'lead', events }];
  const usable = chordMarks.filter((m) => chordInfo(m.name));
  if (usable.length) {
    tracks.push({ id: 'chords', name: 'Chords (strumming)', kind: 'chords', events: makeChordTrack(chordMarks, num, den, style, 0, total) });
    tracks.push({ id: 'picking', name: 'Fingerpicking', kind: 'picking', events: makePickingTrack(chordMarks, num, den, 0, total) });
  }
  const title = forced.title ?? header.title ?? 'Imported tab';
  if (forced.title === undefined && header.title === undefined) defaulted.push('title');
  const difficulty = Math.max(1, Math.min(5, Math.round(pick('difficulty', 3)))) as 1 | 2 | 3 | 4 | 5;
  const genre = pick('genre', 'Imported');
  const artist = pick('artist', 'Imported');
  const key = forced.key ?? header.key;
  const song: Song = {
    id: `import-tab-${Date.now().toString(36)}`,
    title,
    artist,
    genre,
    difficulty,
    bpm: tempo,
    beatsPerBar: num,
    beatUnit: den,
    tuning,
    capo,
    key,
    tracks,
    chords: chordMarks,
    lengthBeats: Math.ceil(total),
    source: 'user',
    tags: ['imported', 'text tab'],
    description: forced.description ?? header.description,
    style,
    pickup: 0,
    createdAt: Date.now(),
  };
  return {
    song,
    meta: { title, artist, tempo, num, den, tuning, capo, difficulty, genre, key, style, grid: gridN ?? undefined, description: song.description },
    warnings,
    bars: order.length,
    defaulted,
  };
}

function applyHeader(h: TabMeta & { meterStr?: string }, key: keyof TabMeta | 'meter', val: string, warnings: string[], lineNo: number) {
  const v = val.trim();
  if (!v) return;
  switch (key) {
    case 'title': h.title = v; break;
    case 'artist': h.artist = v; break;
    case 'tempo': {
      const m = /(\d{2,3})/.exec(v);
      if (m) h.tempo = parseInt(m[1]);
      else warnings.push(`Line ${lineNo}: could not read the tempo “${v}”.`);
      break;
    }
    case 'meter': {
      const m = /(\d+)\s*\/\s*(\d+)/.exec(v);
      if (m) { h.num = parseInt(m[1]); h.den = parseInt(m[2]); }
      else if (/^c$/i.test(v)) { h.num = 4; h.den = 4; }
      else warnings.push(`Line ${lineNo}: could not read the meter “${v}” (use e.g. 4/4, 3/4, 6/8).`);
      break;
    }
    case 'spacing': {
      const m = /(\d)/.exec(v);
      if (m) h.spacing = parseInt(m[1]);
      break;
    }
    case 'grid': {
      const g = parseGrid(v);
      if (g) h.grid = g;
      else warnings.push(`Line ${lineNo}: could not read the grid “${v}” (use e.g. 1/8 or 1/16).`);
      break;
    }
    case 'tuning': {
      const t = parseTuningText(v);
      if (t) h.tuning = t;
      else warnings.push(`Line ${lineNo}: could not read the tuning “${v}” – using standard tuning.`);
      break;
    }
    case 'capo': {
      const m = /(\d+)/.exec(v);
      h.capo = m ? Math.min(12, parseInt(m[1])) : /none|no|off/i.test(v) ? 0 : undefined;
      break;
    }
    case 'key': h.key = v; break;
    case 'difficulty': {
      const m = /(\d)/.exec(v);
      if (m) h.difficulty = parseInt(m[1]);
      break;
    }
    case 'genre': h.genre = v; break;
    case 'style': {
      const s = v.toLowerCase().split(/[\s,/]/)[0];
      if (STYLES.includes(s)) h.style = s as Song['style'];
      break;
    }
    case 'description': h.description = v; break;
    default: break;
  }
}

/** Serialise one track of a song into the GuitarPlay tab format (round-trips through parseTabText). */
export function serializeTabText(song: Song, trackIdx = 0, barsPerLine = 4): string {
  const track = song.tracks[trackIdx] ?? song.tracks[0];
  const barBeats = (song.beatsPerBar * 4) / song.beatUnit;
  const fine = track.events.some((e) => Math.abs(e.beat * 2 - Math.round(e.beat * 2)) > 1e-3);
  const gridN = fine ? 16 : 8;
  const step = 4 / gridN;
  const cols = Math.max(1, Math.round(barBeats / step));
  const nBars = Math.max(1, Math.ceil(song.lengthBeats / barBeats - 1e-6));
  const tn = TUNINGS.find((t) => t.notes.join() === song.tuning.join());
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const out: string[] = [];
  out.push(`Title: ${song.title}`, `Artist: ${song.artist}`, `Tempo: ${song.bpm}`, `Meter: ${song.beatsPerBar}/${song.beatUnit}`, `Grid: 1/${gridN}`);
  out.push(`Tuning: ${tn ? tn.id === 'standard' ? 'standard' : tn.name.replace(/\s*\(.*\)/, '') : song.tuning.map((m) => noteNames[m % 12]).join(' ')}`, `Capo: ${song.capo}`);
  if (song.key) out.push(`Key: ${song.key}`);
  out.push(`Difficulty: ${song.difficulty}`, `Genre: ${song.genre}`);
  if (song.style) out.push(`Style: ${song.style}`);
  out.push('');
  // adjacent notes on one string (e.g. frets 1 and 2 in neighbouring columns) would read as “12” – add separators
  let sp = 1;
  for (const ev of track.events) {
    for (const n of ev.notes) {
      if (track.events.some((o) => o !== ev && Math.abs(o.beat - ev.beat - step) < 1e-6 && o.notes.some((m) => m.string === n.string))) sp = 2;
    }
  }
  if (sp === 2) out.splice(5, 0, 'Spacing: 2');
  const labels = ['e', 'B', 'G', 'D', 'A', 'E'];
  for (let b0 = 0; b0 < nBars; b0 += barsPerLine) {
    const nb = Math.min(barsPerLine, nBars - b0);
    const rowText: string[] = labels.map((l) => `${l}|`);
    const chordsPerBar: string[] = [];
    for (let b = b0; b < b0 + nb; b++) {
      const start = b * barBeats;
      // build columns
      const colNotes: (number | undefined)[][] = Array.from({ length: cols }, () => [undefined, undefined, undefined, undefined, undefined, undefined]);
      for (const ev of track.events) {
        if (ev.beat < start - 1e-6 || ev.beat >= start + barBeats - 1e-6) continue;
        const c = Math.min(cols - 1, Math.round((ev.beat - start) / step));
        for (const n of ev.notes) colNotes[c][n.string] = n.dead ? -1 : n.fret;
      }
      const rows: string[] = ['', '', '', '', '', ''];
      for (let c = 0; c < cols; c++) {
        const wide = colNotes[c].some((f) => f !== undefined && f >= 10);
        for (let r = 0; r < 6; r++) {
          const f = colNotes[c][5 - r];
          const cell = f === undefined ? (wide ? '--' : '-') : f === -1 ? (wide ? 'x-' : 'x') : String(f).padEnd(wide ? 2 : 1, '-');
          rows[r] += cell + (sp === 2 ? '-' : '');
        }
      }
      for (let r = 0; r < 6; r++) rowText[r] += rows[r] + '|';
      const names = song.chords.filter((m) => m.beat >= start - 1e-6 && m.beat < start + barBeats - 1e-6).map((m) => m.name);
      chordsPerBar.push(names.length ? names.join(' ') : '-');
    }
    if (song.chords.length) out.push(`Chords: ${chordsPerBar.join(' | ')}`);
    out.push(...rowText, '');
  }
  return out.join('\n').trimEnd() + '\n';
}
