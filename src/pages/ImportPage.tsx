import { useEffect, useRef, useState } from 'react';
import { Modal, PageHead, Seg } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { importAbcText, importFile, parseAsciiTab, type Imported } from '../songs/import';
import { saveUserSong, useSongs } from '../core/songs-store';
import { bump } from '../core/progress';
import { navigate } from '../core/router';
import { toast } from '../ui/toast';
import { idbAll, idbDelete, idbPut, lsSet } from '../core/storage';
import type { SheetItem } from '../core/backup';
import { useSettings } from '../core/settings';
import { transcribeSheet } from '../songs/import/transcribe';

export function ImportPage() {
  const [tab, setTab] = useState<'file' | 'paste' | 'sheets'>('file');
  return (
    <div className="page narrow">
      <PageHead title="Import & Create" sub="Bring your own songs: Guitar Pro tabs, MusicXML, MIDI, ABC, text tabs or photos of sheet music – or write one from scratch." />
      <div className="row wrap">
        <button className="btn primary" onClick={() => navigate('/editor')}><Icon name="editor" size={16} /> New song in editor</button>
      </div>
      <div className="tabs">
        <button className={tab === 'file' ? 'on' : ''} onClick={() => setTab('file')}>Import a file</button>
        <button className={tab === 'paste' ? 'on' : ''} onClick={() => setTab('paste')}>Paste ABC / tab</button>
        <button className={tab === 'sheets' ? 'on' : ''} onClick={() => setTab('sheets')}>Photos & sheets</button>
      </div>
      {tab === 'file' && <FileImport />}
      {tab === 'paste' && <PasteImport />}
      {tab === 'sheets' && <Sheets />}
    </div>
  );
}

function Preview({ imp, onSave, onCancel }: { imp: Imported; onSave: (s: Imported['song']) => void; onCancel: () => void }) {
  const [song, setSong] = useState(imp.song);
  return (
    <div className="card">
      <h3>Ready to add</h3>
      <div className="grid c2" style={{ marginTop: 10 }}>
        <label className="field">Title<input type="text" value={song.title} onChange={(e) => setSong({ ...song, title: e.target.value })} /></label>
        <label className="field">Artist / composer<input type="text" value={song.artist} onChange={(e) => setSong({ ...song, artist: e.target.value })} /></label>
        <label className="field">Genre<input type="text" value={song.genre} onChange={(e) => setSong({ ...song, genre: e.target.value })} /></label>
        <label className="field">Difficulty<select value={song.difficulty} onChange={(e) => setSong({ ...song, difficulty: parseInt(e.target.value) as 1 })}>{[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</select></label>
      </div>
      <div className="small muted" style={{ marginTop: 10 }}>
        {song.tracks.length} track(s): {song.tracks.map((t) => `${t.name} (${t.events.length})`).join(', ')} · {song.bpm} BPM · {song.beatsPerBar}/{song.beatUnit}
      </div>
      {imp.notes.length > 0 && <div className="tip small">{imp.notes.join(' · ')}</div>}
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onCancel}>Discard</button>
        <button className="btn" onClick={() => { onSave(song); }}>Add to library</button>
      </div>
    </div>
  );
}

function FileImport() {
  const [over, setOver] = useState(false);
  const [imp, setImp] = useState<Imported | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const handle = async (f: File) => {
    setErr('');
    setBusy(true);
    try {
      setImp(await importFile(f));
    } catch (e) {
      setErr((e as Error).message);
      setImp(null);
    }
    setBusy(false);
  };
  const save = async (song: Imported['song']) => {
    await saveUserSong(song);
    bump('created');
    toast('Song added to your library');
    navigate(`/song/${encodeURIComponent(song.id)}`);
  };
  return (
    <>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void handle(f); }}
        onClick={() => ref.current?.click()}
      >
        <Icon name="import" size={30} />
        <h3 style={{ marginTop: 8 }}>{busy ? 'Reading…' : 'Drop a file here or click to browse'}</h3>
        <p className="small">Guitar Pro (.gp3 .gp4 .gp5 .gpx .gp) · MusicXML (.xml .musicxml) · MIDI · ABC (.abc) · text tab (.txt)</p>
        <input ref={ref} type="file" hidden accept=".gp3,.gp4,.gp5,.gpx,.gp,.xml,.musicxml,.mxl,.mid,.midi,.abc,.txt,.tab,.atex,.alphatex" onChange={(e) => e.target.files?.[0] && void handle(e.target.files[0])} />
      </div>
      {err && <div className="tip" style={{ borderColor: 'var(--bad)' }}>{err}</div>}
      {imp && <Preview imp={imp} onSave={(s) => void save(s)} onCancel={() => setImp(null)} />}
      <div className="card">
        <h3>Where do I get songs?</h3>
        <p className="small">
          Songs you own or that are free to share: tabs you wrote, Guitar Pro files from your teacher or band, public-domain MusicXML/ABC collections (e.g. Mutopia, OpenScore, abcnotation.com) and MIDI files. GuitarPlay does not download copyrighted tabs for you.
        </p>
      </div>
    </>
  );
}

