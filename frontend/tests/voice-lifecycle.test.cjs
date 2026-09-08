const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const load = require('./load-typescript.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function harness({ stored = false, permission } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3000' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const events = [];
  const recording = deferred(), transcription = deferred(), response = deferred();
  let speechCallbacks;
  const navigator = { mediaDevices: { getUserMedia: () => permission?.promise ?? Promise.resolve({
    getTracks: () => [{ stop() { events.push('permission-mic-stop'); } }],
  }) } };
  if (stored) dom.window.localStorage.setItem('angklobot.wakeword.enabled', 'true');
  const instances = [];
  class Client {
    constructor(onWake, onError) { this.onWake = onWake; this.onError = onError; instances.push(this); }
    async arm() { events.push('arm'); }
    async suspend() { events.push('suspend'); }
    async disable() { events.push('disable'); this.close(); }
    close() { events.push('close'); }
  }
  class VoiceCaptureError extends Error {}
  const voice = {
    VoiceCaptureError,
    BrowserVoiceRecorder: class {
      recordUntilSilence() { events.push('record'); return recording.promise; }
      cancel() { events.push('cancel'); recording.resolve(new Blob()); }
    },
    transcribeVoiceRecording: (blob, language) => { events.push(`transcribe:${language}`); return transcription.promise; },
    stopSpeaking: () => events.push('tts-stop'),
    speakVoiceResponse: (text, language, callbacks) => { events.push(`tts:${language}`); speechCallbacks = callbacks; return {}; },
  };
  const globals = { window: dom.window, navigator, process, AbortController, Blob };
  const wake = load('src/hooks/useWakeWord.ts', globals, { '@/lib/wakeWord': { WhisperWakeListener: Client } });
  const { useVoiceAssistant } = load('src/hooks/useVoiceAssistant.ts', globals, {
    '@/hooks/useWakeWord': wake, '@/lib/voice': voice,
  });
  let api;
  function App() {
    api = useVoiceAssistant({
      onAfterResponse: async () => { events.push('after-response'); },
      onBeforeListen: () => {},
      onWakeDetected: async () => { events.push('wake-greeting'); },
      onTranscript: text => { events.push(`ai:${text}`); return response.promise; },
    });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(App))));
  return { get api() { return api; }, events, recording, transcription, response, instances,
    endSpeech: () => speechCallbacks.onEnd(),
    cleanup: async () => { await React.act(async () => root.unmount()); dom.window.close(); },
  };
}

test('real React Strict Mode: explicit enable, one command, TTS pause, rearm, cleanup', async () => {
  const h = await harness({ stored: true });
  try {
    assert.equal(h.api.wakeWord.enabled, false);
    assert.equal(h.api.wakeWord.remembered, true);
    assert.equal(h.instances.length, 0, 'reload must not open microphone or service');
    await React.act(async () => h.api.wakeWord.enable());
    assert.equal(h.api.wakeWord.status, 'Listening for “Hey Angklobot”');
    assert(h.events.indexOf('permission-mic-stop') < h.events.indexOf('arm'));
    await React.act(async () => { h.instances[0].onWake(); await sleep(300); });
    assert.equal(h.api.state, 'listening');
    assert(h.events.indexOf('wake-greeting') < h.events.indexOf('record'));
    assert(h.events.indexOf('suspend') < h.events.indexOf('record'));
    await React.act(async () => h.recording.resolve(new Blob()));
    assert.equal(h.api.state, 'transcribing');
    await React.act(async () => h.transcription.resolve('What songs can you play?'));
    assert.equal(h.api.state, 'thinking');
    await React.act(async () => h.response.resolve('Here are the available songs.'));
    assert.equal(h.api.state, 'speaking', 'must suspend before delayed browser onstart');
    await React.act(async () => sleep(550));
    assert.equal(h.events.filter(e => e === 'arm').length, 1, 'no rearm during TTS');
    await React.act(async () => h.endSpeech());
    await React.act(async () => sleep(550));
    assert.equal(h.api.wakeWord.status, 'Listening for “Hey Angklobot”');
    assert.equal(h.events.filter(e => e === 'record').length, 1);
    assert.equal(h.events.filter(e => e.startsWith('ai:')).length, 1);
    assert.equal(h.events.filter(e => e.startsWith('tts:')).length, 1);
    assert(h.events.indexOf('tts:en') < h.events.indexOf('after-response'), 'playback callback must wait for TTS to finish');
    await React.act(async () => h.api.wakeWord.disable());
    assert.equal(h.api.wakeWord.enabled, false);
    const arms = h.events.filter(e => e === 'arm').length;
    await React.act(async () => sleep(550));
    assert.equal(h.events.filter(e => e === 'arm').length, arms);
  } finally { await h.cleanup(); }
});

