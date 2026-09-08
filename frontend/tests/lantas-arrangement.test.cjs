const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');

const arrangement = require('../public/songs/arrangements/lantas.json');
const catalog = require('../public/songs/catalog.json');

test('Lantas begins at the vocal section and removes the incompatible intro', () => {
  assert.equal(arrangement.source.trimmed_intro_beats, 12);
  assert.equal(arrangement.source.trimmed_intro_seconds, 9.6);
  assert.equal(arrangement.tempo_bpm, 86);
  assert.deepEqual(arrangement.tempo_events[0], { beat: 0, bpm: 86 });
  assert.equal(arrangement.notes.length, 972);
  assert.equal(arrangement.notes.filter(note => note.role === 'melody').length, 460);
  assert.equal(arrangement.notes.filter(note => note.role === 'accompaniment').length, 512);
  assert.ok(arrangement.notes.every(note => note.source_beat >= 12));
  assert.equal(Math.min(...arrangement.notes.map(note => note.start)), 0);
});

test('Lantas keeps its vocal-section transposition and tuned performance tempo', async () => {
  assert.equal(arrangement.source.transposition_semitones, -3);
  const entry = catalog.find(candidate => candidate.id === 'lantas');
  const song = await load('src/lib/songLoader.ts', {
    fetch: async () => ({ ok: true, json: async () => arrangement }),
  }).loadSongArrangement(entry);
  assert.equal(song.performance_profile.source_bpm, 86);
  assert.equal(song.performance_profile.tempo_bpm, 77);
  const schedule = load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song, {
    strength: 0.8,
    tempo: 'normal',
    mode: 'melody',
  });
  assert.equal(schedule.song.tempo_bpm, 77);
  assert.equal(schedule.commands.length, 972);
});

test('the targeted importer records the Lantas trim for future regenerations', () => {
  const importer = fs.readFileSync(path.join(__dirname, '../scripts/import-midi-batch.mjs'), 'utf8');
  assert.match(importer, /id: "lantas",[\s\S]*?startBeat: 12,/);
  assert.match(importer, /--song=/);
});
