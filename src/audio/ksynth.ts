/**
 * Karplus-Strong plucked-string synthesis with fractional delay tuning.
 * Used for the reference/“listen” playback and for test signals.
 */
export interface PluckOpts {
  /** 0..1, higher = brighter attack. */
  bright?: number;
  /** pick position 0..1 along the string */
  pos?: number;
  /** decay time (T60 seconds) override */
  t60?: number;
  seed?: number;
  amp?: number;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderPluck(freq: number, seconds: number, fs: number, o: PluckOpts = {}): Float32Array {
  const total = Math.max(1, Math.floor(seconds * fs));
  const out = new Float32Array(total);
  const rnd = mulberry32(o.seed ?? Math.floor(freq * 1000));
  const bright = o.bright ?? 0.55;
  const D = fs / freq;
  const L = Math.max(2, Math.floor(D - 0.5 - 0.1));
  const d = D - 0.5 - L; // 0.1..1.1
  const C = (1 - d) / (1 + d);
  const buf = new Float32Array(L);
  // excitation: lowpassed noise, then pick-position comb
  let lp = 0;
  const a = 0.15 + 0.8 * bright;
  const exc = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    const nz = rnd() * 2 - 1;
    lp += a * (nz - lp);
    exc[i] = lp;
  }
  const pp = Math.max(1, Math.floor(L * (o.pos ?? 0.18)));
  let mean = 0;
  for (let i = 0; i < L; i++) {
    buf[i] = exc[i] - (i >= pp ? exc[i - pp] : 0) * 0.9;
    mean += buf[i];
  }
  mean /= L;
  let peak = 0;
  for (let i = 0; i < L; i++) {
    buf[i] -= mean;
    peak = Math.max(peak, Math.abs(buf[i]));
  }
  const g = (o.amp ?? 0.6) / (peak || 1);
  for (let i = 0; i < L; i++) buf[i] *= g;
  const t60 = o.t60 ?? Math.max(0.8, 5.5 - Math.log2(freq / 82.4) * 1.1);
  const loss = Math.pow(10, -3 / (t60 * freq));
  let idx = 0,
    prev = 0,
    apX = 0,
    apY = 0;
  for (let n = 0; n < total; n++) {
    const cur = buf[idx];
    out[n] = cur;
    const avg = 0.5 * (cur + prev) * loss;
    prev = cur;
    const y = C * avg + apX - C * apY;
    apX = avg;
    apY = y;
    buf[idx] = y;
    idx++;
    if (idx >= L) idx = 0;
  }
  // short fade at the end to avoid clicks
  const fade = Math.min(total, Math.floor(0.02 * fs));
  for (let i = 0; i < fade; i++) out[total - 1 - i] *= i / fade;
  return out;
}
