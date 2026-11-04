import { useEffect, useRef, useState } from 'react';
import { Meter, PageHead, Setting, Slider, useMicLevel, useMicState } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { mic } from '../audio/mic';
import { getSettings, updateSettings, useSettings } from '../core/settings';
import { getCtx, scheduleClick } from '../audio/engine';
import { navigate } from '../core/router';

const STEPS = ['Welcome', 'Microphone', 'Level', 'Noise', 'Timing', 'Done'];

export function Setup() {
  const [step, setStep] = useState(0);
  const m = useMicState();
  const s = useSettings();
  const lvl = useMicLevel(m.state === 'on');
  const [peak, setPeak] = useState(0);
  const [noiseMsg, setNoiseMsg] = useState('');
  const [latMsg, setLatMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const peakRef = useRef(0);

  useEffect(() => {
    if (step !== 2 || m.state !== 'on') return;
    peakRef.current = 0;
    const off = mic.onFrame((f) => {
      peakRef.current = Math.max(peakRef.current * 0.998, mic.analyzer?.peak ?? 0, f.rms * 2);
      setPeak(peakRef.current);
    });
    return () => off();
  }, [step, m.state]);

  const autoGain = () => {
    const pk = peakRef.current / (getSettings().inputGain || 1);
    if (pk > 0.0005) updateSettings({ inputGain: Math.max(0.5, Math.min(14, +(0.45 / pk).toFixed(1))) });
  };

  const measureNoise = async () => {
    setBusy(true);
    setNoiseMsg('Stay quiet for two seconds…');
    const vals: number[] = [];
    const off = mic.onFrame((f) => vals.push(f.rms));
    await new Promise((r) => setTimeout(r, 2200));
    off();
    if (!vals.length) {
      setNoiseMsg('No signal received – is the microphone enabled?');
    } else {
      const med = [...vals].sort((a, b) => a - b)[vals.length >> 1];
      const gate = Math.max(0.0015, Math.min(0.02, med * 2.5));
      updateSettings({ micGate: +gate.toFixed(4) });
      setNoiseMsg(`Room noise level ${(med * 1000).toFixed(1)} → gate set to ${(gate * 1000).toFixed(1)}`);
    }
    setBusy(false);
  };

  const measureLatency = async () => {
    setBusy(true);
    setLatMsg('Play any string on every click – 8 clicks…');
    const c = getCtx();
    const bpm = 72;
    const spb = 60 / bpm;
    const t0 = c.currentTime + 1.2;
    const clicks: number[] = [];
    for (let i = 0; i < 9; i++) {
      scheduleClick(t0 + i * spb, i % 4 === 0);
      clicks.push(t0 + i * spb);
    }
    const ons: number[] = [];
    const off = mic.onFrame((f) => f.onset && ons.push(f.onsetTime));
    await new Promise((r) => setTimeout(r, (1.2 + 9 * spb + 0.8) * 1000));
    off();
    const diffs: number[] = [];
    for (const o of ons) {
      let best = Infinity;
      for (const t of clicks.slice(2)) if (Math.abs(o - t) < Math.abs(best)) best = o - t;
      if (Math.abs(best) < 0.35) diffs.push(best);
    }
    if (diffs.length >= 3) {
      const med = [...diffs].sort((a, b) => a - b)[diffs.length >> 1];
      updateSettings({ latencyMs: Math.round(med * 1000) });
      setLatMsg(`Measured ${Math.round(med * 1000)} ms from ${diffs.length} notes. Applied.`);
    } else setLatMsg('Not enough notes detected – make sure the clicks are audible and play on each one.');
    setBusy(false);
  };

  return (
    <div className="page narrow">
      <PageHead title="Setup wizard" sub="Two minutes to get the best detection for your guitar and room." />
      <div className="row" style={{ gap: 6 }}>
        {STEPS.map((n, i) => (
          <div key={n} style={{ flex: 1 }}>
            <div className="bar"><i style={{ width: i <= step ? '100%' : '0%' }} /></div>
            <div className="tiny muted" style={{ marginTop: 4, color: i === step ? 'var(--text)' : undefined }}>{n}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 26 }}>
        {step === 0 && (
          <>
            <h2>Welcome to GuitarPlay</h2>
            <p>GuitarPlay listens to your acoustic guitar and tells you whether you played the right notes at the right time. For best results:</p>
            <ul className="prose" style={{ lineHeight: 1.9 }}>
              <li>Place the microphone about 20–40 cm from the soundhole.</li>
              <li>Use <b>headphones</b> if you want a backing band or click – the mic should only hear your guitar.</li>
              <li>Tune your guitar first (there is a tuner in the sidebar).</li>
              <li>Use Chrome on a quiet room; a USB microphone or audio interface is ideal but a laptop mic works.</li>
            </ul>
          </>
        )}
        {step === 1 && (
          <>
            <h2>Choose your microphone</h2>
            <p>Click enable and allow access when Chrome asks.</p>
            <div className="row wrap">
              <button className="btn primary" onClick={() => void mic.start()} disabled={m.state === 'starting'}><Icon name="mic" size={17} /> {m.state === 'on' ? 'Re-connect' : 'Enable microphone'}</button>
              {m.state === 'on' && <span className="pill good">Listening: {m.deviceLabel || 'microphone'}</span>}
            </div>
            {m.state === 'error' && <div className="tip">{m.error}</div>}
            {m.devices.length > 0 && (
              <Setting label="Input device">
                <select value={s.deviceId} onChange={async (e) => { updateSettings({ deviceId: e.target.value }); await mic.start(); }} style={{ width: '100%' }}>
                  <option value="">System default</option>
                  {m.devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
                </select>
              </Setting>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <h2>Check the level</h2>
            <p>Strum all open strings a few times at normal playing volume.</p>
            <div style={{ margin: '14px 0' }}><Meter value={Math.min(1, Math.sqrt(peak) * 1.5)} /></div>
            <div className="row between small muted"><span>Now: {Math.round(lvl * 100)}%</span><span>Peak: {Math.round(Math.sqrt(peak) * 150)}%</span></div>
            <Setting label={`Input gain ×${s.inputGain.toFixed(1)}`}>
              <Slider value={s.inputGain} min={0.5} max={14} step={0.1} onChange={(v) => updateSettings({ inputGain: v })} width={200} />
            </Setting>
            <button className="btn" onClick={autoGain}>Set gain automatically from my peak</button>
          </>
        )}
        {step === 3 && (
          <>
            <h2>Measure room noise</h2>
            <p>Keep the guitar quiet and stay silent for two seconds. The noise gate is set just above your room noise.</p>
            <button className="btn primary" onClick={() => void measureNoise()} disabled={busy || m.state !== 'on'}>Measure noise</button>
            {noiseMsg && <div className="tip">{noiseMsg}</div>}
          </>
        )}
        {step === 4 && (
          <>
            <h2>Measure timing offset (optional)</h2>
            <p>Computers add a little delay between your pick and the detected note. Play any string exactly on each click and GuitarPlay will compensate.</p>
            <button className="btn primary" onClick={() => void measureLatency()} disabled={busy || m.state !== 'on'}>Start click test</button>
            {latMsg && <div className="tip">{latMsg}</div>}
            <Setting label={`Current offset ${s.latencyMs} ms`}>
              <Slider value={s.latencyMs} min={-120} max={400} step={5} onChange={(v) => updateSettings({ latencyMs: v })} width={200} />
            </Setting>
          </>
        )}
        {step === 5 && (
          <>
            <h2>All set! 🎸</h2>
            <p>You can change everything later in Settings. Time to play something.</p>
            <div className="row wrap">
              <button className="btn primary lg" onClick={() => { updateSettings({ onboarded: true }); navigate('/library'); }}>Pick a song</button>
              <button className="btn lg" onClick={() => { updateSettings({ onboarded: true }); navigate('/tuner'); }}>Tune first</button>
            </div>
          </>
        )}
        <div className="row between" style={{ marginTop: 22 }}>
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < STEPS.length - 1 && <button className="btn primary" onClick={() => setStep(step + 1)} id="wiz-next">Next</button>}
        </div>
      </div>
    </div>
  );
}
