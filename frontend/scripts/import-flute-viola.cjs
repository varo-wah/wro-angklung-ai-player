const fs = require('node:fs');
const path = require('node:path');
const sourcePath = path.join(__dirname, 'sources/Untitled_Flute_Viola_Score.json');
const rack = new Set('G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6'.split(' '));
function importScore(source) {
  const score = typeof source === 'string' ? JSON.parse(source) : source;
  const events = [];
  let beat = 0, tied = null;
  for (const [index, bar] of score.flute_bars.entries()) {
    let length = 0;
    for (const token of bar) {
      const match = /^(R|[A-G]#?\d):([\d.]+)(~?)$/.exec(token);
      if (!match) throw new Error(`Invalid token ${token}`);
      const [, written, value, tie] = match;
      const duration = Number(value);
      const note = written === 'A#4' ? 'A4' : written;
      if (written !== 'R' && !rack.has(note)) throw new Error(`Unavailable note ${written}`);
      if (tied) {
        if (tied.source_note !== written) throw new Error('Tie pitch mismatch');
        tied.duration_beats += duration;
      } else if (written !== 'R') events.push({ note, source_note: written, beat, duration_beats: duration, source_bar: index + 1 });
      tied = tie ? events.at(-1) : null;
      beat += duration; length += duration;
    }
    if (length !== 2) throw new Error(`Bar ${index + 1} is not 2/4`);
  }
  if (tied) throw new Error('Unfinished tie');
  const seconds = 60 / score.tempo_bpm;
  const round = n => Math.round(n * 1000) / 1000;
  const melody = events.map((e, i) => ({
    note: e.note, role: 'melody', source_track: 'Flute (upper voice)', source_note: e.source_note,
    source_bar: e.source_bar, source_beat: e.beat, source_duration_beats: e.duration_beats,
    start: round(e.beat * seconds), duration: round(e.duration_beats * seconds - (events[i + 1]?.note === e.note ? 0.09 : 0.035)),
    velocity: 96, playback_strength_multiplier: 1,
  }));
  const extra = [];
  for (const support of score.viola_support) {
    if (!rack.has(support.note)) throw new Error('Viola pitch outside rack');
    const start = (support.bar - 1) * 2 * seconds;
    const duration = score.extra_pulse_seconds;
    // Never interrupt a flute note on the same physical angklung, including release clearance.
    if (melody.some(n => n.note === support.note && start < n.start + n.duration + 0.01 && start + duration + 0.01 > n.start)) continue;
    extra.push({ note: support.note, role: 'accompaniment', source_track: 'Viola (sparse selection)', source_bar: support.bar,
      start: round(start), duration, velocity: 96, playback_strength_multiplier: score.extra_strength_multiplier });
  }
  return {
    format_version: 'angklung_song.v1', id: score.id, title: score.title, aliases: [score.title, 'manuk dadali', 'manuk', 'flute viola', 'untitled score'],
    category: 'score_adaptation', difficulty: 'medium', tempo_bpm: score.tempo_bpm, time_signature: '2/4',
    physical_rack_map: 'G3-C6', arrangement_status: 'user_score_flute_sparse_viola_needs_listening_review',
    playable: true, demo_safe: false, has_validated_notes: true,
    arrangement_policy: { preserve_authored_dynamics: true, melody_register: 'written', melody_target_range: 'B3-E5' },
    metadata: { source: score.source, source_images: score.source_images, adaptations: score.adaptations, bars: 40,
      duration_beats: beat, melody_count: melody.length, extra_count: extra.length,
      pitch_substitutions: melody.filter(n => n.note !== n.source_note).map(n => ({bar:n.source_bar,from:n.source_note,to:n.note})),
      extra_policy: score.extra_trial_note,
      extra_pulse_seconds: score.extra_pulse_seconds, extra_strength_multiplier: score.extra_strength_multiplier },
    notes: [...melody, ...extra].sort((a,b) => a.start - b.start),
  };
}
if (require.main === module) {
  const song = importScore(fs.readFileSync(sourcePath, 'utf8'));
  fs.writeFileSync(path.join(__dirname, '../public/songs/arrangements/untitled_flute_viola.json'), JSON.stringify(song,null,2)+'\n');
  console.log(song.metadata);
}
module.exports = { importScore };
