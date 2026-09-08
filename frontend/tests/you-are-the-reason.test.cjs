const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { importScore } = require('../scripts/import-you-are-the-reason.cjs');

const source = fs.readFileSync(
  path.join(__dirname, '../scripts/sources/You_Are_The_Reason_Dynamic_Hold_Softer_Lows.ino'),
  'utf8',
);
const arrangement = require('../public/songs/arrangements/you_are_the_reason.json');

test('You Are the Reason exactly preserves the supplied score timing and dynamic rules', () => {
  assert.deepEqual(importScore(source), arrangement);
  assert.equal(arrangement.notes.length, 827);
  assert.equal(arrangement.tempo_bpm, 86);
  assert.equal(arrangement.metadata.source_end_ms, 193600);
  assert.equal(Math.min(...arrangement.notes.map(note => note.playback_strength_multiplier)), 0.8);
  assert.equal(Math.max(...arrangement.notes.map(note => note.playback_strength_multiplier)), 1.25);
  assert.equal(Math.max(...arrangement.notes.map(note => note.duration)), 0.3);
  assert.ok(arrangement.notes.every(note => note.role === 'melody'));
  assert.ok(arrangement.notes.some(note => note.source_softer_low_repeat));
});

test('catalog and scheduler use the replacement without generic retuning', async () => {
  const entry = require('../public/songs/catalog.json').find(candidate => candidate.id === 'you_are_the_reason');
  const song = await load('src/lib/songLoader.ts', {
    fetch: async () => ({ ok: true, json: async () => arrangement }),
  }).loadSongArrangement(entry);
  assert.equal(song.performance_profile, undefined);
  const schedule = load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song, {
    strength: 0.8,
    tempo: 'normal',
    mode: 'melody',
  });
  assert.equal(schedule.song.tempo_bpm, 86);
  assert.equal(schedule.commands.length, 827);
  assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(schedule).overall, 'PASSED');
  assert.ok(schedule.commands.every(command => command.strength >= 0 && command.strength <= 1));
});
