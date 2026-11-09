import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { ChordDiagram, Meter, Modal, Seg, Stars, Toggle, useMicLevel, useMicState } from '../ui/kit';
import { getSong, useSongs } from '../core/songs-store';
import { navigate } from '../core/router';
import { getSettings, updateSettings, useSettings } from '../core/settings';
import { PlaySession, defaultTrack, type PlayMode } from '../game/session';
import { Waterfall } from '../game/waterfall';
import { multiplier, starsFor } from '../game/judge';
import { addPractice, recordSession, setCounterMax, setLesson, getProgress } from '../core/progress';
import { exKey, lessonById } from '../learn/lessons';
import { mic } from '../audio/mic';
import { getCtx } from '../audio/engine';
import { noteName } from '../core/music';
import { chordInfo } from '../songs/chords';
import { barBeats } from '../songs/arrange';
import { chordAt } from '../songs/arrange';
import { Recorder as AudioRecorder, saveRecording } from '../audio/recorder';
import { toast } from '../ui/toast';

interface Hud {
  score: number;
  combo: number;
  acc: number;
  mult: number;
  progress: number;
  count: number | null;
  holding: boolean;
  state: string;
  detected: string;
  cents: number;
  chord: string | null;
  nextChord: string | null;
  next: number[] | null;
  next2: number[] | null;
}

const emptyHud: Hud = { score: 0, combo: 0, acc: 1, mult: 1, progress: 0, count: null, holding: false, state: 'ready', detected: '', cents: 0, chord: null, nextChord: null, next: null, next2: null };

