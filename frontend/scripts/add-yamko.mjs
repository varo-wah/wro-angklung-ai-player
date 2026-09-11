import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
// Source pitches below are treble-clef concert pitch.
const a=[['C5',1.5],['G4',.5],['G4',.5],['A4',.5],['E4',.5],['G4',.5]];
const b=[['A4',2],['R',.5],['G4',.5],['G4',.5],['A4',.5]];
const c=[['D4',3],['E4',1]],d=[['C4',3],['R',1]];
const e=[['C5',.75],['G4',.25],['G4',.5],['G4',.5],['A4',1],['G4',.5],['A4',.5]];
const f=[['G4',.5],['A4',.5],['C4',.5],['D4',.5],['E4',1],['D4',.5],['E4',.5]];
const g=[['D4',.5],['E4',.5],['C4',.5],['D4',.5],['E4',1],['D4',1]];
const h=[['C4',2],['R',.5],['G4',.5],['G4',.5],['G4',.5]];
const i=[['D4',2],['R',.5],['C4',.5],['C4',.5],['D4',.5]];
const j=[['E4',2],['R',.5],['D4',.5],['D4',.5],['E4',.5]];
const measures=[a,b,c,d,a,b,c,d,e,f,g,d,e,f,g,h,b,i,j,h,b,i,j,d];
const chords=['C','F','G','C','C','F','G','C','C','C','G','C','C','C','G','C','F','G','C','C','F','G','C','C'];
const source={source:'User supplied Yamko Rambe Yamko - Sopran screenshot, 2026-09-11',tempo_bpm:120,tempo_note:'No tempo printed; 120 BPM is an audition starting point.',transposition_semitones:12,measures,chords,bass_note:'Newly composed simple harmonic support; no bass part appears in the supplied score.'};
fs.writeFileSync(path.join(root,'scripts/sources/yamko-rambe-yamko-score.json'),JSON.stringify(source,null,2)+'\n');
const notes=[];let beat=0;
for(const [index,measure] of measures.entries()){
 if(measure.reduce((s,n)=>s+n[1],0)!==4)throw Error(`Measure ${index+1} is not 4/4`);
 for(const [pitch,duration]of measure){if(pitch!=='R')notes.push({note:pitch.slice(0,-1)+(Number(pitch.at(-1))+1),beat,duration_beats:duration,role:'melody',source_note:pitch,source_measure:index+1,playback_strength_multiplier:1});beat+=duration;}
}
const melody=[...notes];
for(let bar=0;bar<24;bar++)for(const local of [0,2]){
 const start=bar*4+local,active=melody.find(n=>n.beat<=start&&start<n.beat+n.duration_beats);
 if(!active)continue;
 const chord=chords[bar],pitch=local===0?{C:'C4',F:'F4',G:'G3'}[chord]:{C:'G3',F:'C4',G:'D4'}[chord];
 notes.push({note:pitch,beat:start,duration_beats:Math.min(.24,active.beat+active.duration_beats-start),role:'accompaniment',source_measure:bar+1,source_chord:chord,playback_strength_multiplier:1.15});
}
notes.sort((a,b)=>a.beat-b.beat||a.note.localeCompare(b.note));
const id='yamko_rambe_yamko',title='Yamko Rambe Yamko';
const song={format_version:'angklung_song.v1',id,title,aliases:['yamko','yamko rambe yamko','yamko rambe'],category:'indonesian_traditional',difficulty:'medium',tempo_bpm:120,time_signature:'4/4',physical_rack_map:'G3-C6',arrangement_status:'sheet_transcription_draft_needs_listening_review',playable:true,demo_safe:false,has_validated_notes:true,playback_policy:'authored',arrangement_policy:{preserve_authored_dynamics:true},notes,metadata:{...source,measures:undefined,chords:undefined,melody_selection:'24-bar supplied soprano line, raised one octave without pitch-class changes.',accompaniment_selection:'Composed root/fifth pulses on beats 1 and 3 only when melody is sounding. No bass in written rests.',calibration_review:'Audition the assumed tempo, 120 ms bass pulses and 2-second capped long notes on the physical rack.'}};
fs.writeFileSync(path.join(root,'public/songs/arrangements',id+'.json'),JSON.stringify(song,null,2)+'\n');
const cp=path.join(root,'public/songs/catalog.json'),catalog=JSON.parse(fs.readFileSync(cp));
const entry={id,title,aliases:song.aliases,category:song.category,difficulty:'medium',priority:'high',arrangement_status:song.arrangement_status,playable:true,demo_safe:false,has_validated_notes:true,active:true,visible_in_guest:true,physical_rack_map:'G3-C6',melody_register:'upper_physical',melody_target_range:'C5-C6',path:`/songs/arrangements/${id}.json`};
const index=catalog.findIndex(s=>s.id===id);if(index<0)catalog.push(entry);else catalog[index]=entry;
fs.writeFileSync(cp,JSON.stringify(catalog,null,2)+'\n');
console.log(`${melody.length} melody notes, ${notes.length-melody.length} bass pulses`);
