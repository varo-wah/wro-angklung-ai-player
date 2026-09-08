const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

function loadRoute(fetch, env = {}) {
  return load('src/app/api/system/status/route.ts', {
    AbortController,
    Date,
    Response,
    fetch,
    process: { env },
  });
}

test('combined system status reports online without exposing private service URLs', async () => {
  const requested = [];
  const { GET } = loadRoute(async (url, options) => {
    requested.push(url);
    assert.equal(options.cache, 'no-store');
    if (url.endsWith('/api/tags')) return Response.json({ models: [{ name: 'test:latest' }] });
    return new Response('whisper.cpp', { status: 200 });
  }, {
    OLLAMA_BASE_URL: 'http://localhost:11435/',
    OLLAMA_SONG_REQUEST_MODEL: 'test:latest',
    WHISPER_SERVER_URL: 'http://localhost:8088/',
  });

  const response = await GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.status, 'online');
  assert.deepEqual(JSON.parse(JSON.stringify(body.services)), {
    ollama: { available: true, model: 'test:latest', modelAvailable: true },
    whisper: { available: true },
    website: { available: true },
  });
  assert.deepEqual(requested.sort(), ['http://localhost:11435/api/tags', 'http://localhost:8088/']);
  assert.equal(JSON.stringify(body).includes('localhost'), false);
});

test('combined system status reports limited when a dependency is unavailable', async () => {
  const { GET } = loadRoute(async (url) => {
    if (url.endsWith('/api/tags')) return Response.json({ models: [] });
    throw new Error('Whisper is stopped');
  });
  const response = await GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, 'limited');
  assert.equal(body.services.website.available, true);
  assert.equal(body.services.whisper.available, false);
  assert.equal(body.services.ollama.available, true);
  assert.equal(body.services.ollama.modelAvailable, false);
});

test('combined system status supports browser CORS preflight', async () => {
  const { OPTIONS } = loadRoute(async () => { throw new Error('not called'); });
  const response = await OPTIONS();
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
});
