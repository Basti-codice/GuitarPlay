import type { NoteEvent, Song, Track } from '../core/types';
import { Timeline } from '../core/timeline';
import { tabMidi } from '../core/music';
import { getSettings } from '../core/settings';
import { mic } from '../audio/mic';
import { getCtx, scheduleClick } from '../audio/engine';
import { playPluck, playStrum } from '../audio/synth';
import { BackingBand } from '../audio/backing';
import { applyResult, Judge, newScore, STRICTNESS, starsFor, type Grade, type JudgeResult, type JudgeMode, type ScoreState, type Target } from './judge';
import { barBeats } from '../songs/arrange';
import type { SessionRecord } from '../core/progress';

export type PlayMode = 'realtime' | 'wait' | 'listen';
export type SessionState = 'ready' | 'playing' | 'paused' | 'finished';

export interface SessionOpts {
  song: Song;
  trackId: string;
  speed: number;
  mode: PlayMode;
  loop?: { startBeat: number; endBeat: number } | null;
  countIn?: boolean;
  /** play backing band / reference guitar / click (ignored in wait mode) */
  backing?: boolean;
  reference?: boolean;
  click?: boolean;
}

export interface HitFx {
  eventIndex: number;
  grade: Grade;
  t: number;
}

export function eventTargets(song: Song, track: Track, tl: Timeline, speed: number): Target[] {
  const out: Target[] = [];
  track.events.forEach((ev, index) => {
    const notes = ev.notes.filter((n) => !n.dead && !n.tie);
    if (!notes.length) return;
    out.push({
      id: index,
      index,
      time: tl.toSec(ev.beat) / speed,
      midis: notes.map((n) => tabMidi(song.tuning, song.capo, n.string, n.fret)),
      legato: !!ev.legato,
      chord: notes.length > 1,
    });
  });
  return out;
}

export class PlaySession {
  readonly song: Song;
  readonly track: Track;
  readonly tl: Timeline;
  readonly speed: number;
  readonly mode: PlayMode;
  readonly beatStep: number;
  state: SessionState = 'ready';
  score: ScoreState = newScore();
  judge: Judge;
  results = new Map<number, JudgeResult>();
  fx: HitFx[] = [];
  targets: Target[];
  holding = false;
  startedAt = 0;
  playedSeconds = 0;
  endBeat: number;
  loop: SessionOpts['loop'];
  listeners = { result: new Set<(r: JudgeResult, t: Target) => void>(), state: new Set<() => void>() };
  timing: number[] = [];
  weak: { key: string; hit: boolean }[] = [];
  /** currently detected pitch (for HUD) */
  detected: { midi: number; clarity: number } | null = null;

  private t0 = 0; // ctx time corresponding to play time 0
  private pausedAt = 0;
  private offLatency: number;
  private unsub: (() => void) | null = null;
  private band = new BackingBand();
  private refTimer: number | null = null;
  private refQueue: { p: number; ev: NoteEvent }[] = [];
  private refIdx = 0;
  private clickIdx = 0;
  private clickTimes: { p: number; accent: boolean }[] = [];
  private opts: SessionOpts;
  private lastTick = 0;
  private countInBeats = 0;

  constructor(opts: SessionOpts) {
    this.opts = opts;
    this.song = opts.song;
    this.track = opts.song.tracks.find((t) => t.id === opts.trackId) ?? opts.song.tracks[0];
    this.speed = opts.speed;
    this.mode = opts.mode;
    this.tl = Timeline.fromSong(opts.song);
    this.loop = opts.loop ?? null;
    const compound = this.song.beatUnit === 8 && this.song.beatsPerBar % 3 === 0;
    this.beatStep = compound ? 1.5 : 4 / this.song.beatUnit;
    const last = this.track.events[this.track.events.length - 1];
    this.endBeat = last ? last.beat + last.dur : 0;
    this.offLatency = getSettings().latencyMs / 1000;
    this.targets = eventTargets(this.song, this.track, this.tl, this.speed);
    const strict = STRICTNESS[getSettings().strictness];
    const jm: JudgeMode = this.mode === 'wait' ? 'wait' : 'realtime';
    this.judge = new Judge(this.targets, strict, jm);
    this.judge.onResult = (r, t) => this.onResult(r, t);
  }

  get a() {
    return getCtx();
  }

  /** play time in seconds (0 = song start at the selected speed) */
  playTime(): number {
    if (this.state === 'paused' || this.state === 'ready') return this.pausedAt;
    if (this.holding) return this.holdAt;
    return this.a.currentTime - this.t0;
  }
  private holdAt = 0;
  songBeat(): number {
    return this.tl.toBeat(this.playTime() * this.speed);
  }
  get isListen() {
    return this.mode === 'listen';
  }

  private emitState() {
    this.listeners.state.forEach((l) => l());
  }

