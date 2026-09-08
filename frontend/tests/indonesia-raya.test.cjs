const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { importScore } = require('../scripts/import-indonesia-raya.cjs');
const source = fs.readFileSync(path.join(__dirname, '../scripts/sources/Indonesia_Raya_Angklobot_Clear_Repeated_Notes.ino'), 'utf8');
const saved = require('../public/songs/arrangements/indonesia_raya.json');
test('Indonesia Raya preserves all 192 supplied events and repeated-note articulation', () => {
  assert.deepEqual(importScore(source), saved);
  assert.equal(saved.notes.length, 192);
  assert.equal(saved.tempo_bpm, 92);
  assert.equal(saved.notes[0].note, 'E4');
  assert.equal(saved.notes[0].duration, 0.444);
  // E5 tied duration: 7 ticks (1141ms) less 15ms; repeated D5: 489ms less 110ms.
  assert.equal(saved.notes[3].duration, 1.126);
  assert.equal(saved.notes[5].duration, 0.379);
  for (let i = 1; i < saved.notes.length; i++) {
    assert.ok(saved.notes[i-1].start + saved.notes[i-1].duration <= saved.notes[i].start);
  }
});
test('catalog -> loader -> scheduler exposes Indonesia Raya with safe mapping', async () => {
  const entry = require('../public/songs/catalog.json').find(x => x.id === 'indonesia_raya');
  assert.equal(entry.active, true);
  assert.equal(entry.demo_safe, false);
  const song = await load('src/lib/songLoader.ts', { fetch: async () => ({ ok: true, json: async () => saved }) }).loadSongArrangement(entry);
  const schedule = load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song, { strength: 0.8, tempo: 'normal', mode: 'melody' });
  assert.equal(schedule.commands.length, 192);
  assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(schedule).overall, 'PASSED');
  for (const c of schedule.commands) assert.ok(c.actuator_channel >= 0 && c.actuator_channel < 18);
});
