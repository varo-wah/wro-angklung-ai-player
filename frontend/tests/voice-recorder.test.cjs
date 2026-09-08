const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('cancel during microphone permission request stops tracks returned later', async () => {
  let grant, stopped = 0;
  const pending = new Promise(resolve => { grant = resolve; });
  const { BrowserVoiceRecorder } = load('src/lib/voice.ts', {
    navigator: { mediaDevices: { getUserMedia: () => pending } },
    window: { AudioContext: class {} }, DOMException,
  });
  const recorder = new BrowserVoiceRecorder();
  const result = recorder.recordUntilSilence();
  recorder.cancel();
  grant({ getTracks: () => [{ stop() { stopped++; } }] });
  await assert.rejects(result, error => error.code === 'cancelled');
  assert.equal(stopped, 1);
});

test('audio initialization failure releases an acquired microphone', async () => {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  const { BrowserVoiceRecorder } = load('src/lib/voice.ts', {
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    window: { AudioContext: class { constructor() { throw new Error('Audio unavailable'); } } }, DOMException,
  });
  await assert.rejects(new BrowserVoiceRecorder().recordUntilSilence(), /Audio unavailable/);
  assert.equal(stopped, 1);
});

test('recording captures PCM directly as a Safari-compatible WAV', async () => {
  let processor;
  let stopped = 0;
  const track = { onended: null, stop() { stopped++; } };
  const stream = { getTracks: () => [track] };
  class Context {
    constructor() { this.state = 'running'; this.sampleRate = 16000; this.destination = {}; }
    async resume() {}
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 0, getFloatTimeDomainData(samples) { samples.fill(0.1); } }; }
    createScriptProcessor() {
      processor = { connect() {}, disconnect() {}, onaudioprocess: null };
      return processor;
    }
    async close() { this.state = 'closed'; }
  }
  const fakeWindow = {
    AudioContext: Context,
    clearInterval() {},
    setInterval(callback) { callback(); return 1; },
  };
  const { BrowserVoiceRecorder } = load('src/lib/voice.ts', {
    Blob,
    DOMException,
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    performance: { now: () => 0 },
    window: fakeWindow,
  });

  const recorder = new BrowserVoiceRecorder();
  const recording = recorder.recordUntilSilence();
  await new Promise(resolve => setTimeout(resolve, 0));
  processor.onaudioprocess({
    inputBuffer: { getChannelData: () => new Float32Array([0.25, -0.25, 0.5, -0.5]) },
    outputBuffer: { getChannelData: () => new Float32Array(4) },
  });
  recorder.stop();
  const blob = await recording;
  assert.equal(blob.type, 'audio/wav');
  assert.equal(blob.size, 52);
  assert.equal(Buffer.from(await blob.arrayBuffer()).subarray(0, 4).toString(), 'RIFF');
  assert.equal(stopped, 1);
});
