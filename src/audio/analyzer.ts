import { FFT, hann } from './fft';
import { MPM } from './pitch';
import { freqToMidi, midiToFreq } from '../core/music';

export interface PitchInfo {
  freq: number;
  midi: number;
  clarity: number;
}

export interface AnalysisFrame {
  /** Time of the newest sample in this frame (mic clock, seconds). */
  t: number;
  rms: number;
  gate: boolean;
  onset: boolean;
  /** Estimated physical time of the attack (valid when onset). */
  onsetTime: number;
  flux: number;
  pitch: PitchInfo | null;
}

export interface Evaluation {
  scores: number[];
  present: boolean[];
  frac: number;
  count: number;
}

export interface AnalyzerConfig {
  /** Software input gain. */
  gain: number;
  /** Minimum absolute noise gate (linear RMS). */
  minGate: number;
  /** Score threshold (0..1) for a note to count as present. */
  presence: number;
  /** Cents tolerance for harmonic peak matching. */
  centsTol: number;
  /** Onset threshold multiplier. */
  onsetSens: number;
  a4: number;
}

export const DEFAULT_ANALYZER: AnalyzerConfig = {
  gain: 1,
  minGate: 0.0025,
  presence: 0.42,
  centsTol: 45,
  onsetSens: 1,
  a4: 440,
};

/** Median offset between a true attack and the detected onset in ctx time. Calibrated by tests. */
export const ONSET_LAG = 0.012;

const LONG = 8192;
const SHORT = 4096;
const ONS = 1024;
const HOP = 512;
const HARM_W = [1, 0.9, 0.7, 0.5];

/**
 * Streaming analyser: onset detection, monophonic pitch (MPM) and
 * “is this expected note present?” spectral checks for polyphonic input.
 */
export class Analyzer {
  cfg: AnalyzerConfig;
  private ring = new Float32Array(1 << 15);
  private written = 0;
  private tEnd = 0;
  private sinceHop = 0;
  private hopIdx = 0;

  private fftL = new FFT(LONG);
  private fftS = new FFT(SHORT);
  private fftO = new FFT(ONS);
  private winL = hann(LONG);
  private winS = hann(SHORT);
  private winO = hann(ONS);
  private re = new Float32Array(LONG);
  private im = new Float32Array(LONG);
  private tmp = new Float32Array(LONG);
  private mpm: MPM;
  private pitchBuf = new Float32Array(2048);

  magL = new Float32Array(LONG / 2 + 1);
  magS = new Float32Array(SHORT / 2 + 1);
  private magO = new Float32Array(ONS / 2 + 1);
  private prevO = new Float32Array(ONS / 2 + 1);
  private specValid = false;
  /** increments whenever fresh spectra were computed */
  specSerial = 0;

  private fluxHist: number[] = [];
  private fluxPrev2 = 0;
  private fluxPrev1 = 0;
  private lastOnsetT = -1;
  private lastOnsetFlux = 0;
  noise = 0.004;
  rms = 0;
  lastPitch: PitchInfo | null = null;
  peak = 0;

  constructor(public fs: number, cfg: Partial<AnalyzerConfig> = {}) {
    this.cfg = { ...DEFAULT_ANALYZER, ...cfg };
    this.mpm = new MPM(fs, 2048);
  }

  get gateLevel() {
    return Math.max(this.cfg.minGate, this.noise * 3);
  }

  reset() {
    this.ring.fill(0);
    this.written = 0;
    this.sinceHop = 0;
    this.specValid = false;
    this.fluxHist = [];
    this.fluxPrev1 = this.fluxPrev2 = 0;
    this.prevO.fill(0);
    this.lastOnsetT = -1;
    this.lastPitch = null;
  }

  /** Push a block whose last sample occurred at time tEnd. Returns finished analysis frames. */
  push(block: Float32Array, tEnd: number): AnalysisFrame[] {
    const out: AnalysisFrame[] = [];
    const n = block.length;
    const g = this.cfg.gain;
    const mask = this.ring.length - 1;
    let pk = 0;
    for (let i = 0; i < n; i++) {
      const v = block[i] * g;
      this.ring[(this.written + i) & mask] = v;
      const a = v < 0 ? -v : v;
      if (a > pk) pk = a;
    }
    this.peak = Math.max(pk, this.peak * 0.995);
    // frames are emitted per HOP samples; assign time based on position inside block
    let consumed = 0;
    while (consumed < n) {
      const take = Math.min(HOP - this.sinceHop, n - consumed);
      consumed += take;
      this.sinceHop += take;
      this.written += take;
      if (this.sinceHop >= HOP) {
        this.sinceHop = 0;
        const t = tEnd - (n - consumed) / this.fs;
        this.tEnd = t;
        out.push(this.frame(t));
      }
    }
    return out;
  }