test('disable while permission pending releases a late microphone and never arms', async () => {
  const permission = deferred();
  const h = await harness({ permission });
  try {
    let enabling;
    await React.act(async () => { enabling = h.api.wakeWord.enable(); await Promise.resolve(); });
    await React.act(async () => h.api.wakeWord.disable());
    let stopped = false;
    await React.act(async () => {
      permission.resolve({ getTracks: () => [{ stop() { stopped = true; } }] });
      await enabling;
    });
    assert.equal(stopped, true);
    assert.equal(h.events.includes('arm'), false);
    assert.equal(h.api.wakeWord.enabled, false);
  } finally { await h.cleanup(); }
});

test('manual Mic still works with wake off and preserves Indonesian commands', async () => {
  const h = await harness();
  try {
    await React.act(async () => h.api.setLanguage('id'));
    let completion;
    await React.act(async () => { completion = h.api.startListening(); });
    await React.act(async () => h.recording.resolve(new Blob()));
    await React.act(async () => h.transcription.resolve('Lagu apa yang bisa kamu mainkan?'));
    await React.act(async () => { h.response.resolve('Ini daftar lagunya.'); await completion; });
    assert.equal(h.instances.length, 0);
    assert(h.events.includes('transcribe:id'));
    assert(h.events.includes('tts:id'));
  } finally { await h.cleanup(); }
});

test('manual Mic during enable waits until the temporary permission stream is closed', async () => {
  const permission = deferred();
  const h = await harness({ permission });
  try {
    let enabling, capturing;
    await React.act(async () => { enabling = h.api.wakeWord.enable(); });
    await React.act(async () => { capturing = h.api.startListening(); });
    assert.equal(h.events.includes('record'), false);
    await React.act(async () => {
      permission.resolve({ getTracks: () => [{ stop() { h.events.push('late-permission-stop'); } }] });
      await enabling;
    });
    assert(h.events.indexOf('late-permission-stop') < h.events.indexOf('record'));
    assert.equal(h.events.includes('arm'), false);
    await React.act(async () => h.api.cancelListening());
    await capturing;
  } finally { await h.cleanup(); }
});

test('muted response rearms without waiting for a speech callback', async () => {
  const h = await harness();
  try {
    await React.act(async () => h.api.setMuted(true));
    await React.act(async () => h.api.wakeWord.enable());
    await React.act(async () => { h.instances[0].onWake(); await sleep(300); });
    await React.act(async () => h.recording.resolve(new Blob()));
    await React.act(async () => h.transcription.resolve('Hello'));
    await React.act(async () => h.response.resolve('Hello from Angklobot'));
    await React.act(async () => sleep(550));
    assert.equal(h.events.some(e => e.startsWith('tts:')), false);
    assert.equal(h.api.wakeWord.status, 'Listening for “Hey Angklobot”');
  } finally { await h.cleanup(); }
});

test('disabling during AI cancels its speech and prevents reenable until the request settles', async () => {
  const h = await harness();
  try {
    await React.act(async () => h.api.wakeWord.enable());
    let completion;
    await React.act(async () => { completion = h.api.submitText('Hello'); });
    await React.act(async () => h.api.wakeWord.disable());
    assert.equal(h.api.state, 'thinking');
    await React.act(async () => h.api.wakeWord.enable());
    assert.equal(h.instances.length, 1, 'no second session during cancelled request');
    await React.act(async () => { h.response.resolve('Stale reply'); await completion; });
    assert.equal(h.api.state, 'idle');
    assert.equal(h.events.some(e => e.startsWith('tts:')), false);
  } finally { await h.cleanup(); }
});

test('muting while AI thinks suppresses the eventual spoken response', async () => {
  const h = await harness();
  try {
    let completion;
    await React.act(async () => { completion = h.api.submitText('Hello'); });
    await React.act(async () => h.api.setMuted(true));
    await React.act(async () => { h.response.resolve('Hello back'); await completion; });
    assert.equal(h.events.some(e => e.startsWith('tts:')), false);
    assert.equal(h.api.state, 'idle');
  } finally { await h.cleanup(); }
});
