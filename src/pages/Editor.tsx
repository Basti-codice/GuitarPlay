import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHead, Seg } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { getSong, registerTempSong, saveUserSong, useSongs } from '../core/songs-store';
import { navigate, useRoute } from '../core/router';
import { TUNINGS, STANDARD, tabMidi, tuningLabels } from '../core/music';
import type { ChordMark, NoteEvent, Song } from '../core/types';
import { getCtx } from '../audio/engine';
import { playPluck, playStrum } from '../audio/synth';
import { bump } from '../core/progress';
import { toast } from '../ui/toast';
import { idbGet, lsGet } from '../core/storage';
import type { SheetItem } from '../core/backup';
import { importAbcText, parseAsciiTab } from '../songs/import';
import { SheetViewer } from './ImportPage';
import { parseAbc } from '../songs/abc';

type Cells = Record<number, (number | undefined)[]>; // col -> fret per string (index 0 = low E)

const emptyRow = () => [undefined, undefined, undefined, undefined, undefined, undefined] as (number | undefined)[];

export function Editor({ id }: { id?: string }) {
  useSongs();
  const route = useRoute();
  const existing = id && id !== 'draft' ? getSong(id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? 'My new song');
  const [artist, setArtist] = useState(existing?.artist ?? 'Me');
  const [bpm, setBpm] = useState(existing?.bpm ?? 90);
  const [num, setNum] = useState(existing?.beatsPerBar ?? 4);
  const [den, setDen] = useState(existing?.beatUnit ?? 4);
  const [tuningId, setTuningId] = useState('standard');
  const [capo, setCapo] = useState(existing?.capo ?? 0);
  const [genre, setGenre] = useState(existing?.genre ?? 'Custom');
  const [difficulty, setDifficulty] = useState<number>(existing?.difficulty ?? 2);
  const [spb, setSpb] = useState(2); // columns per beat
  const [cols, setCols] = useState(32);
  const [cells, setCells] = useState<Cells>({});
  const [chords, setChords] = useState<Record<number, string>>({});
  const [sel, setSel] = useState<{ c: number; s: number }>({ c: 0, s: 5 });
  const [mode, setMode] = useState<'grid' | 'abc'>('grid');
  const [abc, setAbc] = useState('X:1\nT:My tune\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\n"C"C D E F | "G"G4 |]');
  const [sheet, setSheet] = useState<SheetItem | null>(null);
  const [warn, setWarn] = useState<string[]>([]);
  const typing = useRef({ t: 0, buf: '' });
  const tuning = TUNINGS.find((t) => t.id === tuningId)?.notes ?? STANDARD;
  const labels = tuningLabels(tuning);
  const barCols = Math.round(((num * 4) / den) * spb);

  // load from an existing song / draft / sheet
  useEffect(() => {
    if (existing) {
      const tr = existing.tracks[0];
      const frac = tr.events.some((e) => Math.abs(e.beat * 4 - Math.round(e.beat * 4)) > 1e-3 || Math.abs(e.beat * 2 - Math.round(e.beat * 2)) > 1e-3);
      const sp = frac ? 4 : 2;
      setSpb(sp);
      const c: Cells = {};
      const ch: Record<number, string> = {};
      let maxCol = 0;
      for (const ev of tr.events) {
        const col = Math.round(ev.beat * sp);
        const row = c[col] ?? emptyRow();
        for (const n of ev.notes) row[n.string] = n.fret;
        c[col] = row;
        maxCol = Math.max(maxCol, col);
        if (ev.chord) ch[col] = ev.chord;
      }
      for (const m of existing.chords) ch[Math.round(m.beat * sp)] = m.name;
      setCells(c);
      setChords(ch);
      const bc = Math.round(((existing.beatsPerBar * 4) / existing.beatUnit) * sp);
      setCols(Math.max(bc * 2, Math.ceil((maxCol + 1) / bc) * bc));
      if (existing.tracks.length > 1) toast(`Editing the first track (“${tr.name}”) of ${existing.tracks.length}`);
    }
    if (id === 'draft') {
      const d = lsGet<{ kind: 'abc' | 'tab'; text: string; sheetId?: string; title?: string } | null>('guitarplay.draft', null);
      if (d) {
        if (d.kind === 'abc') {
          setAbc(d.text);
          setMode('abc');
        } else {
          try {
            loadSong(parseAsciiTab(d.text, { title: d.title }));
          } catch {
            toast('Could not read the transcription as tab.');
          }
        }
        if (d.title) setTitle(d.title);
        if (d.sheetId) void idbGet<SheetItem>('sheets', d.sheetId).then((s) => s && setSheet(s));
      }
    }
    const sh = route.query.get('sheet');
    if (sh) void idbGet<SheetItem>('sheets', sh).then((s) => s && setSheet(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function loadSong(s: Song) {
    const tr = s.tracks[0];
    const sp = 2;
    setBpm(s.bpm);
    const c: Cells = {};
    let maxCol = 0;
    for (const ev of tr.events) {
      const col = Math.round(ev.beat * sp);
      const row = c[col] ?? emptyRow();
      for (const n of ev.notes) row[n.string] = n.fret;
      c[col] = row;
      maxCol = Math.max(maxCol, col);
    }
    setSpb(sp);
    setCells(c);
    setCols(Math.ceil((maxCol + 1) / 8) * 8 + 8);
  }

  const buildSongObj = useCallback((): Song => {
    const events: NoteEvent[] = [];
    const used = Object.keys(cells).map(Number).filter((c) => cells[c].some((f) => f !== undefined)).sort((a, b) => a - b);
    used.forEach((c, i) => {
      const nextCol = used[i + 1] ?? c + spb;
      const dur = Math.min(4, (nextCol - c) / spb);
      const notes = cells[c].map((f, s) => (f === undefined ? null : { string: s, fret: f })).filter(Boolean) as { string: number; fret: number }[];
      events.push({ beat: c / spb, dur, notes, chord: chords[c] });
    });
    const marks: ChordMark[] = Object.keys(chords)
      .map(Number)
      .sort((a, b) => a - b)
      .map((c, i, arr) => ({ beat: c / spb, name: chords[c], dur: ((arr[i + 1] ?? cols) - c) / spb }));
    const lastCol = used.length ? used[used.length - 1] + spb : spb * 4;
    const barB = (num * 4) / den;
    return {
      id: existing?.id ?? `user-${Date.now().toString(36)}`,
      title: title.trim() || 'Untitled',
      artist,
      genre,
      difficulty: difficulty as 1,
      bpm,
      beatsPerBar: num,
      beatUnit: den,
      tuning,
      capo,
      tracks: [{ id: 'main', name: 'Tab', kind: 'other', events }],
      chords: marks,
      lengthBeats: Math.ceil(lastCol / spb / barB) * barB,
      source: 'user',
      tags: ['custom'],
      pickup: 0,
      sheetIds: sheet ? [sheet.id] : existing?.sheetIds,
      createdAt: existing?.createdAt ?? Date.now(),
      style: existing?.style,
    };
  }, [cells, chords, spb, cols, num, den, title, artist, genre, difficulty, bpm, tuning, capo, existing, sheet]);

  const setCell = (c: number, s: number, f: number | undefined) =>
    setCells((old) => {
      const row = [...(old[c] ?? emptyRow())];
      row[s] = f;
      return { ...old, [c]: row };
    });

  useEffect(() => {
    if (mode !== 'grid') return;
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      if (e.ctrlKey || e.metaKey) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const now = performance.now();
        let buf = now - typing.current.t < 700 ? typing.current.buf + e.key : e.key;
        if (parseInt(buf) > 24) buf = e.key;
        typing.current = { t: now, buf };
        setCell(sel.c, sel.s, parseInt(buf));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setCell(sel.c, sel.s, undefined);
      } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setSel((p) => {
          if (p.c + 1 >= cols) setCols((c) => c + barCols);
          return { ...p, c: p.c + 1 };
        });
      } else if (e.key === 'ArrowLeft') setSel((p) => ({ ...p, c: Math.max(0, p.c - 1) }));
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((p) => ({ ...p, s: Math.min(5, p.s + 1) }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSel((p) => ({ ...p, s: Math.max(0, p.s - 1) }));
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [mode, sel, cols, barCols]);

  const preview = () => {
    const c = getCtx();
    const song = buildSongObj();
    const spbSec = 60 / bpm;
    for (const ev of song.tracks[0].events) {
      const midis = ev.notes.map((n) => tabMidi(tuning, capo, n.string, n.fret));
      const when = c.currentTime + 0.1 + ev.beat * spbSec;
      if (midis.length === 1) playPluck(midis[0], when, { gain: 0.6, hold: Math.max(0.3, ev.dur * spbSec), reverb: 0.15 });
      else playStrum(midis, when, 'd', { gain: 0.45, hold: Math.max(0.3, ev.dur * spbSec), reverb: 0.15 });
    }
  };

  const save = async () => {
    if (mode === 'abc') {
      try {
        const imp = importAbcText(abc);
        imp.song.title = title === 'My new song' ? imp.song.title : title;
        if (sheet) imp.song.sheetIds = [sheet.id];
        await saveUserSong(imp.song);
        bump('created');
        toast('Saved');
        navigate(`/song/${encodeURIComponent(imp.song.id)}`);
      } catch (e) {
        toast((e as Error).message);
      }
      return;
    }
    const song = buildSongObj();
    if (!song.tracks[0].events.length) return toast('Add at least one note first.');
    await saveUserSong(song);
    bump('created');
    toast('Saved to your library');
    navigate(`/song/${encodeURIComponent(song.id)}`);
  };

  const playIt = () => {
    const song = buildSongObj();
    if (!song.tracks[0].events.length) return toast('Add at least one note first.');
    registerTempSong({ ...song, id: `tmp-${song.id}` });
    navigate(`/play/${encodeURIComponent('tmp-' + song.id)}?track=main&speed=1&mode=wait`);
  };

  useEffect(() => {
    if (mode === 'abc') {
      try {
        setWarn(parseAbc(abc).warnings);
      } catch {
        setWarn(['Could not parse']);
      }
    }
  }, [abc, mode]);

  const barLines = useMemo(() => new Set(Array.from({ length: Math.ceil(cols / barCols) + 1 }, (_, i) => i * barCols)), [cols, barCols]);

  return (
    <div className="page">
      <PageHead
        title={existing ? `Edit: ${existing.title}` : 'Song editor'}
        sub="Type fret numbers into the grid. Notes keep sounding until the next column that has notes."
        actions={
          <>
            <Seg value={mode} onChange={setMode} options={[{ v: 'grid', label: 'Tab grid' }, { v: 'abc', label: 'ABC text' }]} />
            <button className="btn" onClick={preview} disabled={mode === 'abc'}><Icon name="volume" size={16} /> Listen</button>
            <button className="btn" onClick={playIt} disabled={mode === 'abc'}><Icon name="play" size={16} /> Play along</button>
            <button className="btn primary" onClick={() => void save()}><Icon name="check" size={16} /> Save</button>
          </>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: sheet ? 'minmax(0,1.4fr) minmax(0,1fr)' : '1fr', alignItems: 'start' }}>
        <div className="col" style={{ minWidth: 0 }}>
          <div className="card">
            <div className="grid c4">
              <label className="field">Title<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="field">Artist<input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} /></label>
              <label className="field">Tempo (BPM)<input type="number" min={30} max={240} value={bpm} onChange={(e) => setBpm(parseInt(e.target.value) || 90)} /></label>
              <label className="field">Meter
                <select value={`${num}/${den}`} onChange={(e) => { const [a, b] = e.target.value.split('/').map(Number); setNum(a); setDen(b); }}>
                  {['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label className="field">Tuning
                <select value={tuningId} onChange={(e) => setTuningId(e.target.value)}>{TUNINGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              </label>
              <label className="field">Capo<input type="number" min={0} max={12} value={capo} onChange={(e) => setCapo(parseInt(e.target.value) || 0)} /></label>
              <label className="field">Genre<input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} /></label>
              <label className="field">Difficulty<select value={difficulty} onChange={(e) => setDifficulty(+e.target.value)}>{[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</select></label>
            </div>
          </div>

          {mode === 'grid' ? (
            <div className="card">
              <div className="row between wrap" style={{ marginBottom: 10 }}>
                <div className="row">
                  <span className="small muted">Grid:</span>
                  <Seg value={spb} onChange={(v) => { if (v !== spb) { const f = v / spb; setCells((o) => Object.fromEntries(Object.entries(o).map(([c, r]) => [Math.round(+c * f), r]))); setChords((o) => Object.fromEntries(Object.entries(o).map(([c, r]) => [Math.round(+c * f), r]))); setCols((c) => Math.round(c * f)); setSel((s) => ({ ...s, c: Math.round(s.c * f) })); setSpb(v); } }} options={[{ v: 1, label: '1/4' }, { v: 2, label: '1/8' }, { v: 4, label: '1/16' }]} />
                </div>
                <div className="row">
                  <button className="btn sm" onClick={() => setCols((c) => c + barCols)}>+ Bar</button>
                  <button className="btn sm" onClick={() => setCols((c) => Math.max(barCols, c - barCols))}>− Bar</button>
                  <button className="btn sm danger" onClick={() => { if (confirm('Clear all notes?')) { setCells({}); setChords({}); } }}>Clear</button>
                </div>
              </div>
              <div className="tabgrid" id="tabgrid">
                <table>
                  <tbody>
                    <tr>
                      <td className="lbl" />
                      {Array.from({ length: cols }).map((_, c) => (
                        <td key={c} className={`chordcell ${barLines.has(c) ? 'barline' : ''}`} onClick={() => setSel((s) => ({ ...s, c }))}>{chords[c] ?? ''}</td>
                      ))}
                    </tr>
                    {[5, 4, 3, 2, 1, 0].map((s) => (
                      <tr key={s}>
                        <td className="lbl">{labels[s]}</td>
                        {Array.from({ length: cols }).map((_, c) => {
                          const f = cells[c]?.[s];
                          return (
                            <td key={c} className={`${barLines.has(c) ? 'barline' : ''} ${sel.c === c && sel.s === s ? 'sel' : ''} ${f !== undefined ? 'has' : ''}`} onClick={() => setSel({ c, s })} data-c={c} data-s={s}>
                              {f !== undefined ? f : '·'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row wrap" style={{ marginTop: 12 }}>
                <label className="field" style={{ width: 220 }}>
                  Chord name at selected column
                  <input type="text" placeholder="e.g. Am7" value={chords[sel.c] ?? ''} onChange={(e) => setChords((o) => { const n = { ...o }; if (e.target.value) n[sel.c] = e.target.value; else delete n[sel.c]; return n; })} />
                </label>
                <span className="small muted" style={{ flex: 1, minWidth: 240 }}>
                  <kbd>0</kbd>–<kbd>9</kbd> set fret (type two digits for 10+) · <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Del</kbd> clear · <kbd>Space</kbd> next column. Chord names make the song available as a strumming track with a backing band.
                </span>
              </div>
            </div>
          ) : (
            <div className="card">
              <p className="small">Write or paste ABC notation. Chord symbols in quotes (<code>"Am"</code>) automatically create strumming and fingerpicking arrangements. “Save” builds all tracks.</p>
              <textarea rows={16} value={abc} onChange={(e) => setAbc(e.target.value)} spellCheck={false} aria-label="ABC notation" />
              {warn.length > 0 && <div className="tip small" style={{ borderColor: 'var(--warn)' }}>Check the rhythm: {warn.slice(0, 5).join(' · ')}</div>}
            </div>
          )}
        </div>
        {sheet && (
          <div className="card" style={{ position: 'sticky', top: 0 }}>
            <div className="row between"><h3>Reference: {sheet.name}</h3><button className="btn ghost sm" onClick={() => setSheet(null)}>Hide</button></div>
            <SheetViewer blob={sheet.blob} compact />
          </div>
        )}
      </div>
    </div>
  );
}
