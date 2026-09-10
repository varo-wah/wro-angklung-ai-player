const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { RobotSessionStore, SessionError } = load('src/lib/robotSessionStore.ts');
function route() {
  const store = new RobotSessionStore();
  return load('src/app/api/robot/session/route.ts', {}, { '@/lib/robotSessionStore': { robotSessionStore: store, SessionError } });
}
function post(body, { origin = 'http://localhost:3000', host = 'localhost:3000', token = '' } = {}) {
  return new Request('http://localhost:3000/api/robot/session', { method: 'POST', headers: { Origin: origin, Host: host, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
}
test('HTTP route prevents cross-origin requests and non-local browser controller claims', async () => {
  const { POST } = route();
  assert.equal((await POST(post({ op: 'claim' }, { origin: 'https://other.example' }))).status, 403);
  assert.equal((await POST(post({ op: 'claim' }, { origin: 'https://demo.example', host: 'demo.example' }))).status, 403);
  assert.equal((await POST(post({ op: 'claim' }))).status, 200);
});
test('HTTP pairing, status and rejected disconnected commands use real route validation', async () => {
  const { POST, GET } = route();
  const host = await (await POST(post({ op: 'claim' }))).json();
  const client = await (await POST(post({ op: 'pair', code: host.code }, { origin: 'https://demo.example', host: 'demo.example' }))).json();
  const status = await GET(new Request('http://localhost:3000/api/robot/session'));
  assert.equal(status.headers.get('cache-control'), 'no-store');
  const view = await status.json();
  assert.equal(view.hostOnline, true); assert.equal(view.arduino.status, 'disconnected');
  assert.equal(view.snapshot, undefined);
  const command = await POST(post({ op: 'command', id: 'test', action: { type: 'play' } }, { token: client.token }));
  assert.equal(command.status, 409);
  assert.match((await command.json()).error, /not connected/);
  assert.equal((await POST(post({ op: 'heartbeat', arduino: { status: 'connected' } }, { token: host.token }))).status, 400);
});