  private copyLast(len: number, dst: Float32Array, win?: Float32Array) {
    const mask = this.ring.length - 1;
    const start = this.written - len;
    for (let i = 0; i < len; i++) {
      const v = this.ring[(start + i) & mask];
      dst[i] = win ? v * win[i] : v;
    }
  }

  private spectrum(fft: FFT, win: Float32Array, len: number, mag: Float32Array) {
    const { re, im } = this;
    const r = re.subarray(0, len),
      m = im.subarray(0, len);
    this.copyLast(len, r, win);
    m.fill(0);
    fft.forward(r, m);
    let ws = 0;
    for (let i = 0; i < len; i++) ws += win[i];
    const s = 2 / ws;
    for (let i = 0; i <= len / 2; i++) mag[i] = Math.hypot(r[i], m[i]) * s;
  }

  private frame(t: number): AnalysisFrame {
    // RMS of last 1024
    const mask = this.ring.length - 1;
    let sum = 0;
    for (let i = 1; i <= ONS; i++) {
      const v = this.ring[(this.written - i) & mask];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / ONS);
    this.rms = rms;
    // noise floor tracker: follows minima, creeps up slowly
    if (rms < this.noise) this.noise = this.noise * 0.9 + rms * 0.1;
    else this.noise = Math.min(this.noise * 1.0015 + 1e-7, Math.max(rms, this.noise));
    const gate = rms > this.gateLevel;

    // onset STFT + flux
    this.spectrum(this.fftO, this.winO, ONS, this.magO);
    let flux = 0;
    const K = 200;
    const b0 = 3,
      b1 = Math.min(this.magO.length - 1, Math.floor((5000 * ONS) / this.fs));
    for (let i = b0; i <= b1; i++) {
      const d = Math.log1p(K * this.magO[i]) - Math.log1p(K * this.prevO[i]);
      if (d > 0) flux += d;
    }
    this.prevO.set(this.magO);

    // peak-pick with one-frame delay: candidate is fluxPrev1
    let onset = false;
    let onsetTime = 0;
    const hist = this.fluxHist;
    if (hist.length >= 8) {
      const sorted = [...hist].sort((a, b) => a - b);
      const med = sorted[sorted.length >> 1];
      const thr = Math.max(3.0, med * 2.4 + 1.5) / Math.max(0.3, this.cfg.onsetSens);
      const cand = this.fluxPrev1;
      if (cand > thr && cand >= this.fluxPrev2 && cand >= flux) {
        const tc = t - HOP / this.fs;
        const sinceOn = tc - this.lastOnsetT;
        const strongEnough = sinceOn > 0.3 || cand > this.lastOnsetFlux * 0.5;
        if (sinceOn > 0.1 && strongEnough && rms > this.gateLevel * 0.8) {
          onset = true;
          this.lastOnsetT = tc;
          this.lastOnsetFlux = cand;
          onsetTime = tc - ONSET_LAG;
        }
      }
    }
    hist.push(flux);
    if (hist.length > 30) hist.shift();
    this.fluxPrev2 = this.fluxPrev1;
    this.fluxPrev1 = flux;

    // heavy analysis every second hop
    if (this.hopIdx++ % 2 === 0) {
      if (rms > this.gateLevel * 0.7) {
        this.spectrum(this.fftL, this.winL, LONG, this.magL);
        this.spectrum(this.fftS, this.winS, SHORT, this.magS);
        this.specValid = true;
        this.specSerial++;
        this.copyLast(2048, this.pitchBuf);
        const p = this.mpm.detect(this.pitchBuf);
        if (p && p.clarity >= 0.75) {
          this.lastPitch = { freq: p.freq, midi: freqToMidi(p.freq, this.cfg.a4), clarity: p.clarity };
        } else this.lastPitch = null;
      } else {
        this.specValid = false;
        this.lastPitch = null;
      }
    }
    return { t, rms, gate, onset, onsetTime, flux, pitch: gate ? this.lastPitch : null };
  }

