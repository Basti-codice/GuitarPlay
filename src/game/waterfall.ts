import { STRING_COLORS, tuningLabels } from '../core/music';
import type { PlaySession } from './session';
import type { Grade } from './judge';

const GRADE_COLOR: Record<Grade, string> = { perfect: '#7CFFB2', good: '#6FD3FF', ok: '#FFD66B', wrong: '#FF8A5B', miss: '#FF5D73' };
const GRADE_LABEL: Record<Grade, string> = { perfect: 'PERFECT', good: 'GOOD', ok: 'OK', wrong: 'WRONG NOTE', miss: 'MISS' };

interface Popup {
  text: string;
  color: string;
  t: number;
  x: number;
}
interface Ring {
  x: number;
  color: string;
  t: number;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export class Waterfall {
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private popups: Popup[] = [];
  private rings: Ring[] = [];
  private seenFx = 0;
  private padGlow = [0, 0, 0, 0, 0, 0];

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  reset() {
    this.seenFx = 0;
    this.popups = [];
    this.rings = [];
  }

  draw(s: PlaySession, lookahead: number, leftHanded: boolean, showLabels = true) {
    const g = this.g;
    const { w, h } = this;
    if (!w || !h) return;
    const now = s.playTime();
    const laneAreaW = Math.min(w - 24, 760);
    const laneW = laneAreaW / 6;
    const x0 = (w - laneAreaW) / 2;
    const hitY = h - 88;
    const pxPerSec = hitY / lookahead;
    const yOf = (p: number) => hitY - (p - now) * pxPerSec;
    const laneX = (str: number) => x0 + (leftHanded ? 5 - str : str) * laneW;

    // background
    g.clearRect(0, 0, w, h);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b0c12');
    bg.addColorStop(1, '#14161f');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // lanes
    for (let i = 0; i < 6; i++) {
      const x = x0 + i * laneW;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)';
      g.fillRect(x, 0, laneW, h);
    }
    // string lines
    for (let i = 0; i < 6; i++) {
      const strIdx = leftHanded ? 5 - i : i;
      const x = x0 + (i + 0.5) * laneW;
      g.strokeStyle = STRING_COLORS[strIdx] + '40';
      g.lineWidth = 1 + (5 - strIdx) * -0.0 + (strIdx < 3 ? 1 : 0);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    // beat + bar lines
    const sp = s.speed;
    const tl = s.tl;
    const bpb = s.beatStep;
    const bl = (s.song.beatsPerBar * 4) / s.song.beatUnit;
    const pickup = s.song.pickup ?? 0;
    const bFrom = Math.floor(tl.toBeat(Math.max(0, now - 0.6) * sp) / bpb) * bpb - bpb;
    const bTo = tl.toBeat((now + lookahead + 0.2) * sp);
    g.font = '600 11px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
    for (let b = bFrom; b <= bTo; b += bpb) {
      if (b < -4) continue;
      const y = yOf(tl.toSec(b) / sp);
      if (y < -10 || y > h) continue;
      const idx = Math.round((b - pickup) / bl);
      const isBar = Math.abs(b - pickup - idx * bl) < 1e-6 && b >= pickup - 1e-6;
      g.strokeStyle = isBar ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.07)';
      g.lineWidth = isBar ? 1.5 : 1;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0 + laneAreaW, y);
      g.stroke();
      if (isBar && showLabels) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.textAlign = 'right';
        g.fillText(String(idx + 1), x0 - 8, y + 4);
      }
    }
    // loop region
    if (s.loop) {
      for (const lb of [s.loop.startBeat, s.loop.endBeat]) {
        const y = yOf(tl.toSec(lb) / sp);
        g.strokeStyle = '#ffb347';
        g.setLineDash([6, 5]);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0, y);
        g.lineTo(x0 + laneAreaW, y);
        g.stroke();
        g.setLineDash([]);
      }
    }

    // events
    const evs = s.track.events;
    const secPerBeat = 60 / s.song.bpm / sp;
    const gemH = Math.min(36, laneW * 0.5);
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      const pe = tl.toSec(ev.beat) / sp;
      const durSec = Math.max(0.1, (tl.toSec(ev.beat + ev.dur) - tl.toSec(ev.beat)) / sp);
      const y = yOf(pe);
      const yEnd = yOf(pe + durSec);
      if (y < -60 || yEnd > h + 40) continue;
      if (y > hitY + 140 && yEnd > hitY + 140) continue;
      const res = s.results.get(i);
      const hit = res && res.grade !== 'miss' && res.grade !== 'wrong';
      if (hit) continue;
      const failed = !!res;
      const past = pe < now - 0.25 && !res && s.mode !== 'listen' && !s.holding;
      const alpha = failed || past ? 0.45 : 1;
      const live = ev.notes.filter((n) => !n.dead);
      // chord bar behind gems
      if (live.length > 1) {
        const xs = live.map((n) => laneX(n.string));
        const xa = Math.min(...xs) + laneW * 0.14,
          xb = Math.max(...xs) + laneW * 0.86;
        g.globalAlpha = alpha * 0.25;
        g.fillStyle = '#fff';
        rr(g, xa, y - gemH / 2 - 3, xb - xa, gemH + 6, 10);
        g.fill();
        g.globalAlpha = alpha;
        // label
        if (ev.chord) {
          g.font = '700 13px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
          const tw = g.measureText(ev.chord).width + 16;
          const cx = (xa + xb) / 2;
          g.fillStyle = 'rgba(20,22,32,0.92)';
          rr(g, cx - tw / 2, y - gemH / 2 - 26, tw, 20, 10);
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.25)';
          g.lineWidth = 1;
          g.stroke();
          g.fillStyle = '#fff';
          g.textAlign = 'center';
          g.fillText(ev.chord, cx, y - gemH / 2 - 11);
        }
        if (ev.strum) {
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.font = '700 15px system-ui';
          g.textAlign = 'center';
          g.fillText(ev.strum === 'd' ? '↓' : '↑', xa - 12, y + 5);
        }
      } else if (ev.chord && live.length === 1) {
        const x = laneX(live[0].string) + laneW / 2;
        g.font = '700 12px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
        const tw = g.measureText(ev.chord).width + 14;
        g.globalAlpha = alpha * 0.9;
        g.fillStyle = 'rgba(20,22,32,0.92)';
        rr(g, x - tw / 2, y - gemH / 2 - 24, tw, 18, 9);
        g.fill();
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.fillText(ev.chord, x, y - gemH / 2 - 11);
      }
      for (const n of live) {
        const lx = laneX(n.string);
        const cx = lx + laneW / 2;
        const color = failed ? (res!.grade === 'wrong' ? '#ff8a5b' : '#7b7f90') : STRING_COLORS[n.string];
        g.globalAlpha = alpha;
        // sustain tail
        if (ev.dur * secPerBeat * sp > 0.55 || yEnd < y - gemH * 1.6) {
          const ty = Math.min(yEnd, y - gemH);
          g.fillStyle = color + '55';
          rr(g, cx - laneW * 0.11, ty, laneW * 0.22, y - ty, 6);
          g.fill();
        }
        const gw = laneW * 0.74;
        const x = cx - gw / 2;
        const grad = g.createLinearGradient(x, y - gemH / 2, x, y + gemH / 2);
        grad.addColorStop(0, color);
        grad.addColorStop(1, shade(color, -0.35));
        g.shadowColor = color;
        g.shadowBlur = failed ? 0 : 14;
        g.fillStyle = grad;
        rr(g, x, y - gemH / 2, gw, gemH, gemH / 2.6);
        g.fill();
        g.shadowBlur = 0;
        if (ev.legato || n.tech?.includes('h') || n.tech?.includes('p')) {
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.setLineDash([4, 3]);
          rr(g, x + 2, y - gemH / 2 + 2, gw - 4, gemH - 4, gemH / 3);
          g.stroke();
          g.setLineDash([]);
        }
        g.fillStyle = failed ? '#d7d9e2' : '#10121a';
        g.font = `800 ${Math.round(gemH * 0.58)}px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(n.dead ? '×' : String(n.fret), cx, y + 1);
        g.textBaseline = 'alphabetic';
        if (n.tech && n.tech.length) {
          g.font = '700 11px system-ui';
          g.fillStyle = '#fff';
          g.textAlign = 'left';
          g.fillText(n.tech.filter((t) => ['h', 'p', 's', 'b', 'v', 'pm'].includes(t)).join(' '), x + gw + 2, y - gemH / 2 + 8);
        }
        if (res?.grade === 'wrong' && res.detected != null) {
          g.fillStyle = '#ffb59a';
          g.font = '700 11px system-ui';
          g.textAlign = 'center';
          g.fillText('✕', cx, y - gemH / 2 - 4);
        }
        g.globalAlpha = 1;
      }
    }

    // hit line + pads
    const glow = g.createLinearGradient(0, hitY - 40, 0, hitY + 8);
    glow.addColorStop(0, 'rgba(255,179,71,0)');
    glow.addColorStop(1, 'rgba(255,179,71,0.18)');
    g.fillStyle = glow;
    g.fillRect(x0, hitY - 40, laneAreaW, 48);
    g.strokeStyle = 'rgba(255,179,71,0.9)';
    g.lineWidth = 2.5;
    g.shadowColor = '#ffb347';
    g.shadowBlur = 12;
    g.beginPath();
    g.moveTo(x0, hitY);
    g.lineTo(x0 + laneAreaW, hitY);
    g.stroke();
    g.shadowBlur = 0;
    const labels = tuningLabels(s.song.tuning);
    for (let i = 0; i < 6; i++) {
      const strIdx = leftHanded ? 5 - i : i;
      const cx = x0 + (i + 0.5) * laneW;
      this.padGlow[strIdx] *= 0.9;
      const glowV = this.padGlow[strIdx];
      g.fillStyle = STRING_COLORS[strIdx] + (glowV > 0.2 ? 'ff' : '33');
      g.beginPath();
      g.arc(cx, hitY + 34, 17 + glowV * 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = STRING_COLORS[strIdx];
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = glowV > 0.2 ? '#10121a' : '#fff';
      g.font = '800 15px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(labels[strIdx], cx, hitY + 35);
      g.textBaseline = 'alphabetic';
    }

    // new result fx
    while (this.seenFx < s.fx.length) {
      const f = s.fx[this.seenFx++];
      const ev = evs[f.eventIndex];
      if (!ev) continue;
      const col = GRADE_COLOR[f.grade];
      const strs = ev.notes.filter((n) => !n.dead).map((n) => n.string);
      for (const st of strs) {
        if (f.grade !== 'miss' && f.grade !== 'wrong') {
          this.padGlow[st] = 1;
          this.rings.push({ x: laneX(st) + laneW / 2, color: STRING_COLORS[st], t: performance.now() });
        }
      }
      const cx = strs.length ? strs.reduce((a, st) => a + laneX(st) + laneW / 2, 0) / strs.length : w / 2;
      this.popups.push({ text: GRADE_LABEL[f.grade], color: col, t: performance.now(), x: cx });
    }
    const nowMs = performance.now();
    this.rings = this.rings.filter((r) => nowMs - r.t < 500);
    for (const r of this.rings) {
      const k = (nowMs - r.t) / 500;
      g.strokeStyle = r.color;
      g.globalAlpha = 1 - k;
      g.lineWidth = 4 * (1 - k) + 1;
      g.beginPath();
      g.arc(r.x, hitY + 34, 18 + k * 46, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    this.popups = this.popups.filter((p) => nowMs - p.t < 800);
    for (const p of this.popups) {
      const k = (nowMs - p.t) / 800;
      g.globalAlpha = 1 - k * k;
      g.fillStyle = p.color;
      g.font = '800 17px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'center';
      g.shadowColor = p.color;
      g.shadowBlur = 10;
      g.fillText(p.text, p.x, hitY - 52 - k * 38);
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  let r = (n >> 16) & 255,
    gg = (n >> 8) & 255,
    b = n & 255;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + c * amt)));
  r = f(r);
  gg = f(gg);
  b = f(b);
  return `#${((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1)}`;
}
