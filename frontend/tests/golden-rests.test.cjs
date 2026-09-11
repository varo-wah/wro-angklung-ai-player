const test=require('node:test'),assert=require('node:assert/strict');
const song=require('../public/songs/arrangements/golden_huntrx.json');
test('Golden extras stay inside melody note windows, leaving rests silent',()=>{
 const melody=song.notes.filter(n=>n.role==='melody');
 const extra=song.notes.filter(n=>n.role==='accompaniment');
 assert.ok(extra.length>0,'Retain aligned accompaniment');
 for(const n of extra) assert.ok(melody.some(m=>m.start===n.start),`Independent bass attack at ${n.start}`);
 for(const n of extra) assert.ok(melody.some(m=>m.start<=n.start && n.start+n.duration<=m.start+Math.min(m.duration,m.source_duration)+.001),`Extra at ${n.start} spills into a melody rest`);
});
