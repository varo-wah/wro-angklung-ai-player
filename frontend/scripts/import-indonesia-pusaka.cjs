const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const rack = new Set('G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6'.split(' '));

function importScore(source) {
  const score = typeof source === 'string' ? JSON.parse(source) : source;
  const performed = [
    ...score.bars.slice(0, -1).map((tokens, i) => ({ tokens, bar: i + 1, verse: 1 })),
    { tokens: ['C4:3', 'G3:0.5', 'C4:0.5'], bar: 17, verse: 1 },
    ...score.bars.slice(1).map((tokens, i) => ({ tokens, bar: i + 2, verse: 2 })),
  ];
  const events = [];
  let beat = 0;
  for (const bar of performed) {
    let length = 0;
    for (const token of bar.tokens) {
      const match = /^(R|[A-G](?:#|b)?[3-6]):(\d+(?:\.\d+)?)$/.exec(token);
      if (!match) throw new Error(`Invalid token: ${token}`);
      const [, sourceNote, durationText] = match;
      const duration = Number(durationText);
      if (sourceNote !== 'R') {
        const note = score.rack_substitutions[sourceNote] ?? sourceNote;
        if (!rack.has(note)) throw new Error(`Unavailable rack note: ${note}`);
        events.push({ note, sourceNote, beat, duration, bar: bar.bar, verse: bar.verse });
      }
      beat += duration;
      length += duration;
    }
    if (length !== 4) throw new Error(`Bar ${bar.bar} must contain four beats.`);
  }
  const seconds = 60 / score.tempo_bpm;
  const round = n => Math.round(n * 1000) / 1000;
  const notes = events.map((event, index) => {
    const next = events[index + 1];
    const repeat = next?.note === event.note && next.beat === event.beat + event.duration;
    return {
      note: event.note, start: round(event.beat * seconds), duration: round(event.duration * seconds - (repeat ? 0.11 : 0.055)),
      velocity: 96, role: 'melody', source_track: 'Indonesia_Pusaka_Reference_Score.json',
      source_note: event.sourceNote, source_bar: event.bar, source_verse: event.verse,
      source_beat: event.beat, source_duration_beats: event.duration,
      physical_rack_map: 'G3-C6',
    };
  });
  return {
    format_version: 'angklung_song.v1', id: 'indonesia_pusaka', title: score.title, artist: score.artist,
    aliases: ['indonesia pusaka', 'indonesiapusaka', 'pusaka', 'ismail marzuki indonesia pusaka'],
    category: 'indonesian_national', difficulty: 'medium', tempo_bpm: score.tempo_bpm, time_signature: '4/4',
    physical_rack_map: 'G3-C6', timing_mode: 'absolute_seconds_from_reference_score',
    arrangement_status: 'reference_melody_explicit_chromatic_simplification_needs_review',
    playable: true, demo_safe: false, has_validated_notes: true,
    metadata: {
      source: score.source, source_url: score.source_url,
      source_sha256: crypto.createHash('sha256').update(JSON.stringify(score)).digest('hex'),
      source_score_key: score.source_key, mapped_key: 'C major', transposition_semitones: 0,
      source_written_bars: score.bars.length, performed_bars: performed.length, performed_form: score.form,
      source_end_tick: beat * 4, source_end_ms: Math.round(beat * seconds * 1000), source_event_count: notes.length,
      pitch_substitutions: notes.filter(n => n.note !== n.source_note).map(n => ({ verse: n.source_verse, bar: n.source_bar, beat: n.source_beat, from: n.source_note, to: n.note })),
      chromatic_policy: score.substitution_reason,
      arrangement_scope: 'Melody only. No invented bass support or chord accompaniment. Source tempo 70 BPM.',
      articulation: 'Written attacks and rests retained, with 110ms release for adjacent same-pitch attacks and 55ms otherwise.',
    }, notes,
  };
}
if (require.main === module) {
  const score = fs.readFileSync(path.join(__dirname, 'sources/Indonesia_Pusaka_Reference_Score.json'), 'utf8');
  const arrangement = importScore(score);
  fs.writeFileSync(path.join(__dirname, '../public/songs/arrangements/indonesia_pusaka.json'), `${JSON.stringify(arrangement, null, 2)}\n`);
  console.log(`${arrangement.notes.length} melody attacks; ${arrangement.metadata.pitch_substitutions.length} explicit passing-note substitutions.`);
}
module.exports = { importScore };
