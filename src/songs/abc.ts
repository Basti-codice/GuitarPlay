/**
 * Compact ABC notation parser (the subset needed for melodies + chord symbols).
 * Supports: headers X T C M L Q K, accidentals, key signatures, octave marks,
 * lengths, rests, ties, broken rhythm, triplets, [chord groups], "chord symbols",
 * repeats |: :| and 1st/2nd endings, pickup bars.
 */
export interface AbcItem {
  /** beats (quarter notes) relative to the start of the unfolded tune */
  beat: number;
  dur: number;
  /** MIDI pitches; empty array = rest */
  pitches: number[];
  tie?: boolean;
}
export interface AbcChord {
  beat: number;
  name: string;
}
export interface AbcTune {
  title: string;
  composer: string;
  meterNum: number;
  meterDen: number;
  bpm: number;
  key: string;
  items: AbcItem[];
  chords: AbcChord[];
  /** length of the anacrusis in beats (0 if none) */
  pickup: number;
  lengthBeats: number;
  /** Human-readable problems found while parsing (e.g. bars with wrong length). */
  warnings: string[];
}

const BASE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const FIFTHS: Record<number, number> = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 };
const MODE_SHIFT: Record<string, number> = { maj: 0, ion: 0, '': 0, dor: 2, phr: 4, lyd: 5, mix: 7, min: 9, m: 9, aeo: 9, loc: 11 };
const SHARP_ORDER = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
const FLAT_ORDER = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];

function keySignature(k: string): Record<string, number> {
  const m = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)/.exec(k);
  const acc: Record<string, number> = {};
  if (!m) return acc;
  let tonic = BASE[m[1].toLowerCase()];
  if (m[2] === '#') tonic += 1;
  if (m[2] === 'b') tonic -= 1;
  const modeStr = m[3].toLowerCase().slice(0, 3);
  const shift = MODE_SHIFT[modeStr] ?? (modeStr.startsWith('m') && !modeStr.startsWith('maj') && !modeStr.startsWith('mix') ? 9 : 0);
  const relMajor = (((tonic - shift) % 12) + 12) % 12;
  const f = FIFTHS[relMajor] ?? 0;
  if (f > 0) for (let i = 0; i < f; i++) acc[SHARP_ORDER[i]] = 1;
  if (f < 0) for (let i = 0; i < -f; i++) acc[FLAT_ORDER[i]] = -1;
  return acc;
}

interface BarItem {
  off: number;
  dur: number;
  pitches: number[];
  tie?: boolean;
}
interface Bar {
  items: BarItem[];
  chords: { off: number; name: string }[];
  len: number;
  repeatStart: boolean;
  repeatEnd: boolean;
  volta: number;
}

function parseFrac(s: string): number {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s.trim());
  return m ? parseInt(m[1]) / parseInt(m[2]) : parseFloat(s);
}

