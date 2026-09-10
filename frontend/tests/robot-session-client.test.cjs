const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('node:crypto');
const load = require('./load-typescript.cjs');
const { RobotSessionStore } = load('src/lib/robotSessionStore.ts');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('two real React clients pair over LAN-compatible APIs, mirror state, execute once and interrupt an in-flight request', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3000' });
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const store = new RobotSessionStore();
  const executions = [], mirrored = [], halts = [];
  let finishRequest;
  const blocked = new Promise(resolve => finishRequest = resolve);
  const fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    const token = (options.headers.Authorization ?? '').replace(/^Bearer /, '');
    const query = new URL(url, 'http://localhost:3000').searchParams;
    try {
      let result;
      if (!body) result = query.has('id') ? store.result(token, query.get('id')) : store.view(token || undefined, Number(query.get('since') ?? -1));
      else if (body.op === 'claim') result = store.claim();
      else if (body.op === 'pair') result = store.pair(body.code);
      else if (body.op === 'release') { store.release(token); result = {}; }
      else if (body.op === 'command') result = store.enqueue(token, body.id, body.action);
      else result = store.heartbeat(token, body.arduino, body.snapshot, body.acknowledgements, body.cancelOutstanding);
      return { ok: true, json: async () => result };
    } catch (error) { return { ok: false, json: async () => ({ error: error.message }) }; }
  };
  const { useRobotSession } = load('src/hooks/useRobotSession.ts', { fetch, sessionStorage: dom.window.sessionStorage, crypto: { getRandomValues: array => webcrypto.getRandomValues(array) }, AbortSignal }, {});
  let host, remote;
  function Host() {
    host = useRobotSession({ arduino: { status: 'connected', outputMode: 'active', message: 'Fake USB for test' }, snapshot: () => ({ sourceLabel: 'Test song', playbackState: 'idle', sourceTabId: 'host', updatedAt: Date.now(), chatMessages: [] }), applySnapshot: () => { throw new Error('Host must not apply remote state'); }, halt: () => halts.push('halt'), interrupt: () => halts.push('interrupt'), execute: async command => {
      executions.push(command.action.type);
      if (command.action.type === 'request') await blocked;
      return { ok: true, value: true };
    } }); return null;
  }
  function Remote() {
    remote = useRobotSession({ arduino: { status: 'unsupported' }, snapshot: () => { throw new Error('Remote cannot publish authoritative state'); }, applySnapshot: snapshot => mirrored.push(snapshot), halt() {}, interrupt() {}, execute: () => { throw new Error('Remote cannot execute commands'); } }); return null;
  }
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(Host), React.createElement(Remote))));
    await React.act(async () => host.enableHost());
    await React.act(async () => sleep(550));
    await React.act(async () => remote.pair(host.code));
    await React.act(async () => sleep(550));
    assert.equal(remote.status.arduino.status, 'connected'); assert(mirrored.length > 0);
    await React.act(async () => remote.send({ type: 'play' }));
    assert.deepEqual(executions, ['play']);
    let request;
    await React.act(async () => { request = remote.send({ type: 'request', text: 'Hello', language: 'en' }).catch(error => error.message); await sleep(550); });
    assert(executions.includes('request'));
    await React.act(async () => remote.send({ type: 'estop' }));
    assert(executions.includes('estop')); assert(halts.includes('interrupt'));
    assert.match(await request, /Cancelled/);
    await React.act(async () => { finishRequest(); await sleep(550); });
    assert.equal(executions.filter(type => type === 'play').length, 1);
    await React.act(async () => host.releaseHost());
    await React.act(async () => sleep(550));
    assert.equal(remote.status.hostOnline, false);
    await assert.rejects(remote.send({ type: 'play' }), /offline/);
  } finally {
    finishRequest();
    await React.act(async () => root.unmount());
    dom.window.close();
  }
});
