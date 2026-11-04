import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from './Icon';
import { mic } from '../audio/mic';
import { STRING_COLORS, noteName, tuningLabels, STANDARD } from '../core/music';
import type { Song } from '../core/types';
import { navigate } from '../core/router';
import { getProgress, toggleFavorite, useProgress } from '../core/progress';

export function useMicState() {
  useSyncExternalStore(
    (fn) => mic.subscribeState(fn),
    () => `${mic.state}|${mic.devices.length}|${mic.simulated}`,
  );
  return mic;
}

/** Re-render ~30fps with the latest mic level (0..1). */
export function useMicLevel(active = true) {
  const [lvl, setLvl] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 33) {
        last = t;
        const a = mic.analyzer;
        setLvl(a ? Math.min(1, Math.sqrt(a.rms) * 2.2) : 0);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return lvl;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ value, min, max, step = 0.01, onChange, width }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; width?: number }) {
  return <input type="range" min={min} max={max} step={step} value={value} style={{ width }} onChange={(e) => onChange(parseFloat(e.target.value))} />;
}

export function Setting({ label, desc, children }: { label: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div>
        <div className="label">{label}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <div className="ctl">{children}</div>
    </div>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>{children}</div>
    </div>
  );
}

export function Stars({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <span className="stars" aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < n ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

export function Diff({ n }: { n: number }) {
  return (
    <span className="diff" title={`Difficulty ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= n ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Meter({ value }: { value: number }) {
  return (
    <div className="meter">
      <i style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export function Bar({ value }: { value: number }) {
  return (
    <div className="bar">
      <i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="row between wrap">
      <div>
        <h1>{title}</h1>
        {sub && <p style={{ marginTop: 6 }}>{sub}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ChordDiagram({ shape, name, size = 120, dim = false }: { shape: number[]; name?: string; size?: number; dim?: boolean }) {
  const fretted = shape.filter((f) => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 1;
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const base = maxF <= 4 ? 1 : minF;
  const W = 100,
    H = 118;
  const x0 = 22,
    x1 = 82,
    y0 = 26,
    fh = 17;
  const sx = (s: number) => x0 + ((x1 - x0) / 5) * s;
  const nf = 5;
  // barre detection: lowest fretted value on >=3 strings incl. both outer
  let barre: { fret: number; from: number; to: number } | null = null;
  if (fretted.length >= 4) {
    const f = minF;
    const idx = shape.map((v, i) => (v === f ? i : -1)).filter((i) => i >= 0);
    const holes = shape.slice(idx[0], idx[idx.length - 1] + 1).filter((v) => v === 0).length;
    if (idx.length >= 3 && holes === 0 && f > 0) barre = { fret: f, from: idx[0], to: idx[idx.length - 1] };
  }
  return (
    <svg className="cd" width={size} height={(size * H) / W} viewBox={`0 0 ${W} ${H}`} style={{ opacity: dim ? 0.55 : 1 }} role="img" aria-label={name ? `${name} chord diagram` : 'chord diagram'}>
      {name && (
        <text x={W / 2} y={13} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
          {name}
        </text>
      )}
      {base > 1 ? (
        <text x={x0 - 8} y={y0 + fh * 0.7} textAnchor="end" fontSize={9} fill="#9aa1b8" fontWeight={700}>
          {base}
        </text>
      ) : (
        <rect x={x0 - 1} y={y0 - 3} width={x1 - x0 + 2} height={3.5} fill="#e8eaf2" rx={1} />
      )}
      {Array.from({ length: nf + 1 }).map((_, i) => (
        <line key={i} x1={x0} x2={x1} y1={y0 + i * fh} y2={y0 + i * fh} stroke="#4a4f66" strokeWidth={1} />
      ))}
      {Array.from({ length: 6 }).map((_, s) => (
        <line key={s} x1={sx(s)} x2={sx(s)} y1={y0} y2={y0 + nf * fh} stroke="#7c829b" strokeWidth={s < 3 ? 1.5 : 1} />
      ))}
      {barre && <rect x={sx(barre.from) - 4} y={y0 + (barre.fret - base) * fh + fh / 2 - 4.5} width={sx(barre.to) - sx(barre.from) + 8} height={9} rx={4.5} fill="#ffb347" />}
      {shape.map((f, s) => {
        if (f < 0) return <text key={s} x={sx(s)} y={y0 - 7} textAnchor="middle" fontSize={10} fill="#ff5d73" fontWeight={800}>×</text>;
        if (f === 0) return <circle key={s} cx={sx(s)} cy={y0 - 9} r={3.2} fill="none" stroke="#9aa1b8" strokeWidth={1.4} />;
        if (barre && f === barre.fret && s >= barre.from && s <= barre.to) return null;
        return <circle key={s} cx={sx(s)} cy={y0 + (f - base) * fh + fh / 2} r={5.6} fill="#ffb347" />;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
export interface FretMark {
  label?: string;
  color?: string;
  root?: boolean;
  dim?: boolean;
}

export function Fretboard({
  marks,
  frets = 15,
  tuning = STANDARD,
  onClick,
  width = 900,
  leftHanded = false,
  capo = 0,
}: {
  marks?: Map<string, FretMark>;
  frets?: number;
  tuning?: number[];
  onClick?: (s: number, f: number) => void;
  width?: number;
  leftHanded?: boolean;
  capo?: number;
}) {
  const padL = 34,
    padR = 12,
    padT = 14,
    padB = 26;
  const sh = 30;
  const H = padT + 5 * sh + padB;
  const fw = (width - padL - padR) / frets;
  const fx = (f: number) => padL + (leftHanded ? frets - f : f) * fw;
  const inlays = [3, 5, 7, 9, 12, 15, 17, 19, 21];
  const labels = tuningLabels(tuning);
  const rows = [5, 4, 3, 2, 1, 0]; // top = high e
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${H}`} style={{ maxWidth: width }} role="img" aria-label="Guitar fretboard">
      <rect x={padL} y={padT - 6} width={width - padL - padR} height={5 * sh + 12} rx={8} fill="#1a1710" stroke="#3a3326" />
      {inlays.filter((i) => i <= frets).map((i) => (i === 12 ? [-1, 1] : [0]).map((d, k) => <circle key={`${i}-${k}`} cx={fx(i) + (leftHanded ? fw / 2 : -fw / 2)} cy={padT + 2.5 * sh + d * sh * 1.4} r={5} fill="#2e2a1f" />))}
      {Array.from({ length: frets + 1 }).map((_, f) => (
        <line key={f} x1={fx(f)} x2={fx(f)} y1={padT - 6} y2={padT + 5 * sh + 6} stroke={f === 0 ? '#d8d2c0' : '#6b6450'} strokeWidth={f === 0 ? 5 : 2} />
      ))}
      {rows.map((s, r) => (
        <g key={s}>
          <line x1={padL} x2={width - padR} y1={padT + r * sh} y2={padT + r * sh} stroke={STRING_COLORS[s]} strokeOpacity={0.75} strokeWidth={1 + (5 - s) * 0.35} />
          <text x={padL - 12} y={padT + r * sh + 4} fontSize={12} fontWeight={800} fill={STRING_COLORS[s]} textAnchor="middle">
            {labels[s]}
          </text>
        </g>
      ))}
      {Array.from({ length: frets }).map((_, f) => (
        <text key={f} x={(fx(f) + fx(f + 1)) / 2} y={H - 8} fontSize={11} fill="#6c7390" textAnchor="middle">
          {f + 1}
        </text>
      ))}
      {rows.map((s, r) =>
        Array.from({ length: frets + 1 }).map((_, f) => {
          const key = `${s}:${f}`;
          const m = marks?.get(key);
          const cx = f === 0 ? fx(0) + (leftHanded ? 14 : -14) : (fx(f) + fx(f - 1)) / 2;
          const cy = padT + r * sh;
          return (
            <g key={key} onClick={() => onClick?.(s, f)} style={{ cursor: onClick ? 'pointer' : 'default' }}>
              {onClick && <rect x={cx - fw / 2} y={cy - sh / 2} width={fw} height={sh} fill="transparent" />}
              {m && (
                <>
                  <circle cx={cx} cy={cy} r={11} fill={m.color ?? (m.root ? '#ff5e62' : '#ffb347')} opacity={m.dim ? 0.35 : 1} stroke={m.root ? '#fff' : 'none'} strokeWidth={2} />
                  {m.label && (
                    <text x={cx} y={cy + 4} fontSize={11} fontWeight={800} textAnchor="middle" fill="#14110a">
                      {m.label}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        }),
      )}
      {capo > 0 && <rect x={fx(capo) - 5} y={padT - 9} width={9} height={5 * sh + 18} rx={4} fill="#ffb347" opacity={0.85} transform={`translate(${leftHanded ? 0 : -fw * 0.15},0)`} />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
export function SongCard({ song }: { song: Song }) {
  const p = useProgress();
  const bestStars = Math.max(0, ...song.tracks.map((t) => p.best[`${song.id}:${t.id}`]?.stars ?? 0));
  const fav = p.favorites.includes(song.id);
  const played = song.tracks.some((t) => p.best[`${song.id}:${t.id}`]);
  return (
    <div className="card hover" onClick={() => navigate(`/song/${encodeURIComponent(song.id)}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/song/${encodeURIComponent(song.id)}`)}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</h3>
          <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {song.artist}
          </div>
        </div>
        <button
          className="btn ghost icon"
          aria-label={fav ? 'Remove favourite' : 'Add favourite'}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(song.id);
          }}
          style={{ color: fav ? 'var(--accent2)' : undefined }}
        >
          <Icon name="heart" size={18} />
        </button>
      </div>
      <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
        <span className="pill accent">{song.genre}</span>
        <Diff n={song.difficulty} />
        <span className="grow" />
        {played ? <Stars n={bestStars} /> : <span className="tiny faint">{song.bpm} BPM</span>}
      </div>
      <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
        {song.tracks.map((t) => (
          <span className="pill" key={t.id}>
            {t.kind === 'melody' ? 'Melody' : t.kind === 'chords' ? 'Chords' : t.kind === 'picking' ? 'Picking' : 'Tab'}
          </span>
        ))}
        {song.source === 'user' && <span className="pill info">Mine</span>}
      </div>
    </div>
  );
}

export function MicChip() {
  const m = useMicState();
  const lvl = useMicLevel(m.state === 'on');
  const on = m.state === 'on';
  return (
    <button
      className="btn sm"
      onClick={() => (on ? m.stop() : void m.start())}
      title={m.state === 'error' ? m.error : on ? `Listening: ${m.deviceLabel || 'microphone'}` : 'Enable microphone'}
      style={{ gap: 10 }}
    >
      <Icon name={on ? 'mic' : 'micoff'} size={16} />
      {on ? (
        <span style={{ width: 70 }}>
          <Meter value={lvl} />
        </span>
      ) : m.state === 'starting' ? (
        'Starting…'
      ) : m.state === 'error' ? (
        <span style={{ color: 'var(--bad)' }}>Mic error</span>
      ) : (
        'Mic off'
      )}
    </button>
  );
}

export function MicGate({ children }: { children: ReactNode }) {
  const m = useMicState();
  if (m.state === 'on') return <>{children}</>;
  return (
    <div className="card center" style={{ padding: 32 }}>
      <Icon name="mic" size={34} />
      <h2 style={{ margin: '12px 0 6px' }}>Microphone needed</h2>
      <p>{m.state === 'error' ? m.error : 'GuitarPlay listens to your acoustic guitar through the microphone. Nothing is recorded or uploaded.'}</p>
      <button className="btn primary lg" onClick={() => void m.start()} disabled={m.state === 'starting'}>
        <Icon name="mic" size={18} /> {m.state === 'starting' ? 'Starting…' : 'Enable microphone'}
      </button>
    </div>
  );
}

export function useInterval(fn: () => void, ms: number, active = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const fmtMin = (sec: number) => (sec >= 3600 ? `${(sec / 3600).toFixed(1)} h` : `${Math.round(sec / 60)} min`);
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export { noteName, getProgress };
