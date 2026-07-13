import { Midi } from "@tonejs/midi";

import { ANGKLUNG_RANGE_NOTES, FRONTEND_INSTRUMENT_MAP } from "./instrumentMap";
import { MOTOR_LIMITS } from "./motorLimits";
import { validateMotorSafety, type SafetyCheck } from "./safetyValidator";
import type { ActuatorCommand, ActuatorSchedule } from "./types";

export const LIBRARY_BUILDER_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const LIBRARY_BUILDER_ALLOWED_EXTENSIONS = ["mid", "midi"] as const;
export const LIBRARY_BUILDER_DEFERRED_EXTENSIONS = ["musicxml", "xml", "mxl"] as const;
export const DEFAULT_DRAFT_STATUS = "draft_layered_from_midi_g3_c6_needs_review";

const NATURAL_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const MELODY_RANGE = { lowest: 67, highest: 84, label: "G4-C6" };
const ACCOMPANIMENT_RANGE = { lowest: 55, highest: 65, label: "G3-F4" };

type SourceMidiNote = {
  midi: number;
  beat: number;
  durationBeats: number;
  velocity: number;
  trackIndex: number;
  sourceTrack: string;
};

export type MidiTrackInspection = {
  index: number;
  name: string;
  instrument: string;
  channel: number;
  noteCount: number;
  lowestNote: string | null;
  highestNote: string | null;
  averageMidi: number;
  maxNotesPerOnset: number;
  averageNotesPerOnset: number;
  dense: boolean;
};

export type ParsedMidiSource = {
  filename: string;
  midiName: string;
  tempoBpm: number;
  tempoEventCount: number;
  timeSignature: string;
  ppq: number;
  tracks: MidiTrackInspection[];
  notesByTrack: SourceMidiNote[][];
};

export type LibraryBuilderMetadata = {
  title: string;
  artist: string;
  songId: string;
  category: string;
  difficulty: string;
  priority: string;
  aliases: string[];
  moods: string[];
  tags: string[];
  requestKeywords: string[];
};

export type LibraryBuilderSettings = {
  transpositionMode: "auto" | "manual";
  manualTransposition: number;
  melodySource: "auto" | "track" | "top_voice";
  melodyTrackIndex: number | null;
  accompanimentSource: "auto" | "track" | "lower_voices" | "none";
  accompanimentTrackIndex: number | null;
  accompanimentDensity: "sparse" | "normal" | "dense_simulator_only";
  draftStatus: string;
};

export type BuilderArrangementNote = {
  note: string;
  beat: number;
  duration_beats: number;
  velocity: number;
  role: "melody" | "accompaniment";
  register: "upper_physical_g4_c6" | "lower_physical_g3_f4";
  source_track: string;
  original_midi_note: number;
  original_midi_note_name: string;
  mapped_from_transposed_note: string;
  mapping: string;
  physical_rack_map: "G3-C6";
};

export type BuilderArrangement = {
  format_version: "angklung_song.v1";
  id: string;
  title: string;
  artist: string;
  aliases: string[];
  category: string;
  difficulty: string;
  tempo_bpm: number;
  time_signature: string;
  physical_rack_map: "G3-C6";
  allowed_note_set: string[];
  range: {
    lowest: string | null;
    highest: string | null;
    unique_notes: string[];
  };
  arrangement_status: string;
  playable: boolean;
  demo_safe: false;
  has_validated_notes: boolean;
  notes: BuilderArrangementNote[];
};

export type BuilderCatalogEntry = {
  id: string;
  title: string;
  artist: string;
  aliases: string[];
  category: string;
  difficulty: string;
  priority: string;
  verdict: string;
  reason: string;
  arrangement_status: string;
  playable: boolean;
  demo_safe: false;
  has_validated_notes: boolean;
  active: true;
  visible_in_guest: true;
  physical_rack_map: "G3-C6";
  melody_register: "upper_physical";
  melody_target_range: "G4-C6";
  accompaniment_register: "lower_physical";
  accompaniment_target_range: "G3-F4";
  moods: string[];
  tags: string[];
  request_keywords: string[];
  path: string;
};

export type BuilderValidationCheck = SafetyCheck;

