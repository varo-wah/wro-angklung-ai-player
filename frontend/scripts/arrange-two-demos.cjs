const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Midi}=require('@tonejs/midi');
const root=path.join(__dirname,'../public/songs');
const source=process.argv.find(x=>x.startsWith('--source='))?.slice(9)||'/Users/williamhartono/Downloads';
const pcs=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const natural=p=>[0,2,4,5,7,9,11].includes((p%12+12)%12);
const name=p=>pcs[p%12]+(Math.floor(p/12)-1);
const r=n=>Math.round(n*1000)/1000;
const configs=[
 {id:'mission_impossible_theme',title:'Mission: Impossible Theme',file:'FF14合奏 8人 碟中谍 Mission Impossible Theme.mid',category:'musical_film',shift:2},
 {id:'a_sky_full_of_stars',title:'A Sky Full of Stars',file:'A sky full of stars.mid',category:'international_pop',shift:-6}
];
for(const c of configs){
 const bytes=fs.readFileSync(path.join(source,c.file)),m=new Midi(bytes),mission=c.id==='mission_impossible_theme';
 const track=i=>m.tracks[i].notes.map((n,index)=>({midi:n.midi,time:n.time,duration:n.duration,ticks:n.ticks,velocity:n.velocity,track:i,index,beat:n.ticks/m.header.ppq}));
 const top=ns=>{const out=[];for(const n of ns){const old=out.at(-1);if(old&&old.ticks===n.ticks){if(n.midi>old.midi)out[out.length-1]=n;}else out.push(n);}return out;};
 let lead;
 if(mission){
  // Intro bass ostinato is the theme before the main guitar enters.
  lead=[...track(29).filter(n=>n.beat>=10&&n.beat<33),...track(21)];
  // Trumpet contributes the later response only where guitar has no phrase.
  for(const n of track(25).filter(n=>n.beat>=85))if(!lead.some(x=>Math.abs(x.time-n.time)<.15||(x.time<n.time&&x.time+x.duration>n.time)))lead.push(n);
 }else{
  lead=top(track(0).filter(n=>n.midi>=64));
  // Do not promote a new inner piano attack over an already sustained lead.
  lead=lead.filter((n,i,all)=>!all.slice(Math.max(0,i-8),i).some(p=>p.midi>n.midi&&p.time+p.duration>n.time+.04));
 }
 lead=top(lead.sort((a,b)=>a.time-b.time||b.midi-a.midi));
 const offset=mission?10*60/180:0,adaptations=[];
 function pitch(n,role){
  let p=n.midi+c.shift;
  if(mission&&role==='melody'&&n.track!==29){
   p-=12;
   // The signature descending D-C#-C figure cannot retain semitone steps.
   // Use E-D-C in A minor so all three steps remain distinct and descending.
   if(n.midi%12===1)p-=1;
   if(n.midi%12===0)p-=2;
  }
  while(p<(role==='melody'?55:55))p+=12;
  while(p>(role==='melody'?84:65))p-=12;
  if(!natural(p)){const before=p;p=natural(p-1)?p-1:p+1;adaptations.push({source_time:r(n.time),source_note:name(n.midi),from:name(before),to:name(p),role});}
  return name(p);
 }
 const notes=lead.map((n,i)=>({note:pitch(n,'melody'),start:r(Math.max(0,n.time-offset)),duration:r(Math.max(.04,Math.min(n.duration,lead[i+1]?lead[i+1].time-n.time-.045:2))),source_duration:r(n.duration),source_start:r(n.time),source_note:name(n.midi),source_track:n.track,source_note_index:n.index,role:'melody',playback_strength_multiplier:mission?1.1:(n.midi>=78?1.15:.95)}));
 const support=top(track(mission?29:1));let last=-Infinity;
 for(const n of support){
  if(n.time<offset||mission&&n.beat<33)continue;
  // Keep source beat accents, not whichever offbeat survives a time throttle.
  const phase=n.beat% (mission?5:4);
  if(mission?![0,1.5,3,4].some(b=>Math.abs(phase-b)<.03):Math.abs(n.beat-Math.round(n.beat))>.03)continue;
  if(n.time-last<(mission?.24:.5))continue;
  const start=r(n.time-offset),p=pitch(n,'accompaniment');
  if(notes.some(x=>x.note===p&&start<x.start+x.duration+.12&&start+.28>x.start))continue;
  notes.push({note:p,start,duration:.16,source_start:r(n.time),source_note:name(n.midi),source_track:n.track,source_note_index:n.index,role:'accompaniment',playback_strength_multiplier:1.2});last=n.time;
 }
 notes.sort((a,b)=>a.start-b.start||a.note.localeCompare(b.note));
 const song={format_version:'angklung_song.v1',id:c.id,title:c.title,aliases:mission?['mission impossible','mission impossible theme','mission: impossible']:['a sky full of stars','sky full of stars','coldplay sky full of stars'],category:c.category,difficulty:'showcase',tempo_bpm:m.header.tempos[0].bpm,time_signature:mission?'5/4':'4/4',physical_rack_map:'G3-C6',arrangement_status:'source_reviewed_draft_needs_audition',playable:true,demo_safe:false,has_validated_notes:true,playback_policy:'authored',arrangement_policy:{preserve_authored_dynamics:true},notes,metadata:{source_file:c.file,source_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source_start_offset_seconds:offset,transposition_semitones:c.shift,melody_selection:mission?'Bass ostinato intro, then overdriven guitar track 21 with trumpet responses in its gaps; rapid opening trill and drums omitted.':'Grand Piano top voice, rejecting inner attacks beneath sustained lead; Electric Piano supplies bass.',accompaniment_selection:'Sparse source beat accents, short strong pulses; original onset times retained.',pitch_adaptations:adaptations,chromatic_theme_policy:mission?'Main descending D-C#-C figure adapted to E-D-C; a diatonic approximation, not exact original intervals.':null,review:'Software timing/range checks; listening and physical acceptance pending.'}};
 fs.writeFileSync(path.join(root,'arrangements',c.id+'.json'),JSON.stringify(song,null,2)+'\n');
 const cp=path.join(root,'catalog.json'),catalog=JSON.parse(fs.readFileSync(cp));const entry={id:c.id,title:c.title,aliases:song.aliases,category:c.category,difficulty:'hard',priority:'high',verdict:'MIDI arrangement draft',reason:song.metadata.melody_selection,arrangement_status:song.arrangement_status,playable:true,demo_safe:false,has_validated_notes:true,active:true,visible_in_guest:true,physical_rack_map:'G3-C6',melody_target_range:'G3-C6',accompaniment_target_range:'G3-F4',path:'/songs/arrangements/'+c.id+'.json'};const at=catalog.findIndex(x=>x.id===c.id);if(at<0)catalog.push(entry);else catalog[at]=entry;fs.writeFileSync(cp,JSON.stringify(catalog,null,2)+'\n');
 console.log(c.title,{melody:notes.filter(n=>n.role==='melody').length,extra:notes.filter(n=>n.role==='accompaniment').length,adaptations:adaptations.length});
}
