const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Explicit score pitches, not channels from the superseded Arduino adaptation.
function importScore(source) {
  const score = typeof source === 'string' ? JSON.parse(source) : source;
  const secondsPerBeat = 60 / score.tempo_bpm;
  const events = [];
  let beat = 0;
  let tied = null;
  for (const [barIndex, bar] of score.bars.entries()) {
    let barBeats = 0;
    for (const token of bar) {
      const match = /^(R|[A-G][3-6]):(\d+(?:\.\d+)?)(~?)$/.exec(token);
      if (!match) throw new Error(`Invalid score token ${token}`);
      const [, pitch, length, tie] = match;
      const duration = Number(length);
      if (tied) {
        if (pitch !== tied.note) throw new Error('Tie must continue the same pitch.');
        tied.duration_beats += duration;
      } else if (pitch !== 'R') {
        events.push({ note: pitch, beat, duration_beats: duration, source_bar: barIndex + 1 });
      }
      tied = tie ? events.at(-1) : null;
      beat += duration;
      barBeats += duration;
    }
    if (barBeats !== 4) throw new Error(`Bar ${barIndex + 1} does not contain four beats.`);
  }
  if (tied) throw new Error('Unfinished tie.');
  const round = value => Math.round(value * 1000) / 1000;
  const notes = events.map((event, index) => {
    const written = event.duration_beats * secondsPerBeat;
    const next = events[index + 1];
    const repeated = next?.note === event.note && next.beat === event.beat + event.duration_beats;
    const gap = repeated ? 0.11 : written <= 0.45 ? 0.035 : 0.055;
    return {
      note: event.note, start: round(event.beat * secondsPerBeat), duration: round(written - gap),
      velocity: 96, role: 'melody', source_track: 'Bengawan_Solo_User_Score.json',
      source_bar: event.source_bar, source_beat: event.beat, source_duration_beats: event.duration_beats,
      physical_rack_map: 'G3-C6',
    };
  });
  return {
    format_version: 'angklung_song.v1', id: 'bengawan_solo', title: 'Bengawan Solo', artist: 'Gesang',
    aliases: ['bengawan solo', 'gesang bengawan solo'], category: 'indonesian_traditional', difficulty: 'medium',
    tempo_bpm: score.tempo_bpm, time_signature: '4/4', timing_mode: 'absolute_seconds_from_transcribed_score',
    physical_rack_map: 'G3-C6', arrangement_status: 'user_score_transcription_needs_physical_review',
    playable: true, demo_safe: false, has_validated_notes: true,
    metadata: {
      source: score.source, source_image_filename: score.source_image_filename,
      source_sha256: crypto.createHash('sha256').update(JSON.stringify(score)).digest('hex'),
      source_score_key: 'C major', mapped_key: 'C major', transposition_semitones: 0,
      pitch_substitutions: 0, source_written_bars: score.bars.length, performed_form: 'bars 1-32, once',
      source_event_count: notes.length, source_end_tick: beat * 4, source_end_ms: Math.round(beat * secondsPerBeat * 1000),
      tempo_note: score.tempo_note,
      articulation: 'Written attacks and rests preserved; bar 22-23 A4 tie is one attack. Short release gaps separate other notes; different-pitch slurs are not ties.',
      arrangement_scope: 'Melody only; chord symbols are reference harmony, not additional melody notes.',
    }, notes,
  };
}

if (require.main === module) {
  const source = fs.readFileSync(path.join(__dirname, 'sources/Bengawan_Solo_User_Score.json'), 'utf8');
  const arrangement = importScore(source);
  fs.writeFileSync(path.join(__dirname, '../public/songs/arrangements/bengawan_solo.json'), `${JSON.stringify(arrangement, null, 2)}\n`);
  console.log(`Imported ${arrangement.notes.length} melody attacks from 32 bars at ${arrangement.tempo_bpm} BPM.`);
}
module.exports = { importScore };
