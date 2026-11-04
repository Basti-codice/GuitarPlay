import { useSyncExternalStore } from 'react';
import { lsGet, lsSet } from './storage';

export interface SessionRecord {
  id: string;
  ts: number;
  songId: string;
  title: string;
  trackId: string;
  accuracy: number;
  score: number;
  stars: number;
  durationSec: number;
  mode: string;
  speed: number;
  notes: number;
  maxCombo: number;
}

export interface Progress {
  sessions: SessionRecord[];
  best: Record<string, { accuracy: number; score: number; stars: number; ts: number }>;
  xp: number;
  practiceByDay: Record<string, number>;
  favorites: string[];
  lessons: Record<string, { stars: number; done: boolean; best: number }>;
  achievements: Record<string, number>;
  weak: Record<string, { hit: number; miss: number }>;
  chordChecks: Record<string, number>;
  counters: Record<string, number>;
  recents: string[];
}

const KEY = 'guitarplay.progress.v1';
const empty = (): Progress => ({ sessions: [], best: {}, xp: 0, practiceByDay: {}, favorites: [], lessons: {}, achievements: {}, weak: {}, chordChecks: {}, counters: {}, recents: [] });

let state: Progress = { ...empty(), ...lsGet<Partial<Progress>>(KEY, {}) };
const listeners = new Set<() => void>();
let toastCb: ((msg: string) => void) | null = null;
export const onAchievement = (cb: (msg: string) => void) => (toastCb = cb);

function commit(next: Progress) {
  state = next;
  lsSet(KEY, state);
  listeners.forEach((l) => l());
}

export const getProgress = () => state;
export const useProgress = () => useSyncExternalStore((fn) => (listeners.add(fn), () => listeners.delete(fn)), getProgress);

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function levelInfo(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 120)) + 1;
  const cur = 120 * (level - 1) ** 2;
  const next = 120 * level ** 2;
  return { level, cur, next, pct: (xp - cur) / (next - cur) };
}

export function streak(p: Progress = state) {
  let n = 0;
  const d = new Date();
  // today may still be empty: allow streak to continue from yesterday
  if (!p.practiceByDay[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (p.practiceByDay[dayKey(d)] > 30) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (p: Progress) => boolean;
}

const uniqueSongs = (p: Progress) => new Set(p.sessions.filter((s) => s.accuracy >= 0.6).map((s) => s.songId)).size;
const totalMin = (p: Progress) => Object.values(p.practiceByDay).reduce((a, b) => a + b, 0) / 60;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'First Notes', desc: 'Finish your first song or exercise.', icon: '🎸', check: (p) => p.sessions.length >= 1 },
  { id: 'stars3', name: 'Three Stars', desc: 'Earn 3 stars on any piece.', icon: '⭐', check: (p) => p.sessions.some((s) => s.stars >= 3) },
  { id: 'songs10', name: 'Repertoire', desc: 'Play 10 different pieces with ≥ 60 % accuracy.', icon: '📚', check: (p) => uniqueSongs(p) >= 10 },
  { id: 'songs30', name: 'Setlist', desc: 'Play 30 different pieces with ≥ 60 % accuracy.', icon: '🎤', check: (p) => uniqueSongs(p) >= 30 },
  { id: 'streak3', name: 'On a Roll', desc: 'Practise 3 days in a row.', icon: '🔥', check: (p) => streak(p) >= 3 },
  { id: 'streak7', name: 'Week Warrior', desc: 'Practise 7 days in a row.', icon: '🗓️', check: (p) => streak(p) >= 7 },
  { id: 'streak30', name: 'Habit Formed', desc: 'Practise 30 days in a row.', icon: '🏆', check: (p) => streak(p) >= 30 },
  { id: 'min60', name: 'First Hour', desc: 'Practise for 60 minutes in total.', icon: '⏱️', check: (p) => totalMin(p) >= 60 },
  { id: 'min600', name: 'Ten Hours', desc: 'Practise for 10 hours in total.', icon: '⌛', check: (p) => totalMin(p) >= 600 },
  { id: 'combo25', name: 'Combo 25', desc: 'Hit 25 notes in a row.', icon: '⚡', check: (p) => p.sessions.some((s) => s.maxCombo >= 25) },
  { id: 'combo100', name: 'Combo 100', desc: 'Hit 100 notes in a row.', icon: '💥', check: (p) => p.sessions.some((s) => s.maxCombo >= 100) },
  { id: 'perfect', name: 'Flawless', desc: '100 % accuracy on a piece with at least 20 notes.', icon: '💎', check: (p) => p.sessions.some((s) => s.accuracy >= 0.995 && s.notes >= 20) },
  { id: 'chords10', name: 'Chord Explorer', desc: 'Check 10 different chords with the microphone.', icon: '🎼', check: (p) => Object.keys(p.chordChecks).length >= 10 },
  { id: 'lessons5', name: 'Student', desc: 'Complete 5 lessons.', icon: '🎓', check: (p) => Object.values(p.lessons).filter((l) => l.done).length >= 5 },
  { id: 'lessons20', name: 'Graduate', desc: 'Complete 20 lessons.', icon: '🏅', check: (p) => Object.values(p.lessons).filter((l) => l.done).length >= 20 },
  { id: 'tuner', name: 'In Tune', desc: 'Tune all six strings with the tuner.', icon: '🎚️', check: (p) => (p.counters.tuned ?? 0) >= 6 },
  { id: 'ear', name: 'Good Ear', desc: 'Answer 25 ear-training questions correctly.', icon: '👂', check: (p) => (p.counters.earCorrect ?? 0) >= 25 },
  { id: 'fretboard', name: 'Fretboard Mapper', desc: 'Find 30 notes in the fretboard trainer.', icon: '🗺️', check: (p) => (p.counters.fretCorrect ?? 0) >= 30 },
  { id: 'creator', name: 'Composer', desc: 'Save a song from the editor or import one.', icon: '✍️', check: (p) => (p.counters.created ?? 0) >= 1 },
];

