import { Analyzer, type AnalysisFrame } from './analyzer';
import { getCtx } from './engine';
import { getSettings, subscribeSettings } from '../core/settings';

export type MicState = 'off' | 'starting' | 'on' | 'error';
type FrameCb = (f: AnalysisFrame, an: Analyzer) => void;

/**
 * Microphone input singleton. Audio flows
 *   getUserMedia -> AudioWorklet (512-sample chunks) -> Analyzer -> frame listeners.
 * A simulated input (for demos/tests) feeds the very same worklet.
 */
class MicInput {
  state: MicState = 'off';
  error = '';
  analyzer: Analyzer | null = null;
  devices: MediaDeviceInfo[] = [];
  deviceLabel = '';
  /** most recent frame (for UI meters) */
  last: AnalysisFrame | null = null;
  /** audio-graph node that simulated sources connect to */
  simIn: GainNode | null = null;
  simulated = false;
  private node: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private listeners = new Set<FrameCb>();
  private stateListeners = new Set<() => void>();
  private loaded = false;
  private starting: Promise<void> | null = null;

  constructor() {
    subscribeSettings(() => this.applySettings());
  }

  private setState(s: MicState, err = '') {
    this.state = s;
    this.error = err;
    this.stateListeners.forEach((l) => l());
  }
  subscribeState(fn: () => void) {
    this.stateListeners.add(fn);
    return () => void this.stateListeners.delete(fn);
  }
  onFrame(cb: FrameCb) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  applySettings() {
    const s = getSettings();
    if (this.analyzer) {
      this.analyzer.cfg.gain = s.inputGain;
      this.analyzer.cfg.a4 = s.a4;
      this.analyzer.cfg.minGate = s.micGate;
      this.analyzer.cfg.onsetSens = s.sensitivity;
    }
  }

  async refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      this.devices = all.filter((d) => d.kind === 'audioinput');
      this.stateListeners.forEach((l) => l());
    } catch {
      /* ignore */
    }
  }

  private async setupWorklet(c: AudioContext) {
    if (!this.loaded) {
      await c.audioWorklet.addModule(`${import.meta.env.BASE_URL}mic-worklet.js`);
      this.loaded = true;
    }
    if (this.node) {
      this.node.disconnect();
      this.node.port.onmessage = null;
    }
    this.analyzer = new Analyzer(c.sampleRate);
    this.applySettings();
    this.node = new AudioWorkletNode(c, 'mic-processor', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    this.node.port.onmessage = (e: MessageEvent<{ samples: Float32Array; tEnd: number }>) => {
      const an = this.analyzer;
      if (!an) return;
      const lat = 0; // latency is handled via settings.latencyMs in the session clock
      const frames = an.push(e.data.samples, e.data.tEnd + lat);
      for (const f of frames) {
        this.last = f;
        this.listeners.forEach((l) => l(f, an));
      }
    };
    const mute = c.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(c.destination);
  }

  /** Start the real microphone. Must be called from a user gesture the first time. */
  start(): Promise<void> {
    if (this.state === 'on' && !this.simulated) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = this.doStart().finally(() => (this.starting = null));
    return this.starting;
  }

  private async doStart() {
    this.setState('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access needs a secure context (localhost or https).');
      const c = getCtx();
      const s = getSettings();
      this.stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: s.deviceId ? { exact: s.deviceId } : undefined,
          echoCancellation: s.echoCancel,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      this.stream = stream;
      this.deviceLabel = stream.getAudioTracks()[0]?.label ?? '';
      await this.setupWorklet(c);
      this.src = c.createMediaStreamSource(stream);
      this.src.connect(this.node!);
      this.simulated = false;
      await this.refreshDevices();
      this.setState('on');
    } catch (e) {
      const err = e as DOMException;
      let msg = err.message || String(e);
      if (err.name === 'NotAllowedError') msg = 'Microphone permission was denied. Allow it in the browser address bar and try again.';
      if (err.name === 'NotFoundError') msg = 'No microphone found. Plug one in and try again.';
      if (err.name === 'OverconstrainedError') {
        updateDeviceFallback();
        msg = 'The selected input device is not available. Pick another one in Settings.';
      }
      this.setState('error', msg);
    }
  }

  /** Feed the analyser from an in-app synthetic “guitar” instead of a microphone. */
  async startSimulated(): Promise<GainNode> {
    const c = getCtx();
    this.stopStream();
    await this.setupWorklet(c);
    this.simIn = c.createGain();
    this.simIn.connect(this.node!);
    this.simulated = true;
    this.setState('on');
    return this.simIn;
  }

  private stopStream() {
    this.src?.disconnect();
    this.src = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  stop() {
    this.stopStream();
    this.node?.disconnect();
    this.node = null;
    this.setState('off');
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  get level(): number {
    return this.analyzer?.rms ?? 0;
  }
}

function updateDeviceFallback() {
  void import('../core/settings').then((m) => m.updateSettings({ deviceId: '' }));
}

export const mic = new MicInput();
