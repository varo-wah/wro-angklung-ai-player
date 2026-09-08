const fs = require('node:fs');
const path = require('node:path');
const sourceName = 'Indonesia_Raya_Angklobot_Clear_Repeated_Notes.ino';
const rack = 'G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6'.split(' ');
function importScore(source) {
  const bpm = Number(source.match(/PLAYBACK_BPM = (\d+)/)[1]);
  const ticks = Number(source.match(/TICKS_PER_QUARTER = (\d+)/)[1]);
  const body = source.match(/const SongEvent SONG\[\] PROGMEM = \{([\s\S]*?)\n\};/)[1];
  const events = [...body.matchAll(/\{(\d+), (\d+), (\d+), (\d+)\}/g)].map(m => m.slice(1).map(Number));
  const ms = tick => Math.floor(tick * 60000 / (bpm * ticks));
  const notes = events.map(([start, duration, channel, flags], i) => {
    const written = ms(duration);
    const next = events[i + 1];
    const repeated = !(flags & 1) && next && next[2] === channel && next[0] === start + duration;
    const gap = flags & 1 ? 15 : repeated ? (written <= 300 ? 90 : written <= 900 ? 110 : 130)
      : written <= 260 ? 35 : written <= 850 ? 45 : 55;
    const hold = Math.min(3000, Math.max(70, Math.floor(written * 45 / 100), written > gap ? written - gap : written));
    if (!rack[channel]) throw new Error('Invalid source channel');
    return { note: rack[channel], start: ms(start) / 1000, duration: hold / 1000,
      role: 'melody', source_track: sourceName, source_start_tick: start, source_duration_ticks: duration,
      source_flags: flags, playback_strength_multiplier: 1 };
  });
  return { format_version: 'angklung_song.v1', id: 'indonesia_raya', title: 'Indonesia Raya',
    aliases: ['indonesia raya', 'indonesiaraya'], category: 'indonesian_national', tempo_bpm: bpm,
    time_signature: '4/4', physical_rack_map: 'G3-C6', arrangement_status: 'draft_source_sketch_needs_physical_review',
    playable: true, demo_safe: false, has_validated_notes: true,
    metadata: { source: sourceName, source_score_bpm: 96, ticks_per_quarter: ticks, source_end_tick: 640,
      articulation: 'Source release gaps, tied flags, repeated notes and event starts preserved at 92 BPM.',
      dynamics: 'Uses current website strength and existing firmware calibration. Source attack/sustain power envelope is not imported.' }, notes };
}
if (require.main === module) {
  const source = fs.readFileSync(path.join(__dirname, 'sources', sourceName), 'utf8');
  const arrangement = importScore(source);
  fs.writeFileSync(path.join(__dirname, '../public/songs/arrangements/indonesia_raya.json'), JSON.stringify(arrangement, null, 2) + '\n');
  console.log(`Imported ${arrangement.notes.length} source events at ${arrangement.tempo_bpm} BPM.`);
}
module.exports = { importScore };
