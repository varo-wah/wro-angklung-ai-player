const fs = require('node:fs');
const path = require('node:path');

// Fireflies only: columns are <= 0.25 beats, < 0.75 beats, >= 0.75 beats.
// These musical multipliers do not replace physical motor calibration.
const RULES = [
  { notes: 'G3 A3 B3 C4 D4 E4 F4'.split(' '), strengths: [1.05, 0.95, 0.90] },
  { notes: 'G4 A4 B4'.split(' '), strengths: [1.10, 1.00, 0.95] },
  { notes: 'C5 D5 E5 F5 G5 A5 B5 C6'.split(' '), strengths: [1.25, 1.15, 1.10] },
];
function multiplierFor(note) {
  const rule = RULES.find(rule => rule.notes.includes(note.note));
  if (!rule || !Number.isFinite(note.duration_beats) || note.duration_beats <= 0) {
    throw new Error(`Unsupported Fireflies note: ${JSON.stringify(note)}`);
  }
  const durationIndex = note.duration_beats <= 0.25 ? 0 : note.duration_beats < 0.75 ? 1 : 2;
  // Preserve the entire opening before the bass track enters at beat 32.
  if (note.beat >= 32 && note.role === "accompaniment" && rule === RULES[0]) {
    return [0.90, 0.82, 0.75][durationIndex];
  }
  if (note.beat >= 32 && note.role === "melody" && rule === RULES[2]) {
    return [1.25, 1.20, 1.15][durationIndex];
  }
  return rule.strengths[durationIndex];
}
// Keep rapid attacks intact; release scored notes of >= 0.75 beats 25% earlier.
function durationMultiplierFor(note) {
  return note.duration_beats >= 0.75 ? 0.75 : 1;
}
if (require.main === module) {
  const file = path.join(__dirname, '../public/songs/arrangements/fireflies_owl_city.json');
  const source = fs.readFileSync(file, 'utf8');
  const arrangement = JSON.parse(source);
  if (arrangement.id !== 'fireflies_owl_city' || arrangement.tempo_bpm !== 92 || arrangement.tracks) {
    throw new Error('Unexpected Fireflies arrangement structure.');
  }
  // Replace each note object in place to preserve all existing formatting and values.
  let index = 0;
  const result = source.replace(/\{[^{}]*"duration_beats"[^{}]*\}/g, block => {
    const note = arrangement.notes[index++];
    const multiplier = multiplierFor(note);
    const durationMultiplier = durationMultiplierFor(note);
    if (/"playback_duration_multiplier"/.test(block)) {
      block = block.replace(/("playback_duration_multiplier":\s*)[\d.eE+-]+/, `$1${durationMultiplier}`);
    } else {
      block = block.replace(/("duration_beats":\s*[\d.]+,)/, `$1\n      "playback_duration_multiplier": ${durationMultiplier},`);
    }
    if (/"playback_strength_multiplier"/.test(block)) {
      return block.replace(/("playback_strength_multiplier":\s*)[\d.eE+-]+/, `$1${multiplier}`);
    }
    return block.replace(/("velocity":\s*\d+,)/, `$1\n      "playback_strength_multiplier": ${multiplier},`);
  });
  if (index !== arrangement.notes.length) throw new Error('Note count mismatch.');
  fs.writeFileSync(file, result);
}
module.exports = { multiplierFor, durationMultiplierFor, RULES };
