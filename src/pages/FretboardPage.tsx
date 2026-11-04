import { useEffect, useMemo, useRef, useState } from 'react';
import { Fretboard, MicGate, PageHead, Seg, Setting, Slider, useMicState, type FretMark } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { NOTE_NAMES, SCALES, STANDARD, STRING_LABELS, noteName, pc } from '../core/music';
import { getCtx } from '../audio/engine';
import { playPluck } from '../audio/synth';
import { buildScaleSong, scaleMidis } from '../songs/generators';
import { registerTempSong } from '../songs/../core/songs-store';
import { navigate } from '../core/router';
import { NoteListener } from '../game/listener';
import { bump } from '../core/progress';

export function FretboardPage() {
  const [tab, setTab] = useState<'scales' | 'finder'>('scales');
  return (
    <div className="page">
      <PageHead title="Fretboard" sub="Learn where every note lives – explore scales, then drill note names on the neck." />
      <div className="tabs">
        <button className={tab === 'scales' ? 'on' : ''} onClick={() => setTab('scales')}>Scales & notes</button>
        <button className={tab === 'finder' ? 'on' : ''} onClick={() => setTab('finder')}>Note finder game</button>
      </div>
      {tab === 'scales' ? <Scales /> : <Finder />}
    </div>
  );
}