export type BuilderValidationReport = {
  overall: "PASSED" | "WARNING" | "FAILED";
  checks: BuilderValidationCheck[];
  errors: string[];
  warnings: string[];
};

export type ConversionVerdict = "clean" | "usable" | "dense" | "needs_simplification" | "bad_source";

export type BuilderConversionReport = {
  original_filename: string;
  tracks_found: MidiTrackInspection[];
  chosen_melody_track: string;
  chosen_accompaniment_track: string | null;
  melody_extraction: string;
  accompaniment_extraction: string;
  transposition_used: number;
  final_note_range: { lowest: string | null; highest: string | null };
  melody_note_count: number;
  accompaniment_note_count: number;
  total_note_count: number;
  unsupported_notes_count: number;
  sharps_flats_count: number;
  max_simultaneous_notes_estimate: number;
  repeated_note_warnings: number;
  density_warning: string | null;
  verdict: ConversionVerdict;
  warnings: string[];
};

export type LibraryBuilderResult = {
  arrangement: BuilderArrangement;
  catalogEntry: BuilderCatalogEntry;
  conversionReport: BuilderConversionReport;
  validationReport: BuilderValidationReport;
  outputPath: string;
};

type SelectedSource = {
  melodyTrackIndex: number;
  accompanimentTrackIndex: number | null;
  melodyExtraction: "full_track" | "top_voice";
  accompanimentExtraction: "full_track" | "lower_voices" | "none";
};

type RoleNote = SourceMidiNote & { role: "melody" | "accompaniment" };

export function parseMidiArrayBuffer(arrayBuffer: ArrayBuffer, filename: string): ParsedMidiSource {
  if (arrayBuffer.byteLength > LIBRARY_BUILDER_MAX_FILE_BYTES) {
    throw new Error("File is larger than the 5 MB local upload limit.");
  }

  let midi: Midi;
  try {
    midi = new Midi(arrayBuffer);
  } catch {
    throw new Error("The MIDI file could not be parsed. Confirm that it is a valid .mid or .midi file.");
  }

  const ppq = midi.header.ppq;
  if (!Number.isFinite(ppq) || ppq <= 0) {
    throw new Error("The MIDI file has an invalid pulses-per-quarter-note value.");
  }

  const tracks = midi.tracks.map((track, index) => {
    const notes = track.notes;
    const noteValues = notes.map((note) => note.midi);
    const onsetCounts = countOnsets(notes.map((note) => note.ticks));
    const sourceName = cleanTrackName(track.name, track.instrument.name, index);

    return {
      index,
      name: sourceName,
      instrument: track.instrument.name || "Unknown instrument",
      channel: track.channel + 1,
      noteCount: notes.length,
      lowestNote: noteValues.length > 0 ? midiNumberToName(Math.min(...noteValues)) : null,
      highestNote: noteValues.length > 0 ? midiNumberToName(Math.max(...noteValues)) : null,
      averageMidi: noteValues.length > 0 ? round(noteValues.reduce((sum, value) => sum + value, 0) / noteValues.length, 2) : 0,
      maxNotesPerOnset: onsetCounts.length > 0 ? Math.max(...onsetCounts) : 0,
      averageNotesPerOnset: onsetCounts.length > 0 ? round(onsetCounts.reduce((sum, value) => sum + value, 0) / onsetCounts.length, 2) : 0,
      dense: onsetCounts.length > 0 && (Math.max(...onsetCounts) >= 3 || average(onsetCounts) >= 1.35),
    } satisfies MidiTrackInspection;
  });

  const notesByTrack = midi.tracks.map((track, trackIndex) =>
    track.notes
      .map((note) => ({
        midi: note.midi,
        beat: round(note.ticks / ppq, 4),
        durationBeats: Math.max(round(note.durationTicks / ppq, 4), 0.001),
        velocity: Math.max(1, Math.min(127, Math.round(note.velocity * 127))),
        trackIndex,
        sourceTrack: tracks[trackIndex].name,
      }))
      .sort((left, right) => left.beat - right.beat || left.midi - right.midi),
  );

  if (notesByTrack.every((notes) => notes.length === 0)) {
    throw new Error("The MIDI file does not contain any note events.");
  }

  const firstTimeSignature = midi.header.timeSignatures[0]?.timeSignature;
  const timeSignature =
    Array.isArray(firstTimeSignature) && firstTimeSignature.length >= 2
      ? `${firstTimeSignature[0]}/${firstTimeSignature[1]}`
      : "4/4";

  return {
    filename,
    midiName: midi.name || stripExtension(filename),
    tempoBpm: round(midi.header.tempos[0]?.bpm ?? 120, 3),
    tempoEventCount: midi.header.tempos.length,
    timeSignature,
    ppq,
    tracks,
    notesByTrack,
  };
}

