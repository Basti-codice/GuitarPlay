import { useEffect, useRef, useState } from 'react';
import { MicGate, PageHead, Seg, useMicState } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { INTERVAL_NAMES, NOTE_NAMES, noteName } from '../core/music';
import { getCtx } from '../audio/engine';
import { playPluck } from '../audio/synth';
import { NoteListener } from '../game/listener';
import { bump } from '../core/progress';

type Mode = 'interval' | 'note' | 'echo';

export function Ear() {
  const [mode, setMode] = useState<Mode>('interval');
  return (
    <div className="page narrow">
      <PageHead title="Ear training" sub="Train your ear to recognise intervals and notes – and play melodies back by ear." />
      <div className="tabs">
        <button className={mode === 'interval' ? 'on' : ''} onClick={() => setMode('interval')}>Intervals</button>
        <button className={mode === 'note' ? 'on' : ''} onClick={() => setMode('note')}>Note names</button>
        <button className={mode === 'echo' ? 'on' : ''} onClick={() => setMode('echo')}>Play it back</button>
      </div>
      {mode === 'interval' && <Intervals />}
      {mode === 'note' && <Notes />}
      {mode === 'echo' && <Echo />}
    </div>
  );
}

function Score({ ok, n }: { ok: number; n: number }) {
  return <span className="pill good">{ok} / {n} correct</span>;
}

