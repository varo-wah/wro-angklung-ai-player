import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
// Scale degrees relative to the printed F tonic; suffix L marks the lower octave.
// A uniform +7-semitone transposition gives C major without losing the printed Bb.
const measures=[
 [['R',3],['5L',.5],['5L',.5]],
 [['1',1],['1',1],['2',1],['2',1]],
 [['3',2],['R',1],['3',.5],['4',.5]],
 [['5',1],['1',.5],['2',.5],['3',1],['4',1]],
 [['2',2],['R',1],['5L',.5],['5L',.5]],
 [['2',1],['2',1],['3',1],['3',1]],
 [['4',2],['R',1],['3',.5],['2',.5]],
 [['1',1],['5L',.5],['5L',.5],['5L',1],['6L',.5],['7L',.5]],
 [['1',2],['R',1],['1',.75],['1',.25]],
 [['1',1],['6L',.75],['1',.25],['4',1],['5',.75],['6',.25]],
 [['5',2],['R',1],['1',.5],['1',.5]],
 [['1',1],['6L',.75],['1',.25],['4',1],['5',.75],['6',.25]],
 [['5',2],['R',1],['5',1]],
 [['6',1.5],['5',.5],['4',1],['3',1]],
 [['2',2],['R',.5],['1',.5],['1',.75],['1',.25]],
 [['1',1.5],['6L',.5],['5L',.75],['1',.25],['1',.75],['1',.25]],
 [['1',1],['2',.5],['3',.5],['R',1],['1',1]],
 [['1',1],['6',1],['5',1.5],['7L',.5]],
 [['1',2],['R',2]],
];
const pitches={'5L':'G4','6L':'A4','7L':'B4','1':'C5','2':'D5','3':'E5','4':'F5','5':'G5','6':'A5'};
const sourcePitches={'5L':'C4','6L':'D4','7L':'E4','1':'F4','2':'G4','3':'A4','4':'Bb4','5':'C5','6':'D5'};
const chords=['C','C','C','C','G','G','F','C','C','F','C','F','C','F','G','C','C','G','C'];
const source={source:'User-supplied Garuda Pancasila score screenshot, 2026-09-12; score credits Prahar & Sudharnoto.',tempo_bpm:112,tempo_note:'112 BPM chosen for Marcia con festoso; no numeric tempo printed.',source_key:'F major',key:'C major',transposition_semitones:7,measures,chords,bass_policy:'Composed C/F/G support, at most two short root/fifth pulses per bar, silent during written rests and opening pickup.'};
fs.writeFileSync(path.join(root,'scripts/sources/garuda-pancasila-score.json'),JSON.stringify(source,null,2)+'\n');
const notes=[];
for(const [i,measure] of measures.entries()){
 if(measure.reduce((sum,n)=>sum+n[1],0)!==4)throw Error(`Measure ${i+1}`);
 let beat=i*4; const melody=[];
 for(const [degree,duration] of measure){
  if(degree!=='R'){const n={note:pitches[degree],source_note:sourcePitches[degree],beat,duration_beats:duration,role:'melody',source_measure:i+1,playback_strength_multiplier:1};notes.push(n);melody.push(n);}
  beat+=duration;
 }
 if(i===0)continue;
 const pair={C:['C4','G3'],F:['F4','C4'],G:['G3','D4']}[chords[i]];
 for(const [j,note] of pair.entries()){
  const start=i*4+j*2;
  if(!melody.some(n=>n.beat<=start&&start+.25<=n.beat+n.duration_beats))continue;
  notes.push({note,beat:start,duration_beats:.25,role:'accompaniment',source_measure:i+1,source_chord:chords[i],playback_strength_multiplier:note==='G3'?1.3:1.15});
 }
}
notes.sort((a,b)=>a.beat-b.beat||a.note.localeCompare(b.note));
const id='garuda_pancasila',title='Garuda Pancasila';
const song={format_version:'angklung_song.v1',id,title,aliases:['garuda pancasila','garuda','pancasila'],category:'indonesian_national',difficulty:'easy',tempo_bpm:112,time_signature:'4/4',physical_rack_map:'G3-C6',arrangement_status:'sheet_transcription_draft_needs_listening_review',playable:true,demo_safe:false,has_validated_notes:true,playback_policy:'authored',arrangement_policy:{preserve_authored_dynamics:true},notes,metadata:{...source,measures:undefined,chords:undefined,melody_selection:'Supplied F-major melody transposed uniformly up seven semitones to C major. Pickup, dotted march figures and rests retained; no nearest-note substitutions. Low-resolution rhythm transcription needs listening review.',accompaniment_selection:source.bass_policy,calibration_review:'Audition approximately 134 ms bass pulses and low G3 attack; physical holds remain capped at 2 seconds.'}};
fs.writeFileSync(path.join(root,'public/songs/arrangements',id+'.json'),JSON.stringify(song,null,2)+'\n');
const cp=path.join(root,'public/songs/catalog.json'),catalog=JSON.parse(fs.readFileSync(cp));
const entry={id,title,aliases:song.aliases,category:song.category,difficulty:song.difficulty,priority:'high',arrangement_status:song.arrangement_status,playable:true,demo_safe:false,has_validated_notes:true,active:true,visible_in_guest:true,physical_rack_map:'G3-C6',melody_register:'upper_physical',melody_target_range:'G4-A5',path:`/songs/arrangements/${id}.json`};
const index=catalog.findIndex(s=>s.id===id);if(index<0)catalog.push(entry);else catalog[index]=entry;
fs.writeFileSync(cp,JSON.stringify(catalog,null,2)+'\n');
console.log(`${notes.filter(n=>n.role==='melody').length} melody notes; ${notes.filter(n=>n.role==='accompaniment').length} bass pulses`);