export function convertMidiToLibraryDraft(
  source: ParsedMidiSource,
  metadata: LibraryBuilderMetadata,
  settings: LibraryBuilderSettings,
): LibraryBuilderResult {
  assertMetadata(metadata);
  const selection = selectSources(source, settings);
  const melodyNotes = extractMelodyNotes(source, selection);
  const accompanimentNotes = extractAccompanimentNotes(source, selection, settings.accompanimentDensity);
  const roleNotes: RoleNote[] = [
    ...melodyNotes.map((note) => ({ ...note, role: "melody" as const })),
    ...accompanimentNotes.map((note) => ({ ...note, role: "accompaniment" as const })),
  ];

  if (roleNotes.length === 0) {
    throw new Error("The selected tracks did not produce any notes. Choose a different melody source.");
  }

  const transposition =
    settings.transpositionMode === "manual"
      ? Math.max(-24, Math.min(24, Math.trunc(Number.isFinite(settings.manualTransposition) ? settings.manualTransposition : 0)))
      : chooseAutomaticTransposition(roleNotes);

  let unsupportedNotesCount = 0;
  const mappedNotes: BuilderArrangementNote[] = [];
  for (const sourceNote of roleNotes) {
    const transposedMidi = sourceNote.midi + transposition;
    if (!NATURAL_PITCH_CLASSES.has(modulo(transposedMidi, 12))) {
      unsupportedNotesCount += 1;
      continue;
    }

    const targetRange = sourceNote.role === "melody" ? MELODY_RANGE : ACCOMPANIMENT_RANGE;
    const mappedMidi = foldNaturalNoteIntoRange(transposedMidi, targetRange.lowest, targetRange.highest);
    if (mappedMidi === null) {
      unsupportedNotesCount += 1;
      continue;
    }

    const register = sourceNote.role === "melody" ? "upper_physical_g4_c6" : "lower_physical_g3_f4";
    const mappedNote = midiNumberToName(mappedMidi);
    mappedNotes.push({
      note: mappedNote,
      beat: round(sourceNote.beat, 4),
      duration_beats: Math.max(round(sourceNote.durationBeats, 4), 0.001),
      velocity: sourceNote.velocity,
      role: sourceNote.role,
      register,
      source_track: sourceNote.sourceTrack,
      original_midi_note: sourceNote.midi,
      original_midi_note_name: midiNumberToName(sourceNote.midi),
      mapped_from_transposed_note: midiNumberToName(transposedMidi),
      mapping: `transpose_${formatSignedNumber(transposition)}_then_${register}`,
      physical_rack_map: "G3-C6",
    });
  }

  const notes = deduplicateMappedNotes(mappedNotes);
  if (notes.length === 0) {
    throw new Error("No notes remain after transposition. Try a different manual transposition value or source track.");
  }

  const validationReport = validateArrangementDraft(notes, source.tempoBpm, metadata.title);
  const hasValidatedNotes = validationReport.checks
    .filter((check) => ["G3-C6 note set", "Natural notes only", "Actuator channel mapping"].includes(check.label))
    .every((check) => check.status === "passed");
  const playable = hasValidatedNotes && validationReport.overall !== "FAILED";
  const uniqueNotes = [...new Set(notes.map((note) => note.note))].sort(compareRackNotes);
  const sharpsFlatsCount = roleNotes.filter((note) => !NATURAL_PITCH_CLASSES.has(modulo(note.midi, 12))).length;
  const repeatedNoteWarnings = countRepeatedNoteWarnings(notes, source.tempoBpm);
  const maxSimultaneousNotes = calculateMaxSimultaneousNotes(notes);
  const densityWarning = buildDensityWarning(maxSimultaneousNotes, settings.accompanimentDensity);
  const warnings = buildConversionWarnings({
    source,
    selection,
    unsupportedNotesCount,
    repeatedNoteWarnings,
    densityWarning,
    validationReport,
  });
  const verdict = chooseVerdict({
    totalSourceNotes: roleNotes.length,
    outputNotes: notes.length,
    unsupportedNotesCount,
    maxSimultaneousNotes,
    validationReport,
    warnings,
  });

  const arrangement: BuilderArrangement = {
    format_version: "angklung_song.v1",
    id: metadata.songId,
    title: metadata.title,
    artist: metadata.artist,
    aliases: metadata.aliases,
    category: metadata.category,
    difficulty: metadata.difficulty,
    tempo_bpm: source.tempoBpm,
    time_signature: source.timeSignature,
    physical_rack_map: "G3-C6",
    allowed_note_set: [...ANGKLUNG_RANGE_NOTES],
    range: {
      lowest: uniqueNotes[0] ?? null,
      highest: uniqueNotes.at(-1) ?? null,
      unique_notes: uniqueNotes,
    },
    arrangement_status: settings.draftStatus || DEFAULT_DRAFT_STATUS,
    playable,
    demo_safe: false,
    has_validated_notes: hasValidatedNotes,
    notes,
  };

  const catalogEntry: BuilderCatalogEntry = {
    id: metadata.songId,
    title: metadata.title,
    artist: metadata.artist,
    aliases: metadata.aliases,
    category: metadata.category,
    difficulty: metadata.difficulty,
    priority: metadata.priority,
    verdict: formatCatalogVerdict(verdict),
    reason: "G3-C6 MIDI-derived draft for simulator testing. Needs review before real motor playback.",
    arrangement_status: settings.draftStatus || DEFAULT_DRAFT_STATUS,
    playable,
    demo_safe: false,
    has_validated_notes: hasValidatedNotes,
    active: true,
    visible_in_guest: true,
    physical_rack_map: "G3-C6",
    melody_register: "upper_physical",
    melody_target_range: "G4-C6",
    accompaniment_register: "lower_physical",
    accompaniment_target_range: "G3-F4",
    moods: metadata.moods,
    tags: metadata.tags,
    request_keywords: metadata.requestKeywords,
    path: `/songs/arrangements/${metadata.songId}.json`,
  };

  const conversionReport: BuilderConversionReport = {
    original_filename: source.filename,
    tracks_found: source.tracks,
    chosen_melody_track: source.tracks[selection.melodyTrackIndex].name,
    chosen_accompaniment_track:
      selection.accompanimentTrackIndex === null ? null : source.tracks[selection.accompanimentTrackIndex].name,
    melody_extraction: selection.melodyExtraction,
    accompaniment_extraction: selection.accompanimentExtraction,
    transposition_used: transposition,
    final_note_range: { lowest: uniqueNotes[0] ?? null, highest: uniqueNotes.at(-1) ?? null },
    melody_note_count: notes.filter((note) => note.role === "melody").length,
    accompaniment_note_count: notes.filter((note) => note.role === "accompaniment").length,
    total_note_count: notes.length,
    unsupported_notes_count: unsupportedNotesCount,
    sharps_flats_count: sharpsFlatsCount,
    max_simultaneous_notes_estimate: maxSimultaneousNotes,
    repeated_note_warnings: repeatedNoteWarnings,
    density_warning: densityWarning,
    verdict,
    warnings,
  };

  return {
    arrangement,
    catalogEntry,
    conversionReport,
    validationReport,
    outputPath: `frontend/public/songs/arrangements/${metadata.songId}.json`,
  };
}

