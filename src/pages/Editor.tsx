import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHead, Seg } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { getSong, registerTempSong, saveUserSong, useSongs } from '../core/songs-store';
import { navigate, useRoute } from '../core/router';
import { TUNINGS, STANDARD, tuningLabels } from '../core/music';
import type { ChordMark, NoteEvent, Song, Track } from '../core/types';
import { getCtx } from '../audio/engine';
import { bump } from '../core/progress';
import { toast } from '../ui/toast';
import { idbGet, lsGet } from '../core/storage';
import type { SheetItem } from '../core/backup';
import { importAbcText } from '../songs/import';
import { SheetViewer } from './ImportPage';
import { parseAbc } from '../songs/abc';
import { parseTabText, serializeTabText, type TabMeta } from '../songs/import/tabtext';
import { buildAiPrompt } from '../songs/import/prompt';
import { playPreview, stopPreview } from '../audio/preview';
import { chordInfo } from '../songs/chords';
import { makeChordTrack, makePickingTrack } from '../songs/arrange';

type Row = (number | undefined)[];
type Cells = Record<number, Row>; // absolute column -> fret per string (index 0 = low E)
interface Doc {
  cells: Cells;
  chords: Record<number, string>;
  bars: number;
}

const emptyRow = (): Row => [undefined, undefined, undefined, undefined, undefined, undefined];
const STYLE_LIST = ['folk', 'rock', 'ballad', 'waltz', 'shuffle', 'reggae', 'quarter', 'march'] as const;
const ZOOM = { S: 24, M: 30, L: 40 } as const;

