const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { importScore } = require('../scripts/import-indonesia-pusaka.cjs');

const source = fs.readFileSync(path.join(__dirname, '../scripts/sources/Indonesia_Pusaka_Reference_Score.json'), 'utf8');
const arrangement = require('../public/songs/arrangements/indonesia_pusaka.json');

test('Indonesia Pusaka reproduces the reference melody and discloses chromatic simplifications', () => {
  assert.deepEqual(importScore(source), arrangement);
  assert.equal(arrangement.notes.length, 150);
  assert.equal(arrangement.tempo_bpm, 70);
  assert.equal(arrangement.metadata.pitch_substitutions.length, 4);
  assert.equal(arrangement.metadata.source_end_tick, 528);
  assert.equal(arrangement.metadata.source_end_ms, 113143);
  assert.ok(arrangement.notes.every(note => note.role === 'melody'));
  assert.ok(arrangement.notes.every(note => note.duration >= 0.01));
});

test('Indonesia Pusaka is cataloged and schedules all supplied events safely', async () => {
  const entry = require('../public/songs/catalog.json').find(candidate => candidate.id === 'indonesia_pusaka');
  assert.ok(entry);
  const song = await load('src/lib/songLoader.ts', { fetch: async () => ({ ok: true, json: async () => arrangement }) }).loadSongArrangement(entry);
  assert.equal(song.performance_profile, undefined);
  const schedule = load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song, { strength: 0.8, tempo: 'normal', mode: 'melody' });
  assert.equal(schedule.song.tempo_bpm, 70);
  assert.equal(schedule.commands.length, 150);
  assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(schedule).overall, 'PASSED');
  assert.ok(schedule.commands.every(command => command.strength >= 0 && command.strength <= 1));
});

test('reference phrase pitches, rests and substitutions remain explicit', () => {
  assert.deepEqual(arrangement.notes.slice(0, 8).map(n => n.note), ['G3','C4','E4','C4','G3','C4','E4','A4']);
  assert.deepEqual(arrangement.notes.slice(0, 4).map(n => n.source_beat), [3,3.5,4,5.5]);
  assert.deepEqual(arrangement.notes.filter(n => n.source_verse === 1 && n.source_bar === 7).map(n => n.note), ['A3','F4','D4','B3']);
  assert.deepEqual(arrangement.metadata.pitch_substitutions.map(n => [n.verse,n.bar,n.from,n.to]), [[1,8,'F#4','G4'],[1,16,'F#4','G4'],[2,8,'F#4','G4'],[2,16,'F#4','G4']]);
  assert.ok(arrangement.notes.every(n => n.note === n.source_note || (n.source_note === 'F#4' && n.note === 'G4')));
  assert.equal(arrangement.notes.at(-1).note, 'C4');
});
