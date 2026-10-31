const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { GestureGate, handFeatures, recognize, calibrationReady, SIGNS } = load('src/features/conduct/gestures.ts');
const { HandCamera } = load('src/features/conduct/camera.ts');
const { StudioController } = load('src/features/studio/runtime/studioController.ts');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('gesture gate rejects transitions, latches held notes, and requires a neutral release for repeats', () => {
  const g = new GestureGate();
  assert.equal(g.update('C4', 0), null);
  assert.equal(g.update('D4', 90), null);
  assert.equal(g.update('C4', 180), null);
  assert.equal(g.update('C4', 360), 'C4');
  assert.equal(g.update('C4', 550), null);
  assert.equal(g.update(null, 600), null);
  assert.equal(g.update('C4', 680), null);
  assert.equal(g.update('C4', 900), null);
  g.update(null, 1000); g.update(null, 1250);
  g.update('C4', 1300);
  assert.equal(g.update('C4', 1480), 'C4');
  assert.equal(g.update('D4', 1550), null);
  assert.equal(g.update('D4', 1740), 'D4');
});

test('stale or out-of-order camera results cannot immediately trigger another note', () => {
  const g = new GestureGate();
  g.update('C4', 100); assert.equal(g.update('C4', 300), 'C4');
  assert.equal(g.update('D4', 200), null);
  assert.equal(g.update('D4', 2000), null);
  assert.equal(g.update('D4', 2190), 'D4');
  assert.equal(g.update('D4', NaN), null);
});

test('incomplete, malformed and ambiguous calibration stays silent', () => {
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: .3 + i * .01, y: .7 - i * .01, z: 0 }));
  const vector = handFeatures(hand);
  assert.equal(handFeatures(hand.slice(1)), null);
  assert.equal(handFeatures(hand.map(p => ({ ...p, z: NaN }))), null);
  assert.equal(recognize(hand, {}, .7, .3), null);
  const same = Object.fromEntries(SIGNS.map(sign => [sign, [vector, vector, vector]]));
  assert.equal(calibrationReady(same, .3, .7), false);
  assert.equal(recognize(hand, same, .7, .3), null);
  const samples = Object.fromEntries(SIGNS.map((sign, i) => [sign, Array.from({ length: 3 }, () => vector.map(v => v + i))]));
  assert.equal(recognize(hand, samples, .7, .3).note, 'C4');
  assert.equal(recognize(hand.map(p => ({ ...p, y: p.y - .4 })), samples, .7, .3).note, 'C5');
  assert.equal(recognize(hand.map(p => ({ ...p, y: p.y - .2 })), samples, .7, .3), null);
});

function controllerHarness(unlock = () => Promise.resolve()) {
  const audio = []; const engines = [];
  const c = new StudioController({
    repository: {
      loadCatalog: async () => [{ id: 'a', title: 'A', path: '/a.json' }],
      loadSong: async () => ({ id: 'a', title: 'A', tempo_bpm: 120,
        notes: [{ note: 'C4', start: 0, duration: .5, role: 'melody' }] }),
    },
    preferences: { load: () => null, save: () => {} },
    audio: { ensureReady: unlock, setMuted: () => {}, stopAll: () => {},
      playNote: (...args) => audio.push(args) },
    createPlayback: (_, callbacks) => { engines.push(callbacks); return { play: () => {}, stop: () => {}, pause: () => 0 }; },
  });
  return { c, audio, engines };
}

test('conducting cancels the song engine and prevents stale callbacks or queue playback from producing audio', async () => {
  const { c, audio, engines } = controllerHarness();
  await c.initialize(); await c.play(); assert.equal(engines.length, 1);
  c.setInputMode('conduct'); await c.enableConductPreview();
  engines[0].onCommand({ note: 'G4', duration_seconds: 1, strength: .5 });
  engines[0].onComplete(); await c.play();
  assert.equal(engines.length, 1); assert.equal(audio.length, 0);
  c.previewConductNote('C4'); c.previewConductNote('C8');
  assert.equal(audio.length, 1); assert.deepEqual(Array.from(audio[0]), ['C4', .3, .45]);
  c.stop(); c.previewConductNote('D4'); assert.equal(audio.length, 1);
  c.setInputMode('player'); await c.play(); assert.equal(engines.length, 2);
  c.dispose();
});

test('Stop and leaving Conduct invalidate a pending audio unlock', async () => {
  for (const change of ['stop', 'leave']) {
    const unlock = deferred(); const { c, audio } = controllerHarness(() => unlock.promise);
    c.setInputMode('conduct'); const pending = c.enableConductPreview();
    if (change === 'stop') c.stop(); else c.setInputMode('player');
    unlock.resolve(); await pending; c.previewConductNote('C4');
    assert.equal(c.getSnapshot().conductReady, false); assert.equal(audio.length, 0);
    c.dispose();
  }
});

test('a stopped camera releases a stream arriving after the permission dialog', async () => {
  const permission = deferred(); let stopped = 0; let workers = 0;
  const env = { getMedia: () => permission.promise, createWorker: () => { workers++; },
    cancelFrame: () => {}, requestFrame: () => 0, bitmap: async () => {}, now: () => 0 };
  const camera = new HandCamera(() => {}, () => assert.fail('late error'), env);
  const video = { srcObject: null, play: async () => {}, pause: () => {} };
  const starting = camera.start(video); camera.stop();
  permission.resolve({ getTracks: () => [{ stop: () => { stopped++; } }] });
  assert.equal(await starting, false); assert.equal(stopped, 1); assert.equal(workers, 0);
  assert.equal(video.srcObject, null);
});

test('camera keeps one frame in flight and closes late bitmaps on Stop', async () => {
  let loop; let stopped = 0; let terminated = 0; let closed = 0; const posts = [];
  const bitmap = deferred();
  const worker = { postMessage: message => posts.push(message), terminate: () => { terminated++; } };
  const track = { stop: () => { stopped++; }, onended: null };
  const camera = new HandCamera(() => {}, () => assert.fail('unexpected camera error'), {
    getMedia: async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }),
    createWorker: () => worker, bitmap: () => bitmap.promise,
    requestFrame: callback => { loop = callback; return 1; }, cancelFrame: () => {}, now: () => 0,
  });
  const video = { srcObject: null, play: async () => {}, pause: () => {}, readyState: 4, currentTime: 1 };
  await camera.start(video); worker.onmessage({ data: { type: 'ready' } });
  loop(100); video.currentTime = 2; loop(200);
  camera.stop(); bitmap.resolve({ close: () => { closed++; } });
  await new Promise(r => setImmediate(r));
  assert.equal(posts.length, 1); assert.equal(stopped, 1); assert.equal(terminated, 1); assert.equal(closed, 1);
  assert.equal(video.srcObject, null);
});
