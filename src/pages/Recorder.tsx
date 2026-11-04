import { useEffect, useRef, useState } from 'react';
import { MicGate, PageHead, fmtTime, useMicState } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { Recorder as Rec, saveRecording, type RecordingItem } from '../audio/recorder';
import { idbAll, idbDelete, idbPut } from '../core/storage';
import { getCtx } from '../audio/engine';
import { toast } from '../ui/toast';

function Wave({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const buf = await getCtx().decodeAudioData(await blob.arrayBuffer());
        if (dead || !ref.current) return;
        const c = ref.current;
        const g = c.getContext('2d')!;
        const w = c.width,
          h = c.height;
        const d = buf.getChannelData(0);
        const step = Math.floor(d.length / w) || 1;
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#ffb347';
        for (let x = 0; x < w; x++) {
          let mx = 0;
          for (let i = 0; i < step; i += 8) mx = Math.max(mx, Math.abs(d[x * step + i] || 0));
          const bh = Math.max(1, Math.min(1, mx * 1.6) * h);
          g.fillRect(x, (h - bh) / 2, 1, bh);
        }
      } catch {
        /* undecodable */
      }
    })();
    return () => {
      dead = true;
    };
  }, [blob]);
  return <canvas ref={ref} width={420} height={44} style={{ width: '100%', height: 44, borderRadius: 8, background: 'var(--bg2)' }} />;
}

export function Recorder() {
  const m = useMicState();
  const [items, setItems] = useState<RecordingItem[]>([]);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const rec = useRef<Rec | null>(null);
  const t0 = useRef(0);

  const load = () => idbAll<RecordingItem>('recordings').then((r) => setItems(r.sort((a, b) => b.ts - a.ts)));
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSecs((performance.now() - t0.current) / 1000), 200);
    return () => clearInterval(id);
  }, [recording]);

  const toggle = async () => {
    if (!recording) {
      try {
        rec.current = new Rec();
        await rec.current.start();
        t0.current = performance.now();
        setSecs(0);
        setRecording(true);
      } catch (e) {
        toast((e as Error).message);
      }
    } else {
      const blob = await rec.current!.stop();
      setRecording(false);
      if (blob && blob.size) {
        await saveRecording(blob, `Take ${new Date().toLocaleString()}`, undefined, rec.current!.duration);
        toast('Recording saved');
        void load();
      }
    }
  };

  return (
    <div className="page narrow">
      <PageHead title="Recorder" sub="Record yourself and listen back – the best way to hear what really needs work. Recordings stay on this computer." />
      <MicGate>
        <div className="card center" style={{ padding: 28 }}>
          <button className={`btn lg ${recording ? '' : 'primary'}`} onClick={() => void toggle()} id="rec-toggle" style={{ minWidth: 200 }}>
            <Icon name={recording ? 'pause' : 'record'} size={18} /> {recording ? `Stop · ${fmtTime(secs)}` : 'Start recording'}
          </button>
          {recording && <p style={{ marginTop: 10 }}><span style={{ color: 'var(--bad)' }}>●</span> Recording…</p>}
        </div>
      </MicGate>
      <div className="col">
        {items.length === 0 && m.state !== 'on' ? null : items.length === 0 ? <p className="center muted">No recordings yet.</p> : null}
        {items.map((it) => (
          <RecordingRow key={it.id} item={it} onChange={load} />
        ))}
      </div>
    </div>
  );
}

function RecordingRow({ item, onChange }: { item: RecordingItem; onChange: () => void }) {
  const url = useRef<string>('');
  if (!url.current) url.current = URL.createObjectURL(item.blob);
  useEffect(() => () => URL.revokeObjectURL(url.current), []);
  return (
    <div className="card">
      <div className="row between wrap">
        <div>
          <b>{item.name}</b>
          <div className="tiny muted">{new Date(item.ts).toLocaleString()} {item.duration ? `· ${fmtTime(item.duration)}` : ''}</div>
        </div>
        <div className="row">
          <button
            className="btn sm"
            onClick={async () => {
              const n = prompt('Rename recording', item.name);
              if (n) {
                await idbPut('recordings', { ...item, name: n });
                onChange();
              }
            }}
          >
            Rename
          </button>
          <a className="btn sm" href={url.current} download={`${item.name.replace(/[^a-z0-9]+/gi, '_')}.webm`}>
            <Icon name="download" size={14} />
          </a>
          <button
            className="btn sm danger"
            onClick={async () => {
              await idbDelete('recordings', item.id);
              onChange();
            }}
            aria-label="Delete"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>
      <div style={{ margin: '10px 0' }}>
        <Wave blob={item.blob} />
      </div>
      <audio src={url.current} controls style={{ width: '100%' }} />
    </div>
  );
}
