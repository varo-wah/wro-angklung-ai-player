const fs = require('node:fs');
const path = require('node:path');
const { importExpressiveSketch } = require('./import-expressive-sketch.cjs');

const identity = {
  sourceName: 'Bengawan_Solo_New_Sheet_Expressive.ino', id: 'bengawan_solo', title: 'Bengawan Solo', artist: 'Gesang',
  aliases: ['bengawan solo', 'gesang bengawan solo'], category: 'indonesian_traditional', difficulty: 'medium',
  arrangementStatus: 'draft_new_sheet_expressive_melody_needs_physical_review',
  metadata: {
    source_score_key: 'G major', mapped_key: 'C major', transposition_semitones: -7, source_written_bars: 25,
    performed_form: 'bars 1-8, 1-7, then 9-25',
    arrangement_scope: 'Melody only from the supplied single-staff score; no piano accompaniment was invented.',
  },
};

function importScore(source) { return importExpressiveSketch(source, identity); }

if (require.main === module) {
  const sourcePath = path.join(__dirname, 'sources', identity.sourceName);
  const destination = path.join(__dirname, '../public/songs/arrangements/bengawan_solo.json');
  const arrangement = importScore(fs.readFileSync(sourcePath, 'utf8'));
  fs.writeFileSync(destination, `${JSON.stringify(arrangement, null, 2)}\n`);
  console.log(`Imported ${arrangement.notes.length} Bengawan Solo events at ${arrangement.tempo_bpm} BPM.`);
}

module.exports = { importScore };
