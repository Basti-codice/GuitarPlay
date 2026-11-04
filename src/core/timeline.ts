import type { Song, TempoPoint } from './types';

/** Converts between beats and seconds honouring tempo changes. */
export class Timeline {
  private pts: { beat: number; sec: number; spb: number }[] = [];
  constructor(bpm: number, tempoMap?: TempoPoint[]) {
    const map = (tempoMap && tempoMap.length ? [...tempoMap] : [{ beat: 0, bpm }]).sort((a, b) => a.beat - b.beat);
    if (map[0].beat > 0) map.unshift({ beat: 0, bpm });
    let sec = 0;
    for (let i = 0; i < map.length; i++) {
      const spb = 60 / map[i].bpm;
      this.pts.push({ beat: map[i].beat, sec, spb });
      if (i + 1 < map.length) sec += (map[i + 1].beat - map[i].beat) * spb;
    }
  }
  static fromSong(s: Song) {
    return new Timeline(s.bpm, s.tempoMap);
  }
  toSec(beat: number): number {
    if (beat < 0) return beat * this.pts[0].spb;
    let p = this.pts[0];
    for (let i = this.pts.length - 1; i >= 0; i--) {
      if (this.pts[i].beat <= beat) {
        p = this.pts[i];
        break;
      }
    }
    return p.sec + (beat - p.beat) * p.spb;
  }
  toBeat(sec: number): number {
    if (sec < 0) return sec / this.pts[0].spb;
    let p = this.pts[0];
    for (let i = this.pts.length - 1; i >= 0; i--) {
      if (this.pts[i].sec <= sec) {
        p = this.pts[i];
        break;
      }
    }
    return p.beat + (sec - p.sec) / p.spb;
  }
  bpmAt(beat: number): number {
    let p = this.pts[0];
    for (const q of this.pts) if (q.beat <= beat) p = q;
    return 60 / p.spb;
  }
}
