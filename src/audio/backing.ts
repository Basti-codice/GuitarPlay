import type { ChordMark, Song } from '../core/types';
import { Timeline } from '../core/timeline';
import { chordInfo } from '../songs/chords';
import { getBuses, getCtx, noiseBuffer } from './engine';
import { midiToFreq } from '../core/music';

type Hit = { beat: number; kind: 'k' | 's' | 'h' | 'o' | 'r'; vel: number };
type BassNote = { beat: number; dur: number; kind: 'root' | 'fifth' | 'oct' | 'third' };

const CHORD_TONES: Record<string, number[]> = {
  maj: [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7], '5': [0, 7, 12], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8], add9: [0, 4, 7, 14], '9': [0, 4, 7, 10, 14], m7b5: [0, 3, 6, 10], m9: [0, 3, 7, 10, 14], '7sus4': [0, 5, 7, 10], maj9: [0, 4, 7, 11, 14],
};

export function chordTones(name: string): { root: number; tones: number[] } | null {
  const c = chordInfo(name);
  if (!c) return null;
  return { root: c.bass ?? c.root, tones: (CHORD_TONES[c.quality] ?? CHORD_TONES.maj).map((t) => (c.root + t) % 12 + (t >= 12 ? 12 : 0)) };
}

function barPattern(num: number, den: number, style: Song['style']): { drums: Hit[]; bass: BassNote[]; bl: number } {
  const bl = (num * 4) / den;
  const d: Hit[] = [];
  const b: BassNote[] = [];
  const hats = (step: number, vel = 0.35) => {
    for (let t = 0; t < bl - 1e-6; t += step) d.push({ beat: t, kind: 'h', vel: t % 1 === 0 ? vel : vel * 0.6 });
  };
  if (den === 8 && num % 3 === 0) {
    // compound meter (6/8, 9/8, 12/8)
    const groups = num / 3;
    for (let g = 0; g < groups; g++) {
      const o = g * 1.5;
      d.push({ beat: o, kind: g % 2 === 0 ? 'k' : 's', vel: g % 2 === 0 ? 0.8 : 0.5 });
    }
    hats(0.5, 0.25);
    for (let g = 0; g < groups; g++) b.push({ beat: g * 1.5, dur: 1.4, kind: g % 2 === 0 ? 'root' : 'fifth' });
    return { drums: d, bass: b, bl };
  }
  if (num === 3 && den === 4) {
    d.push({ beat: 0, kind: 'k', vel: 0.8 }, { beat: 1, kind: 'h', vel: 0.35 }, { beat: 2, kind: 'h', vel: 0.35 });
    d.push({ beat: 1, kind: 's', vel: 0.25 }, { beat: 2, kind: 's', vel: 0.25 });
    b.push({ beat: 0, dur: 0.9, kind: 'root' }, { beat: 1, dur: 0.9, kind: 'fifth' }, { beat: 2, dur: 0.9, kind: 'fifth' });
    return { drums: d, bass: b, bl };
  }
  switch (style) {
    case 'rock':
      d.push({ beat: 0, kind: 'k', vel: 0.9 }, { beat: 1, kind: 's', vel: 0.8 }, { beat: 2, kind: 'k', vel: 0.85 }, { beat: 2.5, kind: 'k', vel: 0.5 }, { beat: 3, kind: 's', vel: 0.8 });
      hats(0.5, 0.4);
      for (let t = 0; t < bl; t += 0.5) b.push({ beat: t, dur: 0.45, kind: t % 2 === 1.5 ? 'fifth' : 'root' });
      break;
    case 'ballad':
      d.push({ beat: 0, kind: 'k', vel: 0.7 }, { beat: 2, kind: 's', vel: 0.6 });
      hats(1, 0.25);
      b.push({ beat: 0, dur: 1.9, kind: 'root' }, { beat: 2, dur: 1.9, kind: 'fifth' });
      break;
    case 'reggae':
      d.push({ beat: 2, kind: 'k', vel: 0.85 }, { beat: 2, kind: 's', vel: 0.6 });
      hats(0.5, 0.3);
      b.push({ beat: 0, dur: 0.4, kind: 'root' }, { beat: 1.5, dur: 0.9, kind: 'root' }, { beat: 2.5, dur: 0.4, kind: 'fifth' }, { beat: 3, dur: 0.9, kind: 'root' });
      break;
    case 'shuffle':
      d.push({ beat: 0, kind: 'k', vel: 0.85 }, { beat: 1, kind: 's', vel: 0.7 }, { beat: 2, kind: 'k', vel: 0.8 }, { beat: 3, kind: 's', vel: 0.7 });
      for (let t = 0; t < bl; t += 1) d.push({ beat: t, kind: 'h', vel: 0.4 }, { beat: t + 2 / 3, kind: 'h', vel: 0.25 });
      for (let t = 0; t < bl; t += 1) b.push({ beat: t, dur: 0.6, kind: t % 2 === 0 ? 'root' : 'fifth' }, { beat: t + 2 / 3, dur: 0.3, kind: 'root' });
      break;
    case 'march':
      d.push({ beat: 0, kind: 'k', vel: 0.85 }, { beat: 1, kind: 's', vel: 0.6 }, { beat: 2, kind: 'k', vel: 0.8 }, { beat: 3, kind: 's', vel: 0.6 });
      b.push({ beat: 0, dur: 0.9, kind: 'root' }, { beat: 1, dur: 0.9, kind: 'fifth' }, { beat: 2, dur: 0.9, kind: 'root' }, { beat: 3, dur: 0.9, kind: 'fifth' });
      break;
    case 'folk':
      d.push({ beat: 0, kind: 'k', vel: 0.7 }, { beat: 1, kind: 'r', vel: 0.5 }, { beat: 2, kind: 'k', vel: 0.6 }, { beat: 3, kind: 'r', vel: 0.5 });
      hats(1, 0.2);
      b.push({ beat: 0, dur: 0.9, kind: 'root' }, { beat: 2, dur: 0.9, kind: 'fifth' });
      break;
    default:
      d.push({ beat: 0, kind: 'k', vel: 0.75 }, { beat: 2, kind: 'k', vel: 0.7 }, { beat: 1, kind: 'r', vel: 0.45 }, { beat: 3, kind: 'r', vel: 0.45 });
      hats(1, 0.25);
      b.push({ beat: 0, dur: 1.9, kind: 'root' }, { beat: 2, dur: 1.9, kind: 'fifth' });
  }
  return { drums: d, bass: b, bl };
}

