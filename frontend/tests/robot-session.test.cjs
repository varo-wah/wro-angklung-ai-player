const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { RobotSessionStore } = load('src/lib/robotSessionStore.ts');
const { parseRobotAction, HOST_LEASE_MS, COMMAND_QUEUE_MS } = load('src/lib/robotSession.ts');
const connected = { status: 'connected', outputMode: 'active', message: 'USB connected' };
function session() {
  let now = 10000;
  const store = new RobotSessionStore(() => now);
  const host = store.claim();
  const client = store.pair(host.code);
  store.heartbeat(host.token, connected);
  return { store, host, client, advance: ms => now += ms };
}
test('only one controller owns the session and only paired clients can send supported actions', () => {
  const { store, host, client } = session();
  assert.throws(() => store.claim(), /Another Mac tab/);
  assert.throws(() => store.pair('000000'), /Incorrect code/);
  assert.throws(() => store.enqueue('intruder', 'one', { type: 'play' }), /Pair this device/);
  assert.throws(() => parseRobotAction({ type: 'raw_serial', command: 'ARM' }), /Unsupported/);
  store.enqueue(client.token, 'one', parseRobotAction({ type: 'play' }));
  assert.equal(store.heartbeat(host.token, connected).commands[0].action.type, 'play');
});
test('status reports the USB owner; snapshots and pairing secrets are not public', () => {
  const { store, host, client } = session();
  store.heartbeat(host.token, connected, { playbackState: 'playing', sourceLabel: 'Song', chatMessages: ['private'] });
  const publicView = store.view();
  assert.equal(publicView.arduino.status, 'connected');
  assert.equal(publicView.playbackState, 'playing');
  assert.equal(publicView.snapshot, undefined);
  assert.equal(publicView.code, undefined);
  assert.equal(store.view(client.token).snapshot.chatMessages[0], 'private');
  assert.equal(store.view(client.token, publicView.revision).snapshot, undefined);
});
test('command retries are deduplicated and delivered once, results belong to the sender', () => {
  const { store, host, client } = session();
  store.enqueue(client.token, 'one', { type: 'play' });
  store.enqueue(client.token, 'one', { type: 'play' });
  assert.equal(store.heartbeat(host.token, connected).commands.length, 1);
  assert.equal(store.heartbeat(host.token, connected).commands.length, 0);
  store.heartbeat(host.token, connected, undefined, [{ id: 'one', result: { ok: true, value: true } }]);
  assert.equal(store.result(client.token, 'one').result.value, true);
  assert.throws(() => store.result('intruder', 'one'), /not found/);
});
test('stop preempts an in-flight AI request and cancels queued playback', () => {
  const { store, host, client } = session();
  store.enqueue(client.token, 'ai', { type: 'request', text: 'Play a song', language: 'en' });
  store.heartbeat(host.token, connected);
  store.enqueue(client.token, 'play', { type: 'play' });
  store.enqueue(client.token, 'stop', { type: 'estop' });
  const commands = store.heartbeat(host.token, connected).commands;
  assert.deepEqual(Array.from(commands, c => c.id), ['stop']);
  assert.equal(store.result(client.token, 'ai').result.ok, false);
  assert.equal(store.result(client.token, 'play').result.ok, false);
  store.heartbeat(host.token, connected, undefined, [{ id: 'ai', result: { ok: true } }]);
  assert.equal(store.result(client.token, 'ai').result.ok, false, 'late AI acknowledgement cannot restore a cancelled command');
});
test('Mac stop cancels commands waiting at the server', () => {
  const { store, host, client } = session();
  store.enqueue(client.token, 'play', { type: 'play' });
  assert.equal(store.heartbeat(host.token, connected, undefined, [], true).commands.length, 0);
  assert.match(store.result(client.token, 'play').result.error, /Mac operator/);
});
test('USB loss rejects commands without silently falling back to simulation', () => {
  const { store, host, client } = session();
  store.enqueue(client.token, 'play', { type: 'play' });
  store.heartbeat(host.token, { ...connected, status: 'disconnected' });
  assert.equal(store.result(client.token, 'play').result.ok, false);
  assert.throws(() => store.enqueue(client.token, 'two', { type: 'play' }), /not connected/);
});
test('lease loss invalidates ownership and pairing; old commands never replay after recovery', () => {
  const { store, host, client, advance } = session();
  store.enqueue(client.token, 'play', { type: 'play' });
  advance(HOST_LEASE_MS);
  assert.equal(store.view().hostOnline, false);
  assert.throws(() => store.heartbeat(host.token, connected), /expired/);
  assert.equal(store.result(client.token, 'play').result.ok, false);
  const replacement = store.claim();
  assert.equal(store.heartbeat(replacement.token, connected).commands.length, 0);
  assert.throws(() => store.enqueue(client.token, 'old', { type: 'play' }), /Pair this device/);
});
test('queued commands expire even while host remains alive but busy', () => {
  const { store, host, client, advance } = session();
  store.enqueue(client.token, 'ai', { type: 'request', text: 'Hello', language: 'en' });
  store.heartbeat(host.token, connected);
  store.enqueue(client.token, 'play', { type: 'play' });
  for (let i = 0; i < 3; i++) { advance(3000); store.heartbeat(host.token, connected); }
  assert(COMMAND_QUEUE_MS < 9000);
  assert.match(store.result(client.token, 'play').result.error, /expired/);
});
test('delayed post-speech playback is tied to the paired device that requested the song', () => {
  const { store, host, client } = session();
  const other = store.pair(host.code);
  store.enqueue(client.token, 'request', { type: 'request', text: 'Play', language: 'en' });
  store.heartbeat(host.token, connected);
  store.heartbeat(host.token, connected, undefined, [{ id: 'request', result: { ok: true, pending: true } }]);
  assert.throws(() => store.enqueue(other.token, 'steal', { type: 'start_pending', requestId: 'request' }), /No pending song/);
  store.enqueue(client.token, 'start', { type: 'start_pending', requestId: 'request' });
  assert.equal(store.heartbeat(host.token, connected).commands[0].id, 'start');
});