export function Play({ id, query }: { id: string; query: URLSearchParams }) {
  useSongs();
  const song = getSong(id);
  const s = useSettings();
  const micState = useMicState();
  const lvl = useMicLevel(micState.state === 'on');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<PlaySession | null>(null);
  const wfRef = useRef<Waterfall | null>(null);
  const recRef = useRef<AudioRecorder | null>(null);
  const [hud, setHud] = useState<Hud>(emptyHud);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'paused' | 'done'>('ready');
  const [version, setVersion] = useState(0);
  const [recordIt, setRecordIt] = useState(false);

  const trackId = query.get('track') ?? (song ? defaultTrack(song).id : '');
  const speed = parseFloat(query.get('speed') ?? '1') || 1;
  const mode = (query.get('mode') as PlayMode) ?? s.playMode;
  const loopQ = query.get('loop');
  const sim = query.get('sim') === '1';
  const lessonQ = query.get('lesson');
  const needQ = parseFloat(query.get('need') ?? '0') || 0;

  const loop = useMemo(() => {
    if (!song || !loopQ) return null;
    const [a, b] = loopQ.split('-').map((x) => parseInt(x));
    if (!a || !b) return null;
    const bl = barBeats(song);
    const pk = song.pickup ?? 0;
    return { startBeat: pk + (a - 1) * bl, endBeat: pk + b * bl };
  }, [song, loopQ]);

  // (re)create the session when the configuration changes
  useEffect(() => {
    if (!song) return;
    sessionRef.current?.stop();
    const sess = new PlaySession({ song, trackId, speed, mode, loop, countIn: s.countIn });
    sessionRef.current = sess;
    wfRef.current?.reset();
    setPhase('ready');
    setHud(emptyHud);
    sess.listeners.state.add(() => {
      if (sess.state === 'finished') finishUp(sess);
    });
    return () => sess.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, trackId, speed, mode, loopQ, version]);

  const finishUp = useCallback(
    (sess: PlaySession) => {
      void recRef.current?.stop().then((blob) => {
        if (blob && blob.size > 0) {
          void saveRecording(blob, `${sess.song.title} – ${new Date().toLocaleString()}`, sess.song.id).then(() => toast('Recording saved in Recorder'));
        }
        recRef.current = null;
      });
      if (sess.mode !== 'listen' && sess.score.judged > 0) {
        recordSession(sess.summary(), sess.weak);
        // lesson progress
        const lessonId = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('lesson');
        const exIdx = parseInt(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('ex') ?? '-1');
        const need = parseFloat(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('need') ?? '1');
        const lesson = lessonId ? lessonById(lessonId) : undefined;
        if (lesson && exIdx >= 0) {
          const acc = sess.score.accuracy;
          if (acc >= need) {
            setCounterMax(exKey(lesson.id, exIdx), 1);
            const all = lesson.exercises.every((e, i) => e.link || (getProgress().counters[exKey(lesson.id, i)] ?? 0) > 0);
            if (all) setLesson(lesson.id, starsFor(acc), acc, true);
            else setLesson(lesson.id, 0, acc, false);
          } else setLesson(lesson.id, 0, acc, false);
        }
      }
      addPractice(sess.playedSeconds);
      setPhase('done');
    },
    [],
  );

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wf = new Waterfall(canvas);
    wfRef.current = wf;
    const ro = new ResizeObserver(() => wf.resize());
    ro.observe(canvas);
    wf.resize();
    let raf = 0;
    let lastHud = 0;
    const loopFn = (t: number) => {
      const sess = sessionRef.current;
      if (sess) {
        sess.tick();
        const st = getSettings();
        wf.draw(sess, st.lookahead, st.leftHanded, { mode: st.waterfallMode, big: st.bigNumbers });
        if (t - lastHud > 66) {
          lastHud = t;
          setHud(readHud(sess));
        }
      }
      raf = requestAnimationFrame(loopFn);
    };
    raf = requestAnimationFrame(loopFn);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [song?.id]);

  const begin = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess) return;
    getCtx();
    if (sess.mode !== 'listen') {
      if (sim) await mic.startSimulated();
      else if (mic.state !== 'on') await mic.start();
    }
    wfRef.current?.reset();
    await sess.start(loop ? loop.startBeat : 0, true);
    setPhase('playing');
    if (sim) void sess.attachVirtualPlayer({ jitter: 0.03, errorRate: parseFloat(query.get('err') ?? '0.08') });
    if (recordIt && sess.mode !== 'listen' && !sim) {
      const r = new AudioRecorder();
      recRef.current = r;
      void r.start();
    }
  }, [loop, sim, recordIt, query]);

  const togglePause = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess) return;
    if (sess.state === 'playing') {
      sess.pause();
      setPhase('paused');
    } else if (sess.state === 'paused') {
      await sess.resume();
      setPhase('playing');
    }
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'ready') void begin();
        else void togglePause();
      } else if (e.key === 'Escape') {
        sessionRef.current?.stop();
        navigate(`/song/${encodeURIComponent(id)}`);
      } else if (e.key.toLowerCase() === 'r') {
        setVersion((v) => v + 1);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [phase, begin, togglePause, id]);

  if (!song) {
    return (
      <div className="page" style={{ padding: 40 }}>
        <h1>Song not found</h1>
        <button className="btn" onClick={() => navigate('/library')}>Back</button>
      </div>
    );
  }
  const sess = sessionRef.current;
  const track = sess?.track;

  const setQuery = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) (v === null ? q.delete(k) : q.set(k, v));
    navigate(`/play/${encodeURIComponent(id)}?${q}`);
  };

  const chordInfoCur = hud.chord ? chordInfo(hud.chord) : null;
  const chordInfoNext = hud.nextChord ? chordInfo(hud.nextChord) : null;

  return (
    <div className="play" id="play-root">
      <div className="play-top">
        <button
          className="btn ghost icon"
          aria-label="Back"
          onClick={() => {
            sessionRef.current?.stop();
            navigate(`/song/${encodeURIComponent(id)}`);
          }}
        >
          <Icon name="left" size={20} />
        </button>
        <div className="song">
          <b>{song.title}</b>
          <span className="small muted">
            {track?.name} · {Math.round(speed * 100)}% · {mode === 'wait' ? 'Wait for me' : mode === 'listen' ? 'Watch & listen' : 'Real-time'}
            {loop ? ` · loop bars ${loopQ}` : ''}
          </span>
        </div>
        <div className="hud-stat">
          <div className="v" id="hud-score">{Math.round(hud.score).toLocaleString()}</div>
          <div className="k">Score</div>
        </div>
        <div className="hud-stat">
          <div className="v" id="hud-acc">{mode === 'listen' ? '–' : `${Math.round(hud.acc * 100)}%`}</div>
          <div className="k">Accuracy</div>
        </div>
        <div className="hud-stat" style={{ width: 90 }}>
          <Meter value={Math.min(1, lvl)} />
          <div className="k" style={{ marginTop: 6 }}>Input</div>
        </div>
      </div>
      <div className="play-prog">
        <i style={{ width: `${hud.progress * 100}%` }} />
      </div>
      <div className="play-stage" ref={stageRef}>
        <canvas ref={canvasRef} id="waterfall" />
        <div className={`leftstack ${s.waterfallMode === 'side' ? 'side' : ''}`}>
          {mode !== 'listen' && (
            <div className="detect">
              <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>You play</div>
              <div className="note" style={{ color: hud.detected ? 'var(--text)' : 'var(--faint)' }}>{hud.detected || '–'}</div>
              <div className="tiny muted" style={{ height: 14 }}>{hud.detected ? `${hud.cents > 0 ? '+' : ''}${hud.cents} cents` : ''}</div>
            </div>
          )}
          {s.fretHint && hud.next && phase === 'playing' && (
            <div className="hintbox">
              <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>Next</div>
              <div className="row" style={{ gap: 4, alignItems: 'flex-start' }}>
                <ChordDiagram shape={hud.next} size={84} hideMutes />
                {hud.next2 && <ChordDiagram shape={hud.next2} size={64} hideMutes dim />}
              </div>
            </div>
          )}
        </div>
        {s.showChordBox && (chordInfoCur || chordInfoNext) && (
          <div className="chordbox">
            {chordInfoCur && (
              <div className="cb">
                <ChordDiagram shape={chordInfoCur.shape} name={chordInfoCur.name} size={104} />
              </div>
            )}
            {chordInfoNext && hud.nextChord !== hud.chord && (
              <div className="cb next">
                <ChordDiagram shape={chordInfoNext.shape} name={chordInfoNext.name} size={104} dim />
              </div>
            )}
          </div>
        )}
        {hud.combo >= 5 && phase === 'playing' && (
          <div className="combo">
            <div className="n">{hud.combo}</div>
            <div className="m">combo · x{hud.mult}</div>
          </div>
        )}
        {hud.count != null && phase === 'playing' && (
          <div className="big-center">
            <div className="num" key={hud.count}>{hud.count}</div>
          </div>
        )}
        {hud.holding && phase === 'playing' && (
          <div className="waiting">
            <span className="pill accent" style={{ fontSize: 14, padding: '6px 14px' }}>Waiting for you…</span>
          </div>
        )}
        {phase === 'ready' && (
          <div className="overlay" style={{ position: 'absolute', zIndex: 5 }}>
            <div className="modal" style={{ width: 'min(560px,100%)' }}>
              <h2>{song.title}</h2>
              <p>
                {track?.name} · {song.bpm} BPM · {Math.round(speed * 100)}% speed
              </p>
              {mode !== 'listen' && micState.state !== 'on' && !sim && (
                <div className="tip small">
                  {micState.state === 'error' ? micState.error : 'Microphone is off – press Start and allow access when the browser asks.'}
                </div>
              )}
              {(s.backingOn || s.refOn || s.clickOn) && mode !== 'wait' && (
                <div className="tip small">
                  <Icon name="headphones" size={14} /> Audio playback is on – headphones recommended so the microphone does not hear it.
                </div>
              )}
              <div className="grid c2" style={{ marginTop: 6 }}>
                <label className="field">
                  Speed
                  <Seg
                    value={speed}
                    onChange={(v) => setQuery({ speed: String(v) })}
                    options={[{ v: 0.5, label: '50%' }, { v: 0.7, label: '70%' }, { v: 0.85, label: '85%' }, { v: 1, label: '100%' }]}
                  />
                </label>
                <label className="field">
                  Mode
                  <Seg
                    value={mode}
                    onChange={(v) => {
                      updateSettings({ playMode: v === 'listen' ? s.playMode : v });
                      setQuery({ mode: v });
                    }}
                    options={[{ v: 'realtime', label: 'Real-time' }, { v: 'wait', label: 'Wait' }, { v: 'listen', label: 'Watch' }]}
                  />
                </label>
                <label className="field row" style={{ gap: 10 }}>
                  <Toggle on={recordIt} onChange={setRecordIt} label="Record my playing" />
                  <span>Record my playing</span>
                </label>
                <label className="field row" style={{ gap: 10 }}>
                  <Toggle on={s.leftHanded} onChange={(v) => updateSettings({ leftHanded: v })} label="Mirror lanes (left-handed)" />
                  <span>Mirror lanes</span>
                </label>
              </div>
              <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
                <button className="btn ghost" onClick={() => navigate(`/song/${encodeURIComponent(id)}`)}>Cancel</button>
                <button className="btn primary lg" id="begin" onClick={() => void begin()}>
                  <Icon name="play" size={18} /> Start <kbd>Space</kbd>
                </button>
              </div>
            </div>
          </div>
        )}
        {phase === 'paused' && (
          <div className="overlay" style={{ position: 'absolute', zIndex: 5 }}>
            <div className="modal" style={{ width: 'min(420px,100%)' }}>
              <h2>Paused</h2>
              <div className="col" style={{ marginTop: 14 }}>
                <button className="btn primary lg" onClick={() => void togglePause()}><Icon name="play" size={18} /> Resume</button>
                <button className="btn" onClick={() => setVersion((v) => v + 1)}><Icon name="repeat" size={17} /> Restart</button>
                <button className="btn" onClick={() => navigate(`/song/${encodeURIComponent(id)}`)}>Leave</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="play-bottom">
        <button className="btn" onClick={() => (phase === 'ready' ? void begin() : void togglePause())}>
          <Icon name={phase === 'playing' ? 'pause' : 'play'} size={17} />
          {phase === 'playing' ? 'Pause' : phase === 'paused' ? 'Resume' : 'Start'}
        </button>
        <button className="btn" onClick={() => setVersion((v) => v + 1)}>
          <Icon name="repeat" size={17} /> Restart <kbd>R</kbd>
        </button>
        {mode === 'wait' && (
          <button className="btn" onClick={() => sessionRef.current?.skipCurrent()}>
            <Icon name="skip" size={16} /> Skip note
          </button>
        )}
        <span className="grow" />
        <Seg value={s.waterfallMode} onChange={(v) => updateSettings({ waterfallMode: v })} options={[{ v: 'fall', label: 'Falling' }, { v: 'side', label: 'Side-scroll' }]} />
        <label className="row small muted" style={{ gap: 8 }}>
          <Toggle on={s.bigNumbers} onChange={(v) => updateSettings({ bigNumbers: v })} label="Large numbers" /> Large
        </label>
        <label className="row small muted" style={{ gap: 8 }}>
          <Toggle on={s.fretHint} onChange={(v) => updateSettings({ fretHint: v })} label="Fingering hint" /> Hint
        </label>
        <label className="row small muted" style={{ gap: 8 }}>
          Note speed
          <input type="range" min={1.4} max={4.5} step={0.1} style={{ width: 110 }} value={6 - s.lookahead} onChange={(e) => updateSettings({ lookahead: 6 - parseFloat(e.target.value) })} />
        </label>
        <label className="row small muted" style={{ gap: 8 }}>
          <Toggle on={s.backingOn} onChange={(v) => updateSettings({ backingOn: v })} label="Backing" /> Backing
        </label>
        <label className="row small muted" style={{ gap: 8 }}>
          <Toggle on={s.refOn} onChange={(v) => updateSettings({ refOn: v })} label="Reference" /> Reference
        </label>
        <label className="row small muted" style={{ gap: 8 }}>
          <Toggle on={s.clickOn} onChange={(v) => updateSettings({ clickOn: v })} label="Click" /> Click
        </label>
      </div>
      {phase === 'done' && sess && <Results lesson={lessonQ} need={needQ} sess={sess} onRetry={() => setVersion((v) => v + 1)} onSlower={() => setQuery({ speed: String(Math.max(0.4, +(speed - 0.15).toFixed(2))) })} onLoop={(a, b) => setQuery({ loop: `${a}-${b}` })} />}
    </div>
  );
}

function readHud(sess: PlaySession): Hud {
  const beat = sess.songBeat();
  const pickup = sess.song.pickup ?? 0;
  const total = Math.max(1, sess.endBeat);
  const sc = sess.score;
  const det = sess.detected;
  const chordSrc = sess.song.chords.length ? sess.song.chords : [];
  const cur = chordAt(chordSrc, Math.max(0, beat))?.name ?? null;
  const nextMark = chordSrc.find((c) => c.beat > Math.max(0, beat) + 1e-6);
  const toStart = pickup - beat;
  let count: number | null = null;
  if (sess.state === 'playing' && toStart > 0.05 && beat < pickup && sess.mode !== 'listen') count = Math.ceil(toStart / sess.beatStep - 0.05);
  const frac = (beat / total) as number;
  // where to put the fingers for the next two events (single-note / picking tracks)
  let next: number[] | null = null;
  let next2: number[] | null = null;
  if (sess.track.kind !== 'chords') {
    const now = sess.playTime();
    const evs = sess.track.events;
    let found = 0;
    for (let i = 0; i < evs.length && found < 2; i++) {
      if (sess.results.has(i) || sess.tl.toSec(evs[i].beat) / sess.speed < now - 0.15) continue;
      const shape = [-1, -1, -1, -1, -1, -1];
      let any = false;
      for (const n of evs[i].notes) if (!n.dead) {
        shape[n.string] = n.fret;
        any = true;
      }
      if (!any) continue;
      if (found === 0) next = shape;
      else next2 = shape;
      found++;
    }
  }
  return {
    score: sc.score,
    combo: sc.combo,
    acc: sc.accuracy,
    mult: multiplier(sc.combo),
    progress: Math.max(0, Math.min(1, frac)),
    count: count != null && count >= 1 && count <= 8 ? count : null,
    holding: sess.holding,
    state: sess.state,
    detected: det ? noteName(det.midi) : '',
    cents: det ? Math.round((det.midi - Math.round(det.midi)) * 100) : 0,
    chord: cur,
    nextChord: nextMark?.name ?? null,
    next,
    next2,
  };
}

// ---------------------------------------------------------------------------
function Results({ sess, onRetry, onSlower, onLoop, lesson, need }: { sess: PlaySession; onRetry: () => void; onSlower: () => void; onLoop: (a: number, b: number) => void; lesson: string | null; need: number }) {
  const sc = sess.score;
  const listen = sess.mode === 'listen';
  const stars = starsFor(sc.accuracy);
  const song = sess.song;
  const bl = barBeats(song);
  const pk = song.pickup ?? 0;
  const timing = sess.timing;
  const avg = timing.length ? (timing.reduce((a, b) => a + b, 0) / timing.length) * 1000 : 0;
  // errors per bar
  const perBar = new Map<number, number>();
  sess.results.forEach((r, id) => {
    if (r.grade === 'miss' || r.grade === 'wrong') {
      const ev = sess.track.events[id];
      const bar = Math.floor((ev.beat - pk) / bl + 1e-6) + 1;
      perBar.set(bar, (perBar.get(bar) ?? 0) + 1);
    }
  });
  const worst = [...perBar.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const bars = Math.max(1, Math.ceil((song.lengthBeats - pk) / bl));
  const hist = new Array(11).fill(0);
  for (const t of timing) hist[Math.max(0, Math.min(10, Math.round(t * 1000 / 30) + 5))]++;
  const hmax = Math.max(1, ...hist);
  return (
    <Modal wide>
      {listen ? (
        <>
          <h2>Done listening</h2>
          <p>Ready to try it yourself?</p>
        </>
      ) : (
        <>
          <div className="center">
            <div className="result-stars" id="result-stars">
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < stars ? 'on' : 'off'}>★</span>
              ))}
            </div>
            <h1 id="result-acc">{Math.round(sc.accuracy * 100)}%</h1>
            <p>{stars === 3 ? 'Outstanding!' : stars === 2 ? 'Great playing!' : stars === 1 ? 'Nice work – keep going.' : 'Keep practising – try a slower speed.'}</p>
          </div>
          <div className="grid c4" style={{ marginTop: 14 }}>
            <Stat k="Score" v={Math.round(sc.score).toLocaleString()} />
            <Stat k="Max combo" v={String(sc.maxCombo)} />
            <Stat k="Perfect / Good" v={`${sc.counts.perfect} / ${sc.counts.good}`} />
            <Stat k="Miss / Wrong" v={`${sc.counts.miss} / ${sc.counts.wrong}`} />
          </div>
          {sess.mode === 'realtime' && timing.length > 5 && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="row between">
                <h3>Timing</h3>
                <span className="small muted">
                  {Math.abs(avg) < 15 ? 'Right on the beat' : avg > 0 ? `You tend to be ${Math.round(avg)} ms late` : `You tend to be ${Math.round(-avg)} ms early`}
                </span>
              </div>
              <div className="row" style={{ alignItems: 'flex-end', gap: 4, height: 60, marginTop: 8 }}>
                {hist.map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${(h / hmax) * 100}%`, minHeight: 2, background: i === 5 ? 'var(--good)' : 'var(--card3)', borderRadius: 3 }} />
                ))}
              </div>
              <div className="row between tiny faint"><span>early</span><span>late</span></div>
            </div>
          )}
          {lesson && (
            <div className="tip" style={{ marginTop: 14, borderColor: sc.accuracy >= need ? 'var(--good)' : 'var(--warn)' }}>
              {sc.accuracy >= need ? `✓ Lesson goal reached (${Math.round(need * 100)}% needed).` : `Lesson goal: ${Math.round(need * 100)}% accuracy – you got ${Math.round(sc.accuracy * 100)}%. Try again!`}
            </div>
          )}
          {worst.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3>Trouble spots</h3>
              <div className="row wrap" style={{ marginTop: 8 }}>
                {worst.map(([bar, n]) => (
                  <button key={bar} className="btn sm" onClick={() => onLoop(Math.max(1, bar), Math.min(bars, bar + 1))}>
                    Bar {bar} <span className="pill bad">{n} missed</span> → loop it
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn ghost" onClick={() => navigate(lesson ? `/learn/${lesson}` : `/song/${encodeURIComponent(song.id)}`)}>{lesson ? 'Back to lesson' : 'Back to song'}</button>
        {!listen && sc.accuracy < 0.85 && (
          <button className="btn" onClick={onSlower}>Retry slower</button>
        )}
        <button className="btn primary" onClick={onRetry} id="retry">
          <Icon name="repeat" size={17} /> {listen ? 'Play it yourself' : 'Try again'}
        </button>
      </div>
      <div style={{ display: 'none' }}>
        <Stars n={stars} />
      </div>
    </Modal>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="card center" style={{ padding: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{v}</div>
      <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k}</div>
    </div>
  );
}
