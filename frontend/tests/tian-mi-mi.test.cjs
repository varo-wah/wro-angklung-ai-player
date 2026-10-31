const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
const data=require('../public/songs/arrangements/tian_mi_mi.json'),source=require('../scripts/sources/tian-mi-mi-score.json');
test('Tian Mi Mi excerpt preserves rests, tied hold, exact transposition and optional bass',async()=>{
 assert.equal(source.measures.length,15);let beat=0;
 for(const m of source.measures){assert.equal(m.reduce((s,n)=>s+n[1],0),4);for(const [pitch,d]of m){if(pitch==='R')assert.ok(!data.notes.some(n=>n.beat<beat+d&&n.beat+n.duration_beats>beat));beat+=d;}}
 const midi=n=>{const m=/^([A-G])(#?)(\d)$/.exec(n);return 12*(+m[3]+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]+(m[2]?1:0);};
 for(const n of data.notes.filter(n=>n.role==='melody'))assert.equal(midi(n.note)-midi(n.source_note),10);
 assert.equal(data.notes.find(n=>n.role==='melody'&&n.beat===32.5).duration_beats,3.5);
 const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>data})}).loadSongArrangement({id:data.id,title:data.title,path:'/test'});
 for(const mode of ['melody','harmony'])for(const tempo of ['normal','slower']){
 const s=load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song,{strength:.8,mode,tempo});
 assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(s).overall,'PASSED');assert.ok(s.commands.every(n=>n.duration_seconds<=2));assert.equal(s.commands.length,mode==='melody'?63:90);
 }
});
