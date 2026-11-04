import { useEffect, useRef, useState } from 'react';
import { MicGate, PageHead, Setting, Slider, useMicState } from '../ui/kit';
import { TUNINGS, STRING_COLORS, midiToFreq, noteName, tuningLabels, freqToMidi } from '../core/music';
import { mic } from '../audio/mic';
import { getSettings, updateSettings, useSettings } from '../core/settings';
import { playPluck } from '../audio/synth';
import { getCtx } from '../audio/engine';
import { bump } from '../core/progress';
import { Icon } from '../ui/Icon';

export function Tuner() {
  const s = useSettings();
  const m = useMicState();
  const [tuningId, setTuningId] = useState('standard');
  const tuning = TUNINGS.find((t) => t.id === tuningId)!.notes;
  const labels = tuningLabels(tuning);
  const [reading, setReading] = useState<{ midi: number; cents: number; string: number; freq: number } | null>(null);
  const [tuned, setTuned] = useState<boolean[]>([false, false, false, false, false, false]);
  const hist = useRef<number[]>([]);
  const holdRef = useRef({ str: -1, since: 0 });
  const tunedRef = useRef(tuned);
  tunedRef.current = tuned;

  useEffect(() => {
    if (m.state !== 'on') return;
    const off = mic.onFrame((f) => {
      if (!f.pitch || !f.gate || f.pitch.clarity < 0.88) {
        if (hist.current.length) hist.current.shift();
        if (!hist.current.length) setReading(null);
        return;
      }
      const a4 = getSettings().a4;
      const midi = freqToMidi(f.pitch.freq, a4);
      hist.current.push(midi);
      if (hist.current.length > 7) hist.current.shift();
      const med = [...hist.current].sort((a, b) => a - b)[hist.current.length >> 1];
      // nearest string of the selected tuning
      let best = 0;
      for (let i = 1; i < 6; i++) if (Math.abs(tuning[i] - med) < Math.abs(tuning[best] - med)) best = i;
      const cents = (med - tuning[best]) * 100;
      if (Math.abs(cents) > 150) {
        setReading({ midi: med, cents: Math.max(-50, Math.min(50, cents)), string: -1, freq: f.pitch.freq });
        return;
      }
      setReading({ midi: med, cents, string: best, freq: f.pitch.freq });
      const h = holdRef.current;
      if (Math.abs(cents) < 5) {
        if (h.str !== best) holdRef.current = { str: best, since: performance.now() };
        else if (performance.now() - h.since > 900 && !tunedRef.current[best]) {
          setTuned((t) => t.map((v, i) => (i === best ? true : v)));
          bump('tuned');
        }
      } else holdRef.current = { str: -1, since: 0 };
    });
    return off;
  }, [m.state, tuning]);

  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const inTune = reading && reading.string >= 0 && Math.abs(reading.cents) < 5;
  const angle = (cents / 50) * 62;
  const col = !reading ? '#3a3f55' : inTune ? 'var(--good)' : Math.abs(cents) < 15 ? 'var(--warn)' : 'var(--bad)';

  return (
    <div className="page narrow">
      <PageHead title="Tuner" sub="Pluck one string at a time and let it ring. Tune until the needle sits in the middle." />
      <MicGate>
        <div className="card center" style={{ padding: 30 }}>
          <svg viewBox="-110 -20 220 120" width="100%" style={{ maxWidth: 480 }} role="img" aria-label="Tuner gauge">
            <path d="M -90 80 A 90 90 0 0 1 90 80" fill="none" stroke="#2a2e3f" strokeWidth="10" strokeLinecap="round" />
            <path d="M -9 -4 A 90 90 0 0 1 9 -4" fill="none" stroke="var(--good)" strokeWidth="10" strokeLinecap="round" transform="translate(0,2)" />
            {Array.from({ length: 11 }).map((_, i) => {
              const a = ((i - 5) / 5) * 62 * (Math.PI / 180);
              return <line key={i} x1={Math.sin(a) * 74} y1={80 - Math.cos(a) * 74} x2={Math.sin(a) * 84} y2={80 - Math.cos(a) * 84} stroke={i === 5 ? 'var(--good)' : '#5a607a'} strokeWidth={i === 5 ? 3 : 2} />;
            })}
            <g transform={`rotate(${angle} 0 80)`} style={{ transition: 'transform 0.12s' }}>
              <line x1="0" y1="80" x2="0" y2="2" stroke={col} strokeWidth="4" strokeLinecap="round" />
              <circle cx="0" cy="80" r="7" fill={col} />
            </g>
          </svg>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1, color: col, minHeight: 80 }} id="tuner-note">{reading ? noteName(reading.midi, false) : '–'}</div>
          <div className="muted" style={{ marginTop: 6, minHeight: 24 }}>
            {reading ? `${reading.cents > 0 ? '+' : ''}${reading.cents.toFixed(0)} cents · ${reading.freq.toFixed(1)} Hz` : 'Play a string…'}
          </div>
          <div style={{ minHeight: 28, fontWeight: 700, color: col }}>
            {reading && reading.string >= 0 ? (inTune ? 'In tune ✓' : reading.cents > 0 ? 'Too high – loosen the string' : 'Too low – tighten the string') : ''}
          </div>
        </div>
      </MicGate>
      <div className="card">
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <h3>Strings</h3>
          <select value={tuningId} onChange={(e) => { setTuningId(e.target.value); setTuned([false, false, false, false, false, false]); }} aria-label="Tuning">
            {TUNINGS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="row wrap" style={{ gap: 12, justifyContent: 'center' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              className="card hover"
              style={{ width: 94, textAlign: 'center', padding: 12, borderColor: reading?.string === i ? STRING_COLORS[i] : tuned[i] ? 'var(--good)' : undefined }}
              onClick={() => {
                getCtx();
                playPluck(tuning[i], getCtx().currentTime + 0.02, { gain: 0.7, hold: 2.5, reverb: 0.2 });
              }}
              title="Click to hear the reference tone"
            >
              <div className="tiny faint">String {6 - i}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: STRING_COLORS[i] }}>{labels[i]}</div>
              <div className="tiny muted">{midiToFreq(tuning[i], s.a4).toFixed(1)} Hz</div>
              <div style={{ height: 18, color: 'var(--good)' }}>{tuned[i] ? <Icon name="check" size={16} /> : <Icon name="volume" size={14} />}</div>
            </button>
          ))}
        </div>
        <Setting label={`Concert pitch A4 = ${s.a4} Hz`} desc="Leave at 440 Hz unless your band tunes differently.">
          <Slider value={s.a4} min={415} max={466} step={1} onChange={(v) => updateSettings({ a4: v })} width={200} />
        </Setting>
      </div>
    </div>
  );
}