export function parseAbc(src: string): AbcTune {
  const lines = src.replace(/\r/g, '').split('\n');
  let title = 'Untitled',
    composer = '',
    meterNum = 4,
    meterDen = 4,
    unit = 0,
    bpm = 100,
    key = 'C';
  const body: string[] = [];
  let inBody = false;
  for (const raw of lines) {
    const line = raw.replace(/%.*$/, '').trimEnd();
    if (!line.trim()) continue;
    const h = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (!inBody && h) {
      const [, f, v] = h;
      if (f === 'T' && title === 'Untitled') title = v.trim();
      else if (f === 'C') composer = v.trim();
      else if (f === 'M') {
        if (v.trim() === 'C') meterNum = meterDen = 4;
        else if (v.trim() === 'C|') {
          meterNum = 2;
          meterDen = 2;
        } else {
          const mm = /(\d+)\s*\/\s*(\d+)/.exec(v);
          if (mm) {
            meterNum = parseInt(mm[1]);
            meterDen = parseInt(mm[2]);
          }
        }
      } else if (f === 'L') unit = parseFrac(v);
      else if (f === 'Q') {
        const qm = /(?:(\d+\s*\/\s*\d+)\s*=\s*)?(\d+)/.exec(v);
        if (qm) {
          const b = parseInt(qm[2]);
          bpm = qm[1] ? b * (parseFrac(qm[1]) / 0.25) : b;
        }
      } else if (f === 'K') {
        key = v.trim() || 'C';
        inBody = true;
      }
      continue;
    }
    if (/^[wWsSuUvVmMrRPQ]:/.test(line)) continue; // lyrics, voice etc. inside body
    if (/^[A-Za-z]:/.test(line) && !/^[A-G]:/.test(line)) continue;
    body.push(line);
  }
  if (!unit) unit = meterNum / meterDen < 0.75 ? 1 / 16 : 1 / 8;
  const barLen = (meterNum * 4) / meterDen; // in quarter beats
  let keyAcc = keySignature(key);

  const bars: Bar[] = [];
  let cur: Bar = newBar();
  let pos = 0;
  let barAcc: Record<string, number> = {};
  let tripletLeft = 0,
    tripletScale = 1;
  let broken: { scale: number } | null = null;
  let pendingVolta = 0;
  function newBar(): Bar {
    return { items: [], chords: [], len: 0, repeatStart: false, repeatEnd: false, volta: 0 };
  }
  const closeBar = () => {
    if (cur.items.length || cur.chords.length || cur.repeatStart) {
      cur.len = pos;
      bars.push(cur);
    }
    cur = newBar();
    pos = 0;
    barAcc = {};
    if (pendingVolta) {
      cur.volta = pendingVolta;
      pendingVolta = 0;
    }
  };

  const text = body.join(' \n ');
  let i = 0;
  const N = text.length;
  const lenAt = (): number => {
    // parse length multiplier: digits, /, //, digits/digits
    let num = 1,
      den = 1;
    let s = '';
    while (i < N && /[0-9]/.test(text[i])) s += text[i++];
    if (s) num = parseInt(s);
    while (i < N && text[i] === '/') {
      i++;
      let d = '';
      while (i < N && /[0-9]/.test(text[i])) d += text[i++];
      den *= d ? parseInt(d) : 2;
    }
    return num / den;
  };
  const parsePitch = (): number | null => {
    let acc: number | null = null;
    while (i < N && (text[i] === '^' || text[i] === '_' || text[i] === '=')) {
      if (text[i] === '^') acc = (acc ?? 0) + 1;
      else if (text[i] === '_') acc = (acc ?? 0) - 1;
      else acc = 0;
      i++;
    }
    const ch = text[i];
    if (!ch || !/[A-Ga-g]/.test(ch)) return null;
    i++;
    const low = ch.toLowerCase();
    let oct = ch === low ? 5 : 4;
    while (i < N && (text[i] === "'" || text[i] === ',')) {
      oct += text[i] === "'" ? 1 : -1;
      i++;
    }
    const keyId = low + oct;
    if (acc !== null) barAcc[keyId] = acc;
    const alt = keyId in barAcc ? barAcc[keyId] : keyAcc[low] ?? 0;
    return (oct + 1) * 12 + BASE[low] + alt;
  };
  const addItem = (pitches: number[], dur: number, tie: boolean) => {
    if (tripletLeft > 0) {
      dur *= tripletScale;
      tripletLeft--;
    }
    if (broken) {
      dur *= broken.scale;
      broken = null;
    }
    cur.items.push({ off: pos, dur, pitches, tie });
    pos += dur;
  };

  while (i < N) {
    const c = text[i];
    if (c === ' ' || c === '\n' || c === '\t') {
      i++;
      continue;
    }
    if (c === '"') {
      const j = text.indexOf('"', i + 1);
      const name = text.slice(i + 1, j < 0 ? N : j).trim();
      i = (j < 0 ? N : j) + 1;
      if (name && !/^[\^_<>@]/.test(name)) cur.chords.push({ off: pos, name: name.replace(/\(.*\)/, '') });
      continue;
    }
    if (c === '!' ) {
      const j = text.indexOf('!', i + 1);
      i = (j < 0 ? N : j) + 1;
      continue;
    }
    if (c === '{') {
      const j = text.indexOf('}', i + 1);
      i = (j < 0 ? N : j) + 1;
      continue;
    }
    if (c === '|' || c === ':' || (c === '[' && /[|\d]/.test(text[i + 1] ?? ''))) {
      // bar / repeat / volta token
      let tok = '';
      while (i < N && /[|:\[\]]/.test(text[i])) {
        // stop before a '[' that starts a chord group like [CEG]
        if (text[i] === '[' && /[A-Ga-g^_=]/.test(text[i + 1] ?? '')) break;
        tok += text[i++];
      }
      let volta = 0;
      if (i < N && /[1-9]/.test(text[i]) && /[|\[]$/.test(tok)) {
        volta = parseInt(text[i]);
        i++;
      }
      const startsRep = /\|:/.test(tok) || /::/.test(tok);
      const endsRep = /:\|/.test(tok) || /::/.test(tok);
      if (endsRep) cur.repeatEnd = true;
      const hadContent = cur.items.length > 0;
      if (hadContent || cur.chords.length) closeBar();
      else if (endsRep && bars.length) bars[bars.length - 1].repeatEnd = true;
      if (startsRep) cur.repeatStart = true;
      if (volta) {
        if (cur.items.length === 0) cur.volta = volta;
        pendingVolta = volta;
        cur.volta = volta;
        pendingVolta = 0;
      }
      continue;
    }
    if (c === '[') {
      // chord group [CEG]2 or inline field [K:G]
      if (/[A-Z]:/.test(text.slice(i + 1, i + 3))) {
        const j = text.indexOf(']', i);
        const f = text.slice(i + 1, j);
        if (f.startsWith('K:')) keyAcc = keySignature(f.slice(2));
        i = (j < 0 ? N : j) + 1;
        continue;
      }
      i++;
      const ps: number[] = [];
      while (i < N && text[i] !== ']') {
        const p = parsePitch();
        if (p === null) {
          i++;
          continue;
        }
        ps.push(p);
        lenAt();
      }
      i++;
      const l = lenAt() * unit * 4;
      let tie = false;
      if (text[i] === '-') {
        tie = true;
        i++;
      }
      addItem(ps, l, tie);
      continue;
    }
    if (c === '(') {
      const m = /^\((\d)/.exec(text.slice(i, i + 2));
      if (m) {
        const p = parseInt(m[1]);
        tripletLeft = p;
        tripletScale = p === 3 ? 2 / 3 : p === 2 ? 3 / 2 : p === 4 ? 3 / 4 : p === 6 ? 2 / 3 : 1;
        i += 2;
      } else i++;
      continue;
    }
    if (c === ')') {
      i++;
      continue;
    }
    if (c === 'z' || c === 'x' || c === 'Z') {
      i++;
      const l = lenAt() * unit * 4 * (c === 'Z' ? barLen / (unit * 4) : 1);
      addItem([], c === 'Z' ? barLen * (l / (unit * 4 * (barLen / (unit * 4)))) : l, false);
      continue;
    }
    if (c === '>' || c === '<') {
      i++;
      const prev = cur.items[cur.items.length - 1];
      if (prev) {
        // dotted: prev gets 1.5x/0.5x, next gets the reverse
        const r = c === '>' ? 0.5 : -0.5;
        const total = prev.dur;
        prev.dur = total * (1 + r);
        pos += total * r;
        broken = { scale: 1 - r };
      }
      continue;
    }
    if (/[\^_=A-Ga-g]/.test(c)) {
      const p = parsePitch();
      if (p === null) {
        i++;
        continue;
      }
      const l = lenAt() * unit * 4;
      let tie = false;
      if (text[i] === '-') {
        tie = true;
        i++;
      }
      addItem([p], l, tie);
      continue;
    }
    i++; // ignore anything else (., ~, y, etc.)
  }
  if (cur.items.length || cur.chords.length) closeBar();

  // pickup detection: first bar shorter than barLen and not just chords
  let pickup = 0;
  if (bars.length > 1 && bars[0].len < barLen - 1e-6 && bars[0].items.length) pickup = bars[0].len;

  // unfold repeats
  const out: Bar[] = [];
  let ri = 0,
    rs = pickup ? 1 : 0,
    pass = 1,
    guard = 0;
  while (ri < bars.length && guard++ < 5000) {
    const b = bars[ri];
    if (b.repeatStart) {
      if (rs !== ri) pass = 1;
      rs = ri;
    }
    if (b.volta && b.volta !== pass) {
      // skip all bars of this volta
      let k = ri + 1;
      while (k < bars.length && !bars[k].volta && !bars[k].repeatStart) {
        // belongs to the same volta only if no repeat end marker was seen before
        if (bars[k - 1].repeatEnd) break;
        k++;
      }
      ri = k;
      continue;
    }
    out.push(b);
    if (b.repeatEnd) {
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

  const items: AbcItem[] = [];
  const chords: AbcChord[] = [];
  let t = 0;
  for (const b of out) {
    for (const it of b.items) items.push({ beat: t + it.off, dur: it.dur, pitches: it.pitches, tie: it.tie });
    for (const ch of b.chords) chords.push({ beat: t + ch.off, name: ch.name });
    t += b.len;
  }
  // merge ties
  const merged: AbcItem[] = [];
  for (const it of items) {
    const last = merged[merged.length - 1];
    if (last && last.tie && last.pitches.length && it.pitches.length && last.pitches[0] === it.pitches[0] && Math.abs(last.beat + last.dur - it.beat) < 1e-6) {
      last.dur += it.dur;
      last.tie = it.tie;
    } else merged.push({ ...it });
  }
  const warnings: string[] = [];
  bars.forEach((b, bi) => {
    const isPickup = bi === 0 && pickup > 0;
    const isLast = bi === bars.length - 1;
    if (!isPickup && !isLast && Math.abs(b.len - barLen) > 1e-6 && b.items.length) warnings.push(`bar ${bi + 1}: length ${b.len} (expected ${barLen})`);
  });
  return { title, composer, meterNum, meterDen, bpm, key, items: merged, chords, pickup, lengthBeats: t, warnings };
}
