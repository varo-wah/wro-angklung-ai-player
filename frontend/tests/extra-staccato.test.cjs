const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { buildScheduleFromBuiltInSong: build } = load('src/lib/scheduleBuilder.ts');
const fs = require('node:fs');
const path = require('node:path');
const base = {strength:0.8,tempo:'normal',mode:'harmony'};
test('all catalog extras are short and boosted, with identical melody in either mode', async () => {
  const catalog = require('../public/songs/catalog.json');
  let checked = 0;
  for (const entry of catalog.filter(e=>e.active !== false && e.playable !== false)) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname,'../public',entry.path)));
    const song = await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>data})}).loadSongArrangement(entry);
    if (song.category === 'hardware_trial') continue;
    for (const tempo of ['normal','slower']) {
      const all = build(song,{...base,tempo});
      const melody = build(song,{...base,tempo,mode:'melody'});
      const extras = new Set(song.notes.map((n,i)=>['accompaniment','support'].includes(n.role) ? `cmd_${String(i+1).padStart(4,'0')}` : null));
      const support = all.commands.filter(c=>extras.has(c.command_id));
      assert.ok(support.every(c=>c.duration_seconds <= 0.18 && (song.playback_policy === 'authored' ? c.strength <= 1 : c.strength === 1)),entry.id);
      // Melody release gaps may depend on surrounding authored support; starts and strength must match.
      assert.deepEqual(Array.from(all.commands.filter(c=>!extras.has(c.command_id)),c=>[c.note,c.start_time_seconds,c.strength]),Array.from(melody.commands,c=>[c.note,c.start_time_seconds,c.strength]),entry.id);
      checked += support.length;
    }
  }
  assert.ok(checked > 100);
});
test('short notes are not lengthened, zero remains silent, trials bypass the policy', () => {
  const song={id:'test',title:'test',tempo_bpm:80,notes:[{note:'G3',start:0,duration:0.05,role:'support',playback_strength_multiplier:0.45},{note:'C5',start:1,duration:2,role:'melody'}]};
  const commands=build(song,base).commands;
  assert.equal(commands[0].duration_seconds,0.05);
  assert.equal(commands[0].strength,1);
  assert.equal(commands[1].duration_seconds,1.96);
  assert.ok(build(song,{...base,strength:0}).commands.every(c=>c.strength===0));
  const trial=build({...song,category:'hardware_trial'},base).commands;
  assert.equal(trial[0].strength,0.36);
});

test('melody sustain respects following attacks, phrase rests, and same-channel extras', () => {
  const song={id:'sustain',title:'Sustain',tempo_bpm:80,notes:[
    {note:'C5',start:0,duration:0.4,role:'melody',playback_duration_multiplier:0.5},
    {note:'D5',start:0.5,duration:0.4,role:'melody'},
    {note:'D5',start:0.8,duration:0.1,role:'support'},
    {note:'E5',start:3,duration:1,role:'melody'}]};
  const result=build(song,base).commands;
  assert.deepEqual(Array.from(result,c=>c.duration_seconds),[0.16,0.195,0.1,0.96]);
  assert.deepEqual(Array.from(result,c=>c.start_time_seconds),[0,0.5,0.8,3]);
  assert.equal(build({...song,category:'hardware_trial'},base).commands[0].duration_seconds,0.2);
});
