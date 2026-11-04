import { midiToFreq } from '../core/music';
import { renderPluck } from './ksynth';
import { getBuses, getCtx } from './engine';

const cache = new Map<string, AudioBuffer>();

export function pluckBuffer(c: AudioContext, midi: number, seconds = 3.2): AudioBuffer {
  const key = `${c.sampleRate}:${midi}:${seconds}`;
  let b = cache.get(key);
  if (!b) {
    const data = renderPluck(midiToFreq(midi), seconds, c.sampleRate, { bright: 0.5, amp: 0.55 });
    b = c.createBuffer(1, data.length, c.sampleRate);
    b.getChannelData(0).set(data);
    cache.set(key, b);
  }
  return b;
}

export interface PlayOpts {
  gain?: number;
  dest?: AudioNode;
  reverb?: number;
  /** note length in seconds before fade out */
  hold?: number;
}

export function playPluck(midi: number, when: number, o: PlayOpts = {}) {
  const c = getCtx();
  const b = getBuses();
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(c, midi);
  const g = c.createGain();
  g.gain.value = o.gain ?? 0.6;
  const hold = o.hold ?? 3;
  if (hold < 3) {
    g.gain.setValueAtTime(o.gain ?? 0.6, when + hold);
    g.gain.exponentialRampToValueAtTime(0.0005, when + hold + 0.25);
  }
  src.connect(g).connect(o.dest ?? b.ref);
  if (o.reverb) {
    const s = c.createGain();
    s.gain.value = o.reverb;
    g.connect(s).connect(b.reverbSend);
  }
  src.start(when);
  src.stop(when + Math.min(3.2, hold + 0.3));
  return src;
}

/** Play a chord as a strum (down = low->high). */
export function playStrum(midis: number[], when: number, dir: 'd' | 'u' = 'd', o: PlayOpts = {}) {
  const sorted = [...midis].sort((a, b) => a - b);
  const order = dir === 'd' ? sorted : sorted.reverse();
  order.forEach((m, i) => playPluck(m, when + i * 0.013, { gain: (o.gain ?? 0.45) * (dir === 'u' ? 0.8 : 1), ...o }));
}
