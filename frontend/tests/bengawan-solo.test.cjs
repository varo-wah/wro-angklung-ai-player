const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { importScore } = require('../scripts/import-bengawan-solo.cjs');

const source = fs.readFileSync(
  path.join(__dirname, '../scripts/sources/Bengawan_Solo_New_Sheet_Expressive.ino'),
  'utf8',
);
const arrangement = require('../public/songs/arrangements/bengawan_solo.json');

test('Bengawan Solo exactly preserves the replacement sheet events and expression', () => {
  assert.deepEqual(importScore(source), arrangement);
  assert.equal(arrangement.notes.length, 109);
  assert.equal(arrangement.tempo_bpm, 76);
  assert.equal(arrangement.metadata.source_end_tick, 512);
  assert.equal(arrangement.metadata.source_end_ms, 101052);
  assert.equal(Math.max(...arrangement.notes.map(note => note.duration)), 3.103);
  assert.ok(arrangement.notes.every(note => note.role === 'melody'));
});

test('catalog and scheduler use the replacement without generic retuning', async () => {
  const entry = require('../public/songs/catalog.json').find(candidate => candidate.id === 'bengawan_solo');
  const song = await load('src/lib/songLoader.ts', {
    fetch: async () => ({ ok: true, json: async () => arrangement }),
  }).loadSongArrangement(entry);
  assert.equal(song.performance_profile, undefined);
  const schedule = load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song, {
    strength: 0.8,
    tempo: 'normal',
    mode: 'melody',
  });
  assert.equal(schedule.song.tempo_bpm, 76);
  assert.equal(schedule.commands.length, 109);
  assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(schedule).overall, 'PASSED');
  assert.ok(schedule.commands.every(command => command.strength >= 0 && command.strength <= 1));
});