interface Sched {
  beat: number;
  fn: (when: number) => void;
}

/** Synthesised backing band (drums, bass, pad) driven by a song's chord marks. */
export class BackingBand {
  private timer: number | null = null;
  private queue: Sched[] = [];
  private qi = 0;
  private t0 = 0;
  private tl!: Timeline;
  private speed = 1;
  private nodes = new Set<AudioScheduledSourceNode>();

  build(song: Song) {
    const c = getCtx();
    const b = getBuses();
    const q: Sched[] = [];
    const { drums, bass, bl } = barPattern(song.beatsPerBar, song.beatUnit, song.style);
    const total = song.lengthBeats;
    const pickup = song.pickup ?? 0;
    for (let bar = pickup; bar < total - 1e-6; bar += bl) {
      for (const h of drums) if (bar + h.beat < total) q.push({ beat: bar + h.beat, fn: (w) => this.drum(c, b.backing, h.kind, h.vel, w) });
      for (const n of bass) {
        const at = bar + n.beat;
        if (at >= total) continue;
        const ch = chordAtBeat(song.chords, at);
        if (!ch) continue;
        const ct = chordTones(ch.name);
        if (!ct) continue;
        let pc = ct.root;
        if (n.kind === 'fifth') pc = (ct.root + 7) % 12;
        let midi = 28 + ((pc - 28 + 1200) % 12); // E1..D#2
        if (midi < 33) midi += 12;
        const dur = (n.dur * 60) / song.bpm;
        q.push({ beat: at, fn: (w) => this.bass(c, b.backing, midi, w, dur / this.speed) });
      }
    }
    for (const ch of song.chords) {
      const ct = chordTones(ch.name);
      if (!ct) continue;
      const dur = (ch.dur * 60) / song.bpm;
      const mids = ct.tones.map((t) => 48 + ((t % 12) + 12 - 48 % 12) % 12 + (t >= 12 ? 12 : 0) - 0);
      q.push({ beat: ch.beat, fn: (w) => this.pad(c, b.backing, mids, w, Math.max(0.6, dur / this.speed)) });
    }
    q.sort((a, b2) => a.beat - b2.beat);
    this.queue = q;
  }