function checkAchievements(p: Progress): Progress {
  let changed = false;
  const ach = { ...p.achievements };
  for (const a of ACHIEVEMENTS) {
    if (!ach[a.id] && a.check(p)) {
      ach[a.id] = Date.now();
      changed = true;
      toastCb?.(`${a.icon}  Achievement unlocked: ${a.name}`);
    }
  }
  return changed ? { ...p, achievements: ach, xp: p.xp + 50 * Object.keys(ach).filter((k) => !p.achievements[k]).length } : p;
}

export function recordSession(rec: SessionRecord, weak: { key: string; hit: boolean }[]) {
  const p = state;
  const k = `${rec.songId}:${rec.trackId}`;
  const prev = p.best[k];
  const best = { ...p.best };
  if (!prev || rec.score > prev.score) best[k] = { accuracy: rec.accuracy, score: rec.score, stars: Math.max(rec.stars, prev?.stars ?? 0), ts: rec.ts };
  else best[k] = { ...prev, stars: Math.max(prev.stars, rec.stars) };
  const wk = { ...p.weak };
  for (const w of weak) {
    const cur = wk[w.key] ?? { hit: 0, miss: 0 };
    wk[w.key] = { hit: cur.hit + (w.hit ? 1 : 0), miss: cur.miss + (w.hit ? 0 : 1) };
  }
  const recents = [rec.songId, ...p.recents.filter((x) => x !== rec.songId)].slice(0, 12);
  const next: Progress = {
    ...p,
    sessions: [...p.sessions, rec].slice(-800),
    best,
    weak: wk,
    recents,
    xp: p.xp + Math.round(rec.score / 20 + rec.durationSec / 6),
  };
  commit(checkAchievements(next));
}

export function addPractice(seconds: number) {
  if (seconds <= 0) return;
  const k = dayKey();
  const p = state;
  commit(checkAchievements({ ...p, practiceByDay: { ...p.practiceByDay, [k]: (p.practiceByDay[k] ?? 0) + seconds }, xp: p.xp + Math.round(seconds / 12) }));
}

export function toggleFavorite(id: string) {
  const f = state.favorites.includes(id) ? state.favorites.filter((x) => x !== id) : [...state.favorites, id];
  commit({ ...state, favorites: f });
}

export function setLesson(id: string, stars: number, best: number, done: boolean) {
  const cur = state.lessons[id];
  const next = { stars: Math.max(stars, cur?.stars ?? 0), best: Math.max(best, cur?.best ?? 0), done: done || cur?.done || false };
  const gained = !cur?.done && next.done ? 80 : 0;
  commit(checkAchievements({ ...state, lessons: { ...state.lessons, [id]: next }, xp: state.xp + gained }));
}

export function bump(counter: string, by = 1) {
  commit(checkAchievements({ ...state, counters: { ...state.counters, [counter]: (state.counters[counter] ?? 0) + by } }));
}

export function noteChordCheck(name: string) {
  commit(checkAchievements({ ...state, chordChecks: { ...state.chordChecks, [name]: (state.chordChecks[name] ?? 0) + 1 } }));
}

export function setCounterMax(counter: string, v: number) {
  commit(checkAchievements({ ...state, counters: { ...state.counters, [counter]: Math.max(state.counters[counter] ?? 0, v) } }));
}

export function resetProgress() {
  commit(empty());
}
export function replaceProgress(p: Partial<Progress>) {
  commit({ ...empty(), ...p });
}
