const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
const data=require('../public/songs/arrangements/rek_ayo_rek.json'),source=require('../scripts/sources/rek-ayo-rek-score.json');
test('Rek Ayo Rek keeps all 48 bars, ties and rests with optional bass',async()=>{
 assert.equal(source.measures.length,48);let beat=0;
 for(const m of source.measures){assert.equal(m.reduce((s,n)=>s+n[1],0),4);for(const [degree,d]of m){
 if(degree==='R')assert.ok(!data.notes.some(n=>n.beat<beat+d&&n.beat+n.duration_beats>beat));
 if(degree.startsWith('~'))assert.ok(!data.notes.some(n=>n.role==='melody'&&n.beat===beat));beat+=d;
 }}
 const melody=data.notes.filter(n=>n.role==='melody');assert.equal(melody[0].duration_beats,1.5);assert.equal(melody.find(n=>n.beat===3).duration_beats,2);
 assert.equal(beat,192);
 const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>data})}).loadSongArrangement({id:data.id,title:data.title,path:'/test'});
 for(const mode of ['melody','harmony'])for(const tempo of ['normal','slower']){
 const s=load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song,{strength:.8,mode,tempo});
 assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(s).overall,'PASSED');assert.ok(s.commands.every(n=>n.duration_seconds<=2));assert.equal(s.commands.length,mode==='melody'?148:240);
 }
});