function Scales() {
  const [root, setRoot] = useState(9);
  const [scale, setScale] = useState<string>('minpent');
  const [labels, setLabels] = useState<'name' | 'degree' | 'none'>('name');
  const [pos, setPos] = useState(5);
  const [pattern, setPattern] = useState<'updown' | 'up' | 'thirds' | 'sequence4'>('updown');
  const [bpm, setBpm] = useState(80);
  const steps = SCALES[scale as keyof typeof SCALES].steps;

  const marks = useMemo(() => {
    const m = new Map<string, FretMark>();
    for (let s = 0; s < 6; s++)
      for (let f = 0; f <= 15; f++) {
        const p = pc(STANDARD[s] + f);
        const idx = steps.indexOf(((p - root) % 12 + 12) % 12);
        if (idx < 0) continue;
        const inPos = f === 0 ? pos <= 1 : f >= pos && f <= pos + 4;
        m.set(`${s}:${f}`, { root: idx === 0, label: labels === 'name' ? NOTE_NAMES[p] : labels === 'degree' ? String(idx + 1) : undefined, dim: !inPos });
      }
    return m;
  }, [root, steps, labels, pos]);

  const hear = () => {
    const c = getCtx();
    const notes = scaleMidis(root, scale as keyof typeof SCALES, 52 + ((root - 52 + 1200) % 12), 52 + ((root - 52 + 1200) % 12) + 12);
    [...notes, ...notes.slice(0, -1).reverse()].forEach((n, i) => playPluck(n, c.currentTime + 0.05 + i * 0.28, { gain: 0.55, hold: 1, reverb: 0.15 }));
  };

  return (
    <>
      <div className="card">
        <div className="grid c3">
          <label className="field">Root<select value={root} onChange={(e) => setRoot(+e.target.value)}>{NOTE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}</select></label>
          <label className="field">Scale / mode<select value={scale} onChange={(e) => setScale(e.target.value)}>{Object.entries(SCALES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></label>
          <label className="field">Labels<Seg value={labels} onChange={setLabels} options={[{ v: 'name', label: 'Notes' }, { v: 'degree', label: 'Degrees' }, { v: 'none', label: 'Dots' }]} /></label>
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <Fretboard marks={marks} frets={15} width={1000} />
        <p className="tiny faint" style={{ marginTop: 8 }}>Bright dots show the practice position (fret {pos}–{pos + 4}); red = root note.</p>
      </div>
      <div className="card">
        <h3>Practise this scale with the microphone</h3>
        <Setting label={`Position: fret ${pos}`} desc="Lowest fret of a four-fret box.">
          <Slider value={pos} min={0} max={12} step={1} onChange={setPos} width={200} />
        </Setting>
        <Setting label="Pattern">
          <Seg value={pattern} onChange={setPattern} options={[{ v: 'updown', label: 'Up & down' }, { v: 'up', label: 'Ascending' }, { v: 'thirds', label: 'Thirds' }, { v: 'sequence4', label: '1-2-3-4' }]} />
        </Setting>
        <Setting label={`Tempo ${bpm} BPM`}><Slider value={bpm} min={40} max={160} step={1} onChange={setBpm} width={200} /></Setting>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={hear}><Icon name="volume" size={16} /> Hear scale</button>
          <button
            className="btn primary"
            onClick={() => {
              const song = buildScaleSong({ root, scale: scale as keyof typeof SCALES, position: pos, bpm, pattern });
              registerTempSong(song);
              navigate(`/play/${encodeURIComponent(song.id)}?track=main&speed=1&mode=realtime`);
            }}
          >
            <Icon name="play" size={16} /> Play in waterfall
          </button>
        </div>
      </div>
    </>
  );
}

function Finder() {
  const m = useMicState();
  const [strings, setStrings] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [target, setTarget] = useState<{ s: number; p: number; fret: number } | null>(null);
  const [score, setScore] = useState({ ok: 0, tries: 0, streak: 0, best: 0 });
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const [useMic, setUseMic] = useState(true);
  const t0 = useRef(performance.now());
  const [avg, setAvg] = useState(0);
  const tgt = useRef(target);
  tgt.current = target;

  const pick = () => {
    const s = strings[Math.floor(Math.random() * strings.length)];
    const p = Math.floor(Math.random() * 12);
    const fret = (p - STANDARD[s] % 12 + 120) % 12;
    setTarget({ s, p, fret });
    t0.current = performance.now();
  };
  useEffect(() => {
    pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const correct = () => {
    const dt = (performance.now() - t0.current) / 1000;
    setAvg((a) => (a === 0 ? dt : a * 0.7 + dt * 0.3));
    setScore((x) => ({ ok: x.ok + 1, tries: x.tries + 1, streak: x.streak + 1, best: Math.max(x.best, x.streak + 1) }));
    bump('fretCorrect');
    setFlash('ok');
    setTimeout(() => setFlash(null), 350);
    pick();
  };
  const wrong = () => {
    setScore((x) => ({ ...x, tries: x.tries + 1, streak: 0 }));
    setFlash('bad');
    setTimeout(() => setFlash(null), 350);
  };

  useEffect(() => {
    if (!target || !useMic || m.state !== 'on') return;
    const midi = STANDARD[target.s] + target.fret;
    const l = new NoteListener({ targets: [midi], onHit: correct });
    l.start();
    return () => l.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, useMic, m.state]);

  const marks = useMemo(() => {
    const mm = new Map<string, FretMark>();
    if (flash === 'ok' && target) mm.set(`${target.s}:${target.fret}`, { color: '#4be08c', label: '✓' });
    return mm;
  }, [flash, target]);

  return (
    <>
      <div className="card center" style={{ padding: 28, borderColor: flash === 'ok' ? 'var(--good)' : flash === 'bad' ? 'var(--bad)' : undefined }}>
        <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Find this note</div>
        <div style={{ fontSize: 72, fontWeight: 850, lineHeight: 1.1 }} id="finder-note">{target ? NOTE_NAMES[target.p] : '–'}</div>
        <div className="muted">on the <b>{target ? STRING_LABELS[target.s] : ''}</b> string (string {target ? 6 - target.s : ''})</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 22 }}>
          <span className="pill good">✓ {score.ok}</span>
          <span className="pill accent">Streak {score.streak}</span>
          <span className="pill">Best {score.best}</span>
          <span className="pill info">{avg ? `${avg.toFixed(1)} s avg` : '–'}</span>
        </div>
        <p className="small" style={{ marginTop: 12 }}>
          {useMic ? 'Play it on your guitar – or click the fret on the neck below.' : 'Click the fret on the neck.'}
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn sm" onClick={pick}>Skip</button>
          <Seg value={useMic ? 'mic' : 'click'} onChange={(v) => setUseMic(v === 'mic')} options={[{ v: 'mic', label: 'Use microphone' }, { v: 'click', label: 'Click only' }]} />
        </div>
      </div>
      {useMic && <MicGate>{null}</MicGate>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <Fretboard
          marks={marks}
          frets={12}
          width={920}
          onClick={(s, f) => {
            if (!target) return;
            if (s === target.s && (f === target.fret || (target.fret === 0 && f === 12))) correct();
            else wrong();
          }}
        />
        <div className="row wrap" style={{ marginTop: 10 }}>
          <span className="small muted">Strings in the game:</span>
          {STRING_LABELS.map((l, i) => (
            <button key={i} className={`btn sm ${strings.includes(i) ? 'primary' : ''}`} onClick={() => setStrings((s) => (s.includes(i) ? (s.length > 1 ? s.filter((x) => x !== i) : s) : [...s, i]))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="tiny faint">Notes: {noteName(STANDARD[0])} … {noteName(STANDARD[5] + 12)}</p>
    </>
  );
}
