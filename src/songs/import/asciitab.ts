import type { Song } from '../../core/types';
import { parseTabText } from './tabtext';

/** Back-compat wrapper: plain ASCII tab (headers optional). */
export function parseAsciiTab(text: string, opts: { bpm?: number; perBeat?: number; title?: string } = {}): Song {
  const r = parseTabText(text, {
    title: opts.title,
    tempo: opts.bpm,
    grid: opts.perBeat ? opts.perBeat * 4 : undefined,
  });
  return r.song;
}
