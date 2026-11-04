// Generates a looping test WAV (plucked A2 / D3 / G3 …) for Chrome's fake microphone.
import { writeFileSync } from 'node:fs';
import { renderPluck } from '../src/audio/ksynth.ts';
const fs = 48000;
// "45,50" = two single notes; "48+52+55+60+64" = one strummed chord. Each event gets 2 s.
const events = (process.argv[3] ?? '45').split(',').map((e) => e.split('+').map(Number));
const out = new Float32Array(Math.floor(fs * 2 * events.length));
events.forEach((ms, i) => {
  ms.forEach((m, k) => {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const note = renderPluck(f, 1.9 - k * 0.015, fs, { amp: 0.5 / Math.sqrt(ms.length), seed: m });
    const off = i * fs * 2 + Math.floor(k * 0.014 * fs);
    for (let j = 0; j < note.length && off + j < out.length; j++) out[off + j] += note[j];
  });
});
const buf = Buffer.alloc(44 + out.length * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + out.length * 2, 4); buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(fs, 24); buf.writeUInt32LE(fs * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(out.length * 2, 40);
out.forEach((v, i) => buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
writeFileSync(process.argv[2], buf);
console.log('wrote', process.argv[2]);
