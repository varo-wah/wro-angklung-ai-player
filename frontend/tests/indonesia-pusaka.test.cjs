const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { importScore } = require('../scripts/import-indonesia-pusaka.cjs');

const source = fs.readFileSync(path.join(__dirname, '../scripts/sources/Indonesia_Pusaka_Expressive.ino'), 'utf8');
const arrangement = require('../public/songs/arrangements/indonesia_pusaka.json');

test('Indonesia Pusaka preserves the supplied expressive score and tempo change', () => {
  assert.deepEqual(importScore(source), arrangement);
  assert.equal(arrangement.notes.length, 173);
  assert.equal(arrangement.tempo_bpm, 65);
  assert.deepEqual(arrangement.tempo_events, [{ start_tick: 0, bpm: 65 }, { start_tick: 452, bpm: 66 }]);
  assert.equal(arrangement.metadata.source_end_tick, 516);
  assert.equal(arrangement.metadata.source_end_ms, 118852);
  assert.ok(arrangement.notes.some(note => note.role === 'accompaniment'));
  assert.ok(arrangement.notes.every(note => note.duration >= 0.01));
});

test('Indonesia Pusaka is cataloged and schedules all supplied events safely', async () => {
  const entry = require('../public/songs/catalog.json').find(candidate => candidate.id === 'indonesia_pusaka');
  assert.ok(entry);
  const song = await load('src/lib/songLoader.ts', { fetch: async () => ({ ok: true, json: async () => arrangement }) }).loadSongArrangement(entry);
  assert.equal(song.performance_profile, undefined);
  const schedule = load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song, { strength: 0.8, tempo: 'normal', mode: 'melody' });
  assert.equal(schedule.song.tempo_bpm, 65);
  assert.equal(schedule.commands.length, 173);
  assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(schedule).overall, 'PASSED');
  assert.ok(schedule.commands.every(command => command.strength >= 0 && command.strength <= 1));
});
