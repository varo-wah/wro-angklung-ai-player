const test=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
const {buildScheduleFromBuiltInSong:build}=load('src/lib/scheduleBuilder.ts');
const settings={strength:.8,tempo:'normal',mode:'melody'};
test('two-second ceiling, written rests and slower tempo are respected',()=>{
 const song={id:'rests',title:'Rests',tempo_bpm:120,playback_policy:'authored',notes:[
 {note:'C5',start:0,duration:8,role:'melody'},
 {note:'D5',start:10,duration:.2,role:'melody'},
 {note:'E5',start:12,duration:1,role:'melody'}]};
 for(const tempo of ['normal','slower']){
 const commands=build(song,{...settings,tempo}).commands;
 assert.ok(commands.every(c=>c.duration_seconds<=2));
 assert.equal(commands[0].duration_seconds,2);
 assert.ok(commands[1].duration_seconds<=.2*(tempo==='slower'?1.25:1));
 }
});
test('separate attacks gain release time without moving or weakening notes',()=>{
 const song={id:'gaps',title:'Gaps',tempo_bpm:120,notes:[
 {note:'C5',start:0,duration:2,role:'melody'},
 {note:'C5',start:2.05,duration:1,role:'melody'},
 {note:'D5',start:2.21,duration:.12,role:'melody'}]};
 const c=build(song,settings).commands;
 assert.equal(c[0].duration_seconds,1.93);
 assert.equal(c[1].duration_seconds,.104);
 assert.deepEqual(Array.from(c,n=>n.start_time_seconds),[0,2.05,2.21]);
 assert.ok(c.every(n=>n.strength===.8));
});
