const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const load = require('./load-typescript.cjs');
const { multiplierFor } = require('../scripts/tune-fireflies.cjs');
const { buildScheduleFromBuiltInSong: build } = load('src/lib/scheduleBuilder.ts');
const { encodeArduinoNoteCommand: encode } = load('src/lib/arduinoSerial.ts');
const arrangement = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/songs/arrangements/fireflies_owl_city.json')));
const settings = { strength: 0.8, tempo: 'normal', mode: 'harmony' };
async function loaded(data) {
  return load('src/lib/songLoader.ts', { fetch: async () => ({ ok: true, json: async () => data }) })
    .loadSongArrangement({ id: data.id, title: data.title, path: '/test.json' }).then(song => ({ ...song, performance_profile: undefined }));
}
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
test('Fireflies changes only 599 multipliers, preserving complete original arrangement', () => {
  const original = structuredClone(arrangement);
  assert.equal(original.notes.length, 599);
  for (const note of original.notes) {
    assert.equal(note.playback_strength_multiplier, multiplierFor(note));
    delete note.playback_strength_multiplier;
    delete note.playback_duration_multiplier;
  }
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(sorted(original))).digest('hex'),
    '4ad6995b3dd3cdc5be713adeb072eb68e4ebe71aa748b9ca156a6c78029abcaf');
});
test('Fireflies JSON -> loader -> schedule -> unchanged serial encoding', async () => {
  const song = await loaded(arrangement);
  const commands = build(song, settings).commands;
  for (const [index, note] of song.notes.entries()) {
    const command = commands.find(c => c.command_id === `cmd_${String(index + 1).padStart(4, "0")}`);
    assert.equal(command.strength, ["accompaniment", "support"].includes(note.role) ? 1 : Math.min(1, Math.round(0.8 * note.playback_strength_multiplier * 100) / 100));
    if (["accompaniment", "support"].includes(note.role)) assert.ok(command.duration_seconds <= 0.18);
    assert.ok(command.strength >= 0 && command.strength <= 1);
    assert.equal(Number(encode(command).split(',')[3]), Math.round(command.strength * 1000));
  }
  const highShort = commands.find(c => c.note === 'B5' && c.start_time_seconds === 0.326);
  assert.equal(highShort.strength, 1);
  assert.ok(highShort.strength > commands.find(c => c.note === 'G3').strength);
  assert.ok(highShort.strength > commands.find(c => c.note === 'B5' && c.duration_seconds >= 0.36).strength);
  assert.equal(Math.min(...commands.map(c => c.strength)), Math.min(...song.notes.map(n => ["accompaniment", "support"].includes(n.role) ? 1 : Math.min(1, Math.round(0.8 * n.playback_strength_multiplier * 100) / 100))));
  assert.equal(Math.max(...commands.map(c => c.strength)), 1);
});
test('missing multiplier retains legacy strengths in seconds/tracks and both modes', async () => {
  const song = await loaded({ id: 'legacy', title: 'Legacy', tempo_bpm: 92,
    tracks: [{ role: 'melody', notes: [{ note: 'C5', start: 0, duration: 1, velocity: 10 }] }] });
  assert.equal(build(song, settings).commands[0].strength, 0.8);
  assert.deepEqual(Array.from(build(song, { ...settings, mode: 'harmony' }).commands, c => c.strength).sort(), [0.8]);
  song.notes[0].playback_strength_multiplier = 1;
  assert.equal(build(song, settings).commands[0].strength, 0.8);
});
test('seconds notes retain multiplier; Extra retains authored dynamics without synthetic notes; slower mode preserves strength', async () => {
  const song = await loaded({ id: 'seconds', title: 'Seconds', tempo_bpm: 92,
    notes: [{ note: 'C5', start: 0, duration: 1, playback_strength_multiplier: 1.25 }] });
  assert.equal(song.notes[0].playback_strength_multiplier, 1.25);
  assert.deepEqual(Array.from(build(song, { ...settings, mode: 'harmony', tempo: 'slower' }).commands, c => c.strength).sort(), [1]);
  song.notes[0].playback_strength_multiplier = 10;
  assert.equal(build(song, settings).commands[0].strength, 1);
  for (const invalid of [-1, NaN, Infinity, null, '1.2']) {
    song.notes[0].playback_strength_multiplier = invalid;
    assert.throws(() => build(song, settings), /Invalid playback strength/);
  }
});
test('low notes retain the boost throughout Fireflies, including sustained notes', async () => {
  const song = await loaded(arrangement);
  const commands = build(song, settings).commands;
  assert.equal(commands.find(c => c.note === 'G3' && c.start_time_seconds === 0).strength, 0.84);
  assert.equal(commands.find(c => c.note === 'F4' && c.start_time_seconds === 3.75).strength, 0.76);
  assert.equal(multiplierFor({ note: 'G3', beat: 16, duration_beats: 0.25 }), 1.05);
  assert.equal(multiplierFor({ note: 'G3', beat: 0, duration_beats: 0.75 }), 0.9);
});

test('Articulation preserves source rests, starts and strength', async () => {
  const song = await loaded(arrangement);
  const commands = build(song, settings).commands;
  const original = await loaded({ ...arrangement, notes: arrangement.notes.map(({ playback_duration_multiplier, ...note }) => note) });
  const baseline = build(original, settings).commands;
  commands.forEach((command, i) => {
    const before = baseline[i];
    assert.equal(command.start_time_seconds, before.start_time_seconds);
    assert.equal(command.note, before.note);
    assert.equal(command.strength, before.strength);
    assert.ok(command.duration_seconds <= before.duration_seconds);
    assert.equal(Number(encode(command).split(',')[2]), Math.round(command.duration_seconds * 1000));
  });
});

test('Fireflies opening is preserved while later bass yields to high melody', () => {
  assert.equal(multiplierFor({ note: 'G3', beat: 0, duration_beats: 0.25, role: 'melody' }), 1.05);
  assert.equal(multiplierFor({ note: 'C5', beat: 15, duration_beats: 0.5, role: 'melody' }), 1.15);
  assert.equal(multiplierFor({ note: 'G3', beat: 32, duration_beats: 0.75, role: 'accompaniment' }), 0.75);
  assert.equal(multiplierFor({ note: 'C5', beat: 32, duration_beats: 0.5, role: 'melody' }), 1.2);
});
