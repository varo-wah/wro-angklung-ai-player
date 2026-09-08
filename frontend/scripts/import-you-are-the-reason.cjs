const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const sourceName = 'You_Are_The_Reason_Dynamic_Hold_Softer_Lows.ino';
const rack = 'G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6'.split(' ');
const referencePowerPercent = 40;

function importScore(source) {
  const maximumPulseMs = Number(source.match(/MAX_PULSE_DURATION_MS = (\d+)/)?.[1]);
  const endMs = Number(source.match(/SONG_END_MS = (\d+)UL/)?.[1]);
  const powersBody = source.match(/motorPowerPercent\[CHANNEL_COUNT\] = \{([\s\S]*?)\n\};/)?.[1];
  const songBody = source.match(/const SongEvent SONG\[\] PROGMEM = \{([\s\S]*?)\n\};/)?.[1];
  if (![maximumPulseMs, endMs].every(Number.isFinite) || !powersBody || !songBody) {
    throw new Error('Unexpected You Are the Reason source structure.');
  }

  const motorPowerPercent = [...powersBody.matchAll(/\d+/g)].map(match => Number(match[0]));
  if (motorPowerPercent.length !== rack.length) {
    throw new Error(`Expected ${rack.length} motor power values, received ${motorPowerPercent.length}.`);
  }

  const events = [...songBody.matchAll(/\{(\d+)UL,\s*(\d+),\s*(\d+)\}/g)]
    .map(match => match.slice(1).map(Number));
  const notes = events.map(([startMs, requestedDurationMs, channel]) => {
    if (!rack[channel]) throw new Error(`Invalid source channel ${channel}.`);
    const softerLowRepeat = channel <= 6 && requestedDurationMs <= 180;
    const relativeStrength = motorPowerPercent[channel] / referencePowerPercent;
    const playbackStrengthMultiplier = Math.round(relativeStrength * (softerLowRepeat ? 0.8 : 1) * 1000) / 1000;
    return {
      note: rack[channel],
      start: startMs / 1000,
      duration: Math.min(requestedDurationMs, maximumPulseMs) / 1000,
      velocity: Math.min(127, Math.max(1, Math.round(96 * playbackStrengthMultiplier))),
      role: 'melody',
      source_track: sourceName,
      source_start_ms: startMs,
      source_duration_ms: requestedDurationMs,
      source_motor_power_percent: motorPowerPercent[channel],
      source_softer_low_repeat: softerLowRepeat,
      playback_strength_multiplier: playbackStrengthMultiplier,
      physical_rack_map: 'G3-C6',
    };
  });

  return {
    format_version: 'angklung_song.v1',
    id: 'you_are_the_reason',
    title: 'You Are the Reason',
    artist: 'Calum Scott',
    aliases: ['you are the reason', 'calum scott you are the reason'],
    category: 'international_pop',
    difficulty: 'medium_hard',
    tempo_bpm: 86,
    time_signature: '6/8',
    timing_mode: 'absolute_milliseconds_from_source_sketch',
    physical_rack_map: 'G3-C6',
    arrangement_status: 'draft_source_sketch_dynamic_hold_softer_lows_needs_physical_review',
    playable: true,
    demo_safe: false,
    has_validated_notes: true,
    metadata: {
      source: sourceName,
      source_sha256: crypto.createHash('sha256').update(source).digest('hex'),
      source_event_count: events.length,
      source_end_ms: endMs,
      maximum_pulse_duration_ms: maximumPulseMs,
      articulation: `Absolute source starts and note-aware holds are preserved, capped at ${maximumPulseMs} ms as specified by the sketch.`,
      dynamics: 'Per-channel source power is represented relative to the 40% source baseline. Short G3-F4 events receive the source sketch\'s additional 20% reduction. Current website motor calibration remains authoritative.',
      playback_scope: 'All source events are exposed as melody so the default simulator mode reproduces the complete supplied score.',
    },
    notes,
  };
}

if (require.main === module) {
  const sourcePath = path.join(__dirname, 'sources', sourceName);
  const destination = path.join(__dirname, '../public/songs/arrangements/you_are_the_reason.json');
  const arrangement = importScore(fs.readFileSync(sourcePath, 'utf8'));
  fs.writeFileSync(destination, `${JSON.stringify(arrangement, null, 2)}\n`);
  console.log(`Imported ${arrangement.notes.length} You Are the Reason events over ${arrangement.metadata.source_end_ms} ms.`);
}

module.exports = { importScore };
