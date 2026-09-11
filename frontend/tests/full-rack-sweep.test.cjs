const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
test('full rack sweep visits all channels once with separate holds in both modes',async()=>{
 const a=require('../public/songs/arrangements/trial_full_rack_sweep.json');
 const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>a})}).loadSongArrangement({id:a.id,title:a.title,path:'/test'});
 for(const mode of ['melody','harmony']){
 const s=load('src/lib/scheduleBuilder.ts').buildScheduleFromBuiltInSong(song,{mode,tempo:'normal',strength:.8});
 assert.deepEqual(Array.from(s.commands,c=>c.actuator_channel),Array.from({length:18},(_,i)=>i));
 assert(s.commands.every(c=>c.duration_seconds===.08));
 assert.equal(s.commands[17].start_time_seconds,1.7);
 assert.ok(s.commands.every((c,i)=>i===0||Math.abs(c.start_time_seconds-s.commands[i-1].start_time_seconds-.1)<.001));
 assert.equal(load('src/lib/safetyValidator.ts').validateMotorSafety(s).overall,'PASSED');
 }
});