  private onResult(r: JudgeResult, t: Target) {
    this.results.set(r.id, r);
    applyResult(this.score, r.grade, t.midis.length);
    this.fx.push({ eventIndex: r.id, grade: r.grade, t: performance.now() });
    if (r.grade !== 'miss' && r.grade !== 'wrong') this.timing.push(r.dt);
    const ev = this.track.events[r.id];
    const ok = r.grade !== 'miss' && r.grade !== 'wrong';
    for (const n of ev.notes) if (!n.dead && !n.tie) this.weak.push({ key: `${n.string}:${n.fret}`, hit: ok });
    this.listeners.result.forEach((l) => l(r, t));
  }

  private buildRef() {
    this.refQueue = this.track.events.map((ev) => ({ p: this.tl.toSec(ev.beat) / this.speed, ev }));
  }

  private buildClicks() {
    const arr: { p: number; accent: boolean }[] = [];
    const bl = barBeats(this.song);
    const pickup = this.song.pickup ?? 0;
    const total = this.song.lengthBeats + 2 * bl;
    const step = this.beatStep;
    // count-in beats before the first full bar
    this.countInBeats = this.opts.countIn === false ? 0 : Math.round(bl / step);
    for (let k = this.countInBeats; k >= 1; k--) arr.push({ p: this.tl.toSec(pickup - k * step) / this.speed, accent: k === this.countInBeats });
    for (let b = pickup; b < total; b += step) {
      const idx = Math.round((b - pickup) / step);
      arr.push({ p: this.tl.toSec(b) / this.speed, accent: idx % Math.round(bl / step) === 0 });
    }
    this.clickTimes = arr;
  }

  /** begin at a given beat (defaults to start). */
  async start(fromBeat = 0, withCountIn = true) {
    const c = getCtx();
    await c.resume();
    this.buildRef();
    this.buildClicks();
    const pickup = this.song.pickup ?? 0;
    const leadBeats = withCountIn && this.opts.countIn !== false && this.mode !== 'listen' ? this.countInBeats : 0;
    const startP = this.tl.toSec(fromBeat === 0 ? pickup - leadBeats * this.beatStep : fromBeat - leadBeats * this.beatStep) / this.speed - 0.35;
    this.t0 = c.currentTime - startP;
    this.state = 'playing';
    this.holding = false;
    this.startedAt = performance.now();
    this.refIdx = this.refQueue.findIndex((q) => q.p >= startP + 0.35 - 1e-6 && this.tl.toBeat(q.p * this.speed) >= fromBeat - 1e-6);
    if (this.refIdx < 0) this.refIdx = this.refQueue.length;
    this.clickIdx = this.clickTimes.findIndex((q) => q.p >= startP);
    if (this.clickIdx < 0) this.clickIdx = this.clickTimes.length;
    this.judge.reset(this.tl.toSec(fromBeat) / this.speed - 0.001);
    this.judge.skipBefore(this.tl.toSec(fromBeat) / this.speed);
    if (this.mode !== 'listen') this.attachMic();
    this.startAudio(fromBeat);
    this.lastTick = performance.now();
    this.emitState();
  }

  private startAudio(fromBeat: number) {
    const s = getSettings();
    const wait = this.mode === 'wait';
    const backing = !wait && (this.opts.backing ?? s.backingOn);
    const ref = this.isListen || (!wait && (this.opts.reference ?? s.refOn));
    if (backing && this.song.chords.length) this.band.start(this.song, this.tl, this.t0 + 0, this.speed, fromBeat);
    if (ref || this.isListen) this.refTimer = window.setInterval(() => this.pumpRef(ref), 25);
    else this.refTimer = window.setInterval(() => this.pumpRef(false), 25);
  }

  private pumpRef(playRef: boolean) {
    if (this.state !== 'playing') return;
    const c = this.a;
    const s = getSettings();
    const wait = this.mode === 'wait';
    const clickOn = this.mode === 'listen' ? false : !wait && (this.opts.click ?? s.clickOn);
    const horizon = c.currentTime + 0.18;
    while (this.refIdx < this.refQueue.length) {
      const q = this.refQueue[this.refIdx];
      const when = this.t0 + q.p;
      if (when > horizon) break;
      if (playRef && when >= c.currentTime - 0.03 && !this.holding) this.playEvent(q.ev, Math.max(when, c.currentTime));
      this.refIdx++;
    }
    while (this.clickIdx < this.clickTimes.length) {
      const q = this.clickTimes[this.clickIdx];
      const when = this.t0 + q.p;
      if (when > horizon) break;
      const inCountIn = this.tl.toBeat(q.p * this.speed) < (this.song.pickup ?? 0) - 1e-6;
      if (when >= c.currentTime - 0.03 && !this.holding && ((inCountIn && this.opts.countIn !== false && this.mode !== 'listen') || clickOn)) scheduleClick(Math.max(when, c.currentTime), q.accent);
      this.clickIdx++;
    }
  }

  private playEvent(ev: NoteEvent, when: number) {
    const midis = ev.notes.filter((n) => !n.tie).map((n) => tabMidi(this.song.tuning, this.song.capo, n.string, n.fret));
    if (!midis.length) return;
    const hold = Math.max(0.25, (ev.dur * 60) / this.song.bpm / this.speed);
    if (midis.length === 1) playPluck(midis[0], when, { gain: 0.6, hold: hold + 0.4, reverb: 0.15 });
    else playStrum(midis, when, ev.strum ?? 'd', { gain: 0.42, hold: hold + 0.6, reverb: 0.15 });
  }

