const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
const source=require('../scripts/sources/ampar-ampar-pisang-score.json'),data=require('../public/songs/arrangements/ampar_ampar_pisang.json');
test('Ampar preserves pickup, measures and rests with at most two sparse bass notes per bar',async()=>{
 assert.equal(source.measures.length,16);assert.ok(source.measures.every(m=>m.reduce((s,n)=>s+n[1],0)===4));
 assert.equal(data.notes[0].note,'G4');assert.equal(data.notes[0].duration_beats,.5);
 for(let pass=0;pass<2;pass++){let beat=.5+pass*64;for(const [i,m]of source.measures.entries()){
  assert.ok(data.notes.filter(n=>n.role==='accompaniment'&&n.source_measure===i+2&&n.repeat_pass===pass+1).length<=2);
  for(const [pitch,d]of m){if(pitch==='R')assert.ok(!data.notes.some(n=>n.beat<beat+d&&n.beat+n.duration_beats>beat));beat+=d;}
 }}
 const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>data})}).loadSongArrangement({id:data.id,title:data.title,path:'/test'});
 for(const mode of ['melody','harmony'])for(const tempo of ['normal','slower']){
 const s=load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song,{strength:.8,mode,tempo});
 assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(s).overall,'PASSED');assert.ok(s.commands.every(n=>n.duration_seconds<=2));
 assert.equal(s.commands.length,data.notes.filter(n=>mode==='harmony'||n.role==='melody').length);
 }
});