  private peakScore(mag: Float32Array, binHz: number, f: number): number {
    const tol = this.cfg.centsTol;
    const lo = f * Math.pow(2, -tol / 1200);
    const hi = f * Math.pow(2, tol / 1200);
    const nb = mag.length;
    let b0 = Math.max(2, Math.floor(lo / binHz)),
      b1 = Math.min(nb - 3, Math.ceil(hi / binHz));
    if (b1 < b0) return 0;
    let bi = b0,
      bv = -1;
    for (let i = b0; i <= b1; i++) {
      if (mag[i] > bv) {
        bv = mag[i];
        bi = i;
      }
    }
    if (!(mag[bi] >= mag[bi - 1] && mag[bi] >= mag[bi + 1])) return 0;
    const l = Math.log(mag[bi - 1] + 1e-12),
      c = Math.log(mag[bi] + 1e-12),
      r = Math.log(mag[bi + 1] + 1e-12);
    const den = l - 2 * c + r;
    const delta = den < 0 ? (0.5 * (l - r)) / den : 0;
    const pf = (bi + delta) * binHz;
    const cents = Math.abs(1200 * Math.log2(pf / f));
    if (cents > tol) return 0;
    // local floor: median of surrounding bins excluding the main lobe
    const W = Math.max(10, Math.round((0.14 * f) / binHz));
    const vals: number[] = [];
    for (let i = Math.max(1, bi - W); i <= Math.min(nb - 2, bi + W); i++) {
      if (Math.abs(i - bi) > 3) vals.push(mag[i]);
    }
    vals.sort((a, b) => a - b);
    const floor = vals.length ? vals[Math.floor(vals.length * 0.3)] : 1e-9;
    const prom = 20 * Math.log10((mag[bi] + 1e-12) / (floor + 1e-12));
    return Math.min(1, Math.max(0, (prom - 5) / 13));
  }

  /** Spectral presence score (0..1) for a single expected note. */
  noteScore(midi: number): number {
    if (!this.specValid) return 0;
    const f0 = midiToFreq(midi, this.cfg.a4);
    const binL = this.fs / LONG,
      binS = this.fs / SHORT;
    let num = 0,
      den = 0;
    const hs: number[] = [];
    for (let h = 1; h <= 4; h++) {
      const f = f0 * h;
      if (f > 3600 || f > this.fs / 2 - 100) break;
      const s = f < 330 ? this.peakScore(this.magL, binL, f) : this.peakScore(this.magS, binS, f);
      hs.push(s);
      num += HARM_W[h - 1] * s;
      den += HARM_W[h - 1];
    }
    if (!den) return 0;
    let score = num / den;
    // Fundamental missing -> only trust if harmonics 2 and 3 are both strong (guards octave-above confusion)
    if (hs[0] < 0.2 && hs.length >= 3 && Math.min(hs[1], hs[2]) < 0.5) score = Math.min(score, 0.3);
    return score;
  }

  /** Evaluate whether all targets are currently audible. */
  evaluate(targets: number[]): Evaluation {
    const scores: number[] = [];
    const present: boolean[] = [];
    const set = new Set(targets.map((m) => Math.round(m)));
    for (const m of targets) {
      let s = this.noteScore(m);
      // sub-octave penalty: an octave-lower note makes ours look present via shared harmonics
      if (s > 0 && !set.has(Math.round(m) - 12) && m - 12 >= 28) {
        const f = midiToFreq(m - 12, this.cfg.a4);
        const sub = this.peakScore(this.magL, this.fs / LONG, f);
        if (sub > 0.85) s *= 0.3;
      }
      scores.push(s);
    }
    if (targets.length === 1 && this.lastPitch && this.lastPitch.clarity >= 0.85) {
      const d = this.lastPitch.midi - targets[0];
      if (Math.abs(d) < 0.55) scores[0] = Math.max(scores[0], 0.9);
      else if (Math.abs(Math.round(d)) % 12 !== 0) scores[0] *= 0.25;
      else if (d < 0 && this.lastPitch.clarity >= 0.9) scores[0] *= 0.25; // clearly an octave below the target
    }
    let c = 0;
    for (const s of scores) {
      const ok = s >= this.cfg.presence;
      present.push(ok);
      if (ok) c++;
    }
    return { scores, present, frac: targets.length ? c / targets.length : 0, count: c };
  }
}
