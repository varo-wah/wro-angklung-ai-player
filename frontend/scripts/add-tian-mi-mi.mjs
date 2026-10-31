import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const bar=s=>s.split(' ').map(t=>{const [n,d]=t.split(':');return [n,Number(d)];});
const measures=[
 bar('R:3 A3:0.25 B3:0.25 D4:0.25 E4:0.25'),bar('F#4:4'),
 bar('A3:2 B3:1 A3:0.5 B3:0.5'),
 bar('D4:1 A4:0.5 B4:0.5 A4:0.25 B4:0.25 A4:0.25 B4:0.25 A4:1'),
 bar('R:1 A4:0.5 B4:0.5 A4:0.25 B4:0.25 A4:0.25 B4:0.25 A4:1'),
 bar('F#4:2 A4:1 B4:1'),bar('F#4:3 D4:1'),bar('E4:1 R:0.5 D4:0.5 E4:1 A4:1'),
 bar('A4:0.5 F#4:3.5'),bar('F#4:1 E4:1 E4:1 F#4:1'),bar('E4:1 D4:1 B3:1 A3:1'),bar('D4:3 E4:1'),
 bar('F#4:1 R:0.5 E4:0.5 F#4:0.5 E4:0.5 F#4:0.5 A4:0.5'),
 bar('A4:0.5 E4:0.5 G4:0.5 A4:0.5 B4:1 D5:1'),
 bar('C#5:1 R:0.5 E4:0.5 B4:0.5 A4:0.5 F#4:0.5 E4:0.5')];
const chords=['C','C','G','C','C','C','C','Dm/G','C','Dm','G','C','Am','Dm','G'];
const mapped={'A3':'G4','B3':'A4','D4':'C5','E4':'D5','F#4':'E5','G4':'F5','A4':'G5','B4':'A5','C#5':'B5','D5':'C6'};
const source={source:'User-supplied Tian Mi Mi - Teresa Teng keyboard score, notation credited to Thein Swe Win, 2026-09-12.',tempo_bpm:127,source_key:'D major',key:'C major',transposition_semitones:10,measures,chords,excerpt_policy:'Only the supplied 15 bars, played once. Repeat begins at bar 6 and first ending at bar 13, but no second ending was supplied.',bass_policy:'Composed short roots/fifths from printed D/A/Em/Bm chords, transposed to C/G/Dm/Am. Bass staff in source is empty. At most two pulses per bar; written rests remain silent.'};
fs.writeFileSync(path.join(root,'scripts/sources/tian-mi-mi-score.json'),JSON.stringify(source,null,2)+'\n');
const notes=[];
for(const [i,m]of measures.entries()){
 if(m.reduce((s,n)=>s+n[1],0)!==4)throw Error(`Measure ${i+1}`);
 let beat=i*4;
 for(const [n,d]of m){if(n!=='R')notes.push({note:mapped[n],source_note:n,beat,duration_beats:d,role:'melody',source_measure:i+1,playback_strength_multiplier:1});beat+=d;}
}
const melody=[...notes];
for(const [i,chord]of chords.entries()){
 if(i===0)continue;
 const pair={'C':['C4','G3'],'G':['G3','D4'],'Dm':['D4','A3'],'Am':['A3','E4'],'Dm/G':['D4','G3']}[chord];
 for(const [j,note]of pair.entries()){
 const start=i*4+j*2;
 if(!melody.some(n=>n.beat<=start&&start+.24<=n.beat+n.duration_beats))continue;
 notes.push({note,beat:start,duration_beats:.24,role:'accompaniment',source_measure:i+1,source_chord:chord,playback_strength_multiplier:note==='G3'?1.3:1.1});
 }
}
notes.sort((a,b)=>a.beat-b.beat||a.note.localeCompare(b.note));
const id='tian_mi_mi',title='Tian Mi Mi';
const song={format_version:'angklung_song.v1',id,title,aliases:['tian mi mi','tian mimi','tianmimi','甜蜜蜜','teresa teng tian mi mi'],category:'international_pop',difficulty:'easy',tempo_bpm:127,time_signature:'4/4',physical_rack_map:'G3-C6',arrangement_status:'sheet_transcription_draft_needs_listening_review',playable:true,demo_safe:false,has_validated_notes:true,playback_policy:'authored',arrangement_policy:{preserve_authored_dynamics:true},notes,metadata:{...source,measures:undefined,chords:undefined,melody_selection:'Supplied 15-bar D-major excerpt, transposed up ten semitones to C major. Ties and rests preserved. First-ending repeat is not expanded because the second ending is absent.',accompaniment_selection:source.bass_policy,calibration_review:'Audition approximately 113 ms bass pulses and low G3 attack; physical holds remain capped at 2 seconds.'}};
fs.writeFileSync(path.join(root,'public/songs/arrangements',id+'.json'),JSON.stringify(song,null,2)+'\n');
const cp=path.join(root,'public/songs/catalog.json'),catalog=JSON.parse(fs.readFileSync(cp));
const entry={id,title,aliases:song.aliases,category:song.category,difficulty:song.difficulty,priority:'high',arrangement_status:song.arrangement_status,playable:true,demo_safe:false,has_validated_notes:true,active:true,visible_in_guest:true,physical_rack_map:'G3-C6',melody_register:'upper_physical',melody_target_range:'G4-C6',path:`/songs/arrangements/${id}.json`};
const index=catalog.findIndex(s=>s.id===id);if(index<0)catalog.push(entry);else catalog[index]=entry;
fs.writeFileSync(cp,JSON.stringify(catalog,null,2)+'\n');
console.log(`${notes.filter(n=>n.role==='melody').length} melody notes; ${notes.filter(n=>n.role==='accompaniment').length} bass pulses`);
