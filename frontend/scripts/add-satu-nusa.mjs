import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
// Transcribed from the supplied C-major staff and numbered notation. Curves join
// different pitches (slurs), not repeated-note ties. No octave/key conversion.
const a = [['G4',1.5],['G4',.5],['A4',.5],['G4',.5],['E4',1]];
const b = [['C5',1.5],['C5',.5],['D5',.5],['C5',.5],['A4',1]];
const c = [['G4',1],['C5',.5],['D5',.5],['E5',1],['C5',1]];
const cadence = [['D5',1],['B4',1],['C5',2]];
const measures = [a,b,c,[['D5',1],['E5',1],['D5',2]],a,b,c,cadence,
  [['D5',1.5],['E5',.5],['D5',1],['C5',1]],
  [['B4',1],['A4',1],['G4',2]],
  [['F5',1.5],['F5',.5],['E5',1],['E5',1]],
  [['F5',1],['E5',1],['D5',2]],a,b,c,cadence];
// Two harmonic pulses per bar; cadence bars change from G to C halfway through.
const chords = ['C','F','C','G','C','F','C','G/C','G','G','F','F','C','F','C','G/C'];
const source = {source:'User-supplied Satu Nusa Satu Bangsa score screenshot, 2026-09-12; credited to L. Manik.',tempo_bpm:72,tempo_note:'Score says Lambat (slow), without a metronome number; 72 BPM is an arrangement choice.',time_signature:'4/4',key:'C major',transposition_semitones:0,measures,chords,bass_policy:'Composed root/fifth support from printed C/F/G chord symbols; two short pulses per bar, no arpeggios. G-to-C cadence changes retained.'};
fs.writeFileSync(path.join(root,'scripts/sources/satu-nusa-satu-bangsa-score.json'),JSON.stringify(source,null,2)+'\n');
const notes=[];
for (const [i,measure] of measures.entries()) {
  if (measure.reduce((sum,n)=>sum+n[1],0)!==4) throw Error(`Invalid measure ${i+1}`);
  let beat=i*4;
  for (const [note,duration] of measure) {
    notes.push({note,beat,duration_beats:duration,role:'melody',source_measure:i+1,playback_strength_multiplier:i>=8&&i<12?1.05:1});
    beat+=duration;
  }
  const pair = chords[i]==='G/C'?['G3','C4']:({C:['C4','G3'],F:['F4','C4'],G:['G3','D4']}[chords[i]]);
  for (const [j,note] of pair.entries()) notes.push({note,beat:i*4+j*2,duration_beats:.22,role:'accompaniment',source_measure:i+1,source_chord:chords[i],playback_strength_multiplier:note==='G3'?1.3:1.15});
}
notes.sort((a,b)=>a.beat-b.beat||a.note.localeCompare(b.note));
const id='satu_nusa_satu_bangsa',title='Satu Nusa Satu Bangsa';
const song={format_version:'angklung_song.v1',id,title,aliases:['satu nusa satu bangsa','satu nusa','satu bangsa'],category:'indonesian_national',difficulty:'easy',tempo_bpm:72,time_signature:'4/4',physical_rack_map:'G3-C6',arrangement_status:'sheet_transcription_draft_needs_listening_review',playable:true,demo_safe:false,has_validated_notes:true,playback_policy:'authored',arrangement_policy:{preserve_authored_dynamics:true},notes,metadata:{...source,measures:undefined,chords:undefined,melody_selection:'All 16 bars of the supplied treble melody, including dotted rhythm and half-note cadences. Original E4-F5 register; no accidental substitutions.',accompaniment_selection:source.bass_policy,calibration_review:'Audition approximately 183 ms bass pulses and low G3 attack; physical holds remain capped at 2 seconds.'}};
fs.writeFileSync(path.join(root,'public/songs/arrangements',id+'.json'),JSON.stringify(song,null,2)+'\n');
const cp=path.join(root,'public/songs/catalog.json'),catalog=JSON.parse(fs.readFileSync(cp));
const entry={id,title,aliases:song.aliases,category:song.category,difficulty:song.difficulty,priority:'high',arrangement_status:song.arrangement_status,playable:true,demo_safe:false,has_validated_notes:true,active:true,visible_in_guest:true,physical_rack_map:'G3-C6',melody_register:'upper_physical',melody_target_range:'E4-F5',path:`/songs/arrangements/${id}.json`};
const index=catalog.findIndex(s=>s.id===id);if(index<0)catalog.push(entry);else catalog[index]=entry;
fs.writeFileSync(cp,JSON.stringify(catalog,null,2)+'\n');
console.log(`${notes.filter(n=>n.role==='melody').length} melody notes; ${notes.filter(n=>n.role==='accompaniment').length} bass pulses`);
