// Collects raw microphone samples into 512-sample chunks and forwards them to the main thread
// together with the AudioContext time of the last sample in the chunk.
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(512);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === 512) {
        const tEnd = currentTime + (i + 1) / sampleRate;
        const out = this.buf;
        this.port.postMessage({ samples: out, tEnd }, [out.buffer]);
        this.buf = new Float32Array(512);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('mic-processor', MicProcessor);
