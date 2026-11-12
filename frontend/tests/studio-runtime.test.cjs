const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { StudioController } = load('src/features/studio/runtime/studioController.ts');
const { parsePreferences, PREFERENCE_KEY } = load('src/features/studio/runtime/preferences.ts');

const entry = (id, overrides = {}) => ({ id, title: `Song ${id}`, path: `/songs/${id}.json`, ...overrides });
const arrangement = (id, overrides = {}) => ({
  id, title: `Song ${id}`, tempo_bpm: 120,
  notes: [
    { note: 'G4', start: 0, duration: 0.5, role: 'melody' },
    { note: 'A4', start: 1, duration: 0.5, role: 'melody' },
    { note: 'G3', start: 1, duration: 0.25, role: 'accompaniment' },
  ],
  ...overrides,
});
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const waitFor = async (predicate) => {
  for (let i = 0; i < 20 && !predicate(); i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(predicate(), 'expected asynchronous state transition');
};

test('queue advances in order, permits repeated entries, and ends without wrapping', async () => {
  const h = harness();
  await h.controller.initialize();
  h.controller.addToQueue('b');
  h.controller.addToQueue('b');
  h.controller.addToQueue('missing');
  assert.deepEqual(Array.from(h.controller.getSnapshot().queue, item => item.songId), ['a', 'b', 'b']);
  await h.controller.play();
  h.playback[0].callbacks.onComplete();
  await waitFor(() => h.playback.length === 2);
  assert.equal(h.controller.getSnapshot().selectedSongId, 'b');
  assert.equal(h.controller.getSnapshot().queueIndex, 1);
  h.playback[1].callbacks.onComplete();
  await waitFor(() => h.playback.length === 3);
  assert.equal(h.playback[2].plays[0], 0);
  assert.equal(h.controller.getSnapshot().queueIndex, 2);
  h.playback[2].callbacks.onComplete();
  assert.equal(h.controller.getSnapshot().playback, 'ended');
  assert.equal(h.playback.length, 3);
  h.controller.dispose();
});

test('repeat one replays the current song but explicit Next advances', async () => {
  const h = harness();
  await h.controller.initialize();
  h.controller.addToQueue('b');
  h.controller.setRepeat('one');
  await h.controller.play();
  h.playback[0].callbacks.onComplete();
  await waitFor(() => h.playback.length === 2);
  assert.equal(h.controller.getSnapshot().selectedSongId, 'a');
  assert.equal(h.playback[1].plays[0], 0);
  await h.controller.next();
  assert.equal(h.controller.getSnapshot().selectedSongId, 'b');
  assert.equal(h.controller.getSnapshot().playback, 'playing');
  h.controller.dispose();
});

test('repeat all restarts the queue and Stop cancels repetition', async () => {
  const h = harness();
  await h.controller.initialize();
  h.controller.addToQueue('b');
  h.controller.setRepeat('all');
  await h.controller.play();
  await h.controller.next();
  h.playback[1].callbacks.onComplete();
  await waitFor(() => h.playback.length === 3);
  assert.equal(h.controller.getSnapshot().selectedSongId, 'a');
  assert.equal(h.controller.getSnapshot().queueIndex, 0);
  h.controller.stop();
  h.playback[2].callbacks.onComplete();
  assert.equal(h.controller.getSnapshot().playback, 'idle');
  assert.equal(h.playback.length, 3);
  h.controller.dispose();
});

test('manual selection preserves upcoming queue; paused Next and Previous never autoplay', async () => {
  const h = harness({ catalog: [entry('a'), entry('b'), entry('c')] });
  await h.controller.initialize();
  h.controller.addToQueue('b');
  await h.controller.selectSong('c');
  assert.deepEqual(Array.from(h.controller.getSnapshot().queue, item => item.songId), ['c', 'b']);
  await h.controller.next();
  assert.equal(h.controller.getSnapshot().selectedSongId, 'b');
  await h.controller.previous();
  assert.equal(h.controller.getSnapshot().selectedSongId, 'c');
  assert.equal(h.playback.length, 0);
  h.controller.dispose();
});

test('queue edits affect only upcoming entries and preserve the current scheduler', async () => {
  const h = harness({ catalog: [entry('a'), entry('b'), entry('c')] });
  await h.controller.initialize();
  h.controller.addToQueue('b');
  h.controller.addToQueue('c');
  await h.controller.play();
  const [a, b, c] = h.controller.getSnapshot().queue;
  h.controller.removeFromQueue(a.key);
  h.controller.moveInQueue(b.key, -1);
  h.controller.moveInQueue(c.key, -1);
  assert.deepEqual(Array.from(h.controller.getSnapshot().queue, item => item.songId), ['a', 'c', 'b']);
  h.controller.removeFromQueue(c.key);
  assert.deepEqual(Array.from(h.controller.getSnapshot().queue, item => item.songId), ['a', 'b']);
  h.controller.clearQueue();
  assert.equal(h.controller.getSnapshot().queue.length, 1);
  assert.equal(h.playback[0].stops, 0);
  h.controller.dispose();
});

test('shuffle preserves every occurrence and the current song, then restores added order', async () => {
  const h = harness({ catalog: [entry('a'), entry('b'), entry('c'), entry('d')] });
  await h.controller.initialize();
  for (const id of ['b', 'c', 'd', 'b']) h.controller.addToQueue(id);
  const before = h.controller.getSnapshot().queue;
  h.controller.setShuffle(true);
  const shuffled = h.controller.getSnapshot().queue;
  assert.equal(shuffled[0], before[0]);
  assert.deepEqual(shuffled.map(item => item.key).sort(), before.map(item => item.key).sort());
  h.controller.addToQueue('c');
  assert.equal(h.controller.getSnapshot().queue[0], before[0]);
  h.controller.setShuffle(false);
  assert.deepEqual(Array.from(h.controller.getSnapshot().queue, item => item.songId), ['a', 'b', 'c', 'd', 'b', 'c']);
  h.controller.dispose();
});

test('Stop, pause, seek, settings, selection and disposal cancel a loading queue transition', async () => {
  for (const cancel of ['stop', 'pause', 'seek', 'setTempo', 'setMode', 'selectSong', 'dispose']) {
    const pending = deferred();
    const h = harness({ loadSong: song => song.id === 'b' ? pending.promise : Promise.resolve(arrangement(song.id)) });
    await h.controller.initialize();
    h.controller.addToQueue('b');
    await h.controller.play();
    const next = h.controller.next();
    assert.equal(h.controller.getSnapshot().songStatus, 'loading');
    if (cancel === 'seek') h.controller.seek(0);
    else if (cancel === 'setTempo') h.controller.setTempo('slower');
    else if (cancel === 'setMode') h.controller.setMode('harmony');
    else if (cancel === 'selectSong') await h.controller.selectSong('a');
    else h.controller[cancel]();
    pending.resolve(arrangement('b'));
    await next;
    assert.equal(h.playback.length, 1, cancel);
    assert.notEqual(h.controller.getSnapshot().playback, 'playing', cancel);
    h.controller.dispose();
  }
});

test('direct song playback unlocks audio in the click and late loads cannot override a newer play', async () => {
  const pending = deferred();
  const h = harness({ loadSong: song => song.id === 'b' ? pending.promise : Promise.resolve(arrangement(song.id)) });
  await h.controller.initialize();
  const first = h.controller.playSong('b');
  assert.equal(h.audio.ready, 1);
  await h.controller.playSong('a');
  pending.resolve(arrangement('b'));
  await first;
  assert.equal(h.controller.getSnapshot().selectedSongId, 'a');
  assert.equal(h.playback.length, 1);
  assert.equal(h.controller.getSnapshot().playback, 'playing');
  h.controller.dispose();
});

test('a failed queued song stops progression and surfaces its load error', async () => {
  const h = harness({ loadSong: async song => { if (song.id === 'b') throw new Error('arrangement missing'); return arrangement(song.id); } });
  await h.controller.initialize();
  h.controller.addToQueue('b');
  h.controller.addToQueue('a');
  await h.controller.play();
  h.playback[0].callbacks.onComplete();
  await waitFor(() => h.controller.getSnapshot().songStatus === 'error');
  assert.equal(h.playback.length, 1);
  assert.match(h.controller.getSnapshot().error, /arrangement missing/);
  h.controller.dispose();
});

test('queue, shuffle and repeat do not persist or autoplay after reopening', async () => {
  const h = harness();
  await h.controller.initialize();
  h.controller.addToQueue('b');
  h.controller.setShuffle(true);
  h.controller.setRepeat('all');
  await h.controller.play();
  const saved = h.writes.at(-1);
  h.controller.dispose();
  const reopened = harness({ saved });
  await reopened.controller.initialize();
  assert.equal(reopened.controller.getSnapshot().queue.length, 1);
  assert.equal(reopened.controller.getSnapshot().repeat, 'off');
  assert.equal(reopened.controller.getSnapshot().shuffle, false);
  assert.equal(reopened.playback.length, 0);
  reopened.controller.dispose();
});

test('failed audio unlock remains visible after a directly played song finishes loading', async () => {
  const pending = deferred();
  const h = harness({ unlock: () => Promise.reject(new Error('audio permission denied')),
    loadSong: song => song.id === 'b' ? pending.promise : Promise.resolve(arrangement(song.id)) });
  await h.controller.initialize();
  const play = h.controller.playSong('b');
  await new Promise(resolve => setImmediate(resolve));
  pending.resolve(arrangement('b'));
  await play;
  assert.equal(h.playback.length, 0);
  assert.match(h.controller.getSnapshot().error, /audio permission denied/);
  assert.equal(h.controller.getSnapshot().playback, 'paused');
  h.controller.dispose();
});

test('shuffled repeat-all avoids repeating the last queue entry at the cycle boundary', async () => {
  const h = harness({ catalog: [entry('a'), entry('b'), entry('c')] });
  await h.controller.initialize();
  h.controller.addToQueue('b');
  h.controller.addToQueue('c');
  h.controller.setShuffle(true);
  h.controller.setRepeat('all');
  const last = h.controller.getSnapshot().queue.at(-1);
  await h.controller.playQueueEntry(last.key);
  h.playback[0].callbacks.onComplete();
  await waitFor(() => h.playback.length === 2);
  assert.notEqual(h.controller.getSnapshot().queue[0].key, last.key);
  assert.equal(h.controller.getSnapshot().queueIndex, 0);
  h.controller.dispose();
});

test('catalog refresh removes unavailable upcoming tracks without interrupting an available current song', async () => {
  let catalog = [entry('a'), entry('b'), entry('c')];
  const h = harness({ loadCatalog: async () => catalog });
  await h.controller.initialize();
  h.controller.addToQueue('b');
  h.controller.addToQueue('c');
  await h.controller.play();
  catalog = [entry('a'), entry('c')];
  await h.controller.reloadCatalog();
  assert.deepEqual(Array.from(h.controller.getSnapshot().queue, item => item.songId), ['a', 'c']);
  assert.equal(h.controller.getSnapshot().queueIndex, 0);
  assert.equal(h.playback[0].stops, 0);
  h.controller.dispose();
});
function harness(options = {}) {
  const playback = [];
  const writes = [];
  const audio = { ready: 0, stops: 0, notes: [], muted: false };
  const ports = {
    repository: {
      loadCatalog: options.loadCatalog ?? (async () => options.catalog ?? [entry('a'), entry('b')]),
      loadSong: options.loadSong ?? (async (song) => arrangement(song.id)),
    },
    preferences: {
      load: () => { if (options.readError) throw new Error('storage denied'); return options.saved ?? null; },
      save: (value) => { if (options.writeError) throw new Error('quota'); writes.push(JSON.parse(JSON.stringify(value))); },
    },
    audio: {
      ensureReady: () => { audio.ready++; return options.unlock?.() ?? Promise.resolve(); },
      setMuted: (muted) => { audio.muted = muted; },
      stopAll: () => { audio.stops++; },
      playNote: (...note) => { if (options.noteError) throw new Error('audio disconnected'); audio.notes.push(note); },
    },
    createPlayback: (schedule, callbacks) => {
      const instance = { schedule, callbacks, plays: [], stops: 0, pausedAt: 0.7,
        play(seconds) { this.plays.push(seconds); callbacks.onTimeUpdate(seconds); },
        pause() { return this.pausedAt; },
        stop() { this.stops++; callbacks.onTimeUpdate(0); },
      };
      playback.push(instance);
      return instance;
    },
  };
  return { controller: new StudioController(ports), playback, audio, writes, ports };
}

test('Studio filters hidden, unavailable, duplicate and hardware songs and restores selection without autoplay', async () => {
  const h = harness({
    catalog: [entry('a'), entry('b'), entry('b'), entry('off', { active: false }),
      entry('draft', { playable: false }), entry('hidden', { visible_in_guest: false }), entry('trial', { category: 'hardware_trial' })],
    saved: { version: 1, lastSongId: 'b', favoriteIds: ['b', 'hidden'], recentIds: ['off', 'a'], muted: true },
  });
  await h.controller.initialize();
  const state = h.controller.getSnapshot();
  assert.equal(state.catalog.map((song) => song.id).join(','), 'a,b');
  assert.equal(state.selectedSongId, 'b');
  assert.equal(state.songStatus, 'ready');
  assert.equal(state.preferences.favoriteIds.join(','), 'b');
  assert.equal(state.preferences.recentIds.join(','), 'a');
  assert.equal(h.audio.muted, true);
  assert.equal(h.audio.ready, 0);
  assert.equal(h.playback.length, 0);
  assert.equal(state.validationErrors.length, 0);
});

test('versioned preferences recover invalid values and limit unique recents', () => {
  assert.equal(PREFERENCE_KEY, 'angklobot.studio.preferences.v1');
  assert.equal(parsePreferences({ version: 2, muted: true }).muted, false);
  for (const invalid of [null, [], 'broken', false]) assert.equal(parsePreferences(invalid).version, 1);
  const value = parsePreferences({ version: 1, favoriteIds: ['a', null, 'a', 2, 'b'],
    recentIds: ['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g'], lastSongId: 3, muted: 'true', tempo: 'fast', mode: 'invalid' });
  assert.equal(value.favoriteIds.join(','), 'a,b');
  assert.equal(value.recentIds.join(','), 'a,b,c,d,e,f');
  assert.equal(value.lastSongId, null);
  assert.equal(value.muted, false);
  assert.equal(value.tempo, 'normal');
  assert.equal(value.mode, 'melody');
});

test('blocked or corrupt storage does not block catalog, preferences or playback', async () => {
  const h = harness({ readError: true, writeError: true });
  await h.controller.initialize();
  h.controller.toggleFavorite('a');
  await h.controller.play();
  assert.equal(h.controller.getSnapshot().playback, 'playing');
  assert.equal(h.controller.getSnapshot().preferences.favoriteIds.join(','), 'a');
  assert.match(h.controller.getSnapshot().storageWarning, /storage is unavailable/);
  h.controller.dispose();
});

test('appearance upgrades older preferences and bounds corrupt sizes', () => {
  const old = parsePreferences({ version: 1, favoriteIds: ['a'], tempo: 'slower' });
  assert.equal(old.theme, 'light');
  assert.equal(old.interfaceScale, 120);
  assert.equal(old.queueWidth, 320);
  assert.equal(old.tempo, 'slower');
  assert.equal(old.favoriteIds.join(','), 'a');
  for (const bad of [NaN, Infinity, null, '130', {}]) {
    const p = parsePreferences({ version: 1, theme: 'invalid', interfaceScale: bad, queueWidth: bad });
    assert.equal(p.theme, 'light');
    assert.equal(p.interfaceScale, 120);
    assert.equal(p.queueWidth, 320);
  }
  const huge = parsePreferences({ version: 1, theme: 'dark', interfaceScale: 1000, queueWidth: 100000 });
  assert.equal(huge.theme, 'dark');
  assert.equal(huge.interfaceScale, 140);
  assert.equal(huge.queueWidth, 460);
  const small = parsePreferences({ version: 1, interfaceScale: -1, queueWidth: 0 });
  assert.equal(small.interfaceScale, 100);
  assert.equal(small.queueWidth, 250);
});

test('appearance changes persist without interrupting playback, queue, or selection', async () => {
  const h = harness();
  await h.controller.initialize();
  h.controller.addToQueue('b');
  h.controller.toggleFavorite('a');
  await h.controller.play();
  h.playback[0].callbacks.onTimeUpdate(0.5);
  const before = h.controller.getSnapshot();
  const audioStops = h.audio.stops;
  h.controller.setTheme('dark');
  h.controller.setInterfaceScale(130);
  h.controller.setQueueWidth(410);
  const after = h.controller.getSnapshot();
  assert.equal(after.playback, 'playing');
  assert.equal(after.positionSeconds, 0.5);
  assert.equal(after.queue, before.queue);
  assert.equal(after.selectedSongId, before.selectedSongId);
  assert.equal(h.audio.stops, audioStops);
  assert.equal(h.playback.length, 1);
  assert.equal(h.playback[0].stops, 0);
  const restored = harness({ saved: h.writes.at(-1) });
  await restored.controller.initialize();
  assert.equal(restored.controller.getSnapshot().preferences.theme, 'dark');
  assert.equal(restored.controller.getSnapshot().preferences.interfaceScale, 130);
  assert.equal(restored.controller.getSnapshot().preferences.queueWidth, 410);
  assert.equal(restored.controller.getSnapshot().preferences.favoriteIds.join(','), 'a');
  assert.equal(restored.playback.length, 0);
  h.controller.dispose();
  const writeCount = h.writes.length;
  h.controller.setTheme('light');
  h.controller.setInterfaceScale(100);
  h.controller.setQueueWidth(250);
  assert.equal(h.writes.length, writeCount);
  restored.controller.dispose();
});

test('catalog failure is recoverable and initialization is idempotent', async () => {
  let attempts = 0;
  const h = harness({ loadCatalog: async () => { if (++attempts === 1) throw new Error('offline'); return [entry('a')]; } });
  await h.controller.initialize();
  assert.equal(h.controller.getSnapshot().catalogStatus, 'error');
  await h.controller.initialize();
  assert.equal(attempts, 1);
  await h.controller.reloadCatalog();
  assert.equal(h.controller.getSnapshot().catalogStatus, 'ready');
  assert.equal(h.controller.getSnapshot().error, null);
});

test('late selection success or failure cannot replace the most recently selected song', async () => {
  for (const rejected of [false, true]) {
    const first = deferred();
    const second = deferred();
    const h = harness({ loadSong: (song) => song.id === 'a' ? first.promise : second.promise });
    const start = h.controller.initialize();
    await waitFor(() => h.controller.getSnapshot().songStatus === 'loading');
    const selectB = h.controller.selectSong('b');
    second.resolve(arrangement('b'));
    await selectB;
    if (rejected) first.reject(new Error('late failure'));
    else first.resolve(arrangement('a'));
    await start;
    assert.equal(h.controller.getSnapshot().song.id, 'b');
    assert.equal(h.controller.getSnapshot().error, null);
    assert.equal(h.controller.getSnapshot().preferences.lastSongId, 'b');
  }
});

test('selection stops existing audio immediately and invalidates old callbacks', async () => {
  const next = deferred();
  const h = harness({ loadSong: (song) => song.id === 'b' ? next.promise : Promise.resolve(arrangement('a')) });
  await h.controller.initialize();
  await h.controller.play();
  const old = h.playback[0];
  const select = h.controller.selectSong('b');
  assert.equal(old.stops, 1);
  assert.equal(h.controller.getSnapshot().songStatus, 'loading');
  old.callbacks.onCommand(old.schedule.commands[0]);
  old.callbacks.onComplete();
  assert.equal(h.audio.notes.length, 0);
  assert.equal(h.controller.getSnapshot().playback, 'idle');
  next.resolve(arrangement('b'));
  await select;
});

test('stop during audio unlock cancels pending play and silences late unlock completion', async () => {
  const unlock = deferred();
  const h = harness({ unlock: () => unlock.promise });
  await h.controller.initialize();
  const play = h.controller.play();
  assert.equal(h.controller.getSnapshot().playback, 'starting');
  h.controller.stop();
  const stops = h.audio.stops;
  unlock.resolve();
  await play;
  assert.equal(h.playback.length, 0);
  assert.equal(h.controller.getSnapshot().playback, 'idle');
  assert.ok(h.audio.stops > stops);
  assert.equal(h.controller.getSnapshot().preferences.recentIds.length, 0);
});

test('pause and seek cancel pending unlock; settings also rebuild before another play', async () => {
  for (const cancel of ['pause', 'seek', 'setTempo', 'setMode']) {
    const unlock = deferred();
    const h = harness({ unlock: () => unlock.promise });
    await h.controller.initialize();
    const before = h.controller.getSnapshot().durationSeconds;
    const play = h.controller.play();
    if (cancel === 'seek') h.controller.seek(0.3);
    else if (cancel === 'setTempo') h.controller.setTempo('slower');
    else if (cancel === 'setMode') h.controller.setMode('harmony');
    else h.controller.pause();
    unlock.resolve();
    await play;
    assert.equal(h.playback.length, 0, cancel);
    assert.notEqual(h.controller.getSnapshot().playback, 'playing', cancel);
    if (cancel === 'setTempo') assert.ok(h.controller.getSnapshot().durationSeconds > before);
    if (cancel === 'setMode') assert.equal(h.controller.getSnapshot().schedule.commands.length, 3);
  }
});

test('audio failures are surfaced and a later user action can recover', async () => {
  let attempts = 0;
  const h = harness({ unlock: () => ++attempts === 1 ? Promise.reject(new Error('permission denied')) : Promise.resolve() });
  await h.controller.initialize();
  await h.controller.play();
  assert.equal(h.controller.getSnapshot().playback, 'paused');
  assert.match(h.controller.getSnapshot().error, /permission denied/);
  await h.controller.play();
  assert.equal(h.controller.getSnapshot().playback, 'playing');
  assert.equal(h.controller.getSnapshot().error, null);
  h.controller.dispose();
});

test('pause preserves accurate position, seeking clamps and explicit resume starts there', async () => {
  const h = harness();
  await h.controller.initialize();
  await h.controller.play();
  h.controller.pause();
  assert.equal(h.controller.getSnapshot().positionSeconds, 0.7);
  assert.equal(h.controller.getSnapshot().activeNotes.length, 0);
  h.controller.seek(0.4);
  assert.equal(h.controller.getSnapshot().playback, 'paused');
  await h.controller.play();
  assert.equal(h.playback[1].plays[0], 0.4);
  h.controller.seek(Infinity);
  assert.equal(h.controller.getSnapshot().playback, 'playing');
  h.controller.seek(-100);
  assert.equal(h.controller.getSnapshot().positionSeconds, 0);
  h.controller.seek(100);
  assert.equal(h.controller.getSnapshot().positionSeconds, h.controller.getSnapshot().durationSeconds);
  assert.equal(h.controller.getSnapshot().playback, 'ended');
  await h.controller.play();
  assert.equal(h.playback[2].plays[0], 0);
  h.controller.dispose();
});

test('natural completion stops scheduler and audio, guards old callbacks, and can replay from zero', async () => {
  const h = harness();
  await h.controller.initialize();
  await h.controller.play();
  const engine = h.playback[0];
  engine.callbacks.onTimeUpdate(0.1);
  assert.equal(h.controller.getSnapshot().activeNotes.join(','), 'G4');
  engine.callbacks.onComplete();
  assert.equal(engine.stops, 1);
  assert.equal(h.controller.getSnapshot().playback, 'ended');
  assert.equal(h.controller.getSnapshot().activeNotes.length, 0);
  engine.callbacks.onTimeUpdate(0.1);
  assert.equal(h.controller.getSnapshot().positionSeconds, h.controller.getSnapshot().durationSeconds);
  await h.controller.play();
  assert.equal(h.playback[1].plays[0], 0);
  h.controller.dispose();
});

test('arrangement changes stop current preview and revalidate rather than reuse old commands', async () => {
  const h = harness();
  await h.controller.initialize();
  const original = h.controller.getSnapshot().schedule;
  await h.controller.play();
  h.playback[0].callbacks.onTimeUpdate(0.5);
  h.controller.setTempo('slower');
  assert.equal(h.playback[0].stops, 1);
  assert.equal(h.controller.getSnapshot().positionSeconds, 0);
  assert.equal(h.controller.getSnapshot().playback, 'idle');
  assert.notEqual(h.controller.getSnapshot().schedule, original);
  assert.equal(h.controller.getSnapshot().schedule.song.tempo_bpm, 96);
  assert.equal(h.controller.getSnapshot().safety.overall, 'PASSED');
  assert.equal(h.writes.at(-1).tempo, 'slower');
});

test('both malformed schedule data and failed motor checks block preview', async () => {
  for (const notes of [
    [{ note: 'G4', start: -1, duration: 0.5 }],
    [{ note: 'G#4', start: 0, duration: 0.5 }],
    Array.from({ length: 19 }, () => ({ note: 'G4', start: 0, duration: 0.5 })),
    [{ note: 'G4', start: 0, duration: 0.5, role: 'accompaniment' }],
  ]) {
    const h = harness({ loadSong: async (song) => arrangement(song.id, { notes }) });
    await h.controller.initialize();
    assert.ok(h.controller.getSnapshot().validationErrors.length > 0);
    await h.controller.play();
    assert.equal(h.audio.ready, 0);
    assert.equal(h.playback.length, 0);
  }
});

test('favorites and recent played songs persist uniquely and recents keep only six', async () => {
  const h = harness({ catalog: Array.from({ length: 8 }, (_, i) => entry(`${i}`)) });
  await h.controller.initialize();
  h.controller.toggleFavorite('1');
  h.controller.toggleFavorite('missing');
  h.controller.toggleFavorite('1');
  assert.equal(h.controller.getSnapshot().preferences.favoriteIds.length, 0);
  for (let i = 0; i < 8; i++) {
    await h.controller.selectSong(`${i}`);
    await h.controller.play();
  }
  await h.controller.selectSong('5');
  await h.controller.play();
  assert.equal(h.controller.getSnapshot().preferences.recentIds.join(','), '5,7,6,4,3,2');
  assert.equal(h.writes.at(-1).lastSongId, '5');
  h.controller.dispose();
});

test('removing a selected song on catalog reload silences preview and picks an available song', async () => {
  let catalog = [entry('a'), entry('b')];
  const h = harness({ loadCatalog: async () => catalog });
  await h.controller.initialize();
  await h.controller.play();
  catalog = [entry('b')];
  await h.controller.reloadCatalog();
  assert.equal(h.playback[0].stops, 1);
  assert.equal(h.controller.getSnapshot().selectedSongId, 'b');
  assert.equal(h.controller.getSnapshot().playback, 'idle');
});

test('disposal stops playback, removes subscribers and rejects late song/unlock callbacks', async () => {
  const unlock = deferred();
  const h = harness({ unlock: () => unlock.promise });
  let updates = 0;
  h.controller.subscribe(() => updates++);
  await h.controller.initialize();
  const play = h.controller.play();
  h.controller.dispose();
  const atDispose = updates;
  unlock.resolve();
  await play;
  h.controller.toggleFavorite('a');
  await h.controller.reloadCatalog();
  assert.equal(updates, atDispose);
  assert.equal(h.playback.length, 0);

  const song = deferred();
  const pending = harness({ loadSong: () => song.promise });
  const start = pending.controller.initialize();
  await waitFor(() => pending.controller.getSnapshot().songStatus === 'loading');
  pending.controller.dispose();
  const before = pending.controller.getSnapshot();
  song.resolve(arrangement('a'));
  await start;
  assert.equal(pending.controller.getSnapshot(), before);

  const playing = harness();
  await playing.controller.initialize();
  await playing.controller.play();
  playing.controller.dispose();
  assert.equal(playing.playback[0].stops, 1);
  playing.playback[0].callbacks.onCommand(playing.playback[0].schedule.commands[0]);
  assert.equal(playing.audio.notes.length, 0);
});

test('synth errors stop playback and stale scheduler notes stay silent', async () => {
  const h = harness({ noteError: true });
  await h.controller.initialize();
  await h.controller.play();
  const engine = h.playback[0];
  engine.callbacks.onCommand(engine.schedule.commands[0]);
  assert.equal(engine.stops, 1);
  assert.equal(h.controller.getSnapshot().playback, 'paused');
  assert.match(h.controller.getSnapshot().error, /audio disconnected/);
  engine.callbacks.onComplete();
  assert.equal(h.controller.getSnapshot().playback, 'paused');
});

test('unmuting an active muted preview unlocks audio again at the current position', async () => {
  const h = harness({ saved: { version: 1, muted: true } });
  await h.controller.initialize();
  await h.controller.play();
  assert.equal(h.audio.ready, 1);
  h.controller.setMuted(false);
  await waitFor(() => h.playback.length === 2);
  assert.equal(h.audio.muted, false);
  assert.equal(h.audio.ready, 2);
  assert.equal(h.playback[0].stops, 1);
  assert.equal(h.playback[1].plays[0], 0.7);
  h.controller.dispose();
});

test('shared browser audio rejects commands and late stops from a replaced controller', async () => {
  const activity = { instances: 0, stops: 0, notes: [], muted: false };
  class AudioEngine {
    constructor() { activity.instances++; }
    ensureReady() { return Promise.resolve(); }
    setMuted(muted) { activity.muted = muted; }
    stopAll() { activity.stops++; }
    playNote(note) { activity.notes.push(note); }
  }
  const { createBrowserPorts } = load('src/features/studio/runtime/browserAdapters.ts', {}, {
    '../../../lib/audioEngine': { AudioEngine },
  });
  const first = createBrowserPorts();
  const second = createBrowserPorts();
  first.audio.setMuted(true);
  await first.audio.ensureReady();
  assert.equal(activity.muted, true);
  await second.audio.ensureReady();
  assert.equal(activity.instances, 1);
  assert.equal(activity.muted, false);
  first.audio.stopAll();
  first.audio.setMuted(true);
  first.audio.playNote('A4', 0.5, 0.6);
  assert.equal(activity.stops, 0);
  assert.equal(activity.muted, false);
  assert.equal(activity.notes.length, 0);
  second.audio.playNote('G4', 0.5, 0.6);
  second.audio.stopAll();
  assert.equal(activity.notes.join(','), 'G4');
  assert.equal(activity.stops, 1);
});

test('React Strict Mode effect replay keeps one live session and real unmount disposes it', async () => {
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/studio' });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousAct = global.IS_REACT_ACT_ENVIRONMENT;
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let catalogLoads = 0;
  const h = harness({ loadCatalog: async () => { catalogLoads++; return [entry('a')]; } });
  const { StudioProvider, useStudio } = load('src/features/studio/runtime/useStudio.tsx', { window: dom.window, URLSearchParams }, {
    './browserAdapters': { createBrowserPorts: () => h.ports },
  });
  let view;
  function Probe() { view = useStudio(); return React.createElement('span', null, view.snapshot.playback); }
  const root = createRoot(dom.window.document.getElementById('root'));
  let unmounted = false;
  try {
    await React.act(async () => {
      root.render(React.createElement(React.StrictMode, null,
        React.createElement(StudioProvider, null, React.createElement(Probe))));
    });
    assert.equal(catalogLoads, 1);
    assert.equal(view.snapshot.songStatus, 'ready');
    await React.act(async () => { await view.actions.play(); });
    assert.equal(view.snapshot.playback, 'playing');
    assert.equal(h.playback.length, 1);
    await React.act(async () => { root.unmount(); });
    unmounted = true;
    assert.equal(h.playback[0].stops, 1);
    h.playback[0].callbacks.onCommand(h.playback[0].schedule.commands[0]);
    assert.equal(h.audio.notes.length, 0);
  } finally {
    if (!unmounted) await React.act(async () => { root.unmount(); });
    dom.window.close();
    global.window = previousWindow;
    global.document = previousDocument;
    global.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});

test('robot output repeats the queue and Stop invalidates late note callbacks', async () => {
  const h = harness();
  await h.controller.initialize();
  const prepared = [], notes = [];
  let disarms = 0;
  h.controller.setRobot({ connected: true, preparePlayback: async commands => prepared.push(commands),
    sendNote: async command => notes.push(command.note), disarm: async () => { disarms++; } });
  h.controller.addToQueue('b');
  h.controller.setRepeat('all');
  await h.controller.play();
  h.playback[0].callbacks.onCommand(h.playback[0].schedule.commands[0]);
  h.playback[0].callbacks.onComplete();
  await waitFor(() => prepared.length === 2 && h.playback.length === 2);
  assert.equal(h.controller.getSnapshot().selectedSongId, 'b');
  h.playback[1].callbacks.onComplete();
  await waitFor(() => prepared.length === 3 && h.playback.length === 3);
  assert.equal(h.controller.getSnapshot().selectedSongId, 'a');
  const previous = disarms;
  h.controller.stop();
  h.playback[2].callbacks.onCommand(h.playback[2].schedule.commands[0]);
  assert.equal(notes.length, 1);
  assert.equal(h.audio.notes.length, 0);
  assert.ok(disarms > previous);
});

test('volume scales live USB notes and buffered schedules without changing the arrangement', async () => {
  for (const buffered of [false, true]) {
    const h = harness();
    await h.controller.initialize();
    const commands = h.controller.getSnapshot().schedule.commands;
    const original = commands[0].strength;
    let uploaded;
    let sent;
    h.controller.setRobot({ connected: true, preparePlayback: async notes => { uploaded = notes; },
      sendNote: async note => { sent = note; }, disarm: async () => {} }, buffered);
    h.controller.setVolume(50);
    await h.controller.play();
    h.controller.setVolume(20);
    h.playback[0].callbacks.onCommand(h.playback[0].schedule.commands[0]);
    assert.equal(uploaded[0].strength, buffered ? original * 0.5 : original);
    assert.equal(sent.strength, buffered ? original * 0.5 : original * 20 / 100);
    assert.equal(commands[0].strength, original);
    h.controller.dispose();
  }
});
