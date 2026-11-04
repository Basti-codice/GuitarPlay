import { useEffect, useRef, useState } from 'react';
import { PageHead, Seg, Setting, Slider, Toggle } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { Metronome } from '../audio/metronome';
import { getCtx } from '../audio/engine';

const NAMES: [number, string][] = [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [999, 'Prestissimo']];

export function MetronomePage() {
  const [bpm, setBpm] = useState(90);
  const [beats, setBeats] = useState(4);
  const [subdiv, setSubdiv] = useState(1);
  const [accent, setAccent] = useState(true);
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [trainer, setTrainer] = useState(false);
  const [target, setTarget] = useState(120);
  const [everyBars, setEveryBars] = useState(4);
  const [step, setStep] = useState(5);
  const met = useRef<Metronome | null>(null);
  const taps = useRef<number[]>([]);
  const barCount = useRef(0);

  useEffect(() => {
    if (!met.current) met.current = new Metronome({ bpm, beats, subdiv, accentFirst: accent });
    met.current.opts = { bpm, beats, subdiv, accentFirst: accent };
  }, [bpm, beats, subdiv, accent]);

  useEffect(() => {
    const m = met.current;
    if (!m) return;
    m.onTick = (b, sub, time) => {
      const delay = Math.max(0, (time - getCtx().currentTime) * 1000);
      if (sub === 0) window.setTimeout(() => setBeat(b), delay);
      if (b === 0 && sub === 0) {
        barCount.current++;
        if (trainer && barCount.current > 1 && (barCount.current - 1) % everyBars === 0) {
          setBpm((cur) => Math.min(target, cur + step));
        }
      }
    };
  });

  useEffect(() => () => met.current?.stop(), []);

  const toggle = () => {
    getCtx();
    if (on) {
      met.current?.stop();
      setOn(false);
      setBeat(-1);
    } else {
      barCount.current = 0;
      met.current?.start();
      setOn(true);
    }
  };
  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 2) {
      const d = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      setBpm(Math.max(30, Math.min(260, Math.round(60000 / (d.reduce((a, b) => a + b, 0) / d.length)))));
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const name = NAMES.find(([b]) => bpm < b)?.[1];

  return (
    <div className="page narrow">
      <PageHead title="Metronome" sub="Steady time is the foundation of everything. Press Space to start and stop." />
      <div className="card center" style={{ padding: 30 }}>
        <div className="row" style={{ justifyContent: 'center', gap: 22 }}>
          <button className="btn icon lg" onClick={() => setBpm((b) => Math.max(30, b - 1))} aria-label="Slower">−</button>
          <div>
            <div style={{ fontSize: 92, fontWeight: 850, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }} id="bpm">{bpm}</div>
            <div className="muted">BPM · {name}</div>
          </div>
          <button className="btn icon lg" onClick={() => setBpm((b) => Math.min(260, b + 1))} aria-label="Faster">+</button>
        </div>
        <div style={{ maxWidth: 520, margin: '16px auto' }}>
          <Slider value={bpm} min={30} max={260} step={1} onChange={setBpm} />
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 12, margin: '14px 0 24px' }}>
          {Array.from({ length: beats }).map((_, i) => (
            <div key={i} style={{ width: 26, height: 26, borderRadius: '50%', background: beat === i ? (i === 0 && accent ? 'var(--accent2)' : 'var(--accent)') : 'var(--card3)', boxShadow: beat === i ? '0 0 20px var(--accent)' : 'none', transition: 'all 0.06s' }} />
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className={`btn lg ${on ? '' : 'primary'}`} onClick={toggle} id="met-toggle" style={{ minWidth: 150 }}>
            <Icon name={on ? 'pause' : 'play'} size={18} /> {on ? 'Stop' : 'Start'}
          </button>
          <button className="btn lg" onClick={tap}>Tap tempo</button>
        </div>
      </div>
      <div className="card">
        <Setting label="Beats per bar"><Seg value={beats} onChange={setBeats} options={[2, 3, 4, 5, 6, 7, 9, 12].map((v) => ({ v, label: String(v) }))} /></Setting>
        <Setting label="Subdivision" desc="Quieter clicks between the beats.">
          <Seg value={subdiv} onChange={setSubdiv} options={[{ v: 1, label: '♩' }, { v: 2, label: '♪♪' }, { v: 3, label: 'Triplets' }, { v: 4, label: '16ths' }]} />
        </Setting>
        <Setting label="Accent the first beat"><Toggle on={accent} onChange={setAccent} label="Accent" /></Setting>
        <Setting label="Speed trainer" desc="Gradually raise the tempo while you play.">
          <Toggle on={trainer} onChange={setTrainer} label="Speed trainer" />
        </Setting>
        {trainer && (
          <div className="grid c3" style={{ paddingTop: 10 }}>
            <label className="field">Target BPM<input type="number" value={target} min={40} max={260} onChange={(e) => setTarget(parseInt(e.target.value) || 120)} /></label>
            <label className="field">Every N bars<input type="number" value={everyBars} min={1} max={32} onChange={(e) => setEveryBars(parseInt(e.target.value) || 4)} /></label>
            <label className="field">Increase by<input type="number" value={step} min={1} max={20} onChange={(e) => setStep(parseInt(e.target.value) || 5)} /></label>
          </div>
        )}
      </div>
    </div>
  );
}
