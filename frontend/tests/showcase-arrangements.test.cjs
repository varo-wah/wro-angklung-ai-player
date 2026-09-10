const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const load=require('./load-typescript.cjs');
const {buildScheduleFromBuiltInSong:build}=load('src/lib/scheduleBuilder.ts');
const {validateMotorSafety}=load('src/lib/safetyValidator.ts');
const {encodeArduinoNoteCommand}=load('src/lib/arduinoSerial.ts');
const ids=['under_the_sea','golden_huntrx','let_it_go','we_are_the_champions'];
const arrangement=id=>require(`../public/songs/arrangements/${id}.json`);
async function loaded(id){const entry=require('../public/songs/catalog.json').find(s=>s.id===id);return load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>arrangement(id)})}).loadSongArrangement(entry);}
for(const id of ids)test(`${id}: curated dynamics survive both modes and tempos; real serial commands have release room`,async()=>{
 const song=await loaded(id),data=arrangement(id);
 assert.equal(song.playback_policy,'authored');
 assert.equal(song.demo_safe,false);
 assert.ok(data.metadata.audit.melody_events>150);
 assert.ok(data.metadata.audit.accompaniment_events<data.metadata.audit.melody_events);
 for(const tempo of ['normal','slower'])for(const mode of ['melody','harmony']){
  const schedule=build(song,{strength:.8,tempo,mode});
  const report=validateMotorSafety(schedule);
  assert.equal(report.overall,'PASSED');
  assert.ok(report.checks.every(c=>c.status==='passed'));
  assert.ok(report.maxSimultaneousActuators<=3);
  const previous=new Map();
  for(const c of schedule.commands){
   assert.match(c.note,/^[A-G][3-6]$/);
   assert.doesNotThrow(()=>encodeArduinoNoteCommand(c));
   const last=previous.get(c.note);
   if(last)assert.ok(c.start_time_seconds-last.start_time_seconds-last.duration_seconds>=.019,`${id} ${c.note} ${c.start_time_seconds} overlap`);
   previous.set(c.note,c);
  }
  const sourceNotes=song.notes.filter(n=>mode==='harmony'||n.role==='melody');
  const byId=new Map(sourceNotes.map((n,i)=>[`cmd_${String(i+1).padStart(4,'0')}`,n]));
  for(const c of schedule.commands){
   const n=byId.get(c.command_id);
   const scale=tempo==='slower'?1.25:1;
   assert.equal(c.start_time_seconds,Math.round(n.start*scale*1000)/1000);
   const expected=Math.round(n.duration*scale*1000)/1000;
   assert.ok(c.duration_seconds <= Math.min(2,n.role==='melody'?expected:Math.min(.18,expected))); 
   assert.equal(c.strength,Math.min(1,Math.round(.8*n.playback_strength_multiplier*100)/100));
  }
 }
});
test('vocal anchors survive extraction rather than selecting piano harmony or delayed duplicates',()=>{
 const g=arrangement('golden_huntrx').notes.filter(n=>n.role==='melody'&&n.start>=50.16&&n.start<52.6);
 assert.deepEqual(g.map(n=>n.source_note),['G4','G4','G4','F#4','A4','F#4']);
 assert.equal(arrangement('golden_huntrx').metadata.audit.accidentals.length,0);
 const q=arrangement('we_are_the_champions').notes.filter(n=>n.role==='melody'&&n.source_start>=36.9&&n.source_start<41);
 assert.deepEqual(q.map(n=>n.note),['C5','B4','C5','B4','G4','E4','A4']);
 assert.ok(q.every(n=>n.source_track.startsWith('9:')));
 const l=arrangement('let_it_go').notes.filter(n=>n.role==='melody'&&!n.instrumental);
 assert.deepEqual([...new Set(l.map(n=>n.source_track.split(':')[0]))],['0','1','2']);
 const u=arrangement('under_the_sea');
 assert.equal(u.metadata.audit.octaveRepairs.length,7);
 assert.ok(u.notes.filter(n=>n.role==='melody'&&!n.instrumental).every(n=>n.source_track.startsWith('1:')));
});
test('section contrast, sustained vocals, bouncing lead and expressive tempo maps remain intentional',()=>{
 const avg=(a,label)=>{const ns=a.notes.filter(n=>n.role==='melody'&&n.section===label);assert.ok(ns.length);return ns.reduce((s,n)=>s+n.playback_strength_multiplier,0)/ns.length;};
 const l=arrangement('let_it_go');
 assert.ok(avg(l,'final chorus')>avg(l,'intimate verse')*1.4);
 assert.ok(l.notes.some(n=>n.role==='melody'&&n.duration>1.5));
 const q=arrangement('we_are_the_champions');
 assert.ok(avg(q,'final refrain')>avg(q,'verse two')*1.2);
 assert.ok(q.metadata.source_tempos.at(-1).bpm<q.metadata.source_tempos[0].bpm);
 const u=arrangement('under_the_sea');
 assert.ok(u.notes.filter(n=>n.role==='melody'&&n.duration<=.3).length>350);
 for(const id of ids)assert.ok(arrangement(id).metadata.audit.interval_changes.every(n=>n.source*n.mapped>=0));
});

test('Champions opens at the first vocal chorus with original spacing preserved',()=>{
 const a=arrangement('we_are_the_champions');
 assert.equal(a.metadata.source_start_offset_seconds,36.96);
 const melody=a.notes.filter(n=>n.role==='melody');
 assert.equal(melody[0].note,'C5');
 assert.equal(melody[0].start,0);
 assert.ok(a.notes.every(n=>n.source_start>=36.935));
 for(const n of melody)assert.equal(n.start,Math.round((n.source_start-36.96)*1000)/1000);
});
