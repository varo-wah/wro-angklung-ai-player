import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const bar=s=>s.split(' ').map(t=>{const [n,d]=t.split(':');return [n,Number(d)];});
const pickup=bar('E4:0.5 F4:0.5');
const a=bar('G4:1 C5:1 G4:1 E4:1'),b=bar('G4:3 D4:0.5 E4:0.5'),c=bar('F4:1 D4:1 G4:1 F4:1');
const d=bar('E4:3 C4:0.5 C4:0.5'),e=bar('A4:1 A4:1 B4:1 C5:1'),f=bar('G4:3 E4:0.5 F4:0.5'),g=bar('G4:1 F4:1 E4:1 D4:1');
const measures=[a,b,c,d,e,f,g,bar('C4:3 E4:0.5 F4:0.5'),a,bar('G4:1 C5:2 D4:0.5 E4:0.5'),c,d,e,f,g,bar('C4:4')];
const chords=['C','C','G','C','F','C','G','C','C','C','G','C','F','C','G','C'];
const source={source:'User-supplied Balonku Ada Lima score, 2026-09-12.',tempo_bpm:100,tempo_note:'100 BPM arrangement choice; no tempo printed.',key:'C major',transposition_semitones:12,pickup,measures,chords,bass_policy:'Composed C/F/G root/fifth pulses from the printed chords, at most two per measure; melody-only pickup and one final tonic pulse.'};
fs.writeFileSync(path.join(root,'scripts/sources/balonku-ada-lima-score.json'),JSON.stringify(source,null,2)+'\n');
const notes=[];let beat=0;
function addMelody(m,number){for(const [n,d]of m){notes.push({note:n.slice(0,-1)+(Number(n.at(-1))+1),source_note:n,beat,duration_beats:d,role:'melody',source_measure:number,playback_strength_multiplier:1});beat+=d;}}
addMelody(pickup,1);
for(const [i,m]of measures.entries()){
 if(m.reduce((s,n)=>s+n[1],0)!==4)throw Error(`Measure ${i+2}`);
 const start=beat;addMelody(m,i+2);
 const pair={C:['C4','G3'],F:['F4','C4'],G:['G3','D4']}[chords[i]];
 for(const [j,note]of pair.entries()){
 if(i===15&&j===1)continue;
 notes.push({note,beat:start+j*2,duration_beats:.24,role:'accompaniment',source_measure:i+2,source_chord:chords[i],playback_strength_multiplier:note==='G3'?1.3:1.1});
 }
}
notes.sort((a,b)=>a.beat-b.beat||a.note.localeCompare(b.note));
const id='balonku_ada_lima',title='Balonku Ada Lima';
const song={format_version:'angklung_song.v1',id,title,aliases:['balonku ada lima','balonku','balon ku ada lima','balonku ada 5'],category:'indonesian_traditional',difficulty:'easy',tempo_bpm:100,time_signature:'4/4',physical_rack_map:'G3-C6',arrangement_status:'sheet_transcription_draft_needs_listening_review',playable:true,demo_safe:false,has_validated_notes:true,playback_policy:'authored',arrangement_policy:{preserve_authored_dynamics:true},notes,metadata:{...source,measures:undefined,chords:undefined,melody_selection:'Complete supplied C-major melody raised one octave, retaining the pickup, dotted half notes and DOR half note. No pitch substitutions.',accompaniment_selection:source.bass_policy,calibration_review:'Audition approximately 144 ms bass pulses and low G3 attack; physical holds remain capped at 2 seconds.'}};
fs.writeFileSync(path.join(root,'public/songs/arrangements',id+'.json'),JSON.stringify(song,null,2)+'\n');
const cp=path.join(root,'public/songs/catalog.json'),catalog=JSON.parse(fs.readFileSync(cp));
const entry={id,title,aliases:song.aliases,category:song.category,difficulty:song.difficulty,priority:'high',arrangement_status:song.arrangement_status,playable:true,demo_safe:false,has_validated_notes:true,active:true,visible_in_guest:true,physical_rack_map:'G3-C6',melody_register:'upper_physical',melody_target_range:'C5-C6',path:`/songs/arrangements/${id}.json`};
const index=catalog.findIndex(s=>s.id===id);if(index<0)catalog.push(entry);else catalog[index]=entry;
fs.writeFileSync(cp,JSON.stringify(catalog,null,2)+'\n');
console.log(`${notes.filter(n=>n.role==='melody').length} melody notes; ${notes.filter(n=>n.role==='accompaniment').length} bass pulses`);