  private attachMic() {
    this.unsub?.();
    this.unsub = mic.onFrame((f, an) => {
      if (this.state !== 'playing') return;
      this.detected = f.pitch ? { midi: f.pitch.midi, clarity: f.pitch.clarity } : null;
      const now = f.t - this.t0 - this.offLatency;
      const onset = f.onsetTime - this.t0 - this.offLatency;
      this.judge.feed(f, an, now, onset);
    });
  }

  /** Called every animation frame by the UI. */
  tick() {
    if (this.state !== 'playing') return;
    const c = this.a;
    const nowMs = performance.now();
    const dt = (nowMs - this.lastTick) / 1000;
    this.lastTick = nowMs;
    if (this.mode === 'wait') {
      const next = this.judge.nextPending();
      const p = c.currentTime - this.t0;
      if (next && !this.holding && p >= next.time) {
        this.holding = true;
        this.holdAt = next.time;
      } else if (this.holding) {
        if (!next || next.time > this.holdAt + 1e-6) {
          // released: shift clock so play time continues from the held position
          this.holding = false;
          this.t0 = c.currentTime - this.holdAt;
        } else {
          this.t0 += 0; // frozen: playTime() returns holdAt
        }
      }
    }
    if (this.state === 'playing' && !this.holding) this.playedSeconds += dt;
    const p = this.playTime();
    this.judge.tick(p - this.offLatency);
    // loop
    if (this.loop && this.songBeat() >= this.loop.endBeat) {
      void this.restartAt(this.loop.startBeat);
      return;
    }
    const endP = this.tl.toSec(this.endBeat) / this.speed + 1.2;
    if (p > endP && (this.judge.allDone() || this.mode === 'listen' || p > endP + 1)) this.finish();
  }

  async restartAt(beat: number) {
    this.stopAudio();
    this.results.forEach((_, id) => {
      const t = this.targets.find((x) => x.id === id);
      if (t && this.tl.toBeat(t.time * this.speed) >= beat - 1e-6) this.results.delete(id);
    });
    await this.start(beat, false);
  }

  setLoop(loop: SessionOpts['loop']) {
    this.loop = loop;
  }

  private stopAudio() {
    this.band.stop();
    if (this.refTimer !== null) window.clearInterval(this.refTimer);
    this.refTimer = null;
    this.unsub?.();
    this.unsub = null;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.pausedAt = this.playTime();
    this.state = 'paused';
    this.stopAudio();
    this.emitState();
  }

  async resume() {
    if (this.state !== 'paused') return;
    const beat = Math.max(0, this.tl.toBeat(this.pausedAt * this.speed));
    await this.start(Math.max(0, beat - 0.01), true);
  }

  skipCurrent() {
    this.judge.skipCurrent(this.playTime());
  }

  finish() {
    if (this.state === 'finished') return;
    this.stopAudio();
    this.state = 'finished';
    this.emitState();
  }

  stop() {
    this.stopAudio();
    this.state = 'finished';
  }

  summary(): SessionRecord {
    const total = this.targets.length;
    const stars = starsFor(this.score.accuracy);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      songId: this.song.id,
      title: this.song.title,
      trackId: this.track.id,
      accuracy: this.score.judged ? this.score.accuracy : 0,
      score: Math.round(this.score.score),
      stars,
      durationSec: Math.round(this.playedSeconds),
      mode: this.mode,
      speed: this.speed,
      notes: total,
      maxCombo: this.score.maxCombo,
    };
  }

  /** Called when a simulated “virtual player” is wanted (tests/demo). */
  async attachVirtualPlayer(opts: { jitter?: number; errorRate?: number } = {}) {
    const input = await mic.startSimulated();
    const c = this.a;
    const { renderPluck } = await import('../audio/ksynth');
    const { midiToFreq } = await import('../core/music');
    const jitter = opts.jitter ?? 0.025;
    const err = opts.errorRate ?? 0;
    const startBeat = 0;
    for (const t of this.targets) {
      if (this.tl.toBeat(t.time * this.speed) < startBeat) continue;
      const when = this.t0 + t.time + (Math.random() * 2 - 1) * jitter + this.offLatency;
      if (when < c.currentTime) continue;
      const wrong = Math.random() < err;
      const midis = wrong ? t.midis.map((m) => m + 2) : t.midis;
      [...midis]
        .sort((a, b) => a - b)
        .forEach((m, i) => {
          const data = renderPluck(midiToFreq(m), 1.4, c.sampleRate, { seed: m * 3 + i, amp: 0.5 / Math.sqrt(midis.length) });
          const buf = c.createBuffer(1, data.length, c.sampleRate);
          buf.getChannelData(0).set(data);
          const src = c.createBufferSource();
          src.buffer = buf;
          src.connect(input);
          src.start(when + i * 0.012);
        });
    }
  }
}

export const defaultTrack = (s: Song) => s.tracks.find((t) => t.kind === 'melody') ?? s.tracks[0];
