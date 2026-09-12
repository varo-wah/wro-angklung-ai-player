import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const eighths=s=>s.split(' ').map(n=>[n,.5]);
const a=[...eighths('C4 C4 B3 C4'),['D4',1],...eighths('G3 G3')];
const b=[...eighths('D4 D4 C4 D4'),['E4',1],['R',1]];
const c=[['F4',1],...eighths('D4 D4'),['E4',1],...eighths('C4 C4')];
const d=[...eighths('D4 D4 C4 B3'),['C4',1],['R',1]];
const e=eighths('D4 D4 C4 B3 C4 G3 G3 G3');
const f=[...eighths('D4 D4 C4 D4'),['E4',1],...eighths('E4 E4')];
const g=eighths('F4 F4 D4 D4 E4 E4 C4 C4');
const h=[...eighths('D4 D4 C4 B3'),['C4',1],['R',.5],['E4',.5]];
const i=[...eighths('G4 G4 F4 E4 G4'),['D4',1],['D4',.5]];
const j=[...eighths('F4 F4 E4 D4'),['C4',1],['R',.5],['E4',.5]];
const k=[...eighths('F4 F4 E4 D4'),['C4',1],['R',1]];
const measures=[a,b,c,d,c,e,a,f,g,h,g,h,i,j,i,k];
const chords=['C','G','F','G','F','G','C','G','F','G','F','G','C','G','C','G'];
const source={source:'User-supplied Ampar-Ampar Pisang score screenshot, 2026-09-12; arrangement credited to Reynard Ruslan.',tempo_bpm:90,transposition_semitones:12,pickup:[['G3',.5]],measures,chords,repeat_policy:'Play the opening pickup once, then the 16 complete measures twice for the closing repeat sign.',bass_policy:'Simplified C/F/G harmonic pulses; discard the continuous bass eighth-note arpeggios and bass chords.'};
fs.writeFileSync(path.join(root,'scripts/sources/ampar-ampar-pisang-score.json'),JSON.stringify(source,null,2)+'\n');
const notes=[{note:'G4',beat:0,duration_beats:.5,role:'melody',source_note:'G3',source_measure:1}];
let beat=.5;
for(let pass=0;pass<2;pass++)for(const [index,measure] of measures.entries()){
 if(measure.reduce((s,n)=>s+n[1],0)!==4)throw Error(`Measure ${index+2}`);
 const barStart=beat,barMelody=[];
 for(const [pitch,duration]of measure){
  if(pitch!=='R'){const n={note:pitch.slice(0,-1)+(Number(pitch.at(-1))+1),beat,duration_beats:duration,role:'melody',source_note:pitch,source_measure:index+2,repeat_pass:pass+1,playback_strength_multiplier:1};notes.push(n);barMelody.push(n);}
  beat+=duration;
 }
 // Two bass pulses per measure maximum; no arpeggios or bass chords.
 for(const local of [0,2]){
  const start=barStart+local,active=barMelody.find(n=>n.beat<=start&&start<n.beat+n.duration_beats);
  if(!active)continue;
  const chord=chords[index],pitch=local===0?{C:'C4',F:'F4',G:'G3'}[chord]:{C:'G3',F:'C4',G:'D4'}[chord];
  notes.push({note:pitch,beat:start,duration_beats:.18,role:'accompaniment',source_measure:index+2,repeat_pass:pass+1,source_chord:chord,playback_strength_multiplier:1.15});
 }
}
notes.sort((a,b)=>a.beat-b.beat||a.note.localeCompare(b.note));
const id='ampar_ampar_pisang',title='Ampar-Ampar Pisang';
const song={format_version:'angklung_song.v1',id,title,aliases:['ampar ampar pisang','ampar','ampar pisang'],category:'indonesian_traditional',difficulty:'medium',tempo_bpm:90,time_signature:'4/4',physical_rack_map:'G3-C6',arrangement_status:'sheet_transcription_draft_needs_listening_review',playable:true,demo_safe:false,has_validated_notes:true,playback_policy:'authored',arrangement_policy:{preserve_authored_dynamics:true},notes,metadata:{...source,measures:undefined,chords:undefined,melody_selection:'Supplied treble melody raised one octave, preserving pickup, rests, and closing repeat. No accidental substitutions.',accompaniment_selection:source.bass_policy,calibration_review:'Audition 120 ms bass pulses, repeated-note clarity and melody transcription on the physical rack.'}};
fs.writeFileSync(path.join(root,'public/songs/arrangements',id+'.json'),JSON.stringify(song,null,2)+'\n');
const cp=path.join(root,'public/songs/catalog.json'),catalog=JSON.parse(fs.readFileSync(cp));
const entry={id,title,aliases:song.aliases,category:song.category,difficulty:'medium',priority:'high',arrangement_status:song.arrangement_status,playable:true,demo_safe:false,has_validated_notes:true,active:true,visible_in_guest:true,physical_rack_map:'G3-C6',melody_register:'upper_physical',melody_target_range:'G4-G5',path:`/songs/arrangements/${id}.json`};
const index=catalog.findIndex(s=>s.id===id);if(index<0)catalog.push(entry);else catalog[index]=entry;
fs.writeFileSync(cp,JSON.stringify(catalog,null,2)+'\n');
console.log(`${notes.filter(n=>n.role==='melody').length} melody notes; ${notes.filter(n=>n.role==='accompaniment').length} bass pulses`);
