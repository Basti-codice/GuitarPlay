import type { Analyzer, AnalysisFrame } from '../audio/analyzer';

export interface Target {
  id: number;
  /** song time in seconds (speed-independent “song seconds”) */
  time: number;
  midis: number[];
  legato: boolean;
  chord: boolean;
  /** index into the track's events */
  index: number;
}

export type Grade = 'perfect' | 'good' | 'ok' | 'wrong' | 'miss';

export interface JudgeResult {
  id: number;
  grade: Grade;
  /** + = late, in seconds */
  dt: number;
  /** detected pitch for wrong notes (MIDI) */
  detected?: number;
  /** best fraction of expected notes heard */
  frac: number;
  /** per expected note: heard or not (for chord feedback) */
  heard: boolean[];
  attempts: number;
}

export interface Strictness {
  id: 'easy' | 'normal' | 'strict';
  /** half window in seconds */
  window: number;
  perfect: number;
  good: number;
  /** fraction of chord notes required */
  chordNeed: number;
  presence: number;
}

export const STRICTNESS: Record<Strictness['id'], Strictness> = {
  easy: { id: 'easy', window: 0.26, perfect: 0.1, good: 0.17, chordNeed: 0.6, presence: 0.38 },
  normal: { id: 'normal', window: 0.19, perfect: 0.07, good: 0.12, chordNeed: 0.7, presence: 0.42 },
  strict: { id: 'strict', window: 0.13, perfect: 0.05, good: 0.09, chordNeed: 0.85, presence: 0.48 },
};

interface State {
  t: Target;
  onsetT: number | null;
  onsetSeen: number; // song time when the attack was seen (for settle logic)
  best: number;
  bestHeard: boolean[];
  wrong?: number;
  attempts: number;
  done: boolean;
  stable: number;
  lastSerial: number;
}

export type JudgeMode = 'realtime' | 'wait';

export class Judge {
  private states: State[];
  private onsets: { t: number; used: boolean }[] = [];
  results = new Map<number, JudgeResult>();
  onResult?: (r: JudgeResult, t: Target) => void;
  private cursor = 0;
  settle = 0.2;
  mode: JudgeMode = 'realtime';

  constructor(targets: Target[], public cfg: Strictness, mode: JudgeMode = 'realtime') {
    this.states = targets.map((t) => ({ t, onsetT: null, onsetSeen: 0, best: 0, bestHeard: t.midis.map(() => false), attempts: 0, done: false, stable: 0, lastSerial: -1 }));
    this.mode = mode;
  }

  get total() {
    return this.states.length;
  }

  need(t: Target) {
    const n = t.midis.length;
    if (n <= 1) return 1;
    return Math.max(1, Math.ceil(this.cfg.chordNeed * n - 1e-9));
  }

  /** First unresolved target (used by wait mode). */
  nextPending(): Target | undefined {
    for (let i = this.cursor; i < this.states.length; i++) {
      if (!this.states[i].done) {
        this.cursor = i;
        return this.states[i].t;
      }
    }
    return undefined;
  }

  reset(fromTime = -Infinity, toTime = Infinity) {
    for (const s of this.states) {
      if (s.t.time >= fromTime && s.t.time < toTime) {
        s.done = false;
        s.onsetT = null;
        s.best = 0;
        s.attempts = 0;
        s.stable = 0;
        s.wrong = undefined;
        this.results.delete(s.t.id);
      }
    }
    this.onsets = [];
    this.cursor = 0;
  }

  /** Mark everything before `time` as handled (used when seeking). */
  skipBefore(time: number) {
    for (const s of this.states) if (!s.done && s.t.time < time - 0.001) s.done = true;
  }

  private resolve(s: State, grade: Grade, dt: number, an?: Analyzer) {
    s.done = true;
    const res: JudgeResult = { id: s.t.id, grade, dt, frac: s.best, heard: s.bestHeard, attempts: s.attempts, detected: s.wrong };
    this.results.set(s.t.id, res);
    this.onResult?.(res, s.t);
    void an;
  }

  skipCurrent(songNow: number) {
    const t = this.nextPending();
    if (!t) return;
    const s = this.states[this.cursor];
    this.resolve(s, 'miss', 0);
    void songNow;
  }

