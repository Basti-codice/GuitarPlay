import { Icon } from '../ui/Icon';
import { Bar, SongCard, Stars, fmtMin } from '../ui/kit';
import { navigate } from '../core/router';
import { dayKey, levelInfo, streak, useProgress, ACHIEVEMENTS } from '../core/progress';
import { useSettings } from '../core/settings';
import { getSong, useSongs } from '../core/songs-store';

const TIPS = [
  'Slow practice beats fast mistakes. Drop the speed to 70 % until a section is clean.',
  'Loop the two hardest bars instead of replaying the whole song.',
  'Tune before you play – the detector is only as good as your tuning.',
  'Rest your strumming hand over the strings after each chord to keep them from ringing into the next.',
  'Use headphones when the backing band is on so the microphone only hears your guitar.',
  'Short daily sessions beat one long weekly marathon.',
];

export function Home() {
  const p = useProgress();
  const s = useSettings();
  const songs = useSongs();
  const lv = levelInfo(p.xp);
  const today = p.practiceByDay[dayKey()] ?? 0;
  const goal = s.dailyGoalMin * 60;
  const st = streak(p);
  const recents = p.recents.map((id) => getSong(id)).filter(Boolean).slice(0, 4);
  const last = p.sessions[p.sessions.length - 1];
  const pool = songs.filter((x) => x.source === 'builtin' && !p.sessions.some((r) => r.songId === x.id));
  const rec = pool.filter((x) => x.difficulty <= Math.min(4, 1 + Math.floor(lv.level / 3))).slice(0, 4);
  const tip = TIPS[Math.floor(Date.now() / 86400000) % TIPS.length];
  const r = 34,
    C = 2 * Math.PI * r;
  const frac = Math.min(1, today / goal);

  return (
    <div className="page">
      <div className="hero">
        <div className="row between wrap" style={{ gap: 28 }}>
          <div style={{ maxWidth: 560 }}>
            <div className="pill accent" style={{ marginBottom: 12 }}>
              <Icon name="flame" size={14} /> {st} day streak
            </div>
            <h1 style={{ fontSize: 36 }}>{greeting()}, ready to play?</h1>
            <p style={{ marginTop: 8, fontSize: 16 }}>Plug in, tune up and let the waterfall guide you. Your microphone checks every note you play.</p>
            <div className="row wrap" style={{ marginTop: 18 }}>
              {last ? (
                <button className="btn primary lg" onClick={() => navigate(`/play/${encodeURIComponent(last.songId)}?track=${last.trackId}&speed=1&mode=${s.playMode}`)}>
                  <Icon name="play" size={18} /> Continue: {last.title}
                </button>
              ) : (
                <button className="btn primary lg" onClick={() => navigate('/library')}>
                  <Icon name="play" size={18} /> Pick a song
                </button>
              )}
              <button className="btn lg" onClick={() => navigate('/tuner')}>
                <Icon name="tuner" size={18} /> Tune up
              </button>
              {!s.onboarded && (
                <button className="btn lg" onClick={() => navigate('/setup')}>
                  <Icon name="mic" size={18} /> Set up microphone
                </button>
              )}
            </div>
          </div>
          <div className="row" style={{ gap: 26 }}>
            <div className="center">
              <svg width="92" height="92" viewBox="0 0 92 92">
                <circle cx="46" cy="46" r={r} stroke="#2a2e3f" strokeWidth="9" fill="none" />
                <circle cx="46" cy="46" r={r} stroke="url(#g)" strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 46 46)" />
                <defs>
                  <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0" stopColor="#ffb347" />
                    <stop offset="1" stopColor="#ff5e62" />
                  </linearGradient>
                </defs>
                <text x="46" y="51" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff">
                  {Math.round(today / 60)}m
                </text>
              </svg>
              <div className="tiny muted">Today / {s.dailyGoalMin}m</div>
            </div>
            <div className="center" style={{ width: 110 }}>
              <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1 }}>{lv.level}</div>
              <div className="tiny muted" style={{ marginBottom: 6 }}>Level</div>
              <Bar value={lv.pct} />
            </div>
          </div>
        </div>
      </div>

      {recents.length > 0 && (
        <section>
          <div className="row between" style={{ marginBottom: 12 }}>
            <h2>Pick up where you left off</h2>
          </div>
          <div className="grid auto">
            {recents.map((x) => (
              <SongCard key={x!.id} song={x!} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>{recents.length ? 'Try something new' : 'Good first pieces'}</h2>
          <button className="btn ghost sm" onClick={() => navigate('/library')}>
            All songs <Icon name="right" size={15} />
          </button>
        </div>
        <div className="grid auto">
          {(rec.length ? rec : songs.slice(0, 4)).map((x) => (
            <SongCard key={x.id} song={x} />
          ))}
        </div>
      </section>

      <div className="grid c3">
        <div className="card hover" onClick={() => navigate('/learn')}>
          <div className="row"><Icon name="learn" size={22} /><h3>Lesson path</h3></div>
          <p>Structured intermediate course: barre chords, strumming, fingerstyle, scales and songcraft.</p>
          <span className="small" style={{ color: 'var(--accent)' }}>
            {Object.values(p.lessons).filter((l) => l.done).length} lessons completed
          </span>
        </div>
        <div className="card hover" onClick={() => navigate('/chords')}>
          <div className="row"><Icon name="chords" size={22} /><h3>Chord checker</h3></div>
          <p>Hold a chord and see which of the six strings ring out and which are muted.</p>
        </div>
        <div className="card hover" onClick={() => navigate('/stats')}>
          <div className="row"><Icon name="stats" size={22} /><h3>Your progress</h3></div>
          <p>
            {fmtMin(Object.values(p.practiceByDay).reduce((a, b) => a + b, 0))} practised · {Object.keys(p.achievements).length}/{ACHIEVEMENTS.length} achievements
          </p>
          <Stars n={Math.min(3, Math.floor(Object.keys(p.achievements).length / 5))} />
        </div>
      </div>
      <div className="tip">
        <b>Tip of the day:</b> {tip}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night session' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
