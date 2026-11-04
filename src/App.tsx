import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Icon } from './ui/Icon';
import { MicChip, Bar } from './ui/kit';
import { ToastHost, toast } from './ui/toast';
import { navigate, useRoute } from './core/router';
import { useSettings, updateSettings } from './core/settings';
import { ambient } from './audio/ambient';
import { ctxRunning, getCtx } from './audio/engine';
import { loadUserSongs } from './core/songs-store';
import { levelInfo, onAchievement, useProgress } from './core/progress';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { SongDetail } from './pages/SongDetail';
import { Play } from './pages/Play';

const Learn = lazy(() => import('./pages/Learn').then((m) => ({ default: m.Learn })));
const Lesson = lazy(() => import('./pages/Learn').then((m) => ({ default: m.Lesson })));
const Chords = lazy(() => import('./pages/Chords').then((m) => ({ default: m.Chords })));
const FretboardPage = lazy(() => import('./pages/FretboardPage').then((m) => ({ default: m.FretboardPage })));
const Ear = lazy(() => import('./pages/Ear').then((m) => ({ default: m.Ear })));
const Tuner = lazy(() => import('./pages/Tuner').then((m) => ({ default: m.Tuner })));
const MetronomePage = lazy(() => import('./pages/MetronomePage').then((m) => ({ default: m.MetronomePage })));
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })));
const Recorder = lazy(() => import('./pages/Recorder').then((m) => ({ default: m.Recorder })));
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })));
const Editor = lazy(() => import('./pages/Editor').then((m) => ({ default: m.Editor })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const Help = lazy(() => import('./pages/Help').then((m) => ({ default: m.Help })));
const Setup = lazy(() => import('./pages/Setup').then((m) => ({ default: m.Setup })));

const NAV: { group: string; items: { to: string; label: string; icon: string; match: string }[] }[] = [
  {
    group: 'Practice',
    items: [
      { to: '/', label: 'Home', icon: 'home', match: '' },
      { to: '/library', label: 'Songs', icon: 'library', match: 'library' },
      { to: '/learn', label: 'Learn', icon: 'learn', match: 'learn' },
    ],
  },
  {
    group: 'Tools',
    items: [
      { to: '/chords', label: 'Chords', icon: 'chords', match: 'chords' },
      { to: '/fretboard', label: 'Fretboard', icon: 'fretboard', match: 'fretboard' },
      { to: '/ear', label: 'Ear Training', icon: 'ear', match: 'ear' },
      { to: '/tuner', label: 'Tuner', icon: 'tuner', match: 'tuner' },
      { to: '/metronome', label: 'Metronome', icon: 'metronome', match: 'metronome' },
      { to: '/recorder', label: 'Recorder', icon: 'record', match: 'recorder' },
    ],
  },
  {
    group: 'You',
    items: [
      { to: '/stats', label: 'Progress', icon: 'stats', match: 'stats' },
      { to: '/import', label: 'Import & Create', icon: 'import', match: 'import' },
      { to: '/settings', label: 'Settings', icon: 'settings', match: 'settings' },
      { to: '/help', label: 'Help', icon: 'info', match: 'help' },
    ],
  },
];

const TITLES: Record<string, string> = {
  '': 'Home', library: 'Songs', song: 'Song', learn: 'Learn', chords: 'Chords', fretboard: 'Fretboard', ear: 'Ear Training', tuner: 'Tuner',
  metronome: 'Metronome', recorder: 'Recorder', stats: 'Progress', import: 'Import & Create', editor: 'Editor', settings: 'Settings', setup: 'Setup', help: 'Help',
};

// routes where the microphone is in use: no ambient music there
const QUIET = new Set(['play', 'tuner', 'chords', 'fretboard', 'ear', 'recorder', 'setup', 'metronome']);

export function App() {
  const route = useRoute();
  const s = useSettings();
  const p = useProgress();
  const section = route.path[0] ?? '';
  const immersive = section === 'play';
  const lv = levelInfo(p.xp);

  useEffect(() => {
    void loadUserSongs();
    onAchievement((m) => toast(m));
  }, []);

  // ambient music: starts after the first user gesture, pauses on microphone pages
  const wantAmbient = s.ambientOn && !QUIET.has(section) && !(section === 'learn' && route.path[1]);
  useEffect(() => {
    const go = () => {
      if (wantAmbient) {
        getCtx();
        ambient.start();
      }
    };
    if (!wantAmbient) ambient.stop();
    else window.addEventListener('pointerdown', go, { once: true });
    if (wantAmbient && ctxRunning()) go();
    return () => window.removeEventListener('pointerdown', go);
  }, [wantAmbient]);

  const page = useMemo(() => {
    switch (section) {
      case '':
        return <Home />;
      case 'library':
        return <Library />;
      case 'song':
        return <SongDetail id={route.path[1]} />;
      case 'play':
        return <Play id={route.path[1]} query={route.query} />;
      case 'learn':
        return route.path[1] ? <Lesson id={route.path[1]} /> : <Learn />;
      case 'chords':
        return <Chords />;
      case 'fretboard':
        return <FretboardPage />;
      case 'ear':
        return <Ear />;
      case 'tuner':
        return <Tuner />;
      case 'metronome':
        return <MetronomePage />;
      case 'stats':
        return <Stats />;
      case 'recorder':
        return <Recorder />;
      case 'import':
        return <ImportPage />;
      case 'editor':
        return <Editor id={route.path[1]} />;
      case 'settings':
        return <SettingsPage />;
      case 'setup':
        return <Setup />;
      case 'help':
        return <Help />;
      default:
        return (
          <div className="page">
            <h1>Not found</h1>
            <button className="btn" onClick={() => navigate('/')}>Go home</button>
          </div>
        );
    }
  }, [section, route.path, route.query]);

  if (immersive) {
    return (
      <div className="app immersive">
        <Suspense fallback={null}>{page}</Suspense>
        <ToastHost />
      </div>
    );
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <Icon name="guitar" size={19} stroke={2.2} />
          </div>
          <span>GuitarPlay</span>
        </div>
        {NAV.map((g) => (
          <div key={g.group} style={{ display: 'contents' }}>
            <div className="nav-group">{g.group}</div>
            {g.items.map((it) => (
              <button key={it.to} className={`nav-item ${section === it.match ? 'active' : ''}`} onClick={() => navigate(it.to)}>
                <Icon name={it.icon} />
                <span className="lbl">{it.label}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="grow" />
        <div className="level-card">
          <div className="row between small">
            <b>Level {lv.level}</b>
            <span className="muted">{p.xp} XP</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Bar value={lv.pct} />
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="title">{TITLES[section] ?? ''}</div>
          <button className="btn sm ghost" onClick={() => updateSettings({ ambientOn: !s.ambientOn })} title={s.ambientOn ? 'Mute menu music' : 'Play menu music'}>
            <Icon name={s.ambientOn ? 'volume' : 'mute'} size={17} />
            <span className="small">Music</span>
          </button>
          <MicChip />
        </div>
        <div className="content" id="scroller">
          <Suspense fallback={<div className="page muted">Loading…</div>}>{page}</Suspense>
        </div>
      </main>
      <ToastHost />
    </div>
  );
}
