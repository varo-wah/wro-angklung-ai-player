const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
for(const id of ['mission_impossible_theme','a_sky_full_of_stars'])test(`${id}: source timing, two modes, motor limits`,async()=>{
 const a=require('../public/songs/arrangements/'+id+'.json');
 const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>a})}).loadSongArrangement({id,title:a.title,path:'/test'});
 assert(a.notes.filter(n=>n.role==='accompaniment').length>20);
 if(id==='mission_impossible_theme')assert.equal(a.time_signature,'5/4');else assert.equal(a.metadata.pitch_adaptations.length,0);
 for(const mode of ['melody','harmony'])for(const tempo of ['normal','slower']){
 const s=load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song,{strength:.8,mode,tempo});
 assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(s).overall,'PASSED');
 assert(s.commands.every(n=>n.duration_seconds<=2));
 assert.equal(s.commands.length,a.notes.filter(n=>mode==='harmony'||n.role==='melody').length);
 }
});
