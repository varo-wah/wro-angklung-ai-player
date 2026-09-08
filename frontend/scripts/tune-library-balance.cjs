const fs = require('node:fs');
const path = require('node:path');
const LOW = new Set('G3 A3 B3 C4 D4 E4 F4'.split(' '));
const HIGH = new Set('C5 D5 E5 F5 G5 A5 B5 C6'.split(' '));
// Role-based balance across each musical arrangement; there are no section markers.
// Absolute values make repeated runs idempotent. Fireflies has its own tuning.
function strengthFor(note, inheritedRole) {
  const role = note.role ?? inheritedRole;
  if (LOW.has(note.note) && role === 'accompaniment') return 0.90;
  if (HIGH.has(note.note) && role === 'melody') return 1.05;
  return note.playback_strength_multiplier;
}
function tuneArrangement(arrangement) {
  if (arrangement.category === 'hardware_trial' || ['fireflies_owl_city', 'indonesia_raya', 'indonesia_pusaka', 'bengawan_solo', 'you_are_the_reason'].includes(arrangement.id)) return arrangement;
  const tune = (note, role) => {
    const strength = strengthFor(note, role);
    return strength === undefined ? { ...note } : { ...note, playback_strength_multiplier: strength };
  };
  return {
    ...arrangement,
    ...(arrangement.notes ? { notes: arrangement.notes.map(note => tune(note)) } : {}),
    ...(arrangement.tracks ? { tracks: arrangement.tracks.map(track => track.notes ? ({ ...track, notes: track.notes.map(note => tune(note, track.role)) }) : track) } : {}),
  };
}
if (require.main === module) {
  const root = path.join(__dirname, '../public/songs/arrangements');
  let files = 0, notes = 0;
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.json')).sort()) {
    const file = path.join(root, name);
    const source = fs.readFileSync(file, 'utf8');
    const before = JSON.parse(source);
    const after = tuneArrangement(before);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    // Preserve source formatting and all original values, including seconds timing.
    const strengths = new Map();
    for (const note of after.notes ?? []) strengths.set(JSON.stringify(Object.fromEntries(Object.entries(note).filter(([key]) => key !== 'playback_strength_multiplier'))), note.playback_strength_multiplier);
    for (const track of after.tracks ?? []) for (const note of track.notes ?? []) strengths.set(JSON.stringify(Object.fromEntries(Object.entries(note).filter(([key]) => key !== 'playback_strength_multiplier'))), note.playback_strength_multiplier);
    const output = source.replace(/\{[^{}]*"note"\s*:[^{}]*\}/g, block => {
      const note = JSON.parse(block);
      const key = JSON.stringify(Object.fromEntries(Object.entries(note).filter(([key]) => key !== 'playback_strength_multiplier')));
      const strength = strengths.get(key);
      if (strength === undefined || strength === note.playback_strength_multiplier) return block;
      notes++;
      if ('playback_strength_multiplier' in note) return block.replace(/("playback_strength_multiplier":\s*)[\d.eE+-]+/, `$1${strength}`);
      return block.replace(/("note":\s*"[^"]+",)/, `$1\n${block.match(/\n(\s*)"note"/)[1]}"playback_strength_multiplier": ${strength},`);
    });
    if (JSON.stringify(JSON.parse(output)) !== JSON.stringify(after)) {
      // Property insertion order is irrelevant; verify sorted object contents.
      const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
      if (JSON.stringify(canonical(JSON.parse(output))) !== JSON.stringify(canonical(after))) throw new Error(`Preservation check failed: ${name}`);
    }
    fs.writeFileSync(file, output);
    files++;
  }
  console.log(`Balanced ${notes} notes across ${files} arrangements.`);
}
module.exports = { strengthFor, tuneArrangement };
