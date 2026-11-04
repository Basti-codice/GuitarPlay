import { useMemo, useState } from 'react';
import { ChordDiagram, Diff, PageHead, Seg, Setting, Slider, Stars, Toggle } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { getSong, deleteUserSong, useSongs } from '../core/songs-store';
import { navigate } from '../core/router';
import { updateSettings, useSettings } from '../core/settings';
import { useProgress } from '../core/progress';
import { chordInfo } from '../songs/chords';
import { barBeats } from '../songs/arrange';
import { mic } from '../audio/mic';
import { getCtx } from '../audio/engine';
import { fmtTime } from '../ui/kit';
import { Timeline } from '../core/timeline';

export function SongDetail({ id }: { id: string }) {
  useSongs();
  const song = getSong(id);
  const s = useSettings();
  const prog = useProgress();
  const [trackId, setTrackId] = useState<string>('');
  const [speed, setSpeed] = useState(1);
  const [loopOn, setLoopOn] = useState(false);
  const [loopA, setLoopA] = useState(1);
  const [loopB, setLoopB] = useState(2);

  const tid = trackId || (song?.tracks.find((t) => t.kind === 'melody') ?? song?.tracks[0])?.id || '';
  const track = song?.tracks.find((t) => t.id === tid);
  const uniqueChords = useMemo(() => {
    if (!song) return [];
    const names: string[] = [];
    for (const c of song.chords) if (!names.includes(c.name)) names.push(c.name);
    for (const ev of track?.events ?? []) if (ev.chord && !names.includes(ev.chord)) names.push(ev.chord);
    return names.slice(0, 12);
  }, [song, track]);

  if (!song || !track) {
    return (
      <div className="page">
        <h1>Song not found</h1>
        <button className="btn" onClick={() => navigate('/library')}>Back to songs</button>
      </div>
    );
  }
  const bl = barBeats(song);
  const bars = Math.max(1, Math.ceil((song.lengthBeats - (song.pickup ?? 0)) / bl));
  const dur = new Timeline(song.bpm, song.tempoMap).toSec(song.lengthBeats);
  const best = prog.best[`${song.id}:${track.id}`];

  const start = async (mode: 'realtime' | 'wait' | 'listen') => {
    getCtx();
    if (mode !== 'listen') void mic.start();
    const q = new URLSearchParams({ track: tid, speed: String(speed), mode });
    if (loopOn) q.set('loop', `${Math.min(loopA, loopB)}-${Math.max(loopA, loopB)}`);
    navigate(`/play/${encodeURIComponent(song.id)}?${q}`);
  };

  return (
    <div className="page">
      <div>
        <button className="btn ghost sm" onClick={() => navigate('/library')}>
          <Icon name="left" size={16} /> Songs
        </button>
      </div>
      <div className="hero">
        <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
              <span className="pill accent">{song.genre}</span>
              <span className="pill">{song.beatsPerBar}/{song.beatUnit}</span>
              <span className="pill">{song.bpm} BPM</span>
              {song.key && <span className="pill">Key {song.key}</span>}
              {song.capo > 0 && <span className="pill info">Capo {song.capo}</span>}
              <span className="pill">{fmtTime(dur)}</span>
            </div>
            <h1>{song.title}</h1>
            <p style={{ marginTop: 4 }}>{song.artist}</p>
            {song.description && <p style={{ maxWidth: 560 }}>{song.description}</p>}
            <div className="row" style={{ gap: 14, marginTop: 8 }}>
              <Diff n={song.difficulty} />
              <span className="small muted">Level {song.difficulty}/5</span>
              {best && <Stars n={best.stars} />}
              {best && <span className="small muted">Best {Math.round(best.accuracy * 100)}% · {best.score.toLocaleString()} pts</span>}
            </div>
          </div>
          <div className="col" style={{ minWidth: 220 }}>
            <button className="btn primary lg" onClick={() => void start(s.playMode)} id="start-btn">
              <Icon name="play" size={18} /> Play
            </button>
            <button className="btn" onClick={() => void start('listen')}>
              <Icon name="eye" size={17} /> Watch & listen
            </button>
            {song.source === 'user' && (
              <div className="row">
                <button className="btn sm grow" onClick={() => navigate(`/editor/${encodeURIComponent(song.id)}`)}>
                  <Icon name="editor" size={15} /> Edit
                </button>
                <button
                  className="btn sm danger"
                  onClick={() => {
                    if (confirm(`Delete “${song.title}”?`)) void deleteUserSong(song.id).then(() => navigate('/library'));
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid c2">
        <div className="card">
          <h3>Arrangement</h3>
          <div className="col" style={{ marginTop: 10 }}>
            {song.tracks.map((t) => (
              <button key={t.id} className={`card hover ${t.id === tid ? '' : ''}`} style={{ textAlign: 'left', borderColor: t.id === tid ? 'var(--accent)' : undefined, padding: 14 }} onClick={() => setTrackId(t.id)}>
                <div className="row between">
                  <b>{t.name}</b>
                  <span className="small muted">{t.events.length} events</span>
                </div>
                <div className="small muted">
                  {t.kind === 'melody' ? 'Single-note melody as tab' : t.kind === 'chords' ? 'Strum the chords along with the backing' : t.kind === 'picking' ? 'Arpeggiated bass + treble pattern' : 'Tab for the whole piece'}
                </div>
              </button>
            ))}
          </div>
          {song.source === 'builtin' && song.tracks.some((t) => t.kind === 'melody') && (
            <p className="tiny faint" style={{ marginTop: 12 }}>
              Melodies are transcribed from memory and the fingering is chosen automatically. If a note sounds wrong, fix it in the Editor.
            </p>
          )}
        </div>
        <div className="card">
          <h3>Practice options</h3>
          <Setting label="Mode" desc="Real-time follows the beat. Wait-for-me pauses until you play the right note.">
            <Seg value={s.playMode} onChange={(v) => updateSettings({ playMode: v })} options={[{ v: 'realtime', label: 'Real-time' }, { v: 'wait', label: 'Wait for me' }]} />
          </Setting>
          <Setting label={`Speed ${Math.round(speed * 100)}%`}>
            <Slider value={speed} min={0.4} max={1.25} step={0.05} onChange={setSpeed} width={170} />
          </Setting>
          <Setting label="Loop section" desc={`Bars ${Math.min(loopA, loopB)}–${Math.max(loopA, loopB)} of ${bars}`}>
            <Toggle on={loopOn} onChange={setLoopOn} label="Loop" />
          </Setting>
          {loopOn && (
            <div className="row" style={{ paddingBottom: 10 }}>
              <label className="field grow">
                From bar
                <input type="number" min={1} max={bars} value={loopA} onChange={(e) => setLoopA(Math.max(1, Math.min(bars, parseInt(e.target.value) || 1)))} />
              </label>
              <label className="field grow">
                To bar
                <input type="number" min={1} max={bars} value={loopB} onChange={(e) => setLoopB(Math.max(1, Math.min(bars, parseInt(e.target.value) || 1)))} />
              </label>
            </div>
          )}
          <Setting label="Backing band" desc="Drums, bass and pad generated from the chords. Use headphones!">
            <Toggle on={s.backingOn} onChange={(v) => updateSettings({ backingOn: v })} label="Backing band" />
          </Setting>
          <Setting label="Reference guitar" desc="Hear the part played back while you play.">
            <Toggle on={s.refOn} onChange={(v) => updateSettings({ refOn: v })} label="Reference guitar" />
          </Setting>
          <Setting label="Metronome click">
            <Toggle on={s.clickOn} onChange={(v) => updateSettings({ clickOn: v })} label="Click" />
          </Setting>
          {(s.backingOn || s.refOn || s.clickOn) && (
            <div className="tip small">
              <Icon name="headphones" size={14} /> The microphone also hears your speakers. Wear headphones when the backing band, reference guitar or click is on.
            </div>
          )}
        </div>
      </div>

      {uniqueChords.length > 0 && (
        <div className="card">
          <h3>Chords in this piece</h3>
          <div className="row wrap" style={{ gap: 18, marginTop: 10 }}>
            {uniqueChords.map((c) => {
              const info = chordInfo(c);
              return info ? <ChordDiagram key={c} shape={info.shape} name={c} size={96} /> : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const _pageHead = PageHead;
