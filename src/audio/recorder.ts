import { mic } from './mic';
import { idbPut } from '../core/storage';

export interface RecordingItem {
  id: string;
  name: string;
  ts: number;
  duration: number;
  songId?: string;
  blob: Blob;
  mime: string;
}

export class Recorder {
  private mr: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  duration = 0;

  get active() {
    return this.mr?.state === 'recording';
  }

  async start() {
    const stream = mic.getStream();
    if (!stream) throw new Error('Microphone is not active (simulated input cannot be recorded).');
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    this.mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : undefined);
    this.chunks = [];
    this.mr.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.mr.start(250);
    this.startedAt = performance.now();
  }

  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const mr = this.mr;
      if (!mr || mr.state === 'inactive') return resolve(null);
      mr.onstop = () => {
        this.duration = (performance.now() - this.startedAt) / 1000;
        resolve(new Blob(this.chunks, { type: mr.mimeType || 'audio/webm' }));
      };
      mr.stop();
    });
  }
}

export async function saveRecording(blob: Blob, name: string, songId?: string, duration?: number) {
  const item: RecordingItem = {
    id: `rec-${Date.now().toString(36)}`,
    name,
    ts: Date.now(),
    duration: duration ?? 0,
    songId,
    blob,
    mime: blob.type,
  };
  await idbPut('recordings', item);
  return item;
}
