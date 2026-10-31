const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
const data=require('../public/songs/arrangements/satu_nusa_satu_bangsa.json');
test('Satu Nusa preserves phrase rhythms and cadences with sparse optional bass',async()=>{
 const melody=data.notes.filter(n=>n.role==='melody'),bass=data.notes.filter(n=>n.role==='accompaniment');
 assert.deepEqual(melody.slice(0,5).map(n=>[n.note,n.duration_beats]),[['G4',1.5],['G4',.5],['A4',.5],['G4',.5],['E4',1]]);
 assert.deepEqual(melody.slice(-3).map(n=>n.note),['D5','B4','C5']);
 assert.equal(melody.at(-1).beat+melody.at(-1).duration_beats,64);
 assert.equal(bass.length,32);assert.ok(bass.every(n=>n.duration_beats===.22));
 for(const bar of [8,16])assert.deepEqual(bass.filter(n=>n.source_measure===bar).map(n=>n.note),['G3','C4']);
 const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>data})}).loadSongArrangement({id:data.id,title:data.title,path:'/test'});
 for(const mode of ['melody','harmony'])for(const tempo of ['normal','slower']){
  const schedule=load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song,{strength:.8,mode,tempo});
  assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(schedule).overall,'PASSED');
  assert.equal(schedule.commands.length,mode==='melody'?68:100);
  assert.ok(schedule.commands.every(n=>n.duration_seconds<=2));
 }
});
