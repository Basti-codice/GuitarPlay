import type { Song, Track } from '../core/types';
import { tabMidi } from '../core/music';
import { Timeline } from '../core/timeline';
import { getCtx } from './engine';
import { playPluck, playStrum } from './synth';

let active: AudioBufferSourceNode[] = [];
let stopTimer: number | null = null;

export function stopPreview() {
  for (const s of active) {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
  }
  active = [];
  if (stopTimer !== null) window.clearTimeout(stopTimer);
  stopTimer = null;
}

/** Play a track through the synth (for listening to imports/edits). Returns the length in seconds. */
export function playPreview(song: Song, track: Track, fromBeat = 0, maxSeconds = 90, onEnd?: () => void): number {
  stopPreview();
  const c = getCtx();
  const tl = Timeline.fromSong(song);
  const t0 = c.currentTime + 0.1;
  const base = tl.toSec(fromBeat);
  let end = 0;
  for (const ev of track.events) {
    if (ev.beat < fromBeat - 1e-6) continue;
    const at = tl.toSec(ev.beat) - base;
    if (at > maxSeconds) break;
    const dur = Math.max(0.25, tl.toSec(ev.beat + ev.dur) - tl.toSec(ev.beat));
    const midis = ev.notes.filter((n) => !n.dead && !n.tie).map((n) => tabMidi(song.tuning, song.capo, n.string, n.fret));
    if (!midis.length) continue;
    if (midis.length === 1) active.push(playPluck(midis[0], t0 + at, { gain: 0.6, hold: dur + 0.3, reverb: 0.15 }));
    else active.push(...playStrum(midis, t0 + at, ev.strum ?? 'd', { gain: 0.45, hold: dur + 0.4, reverb: 0.15 }));
    end = Math.max(end, at + dur);
  }
  if (onEnd) stopTimer = window.setTimeout(onEnd, (end + 0.6) * 1000);
  return end;
}
