#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import toneMidi from "@tonejs/midi";

const { Midi } = toneMidi;

const SOURCE_DIRECTORY =
  process.argv.find((argument) => argument.startsWith("--source="))?.slice("--source=".length) ??
  "/Users/williamhartono/Desktop/J.A.R.V.I.S./ECs/Competitions/WRO/Song Library/New Midis";
const WRITE = process.argv.includes("--write");
const SONG_ID = process.argv.find((argument) => argument.startsWith("--song="))?.slice("--song=".length);
const ROOT = path.resolve(import.meta.dirname, "../..");
const ARRANGEMENTS_DIRECTORY = path.join(ROOT, "frontend/public/songs/arrangements");
const CATALOG_PATH = path.join(ROOT, "frontend/public/songs/catalog.json");

const RACK = ["G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"];
const NATURAL_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const MELODY_RANGE = [67, 84];
const ACCOMPANIMENT_RANGE = [55, 65];
const MIN_DURATION_SECONDS = 0.01;
const MAX_DRAFT_ACTIVATION_SECONDS = 0.75;
const MAX_SIMULTANEOUS_ACTUATORS = 18;
const MIN_SAME_ACTUATOR_GAP_SECONDS = 0.01;

const SONGS = [
  {
    file: "A Whole New World.mid",
    id: "a_whole_new_world",
    title: "A Whole New World",
    artist: "",
    category: "musical_film",
    difficulty: "hard",
    priority: "medium",
    aliases: ["a whole new world", "whole new world", "aladdin"],
    melody: { track: 2, mode: "full" },
    accompaniment: { track: 4, mode: "lower_voices", maxPerOnset: 1 },
    existingPolicy: "retain",
    decision: "Retain the existing arrangement: its reviewed source has 303 melody events, while this upload has 231 lead events.",
  },
  {
    file: "Bengawan Solo.mid",
    id: "bengawan_solo",
    title: "Bengawan Solo",
    artist: "Gesang",
    category: "indonesian_traditional",
    difficulty: "medium",
    priority: "high",
    aliases: ["bengawan solo", "gesang bengawan solo"],
    melody: { track: 16, mode: "top_voice" },
    accompaniment: { track: 25, mode: "full", maxPerOnset: 1 },
  },
  {
    file: "bubuy_bulan.mid",
    id: "bubuy_bulan",
    title: "Bubuy Bulan",
    artist: "Benny Corda",
    category: "sundanese_angklung_heritage",
    difficulty: "medium",
    priority: "high",
    aliases: ["bubuy bulan", "bubuy bulan sunda", "benny corda bubuy bulan"],
    melody: { track: 0, mode: "full" },
    accompaniment: { track: 2, mode: "lower_voices", maxPerOnset: 1 },
  },
  {
    file: "Die With a Smile.mid",
    id: "die_with_a_smile",
    title: "Die With a Smile",
    artist: "Lady Gaga & Bruno Mars",
    category: "international_pop",
    difficulty: "hard",
    priority: "medium",
    aliases: ["die with a smile", "lady gaga bruno mars die with a smile"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 2, mode: "lower_voices", maxPerOnset: 2 },
  },
  {
    file: "John Legend - All of Me.mid",
    id: "all_of_me",
    title: "All of Me",
    artist: "John Legend",
    category: "international_pop",
    difficulty: "medium_hard",
    priority: "high",
    aliases: ["all of me", "john legend all of me"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 1, mode: "lower_voices", maxPerOnset: 2 },
  },
  {
    file: "Just The Way You Are.mid",
    id: "just_the_way_you_are",
    title: "Just the Way You Are",
    artist: "Bruno Mars",
    category: "international_pop",
    difficulty: "medium_hard",
    priority: "high",
    aliases: ["just the way you are", "bruno mars just the way you are"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 0, mode: "lower_voices", maxPerOnset: 2 },
  },
  {
    file: "Lantas - Juicy Luicy.mid",
    id: "lantas",
    title: "Lantas",
    artist: "Juicy Luicy",
    category: "indonesian_modern",
    difficulty: "medium",
    priority: "high",
    aliases: ["lantas", "lantas juicy luicy", "juicy luicy lantas"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 2, mode: "lower_voices", maxPerOnset: 2 },
    startBeat: 12,
  },
  {
    file: "love story.mid",
    id: "love_story",
    title: "Love Story",
    artist: "Taylor Swift",
    category: "international_pop",
    difficulty: "medium_hard",
    priority: "high",
    aliases: ["love story", "taylor swift love story"],
    melody: { track: 35, mode: "top_voice" },
    accompaniment: { track: 3, mode: "full", maxPerOnset: 1 },
  },
  {
    file: "peaches.mid",
    id: "peaches",
    title: "Peaches",
    artist: "",
    category: "uncategorized",
    difficulty: "hard",
    priority: "medium",
    aliases: ["peaches"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 0, mode: "lower_voices", maxPerOnset: 2 },
  },
  {
    file: "River Flows in You.mid",
    id: "river_flows_in_you",
    title: "River Flows in You",
    artist: "Yiruma",
    category: "instrumental",
    difficulty: "hard",
    priority: "medium",
    aliases: ["river flows in you", "yiruma river flows in you"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 1, mode: "lower_voices", maxPerOnset: 2 },
  },
  {
    file: "Shape of You.mid",
    id: "shape_of_you",
    title: "Shape of You",
    artist: "Ed Sheeran",
    category: "international_pop",
    difficulty: "medium_hard",
    priority: "high",
    aliases: ["shape of you", "ed sheeran shape of you"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 0, mode: "lower_voices", maxPerOnset: 1 },
  },
  {
    file: "Someone You Loved.mid",
    id: "someone_you_loved",
    title: "Someone You Loved",
    artist: "Lewis Capaldi",
    category: "international_pop",
    difficulty: "medium_hard",
    priority: "high",
    aliases: ["someone you loved", "lewis capaldi someone you loved"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 1, mode: "lower_voices", maxPerOnset: 2 },
  },
  {
    file: "Tanah Airku.mid",
    id: "tanah_airku",
    title: "Tanah Airku",
    artist: "Ibu Sud",
    category: "indonesian_national",
    difficulty: "medium",
    priority: "high",
    aliases: ["tanah airku", "ibu sud tanah airku"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 1, mode: "lower_voices", maxPerOnset: 2 },
  },
  {
    file: "tokecang.mid",
    id: "tokecang",
    title: "Tokecang",
    artist: "",
    category: "sundanese_angklung_heritage",
    difficulty: "easy",
    priority: "high",
    aliases: ["tokecang", "tokecang sunda", "lagu tokecang"],
    melody: { track: 0, mode: "full" },
    accompaniment: { track: 1, mode: "lower_voices", maxPerOnset: 2 },
  },
  {
    file: "Wiz Khalifa ft. Charlie Puth - See You Again.mid",
    id: "see_you_again",
    title: "See You Again",
    artist: "Wiz Khalifa ft. Charlie Puth",
    category: "international_pop",
    difficulty: "hard",
    priority: "medium",
    aliases: ["see you again", "wiz khalifa see you again", "charlie puth see you again"],
    melody: { track: 0, mode: "top_voice" },
    accompaniment: { track: 1, mode: "lower_voices", maxPerOnset: 2 },
    existingPolicy: "replace",
    decision: "Replace the old single-track voice split with the uploaded MIDI's explicit right-hand and left-hand piano tracks.",
  },
  {
    file: "You are the reason.mid",
    id: "you_are_the_reason",
    title: "You Are the Reason",
    artist: "Calum Scott",
    category: "international_pop",
    difficulty: "medium_hard",
    priority: "high",
    aliases: ["you are the reason", "calum scott you are the reason"],
    melody: { track: 0, mode: "full" },
    accompaniment: { track: 1, mode: "lower_voices", maxPerOnset: 2 },
  },
];

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function midiName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[modulo(midi, 12)]}${Math.floor(midi / 12) - 1}`;
}

function groupByTick(notes) {
  const groups = new Map();
  for (const note of notes) {
    const group = groups.get(note.ticks) ?? [];
    group.push(note);
    groups.set(note.ticks, group);
  }
  return [...groups.values()].sort((left, right) => left[0].ticks - right[0].ticks);
}

function extract(track, selection, role) {
  const groups = groupByTick(track.notes);
  const maxPerOnset = selection.maxPerOnset ?? (role === "melody" ? 1 : 2);
  return groups.flatMap((group) => {
    const sorted = [...group].sort((left, right) => left.midi - right.midi);
    if (selection.mode === "top_voice") {
      return [sorted.at(-1)];
    }
    if (selection.mode === "lower_voices") {
      const lower = sorted.length > 1 ? sorted.slice(0, -1) : sorted;
      if (lower.length <= maxPerOnset) return lower;
      return maxPerOnset === 1 ? [lower[0]] : [lower[0], lower.at(-1)];
    }
    if (sorted.length <= maxPerOnset || role === "melody") return sorted;
    return maxPerOnset === 1 ? [sorted[0]] : [sorted[0], sorted.at(-1)];
  });
}

function chooseTransposition(melody, accompaniment) {
  let best = { shift: 0, score: Number.NEGATIVE_INFINITY };
  for (let shift = -11; shift <= 11; shift += 1) {
    let score = -Math.abs(shift) * 0.02;
    for (const [notes, weight] of [[melody, 4], [accompaniment, 1]]) {
      for (const note of notes) {
        score += NATURAL_PITCH_CLASSES.has(modulo(note.midi + shift, 12)) ? weight * 10 : -weight * 3;
      }
    }
    if (score > best.score) best = { shift, score };
  }
  return best.shift;
}

function foldNearRange(midi, range) {
  const [low, high] = range;
  const options = [];
  for (let octave = -8; octave <= 8; octave += 1) {
    const candidate = midi + octave * 12;
    if (candidate >= low - 1 && candidate <= high + 1) options.push(candidate);
  }
  if (options.length === 0) return midi < low ? low : high;
  const center = (low + high) / 2;
  return options.sort((left, right) => Math.abs(left - center) - Math.abs(right - center))[0];
}

function mapSequence(notes, shift, role) {
  const range = role === "melody" ? MELODY_RANGE : ACCOMPANIMENT_RANGE;
  const playable = [];
  for (let midi = range[0]; midi <= range[1]; midi += 1) {
    if (NATURAL_PITCH_CLASSES.has(modulo(midi, 12))) playable.push(midi);
  }
  const folded = notes.map((note) => foldNearRange(note.midi + shift, range));
  const states = [];
  for (let index = 0; index < notes.length; index += 1) {
    const candidates = playable.filter((candidate) => Math.abs(candidate - folded[index]) <= 2);
    const pool = candidates.length > 0 ? candidates : playable;
    const row = new Map();
    for (const candidate of pool) {
      const emission = Math.abs(candidate - folded[index]) * 4;
      if (index === 0) {
        row.set(candidate, { cost: emission, previous: null });
        continue;
      }
      let best = { cost: Number.POSITIVE_INFINITY, previous: null };
      for (const [previousMidi, previousState] of states[index - 1]) {
        const sourceInterval = folded[index] - folded[index - 1];
        const mappedInterval = candidate - previousMidi;
        const contourPenalty = sourceInterval === 0
          ? Math.abs(mappedInterval) * 1.5
          : Math.sign(sourceInterval) !== Math.sign(mappedInterval) && mappedInterval !== 0
            ? 5
            : 0;
        const collapsePenalty = sourceInterval !== 0 && mappedInterval === 0 ? 1.5 : 0;
        const cost = previousState.cost + emission + Math.abs(mappedInterval - sourceInterval) * 0.7 + contourPenalty + collapsePenalty;
        if (cost < best.cost) best = { cost, previous: previousMidi };
      }
      row.set(candidate, best);
    }
    states.push(row);
  }
  let current = [...states.at(-1).entries()].sort((left, right) => left[1].cost - right[1].cost)[0][0];
  const result = new Array(notes.length);
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    result[index] = current;
    current = states[index].get(current).previous;
  }
  return result;
}

function inspectTrack(track, index) {
  const notes = track.notes;
  const onsets = groupByTick(notes);
  return {
    index,
    name: track.name || `Track ${index + 1}`,
    instrument: track.instrument.name || "Unknown instrument",
    midi_channel: track.channel + 1,
    note_count: notes.length,
    lowest_note: notes.length ? midiName(Math.min(...notes.map((note) => note.midi))) : null,
    highest_note: notes.length ? midiName(Math.max(...notes.map((note) => note.midi))) : null,
    max_notes_per_onset: onsets.length ? Math.max(...onsets.map((group) => group.length)) : 0,
  };
}

function convert(job, midi, sourceBuffer) {
  const melodyTrack = midi.tracks[job.melody.track];
  const accompanimentTrack = midi.tracks[job.accompaniment.track];
  if (!melodyTrack?.notes.length) throw new Error(`${job.file}: selected melody track is empty.`);
  if (!accompanimentTrack?.notes.length) throw new Error(`${job.file}: selected accompaniment track is empty.`);

  const startTick = (job.startBeat ?? 0) * midi.header.ppq;
  const startSeconds = midi.header.ticksToSeconds(startTick);
  const melody = extract(melodyTrack, job.melody, "melody").filter((note) => note.ticks >= startTick);
  const accompaniment = extract(accompanimentTrack, job.accompaniment, "accompaniment").filter((note) => note.ticks >= startTick);
  const shift = chooseTransposition(melody, accompaniment);
  const roleSources = [
    { role: "melody", notes: melody, mapped: mapSequence(melody, shift, "melody"), track: melodyTrack },
    { role: "accompaniment", notes: accompaniment, mapped: mapSequence(accompaniment, shift, "accompaniment"), track: accompanimentTrack },
  ];

  const output = [];
  let contextualMappings = 0;
  for (const roleSource of roleSources) {
    for (let index = 0; index < roleSource.notes.length; index += 1) {
      const note = roleSource.notes[index];
      const mappedMidi = roleSource.mapped[index];
      if (!NATURAL_PITCH_CLASSES.has(modulo(note.midi + shift, 12))) contextualMappings += 1;
      output.push({
        note: midiName(mappedMidi),
        start: round(note.time - startSeconds),
        duration: Math.min(MAX_DRAFT_ACTIVATION_SECONDS, Math.max(MIN_DURATION_SECONDS, round(note.duration))),
        velocity: Math.max(1, Math.min(127, Math.round(note.velocity * 127))),
        role: roleSource.role,
        register: roleSource.role === "melody" ? "upper_physical_g4_c6" : "lower_physical_g3_f4",
        source_track: roleSource.track.name || roleSource.track.instrument.name || `Track ${job[roleSource.role].track + 1}`,
        source_beat: round(note.ticks / midi.header.ppq),
        source_duration_beats: round(note.durationTicks / midi.header.ppq),
        original_midi_note: note.midi,
        original_midi_note_name: note.name || midiName(note.midi),
        transposed_midi_note_name: midiName(note.midi + shift),
        mapping: NATURAL_PITCH_CLASSES.has(modulo(note.midi + shift, 12)) ? "global_transposition_and_octave_register_fit" : "contextual_nearest_natural_preserving_contour",
        physical_rack_map: "G3-C6",
      });
    }
  }

  const deduplicated = [];
  const seen = new Set();
  for (const note of output.sort((left, right) =>
    left.start - right.start ||
    (left.role === right.role ? 0 : left.role === "melody" ? -1 : 1) ||
    left.note.localeCompare(right.note),
  )) {
    const key = `${note.start}|${note.note}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(note);
  }

  const retriggerSafeNotes = enforceRetriggerGap(deduplicated);
  const uniqueNotes = [...new Set(retriggerSafeNotes.map((note) => note.note))].sort((left, right) => RACK.indexOf(left) - RACK.indexOf(right));
  const validation = validateNotes(retriggerSafeNotes);
  if (validation.errors.length > 0) throw new Error(`${job.file}: ${validation.errors.join("; ")}`);

  const firstSignature = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const tempo = midi.header.tempos[0]?.bpm ?? 120;
  const selectedTracks = new Set([job.melody.track, job.accompaniment.track]);
  const ignoredTracks = midi.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track, index }) => track.notes.length > 0 && !selectedTracks.has(index))
    .map(({ track, index }) => `${index}: ${track.name || track.instrument.name || "Unnamed"}${track.channel === 9 ? " (percussion)" : ""}`);
  const arrangement = {
    format_version: "angklung_song.v1",
    id: job.id,
    title: job.title,
    ...(job.artist ? { artist: job.artist } : {}),
    aliases: job.aliases,
    category: job.category,
    difficulty: job.difficulty,
    source: {
      uploaded_file: job.file,
      sha256: crypto.createHash("sha256").update(sourceBuffer).digest("hex"),
      midi_name: midi.name?.trim() || null,
      ppq: midi.header.ppq,
      tracks: midi.tracks.map(inspectTrack),
      melody_track: inspectTrack(melodyTrack, job.melody.track),
      melody_extraction: job.melody.mode,
      accompaniment_track: inspectTrack(accompanimentTrack, job.accompaniment.track),
      accompaniment_extraction: job.accompaniment.mode,
      ignored_populated_tracks: ignoredTracks,
      transposition_semitones: shift,
      contextual_accidental_mappings: contextualMappings,
      timing: "Exact MIDI seconds retained, including source tempo changes.",
      ...(job.startBeat ? {
        trimmed_intro_beats: job.startBeat,
        trimmed_intro_seconds: round(startSeconds),
        trim_reason: "Removed source intro because its scale conflicts with the vocal section on the natural-note rack.",
      } : {}),
    },
    tempo_bpm: round(
      [...midi.header.tempos].reverse().find((event) => event.ticks <= startTick)?.bpm ?? tempo,
      3,
    ),
    tempo_events: midi.header.tempos
      .filter((event) => event.ticks >= startTick)
      .map((event) => ({ beat: round(event.ticks / midi.header.ppq - (job.startBeat ?? 0)), bpm: round(event.bpm, 3) })),
    time_signature: `${firstSignature[0]}/${firstSignature[1]}`,
    time_signature_events: midi.header.timeSignatures.map((event) => ({ beat: round(event.ticks / midi.header.ppq), time_signature: `${event.timeSignature[0]}/${event.timeSignature[1]}` })),
    timing_mode: "absolute_seconds_from_source_midi",
    physical_rack_map: "G3-C6",
    allowed_note_set: RACK,
    range: { lowest: uniqueNotes[0], highest: uniqueNotes.at(-1), unique_notes: uniqueNotes },
    arrangement_status: "validated_midi_draft_g3_c6_simulator_review_required",
    playable: true,
    demo_safe: false,
    has_validated_notes: true,
    validation,
    notes: retriggerSafeNotes,
  };
  const catalogEntry = {
    id: job.id,
    title: job.title,
    ...(job.artist ? { artist: job.artist } : {}),
    aliases: job.aliases,
    category: job.category,
    difficulty: job.difficulty,
    priority: job.priority,
    verdict: validation.warnings.length ? "Validated simulator draft with warnings" : "Validated simulator draft",
    reason: `MIDI-derived G3-C6 arrangement with ${retriggerSafeNotes.filter((note) => note.role === "melody").length} melody and ${retriggerSafeNotes.filter((note) => note.role === "accompaniment").length} accompaniment events. Physical motor review is still required.`,
    arrangement_status: arrangement.arrangement_status,
    playable: true,
    demo_safe: false,
    has_validated_notes: true,
    active: true,
    visible_in_guest: true,
    physical_rack_map: "G3-C6",
    melody_register: "upper_physical",
    melody_target_range: "G4-C6",
    accompaniment_register: "lower_physical",
    accompaniment_target_range: "G3-F4",
    path: `/songs/arrangements/${job.id}.json`,
  };
  return { arrangement, catalogEntry };
}