export function slugifySongId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function selectSources(source: ParsedMidiSource, settings: LibraryBuilderSettings): SelectedSource {
  const populatedTracks = source.tracks.filter((track) => track.noteCount > 0);
  if (populatedTracks.length === 0) {
    throw new Error("The MIDI file does not contain any usable tracks.");
  }

  const automaticMelodyTrack = [...populatedTracks].sort((left, right) => melodyTrackScore(right) - melodyTrackScore(left))[0];
  const requestedMelodyTrack = source.tracks.find(
    (track) => track.index === settings.melodyTrackIndex && track.noteCount > 0,
  );
  const melodyTrack = settings.melodySource === "auto" ? automaticMelodyTrack : requestedMelodyTrack ?? automaticMelodyTrack;
  const shouldExtractTopVoice =
    settings.melodySource === "top_voice" ||
    (settings.melodySource === "auto" && populatedTracks.length === 1 && melodyTrack.dense);

  if (settings.accompanimentSource === "none") {
    return {
      melodyTrackIndex: melodyTrack.index,
      accompanimentTrackIndex: null,
      melodyExtraction: shouldExtractTopVoice ? "top_voice" : "full_track",
      accompanimentExtraction: "none",
    };
  }

  const requestedAccompanimentTrack = source.tracks.find(
    (track) => track.index === settings.accompanimentTrackIndex && track.noteCount > 0,
  );
  const otherTracks = populatedTracks.filter((track) => track.index !== melodyTrack.index);
  const automaticAccompanimentTrack = [...otherTracks].sort(
    (left, right) => accompanimentTrackScore(right) - accompanimentTrackScore(left),
  )[0];

  let accompanimentTrack: MidiTrackInspection | undefined;
  let accompanimentExtraction: SelectedSource["accompanimentExtraction"] = "full_track";
  if (settings.accompanimentSource === "track") {
    accompanimentTrack = requestedAccompanimentTrack ?? automaticAccompanimentTrack ?? melodyTrack;
  } else if (settings.accompanimentSource === "lower_voices") {
    accompanimentTrack = requestedAccompanimentTrack ?? melodyTrack;
    accompanimentExtraction = "lower_voices";
  } else if (automaticAccompanimentTrack) {
    accompanimentTrack = automaticAccompanimentTrack;
  } else if (melodyTrack.dense) {
    accompanimentTrack = melodyTrack;
    accompanimentExtraction = "lower_voices";
  }

  return {
    melodyTrackIndex: melodyTrack.index,
    accompanimentTrackIndex: accompanimentTrack?.index ?? null,
    melodyExtraction: shouldExtractTopVoice || accompanimentTrack?.index === melodyTrack.index ? "top_voice" : "full_track",
    accompanimentExtraction,
  };
}