function PasteImport() {
  const [text, setText] = useState(`X:1
T:My Tune
M:4/4
L:1/4
Q:1/4=100
K:G
"G"G A B d | "C"e2 d2 | "D"B A G A | "G"G4 |]`);
  const [bpm, setBpm] = useState(90);
  const [title, setTitle] = useState('Pasted tab');
  const [imp, setImp] = useState<Imported | null>(null);
  const [err, setErr] = useState('');
  const isAbc = /^\s*[XTKM]:/m.test(text);

  const parse = () => {
    setErr('');
    try {
      setImp(isAbc ? importAbcText(text) : { song: parseAsciiTab(text, { bpm, title }), notes: [] });
    } catch (e) {
      setErr((e as Error).message);
      setImp(null);
    }
  };
  return (
    <>
      <div className="card">
        <p className="small">
          Paste <b>ABC notation</b> (with <code>"C"</code> chord symbols for strumming tracks) or a <b>text tab</b> (six lines like <code>e|--0--3--|</code>). ABC detected: <b>{isAbc ? 'yes' : 'no – using tab parser'}</b>
        </p>
        <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Notation text" />
        {!isAbc && (
          <div className="grid c2" style={{ marginTop: 10 }}>
            <label className="field">Title<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="field">Tempo (BPM)<input type="number" value={bpm} min={30} max={240} onChange={(e) => setBpm(parseInt(e.target.value) || 90)} /></label>
          </div>
        )}
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={parse}>Convert</button>
        </div>
      </div>
      {err && <div className="tip" style={{ borderColor: 'var(--bad)' }}>{err}</div>}
      {imp && <Preview imp={imp} onCancel={() => setImp(null)} onSave={async (s) => { await saveUserSong(s); bump('created'); navigate(`/song/${encodeURIComponent(s.id)}`); }} />}
    </>
  );
}

