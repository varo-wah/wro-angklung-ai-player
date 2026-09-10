const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
const score=require('../scripts/sources/laskar-pelangi-score.json');
const data=require('../public/songs/arrangements/laskar_pelangi_nidji.json');
test('Laskar Pelangi preserves measures, tied opening, rests, and safe output in both modes',async()=>{
 assert.equal(score.measures.length,26);
 assert.ok(score.measures.every(m=>m.reduce((sum,n)=>sum+n[1],0)===4));
 const melody=data.notes.filter(n=>n.role==='melody');
 assert.deepEqual(melody.slice(0,4).map(n=>[n.note,n.beat,n.duration_beats]),[['G5',0,.75],['E5',.75,1.25],['D5',3,.5],['C5',3.5,.5]]);
 let beat=0;
 for(const m of score.measures)for(const [pitch,duration] of m){
  if(pitch==='R')assert.ok(!data.notes.some(n=>n.beat<beat+duration&&n.beat+n.duration_beats>beat));
  beat+=duration;
 }
 const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>data})}).loadSongArrangement({id:data.id,title:data.title,path:'/test'});
 for(const mode of ['melody','harmony'])for(const tempo of ['normal','slower']){
  const schedule=load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song,{strength:.8,tempo,mode});
  assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(schedule).overall,'PASSED');
  assert.ok(schedule.commands.every(n=>n.duration_seconds<=2));
  assert.equal(schedule.commands.length,mode==='melody'?melody.length:data.notes.length);
 }
});