function extractMelodyNotes(source: ParsedMidiSource, selection: SelectedSource): SourceMidiNote[] {
  const notes = source.notesByTrack[selection.melodyTrackIndex] ?? [];
  return selection.melodyExtraction === "top_voice" ? selectTopVoice(notes) : notes;
}

function extractAccompanimentNotes(
  source: ParsedMidiSource,
  selection: SelectedSource,
  density: LibraryBuilderSettings["accompanimentDensity"],
): SourceMidiNote[] {
  if (selection.accompanimentTrackIndex === null || selection.accompanimentExtraction === "none") {
    return [];
  }

  const notes = source.notesByTrack[selection.accompanimentTrackIndex] ?? [];
  const extracted = selection.accompanimentExtraction === "lower_voices" ? selectLowerVoices(notes) : notes;
  return limitAccompanimentDensity(extracted, density);
}

function selectTopVoice(notes: SourceMidiNote[]): SourceMidiNote[] {
  return groupNotesByBeat(notes).map((group) => [...group].sort((left, right) => right.midi - left.midi)[0]);
}

function selectLowerVoices(notes: SourceMidiNote[]): SourceMidiNote[] {
  return groupNotesByBeat(notes).flatMap((group) => {
    const sorted = [...group].sort((left, right) => left.midi - right.midi);
    return sorted.length > 1 ? sorted.slice(0, -1) : [];
  });
}

function limitAccompanimentDensity(
  notes: SourceMidiNote[],
  density: LibraryBuilderSettings["accompanimentDensity"],
): SourceMidiNote[] {
  if (density === "dense_simulator_only") {
    return notes;
  }

  const limit = density === "sparse" ? 1 : 2;
  return groupNotesByBeat(notes).flatMap((group) => {
    const sorted = [...group].sort((left, right) => left.midi - right.midi);
    if (sorted.length <= limit) {
      return sorted;
    }
    return limit === 1 ? [sorted[0]] : [sorted[0], sorted.at(-1)!];
  });
}

