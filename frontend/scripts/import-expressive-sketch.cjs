const crypto = require('node:crypto');

const rack = 'G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6'.split(' ');
const referencePowerPercent = 30;

function constant(source, name) {
  const value = Number(source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`))?.[1]);
  if (!Number.isFinite(value)) throw new Error(`Missing source constant ${name}.`);
  return value;
}

function importExpressiveSketch(source, identity) {
  const scoreBpm = constant(source, 'SCORE_BPM');
  const finalSectionBpm = constant(source, 'FINAL_SECTION_BPM');
  const tempoPercent = constant(source, 'TEMPO_PERCENT');
  const ticksPerQuarter = constant(source, 'TICKS_PER_QUARTER');
  const finalSectionTick = constant(source, 'FINAL_SECTION_TICK');
  const endTick = constant(source, 'SONG_END_TICK');
  const maximumHoldMs = constant(source, 'MAX_NOTE_HOLD_MS');
  const maximumSupportHoldMs = constant(source, 'MAX_SUPPORT_HOLD_MS');
  const maximumOutputPower = constant(source, 'MAX_OUTPUT_POWER_PERCENT');
  const minimumMelodySustain = constant(source, 'MIN_MELODY_SUSTAIN_PERCENT');
  const minimumSupportSustain = constant(source, 'MIN_SUPPORT_SUSTAIN_PERCENT');
  const shortThresholdMs = constant(source, 'SHORT_NOTE_THRESHOLD_MS');
  const mediumThresholdMs = constant(source, 'MEDIUM_NOTE_THRESHOLD_MS');
  const attackMediumMs = constant(source, 'ATTACK_MS_MEDIUM');
  const attackLongMs = constant(source, 'ATTACK_MS_LONG');
  const powersBody = source.match(/motorPowerPercent\[CHANNEL_COUNT\] = \{([\s\S]*?)\n\};/)?.[1];
  const songBody = source.match(/const SongEvent SONG\[\] PROGMEM = \{([\s\S]*?)\n\};/)?.[1];
  if (!powersBody || !songBody) throw new Error(`Unexpected ${identity.title} source structure.`);

  const powers = [...powersBody.matchAll(/\d+/g)].map(match => Number(match[0]));
  if (powers.length !== rack.length) throw new Error(`Expected ${rack.length} power values, received ${powers.length}.`);
  const events = [...songBody.matchAll(/\{(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\}/g)]
    .map(match => match.slice(1).map(Number));

  const tickToMs = (tick) => {
    const denominator1 = scoreBpm * ticksPerQuarter * tempoPercent;
    if (tick <= finalSectionTick) return Math.floor(tick * 6000000 / denominator1);
    const firstPart = Math.floor(finalSectionTick * 6000000 / denominator1);
    const denominator2 = finalSectionBpm * ticksPerQuarter * tempoPercent;
    return firstPart + Math.floor((tick - finalSectionTick) * 6000000 / denominator2);
  };
  const clampPower = value => Math.max(0, Math.min(maximumOutputPower, value));

  const notes = events.map(([startTick, durationTicks, nextSameTick, channel, roleCode]) => {
    if (!rack[channel] || ![0, 1].includes(roleCode)) throw new Error(`Invalid event channel or role in ${identity.title}.`);
    const startMs = tickToMs(startTick);
    const writtenMs = tickToMs(startTick + durationTicks) - startMs;
    let releaseGapMs;
    if (roleCode === 1) releaseGapMs = 65;
    else if (nextSameTick === startTick + durationTicks) {
      releaseGapMs = writtenMs <= 300 ? 90 : writtenMs <= 1100 ? 110 : 130;
    } else releaseGapMs = writtenMs <= 300 ? 35 : writtenMs <= 1100 ? 45 : 55;

    let holdMs = writtenMs > releaseGapMs ? writtenMs - releaseGapMs : 0;
    if (nextSameTick !== 65535 && nextSameTick > startTick) {
      const nextStartMs = tickToMs(nextSameTick) - startMs;
      if (nextStartMs < holdMs + releaseGapMs) holdMs = nextStartMs > releaseGapMs ? nextStartMs - releaseGapMs : 0;
    }
    holdMs = Math.min(holdMs, roleCode === 1 ? maximumSupportHoldMs : maximumHoldMs);

    let base = powers[channel];
    if (roleCode === 1) base = Math.floor((base * 65 + 50) / 100);
    let attack = base;
    let sustain = base;
    let attackMs = holdMs;
    if (roleCode === 1) {
      attack = base + 1;
      sustain = Math.max(minimumSupportSustain, Math.floor((base * 78 + 50) / 100));
      attackMs = Math.min(80, holdMs);
    } else if (holdMs <= shortThresholdMs) {
      attack = base + 3;
      sustain = attack;
    } else if (holdMs <= mediumThresholdMs) {
      attack = base + 2;
      sustain = Math.max(minimumMelodySustain, Math.floor((base * 88 + 50) / 100));
      attackMs = Math.min(attackMediumMs, holdMs);
    } else {
      attack = base + 2;
      const scale = holdMs >= 2000 ? 72 : 78;
      sustain = Math.max(minimumMelodySustain, Math.floor((base * scale + 50) / 100));
      attackMs = Math.min(attackLongMs, holdMs);
    }
    sustain = Math.min(sustain, base);
    if (roleCode === 0 && holdMs <= shortThresholdMs) sustain = attack;
    attack = clampPower(attack);
    sustain = clampPower(sustain);
    const equivalentPower = holdMs > 0 ? (attack * attackMs + sustain * (holdMs - attackMs)) / holdMs : 0;

    return {
      note: rack[channel],
      start: startMs / 1000,
      duration: holdMs / 1000,
      velocity: Math.min(127, Math.max(1, Math.round(96 * equivalentPower / referencePowerPercent))),
      role: roleCode === 0 ? 'melody' : 'accompaniment',
      source_track: identity.sourceName,
      source_start_tick: startTick,
      source_duration_ticks: durationTicks,
      source_next_same_tick: nextSameTick,
      source_role: roleCode === 0 ? 'melody' : 'support',
      source_attack_power_percent: attack,
      source_sustain_power_percent: sustain,
      source_attack_ms: attackMs,
      playback_strength_multiplier: Math.round(equivalentPower / referencePowerPercent * 1000) / 1000,
      physical_rack_map: 'G3-C6',
    };
  });
  if (notes.some(note => note.duration < 0.01)) throw new Error(`${identity.title} contains an unplayably short imported hold.`);

  return {
    format_version: 'angklung_song.v1', id: identity.id, title: identity.title, artist: identity.artist,
    aliases: identity.aliases, category: identity.category, difficulty: identity.difficulty,
    tempo_bpm: Math.floor(scoreBpm * tempoPercent / 100),
    tempo_events: [{ start_tick: 0, bpm: scoreBpm * tempoPercent / 100 }, ...(finalSectionBpm === scoreBpm ? [] : [{ start_tick: finalSectionTick, bpm: finalSectionBpm * tempoPercent / 100 }])],
    time_signature: '4/4', timing_mode: 'absolute_seconds_from_source_sketch_tempo_map', physical_rack_map: 'G3-C6',
    arrangement_status: identity.arrangementStatus, playable: true, demo_safe: false, has_validated_notes: true,
    metadata: {
      source: identity.sourceName, source_sha256: crypto.createHash('sha256').update(source).digest('hex'),
      source_event_count: events.length, source_score_bpm: scoreBpm, source_final_section_bpm: finalSectionBpm,
      tempo_percent: tempoPercent, ticks_per_quarter: ticksPerQuarter, final_section_tick: finalSectionTick,
      source_end_tick: endTick, source_end_ms: tickToMs(endTick),
      articulation: 'The sketch release-gap and hold-cap calculations are reproduced for every event without moving note attacks.',
      dynamics: 'The attack/sustain envelope is converted to an equivalent constant per-note strength relative to the 30% source baseline. Current website motor calibration remains authoritative.',
      limitation: 'The current Web Serial protocol cannot transmit separate attack and sustain power values within one note.',
      ...identity.metadata,
    },
    notes,
  };
}

module.exports = { importExpressiveSketch };
