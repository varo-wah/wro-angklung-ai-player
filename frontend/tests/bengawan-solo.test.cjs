const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { importScore } = require('../scripts/import-bengawan-solo.cjs');

const source = fs.readFileSync(
  path.join(__dirname, '../scripts/sources/Bengawan_Solo_User_Score.json'),
  'utf8',
);
const arrangement = require('../public/songs/arrangements/bengawan_solo.json');

test('Bengawan Solo reproduces the user score with explicit tempo and no pitch substitutions', () => {
  assert.deepEqual(importScore(source), arrangement);
  assert.equal(arrangement.notes.length, 108);
  assert.equal(arrangement.tempo_bpm, 76);
  assert.equal(arrangement.metadata.source_end_tick, 512);
  assert.equal(arrangement.metadata.source_end_ms, 101053);
  assert.equal(Math.max(...arrangement.notes.map(note => note.duration)), 3.103);
  assert.equal(arrangement.metadata.transposition_semitones, 0);
  assert.equal(arrangement.metadata.pitch_substitutions, 0);
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
  assert.equal(schedule.commands.length, 108);
  assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(schedule).overall, 'PASSED');
  assert.ok(schedule.commands.every(command => command.strength >= 0 && command.strength <= 1));
});

// Independent phrase anchors read from the user's score, including octave and rhythm.
test('score preserves opening, bridge and cross-bar tie', () => {
  assert.deepEqual(arrangement.notes.slice(0, 5).map(n => n.note), ['G4', 'G4', 'A4', 'E4', 'G4']);
  assert.deepEqual(arrangement.notes.slice(0, 5).map(n => n.source_beat), [1, 1.5, 2, 3.5, 4]);
  assert.deepEqual(arrangement.notes.filter(n => n.source_bar === 17).map(n => n.note), ['C5', 'C5', 'C5', 'C5', 'C5', 'D5', 'A4']);
  const tie = arrangement.notes.find(n => n.source_beat === 86);
  assert.equal(tie.note, 'A4');
  assert.equal(tie.source_duration_beats, 2.5);
  assert.ok(!arrangement.notes.some(n => n.source_beat === 88));
  assert.equal(arrangement.notes.find(n => n.source_beat === 88.5).note, 'A4');
  assert.equal(arrangement.notes.at(-1).note, 'C5');
  assert.ok(arrangement.notes.every(n => ['E4','F4','G4','A4','B4','C5','D5','E5'].includes(n.note)));
});