  start(song: Song, tl: Timeline, t0: number, speed: number, fromBeat = 0) {
    this.stop();
    this.tl = tl;
    this.speed = speed;
    this.t0 = t0;
    this.build(song);
    this.qi = this.queue.findIndex((e) => e.beat >= fromBeat - 1e-6);
    if (this.qi < 0) this.qi = this.queue.length;
    this.timer = window.setInterval(() => this.pump(), 30);
    this.pump();
  }

  private pump() {
    const c = getCtx();
    while (this.qi < this.queue.length) {
      const e = this.queue[this.qi];
      const when = this.t0 + this.tl.toSec(e.beat) / this.speed;
      if (when > c.currentTime + 0.2) break;
      if (when >= c.currentTime - 0.02) e.fn(Math.max(when, c.currentTime));
      this.qi++;
    }
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.nodes.clear();
  }

  private track<T extends AudioScheduledSourceNode>(n: T): T {
    this.nodes.add(n);
    n.onended = () => this.nodes.delete(n);
    return n;
  }

  private drum(c: AudioContext, dest: AudioNode, kind: Hit['kind'], vel: number, t: number) {
    const g = c.createGain();
    g.connect(dest);
    if (kind === 'k') {
      const o = this.track(c.createOscillator());
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(vel * 0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.3);
    } else if (kind === 's' || kind === 'r') {
      const n = this.track(c.createBufferSource());
      n.buffer = noiseBuffer(c);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = kind === 's' ? 1900 : 3200;
      f.Q.value = 0.8;
      g.gain.setValueAtTime(vel * (kind === 's' ? 0.55 : 0.3), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 's' ? 0.16 : 0.06));
      n.connect(f).connect(g);
      n.start(t);
      n.stop(t + 0.2);
      if (kind === 's') {
        const o = this.track(c.createOscillator());
        o.type = 'triangle';
        o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(130, t + 0.08);
        const og = c.createGain();
        og.gain.setValueAtTime(vel * 0.3, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(og).connect(dest);
        o.start(t);
        o.stop(t + 0.12);
      }
    } else {
      const n = this.track(c.createBufferSource());
      n.buffer = noiseBuffer(c);
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7500;
      g.gain.setValueAtTime(vel * 0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'o' ? 0.2 : 0.04));
      n.connect(f).connect(g);
      n.start(t);
      n.stop(t + 0.25);
    }
  }

  private bass(c: AudioContext, dest: AudioNode, midi: number, t: number, dur: number) {
    const o = this.track(c.createOscillator());
    o.type = 'sawtooth';
    o.frequency.value = midiToFreq(midi);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + Math.max(0.15, dur));
    const g = c.createGain();
    const len = Math.max(0.12, Math.min(dur, 2));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
    g.gain.setValueAtTime(0.5, t + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  private pad(c: AudioContext, dest: AudioNode, midis: number[], t: number, dur: number) {
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.1, t + Math.min(0.4, dur * 0.4));
    out.gain.setValueAtTime(0.1, t + Math.max(0.1, dur - 0.3));
    out.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1300;
    out.connect(f).connect(dest);
    for (const m of midis) {
      for (const det of [-6, 6]) {
        const o = this.track(c.createOscillator());
        o.type = 'sawtooth';
        o.frequency.value = midiToFreq(m);
        o.detune.value = det;
        const g = c.createGain();
        g.gain.value = 0.25 / midis.length;
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    }
  }
}

function chordAtBeat(chords: ChordMark[], beat: number): ChordMark | undefined {
  let r: ChordMark | undefined;
  for (const c of chords) if (c.beat <= beat + 1e-6 && beat < c.beat + c.dur - 1e-6) r = c;
  return r;
}
