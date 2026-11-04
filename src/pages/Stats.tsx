import { useMemo } from 'react';
import { Bar, Fretboard, PageHead, Stars, fmtMin, type FretMark } from '../ui/kit';
import { ACHIEVEMENTS, dayKey, levelInfo, streak, useProgress } from '../core/progress';
import { navigate } from '../core/router';

export function Stats() {
  const p = useProgress();
  const lv = levelInfo(p.xp);
  const totalSec = Object.values(p.practiceByDay).reduce((a, b) => a + b, 0);
  const last10 = p.sessions.slice(-10);
  const avg = last10.length ? last10.reduce((a, b) => a + b.accuracy, 0) / last10.length : 0;

  const days = useMemo(() => {
    const out: { k: string; sec: number; d: Date }[] = [];
    const d = new Date();
    d.setDate(d.getDate() - 13);
    for (let i = 0; i < 14; i++) {
      out.push({ k: dayKey(d), sec: p.practiceByDay[dayKey(d)] ?? 0, d: new Date(d) });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [p.practiceByDay]);
  const maxDay = Math.max(600, ...days.map((d) => d.sec));

  const heat = useMemo(() => {
    const cells: { k: string; sec: number }[] = [];
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7 * 15 + 1);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) cells.push({ k: dayKey(d), sec: p.practiceByDay[dayKey(d)] ?? 0 });
    return cells;
  }, [p.practiceByDay]);

  const trend = p.sessions.slice(-30);
  const W = 520,
    H = 140;
  const pts = trend.map((s, i) => [trend.length > 1 ? (i / (trend.length - 1)) * (W - 20) + 10 : W / 2, H - 10 - s.accuracy * (H - 20)]);

  const weakMarks = useMemo(() => {
    const m = new Map<string, FretMark>();
    for (const [k, v] of Object.entries(p.weak)) {
      const total = v.hit + v.miss;
      if (total < 3) continue;
      const [s, f] = k.split(':').map(Number);
      const rate = v.miss / total;
      m.set(`${s}:${f}`, { color: rate > 0.4 ? '#ff5d73' : rate > 0.15 ? '#ffd93d' : '#4be08c', label: String(Math.round(rate * 100)) });
    }
    return m;
  }, [p.weak]);

  const topSongs = useMemo(() => {
    const c = new Map<string, { title: string; n: number; best: number }>();
    for (const s of p.sessions) {
      const e = c.get(s.songId) ?? { title: s.title, n: 0, best: 0 };
      e.n++;
      e.best = Math.max(e.best, s.accuracy);
      c.set(s.songId, e);
    }
    return [...c.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  }, [p.sessions]);

  return (
    <div className="page">
      <PageHead title="Progress" sub="Your practice history, strengths and weak spots." />
      <div className="grid c4">
        <Kpi k="Practice time" v={fmtMin(totalSec)} />
        <Kpi k="Sessions" v={String(p.sessions.length)} />
        <Kpi k="Avg accuracy (last 10)" v={`${Math.round(avg * 100)}%`} />
        <Kpi k="Day streak" v={`${streak(p)} 🔥`} />
      </div>
      <div className="grid c2">
        <div className="card">
          <div className="row between"><h3>Level {lv.level}</h3><span className="small muted">{p.xp} / {lv.next} XP</span></div>
          <div style={{ marginTop: 10 }}><Bar value={lv.pct} /></div>
          <p className="small" style={{ marginTop: 10 }}>Earn XP by playing, finishing lessons and unlocking achievements.</p>
        </div>
        <div className="card">
          <h3>Last 14 days (minutes)</h3>
          <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 100, marginTop: 14 }}>
            {days.map((d) => (
              <div key={d.k} style={{ flex: 1, textAlign: 'center' }} title={`${d.k}: ${Math.round(d.sec / 60)} min`}>
                <div style={{ height: Math.max(3, (d.sec / maxDay) * 84), background: d.sec > 0 ? 'var(--grad)' : 'var(--card3)', borderRadius: 4 }} />
                <div className="tiny faint" style={{ marginTop: 4 }}>{d.d.getDate()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid c2">
        <div className="card">
          <h3>Accuracy trend</h3>
          {trend.length < 2 ? <p className="muted" style={{ marginTop: 10 }}>Play a few songs to see your trend.</p> : (
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ marginTop: 8 }}>
              {[0, 0.5, 1].map((v) => <line key={v} x1={10} x2={W - 10} y1={H - 10 - v * (H - 20)} y2={H - 10 - v * (H - 20)} stroke="#2a2e3f" />)}
              <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke="url(#tg)" strokeWidth={3} strokeLinejoin="round" />
              <defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stopColor="#ffb347" /><stop offset="1" stopColor="#ff5e62" /></linearGradient></defs>
              {pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={3.5} fill="#fff" />)}
            </svg>
          )}
        </div>
        <div className="card">
          <h3>Practice calendar</h3>
          <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 14px)', gridAutoFlow: 'column', gap: 4, marginTop: 12, overflow: 'hidden' }}>
            {heat.map((c) => (
              <div key={c.k} title={`${c.k}: ${Math.round(c.sec / 60)} min`} style={{ width: 14, height: 14, borderRadius: 3, background: c.sec === 0 ? 'var(--card3)' : c.sec < 600 ? '#6b4a1f' : c.sec < 1500 ? '#c98a2e' : 'var(--accent)' }} />
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Fretboard weak spots</h3>
        <p className="small">Share of notes missed per fret position (needs a few attempts). Green = reliable, red = needs work.</p>
        {weakMarks.size === 0 ? <p className="muted">No data yet – play some songs.</p> : <Fretboard marks={weakMarks} frets={12} />}
      </div>
      <div className="grid c2">
        <div className="card">
          <h3>Most played</h3>
          <table className="t">
            <tbody>
              {topSongs.length === 0 && <tr><td className="muted">Nothing yet.</td></tr>}
              {topSongs.map(([id, e]) => (
                <tr key={id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/song/${encodeURIComponent(id)}`)}>
                  <td>{e.title}</td><td className="muted">{e.n}×</td><td><Stars n={e.best >= 0.95 ? 3 : e.best >= 0.85 ? 2 : e.best >= 0.65 ? 1 : 0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Recent sessions</h3>
          <table className="t">
            <tbody>
              {p.sessions.slice(-6).reverse().map((s) => (
                <tr key={s.id}><td>{s.title}</td><td className="muted">{new Date(s.ts).toLocaleDateString()}</td><td>{Math.round(s.accuracy * 100)}%</td></tr>
              ))}
              {p.sessions.length === 0 && <tr><td className="muted">Nothing yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="row between"><h3>Achievements</h3><span className="small muted">{Object.keys(p.achievements).length}/{ACHIEVEMENTS.length}</span></div>
        <div className="grid auto" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))' }}>
          {ACHIEVEMENTS.map((a) => {
            const got = !!p.achievements[a.id];
            return (
              <div key={a.id} className={`card ${got ? '' : 'lock'}`} style={{ padding: 12, background: got ? 'var(--card2)' : undefined }}>
                <div className="row"><span style={{ fontSize: 26 }}>{a.icon}</span><div><b>{a.name}</b><div className="tiny muted">{a.desc}</div></div></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ k, v }: { k: string; v: string }) {
  return (
    <div className="card">
      <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k}</div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{v}</div>
    </div>
  );
}