function Sheets() {
  const s = useSettings();
  useSongs();
  const [items, setItems] = useState<SheetItem[]>([]);
  const [open, setOpen] = useState<SheetItem | null>(null);
  const [busy, setBusy] = useState('');
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const load = () => idbAll<SheetItem>('sheets').then((r) => setItems(r.sort((a, b) => b.addedAt - a.addedAt)));
  useEffect(() => { void load(); }, []);

  const add = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) { toast(`${f.name}: only image files are supported`); continue; }
      await idbPut('sheets', { id: `sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, name: f.name.replace(/\.[^.]+$/, ''), addedAt: Date.now(), blob: f });
    }
    void load();
  };
  const ai = async (it: SheetItem) => {
    if (!s.apiKey) { toast('Add your Anthropic API key in Settings first.'); return; }
    setBusy(it.id);
    try {
      const r = await transcribeSheet(it.blob, s.apiKey);
      lsSet('guitarplay.draft', { kind: r.kind, text: r.text, sheetId: it.id, title: it.name });
      toast('Transcription ready – please review it in the editor');
      navigate('/editor/draft');
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy('');
  };

  return (
    <>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files); }}
        onClick={() => ref.current?.click()}
      >
        <Icon name="image" size={30} />
        <h3 style={{ marginTop: 8 }}>Drop photos of sheet music or tabs</h3>
        <p className="small">They are stored on this computer and can be viewed next to the editor.</p>
        <input ref={ref} type="file" hidden multiple accept="image/*" onChange={(e) => e.target.files && void add(e.target.files)} />
      </div>
      <div className="tip small">
        <b>About automatic recognition:</b> reliable offline notation recognition is not possible in a browser. You can (1) type the notes into the editor while looking at your photo, or (2) let Claude transcribe the photo into editable notation – this needs your own API key (Settings) and the result must be checked.
      </div>
      <div className="grid auto" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
        {items.map((it) => (
          <SheetCard key={it.id} item={it} busy={busy === it.id} onOpen={() => setOpen(it)} onAi={() => void ai(it)} onDelete={async () => { await idbDelete('sheets', it.id); void load(); }} onTab={() => navigate(`/editor?sheet=${it.id}`)} />
        ))}
      </div>
      {open && (
        <Modal wide onClose={() => setOpen(null)}>
          <div className="row between"><h3>{open.name}</h3><button className="btn ghost" onClick={() => setOpen(null)}>Close</button></div>
          <SheetViewer blob={open.blob} />
        </Modal>
      )}
    </>
  );
}

function SheetCard({ item, onOpen, onAi, onDelete, onTab, busy }: { item: SheetItem; onOpen: () => void; onAi: () => void; onDelete: () => void; onTab: () => void; busy: boolean }) {
  const url = useRef('');
  if (!url.current) url.current = URL.createObjectURL(item.blob);
  useEffect(() => () => URL.revokeObjectURL(url.current), []);
  return (
    <div className="card" style={{ padding: 12 }}>
      <img src={url.current} alt={item.name} onClick={onOpen} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 10, cursor: 'zoom-in', background: '#fff' }} />
      <div className="row between" style={{ marginTop: 8 }}>
        <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</b>
        <button className="btn ghost sm danger" onClick={onDelete} aria-label="Delete"><Icon name="trash" size={14} /></button>
      </div>
      <div className="row wrap" style={{ marginTop: 6 }}>
        <button className="btn sm" onClick={onTab}>Type it in</button>
        <button className="btn sm" onClick={onAi} disabled={busy}><Icon name="sparkles" size={13} /> {busy ? 'Reading…' : 'Claude'}</button>
      </div>
    </div>
  );
}

export function SheetViewer({ blob, compact }: { blob: Blob; compact?: boolean }) {
  const url = useRef('');
  if (!url.current) url.current = URL.createObjectURL(blob);
  useEffect(() => () => URL.revokeObjectURL(url.current), []);
  const [zoom, setZoom] = useState(compact ? 1 : 1);
  const [rot, setRot] = useState(0);
  return (
    <div>
      <div className="row" style={{ margin: '8px 0' }}>
        <Seg value={zoom} onChange={setZoom} options={[{ v: 0.6, label: '60%' }, { v: 1, label: '100%' }, { v: 1.5, label: '150%' }, { v: 2.2, label: '220%' }]} />
        <button className="btn sm" onClick={() => setRot((r) => (r + 90) % 360)}>Rotate</button>
      </div>
      <div style={{ overflow: 'auto', maxHeight: compact ? 420 : '70vh', background: '#fff', borderRadius: 10 }}>
        <img src={url.current} alt="Sheet" style={{ width: `${zoom * 100}%`, transform: `rotate(${rot}deg)`, display: 'block' }} />
      </div>
    </div>
  );
}
