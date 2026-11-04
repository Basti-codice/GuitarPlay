import { midiToFreq } from '../core/music';
import { getBuses, getCtx } from './engine';
import { pluckBuffer } from './synth';

const PROG: number[][] = [
  [48, 55, 59, 64], // Cmaj7
  [45, 55, 60, 64], // Am7
  [41, 55, 60, 64], // Fmaj7
  [43, 55, 59, 62], // G6-ish
];
const PENT = [60, 62, 64, 67, 69, 72, 74, 76];

/** Slow generative ambient pad + soft plucks for menus. */
export class AmbientMusic {
  private out: GainNode | null = null;
  private timer: number | null = null;
  private next = 0;
  private step = 0;
  private playing = false;

  get isPlaying() {
    return this.playing;
  }

  start() {
    if (this.playing) return;
    const c = getCtx();
    const b = getBuses();
    this.out = c.createGain();
    this.out.gain.setValueAtTime(0.0001, c.currentTime);
    this.out.gain.linearRampToValueAtTime(1, c.currentTime + 2.5);
    this.out.connect(b.music);
    const send = c.createGain();
    send.gain.value = 0.5;
    this.out.connect(send).connect(b.reverbSend);
    this.next = c.currentTime + 0.1;
    this.step = 0;
    this.playing = true;
    this.timer = window.setInterval(() => this.pump(), 400);
    this.pump();
  }

  stop(fade = 1.2) {
    if (!this.playing) return;
    this.playing = false;
    const c = getCtx();
    const o = this.out;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (o) {
      o.gain.cancelScheduledValues(c.currentTime);
      o.gain.setValueAtTime(o.gain.value, c.currentTime);
      o.gain.linearRampToValueAtTime(0.0001, c.currentTime + fade);
      window.setTimeout(() => o.disconnect(), fade * 1000 + 200);
    }
  }

  private pump() {
    const c = getCtx();
    while (this.next < c.currentTime + 1.5 && this.out) {
      const chord = PROG[this.step % PROG.length];
      this.pad(c, chord, this.next, 8);
      // sparse plucks
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const when = this.next + 0.8 + i * (6 / n) + Math.random() * 0.8;
        const note = PENT[Math.floor(Math.random() * PENT.length)] - (Math.random() < 0.3 ? 12 : 0);
        const src = c.createBufferSource();
        src.buffer = pluckBuffer(c, note, 3.2);
        const g = c.createGain();
        g.gain.value = 0.22 + Math.random() * 0.12;
        src.connect(g).connect(this.out);
        src.start(when);
        src.stop(when + 3.2);
      }
      this.next += 8;
      this.step++;
    }
  }

  private pad(c: AudioContext, midis: number[], t: number, dur: number) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 3);
    g.gain.setValueAtTime(0.16, t + dur - 1.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 2.5);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    g.connect(lp).connect(this.out!);
    for (const m of midis) {
      for (const det of [-8, 7]) {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiToFreq(m);
        o.detune.value = det;
        const og = c.createGain();
        og.gain.value = 0.18;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + dur + 2.6);
      }
    }
  }
}

export const ambient = new AmbientMusic();
