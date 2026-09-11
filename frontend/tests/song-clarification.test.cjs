const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
const {routeSongRequestPreRouter:route}=load('src/lib/ai/localFallbackMatcher.ts');
const songs=[{id:'golden',title:'Golden',aliases:[]},{id:'yellow',title:'Yellow',aliases:[]}];
test('misspelling asks a concrete question and yes confirms without guessing playback',()=>{
 const r=route('play gollden',songs).result;
 assert.equal(r.assistant_message,'Do you mean Golden?');assert.equal(r.needs_confirmation,true);assert.equal(r.should_generate_schedule,false);
 const yes=route('yes',songs,{pending_song_id:r.matched_song_id}).result;
 assert.equal(yes.matched_song_id,'golden');assert.equal(yes.should_generate_schedule,true);
});
test('rejection clears suggestion, but a clear replacement is respected',()=>{
 for(const message of ['no','no thanks','no something else']){
  const r=route(message,songs,{pending_song_id:'golden'}).result;
  assert.match(r.assistant_message,/not in the available library/);assert.equal(r.matched_song_id,null);assert.equal(r.should_generate_schedule,false);
 }
 assert.equal(route('no play yellow',songs,{pending_song_id:'golden'}).result.matched_song_id,'yellow');
 assert.equal(route('play golden',songs).result.should_generate_schedule,true);
});
