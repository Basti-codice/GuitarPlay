import { getSettings, subscribeSettings } from '../core/settings';

let ctx: AudioContext | null = null;

export interface Buses {
  master: GainNode;
  music: GainNode;
  backing: GainNode;
  ref: GainNode;
  click: GainNode;
  reverbSend: GainNode;
}
let buses: Buses | null = null;

function impulse(c: AudioContext, seconds = 2.4, decay = 3): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 3;
    const master = ctx.createGain();
    master.connect(comp).connect(ctx.destination);
    const mk = () => {
      const g = ctx!.createGain();
      g.connect(master);
      return g;
    };
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.6;
    reverb.connect(reverbOut).connect(master);
    const reverbSend = ctx.createGain();
    reverbSend.connect(reverb);
    buses = { master, music: mk(), backing: mk(), ref: mk(), click: mk(), reverbSend };
    applyVolumes();
    subscribeSettings(applyVolumes);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const ctxRunning = () => !!ctx && ctx.state === 'running';

export function getBuses(): Buses {
  getCtx();
  return buses!;
}

export function applyVolumes() {
  if (!buses) return;
  const s = getSettings();
  const t = ctx!.currentTime;
  const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.05);
  set(buses.master, s.volMaster);
  set(buses.music, s.volMusic);
  set(buses.backing, s.volBacking);
  set(buses.ref, s.volRef);
  set(buses.click, s.volClick);
}

let noiseBuf: AudioBuffer | null = null;
export function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Short click used by metronome and count-in. */
export function scheduleClick(time: number, accent: boolean, level = 1) {
  const c = getCtx();
  const b = getBuses();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.5 * level, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
  o.connect(g).connect(b.click);
  o.start(time);
  o.stop(time + 0.06);
}
