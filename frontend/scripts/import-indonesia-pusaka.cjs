const fs = require('node:fs');
const path = require('node:path');
const { importExpressiveSketch } = require('./import-expressive-sketch.cjs');

const identity = {
  sourceName: 'Indonesia_Pusaka_Expressive.ino', id: 'indonesia_pusaka', title: 'Indonesia Pusaka', artist: 'Ismail Marzuki',
  aliases: ['indonesia pusaka', 'indonesiapusaka', 'pusaka', 'ismail marzuki indonesia pusaka'],
  category: 'indonesian_national', difficulty: 'medium',
  arrangementStatus: 'draft_sheet_adaptation_expressive_support_needs_physical_review',
  metadata: {
    source_score_key: 'C major',
    arrangement_scope: 'Melody-first adaptation from the supplied score screenshots with one soft bass-support note per bar.',
    chromatic_policy: 'Chromatic passing tones were simplified explicitly in the supplied sketch note map.',
  },
};

function importScore(source) { return importExpressiveSketch(source, identity); }

if (require.main === module) {
  const sourcePath = path.join(__dirname, 'sources', identity.sourceName);
  const destination = path.join(__dirname, '../public/songs/arrangements/indonesia_pusaka.json');
  const arrangement = importScore(fs.readFileSync(sourcePath, 'utf8'));
  fs.writeFileSync(destination, `${JSON.stringify(arrangement, null, 2)}\n`);
  console.log(`Imported ${arrangement.notes.length} Indonesia Pusaka events over ${arrangement.metadata.source_end_ms} ms.`);
}

module.exports = { importScore };
