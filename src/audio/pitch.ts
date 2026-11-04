import { FFT } from './fft';

export interface PitchResult {
  freq: number;
  clarity: number;
}

/**
 * McLeod Pitch Method (NSDF) using FFT autocorrelation.
 * Good for monophonic plucked strings; returns null when no clear pitch.
 */
export class MPM {
  private fft: FFT;
  private re: Float32Array;
  private im: Float32Array;
  private nsdf: Float32Array;
  constructor(private fs: number, private size = 2048) {
    this.fft = new FFT(size * 2);
    this.re = new Float32Array(size * 2);
    this.im = new Float32Array(size * 2);
    this.nsdf = new Float32Array(size);
  }
  detect(x: Float32Array, minFreq = 70, maxFreq = 1400, k = 0.92): PitchResult | null {
    const W = this.size;
    const { re, im, nsdf } = this;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < W; i++) re[i] = x[i];
    this.fft.forward(re, im);
    for (let i = 0; i < re.length; i++) {
      re[i] = re[i] * re[i] + im[i] * im[i];
      im[i] = 0;
    }
    this.fft.inverse(re, im);
    // m(tau) via cumulative squares
    let m = 0;
    for (let i = 0; i < W; i++) m += 2 * x[i] * x[i];
    const maxLag = Math.min(W - 1, Math.floor(this.fs / minFreq) + 2);
    const minLag = Math.max(2, Math.floor(this.fs / maxFreq) - 1);
    nsdf[0] = 1;
    for (let tau = 1; tau <= maxLag; tau++) {
      m -= x[tau - 1] * x[tau - 1] + x[W - tau] * x[W - tau];
      nsdf[tau] = m > 1e-12 ? (2 * re[tau]) / m : 0;
    }
    // Key maxima: highest peak between positive and negative zero crossings
    const maxima: number[] = [];
    let tau = 1;
    while (tau < maxLag && nsdf[tau] > 0) tau++; // skip first positive lobe
    while (tau < maxLag) {
      while (tau < maxLag && nsdf[tau] <= 0) tau++;
      let best = -1,
        bi = -1;
      while (tau < maxLag && nsdf[tau] > 0) {
        if (nsdf[tau] > best) {
          best = nsdf[tau];
          bi = tau;
        }
        tau++;
      }
      if (bi >= minLag && best > 0.3) maxima.push(bi);
    }
    if (!maxima.length) return null;
    let top = 0;
    for (const p of maxima) top = Math.max(top, nsdf[p]);
    const thr = k * top;
    let pick = maxima[0];
    for (const p of maxima) {
      if (nsdf[p] >= thr) {
        pick = p;
        break;
      }
    }
    // parabolic interpolation
    const a = nsdf[pick - 1],
      b = nsdf[pick],
      c = nsdf[pick + 1] ?? b;
    const d = a - 2 * b + c;
    const shift = d !== 0 ? (0.5 * (a - c)) / d : 0;
    const lag = pick + shift;
    const clarity = b - 0.25 * (a - c) * shift;
    if (lag <= 0) return null;
    return { freq: this.fs / lag, clarity: Math.min(1, clarity) };
  }
}
