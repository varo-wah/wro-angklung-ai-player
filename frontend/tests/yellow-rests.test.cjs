const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const song = require('../public/songs/arrangements/yellow_coldplay.json');

test('Yellow keeps vocal holds and rests instead of octave-raised piano fillers', async () => {
  const melody = song.notes.filter(n => n.role === 'melody');
  // In the piano source, beat 50 has a two-beat vocal E; beat 51
  // contains only the lower chord. The old top-onset extraction retriggered E5.
  assert.equal(melody.find(n => n.beat === 50).duration_beats, 2);
  assert.equal(melody.find(n => n.beat === 56.5).duration_beats, 3.25);
  for (const beat of [51, 52, 57, 58, 59, 60, 64, 65, 66, 67, 195, 201, 225, 363]) {
    assert.ok(!melody.some(n => n.beat === beat), `unexpected filler at ${beat}`);
  }
  // Genuine E5 in both the verse and chorus must remain.
  for (const beat of [49, 50, 134.5, 135, 254.5, 255]) {
    assert.ok(melody.some(n => n.beat === beat && n.note === 'E5'));
  }
  const loaded = await load('src/lib/songLoader.ts', {
    fetch: async () => ({ok: true, json: async () => song}),
  }).loadSongArrangement({id: song.id, title: song.title, path: '/test'});
  const {buildScheduleFromBuiltInSong: build} = load('src/lib/scheduleBuilder.ts');
  const schedule = build(loaded, {strength: .8, tempo: 'normal', mode: 'melody'});
  const secondsPerBeat = 60 / schedule.song.tempo_bpm;
  const held = schedule.commands.find(c => Math.abs(c.start_time_seconds - 50 * secondsPerBeat) < .002);
  assert.ok(held.duration_seconds > 1.4 && held.duration_seconds <= 2);
  assert.ok(!schedule.commands.some(c => c.start_time_seconds >= 52 * secondsPerBeat && c.start_time_seconds < 52.5 * secondsPerBeat - .002));
  assert.ok(schedule.commands.every(c => c.duration_seconds <= 2));
});
