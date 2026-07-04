import type { AngklungArrangement, ArrangementNote, LoadedSong, SongCatalogEntry, SongNote } from "./songTypes";

export async function loadSongArrangement(catalogEntry: SongCatalogEntry): Promise<LoadedSong> {
  if (catalogEntry.playable === false || catalogEntry.active === false) {
    throw new Error(catalogEntry.reason || "This arrangement is not playable yet.");
  }

  const response = await fetch(catalogEntry.path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Arrangement file failed to load.");
  }

  const arrangement = (await response.json()) as AngklungArrangement;
  if (!arrangement || typeof arrangement !== "object") {
    throw new Error("Arrangement file failed to load.");
  }

  const tempoBpm = arrangement.tempo_bpm;
  if (!Number.isFinite(tempoBpm) || tempoBpm <= 0) {
    throw new Error("Arrangement file failed to load.");
  }

  const notes = flattenArrangementNotes(arrangement, tempoBpm);
  if (notes.length === 0) {
    throw new Error("Arrangement file failed to load.");
  }

  return {
    id: catalogEntry.id,
    title: catalogEntry.title,
    aliases: catalogEntry.aliases ?? arrangement.aliases,
    arrangement_status: catalogEntry.arrangement_status ?? arrangement.arrangement_status,
    category: catalogEntry.category ?? arrangement.category,
    demo_safe: catalogEntry.demo_safe ?? arrangement.demo_safe,
    difficulty: catalogEntry.difficulty ?? arrangement.difficulty,
    has_validated_notes: catalogEntry.has_validated_notes ?? arrangement.has_validated_notes,
    active: catalogEntry.active,
    physical_rack_map:
      catalogEntry.physical_rack_map ??
      arrangement.arrangement_policy?.physical_rack_map ??
      arrangement.physical_rack_map ??
      arrangement.rack_map,
    melody_register: catalogEntry.melody_register ?? arrangement.arrangement_policy?.melody_register,
    melody_target_range: catalogEntry.melody_target_range ?? arrangement.arrangement_policy?.melody_target_range,
    accompaniment_register: catalogEntry.accompaniment_register ?? arrangement.arrangement_policy?.accompaniment_register,
    accompaniment_target_range: catalogEntry.accompaniment_target_range ?? arrangement.arrangement_policy?.accompaniment_target_range,
    playable: catalogEntry.playable ?? arrangement.playable,
    priority: catalogEntry.priority,
    reason: catalogEntry.reason,
    source_path: catalogEntry.path,
    tempo_bpm: tempoBpm,
    time_signature: arrangement.time_signature,
    verdict: catalogEntry.verdict,
    notes,
  };
}

function flattenArrangementNotes(arrangement: AngklungArrangement, tempoBpm: number): SongNote[] {
  const trackNotes =
    arrangement.tracks?.flatMap((track) =>
      track.notes.map((note) => ({
        ...note,
        role: note.role ?? track.role,
        register: note.register ?? track.register,
      })),
    ) ?? [];

  const notes = trackNotes.length > 0 ? trackNotes : arrangement.notes ?? [];
  return notes.map((note) => toTimedNote(note, tempoBpm)).sort((left, right) => left.start - right.start || left.note.localeCompare(right.note));
}

function toTimedNote(note: ArrangementNote, tempoBpm: number): SongNote {
  if (typeof note.start === "number" && typeof note.duration === "number") {
    return {
      note: note.note,
      start: roundSeconds(note.start),
      duration: roundSeconds(note.duration),
      register: note.register,
      role: note.role,
      sourceTrack: note.source_track ?? note.track,
    };
  }

  if (typeof note.beat !== "number" || typeof note.duration_beats !== "number") {
    throw new Error("Arrangement file failed to load.");
  }

  const secondsPerBeat = 60 / tempoBpm;
  return {
    note: note.note,
    start: roundSeconds(note.beat * secondsPerBeat),
    duration: roundSeconds(note.duration_beats * secondsPerBeat),
    register: note.register,
    role: note.role,
    sourceTrack: note.source_track ?? note.track,
  };
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
