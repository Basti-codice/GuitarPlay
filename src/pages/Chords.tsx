import { useEffect, useMemo, useRef, useState } from 'react';
import { ChordDiagram, MicGate, PageHead, Slider, useMicState } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { BROWSER_QUALITIES, ROOT_FLAT_PREF, chordInfo, chordLabel, shapeMidis, shapeNotes } from '../songs/chords';
import { NoteListener } from '../game/listener';
import { STRING_COLORS, noteName, tuningLabels, STANDARD } from '../core/music';
import { getCtx } from '../audio/engine';
import { playStrum } from '../audio/synth';
import { noteChordCheck } from '../core/progress';
import { toast } from '../ui/toast';
import { navigate } from '../core/router';
import { buildChordDrill } from '../songs/generators';
import { registerTempSong, saveUserSong } from '../core/songs-store';

const TRAINER_SET = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F', 'Bm', 'C7', 'G7', 'D7', 'A7', 'E7', 'Cadd9', 'Dsus4', 'Asus2', 'Fmaj7', 'Am7'];

export function Chords() {
  const m = useMicState();
  const [root, setRoot] = useState('C');
  const [q, setQ] = useState('maj');
  const name = chordLabel(root, q);
  const info = chordInfo(name);
  const midis = useMemo(() => (info ? shapeMidis(info.shape) : []), [info]);
  const strs = useMemo(() => (info ? shapeNotes(info.shape) : []), [info]);
  const [states, setStates] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [passed, setPassed] = useState(0);
  const [tab, setTab] = useState<'browser' | 'trainer' | 'changes'>('browser');
  const lastUi = useRef(0);

  useEffect(() => {
    if (tab !== 'browser' || m.state !== 'on' || !info) return;
    setStates([0, 0, 0, 0, 0, 0]);
    const l = new NoteListener({
      targets: midis,
      need: Math.max(1, Math.ceil(midis.length * 0.8)),
      onFrame: (r) => {
        const now = performance.now();
        if (now - lastUi.current < 60) return;
        lastUi.current = now;
        setStates((old) => {
          const next = [0, 0, 0, 0, 0, 0];
          strs.forEach((n, i) => (next[n.string] = Math.max(old[n.string] * 0.85, r.scores[i])));
          return next;
        });
      },
      onHit: () => {
        noteChordCheck(name);
        setPassed((p) => p + 1);
        toast(`✓ ${name} rings clean`);
      },
    });
    l.start();
    return () => l.stop();
  }, [tab, m.state, info, midis, strs, name]);

  const hear = () => {
    getCtx();
    if (midis.length) playStrum(midis, getCtx().currentTime + 0.03, 'd', { gain: 0.5, hold: 2.5, reverb: 0.2 });
  };
  const labels = tuningLabels(STANDARD);

  return (
    <div className="page">
      <PageHead title="Chords" sub="Look up any chord, hear it, and let the microphone tell you which strings ring." />
      <div className="tabs">
        {(['browser', 'trainer', 'changes'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'browser' ? 'Chord library & check' : t === 'trainer' ? 'Chord trainer' : 'Practise changes'}</button>
        ))}
      </div>
      {tab === 'browser' && (
        <>
          <div className="card">
            <div className="row wrap" style={{ gap: 6 }}>
              {ROOT_FLAT_PREF.map((r) => (
                <button key={r} className={`btn sm ${r === root ? 'primary' : ''}`} onClick={() => setRoot(r)} style={{ minWidth: 44 }}>{r}</button>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              {BROWSER_QUALITIES.map((x) => (
                <button key={x} className={`btn sm ${x === q ? 'primary' : ''}`} onClick={() => setQ(x)}>{chordLabel('', x) || 'major'}</button>
              ))}
            </div>
          </div>
          <div className="grid c2">
            <div className="card center">
              <h2 id="chord-name">{name}</h2>
              {info ? (
                <>
                  <div style={{ margin: '10px 0' }}><ChordDiagram shape={info.shape} size={220} /></div>
                  <div className="small muted">Notes: {[...new Set(midis.map((x) => noteName(x, false)))].join(' – ')}</div>
                  <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                    <button className="btn" onClick={hear}><Icon name="volume" size={16} /> Hear it</button>
                    <button
                      className="btn"
                      onClick={() => {
                        const s = buildChordDrill([name, name], 60, 'quarter', `Hold ${name}`, 2);
                        registerTempSong(s);
                        navigate(`/play/${encodeURIComponent(s.id)}?track=chords&speed=1&mode=wait`);
                      }}
                    >
                      <Icon name="play" size={16} /> Practise it
                    </button>
                  </div>
                </>
              ) : <p>No voicing available.</p>}
            </div>
            <div className="card">
              <div className="row between"><h3>Microphone check</h3><span className="pill good">{passed} clean</span></div>
              <MicGate>
                <p className="small">Fret the chord, strum once and let it ring. Each string lights up when it is heard.</p>
                <div className="row" style={{ justifyContent: 'space-around', marginTop: 16 }}>
                  {[0, 1, 2, 3, 4, 5].map((s) => {
                    const expected = info?.shape[s] ?? -1;
                    const v = states[s];
                    const ok = v >= 0.42;
                    return (
                      <div key={s} className="center" style={{ width: 54 }}>
                        <div className="tiny muted">{labels[s]}</div>
                        <div
                          style={{
                            width: 40, height: 40, borderRadius: '50%', margin: '6px auto', display: 'grid', placeItems: 'center', fontWeight: 800,
                            background: expected < 0 ? 'transparent' : ok ? STRING_COLORS[s] : 'var(--card3)', color: ok ? '#10121a' : 'var(--muted)',
                            border: expected < 0 ? '2px dashed var(--line2)' : '2px solid ' + STRING_COLORS[s],
                            boxShadow: ok ? `0 0 18px ${STRING_COLORS[s]}` : 'none', transition: 'all .12s',
                          }}
                        >
                          {expected < 0 ? '×' : ok ? '✓' : expected}
                        </div>
                        <div className="tiny faint">{expected < 0 ? 'mute' : noteName(STANDARD[s] + expected, false)}</div>
                      </div>
                    );
                  })}
                </div>
                <p className="tiny faint" style={{ marginTop: 14 }}>Dashed circles are strings that should stay silent.</p>
              </MicGate>
            </div>
          </div>
        </>
      )}
      {tab === 'trainer' && <Trainer />}
      {tab === 'changes' && <Changes />}
    </div>
  );
}

function Trainer() {
  const m = useMicState();
  const [set, setSet] = useState(TRAINER_SET.slice(0, 9));
  const [cur, setCur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [t0, setT0] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const ROUND = 8;
  const info = cur ? chordInfo(cur) : null;
  const ref = useRef(cur);
  ref.current = cur;

  const next = (prev?: string | null) => {
    let c = set[Math.floor(Math.random() * set.length)];
    let g = 0;
    while (c === prev && g++ < 20) c = set[Math.floor(Math.random() * set.length)];
    setCur(c);
    setT0(performance.now());
  };
  useEffect(() => {
    if (!cur || !info || m.state !== 'on') return;
    const l = new NoteListener({
      targets: shapeMidis(info.shape),
      need: Math.max(1, Math.ceil(shapeMidis(info.shape).length * 0.8)),
      onHit: () => {
        setTimes((t) => [...t, (performance.now() - t0) / 1000]);
        setN((x) => {
          const nn = x + 1;
          if (nn >= ROUND) setCur(null);
          else next(ref.current);
          return nn;
        });
      },
    });
    l.start();
    return () => l.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, m.state]);

  return (
    <div className="card center" style={{ padding: 30 }}>
      <MicGate>
        {cur && info ? (
          <>
            <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Chord {n + 1} of {ROUND}</div>
            <div style={{ fontSize: 80, fontWeight: 850, lineHeight: 1.1 }} id="trainer-chord">{cur}</div>
            <ChordDiagram shape={info.shape} size={140} />
            <p>Fret it and strum. The next chord appears as soon as it rings clean.</p>
            <button className="btn" onClick={() => { setN((x) => x + 1); next(cur); }}>Skip</button>
          </>
        ) : (
          <>
            {times.length > 0 && <><h2>Round finished!</h2><p>Average time per chord: <b>{(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)} s</b></p></>}
            <p>Chords in the pool:</p>
            <div className="row wrap" style={{ justifyContent: 'center', gap: 6, marginBottom: 14 }}>
              {TRAINER_SET.map((c) => (
                <button key={c} className={`btn sm ${set.includes(c) ? 'primary' : ''}`} onClick={() => setSet((s) => (s.includes(c) ? (s.length > 2 ? s.filter((x) => x !== c) : s) : [...s, c]))}>{c}</button>
              ))}
            </div>
            <button className="btn primary lg" onClick={() => { setN(0); setTimes([]); next(); }}>Start round</button>
          </>
        )}
      </MicGate>
    </div>
  );
}

function Changes() {
  const [a, setA] = useState('G');
  const [b, setB] = useState('C');
  const [bpm, setBpm] = useState(70);
  const all = TRAINER_SET.concat(['Bb', 'F#m', 'Gm', 'Cm', 'B7', 'Em7', 'Dm7', 'Cmaj7', 'Gmaj7', 'Dmaj7', 'Amaj7', 'Bm7']);
  return (
    <div className="card">
      <h3>Chord-change drill</h3>
      <p>Pick two chords and practise switching between them in time. Start slowly and speed up.</p>
      <div className="grid c3">
        <label className="field">From<select value={a} onChange={(e) => setA(e.target.value)}>{all.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field">To<select value={b} onChange={(e) => setB(e.target.value)}>{all.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field">Tempo: {bpm} BPM<Slider value={bpm} min={40} max={120} step={1} onChange={setBpm} /></label>
      </div>
      <div className="row" style={{ marginTop: 16, gap: 24 }}>
        {[a, b].map((c) => {
          const i = chordInfo(c);
          return i ? <ChordDiagram key={c} shape={i.shape} name={c} size={110} /> : null;
        })}
        <span className="grow" />
        <button
          className="btn primary lg"
          onClick={async () => {
            const s = buildChordDrill([a, a, b, b], bpm, 'quarter', `Changes: ${a} ⇄ ${b}`, 1);
            await saveUserSong(s);
            navigate(`/play/${encodeURIComponent(s.id)}?track=chords&speed=1&mode=realtime`);
          }}
        >
          <Icon name="play" size={18} /> Start drill
        </button>
      </div>
      <div className="tip small" style={{ marginTop: 16 }}>Tip: Keep common fingers planted when you can (e.g. G → Em), and move all fingers at once.</div>
    </div>
  );
}
