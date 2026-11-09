import { useEffect, useRef, useState } from 'react';
import { noteName } from '../core/music';
import { MicGate, Meter, PageHead, Seg, Setting, Slider, Toggle, useMicLevel, useMicState } from '../ui/kit';
import { DEFAULT_SETTINGS, updateSettings, useSettings } from '../core/settings';
import { mic } from '../audio/mic';
import { navigate } from '../core/router';
import { exportBackup, importBackup } from '../core/backup';
import { resetProgress } from '../core/progress';
import { toast } from '../ui/toast';
import { Icon } from '../ui/Icon';

export function SettingsPage() {
  const s = useSettings();
  const m = useMicState();
  const lvl = useMicLevel(m.state === 'on');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    const blob = await exportBackup();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `guitarplay-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setBusy(false);
  };

  return (
    <div className="page narrow">
      <PageHead title="Settings" sub="Everything is stored locally in your browser – nothing leaves your computer." />

      <div className="card">
        <h2>Microphone</h2>
        <Setting label="Input device" desc="Pick your audio interface or microphone. The browser may ask for permission first.">
          <select
            value={s.deviceId}
            onChange={async (e) => {
              updateSettings({ deviceId: e.target.value });
              if (m.state === 'on') await mic.start();
            }}
            style={{ width: '100%' }}
            aria-label="Input device"
          >
            <option value="">System default</option>
            {mic.devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Input ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </Setting>
        <Setting label="Status" desc={m.state === 'error' ? m.error : m.deviceLabel || 'Not listening'}>
          <div style={{ width: 120 }}>
            <Meter value={lvl} />
          </div>
          <button className="btn sm" onClick={() => (m.state === 'on' ? m.stop() : void m.start())}>
            {m.state === 'on' ? 'Stop' : 'Enable'}
          </button>
        </Setting>
        <Setting label={`Input gain ×${s.inputGain.toFixed(1)}`} desc="Raise this if the meter barely moves when you strum. Aim for the meter reaching about two thirds.">
          <Slider value={s.inputGain} min={0.5} max={14} step={0.1} onChange={(v) => updateSettings({ inputGain: v })} width={200} />
        </Setting>
        <Setting label="Noise gate" desc="Sounds quieter than this are ignored. Increase it if room noise triggers notes.">
          <Slider value={s.micGate} min={0.0008} max={0.02} step={0.0002} onChange={(v) => updateSettings({ micGate: v })} width={200} />
        </Setting>
        <Setting label="Echo cancellation" desc="Only turn on when you play through speakers with backing audio. It can muffle the guitar slightly.">
          <Toggle on={s.echoCancel} onChange={(v) => { updateSettings({ echoCancel: v }); if (m.state === 'on') void mic.start(); }} label="Echo cancellation" />
        </Setting>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => navigate('/setup')}><Icon name="sparkles" size={16} /> Run setup & calibration wizard</button>
        </div>
      </div>

      <Diagnostics />

      <div className="card">
        <h2>Judging</h2>
        <Setting label="Strictness" desc="Timing window and how complete a chord has to be.">
          <Seg value={s.strictness} onChange={(v) => updateSettings({ strictness: v })} options={[{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'strict', label: 'Strict' }]} />
        </Setting>
        <Setting label="Default play mode" desc="Real-time keeps the beat; Wait-for-me stops until you hit the note.">
          <Seg value={s.playMode} onChange={(v) => updateSettings({ playMode: v })} options={[{ v: 'realtime', label: 'Real-time' }, { v: 'wait', label: 'Wait for me' }]} />
        </Setting>
        <Setting label={`Attack sensitivity ×${s.sensitivity.toFixed(1)}`} desc="Higher catches soft notes, lower ignores finger noise and room sounds.">
          <Slider value={s.sensitivity} min={0.7} max={2.2} step={0.1} onChange={(v) => updateSettings({ sensitivity: v })} width={200} />
        </Setting>
        <Setting label={`Latency compensation ${s.latencyMs} ms`} desc="If notes are judged consistently early or late, adjust this – or measure it in the wizard.">
          <Slider value={s.latencyMs} min={-120} max={400} step={5} onChange={(v) => updateSettings({ latencyMs: v })} width={200} />
        </Setting>
        <Setting label={`Pitch tolerance ±${s.pitchTolerance} cents`} desc="How far out of tune a string may be and still count. Lower = stricter, but needs a well-tuned guitar.">
          <Slider value={s.pitchTolerance} min={25} max={48} step={1} onChange={(v) => updateSettings({ pitchTolerance: v })} width={200} />
        </Setting>
        <Setting label={s.presenceOverride ? `Note threshold ${s.presenceOverride.toFixed(2)}` : 'Note threshold: automatic'} desc="How clearly a note must be heard. Raise if wrong notes are accepted; lower if correct notes are missed. 0 = follow the strictness setting.">
          <Slider value={s.presenceOverride} min={0} max={0.7} step={0.02} onChange={(v) => updateSettings({ presenceOverride: v < 0.2 ? 0 : v })} width={200} />
        </Setting>
        <Setting label="Count-in" desc="One bar of clicks before the song starts.">
          <Toggle on={s.countIn} onChange={(v) => updateSettings({ countIn: v })} label="Count-in" />
        </Setting>
      </div>

      <div className="card">
        <h2>Display</h2>
        <Setting label="Waterfall speed" desc="How many seconds of music are visible above the hit line.">
          <Slider value={6 - s.lookahead} min={1.4} max={4.5} step={0.1} onChange={(v) => updateSettings({ lookahead: 6 - v })} width={200} />
        </Setting>
        <Setting label="View" desc="Falling: notes drop towards the line. Side-scroll: notes travel from right to left along the six strings, like reading a tab.">
          <Seg value={s.waterfallMode} onChange={(v) => updateSettings({ waterfallMode: v })} options={[{ v: 'fall', label: 'Falling' }, { v: 'side', label: 'Side-scroll' }]} />
        </Setting>
        <Setting label="Large notes" desc="Bigger fret numbers that grow as they approach, and a white outline on the next note.">
          <Toggle on={s.bigNumbers} onChange={(v) => updateSettings({ bigNumbers: v })} label="Large notes" />
        </Setting>
        <Setting label="Fingering hint" desc="A small diagram shows where to put your fingers for the next two notes.">
          <Toggle on={s.fretHint} onChange={(v) => updateSettings({ fretHint: v })} label="Fingering hint" />
        </Setting>
        <Setting label="Left-handed layout" desc="Mirrors the six lanes (falling view).">
          <Toggle on={s.leftHanded} onChange={(v) => updateSettings({ leftHanded: v })} label="Left-handed" />
        </Setting>
        <Setting label="Chord diagrams while playing">
          <Toggle on={s.showChordBox} onChange={(v) => updateSettings({ showChordBox: v })} label="Chord boxes" />
        </Setting>
        <Setting label="Daily goal" desc={`${s.dailyGoalMin} minutes per day`}>
          <Slider value={s.dailyGoalMin} min={5} max={90} step={5} onChange={(v) => updateSettings({ dailyGoalMin: v })} width={200} />
        </Setting>
      </div>

      <div className="card">
        <h2>Sound</h2>
        <Setting label="Menu music" desc="Calm generative background music in the menus. It pauses automatically wherever the microphone is in use.">
          <Toggle on={s.ambientOn} onChange={(v) => updateSettings({ ambientOn: v })} label="Menu music" />
        </Setting>
        {(
          [
            ['volMaster', 'Master volume'],
            ['volMusic', 'Menu music volume'],
            ['volBacking', 'Backing band volume'],
            ['volRef', 'Reference guitar volume'],
            ['volClick', 'Click volume'],
          ] as const
        ).map(([k, label]) => (
          <Setting key={k} label={label}>
            <Slider value={s[k]} min={0} max={1} step={0.01} onChange={(v) => updateSettings({ [k]: v })} width={200} />
          </Setting>
        ))}
        <div className="tip small"><Icon name="headphones" size={14} /> Use headphones whenever the backing band, reference guitar or click is on – otherwise the microphone hears the speakers.</div>
      </div>

      <div className="card">
        <h2>Photo transcription (optional)</h2>
        <p>
          Scanned sheet music can be sent to Claude to be turned into editable notation. This needs your own Anthropic API key, which stays in this browser and is sent only to api.anthropic.com when you press the button.
        </p>
        <input type="password" placeholder="sk-ant-…" value={s.apiKey} onChange={(e) => updateSettings({ apiKey: e.target.value })} style={{ width: '100%' }} autoComplete="off" aria-label="Anthropic API key" />
      </div>

      <div className="card">
        <h2>Your data</h2>
        <div className="row wrap">
          <button className="btn" onClick={() => void doExport()} disabled={busy}><Icon name="download" size={16} /> Export backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="import" size={16} /> Restore backup</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await importBackup(f);
                toast('Backup restored');
              } catch (err) {
                toast(`Import failed: ${(err as Error).message}`);
              }
              e.target.value = '';
            }}
          />
          <span className="grow" />
          <button className="btn danger" onClick={() => confirm('Reset all progress, stats and achievements?') && resetProgress()}>Reset progress</button>
          <button className="btn danger" onClick={() => confirm('Reset all settings to defaults?') && updateSettings({ ...DEFAULT_SETTINGS })}>Reset settings</button>
        </div>
      </div>
      <div className="small faint center">GuitarPlay 1.0 · Audio is analysed locally and never uploaded.</div>
      <MicGateHidden />
    </div>
  );
}

function Diagnostics() {
  const m = useMicState();
  const [d, setD] = useState({ rms: 0, noise: 0, gate: 0, pitch: '', clarity: 0, onsetAt: 0 });
  useEffect(() => {
    if (m.state !== 'on') return;
    let last = 0;
    const off = mic.onFrame((f, an) => {
      const now = performance.now();
      if (f.onset) setD((x) => ({ ...x, onsetAt: now }));
      if (now - last < 60) return;
      last = now;
      setD((x) => ({ ...x, rms: f.rms, noise: an.noise, gate: an.gateLevel, pitch: f.pitch ? noteName(f.pitch.midi) : '', clarity: f.pitch?.clarity ?? 0 }));
    });
    return () => off();
  }, [m.state]);
  const flash = performance.now() - d.onsetAt < 180;
  const scale = (v: number) => Math.min(1, Math.sqrt(v) * 2.2);
  return (
    <div className="card">
      <h2>Live detection monitor</h2>
      <p>Play a few notes: the level should clearly rise above the gate marker, the attack light should flash once per note and the pitch should match what you play.</p>
      {m.state !== 'on' ? <p className="muted">Enable the microphone to see live values.</p> : (
        <div className="grid c2" style={{ marginTop: 8 }}>
          <div>
            <div className="small muted">Level (white line = noise gate)</div>
            <div style={{ position: 'relative', marginTop: 6 }}>
              <Meter value={scale(d.rms)} />
              <div style={{ position: 'absolute', left: `${scale(d.gate) * 100}%`, top: -3, bottom: -3, width: 2, background: '#fff' }} />
            </div>
            <div className="tiny faint" style={{ marginTop: 6 }}>room noise ≈ {(d.noise * 1000).toFixed(1)}</div>
          </div>
          <div className="row" style={{ gap: 18 }}>
            <div className="center" style={{ width: 72 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', margin: '0 auto', background: flash ? 'var(--accent)' : 'var(--card3)', boxShadow: flash ? '0 0 18px var(--accent)' : 'none' }} />
              <div className="tiny faint" style={{ marginTop: 4 }}>attack</div>
            </div>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, minHeight: 36 }}>{d.pitch || '–'}</div>
              <div className="tiny faint">pitch · confidence {Math.round(d.clarity * 100)}%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// keeps the import used (MicGate is exported for other pages)
const MicGateHidden = () => null;
void MicGate;
