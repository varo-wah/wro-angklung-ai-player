import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
// F-major numbered melody; L = lower octave, ~ = tie continuation (not a new attack).
const bar=s=>s.split(' ').map(t=>{const [n,d]=t.split(':');return [n,Number(d)];});
const a=bar('3:1 ~3:0.5 2:0.5 1:1 3:1');
const b=bar('~3:1 5L:1 5L:1 5L:1');
const c=bar('6L:1 1:1 3:1 1:1');
const d=bar('2:3 R:1');
const e=bar('2:1 ~2:0.5 1:0.5 7L:1 2:1');
const f=bar('~2:1 5L:1 5L:1 5L:1');
const g=bar('6L:1 1:1 2:1 6L:1');
const h=bar('1:3 R:1');
const i=bar('3:1 ~3:0.5 5:0.5 6:1 3:1');
const j=bar('~3:1 1:1 1:1 5L:1');
const k=bar('2:2 5:1 2:0.5 R:0.5');
const verse=[a,b,c,d,e,f,g,h,i,j,c,k,e,f,g,h];
const bridge=[bar('R:1 1:1 3:1 5:1'),bar('6:1 ~6:0.5 6:0.5 6:1 6:1'),bar('6:1 5:1 6:1 3:1'),bar('5:3 R:1'),
 bar('R:1 1:1 3:1 5:1'),bar('6:1 ~6:0.5 6:0.5 6:1 6:1'),bar('6:1 6:1 5:1 3:1'),d,
 bar('R:1 2:1 1:1 2:1'),bar('3:1 ~3:0.5 3:0.5 3:1 3:1'),bar('3:1 2:1 1:1 2:1'),bar('6L:3 R:1'),
 bar('R:1 6L:1 1:1 2:1'),bar('3:1 ~3:0.5 3:0.5 3:1 3:1'),bar('2:1 1:1 3:1 2:1'),h];
const measures=[...verse,...bridge,...verse];
const vChords=['C','C','C','G','G','G','G','C','F','C','C','G','G','G','G','C'];
const chords=[...vChords,...['C','Am','Am','C','C','Am','Am','G','G','C','C','Am','Am','C','G','C'],...vChords];
const pitches={'5L':'G4','6L':'A4','7L':'B4','1':'C5','2':'D5','3':'E5','5':'G5','6':'A5'};
const original={'5L':'C4','6L':'D4','7L':'E4','1':'F4','2':'G4','3':'A4','5':'C5','6':'D5'};
const source={source:'User-supplied Rek Ayo Rek sheet, 2026-09-12; composer Is Haryanto, East Java.',tempo_bpm:120,tempo_note:'120 BPM chosen for Allegro; no numeric tempo printed.',source_key:'F major',key:'C major',transposition_semitones:7,measures,chords,bass_policy:'Composed sparse C/F/G/Am root/fifth pulses. At most two per bar, no pulses across written rests.'};
fs.writeFileSync(path.join(root,'scripts/sources/rek-ayo-rek-score.json'),JSON.stringify(source,null,2)+'\n');
const notes=[];let beat=0,last;
for(const [i,m]of measures.entries()){
 if(m.reduce((s,n)=>s+n[1],0)!==4)throw Error(`Measure ${i+1}`);
 for(const [degree,duration]of m){
  if(degree==='R'){last=undefined;beat+=duration;continue;}
  const n=degree.replace('~','');
  if(degree.startsWith('~')){
   if(!last||last.note!==pitches[n]||last.beat+last.duration_beats!==beat)throw Error(`Invalid tie ${i+1}`);
   last.duration_beats+=duration;
  }else{last={note:pitches[n],source_note:original[n],beat,duration_beats:duration,role:'melody',source_measure:i+1,playback_strength_multiplier:1};notes.push(last);}
  beat+=duration;
 }
}
const melody=[...notes];
for(const [i,chord]of chords.entries())for(const [j,note]of ({C:['C4','G3'],F:['F4','C4'],G:['G3','D4'],Am:['A3','E4']}[chord]).entries()){
 const start=i*4+j*2;
 if(!melody.some(n=>n.beat<=start&&start+.24<=n.beat+n.duration_beats))continue;
 notes.push({note,beat:start,duration_beats:.24,role:'accompaniment',source_measure:i+1,source_chord:chord,playback_strength_multiplier:note==='G3'?1.3:1.15});
}
notes.sort((a,b)=>a.beat-b.beat||a.note.localeCompare(b.note));
const id='rek_ayo_rek',title='Rek Ayo Rek';
const song={format_version:'angklung_song.v1',id,title,aliases:['rek ayo rek','rek ayo','rek ayorek'],category:'indonesian_traditional',difficulty:'easy',tempo_bpm:120,time_signature:'4/4',physical_rack_map:'G3-C6',arrangement_status:'sheet_transcription_draft_needs_listening_review',playable:true,demo_safe:false,has_validated_notes:true,playback_policy:'authored',arrangement_policy:{preserve_authored_dynamics:true},notes,metadata:{...source,measures:undefined,chords:undefined,melody_selection:'Supplied F-major melody transposed uniformly up seven semitones to C major. All 48 measures, tied notes and written rests retained. No nearest-note substitutions.',accompaniment_selection:source.bass_policy,calibration_review:'Audition approximately 120 ms bass pulses and low G3 attack; physical holds remain capped at 2 seconds.'}};
fs.writeFileSync(path.join(root,'public/songs/arrangements',id+'.json'),JSON.stringify(song,null,2)+'\n');
const cp=path.join(root,'public/songs/catalog.json'),catalog=JSON.parse(fs.readFileSync(cp));
const entry={id,title,aliases:song.aliases,category:song.category,difficulty:song.difficulty,priority:'high',arrangement_status:song.arrangement_status,playable:true,demo_safe:false,has_validated_notes:true,active:true,visible_in_guest:true,physical_rack_map:'G3-C6',melody_register:'upper_physical',melody_target_range:'G4-A5',path:`/songs/arrangements/${id}.json`};
const index=catalog.findIndex(s=>s.id===id);if(index<0)catalog.push(entry);else catalog[index]=entry;
fs.writeFileSync(cp,JSON.stringify(catalog,null,2)+'\n');
console.log(`${notes.filter(n=>n.role==='melody').length} melody notes; ${notes.filter(n=>n.role==='accompaniment').length} bass pulses`);