  /**
   * Feed one analyser frame. `songNow` = song time of the frame, `toSong` converts mic-clock time to song time.
   */
  feed(frame: AnalysisFrame, an: Analyzer, songNow: number, onsetSong: number) {
    const w = this.cfg.window;
    if (frame.onset) this.onsets.push({ t: onsetSong, used: false });
    if (this.onsets.length > 40) this.onsets.splice(0, this.onsets.length - 40);
    const wait = this.mode === 'wait';
    for (let i = this.cursor; i < this.states.length; i++) {
      const s = this.states[i];
      if (s.done) {
        if (i === this.cursor) this.cursor++;
        continue;
      }
      const t = s.t;
      if (t.time - w > songNow) break; // events are sorted; later ones aren't open yet
      if (wait && i !== this.cursor) break; // only the current note in wait mode

      // 1. assign an onset
      if (s.onsetT == null && !t.legato) {
        let bi = -1,
          bd = Infinity;
        for (let k = 0; k < this.onsets.length; k++) {
          const o = this.onsets[k];
          if (o.used) continue;
          const d = o.t - t.time;
          if (wait ? o.t >= t.time - 0.35 : Math.abs(d) <= w) {
            if (Math.abs(d) < bd) {
              bd = Math.abs(d);
              bi = k;
            }
          }
        }
        if (bi >= 0) {
          this.onsets[bi].used = true;
          s.onsetT = this.onsets[bi].t;
          s.onsetSeen = songNow;
        }
      }
      // 2. presence check
      const armed = t.legato ? songNow >= t.time - w : s.onsetT != null;
      if (armed && frame.gate) {
        const ev = an.evaluate(t.midis);
        const fresh = an.specSerial !== s.lastSerial;
        s.lastSerial = an.specSerial;
        if (fresh) s.stable = ev.count >= this.need(t) ? s.stable + 1 : 0;
        if (ev.frac > s.best || (ev.frac === s.best && ev.count > s.bestHeard.filter(Boolean).length)) {
          s.best = ev.frac;
          s.bestHeard = ev.present;
        }
        if (ev.count >= this.need(t) && s.stable >= 3) {
          const dt = t.legato ? 0 : (s.onsetT as number) - t.time;
          const ad = Math.abs(dt);
          let grade: Grade;
          if (wait) grade = s.attempts === 0 ? 'perfect' : s.attempts === 1 ? 'good' : 'ok';
          else grade = ad <= this.cfg.perfect ? 'perfect' : ad <= this.cfg.good ? 'good' : 'ok';
          s.best = ev.frac;
          s.bestHeard = ev.present;
          this.resolve(s, grade, dt, an);
          continue;
        }
        if (frame.pitch && frame.pitch.clarity > 0.85 && s.onsetT != null) s.wrong = Math.round(frame.pitch.midi);
      }
      // 3. expiry
      if (wait) {
        if (s.onsetT != null && songNow - s.onsetSeen > this.settle + 0.15) {
          s.attempts++;
          s.onsetT = null;
          s.stable = 0;
        }
      } else if (songNow > t.time + w + this.settle) {
        this.resolve(s, s.onsetT != null ? 'wrong' : 'miss', s.onsetT != null ? s.onsetT - t.time : 0, an);
      }
    }
    // drop old onsets
    while (this.onsets.length && this.onsets[0].t < songNow - 1.5) this.onsets.shift();
  }

  /** Expire events even when no audio frames arrive (e.g. mic stalled). */
  tick(songNow: number) {
    if (this.mode === 'wait') return;
    const w = this.cfg.window;
    for (let i = this.cursor; i < this.states.length; i++) {
      const s = this.states[i];
      if (s.done) {
        if (i === this.cursor) this.cursor++;
        continue;
      }
      if (songNow > s.t.time + w + this.settle + 0.1) this.resolve(s, s.onsetT != null ? 'wrong' : 'miss', 0);
      else break;
    }
  }

  allDone() {
    return this.states.every((s) => s.done);
  }
}

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  counts: Record<Grade, number>;
  judged: number;
  /** weighted accuracy 0..1 */
  accuracy: number;
}

export function newScore(): ScoreState {
  return { score: 0, combo: 0, maxCombo: 0, counts: { perfect: 0, good: 0, ok: 0, wrong: 0, miss: 0 }, judged: 0, accuracy: 1 };
}

const POINTS: Record<Grade, number> = { perfect: 100, good: 70, ok: 40, wrong: 0, miss: 0 };
const WEIGHT: Record<Grade, number> = { perfect: 1, good: 0.85, ok: 0.6, wrong: 0, miss: 0 };

export const multiplier = (combo: number) => Math.min(4, 1 + Math.floor(combo / 10));

export function applyResult(s: ScoreState, g: Grade, notes = 1) {
  s.counts[g]++;
  s.judged++;
  if (g === 'wrong' || g === 'miss') s.combo = 0;
  else {
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.score += POINTS[g] * multiplier(s.combo) * (notes > 1 ? 1.5 : 1);
  }
  let w = 0;
  (Object.keys(s.counts) as Grade[]).forEach((k) => (w += s.counts[k] * WEIGHT[k]));
  s.accuracy = w / s.judged;
}

export function starsFor(accuracy: number): number {
  return accuracy >= 0.95 ? 3 : accuracy >= 0.85 ? 2 : accuracy >= 0.65 ? 1 : 0;
}
