const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { tuneArrangement, strengthFor } = require('../scripts/tune-library-balance.cjs');
const { buildScheduleFromBuiltInSong: build } = load('src/lib/scheduleBuilder.ts');
const root = path.join(__dirname, '../public/songs/arrangements');
test('balance is role-aware and repeatable, preserving untargeted notes and trial arrangements', () => {
  assert.equal(strengthFor({ note: 'G3', role: 'accompaniment' }), 0.9);
  assert.equal(strengthFor({ note: 'G3', role: 'melody' }), undefined);
  assert.equal(strengthFor({ note: 'C5' }, 'melody'), 1.05);
  assert.equal(strengthFor({ note: 'C5', role: 'accompaniment' }), undefined);
  const trial = { id: 'test', category: 'hardware_trial', notes: [{ note: 'G3', role: 'accompaniment' }] };
  assert.deepEqual(tuneArrangement(trial), trial);
  const special = { id: 'fireflies_owl_city', notes: [{ note: 'G3', role: 'accompaniment', playback_strength_multiplier: 0.75 }] };
  assert.deepEqual(tuneArrangement(special), special);
});
test('all musical files retain deterministic balance and safe scheduled strengths', async () => {
  for (const name of fs.readdirSync(root).filter(n => n.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(root, name)));
    assert.deepEqual(tuneArrangement(data), data, name);
    if (data.category === 'hardware_trial') continue;
    const song = await load('src/lib/songLoader.ts', { fetch: async () => ({ ok: true, json: async () => data }) })
      .loadSongArrangement({ id: data.id, title: data.title, path: '/test.json' });
    if (name === 'perfect.json') {
      // Legacy arrangement already contains notes above the physical C6 ceiling.
      assert.throws(() => build(song, { strength: 0.8, tempo: 'normal', mode: 'melody' }), /No frontend instrument mapping/);
      continue;
    }
    const commands = build(song, { strength: 0.8, tempo: 'normal', mode: 'melody' }).commands;
    assert.ok(commands.length > 0, name);
    assert.ok(commands.every(c => Number.isFinite(c.strength) && c.strength >= 0 && c.strength <= 1), name);
    if (!['fireflies_owl_city', 'indonesia_raya', 'indonesia_pusaka', 'bengawan_solo', 'you_are_the_reason'].includes(data.id)) {
      for (const c of commands) {
        assert.ok([0.72, 0.8, 0.84].includes(c.strength), `${name}: ${c.strength}`);
      }
    }
  }
});
test('all arrangement data except strength matches the pre-balance snapshot', () => {
  const crypto = require('node:crypto');
  const hashes = require('./library-balance-baseline.json');
  const strip = x => Array.isArray(x) ? x.map(strip) : x && typeof x === 'object'
    ? Object.fromEntries(Object.keys(x).filter(k => k !== 'playback_strength_multiplier').sort().map(k => [k, strip(x[k])])) : x;
  for (const [name, hash] of Object.entries(hashes)) {
    const data = JSON.parse(fs.readFileSync(path.join(root, name)));
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(strip(data))).digest('hex'), hash, name);
  }
});
