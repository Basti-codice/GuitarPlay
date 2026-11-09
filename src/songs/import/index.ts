import type { Song } from '../../core/types';
import { buildSong } from '../arrange';
import { parseAbc } from '../abc';
import { importWithAlphaTab } from './gp';
import { midiToSong } from './midi';
import { parseAsciiTab } from './asciitab';
import { parseTabText } from './tabtext';

export interface Imported {
  song: Song;
  notes: string[];
}

export async function importFile(file: File): Promise<Imported> {
  const name = file.name;
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (['gp3', 'gp4', 'gp5', 'gpx', 'gp', 'xml', 'musicxml', 'mxl', 'atex', 'alphatex'].includes(ext)) {
    const r = await importWithAlphaTab(bytes, name);
    return { song: r.song, notes: r.info };
  }
  if (['mid', 'midi'].includes(ext)) return { song: midiToSong(bytes, name), notes: ['MIDI converted with automatic fretting – check the result in the editor.'] };
  const text = new TextDecoder().decode(bytes);
  if (ext === 'abc' || /^\s*X:\s*\d+/m.test(text)) return importAbcText(text);
  if (['txt', 'tab'].includes(ext)) {
    const r = parseTabText(text, { title: name.replace(/\.[^.]+$/, '') });
    return { song: r.song, notes: r.warnings };
  }
  throw new Error(`Unsupported file type “.${ext}”. Use Guitar Pro (.gp3-.gp), MusicXML, MIDI, ABC or a text tab.`);
}

export function importAbcText(text: string): Imported {
  const tune = parseAbc(text);
  if (!tune.items.length) throw new Error('The ABC text contains no notes.');
  const song = buildSong({ abc: text, genre: 'Imported', difficulty: 3 }, tune);
  song.id = `import-abc-${Date.now().toString(36)}`;
  song.source = 'user';
  song.tags = ['imported', 'abc'];
  song.createdAt = Date.now();
  return { song, notes: tune.warnings };
}

export { parseAsciiTab, parseTabText };