function chooseAutomaticTransposition(notes: RoleNote[]): number {
  let bestShift = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let shift = -11; shift <= 11; shift += 1) {
    let score = 0;
    for (const note of notes) {
      const shiftedMidi = note.midi + shift;
      if (!NATURAL_PITCH_CLASSES.has(modulo(shiftedMidi, 12))) {
        score -= 30;
        continue;
      }

      score += 100;
      const targetRange = note.role === "melody" ? MELODY_RANGE : ACCOMPANIMENT_RANGE;
      if (shiftedMidi >= targetRange.lowest && shiftedMidi <= targetRange.highest) {
        score += 10;
      } else {
        score -= Math.min(24, distanceToRange(shiftedMidi, targetRange.lowest, targetRange.highest)) * 0.1;
      }
    }
    score -= Math.abs(shift) * 0.01;

    if (score > bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  return bestShift;
}

function validateArrangementDraft(
  notes: BuilderArrangementNote[],
  tempoBpm: number,
  title: string,
): BuilderValidationReport {
  const checks: BuilderValidationCheck[] = [];
  const invalidNotes = notes.filter((note) => !(note.note in FRONTEND_INSTRUMENT_MAP));
  checks.push({
    label: "G3-C6 note set",
    status: invalidNotes.length === 0 ? "passed" : "failed",
    detail: invalidNotes.length === 0 ? "Every output note is on the fixed 18-note rack." : `${invalidNotes.length} notes are outside G3-C6.`,
  });

  const accidentalNotes = notes.filter((note) => /[#b]/.test(note.note));
  checks.push({
    label: "Natural notes only",
    status: accidentalNotes.length === 0 ? "passed" : "failed",
    detail: accidentalNotes.length === 0 ? "No output notes contain sharps or flats." : `${accidentalNotes.length} output notes contain sharps or flats.`,
  });

  const invalidMappings = notes.filter((note) => {
    const mapping = FRONTEND_INSTRUMENT_MAP[note.note];
    return !mapping || mapping.actuator_channel < 0 || mapping.actuator_channel >= ANGKLUNG_RANGE_NOTES.length;
  });
  checks.push({
    label: "Actuator channel mapping",
    status: invalidMappings.length === 0 ? "passed" : "failed",
    detail: invalidMappings.length === 0 ? "Every note resolves to a valid actuator channel." : `${invalidMappings.length} notes lack a valid actuator channel.`,
  });

  const schedule = buildValidationSchedule(notes, tempoBpm, title);
  const motorReport = validateMotorSafety(schedule);
  for (const check of motorReport.checks) {
    if (check.label === "All notes available") {
      continue;
    }
    checks.push(check);
  }

  const errors = checks.filter((check) => check.status === "failed").map((check) => `${check.label}: ${check.detail}`);
  const warnings = checks.filter((check) => check.status === "warning").map((check) => `${check.label}: ${check.detail}`);
  const overall = errors.length > 0 ? "FAILED" : warnings.length > 0 ? "WARNING" : "PASSED";
  return { overall, checks, errors, warnings };
}

function buildValidationSchedule(notes: BuilderArrangementNote[], tempoBpm: number, title: string): ActuatorSchedule {
  const secondsPerBeat = 60 / tempoBpm;
  const commands: ActuatorCommand[] = notes
    .map((note, index) => {
      const mapping = FRONTEND_INSTRUMENT_MAP[note.note];
      return {
        command_id: `builder_${String(index + 1).padStart(5, "0")}`,
        start_time_seconds: round(note.beat * secondsPerBeat, 4),
        note: note.note,
        instrument_id: mapping?.instrument_id ?? "",
        actuator_channel: mapping?.actuator_channel ?? -1,
        action: "shake",
        duration_seconds: round(note.duration_beats * secondsPerBeat, 4),
        strength: 0.8,
      };
    })
    .sort((left, right) => left.start_time_seconds - right.start_time_seconds || left.actuator_channel - right.actuator_channel);
  const totalDuration = commands.reduce(
    (maximum, command) => Math.max(maximum, command.start_time_seconds + command.duration_seconds),
    0,
  );

  return {
    format_version: "actuator_schedule.v1",
    project: "wro-angklung-ai-player",
    song: { title, tempo_bpm: tempoBpm, time_signature: "4/4" },
    generated_at: new Date(0).toISOString(),
    timing: { time_unit: "seconds", zero_time: "playback_start", total_duration_seconds: round(totalDuration, 4) },
    hardware_profile: { instrument_type: "angklung", controller: "simulator", default_action: "shake" },
    commands,
    validation: { status: "draft", warnings: [], errors: [] },
  };
}

function buildConversionWarnings({
  source,
  selection,
  unsupportedNotesCount,
  repeatedNoteWarnings,
  densityWarning,
  validationReport,
}: {
  source: ParsedMidiSource;
  selection: SelectedSource;
  unsupportedNotesCount: number;
  repeatedNoteWarnings: number;
  densityWarning: string | null;
  validationReport: BuilderValidationReport;
}): string[] {
  const warnings: string[] = [];
  if (source.tempoEventCount > 1) {
    warnings.push(`The source has ${source.tempoEventCount} tempo events; v1 exports the first tempo only.`);
  }
  if (unsupportedNotesCount > 0) {
    warnings.push(`${unsupportedNotesCount} chromatic or unmappable source notes were omitted after transposition.`);
  }
  if (selection.accompanimentTrackIndex === null) {
    warnings.push("No accompaniment source was selected; the draft contains melody only.");
  }
  if (
    selection.accompanimentTrackIndex !== null &&
    selection.accompanimentTrackIndex === selection.melodyTrackIndex &&
    selection.accompanimentExtraction === "lower_voices"
  ) {
    warnings.push("Melody and accompaniment were estimated from one dense track; operator review is required.");
  }
  if (repeatedNoteWarnings > 0) {
    warnings.push(`${repeatedNoteWarnings} repeated actuator gaps are below ${MOTOR_LIMITS.min_same_actuator_gap_seconds.toFixed(2)} seconds.`);
  }
  if (densityWarning) {
    warnings.push(densityWarning);
  }
  warnings.push(...validationReport.errors, ...validationReport.warnings);
  return [...new Set(warnings)];
}

function chooseVerdict({
  totalSourceNotes,
  outputNotes,
  unsupportedNotesCount,
  maxSimultaneousNotes,
  validationReport,
  warnings,
}: {
  totalSourceNotes: number;
  outputNotes: number;
  unsupportedNotesCount: number;
  maxSimultaneousNotes: number;
  validationReport: BuilderValidationReport;
  warnings: string[];
}): ConversionVerdict {
  if (outputNotes === 0 || unsupportedNotesCount / Math.max(totalSourceNotes, 1) > 0.4) {
    return "bad_source";
  }
  if (validationReport.overall === "FAILED" || maxSimultaneousNotes > 8) {
    return "needs_simplification";
  }
  if (maxSimultaneousNotes > 3) {
    return "dense";
  }
  return warnings.length > 0 ? "usable" : "clean";
}

function formatCatalogVerdict(verdict: ConversionVerdict): string {
  const labels: Record<ConversionVerdict, string> = {
    bad_source: "Bad source",
    clean: "Clean simulator draft",
    dense: "Dense simulator draft",
    needs_simplification: "Needs simplification",
    usable: "Usable simulator test",
  };
  return labels[verdict];
}

function countRepeatedNoteWarnings(notes: BuilderArrangementNote[], tempoBpm: number): number {
  const secondsPerBeat = 60 / tempoBpm;
  const byNote = new Map<string, BuilderArrangementNote[]>();
  for (const note of notes) {
    byNote.set(note.note, [...(byNote.get(note.note) ?? []), note]);
  }

  let warnings = 0;
  for (const noteGroup of byNote.values()) {
    const sorted = [...noteGroup].sort((left, right) => left.beat - right.beat);
    for (let index = 1; index < sorted.length; index += 1) {
      if ((sorted[index].beat - sorted[index - 1].beat) * secondsPerBeat < MOTOR_LIMITS.min_same_actuator_gap_seconds) {
        warnings += 1;
      }
    }
  }
  return warnings;
}

function calculateMaxSimultaneousNotes(notes: BuilderArrangementNote[]): number {
  const events = notes.flatMap((note) => [
    { beat: note.beat, delta: 1 },
    { beat: note.beat + note.duration_beats, delta: -1 },
  ]);
  events.sort((left, right) => left.beat - right.beat || left.delta - right.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

function buildDensityWarning(
  maxSimultaneousNotes: number,
  density: LibraryBuilderSettings["accompanimentDensity"],
): string | null {
  if (density === "dense_simulator_only") {
    return `Dense simulator-only mode is active; peak overlap is ${maxSimultaneousNotes} notes.`;
  }
  if (maxSimultaneousNotes > 3) {
    return `Peak overlap is ${maxSimultaneousNotes} notes; simplify before motor use.`;
  }
  return null;
}

function deduplicateMappedNotes(notes: BuilderArrangementNote[]): BuilderArrangementNote[] {
  const seen = new Set<string>();
  return notes
    .sort((left, right) => left.beat - right.beat || compareRackNotes(left.note, right.note) || left.role.localeCompare(right.role))
    .filter((note) => {
      const key = `${note.role}:${note.beat}:${note.note}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function foldNaturalNoteIntoRange(midi: number, lowest: number, highest: number): number | null {
  const candidates: number[] = [];
  for (let octaveShift = -10; octaveShift <= 10; octaveShift += 1) {
    const candidate = midi + octaveShift * 12;
    if (candidate >= lowest && candidate <= highest) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  return candidates.sort((left, right) => Math.abs(left - midi) - Math.abs(right - midi))[0];
}

function melodyTrackScore(track: MidiTrackInspection): number {
  const name = `${track.name} ${track.instrument}`.toLowerCase();
  const preferredNames = ["melody", "vocal", "lead", "right", "flute", "violin", "piano upper"];
  const nameScore = preferredNames.some((keyword) => name.includes(keyword)) ? 120 : 0;
  const clarityScore = Math.max(0, 30 - track.averageNotesPerOnset * 12);
  return nameScore + track.averageMidi + clarityScore + Math.log2(track.noteCount + 1);
}

function accompanimentTrackScore(track: MidiTrackInspection): number {
  const name = `${track.name} ${track.instrument}`.toLowerCase();
  const preferredNames = ["left", "bass", "piano lower", "accompaniment", "chord"];
  const nameScore = preferredNames.some((keyword) => name.includes(keyword)) ? 120 : 0;
  return nameScore + (127 - track.averageMidi) + track.averageNotesPerOnset * 5 + Math.log2(track.noteCount + 1);
}

function groupNotesByBeat(notes: SourceMidiNote[]): SourceMidiNote[][] {
  const groups = new Map<number, SourceMidiNote[]>();
  for (const note of notes) {
    groups.set(note.beat, [...(groups.get(note.beat) ?? []), note]);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right).map(([, group]) => group);
}

function countOnsets(ticks: number[]): number[] {
  const counts = new Map<number, number>();
  for (const tick of ticks) {
    counts.set(tick, (counts.get(tick) ?? 0) + 1);
  }
  return [...counts.values()];
}

function assertMetadata(metadata: LibraryBuilderMetadata): void {
  if (!metadata.title.trim()) {
    throw new Error("Song title is required.");
  }
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(metadata.songId)) {
    throw new Error("Song ID must use lowercase letters, numbers, and single underscores only.");
  }
}

function compareRackNotes(left: string, right: string): number {
  return ANGKLUNG_RANGE_NOTES.indexOf(left as (typeof ANGKLUNG_RANGE_NOTES)[number]) -
    ANGKLUNG_RANGE_NOTES.indexOf(right as (typeof ANGKLUNG_RANGE_NOTES)[number]);
}

function midiNumberToName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[modulo(midi, 12)]}${Math.floor(midi / 12) - 1}`;
}

function cleanTrackName(trackName: string, instrumentName: string, index: number): string {
  const cleanName = trackName.trim();
  if (cleanName) {
    return cleanName;
  }
  const cleanInstrument = instrumentName.trim();
  return cleanInstrument ? `Track ${index + 1} - ${cleanInstrument}` : `Track ${index + 1}`;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function distanceToRange(value: number, lowest: number, highest: number): number {
  if (value < lowest) {
    return lowest - value;
  }
  if (value > highest) {
    return value - highest;
  }
  return 0;
}

function formatSignedNumber(value: number): string {
  return value >= 0 ? `plus_${value}` : `minus_${Math.abs(value)}`;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(value * multiplier) / multiplier;
}
