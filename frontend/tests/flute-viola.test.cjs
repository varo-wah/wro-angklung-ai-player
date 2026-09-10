const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { importScore } = require('../scripts/import-flute-viola.cjs');
const arrangement = require('../public/songs/arrangements/untitled_flute_viola.json');
const { buildScheduleFromBuiltInSong: build } = load('src/lib/scheduleBuilder.ts');
const { validateMotorSafety } = load('src/lib/safetyValidator.ts');
const settings = { strength: 0.8, tempo: 'normal', mode: 'melody' };

test('flute source preserves phrase anchors, ties and disclosed accidental', () => {
  assert.deepEqual(importScore(fs.readFileSync(path.join(__dirname, '../scripts/sources/Untitled_Flute_Viola_Score.json'),'utf8')), arrangement);
  const melody = arrangement.notes.filter(n => n.role === 'melody');
  assert.deepEqual(melody.slice(0, 8).map(n => n.note), ['C5','B4','A4','G4','F4','E4','D4','C4']);
  assert.equal(melody[7].source_duration_beats, 1.75);
  assert.equal(melody.find(n => n.source_bar === 34).source_duration_beats, 6);
  assert.ok(!melody.some(n => [35,36,39].includes(n.source_bar)));
  assert.deepEqual(arrangement.metadata.pitch_substitutions, [{bar:37,from:'A#4',to:'A4'}]);
  assert.equal(arrangement.metadata.duration_beats, 80);
});

test('mode uses only flute or flute plus sparse authored viola, safely', async () => {
  const entry = require('../public/songs/catalog.json').find(s => s.id === arrangement.id);
  const song = await load('src/lib/songLoader.ts', {fetch:async()=>({ok:true,json:async()=>arrangement})}).loadSongArrangement(entry);
  const melody = build(song, settings);
  const extra = build(song, {...settings, mode:'harmony'});
  assert.equal(melody.commands.length,117);
  assert.equal(extra.commands.length,130);
  const supports = arrangement.notes.filter(n=>n.role === 'accompaniment');
  const isSupport = c => supports.some(n=>n.note === c.note && n.start === c.start_time_seconds);
  assert.deepEqual(extra.commands.filter(c=>!isSupport(c)).map(c=>[c.note,c.start_time_seconds,c.duration_seconds]), melody.commands.map(c=>[c.note,c.start_time_seconds,c.duration_seconds]));
  const support = extra.commands.filter(isSupport);
  assert.equal(support.length,13);
  assert.ok(support.every(c=>c.strength === 1 && c.duration_seconds === 0.18));
  const { encodeArduinoNoteCommand } = load('src/lib/arduinoSerial.ts');
  assert.ok(support.every(c=>encodeArduinoNoteCommand(c).split(',').slice(2).join(',') === '180,1000'));
  assert.equal(song.title, 'Manuk Dadali');
  assert.equal(new Set(arrangement.notes.filter(n=>n.role==='accompaniment').map(n=>n.source_bar)).size,13);
  for (const schedule of [melody,extra]) assert.equal(validateMotorSafety(schedule).overall,'PASSED');
  assert.ok(!arrangement.notes.some(n=>/bass/i.test(n.source_track)));
});

test('modes filter imported support without inventing notes or altering hardware trials', () => {
  const song = {id:'fixture',title:'Fixture',tempo_bpm:80,notes:[
    {note:'C5',start:0,duration:0.2,role:'melody'},
    {note:'G3',start:0,duration:0.2,role:'support'},
    {note:'A3',start:1,duration:0.2,role:'accompaniment'},
    {note:'D5',start:2,duration:0.2},
  ]};
  assert.deepEqual(Array.from(build(song,settings).commands,c=>c.note),['C5','D5']);
  assert.equal(build(song,{...settings,mode:'harmony'}).commands.length,4);
  assert.equal(build({...song,category:'hardware_trial'},settings).commands.length,4);
});
