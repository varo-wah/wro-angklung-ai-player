const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const SONG_ROOT = path.resolve(__dirname, "../public/songs");
const RACK = ["G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"];
const IMPORTED_IDS = [
  "a_whole_new_world",
  "all_of_me",
  "bengawan_solo",
  "bubuy_bulan",
  "die_with_a_smile",
  "just_the_way_you_are",
  "lantas",
  "love_story",
  "peaches",
  "river_flows_in_you",
  "shape_of_you",
  "someone_you_loved",
  "tanah_airku",
  "tokecang",
  "see_you_again",
  "you_are_the_reason",
];

test("the MIDI batch is uniquely cataloged and every arrangement passes current rack and motor limits", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(SONG_ROOT, "catalog.json"), "utf8"));
  assert.equal(new Set(catalog.map((entry) => entry.id)).size, catalog.length, "catalog IDs must be unique");

  for (const id of IMPORTED_IDS) {
    const entry = catalog.find((candidate) => candidate.id === id);
    assert.ok(entry, `${id} must be cataloged`);
    assert.equal(entry.playable, true, `${id} must be playable in the simulator`);
    assert.equal(entry.demo_safe, false, `${id} must not claim physical motor certification`);
    assert.equal(entry.physical_rack_map, "G3-C6");

    const arrangementPath = path.join(SONG_ROOT, entry.path.replace(/^\/songs\//, ""));
    const arrangement = JSON.parse(fs.readFileSync(arrangementPath, "utf8"));
    assert.equal(arrangement.id, id);
    assert.ok(arrangement.notes.length > 0, `${id} must contain notes`);

    const startsByNote = new Map();
    const overlapEvents = [];
    for (const [index, note] of arrangement.notes.entries()) {
      assert.ok(RACK.includes(note.note), `${id} notes[${index}] is outside G3-C6`);
      assert.doesNotMatch(note.note, /[#b]/, `${id} notes[${index}] is chromatic`);
      assert.ok(Number.isFinite(note.start) ? note.start >= 0 : Number.isFinite(note.beat) && note.beat >= 0);
      const duration = Number.isFinite(note.duration) ? note.duration : note.duration_beats * 60 / arrangement.tempo_bpm;
      const start = Number.isFinite(note.start) ? note.start : note.beat * 60 / arrangement.tempo_bpm;
      assert.ok(duration >= 0.01, `${id} notes[${index}] is shorter than the motor limit`);
      overlapEvents.push({ time: start, delta: 1 }, { time: start + duration, delta: -1 });
      const previousStart = startsByNote.get(note.note);
      if (previousStart !== undefined) assert.ok(start - previousStart >= 0.01 - 1e-9, `${id} retriggers ${note.note} too quickly`);
      startsByNote.set(note.note, start);
    }

    overlapEvents.sort((left, right) => left.time - right.time || left.delta - right.delta);
    let active = 0;
    let peak = 0;
    for (const event of overlapEvents) {
      active += event.delta;
      peak = Math.max(peak, active);
    }
    assert.ok(peak <= 18, `${id} exceeds the current simultaneous-actuator limit`);
  }
});
