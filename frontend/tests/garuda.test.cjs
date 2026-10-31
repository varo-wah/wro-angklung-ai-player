const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
const data=require('../public/songs/arrangements/garuda_pancasila.json'),source=require('../scripts/sources/garuda-pancasila-score.json');
test('Garuda preserves rests and uniform F-to-C transposition with optional sparse bass',async()=>{
 const midi=n=>{const m=/^([A-G])(b?)(\d)$/.exec(n);return 12*(+m[3]+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]-(m[2]?1:0);};
 for(const n of data.notes.filter(n=>n.role==='melody'))assert.equal(midi(n.note)-midi(n.source_note),7);
 let beat=0;for(const m of source.measures){assert.equal(m.reduce((s,n)=>s+n[1],0),4);for(const [degree,d]of m){if(degree==='R')assert.ok(!data.notes.some(n=>n.beat<beat+d&&n.beat+n.duration_beats>beat));beat+=d;}}
 const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>data})}).loadSongArrangement({id:data.id,title:data.title,path:'/test'});
 for(const mode of ['melody','harmony'])for(const tempo of ['normal','slower']){
 const s=load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song,{strength:.8,mode,tempo});
 assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(s).overall,'PASSED');
 assert.equal(s.commands.length,mode==='melody'?73:100);assert.ok(s.commands.every(n=>n.duration_seconds<=2));
 }
});
