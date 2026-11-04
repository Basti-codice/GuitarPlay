/** Small in-place radix-2 complex FFT with cached twiddles. */
export class FFT {
  readonly n: number;
  private cos: Float32Array;
  private sin: Float32Array;
  private rev: Uint32Array;
  constructor(n: number) {
    if ((n & (n - 1)) !== 0) throw new Error('FFT size must be power of two');
    this.n = n;
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }
  }
  /** Forward transform. Inverse: use `inverse`. */
  forward(re: Float32Array, im: Float32Array) {
    this.run(re, im, false);
  }
  inverse(re: Float32Array, im: Float32Array) {
    this.run(re, im, true);
    const n = this.n;
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
  private run(re: Float32Array, im: Float32Array, inv: boolean) {
    const n = this.n,
      rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    const sgn = inv ? -1 : 1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1,
        step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = this.cos[k],
            wi = sgn * this.sin[k];
          const a = i + j,
            b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }
}

export function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}
