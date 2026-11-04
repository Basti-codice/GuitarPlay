import type { TabNote } from '../core/types';

export interface FretOpts {
  tuning: number[];
  capo?: number;
  maxFret?: number;
  minFret?: number;
}

interface Cand {
  string: number;
  fret: number;
}

function candidates(midi: number, o: FretOpts): Cand[] {
  const out: Cand[] = [];
  const capo = o.capo ?? 0;
  const maxF = o.maxFret ?? 15;
  const minF = o.minFret ?? 0;
  for (let s = 0; s < o.tuning.length; s++) {
    const f = midi - o.tuning[s] - capo;
    if (f >= minF && f <= maxF) out.push({ string: s, fret: f });
  }
  return out;
}

/** Choose octave shift so a melody sits comfortably on the guitar. */
export function fitOctave(midis: number[], tuning: number[], capo = 0): number {
  if (!midis.length) return 0;
  const lo = tuning[0] + capo;
  const hi = tuning[5] + capo + 17;
  const sorted = [...midis].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  let best = 0,
    bestCost = Infinity;
  for (let k = -36; k <= 36; k += 12) {
    const mn = sorted[0] + k,
      mx = sorted[sorted.length - 1] + k;
    let cost = Math.abs(med + k - (tuning[3] + capo + 6)) * 0.5;
    if (mn < lo) cost += (lo - mn) * 20;
    if (mx > hi) cost += (mx - hi) * 20;
    if (cost < bestCost) {
      bestCost = cost;
      best = k;
    }
  }
  return best;
}

/** Viterbi auto-fretting for a monophonic line (low hand movement, low positions). */
export function fretLine(midis: number[], o: FretOpts): (Cand | null)[] {
  const cands = midis.map((m) => candidates(m, o));
  const n = midis.length;
  const cost: number[][] = [];
  const back: number[][] = [];
  const unit = (c: Cand) => c.fret * 0.12 + (c.fret > 7 ? (c.fret - 7) * 0.35 : 0) + (c.fret > 0 ? 0 : -0.15);
  for (let i = 0; i < n; i++) {
    cost.push(new Array(cands[i].length).fill(Infinity));
    back.push(new Array(cands[i].length).fill(-1));
    for (let j = 0; j < cands[i].length; j++) {
      const c = cands[i][j];
      if (i === 0) {
        cost[i][j] = unit(c);
        continue;
      }
      let bestC = Infinity,
        bk = -1;
      for (let k = 0; k < cands[i - 1].length; k++) {
        const p = cands[i - 1][k];
        const move = c.fret > 0 && p.fret > 0 ? Math.abs(c.fret - p.fret) * 0.6 : c.fret > 0 || p.fret > 0 ? 0.25 : 0;
        const strJump = Math.abs(c.string - p.string) * 0.12;
        const v = cost[i - 1][k] + move + strJump + unit(c);
        if (v < bestC) {
          bestC = v;
          bk = k;
        }
      }
      cost[i][j] = bestC;
      back[i][j] = bk;
    }
  }
  const res: (Cand | null)[] = new Array(n).fill(null);
  // handle unreachable notes by segmenting: pick best at end that is finite
  let j = -1,
    bv = Infinity;
  const last = n - 1;
  if (last >= 0) {
    cost[last].forEach((v, idx) => {
      if (v < bv) {
        bv = v;
        j = idx;
      }
    });
    for (let i = last; i >= 0 && j >= 0; i--) {
      res[i] = cands[i][j];
      j = back[i][j];
    }
  }
  return res;
}

/** Fret a group of simultaneous notes onto distinct strings. */
export function fretChord(midis: number[], o: FretOpts): TabNote[] {
  const sorted = [...midis].sort((a, b) => a - b);
  const out: TabNote[] = [];
  const used = new Set<number>();
  // assign from the lowest pitch up, preferring low frets
  for (const m of sorted) {
    const cs = candidates(m, o)
      .filter((c) => !used.has(c.string))
      .sort((a, b) => a.fret - b.fret);
    if (cs.length) {
      used.add(cs[0].string);
      out.push({ string: cs[0].string, fret: cs[0].fret });
    }
  }
  return out;
}
