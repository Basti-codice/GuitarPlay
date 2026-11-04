import { useSyncExternalStore } from 'react';

export interface Settings {
  deviceId: string;
  inputGain: number;
  strictness: 'easy' | 'normal' | 'strict';
  playMode: 'realtime' | 'wait';
  /** extra latency compensation in ms (positive = audio arrives late) */
  latencyMs: number;
  a4: number;
  /** seconds of look-ahead shown in the waterfall */
  lookahead: number;
  leftHanded: boolean;
  volMaster: number;
  volMusic: number;
  volBacking: number;
  volRef: number;
  volClick: number;
  ambientOn: boolean;
  backingOn: boolean;
  refOn: boolean;
  clickOn: boolean;
  countIn: boolean;
  echoCancel: boolean;
  showChordBox: boolean;
  dailyGoalMin: number;
  apiKey: string;
  onboarded: boolean;
  headphonesNoticeSeen: boolean;
  micGate: number;
}

export const DEFAULT_SETTINGS: Settings = {
  deviceId: '',
  inputGain: 1,
  strictness: 'normal',
  playMode: 'realtime',
  latencyMs: 0,
  a4: 440,
  lookahead: 2.6,
  leftHanded: false,
  volMaster: 0.9,
  volMusic: 0.35,
  volBacking: 0.6,
  volRef: 0.7,
  volClick: 0.5,
  ambientOn: true,
  backingOn: false,
  refOn: false,
  clickOn: false,
  countIn: true,
  echoCancel: false,
  showChordBox: true,
  dailyGoalMin: 15,
  apiKey: '',
  onboarded: false,
  headphonesNoticeSeen: false,
  micGate: 0.0025,
};

const KEY = 'guitarplay.settings.v1';
let state: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export const getSettings = () => state;

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function subscribeSettings(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