function enforceRetriggerGap(notes) {
  const kept = [];
  const lastIndexByNote = new Map();
  for (const note of notes) {
    const previousIndex = lastIndexByNote.get(note.note);
    if (previousIndex !== undefined) {
      const previous = kept[previousIndex];
      if (note.start - previous.start < MIN_SAME_ACTUATOR_GAP_SECONDS) {
        const shouldReplace =
          (note.role === "melody" && previous.role !== "melody") ||
          (note.role === previous.role && note.velocity > previous.velocity);
        if (shouldReplace) kept[previousIndex] = note;
        continue;
      }
    }
    lastIndexByNote.set(note.note, kept.length);
    kept.push(note);
  }
  return kept.sort((left, right) => left.start - right.start || RACK.indexOf(left.note) - RACK.indexOf(right.note));
}

function validateNotes(notes) {
  const errors = [];
  const warnings = [];
  for (const [index, note] of notes.entries()) {
    if (!RACK.includes(note.note)) errors.push(`notes[${index}] ${note.note} is outside the rack`);
    if (/[#b]/.test(note.note)) errors.push(`notes[${index}] ${note.note} is chromatic`);
    if (!Number.isFinite(note.start) || note.start < 0) errors.push(`notes[${index}] has invalid start`);
    if (!Number.isFinite(note.duration) || note.duration < MIN_DURATION_SECONDS) errors.push(`notes[${index}] has invalid duration`);
  }
  const events = notes.flatMap((note) => [{ time: note.start, delta: 1 }, { time: note.start + note.duration, delta: -1 }]);
  events.sort((left, right) => left.time - right.time || left.delta - right.delta);
  let active = 0;
  let peak = 0;
  for (const event of events) {
    active += event.delta;
    peak = Math.max(peak, active);
  }
  if (peak > MAX_SIMULTANEOUS_ACTUATORS) errors.push(`peak overlap ${peak} exceeds ${MAX_SIMULTANEOUS_ACTUATORS}`);
  const byNote = new Map();
  for (const note of notes) {
    const starts = byNote.get(note.note) ?? [];
    starts.push(note.start);
    byNote.set(note.note, starts);
  }
  let retriggerWarnings = 0;
  for (const starts of byNote.values()) {
    starts.sort((left, right) => left - right);
    for (let index = 1; index < starts.length; index += 1) {
      if (starts[index] - starts[index - 1] < MIN_SAME_ACTUATOR_GAP_SECONDS) retriggerWarnings += 1;
    }
  }
  if (retriggerWarnings) warnings.push(`${retriggerWarnings} same-actuator onset gaps are below ${MIN_SAME_ACTUATOR_GAP_SECONDS}s`);
  return {
    status: errors.length ? "failed" : warnings.length ? "passed_with_warnings" : "passed",
    validator_profile: "frontend_schedule_validator_and_current_motor_limits",
    max_simultaneous_actuators: peak,
    min_duration_seconds: MIN_DURATION_SECONDS,
    max_draft_activation_seconds: MAX_DRAFT_ACTIVATION_SECONDS,
    min_same_actuator_gap_seconds: MIN_SAME_ACTUATOR_GAP_SECONDS,
    errors,
    warnings,
  };
}

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const results = [];
for (const job of SONGS.filter((candidate) => !SONG_ID || candidate.id === SONG_ID)) {
  const sourcePath = path.join(SOURCE_DIRECTORY, job.file);
  const sourceBuffer = fs.readFileSync(sourcePath);
  const midi = new Midi(sourceBuffer);
  if (midi.tracks.some((track) => track.channel === 9)) {
    // Percussion is inspected in source metadata but never selected by the manifest.
  }
  if (job.existingPolicy === "retain") {
    results.push({ id: job.id, action: "retained_existing", decision: job.decision, upload_tracks: midi.tracks.map(inspectTrack) });
    continue;
  }
  const converted = convert(job, midi, sourceBuffer);
  const existingIndex = catalog.findIndex((entry) => entry.id === job.id);
  let action = existingIndex >= 0 ? "replaced_existing" : "added";
  if (existingIndex >= 0 && job.existingPolicy !== "replace") {
    const existingArrangementPath = path.join(ARRANGEMENTS_DIRECTORY, `${job.id}.json`);
    const existingArrangement = fs.existsSync(existingArrangementPath)
      ? JSON.parse(fs.readFileSync(existingArrangementPath, "utf8"))
      : null;
    const sameGeneratedSource =
      existingArrangement?.arrangement_status === "validated_midi_draft_g3_c6_simulator_review_required" &&
      existingArrangement?.source?.sha256 === converted.arrangement.source.sha256;
    if (!sameGeneratedSource) throw new Error(`${job.id} already exists and is not the draft generated from this exact MIDI.`);
    action = "refreshed_generated_draft";
  }
  if (existingIndex >= 0) catalog[existingIndex] = converted.catalogEntry;
  else catalog.push(converted.catalogEntry);
  if (WRITE) {
    fs.writeFileSync(path.join(ARRANGEMENTS_DIRECTORY, `${job.id}.json`), `${JSON.stringify(converted.arrangement, null, 2)}\n`);
  }
  results.push({
    id: job.id,
    action,
    decision: job.decision ?? null,
    notes: converted.arrangement.notes.length,
    melody: converted.arrangement.notes.filter((note) => note.role === "melody").length,
    accompaniment: converted.arrangement.notes.filter((note) => note.role === "accompaniment").length,
    shift: converted.arrangement.source.transposition_semitones,
    contextual_mappings: converted.arrangement.source.contextual_accidental_mappings,
    peak_overlap: converted.arrangement.validation.max_simultaneous_actuators,
    validation: converted.arrangement.validation.status,
  });
}

if (SONG_ID && results.length === 0) throw new Error(`Unknown song id: ${SONG_ID}`);

if (WRITE) fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({ mode: WRITE ? "write" : "dry_run", source_directory: SOURCE_DIRECTORY, results }, null, 2));
