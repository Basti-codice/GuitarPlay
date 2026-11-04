import { getCtx, scheduleClick } from './engine';

export interface MetronomeOpts {
  bpm: number;
  /** beats per bar (clicks per bar before subdivision) */
  beats: number;
  /** subdivisions per beat: 1,2,3,4 */
  subdiv: number;
  accentFirst: boolean;
  /** per-beat mute pattern (true = silent) */
  muted?: boolean[];
}

export class Metronome {
  private timer: number | null = null;
  private next = 0;
  private idx = 0;
  opts: MetronomeOpts;
  onTick?: (beat: number, sub: number, time: number) => void;
  constructor(opts: MetronomeOpts) {
    this.opts = opts;
  }
  get running() {
    return this.timer !== null;
  }
  start() {
    const c = getCtx();
    this.idx = 0;
    this.next = c.currentTime + 0.08;
    this.timer = window.setInterval(() => this.pump(), 25);
    this.pump();
  }
  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
  private pump() {
    const c = getCtx();
    while (this.next < c.currentTime + 0.15) {
      const { bpm, beats, subdiv, accentFirst, muted } = this.opts;
      const per = beats * subdiv;
      const k = this.idx % per;
      const beat = Math.floor(k / subdiv),
        sub = k % subdiv;
      if (!(muted?.[beat] && sub === 0)) {
        const strong = beat === 0 && sub === 0 && accentFirst;
        scheduleClick(this.next, strong, sub === 0 ? 1 : 0.45);
      }
      this.onTick?.(beat, sub, this.next);
      this.next += 60 / bpm / subdiv;
      this.idx++;
    }
  }
}
