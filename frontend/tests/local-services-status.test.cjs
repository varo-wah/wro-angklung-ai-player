const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

for (const [service, path, env, expectedUrl, healthy] of [
  ['Whisper', 'speech', { WHISPER_SERVER_URL: 'http://localhost:8088/' }, 'http://localhost:8088/', {}],
  ['Ollama', 'ai', { OLLAMA_BASE_URL: 'http://localhost:11435/', OLLAMA_SONG_REQUEST_MODEL: 'test:latest' }, 'http://localhost:11435/api/tags', { models: [{ name: 'test:latest' }] }],
]) {
  test(`${service} health uses server configuration and never exposes its URL`, async () => {
    const { GET } = load(`src/app/api/${path}/status/route.ts`, { Response, AbortController, process: { env }, fetch: async (url, options) => {
      assert.equal(url, expectedUrl); assert.equal(options.cache, 'no-store');
      return Response.json(healthy);
    } });
    const response = await GET();
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json(); assert.equal(body.available, true);
    assert.equal(JSON.stringify(body).includes('localhost'), false);
    if (service === 'Ollama') assert.equal(body.modelAvailable, true);
  });
  for (const failure of ['http', 'network', 'abort']) test(`${service} reports ${failure} failure without leaking details`, async () => {
    const { GET } = load(`src/app/api/${path}/status/route.ts`, { Response, AbortController, process: { env }, fetch: async () => {
      if (failure === 'http') return new Response('private upstream error', { status: 500 });
      throw new Error(failure === 'abort' ? 'AbortError' : expectedUrl);
    } });
    const response = await GET(); assert.equal(response.status, 503);
    const body = await response.json(); assert.equal(body.available, false);
    assert.equal(JSON.stringify(body).includes(expectedUrl), false);
  });
}
test('Ollama distinguishes a reachable service from a missing model', async () => {
  const { GET } = load('src/app/api/ai/status/route.ts', { Response, AbortController, process: { env: {} }, fetch: async url => {
    assert.equal(url, 'http://127.0.0.1:11434/api/tags'); return Response.json({ models: [] });
  } });
  const response = await GET(); const body = await response.json();
  assert.equal(body.available, true); assert.equal(body.modelAvailable, false); assert.equal(body.model, 'llama3.2:latest');
});
