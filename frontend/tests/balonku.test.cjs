const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
const data=require('../public/songs/arrangements/balonku_ada_lima.json');
test('Balonku retains pickup, DOR hold, final tonic and optional simple bass',async()=>{
 const m=data.notes.filter(n=>n.role==='melody');
 assert.deepEqual(m.slice(0,6).map(n=>n.note),['E5','F5','G5','C6','G5','E5']);
 assert.equal(m.find(n=>n.beat===38).duration_beats,2);
 assert.equal(m.at(-1).note,'C5');assert.equal(m.at(-1).beat+m.at(-1).duration_beats,65);
 const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>data})}).loadSongArrangement({id:data.id,title:data.title,path:'/test'});
 for(const mode of ['melody','harmony'])for(const tempo of ['normal','slower']){
 const s=load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song,{strength:.8,mode,tempo});
 assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(s).overall,'PASSED');assert.ok(s.commands.every(n=>n.duration_seconds<=2));assert.equal(s.commands.length,mode==='melody'?m.length:data.notes.length);
 }
});