function Intervals() {
  const [dir, setDir] = useState<'up' | 'down' | 'both'>('up');
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const sets = { 1: [3, 4, 5, 7, 12], 2: [2, 3, 4, 5, 7, 9, 12], 3: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
  const [q, setQ] = useState<{ a: number; b: number; i: number } | null>(null);
  const [res, setRes] = useState<{ ok: boolean; picked: number } | null>(null);
  const [sc, setSc] = useState({ ok: 0, n: 0 });

  const play = (a: number, b: number) => {
    const c = getCtx();
    playPluck(a, c.currentTime + 0.05, { gain: 0.6, hold: 1.2, reverb: 0.2 });
    playPluck(b, c.currentTime + 0.9, { gain: 0.6, hold: 1.5, reverb: 0.2 });
  };
  const next = () => {
    const opts = sets[level];
    const i = opts[Math.floor(Math.random() * opts.length)];
    const a = 52 + Math.floor(Math.random() * 14);
    const d = dir === 'up' ? 1 : dir === 'down' ? -1 : Math.random() < 0.5 ? 1 : -1;
    const qq = { a, b: a + d * i, i };
    setQ(qq);
    setRes(null);
    play(qq.a, qq.b);
  };
  const answer = (i: number) => {
    if (!q || res) return;
    const ok = i === q.i;
    setRes({ ok, picked: i });
    setSc((s) => ({ ok: s.ok + (ok ? 1 : 0), n: s.n + 1 }));
    if (ok) bump('earCorrect');
  };
  return (
    <div className="card center" style={{ padding: 28 }}>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <Seg value={dir} onChange={setDir} options={[{ v: 'up', label: 'Ascending' }, { v: 'down', label: 'Descending' }, { v: 'both', label: 'Both' }]} />
        <Seg value={level} onChange={setLevel} options={[{ v: 1, label: 'Easy' }, { v: 2, label: 'Medium' }, { v: 3, label: 'All' }]} />
        <Score {...sc} />
      </div>
      <div style={{ margin: '22px 0' }}>
        {!q ? <button className="btn primary lg" onClick={next} id="ear-start"><Icon name="play" size={18} /> Start</button> : (
          <button className="btn lg" onClick={() => play(q.a, q.b)}><Icon name="volume" size={18} /> Play again</button>
        )}
      </div>
      {q && (
        <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
          {sets[level].map((i) => (
            <button key={i} className="btn" onClick={() => answer(i)} style={{ borderColor: res && i === q.i ? 'var(--good)' : res && i === res.picked ? 'var(--bad)' : undefined }}>{INTERVAL_NAMES[i]}</button>
          ))}
        </div>
      )}
      {res && (
        <div style={{ marginTop: 18 }}>
          <p style={{ color: res.ok ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>{res.ok ? 'Correct!' : `It was a ${INTERVAL_NAMES[q!.i]}`}</p>
          <button className="btn primary" onClick={next}>Next</button>
        </div>
      )}
      <p className="tiny faint" style={{ marginTop: 16 }}>Tip: link each interval to a song you know – a perfect 5th is the start of “Twinkle, Twinkle”.</p>
    </div>
  );
}

function Notes() {
  const [q, setQ] = useState<{ ref: number; n: number } | null>(null);
  const [res, setRes] = useState<{ ok: boolean; picked: number } | null>(null);
  const [sc, setSc] = useState({ ok: 0, n: 0 });
  const play = (ref: number, n: number) => {
    const c = getCtx();
    playPluck(ref, c.currentTime + 0.05, { gain: 0.55, hold: 1.2, reverb: 0.2 });
    playPluck(n, c.currentTime + 1.3, { gain: 0.6, hold: 1.5, reverb: 0.2 });
  };
  const next = () => {
    const n = 52 + Math.floor(Math.random() * 24);
    const qq = { ref: 57, n };
    setQ(qq);
    setRes(null);
    play(qq.ref, qq.n);
  };
  return (
    <div className="card center" style={{ padding: 28 }}>
      <Score {...sc} />
      <p style={{ marginTop: 10 }}>You first hear a reference <b>A</b>, then a mystery note. Which one is it?</p>
      <div style={{ margin: '14px 0' }}>
        {!q ? <button className="btn primary lg" onClick={next}><Icon name="play" size={18} /> Start</button> : <button className="btn lg" onClick={() => play(q.ref, q.n)}><Icon name="volume" size={18} /> Play again</button>}
      </div>
      {q && (
        <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
          {NOTE_NAMES.map((n, i) => (
            <button key={n} className="btn" style={{ minWidth: 56, borderColor: res && i === q.n % 12 ? 'var(--good)' : res && i === res.picked ? 'var(--bad)' : undefined }} onClick={() => {
              if (res) return;
              const ok = i === q.n % 12;
              setRes({ ok, picked: i });
              setSc((s) => ({ ok: s.ok + (ok ? 1 : 0), n: s.n + 1 }));
              if (ok) bump('earCorrect');
            }}>{n}</button>
          ))}
        </div>
      )}
      {res && (
        <div style={{ marginTop: 18 }}>
          <p style={{ color: res.ok ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>{res.ok ? 'Correct!' : `It was ${noteName(q!.n)}`}</p>
          <button className="btn primary" onClick={next}>Next</button>
        </div>
      )}
    </div>
  );
}

const PENT = [52, 55, 57, 59, 62, 64, 67, 69, 71, 74, 76];

function Echo() {
  const m = useMicState();
  const [len, setLen] = useState(3);
  const [phrase, setPhrase] = useState<number[]>([]);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(0);
  const [msg, setMsg] = useState('');
  const idxRef = useRef(0);
  idxRef.current = idx;

  const newPhrase = (n = len) => {
    const p: number[] = [];
    let cur = PENT[Math.floor(Math.random() * PENT.length)];
    for (let i = 0; i < n; i++) {
      p.push(cur);
      const k = PENT.indexOf(cur) + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
      cur = PENT[Math.max(0, Math.min(PENT.length - 1, k))];
    }
    setPhrase(p);
    setIdx(0);
    setMsg('');
    play(p);
  };
  const play = (p: number[]) => {
    const c = getCtx();
    p.forEach((n, i) => playPluck(n, c.currentTime + 0.05 + i * 0.7, { gain: 0.6, hold: 1.2, reverb: 0.2 }));
  };
  useEffect(() => {
    if (!phrase.length || idx >= phrase.length || m.state !== 'on') return;
    const l = new NoteListener({
      targets: [phrase[idx]],
      onHit: () => {
        const next = idxRef.current + 1;
        if (next >= phrase.length) {
          setIdx(next);
          setDone((d) => d + 1);
          bump('earCorrect', 2);
          setMsg('Perfect! Press next for a longer phrase.');
          setLen((x) => Math.min(6, x + 1));
        } else setIdx(next);
      },
    });
    // give the speakers a moment to finish playing the phrase before listening
    const to = setTimeout(() => l.start(), phrase.length * 700 + 300);
    return () => {
      clearTimeout(to);
      l.stop();
    };
  }, [phrase, idx, m.state]);

  return (
    <div className="card center" style={{ padding: 28 }}>
      <MicGate>
        <p>Listen to the short phrase, then play it back on your guitar (any string – only the pitches count). Use headphones.</p>
        <div className="row" style={{ justifyContent: 'center', margin: '14px 0' }}>
          {!phrase.length ? <button className="btn primary lg" onClick={() => newPhrase()}><Icon name="play" size={18} /> Start</button> : (
            <>
              <button className="btn" onClick={() => play(phrase)}><Icon name="volume" size={16} /> Hear again</button>
              <button className="btn" onClick={() => newPhrase(len)}>{idx >= phrase.length ? 'Next phrase' : 'New phrase'}</button>
            </>
          )}
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          {phrase.map((n, i) => (
            <div key={i} style={{ width: 54, height: 54, borderRadius: 14, display: 'grid', placeItems: 'center', fontWeight: 800, background: i < idx ? 'var(--good)' : i === idx ? 'var(--card3)' : 'var(--card2)', color: i < idx ? '#10121a' : 'var(--muted)', border: i === idx ? '2px solid var(--accent)' : '1px solid var(--line)' }}>
              {i < idx ? noteName(n, false) : '?'}
            </div>
          ))}
        </div>
        <p style={{ marginTop: 12, color: 'var(--good)' }}>{msg}</p>
        <span className="pill">Phrases completed: {done}</span>
      </MicGate>
    </div>
  );
}
