#!/usr/bin/env node
// Four source-specific arrangements. Run without --write to review; --write adds only these entries.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import tone from '@tonejs/midi';
const { Midi } = tone;
const root = path.resolve(import.meta.dirname, '..');
const configs = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'sources/showcase-arrangements.json')));
const source = process.argv.find(a => a.startsWith('--source='))?.slice(9) ?? '/Users/williamhartono/Downloads';
const write = process.argv.includes('--write');
const onlySong = process.argv.find(a => a.startsWith('--song='))?.slice(7);
const natural = p => [0,2,4,5,7,9,11].includes((p % 12 + 12) % 12);
const name = p => ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][p % 12] + (Math.floor(p / 12) - 1);
const round = n => Math.round(n * 1000) / 1000;
const plain = n => ({midi:n.midi,time:n.time,duration:n.duration,velocity:n.velocity});
const section = (c,t) => c.sections.findLast(s => s[0] <= t) ?? c.sections[0];
function groups(notes, tolerance=0.035) {
  const result=[];
  for (const n of [...notes].sort((a,b)=>a.time-b.time || b.midi-a.midi)) {
    if (!result.length || n.time-result.at(-1)[0].time > tolerance) result.push([n]); else result.at(-1).push(n);
  }
  return result;
}
function top(notes,tolerance) {return groups(notes,tolerance).map(g=>g.reduce((a,b)=>b.midi>a.midi?b:a));}
function melodicLine(id,c,midi,audit) {
  let notes=c.melodyTracks.flatMap(t=>midi.tracks[t].notes.map((n,i)=>({...plain(n),track:t,index:i,originalMidi:n.midi})));
  if(id==='under_the_sea') notes=notes.map(n=>n.midi<48?{...n,midi:n.midi+36,repair:'source octave anomaly +36'}:n);
  if(id==='we_are_the_champions') notes=notes.map(n=>((n.time>=36.9&&n.time<73)||(n.time>=112.7&&n.time<151.3))?{...n,midi:n.midi-12,repair:'chorus register -12 to fit complete phrase'}:n);
  if(id==='golden_huntrx') {
    // E4 and above contain the vocal line. Group rolled chords, then reject
    // inner piano attacks occurring underneath an already sounding higher lead.
    const chords=groups(notes.filter(n=>n.midi>=64 && n.duration>=0.07),0.075);
    // The chorus often puts louder repeated vocal notes BELOW piano harmony.
    // Choose a continuous, velocity-led voice, not an unconditional skyline.
    const paths=chords.map(()=>[]);
    for(let i=0;i<chords.length;i++) {
      const peak=Math.max(...chords[i].map(n=>n.velocity));
      paths[i]=chords[i].map(n=>{
        const local=(peak-n.velocity)*127*0.8;
        if(!i)return {n,cost:local,previous:-1};
        let cost=Infinity,previous=-1;
        paths[i-1].forEach((p,j)=>{
          const jump=Math.abs(n.midi-p.n.midi);
          const value=p.cost+local+Math.min(jump*jump*0.045,8);
          if(value<cost){cost=value;previous=j;}
        });
        return {n,cost,previous};
      });
    }
    let cursor=paths.at(-1).reduce((best,x,i,a)=>x.cost<a[best].cost?i:best,0);
    const candidates=[];
    for(let i=paths.length-1;i>=0;i--){const chosen=paths[i][cursor];candidates.push(chosen.n);cursor=chosen.previous;}
    candidates.reverse();
    notes=[];
    for(const n of candidates){
      const previous=notes.at(-1);
      if(previous && n.time < previous.time+previous.duration-0.075 && n.midi < previous.midi-2) {audit.innerVoiceRejected++;continue;}
      notes.push(n);
    }
  } else notes=top(notes,0.025);
  if(c.introTrack!==undefined) notes.push(...top(midi.tracks[c.introTrack].notes.map((n,i)=>({...plain(n),track:c.introTrack,index:i,originalMidi:n.midi})).filter(n=>n.time<c.introEnd && n.duration>0.045)).map(n=>({...n,instrumental:true})));
  if(id==='we_are_the_champions') {
    // Original piano fills only in the vocal-free transition and closing cadence.
    notes.push(...top(midi.tracks[2].notes.map((n,i)=>({...plain(n),track:2,index:i,originalMidi:n.midi})).filter(n=>n.midi>=60 && ((n.time>=73 && n.time<79.3)||n.time>=151.3))).filter((n,i,a)=>i===0||n.time-a[i-1].time>=0.16).map(n=>({...n,instrumental:true})));
  }
  notes.sort((a,b)=>a.time-b.time);
  // Very short ornaments have insufficient retrigger time; keep the following
  // principal attack rather than moving its onset or thinning whole fast phrases.
  notes=notes.filter((n,i,a)=>{
    const remove=a[i+1] && a[i+1].time-n.time<0.085;
    if(remove)audit.graceNotesRemoved.push({track:n.track,index:n.index,time:round(n.time),note:name(n.midi)});
    return !remove;
  });
  return notes;
}
function mapMelody(notes,shift) {
  // Find a complete contour-aware natural-note path. Octave changes cost more
  // inside a phrase; repeated source pitches cannot alternate substitute notes.
  const rows=[];
  for(let i=0;i<notes.length;i++) {
    const n=notes[i],target=n.midi+shift;
    const options=[];
    for(let pitch=55;pitch<=84;pitch++) if(natural(pitch)) {
      const error=((pitch-target+6)%12+12)%12-6;
      if(Math.abs(error)>1 || (natural(target) && error!==0))continue;
      const base=error*error*5 + Math.pow((pitch-73)/12,2)*0.4 + Math.pow((pitch-target)/12,2)*2;
      let cost=base,previous=-1;
      if(i){cost=Infinity;rows[i-1].forEach((p,j)=>{
        const originalInterval=n.midi-notes[i-1].midi, interval=pitch-p.pitch;
        const phraseBreak=n.time-(notes[i-1].time+notes[i-1].duration)>0.5;
        const contour=Math.pow(interval-originalInterval,2)*(phraseBreak?0.025:0.32);
        const reversal=originalInterval!==0 && Math.sign(interval)!==Math.sign(originalInterval) ? (interval===0?4:150) : 0;
        const repeat=originalInterval===0 && interval!==0 ? 80 : 0;
        const value=p.cost+base+contour+reversal+repeat;
        if(value<cost){cost=value;previous=j;}
      });}
      options.push({pitch,cost,previous,error});
    }
    rows.push(options);
  }
  let cursor=rows.at(-1).reduce((best,x,i,a)=>x.cost<a[best].cost?i:best,0),out=[];
  for(let i=notes.length-1;i>=0;i--){const chosen=rows[i][cursor];out.push({...notes[i],mapped:chosen.pitch,error:chosen.error});cursor=chosen.previous;}
  return out.reverse();
}
function build(id,c,midi,hash) {
  const audit={innerVoiceRejected:0,graceNotesRemoved:[],supportConflictsRemoved:0,accidentals:[],octaveRepairs:[]};
  const lead=mapMelody(melodicLine(id,c,midi,audit),c.shift);
  const melody=lead.map((n,i)=>{
    const next=lead[i+1];
    const factor=id==='under_the_sea'?0.95:1.08;
    const duration=round(Math.max(0.045,Math.min(3.8,Math.max(0.085,n.duration*factor),next?next.time-n.time-0.04:Infinity)));
    const s=section(c,n.time);
    // Keep the section contrast, with small local accents from source velocity.
    const local=id==='under_the_sea'?1:Math.max(0.94,Math.min(1.04,0.97+(n.velocity*127-80)*0.002));
    const note={note:name(n.mapped),start:round(n.time),duration,role:'melody',source_track:`${n.track}: ${midi.tracks[n.track].name || midi.tracks[n.track].instrument.name}`,playback_strength_multiplier:round(Math.min(1.25,s[2]*local)),source_note:name(n.originalMidi),source_note_index:n.index,source_start:round(n.time),source_duration:round(n.duration),section:s[1],...(n.instrumental?{instrumental:true}:{})};
    if(n.error)audit.accidentals.push({time:round(n.time),source:name(n.midi),transposed:name(n.midi+c.shift),adapted:note.note,semitones:n.error});
    if(n.repair)audit.octaveRepairs.push({time:round(n.time),from:name(n.originalMidi),to:name(n.midi)});
    return note;
  });
  let supportSources=[];
  if(id==='under_the_sea') supportSources=[2,0];
  if(id==='golden_huntrx') supportSources=[0];
  if(id==='let_it_go') supportSources=[5];
  if(id==='we_are_the_champions') supportSources=[2];
  const candidates=supportSources.flatMap(track=>groups(midi.tracks[track].notes.map((n,i)=>({...plain(n),track,index:i})).filter(n=>n.duration>=0.05 && (id!=='golden_huntrx'||n.midi<64))).map(g=>({time:g[0].time,notes:g.sort((a,b)=>a.midi-b.midi)}))).sort((a,b)=>a.time-b.time);
  const support=[];let last=-Infinity,lastDouble=-Infinity;
  for(const group of candidates) {
    const t=group.time,s=section(c,t);
    if(t-last<s[4]-0.025)continue;
    // Under the Sea: prefer guitar syncopations when that track is present.
    if(id==='under_the_sea' && group.notes[0].track===0 && candidates.some(g=>g.notes[0].track===2 && Math.abs(g.time-t)<0.32))continue;
    const current=melody.find(n=>n.start<=t+0.03 && n.start+n.duration>t);
    if(current && current.duration>0.8 && t-current.start>0.22 && id!=='under_the_sea')continue;
    const chorus=/chorus|refrain/.test(s[1]) && !/pre|post/.test(s[1]);
    const max=chorus && id!=='under_the_sea' && t-lastDouble>=1.7?2:1;
    const added=[];
    for(const n of group.notes) {
      const pc=(n.midi+c.shift)%12;
      if(!natural(pc))continue; // omit chromatic support rather than invent a wrong chord tone
      const rack=Array.from({length:11},(_,i)=>55+i).filter(p=>p%12===pc);
      if(!rack.length)continue;
      const pitch=name(rack[0]),duration=id==='under_the_sea'?0.12:id==='golden_huntrx'?0.14:0.16;
      if(added.some(x=>x.note===pitch))continue;
      if(melody.some(x=>x.note===pitch && t<x.start+x.duration+0.04 && t+duration+0.04>x.start) || support.some(x=>x.note===pitch && t<x.start+x.duration+0.04)) {audit.supportConflictsRemoved++;continue;}
      added.push({note:pitch,start:round(t),duration,role:'accompaniment',source_track:`${n.track}: ${midi.tracks[n.track].name || midi.tracks[n.track].instrument.name}`,source_note:name(n.midi),source_note_index:n.index,source_start:round(n.time),section:s[1],playback_strength_multiplier:round(s[3]*(added.length?0.9:1))});
      if(added.length===max)break;
    }
    if(added.length){last=t;if(added.length===2)lastDouble=t;support.push(...added);}
  }
  const offset=c.start_at_seconds ?? 0;
  // Keep a chord attack just ahead of the vocal pickup, aligned at the new zero.
  const notes=[...melody,...support].filter(n=>n.start>=offset-0.025)
    .map(n=>({...n,start:round(Math.max(0,n.start-offset))}))
    .sort((a,b)=>a.start-b.start||a.note.localeCompare(b.note));
  const intervalStats=lead.slice(1).map((n,i)=>({time:round(n.time),source:n.midi-lead[i].midi,mapped:n.mapped-lead[i].mapped}));
  const intervalChanges=intervalStats.filter(x=>x.source!==x.mapped);
  const policy={preserve_authored_dynamics:true,physical_rack_map:'G3-C6',melody_register:'phrase_contour_preserved',melody_target_range:'G3-C6',accompaniment_register:'lower_physical',accompaniment_target_range:'G3-F4'};
  const arrangement={format_version:'angklung_song.v1',id,title:c.title,aliases:c.aliases,category:c.category,difficulty:'showcase',arrangement_status:'curated_midi_software_validated_physical_review_required',playable:true,demo_safe:false,has_validated_notes:true,physical_rack_map:'G3-C6',tempo_bpm:midi.header.tempos[0]?.bpm??120,time_signature:(midi.header.timeSignatures[0]?.timeSignature??[4,4]).join('/'),playback_policy:'authored',arrangement_policy:policy,notes,metadata:{artist:c.artist,source_file:c.file,source_sha256:hash,source_duration_seconds:round(midi.duration),source_start_offset_seconds:offset,timing:'Original MIDI timing, shifted by source_start_offset_seconds; no grid quantization. Section and audit timestamps refer to the original source.',source_tempos:midi.header.tempos.map(t=>({time:round(t.time),bpm:t.bpm})),transposition_semitones:c.shift,melody_selection:c.melodyDecision,accompaniment_selection:c.supportDecision,sections:c.sections.map(([start,label,melodyStrength,extraStrength,minExtraInterval])=>({start,label,melodyStrength,extraStrength,minExtraInterval})),calibration_review:c.calibration,review_status:'Track, phrase, contour and schedule inspection complete; listening and physical acceptance remain operator checks.',audit:{...audit,melody_events:notes.filter(n=>n.role==='melody').length,accompaniment_events:notes.filter(n=>n.role==='accompaniment').length,interval_changes:intervalChanges,source_note_count:midi.tracks.reduce((n,t)=>n+t.notes.length,0)}}};
  return arrangement;
}
const results=[];
for(const [id,c]of Object.entries(configs)){
  if(onlySong && id!==onlySong)continue;
  const bytes=fs.readFileSync(path.join(source,c.file)),midi=new Midi(bytes);
  const arrangement=build(id,c,midi,crypto.createHash('sha256').update(bytes).digest('hex'));
  results.push(arrangement);
  const a=arrangement.metadata.audit;
  console.log(JSON.stringify({id,melody:a.melody_events,extra:a.accompaniment_events,accidentals:a.accidentals.length,graceRemoved:a.graceNotesRemoved.length,innerRejected:a.innerVoiceRejected,contourReversals:a.interval_changes.filter(x=>x.source*x.mapped<0),octaveMoves:a.interval_changes.filter(x=>Math.abs(x.source-x.mapped)>=10)}));
  if(write)fs.writeFileSync(path.join(root,'public/songs/arrangements',id+'.json'),JSON.stringify(arrangement,null,2)+'\n');
}
if(write){
 const p=path.join(root,'public/songs/catalog.json'),catalog=JSON.parse(fs.readFileSync(p));
 for(const song of results){
  const entry={id:song.id,title:song.title,aliases:song.aliases,category:song.category,difficulty:'hard',priority:'high',verdict:'Curated showcase; physical audition pending',reason:song.metadata.melody_selection,arrangement_status:song.arrangement_status,playable:true,demo_safe:false,has_validated_notes:true,active:true,visible_in_guest:true,...song.arrangement_policy,path:`/songs/arrangements/${song.id}.json`};
  const index=catalog.findIndex(e=>e.id===song.id);if(index<0)catalog.push(entry);else catalog[index]=entry;
 }
 fs.writeFileSync(p,JSON.stringify(catalog,null,2)+'\n');
}