/** shift every column >= from by delta (columns removed when delta < 0 and inside the removed range) */
function shiftDoc(d: Doc, from: number, delta: number, removeTo = from): Doc {
  const cells: Cells = {};
  const chords: Record<number, string> = {};
  for (const [k, v] of Object.entries(d.cells)) {
    const c = +k;
    if (delta < 0 && c >= from && c < removeTo) continue;
    cells[c >= (delta < 0 ? removeTo : from) ? c + delta : c] = v;
  }
  for (const [k, v] of Object.entries(d.chords)) {
    const c = +k;
    if (delta < 0 && c >= from && c < removeTo) continue;
    chords[c >= (delta < 0 ? removeTo : from) ? c + delta : c] = v;
  }
  return { cells, chords, bars: d.bars };
}

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
  const [style, setStyle] = useState<string>(existing?.style ?? 'folk');
  const [spb, setSpb] = useState(2); // columns per beat
  const [doc, setDocRaw] = useState<Doc>({ cells: {}, chords: {}, bars: 8 });
  const [sel, setSel] = useState<{ c: number; s: number }>({ c: 0, s: 5 });
  const [mode, setMode] = useState<'grid' | 'text' | 'abc'>('grid');
  const [abc, setAbc] = useState('X:1\nT:My tune\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\n"C"C D E F | "G"G4 |]');
  const [textDraft, setTextDraft] = useState('');
  const [sheet, setSheet] = useState<SheetItem | null>(null);
  const [zoom, setZoom] = useState<keyof typeof ZOOM>('M');
  const [perRow, setPerRow] = useState<number>(0); // 0 = auto
  const [avail, setAvail] = useState(900);
  const [clip, setClip] = useState<{ cells: Row[]; chords: (string | undefined)[] } | null>(null);
  const [importWarn, setImportWarn] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [rangeA, setRangeA] = useState(1);
  const [rangeB, setRangeB] = useState(1);
  const typing = useRef({ t: 0, buf: '' });
  const undo = useRef<{ doc: Doc; spb: number }[]>([]);
  const redo = useRef<{ doc: Doc; spb: number }[]>([]);
  const lastPush = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tuning = TUNINGS.find((t) => t.id === tuningId)?.notes ?? existing?.tuning ?? STANDARD;
  const labels = tuningLabels(tuning);
  const barBeats = (num * 4) / den;
  const barCols = Math.max(1, Math.round(barBeats * spb));
  const cellW = ZOOM[zoom];
  const totalCols = doc.bars * barCols;
  const bars = doc.bars;
  const selBar = Math.floor(sel.c / barCols);

  // commit a change with undo history (typing bursts are merged)
  const setDoc = useCallback(
    (fn: (d: Doc) => Doc, merge = false) => {
      setDocRaw((old) => {
        const now = performance.now();
        if (!(merge && now - lastPush.current < 900)) undo.current = [...undo.current.slice(-80), { doc: old, spb }];
        lastPush.current = now;
        redo.current = [];
        return fn(old);
      });
    },
    [spb],
  );

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push({ doc, spb });
    setSpb(prev.spb);
    setDocRaw(prev.doc);
  };
  const doRedo = () => {
    const nx = redo.current.pop();
    if (!nx) return;
    undo.current.push({ doc, spb });
    setSpb(nx.spb);
    setDocRaw(nx.doc);
  };

  // available width for auto layout
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, [mode, sheet]);
  const barPx = barCols * cellW;
  const autoPer = Math.max(1, Math.floor((avail - 70) / barPx));
  const per = perRow > 0 ? perRow : autoPer;

  // ---- loading ----
  const loadSong = useCallback((s: Song, trackIdx = 0, keepMeta = false) => {
    const tr = s.tracks[trackIdx] ?? s.tracks[0];
    const fine = tr.events.some((e) => Math.abs(e.beat * 2 - Math.round(e.beat * 2)) > 1e-3);
    const sp = fine ? 4 : 2;
    const bb = (s.beatsPerBar * 4) / s.beatUnit;
    const bc = Math.max(1, Math.round(bb * sp));
    const cells: Cells = {};
    const chords: Record<number, string> = {};
    let maxCol = 0;
    for (const ev of tr.events) {
      const col = Math.round(ev.beat * sp);
      const row = cells[col] ?? emptyRow();
      for (const n of ev.notes) if (!n.dead) row[n.string] = n.fret;
      cells[col] = row;
      maxCol = Math.max(maxCol, col);
      if (ev.chord) chords[col] = ev.chord;
    }
    for (const m of s.chords) chords[Math.round(m.beat * sp)] = m.name;
    const nb = Math.max(2, Math.ceil((Math.max(maxCol + 1, Math.round(s.lengthBeats * sp))) / bc));
    setSpb(sp);
    setDocRaw({ cells, chords, bars: nb });
    undo.current = [];
    redo.current = [];
    if (!keepMeta) {
      setTitle(s.title);
      setArtist(s.artist);
      setBpm(s.bpm);
      setNum(s.beatsPerBar);
      setDen(s.beatUnit);
      setCapo(s.capo);
      setGenre(s.genre);
      setDifficulty(s.difficulty);
      if (s.style) setStyle(s.style);
      const tn = TUNINGS.find((t) => t.notes.join() === s.tuning.join());
      setTuningId(tn?.id ?? 'standard');
    }
  }, []);

  useEffect(() => {
    if (existing) {
      loadSong(existing, 0, true);
      const tn = TUNINGS.find((t) => t.notes.join() === existing.tuning.join());
      setTuningId(tn?.id ?? 'standard');
      if (existing.tracks.length > 1) toast(`Editing the first track (“${existing.tracks[0].name}”); the other tracks are kept.`);
    }
    if (id === 'draft') {
      const d = lsGet<{ kind: 'abc' | 'tab'; text: string; overrides?: TabMeta; sheetId?: string; title?: string } | null>('guitarplay.draft', null);
      if (d) {
        if (d.kind === 'abc') {
          setAbc(d.text);
          setMode('abc');
        } else {
          try {
            const r = parseTabText(d.text, d.overrides ?? (d.title ? { title: d.title } : {}));
            loadSong(r.song, 0);
            setTextDraft(d.text);
            setImportWarn(r.warnings);
          } catch (e) {
            toast((e as Error).message);
          }
        }
        if (d.sheetId) void idbGet<SheetItem>('sheets', d.sheetId).then((s) => s && setSheet(s));
      }
    }
    const sh = route.query.get('sheet');
    if (sh) void idbGet<SheetItem>('sheets', sh).then((s) => s && setSheet(s));
    return () => stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ---- song building ----
  const buildSongObj = useCallback((): Song => {
    const events: NoteEvent[] = [];
    const used = Object.keys(doc.cells).map(Number).filter((c) => doc.cells[c].some((f) => f !== undefined)).sort((a, b) => a - b);
    const total = bars * barBeats;
    used.forEach((c, i) => {
      const nextBeat = used[i + 1] !== undefined ? used[i + 1] / spb : total;
      const dur = Math.min(4, Math.max(1 / spb, nextBeat - c / spb));
      const notes = doc.cells[c].map((f, s) => (f === undefined ? null : { string: s, fret: f })).filter(Boolean) as { string: number; fret: number }[];
      events.push({ beat: c / spb, dur, notes, chord: doc.chords[c] });
    });
    const cs = Object.keys(doc.chords).map(Number).sort((a, b) => a - b);
    const marks: ChordMark[] = cs.map((c, i) => ({ beat: c / spb, name: doc.chords[c], dur: (cs[i + 1] !== undefined ? cs[i + 1] / spb : total) - c / spb }));
    const main: Track = { id: 'main', name: existing?.tracks[0]?.name ?? 'Tab', kind: existing?.tracks[0]?.kind ?? 'other', events };
    const tracks: Track[] = [main];
    const usable = marks.filter((m) => chordInfo(m.name));
    const generated = new Set(['chords', 'picking']);
    for (const t of existing?.tracks.slice(1) ?? []) if (!(usable.length && generated.has(t.id))) tracks.push(t);
    if (usable.length && !tracks.some((t) => t.id === 'chords')) {
      tracks.push({ id: 'chords', name: 'Chords (strumming)', kind: 'chords', events: makeChordTrack(marks, num, den, style as Song['style'], 0, total) });
      tracks.push({ id: 'picking', name: 'Fingerpicking', kind: 'picking', events: makePickingTrack(marks, num, den, 0, total) });
    }
    return {
      id: existing?.id ?? `user-${Date.now().toString(36)}`,
      title: title.trim() || 'Untitled',
      artist,
      genre,
      difficulty: difficulty as 1,
      bpm,
      tempoMap: existing?.tempoMap,
      beatsPerBar: num,
      beatUnit: den,
      tuning,
      capo,
      tracks,
      chords: marks,
      lengthBeats: total,
      source: 'user',
      tags: existing?.tags ?? ['custom'],
      description: existing?.description,
      pickup: 0,
      sheetIds: sheet ? [sheet.id] : existing?.sheetIds,
      createdAt: existing?.createdAt ?? Date.now(),
      style: style as Song['style'],
      key: existing?.key,
    };
  }, [doc, bars, barBeats, spb, num, den, title, artist, genre, difficulty, bpm, tuning, capo, existing, sheet, style]);

  // ---- cell editing ----
  const setCell = (c: number, s: number, f: number | undefined) =>
    setDoc((d) => {
      const row = [...(d.cells[c] ?? emptyRow())];
      row[s] = f;
      return { ...d, cells: { ...d.cells, [c]: row } };
    }, true);

  const goto = (c: number, s: number) => setSel({ c: Math.max(0, Math.min(totalCols - 1, c)), s: Math.max(0, Math.min(5, s)) });

  // ---- bar operations ----
  const barStart = (b: number) => b * barCols;
  const addBarEnd = () => {
    setDoc((d) => ({ ...d, bars: d.bars + 1 }));
    goto(barStart(bars), sel.s);
  };
  const addBars = (n: number) => setDoc((d) => ({ ...d, bars: d.bars + n }));
  const insertBar = (after: boolean) => {
    const at = barStart(selBar + (after ? 1 : 0));
    setDoc((d) => ({ ...shiftDoc(d, at, barCols), bars: d.bars + 1 }));
    goto(at, sel.s);
  };
  const deleteBar = () => {
    if (bars <= 1) return;
    const a = barStart(selBar);
    setDoc((d) => ({ ...shiftDoc(d, a, -barCols, a + barCols), bars: d.bars - 1 }));
    goto(Math.min(a, (bars - 1) * barCols - 1), sel.s);
  };
  const readBar = (d: Doc, b: number) => {
    const cellsR: Row[] = [];
    const ch: (string | undefined)[] = [];
    for (let i = 0; i < barCols; i++) {
      cellsR.push(d.cells[barStart(b) + i] ? [...d.cells[barStart(b) + i]] : emptyRow());
      ch.push(d.chords[barStart(b) + i]);
    }
    return { cells: cellsR, chords: ch };
  };
  const writeBar = (d: Doc, b: number, data: { cells: Row[]; chords: (string | undefined)[] }): Doc => {
    const cells = { ...d.cells };
    const chords = { ...d.chords };
    for (let i = 0; i < barCols; i++) {
      const c = barStart(b) + i;
      const row = data.cells[i];
      if (row && row.some((f) => f !== undefined)) cells[c] = [...row];
      else delete cells[c];
      if (data.chords[i]) chords[c] = data.chords[i]!;
      else delete chords[c];
    }
    return { ...d, cells, chords };
  };
  const duplicateBar = () => {
    const data = readBar(doc, selBar);
    setDoc((d) => writeBar({ ...shiftDoc(d, barStart(selBar + 1), barCols), bars: d.bars + 1 }, selBar + 1, data));
    goto(barStart(selBar + 1), sel.s);
  };
  const clearBar = () => setDoc((d) => writeBar(d, selBar, { cells: [], chords: [] }));
  const copyBar = () => {
    setClip(readBar(doc, selBar));
    toast(`Bar ${selBar + 1} copied`);
  };
  const pasteBar = () => {
    if (!clip) return;
    setDoc((d) => writeBar(d, selBar, clip));
  };
  const appendRange = () => {
    const a = Math.max(1, Math.min(rangeA, bars)) - 1;
    const b = Math.max(a + 1, Math.min(rangeB, bars));
    setDoc((d) => {
      let nd = { ...d, bars: d.bars + (b - a) };
      for (let i = a; i < b; i++) nd = writeBar(nd, d.bars + (i - a), readBar(d, i));
      return nd;
    });
    toast(`Bars ${a + 1}–${b} appended at the end`);
  };

  // ---- grid change / meter change ----
  const changeGrid = (v: number) => {
    if (v === spb) return;
    const f = v / spb;
    setDoc((d) => ({
      bars: d.bars,
      cells: Object.fromEntries(Object.entries(d.cells).map(([c, r]) => [Math.round(+c * f), r])),
      chords: Object.fromEntries(Object.entries(d.chords).map(([c, r]) => [Math.round(+c * f), r])),
    }));
    setSel((s) => ({ ...s, c: Math.round(s.c * f) }));
    setSpb(v);
  };
  const changeMeter = (v: string) => {
    const [a, b] = v.split('/').map(Number);
    const oldBars = bars;
    const oldBeats = barBeats;
    setNum(a);
    setDen(b);
    const nbc = Math.max(1, Math.round(((a * 4) / b) * spb));
    // keep the total length in columns: re-bar the document
    setDocRaw((d) => ({ ...d, bars: Math.max(1, Math.ceil((oldBars * oldBeats * spb) / nbc)) }));
  };

  // ---- keyboard ----
  useEffect(() => {
    if (mode !== 'grid') return;
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          e.shiftKey ? doRedo() : doUndo();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          doRedo();
        } else if (e.key.toLowerCase() === 'c') copyBar();
        else if (e.key.toLowerCase() === 'v') pasteBar();
        return;
      }
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
        if (sel.c + 1 >= totalCols) addBars(1);
        goto(sel.c + 1, sel.s);
      } else if (e.key === 'ArrowLeft') goto(sel.c - 1, sel.s);
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goto(sel.c, sel.s + 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        goto(sel.c, sel.s - 1);
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        goto(barStart(selBar + 1), sel.s);
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        goto(barStart(Math.max(0, selBar - 1)), sel.s);
      } else if (e.key === 'Home') goto(barStart(selBar), sel.s);
      else if (e.key === 'End') goto(barStart(selBar) + barCols - 1, sel.s);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sel, totalCols, barCols, selBar, doc, clip, spb]);

  // keep the cursor visible
  useEffect(() => {
    const el = document.querySelector(`td[data-c="${sel.c}"][data-s="${sel.s}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sel]);

  // ---- actions ----
  const listen = (from: boolean) => {
    if (playing) {
      stopPreview();
      setPlaying(false);
      return;
    }
    getCtx();
    const song = buildSongObj();
    if (!song.tracks[0].events.length) return toast('Add at least one note first.');
    setPlaying(true);
    playPreview(song, song.tracks[0], from ? sel.c / spb : 0, 120, () => setPlaying(false));
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

  // text mode
  const textResult = useMemo(() => {
    if (mode !== 'text' || !textDraft.trim()) return null;
    try {
      return { r: parseTabText(textDraft), err: '' };
    } catch (e) {
      return { r: null, err: (e as Error).message };
    }
  }, [mode, textDraft]);
  const openText = () => {
    setTextDraft(serializeTabText(buildSongObj(), 0, Math.max(1, per)));
    setMode('text');
  };
  const applyText = () => {
    if (!textResult?.r) return;
    loadSong(textResult.r.song, 0);
    setImportWarn(textResult.r.warnings);
    setMode('grid');
    toast('Text applied to the grid');
  };
  const copyPrompt = async () => {
    const p = buildAiPrompt({ title, artist, tempo: String(bpm), meter: `${num}/${den}`, grid: `1/${spb * 4}`, tuning: TUNINGS.find((t) => t.id === tuningId)?.name.replace(/\s*\(.*\)/, ''), capo: String(capo), style }, true);
    try {
      await navigator.clipboard.writeText(p);
      toast('AI prompt with your settings copied');
    } catch {
      toast('Copy failed');
    }
  };

  // warnings for ABC
  const abcWarn = useMemo(() => {
    if (mode !== 'abc') return [];
    try {
      return parseAbc(abc).warnings;
    } catch {
      return ['Could not parse'];
    }
  }, [abc, mode]);

  // ---- render helpers ----
  const barIdxs = useMemo(() => Array.from({ length: bars }, (_, i) => i), [bars]);
  const systems = useMemo(() => {
    const out: number[][] = [];
    for (let i = 0; i < barIdxs.length; i += per) out.push(barIdxs.slice(i, i + per));
    return out;
  }, [barIdxs, per]);

  return (
    <div className="page">
      <PageHead
        title={existing ? `Edit: ${existing.title}` : 'Song editor'}
        sub="Type fret numbers into the grid. Bars wrap into lines like printed tab, so long pieces stay readable."
        actions={
          <>
            <Seg value={mode} onChange={(m) => (m === 'text' ? openText() : setMode(m))} options={[{ v: 'grid', label: 'Tab grid' }, { v: 'text', label: 'Text tab' }, { v: 'abc', label: 'ABC' }]} />
            <button className="btn" onClick={() => listen(false)} disabled={mode !== 'grid'}><Icon name={playing ? 'pause' : 'volume'} size={16} /> {playing ? 'Stop' : 'Listen'}</button>
            <button className="btn" onClick={playIt} disabled={mode !== 'grid'}><Icon name="play" size={16} /> Play along</button>
            <button className="btn primary" onClick={() => void save()}><Icon name="check" size={16} /> Save</button>
          </>
        }
      />
      {importWarn.length > 0 && (
        <div className="tip small" style={{ borderColor: 'var(--warn)' }}>
          <b>Import notes:</b> {importWarn.slice(0, 4).join(' · ')} <button className="btn ghost sm" onClick={() => setImportWarn([])}>Dismiss</button>
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: sheet ? 'minmax(0,1.5fr) minmax(0,1fr)' : '1fr', alignItems: 'start' }}>
        <div className="col" style={{ minWidth: 0 }} ref={wrapRef}>
          <div className="card">
            <div className="grid c4">
              <label className="field">Title<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="field">Artist<input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} /></label>
              <label className="field">Tempo (BPM)<input type="number" min={30} max={240} value={bpm} onChange={(e) => setBpm(parseInt(e.target.value) || 90)} /></label>
              <label className="field">Meter
                <select value={`${num}/${den}`} onChange={(e) => changeMeter(e.target.value)}>
                  {['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8', '9/8'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label className="field">Tuning
                <select value={tuningId} onChange={(e) => setTuningId(e.target.value)}>{TUNINGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              </label>
              <label className="field">Capo<input type="number" min={0} max={12} value={capo} onChange={(e) => setCapo(parseInt(e.target.value) || 0)} /></label>
              <label className="field">Genre<input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} /></label>
              <label className="field">Difficulty<select value={difficulty} onChange={(e) => setDifficulty(+e.target.value)}>{[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</select></label>
              <label className="field">Backing style<select value={style} onChange={(e) => setStyle(e.target.value)}>{STYLE_LIST.map((m) => <option key={m}>{m}</option>)}</select></label>
            </div>
          </div>

          {mode === 'grid' && (
            <div className="card">
              <div className="row between wrap" style={{ marginBottom: 10, gap: 10 }}>
                <div className="row wrap">
                  <span className="small muted">Grid</span>
                  <Seg value={spb} onChange={changeGrid} options={[{ v: 1, label: '1/4' }, { v: 2, label: '1/8' }, { v: 4, label: '1/16' }]} />
                  <span className="small muted">Size</span>
                  <Seg value={zoom} onChange={setZoom} options={[{ v: 'S', label: 'S' }, { v: 'M', label: 'M' }, { v: 'L', label: 'L' }]} />
                  <span className="small muted">Bars per line</span>
                  <select value={perRow} onChange={(e) => setPerRow(+e.target.value)} aria-label="Bars per line">
                    <option value={0}>Auto ({autoPer})</option>
                    {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="row">
                  <button className="btn sm" onClick={doUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
                  <button className="btn sm" onClick={doRedo} title="Redo (Ctrl+Y)">↷ Redo</button>
                </div>
              </div>

              <div className="row wrap" style={{ marginBottom: 10, gap: 8 }} id="bar-tools">
                <span className="pill accent">Bar {selBar + 1} of {bars}</span>
                <button className="btn sm" onClick={() => insertBar(false)}>Insert before</button>
                <button className="btn sm" onClick={() => insertBar(true)} id="insert-after">Insert after</button>
                <button className="btn sm" onClick={duplicateBar}>Duplicate</button>
                <button className="btn sm" onClick={copyBar}>Copy</button>
                <button className="btn sm" onClick={pasteBar} disabled={!clip}>Paste</button>
                <button className="btn sm" onClick={clearBar}>Clear</button>
                <button className="btn sm danger" onClick={deleteBar} disabled={bars <= 1}>Delete</button>
                <span className="grow" />
                <button className="btn sm" onClick={() => listen(true)}><Icon name="volume" size={14} /> Listen from here</button>
                <button className="btn sm primary" onClick={addBarEnd} id="add-bar">+ Bar</button>
                <button className="btn sm" onClick={() => addBars(4)}>+ 4 bars</button>
              </div>

              <div id="tabgrid">
                {systems.map((sys, si) => (
                  <div className="tabsys" key={si}>
                    <table style={{ width: 28 + sys.length * barPx }}>
                      <colgroup>
                        <col style={{ width: 28 }} />
                        {sys.flatMap((b) => Array.from({ length: barCols }, (_, i) => <col key={`${b}-${i}`} style={{ width: cellW }} />))}
                      </colgroup>
                      <tbody>
                        <tr>
                          <td className="lbl" />
                          {sys.map((b) => (
                            <td key={b} colSpan={barCols} className={`barnum barline ${b === selBar ? 'barsel' : ''}`} onClick={() => goto(barStart(b), sel.s)}>
                              {b + 1}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="lbl" />
                          {sys.flatMap((b) =>
                            Array.from({ length: barCols }, (_, i) => {
                              const c = barStart(b) + i;
                              return (
                                <td key={c} className={`chordcell ${i === 0 ? 'barline' : ''}`} onClick={() => goto(c, sel.s)}>
                                  {doc.chords[c] ?? ''}
                                </td>
                              );
                            }),
                          )}
                        </tr>
                        {[5, 4, 3, 2, 1, 0].map((s) => (
                          <tr key={s}>
                            <td className="lbl">{labels[s]}</td>
                            {sys.flatMap((b) =>
                              Array.from({ length: barCols }, (_, i) => {
                                const c = barStart(b) + i;
                                const f = doc.cells[c]?.[s];
                                return (
                                  <td key={c} className={`${i === 0 ? 'barline' : ''} ${b === selBar ? 'inbar' : ''} ${sel.c === c && sel.s === s ? 'sel' : ''} ${f !== undefined ? 'has' : ''}`} onClick={() => goto(c, s)} data-c={c} data-s={s}>
                                    {f !== undefined ? f : '·'}
                                  </td>
                                );
                              }),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              <div className="row wrap" style={{ marginTop: 8, gap: 12 }}>
                <label className="field" style={{ width: 230 }}>
                  Chord at the selected column
                  <input type="text" placeholder="e.g. Am7" value={doc.chords[sel.c] ?? ''} onChange={(e) => setDoc((d) => { const n = { ...d.chords }; if (e.target.value) n[sel.c] = e.target.value; else delete n[sel.c]; return { ...d, chords: n }; }, true)} />
                </label>
                <div className="row" style={{ alignItems: 'end', gap: 6 }}>
                  <label className="field" style={{ width: 90 }}>Copy bars
                    <input type="number" min={1} max={bars} value={rangeA} onChange={(e) => setRangeA(+e.target.value || 1)} />
                  </label>
                  <label className="field" style={{ width: 90 }}>to
                    <input type="number" min={1} max={bars} value={rangeB} onChange={(e) => setRangeB(+e.target.value || 1)} />
                  </label>
                  <button className="btn" onClick={appendRange}>Append at end</button>
                </div>
                <span className="small muted" style={{ flex: 1, minWidth: 260 }}>
                  <kbd>0</kbd>–<kbd>9</kbd> fret (two digits for 10+) · arrows move · <kbd>PgUp</kbd>/<kbd>PgDn</kbd> bar · <kbd>Del</kbd> clear · <kbd>Space</kbd> next · <kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> undo/redo · <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copy/paste bar. Add chord names to get strumming and picking tracks.
                </span>
              </div>
            </div>
          )}

          {mode === 'text' && (
            <div className="card">
              <p className="small">
                The whole piece as text in the GuitarPlay tab format – ideal for pasting an AI’s answer, bulk edits, or sharing. “Apply to grid” replaces the grid and the settings above with what is written here.
              </p>
              <textarea id="tab-text" rows={22} value={textDraft} onChange={(e) => setTextDraft(e.target.value)} spellCheck={false} aria-label="Tab text" />
              {textResult?.err && <div className="tip small" style={{ borderColor: 'var(--bad)' }}>{textResult.err}</div>}
              {textResult?.r && (textResult.r.warnings.length > 0 ? <div className="tip small" style={{ borderColor: 'var(--warn)' }}><b>Check:</b> {textResult.r.warnings.slice(0, 5).join(' · ')}</div> : <div className="tip small" style={{ borderColor: 'var(--good)' }}>✓ {textResult.r.bars} bars, no problems found.</div>)}
              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => setTextDraft(serializeTabText(buildSongObj(), 0, Math.max(1, per)))}>Refresh from grid</button>
                <button className="btn" onClick={() => void navigator.clipboard.writeText(textDraft).then(() => toast('Text copied'))}>Copy text</button>
                <button className="btn" onClick={() => void copyPrompt()}><Icon name="sparkles" size={15} /> Copy AI prompt with my settings</button>
                <span className="grow" />
                <button className="btn primary" onClick={applyText} disabled={!textResult?.r} id="apply-text">Apply to grid</button>
              </div>
            </div>
          )}

          {mode === 'abc' && (
            <div className="card">
              <p className="small">Write or paste ABC notation. Chord symbols in quotes (<code>"Am"</code>) automatically create strumming and fingerpicking arrangements. “Save” builds all tracks.</p>
              <textarea rows={16} value={abc} onChange={(e) => setAbc(e.target.value)} spellCheck={false} aria-label="ABC notation" />
              {abcWarn.length > 0 && <div className="tip small" style={{ borderColor: 'var(--warn)' }}>Check the rhythm: {abcWarn.slice(0, 5).join(' · ')}</div>}
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
