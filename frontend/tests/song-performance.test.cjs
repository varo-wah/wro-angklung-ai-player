const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { buildScheduleFromBuiltInSong: build, applyReleaseGaps } = load('src/lib/scheduleBuilder.ts');
const { SONG_PERFORMANCE_PROFILES: profiles } = load('src/lib/songPerformanceProfiles.ts');
const settings = { strength: 0.8, tempo: 'normal', mode: 'melody' };
async function loaded(entry) {
  const a = JSON.parse(fs.readFileSync(path.join(__dirname, '../public', entry.path)));
  return load('src/lib/songLoader.ts', { fetch: async () => ({ ok: true, json: async () => a }) }).loadSongArrangement(entry);
}
test('21 presets uniformly slow attacks, shorten holds, preserve count, pitches and strengths', async () => {
  const catalog = require('../public/songs/catalog.json');
  assert.equal(Object.keys(profiles).length, 21);
  for (const [id, profile] of Object.entries(profiles)) {
    const song = await loaded(catalog.find(e => e.id === id));
    const tuned = build(song, settings);
    const original = build({ ...song, performance_profile: undefined }, settings);
    const scale = song.tempo_bpm / profile.tempo_bpm;
    assert.equal(tuned.song.tempo_bpm, profile.tempo_bpm);
    assert.equal(tuned.commands.length, original.commands.length);
    tuned.commands.forEach((c, i) => {
      const before = original.commands[i];
      assert.equal(c.note, before.note);
      assert.equal(c.strength, before.strength);
      assert.equal(c.start_time_seconds, Math.round(before.start_time_seconds * scale * 1000) / 1000);
      // Compare with the scored hold: the baseline has already had absolute
      // release gaps applied, so scaling that shortened result is not equivalent.
      const source = song.notes.filter(n => !['accompaniment','support'].includes(n.role))[Number(c.command_id.slice(4))-1];
      assert.ok(c.duration_seconds > 0 && c.duration_seconds <= 2);
      assert.ok(c.duration_seconds <= source.duration * (source.playback_duration_multiplier ?? 1) * scale + 0.002);
    });
  }
});
test('Indonesia Raya, Tanah Airku, sparse ballad and hardware trials have no preset', async () => {
  const catalog = require('../public/songs/catalog.json');
  for (const id of ['indonesia_raya', 'tanah_airku', 'bengawan_solo', 'you_are_the_reason', 'cant_help_falling_in_love', 'trial_low_5724_cycle']) {
    const song = await loaded(catalog.find(e => e.id === id));
    assert.equal(song.performance_profile, undefined);
    assert.equal(build(song, settings).song.tempo_bpm, song.tempo_bpm);
  }
});
test('repeat gaps are 60ms where possible and short pulses retain viable duration', () => {
  const commands = [{ actuator_channel: 0, start_time_seconds: 0, duration_seconds: 0.3 },
    { actuator_channel: 0, start_time_seconds: 0.3, duration_seconds: 0.08 }];
  applyReleaseGaps(commands, 0.04, 0.06);
  assert.equal(commands[0].duration_seconds, 0.24);
  assert.equal(commands[1].duration_seconds, 0.07);
});
