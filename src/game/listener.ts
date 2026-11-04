import { mic } from '../audio/mic';
import type { AnalysisFrame, Analyzer } from '../audio/analyzer';

export interface ListenResult {
  /** which of the targets were heard (by index) */
  heard: boolean[];
  frac: number;
  count: number;
  scores: number[];
}

/**
 * Wait for the player to play `targets` (a note or chord). Triggers `onHit` once an attack is seen and the
 * notes are stably audible. Used by quizzes, ear training and the chord trainer.
 */
export class NoteListener {
  private onsetAt = -1;
  private stable = 0;
  private lastSerial = -1;
  private unsub: (() => void) | null = null;
  best: ListenResult | null = null;

  constructor(private opts: { targets: number[]; need?: number; onHit: (r: ListenResult) => void; onFrame?: (r: ListenResult, f: AnalysisFrame) => void; needOnset?: boolean; stableFrames?: number }) {}

  start() {
    this.stop();
    this.onsetAt = -1;
    this.stable = 0;
    this.unsub = mic.onFrame((f, an) => this.frame(f, an));
  }
  stop() {
    this.unsub?.();
    this.unsub = null;
  }
  setTargets(t: number[]) {
    this.opts.targets = t;
    this.onsetAt = -1;
    this.stable = 0;
  }

  private frame(f: AnalysisFrame, an: Analyzer) {
    const { targets } = this.opts;
    if (!targets.length) return;
    if (f.onset) {
      this.onsetAt = f.t;
      this.stable = 0;
    }
    const ev = an.evaluate(targets);
    const res: ListenResult = { heard: ev.present, frac: ev.frac, count: ev.count, scores: ev.scores };
    this.opts.onFrame?.(res, f);
    const needOnset = this.opts.needOnset !== false;
    if (needOnset && (this.onsetAt < 0 || f.t - this.onsetAt > 1.2)) return;
    if (!f.gate) return;
    const need = this.opts.need ?? (targets.length === 1 ? 1 : Math.max(1, Math.ceil(targets.length * 0.7)));
    if (an.specSerial !== this.lastSerial) {
      this.lastSerial = an.specSerial;
      this.stable = ev.count >= need ? this.stable + 1 : 0;
    }
    if (this.stable >= (this.opts.stableFrames ?? (targets.length === 1 ? 5 : 3))) {
      this.best = res;
      this.onsetAt = -1;
      this.stable = 0;
      this.opts.onHit(res);
    }
  }
}
