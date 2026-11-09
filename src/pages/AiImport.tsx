import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Seg } from '../ui/kit';
import { TUNINGS } from '../core/music';
import { buildAiPrompt, FIX_PROMPT, type KnownSettings } from '../songs/import/prompt';
import { parseTabText, type TabMeta } from '../songs/import/tabtext';
import { importAbcText } from '../songs/import';
import { saveUserSong } from '../core/songs-store';
import { bump } from '../core/progress';
import { navigate } from '../core/router';
import { toast } from '../ui/toast';
import { lsSet } from '../core/storage';
import { playPreview, stopPreview } from '../audio/preview';
import type { Song } from '../core/types';

const METERS = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8', '9/8'];
const GRIDS = [4, 8, 12, 16, 32];
const STYLES = ['folk', 'rock', 'ballad', 'waltz', 'shuffle', 'reggae', 'quarter', 'march'];

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied – paste it into your AI chat`);
  } catch {
    toast('Copy failed – select the text and copy it manually.');
  }
}

/** Step-by-step import with any AI assistant (ChatGPT, Claude, Gemini, …). */
export function AiImport({ sheetId }: { sheetId?: string }) {
  const [known, setKnown] = useState<KnownSettings>({});
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<TabMeta>({});
  const [playing, setPlaying] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const prompt = useMemo(() => buildAiPrompt(known, true), [known]);
  const k = (key: keyof KnownSettings) => (v: string) => setKnown((o) => ({ ...o, [key]: v }));

  const isAbc = /^\s*[XK]:/m.test(text) && !/^\s*[eEBGDAdg]?\s*\|[-0-9]/m.test(text);
  const result = useMemo(() => {
    if (!text.trim()) return null;
    if (isAbc) {
      try {
        const r = importAbcText(text);
        return { kind: 'abc' as const, song: r.song, warnings: r.notes, error: '', meta: null, defaulted: [] as string[], bars: 0 };
      } catch (e) {
        return { kind: 'error' as const, error: (e as Error).message };
      }
    }
    try {
      const r = parseTabText(text, overrides);
      return { kind: 'tab' as const, song: r.song, warnings: r.warnings, error: '', meta: r.meta, defaulted: r.defaulted, bars: r.bars };
    } catch (e) {
      return { kind: 'error' as const, error: (e as Error).message };
    }
  }, [text, overrides, isAbc]);

  const song: Song | null = result && result.kind !== 'error' ? result.song : null;
  const ov = (patch: TabMeta) => setOverrides((o) => ({ ...o, ...patch }));

  const save = async (open: boolean) => {
    if (!song) return;
    const s = { ...song, id: `${song.id}-${Math.random().toString(36).slice(2, 5)}`, sheetIds: sheetId ? [sheetId] : undefined };
    await saveUserSong(s);
    bump('created');
    toast('Song added to your library');
    navigate(open ? `/editor/${encodeURIComponent(s.id)}` : `/song/${encodeURIComponent(s.id)}`);
  };
  const toEditor = () => {
    lsSet('guitarplay.draft', { kind: result?.kind === 'abc' ? 'abc' : 'tab', text, overrides, sheetId });
    navigate('/editor/draft');
  };
  const listen = () => {
    if (!song) return;
    if (playing) {
      stopPreview();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    playPreview(song, song.tracks[0], 0, 60, () => setPlaying(false));
  };
  const flag = (name: string) => (result && result.kind === 'tab' && result.defaulted.includes(name) ? { borderColor: 'var(--warn)' } : undefined);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card">
        <div className="row"><span className="pill accent">Step 1</span><h3>Tell the AI what you already know</h3></div>
        <p className="small" style={{ marginTop: 6 }}>
          Anything you fill in here is written into the prompt as a fixed setting, so the AI does not have to guess it. Leave a field empty to let the AI read it from the image.
        </p>
        <div className="grid c4" style={{ marginTop: 8 }}>
          <label className="field">Title<input type="text" value={known.title ?? ''} onChange={(e) => k('title')(e.target.value)} /></label>
          <label className="field">Artist<input type="text" value={known.artist ?? ''} onChange={(e) => k('artist')(e.target.value)} /></label>
          <label className="field">Tempo (BPM)<input type="text" inputMode="numeric" placeholder="from image" value={known.tempo ?? ''} onChange={(e) => k('tempo')(e.target.value)} /></label>
          <label className="field">Meter
            <select value={known.meter ?? ''} onChange={(e) => k('meter')(e.target.value)}><option value="">AI decides</option>{METERS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <label className="field">Grid (1 column =)
            <select value={known.grid ?? ''} onChange={(e) => k('grid')(e.target.value)}><option value="">AI decides</option>{GRIDS.map((g) => <option key={g} value={`1/${g}`}>1/{g} note</option>)}</select>
          </label>
          <label className="field">Tuning
            <select value={known.tuning ?? ''} onChange={(e) => k('tuning')(e.target.value)}><option value="">standard / AI decides</option>{TUNINGS.map((t) => <option key={t.id} value={t.name.replace(/\s*\(.*\)/, '')}>{t.name}</option>)}</select>
          </label>
          <label className="field">Capo fret<input type="text" inputMode="numeric" placeholder="0" value={known.capo ?? ''} onChange={(e) => k('capo')(e.target.value)} /></label>
          <label className="field">Style
            <select value={known.style ?? ''} onChange={(e) => k('style')(e.target.value)}><option value="">AI decides</option>{STYLES.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
        </div>
        <label className="field" style={{ marginTop: 10 }}>
          Anything else the AI should know (optional)
          <input type="text" placeholder="e.g. “only the first page”, “play the upper voice only”, “pickup bar at the start”" value={known.extra ?? ''} onChange={(e) => k('extra')(e.target.value)} />
        </label>
      </div>

      <div className="card">
        <div className="row"><span className="pill accent">Step 2</span><h3>Give the prompt and the picture to your AI</h3></div>
        <ol className="small" style={{ lineHeight: 1.9, color: 'var(--muted)', paddingLeft: 20 }}>
          <li>Open ChatGPT, Claude, Gemini or any AI that can read images.</li>
          <li>Attach your photo or screenshot of the sheet music / tab.</li>
          <li>Paste the prompt below and send it.</li>
          <li>Copy the AI’s answer (the code block) and paste it in step 3.</li>
        </ol>
        <div className="row wrap">
          <button className="btn primary" onClick={() => void copy(prompt, 'Prompt')} id="copy-prompt"><Icon name="check" size={16} /> Copy prompt</button>
          <button className="btn" onClick={() => setShowPrompt((v) => !v)}>{showPrompt ? 'Hide prompt' : 'Show prompt'}</button>
        </div>
        {showPrompt && <textarea readOnly rows={14} value={prompt} style={{ marginTop: 10 }} aria-label="Prompt" onFocus={(e) => e.currentTarget.select()} />}
        <p className="tiny faint" style={{ marginTop: 8 }}>
          Tip: with several pages, send them together in one message. If the answer is cut off, reply “continue from bar N” and paste both parts one after another.
        </p>
      </div>

      <div className="card">
        <div className="row"><span className="pill accent">Step 3</span><h3>Paste the AI’s answer</h3></div>
        <textarea id="ai-paste" rows={10} value={text} onChange={(e) => { setText(e.target.value); setOverrides({}); }} placeholder={'Title: …\nTempo: …\nMeter: 4/4\nGrid: 1/8\n…\ne|-0---0--|…'} spellCheck={false} style={{ marginTop: 8 }} aria-label="AI answer" />
        {result?.kind === 'error' && (
          <div className="tip" style={{ borderColor: 'var(--bad)', marginTop: 10 }}>
            <b>Could not read this.</b> {result.error}
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={() => void copy(FIX_PROMPT, 'Correction request')}>Copy “please fix it” message for the AI</button>
            </div>
          </div>
        )}
      </div>

      {song && result && (
        <div className="card" id="ai-result">
          <div className="row between wrap">
            <h3>Result: {song.title}</h3>
            <span className="pill good">{result.kind === 'abc' ? 'ABC notation' : `${result.bars} bars`} · {song.tracks.length} track(s)</span>
          </div>
          {result.kind === 'tab' && result.meta && (
            <>
              <p className="small" style={{ margin: '8px 0 12px' }}>
                Check the settings. Changing them here re-reads your pasted text immediately – no need to ask the AI again.
                {result.defaulted.length > 0 && <> <b style={{ color: 'var(--warn)' }}>Orange fields were missing in the answer</b> and use a default.</>}
              </p>
              <div className="grid c4">
                <label className="field">Title<input type="text" value={result.meta.title} onChange={(e) => ov({ title: e.target.value })} style={flag('title')} /></label>
                <label className="field">Artist<input type="text" value={result.meta.artist} onChange={(e) => ov({ artist: e.target.value })} style={flag('artist')} /></label>
                <label className="field">Tempo (BPM)<input type="number" min={30} max={260} value={result.meta.tempo} onChange={(e) => ov({ tempo: parseInt(e.target.value) || 100 })} style={flag('tempo')} /></label>
                <label className="field">Meter
                  <select value={`${result.meta.num}/${result.meta.den}`} onChange={(e) => { const [a, b] = e.target.value.split('/').map(Number); ov({ num: a, den: b }); }} style={flag('meter')}>
                    {METERS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
                <label className="field">Grid (1 column =)
                  <select value={result.meta.grid ?? ''} onChange={(e) => ov({ grid: e.target.value ? parseInt(e.target.value) : undefined })} style={flag('grid')}>
                    <option value="">auto-detect</option>{GRIDS.map((g) => <option key={g} value={g}>1/{g} note</option>)}
                  </select>
                </label>
                <label className="field">Tuning
                  <select value={TUNINGS.find((t) => t.notes.join() === result.meta!.tuning.join())?.id ?? 'custom'} onChange={(e) => { const t = TUNINGS.find((x) => x.id === e.target.value); if (t) ov({ tuning: t.notes }); }} style={flag('tuning')}>
                    {!TUNINGS.some((t) => t.notes.join() === result.meta!.tuning.join()) && <option value="custom">Custom</option>}
                    {TUNINGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="field">Capo<input type="number" min={0} max={12} value={result.meta.capo} onChange={(e) => ov({ capo: parseInt(e.target.value) || 0 })} style={flag('capo')} /></label>
                <label className="field">Difficulty
                  <select value={result.meta.difficulty} onChange={(e) => ov({ difficulty: parseInt(e.target.value) })} style={flag('difficulty')}>{[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</select>
                </label>
                <label className="field">Genre<input type="text" value={result.meta.genre} onChange={(e) => ov({ genre: e.target.value })} style={flag('genre')} /></label>
                <label className="field">Backing style
                  <select value={result.meta.style ?? 'folk'} onChange={(e) => ov({ style: e.target.value as Song['style'] })} style={flag('style')}>{STYLES.map((m) => <option key={m}>{m}</option>)}</select>
                </label>
                <label className="field">Characters per column
                  <Seg value={overrides.spacing ?? 1} onChange={(v) => ov({ spacing: v })} options={[{ v: 1, label: '1' }, { v: 2, label: '2' }]} />
                </label>
              </div>
            </>
          )}
          {(result.warnings?.length ?? 0) > 0 && (
            <div className="tip small" style={{ borderColor: 'var(--warn)', marginTop: 12 }}>
              <b>Please check:</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{(result.warnings ?? []).slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}</ul>
              <div className="tiny" style={{ marginTop: 6 }}>Wrong bar widths usually mean a wrong Grid/Meter above, or a dash missing in the AI’s answer – fix the setting, or correct the text above, or fix it later in the editor.</div>
            </div>
          )}
          <div className="small muted" style={{ marginTop: 10 }}>
            {song.tracks.map((t) => `${t.name}: ${t.events.length} events`).join(' · ')} · {Math.round(song.lengthBeats)} beats
          </div>
          <div className="row wrap" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={listen}><Icon name={playing ? 'pause' : 'volume'} size={16} /> {playing ? 'Stop' : 'Listen'}</button>
            <button className="btn" onClick={toEditor}><Icon name="editor" size={16} /> Open in editor</button>
            <button className="btn primary" id="ai-add" onClick={() => void save(false)}><Icon name="check" size={16} /> Add to library</button>
          </div>
        </div>
      )}
    </div>
  );
}
