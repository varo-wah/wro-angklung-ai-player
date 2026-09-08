const {test}=require('node:test'); const assert=require('node:assert/strict'); const load=require('./load-typescript.cjs');
const {routeSongRequestPreRouter}=load('src/lib/ai/localFallbackMatcher.ts');
const {normalizeAiSongRequestResult}=load('src/lib/ai/songRequestSchema.ts');
const catalog=[{id:'fireflies',title:'Fireflies',active:true,playable:true,visible_in_guest:true,aliases:['Fire flies']}];
test('explicit supported titles skip yes and request validation in English and Indonesian',()=>{
  for(const text of ['Play Fireflies','Fireflies','Please play Fireflies','Mainkan lagu Fireflies','Putar Fireflies']) {
    const routed=routeSongRequestPreRouter(text,catalog).result;
    const result=normalizeAiSongRequestResult(routed,catalog,'local_fallback');
    assert.equal(result.matched_song_id,'fireflies',text); assert.equal(result.should_generate_schedule,true,text);
    assert.equal(result.needs_confirmation,false); assert.equal(result.next_state,'ready_to_play'); assert(!/do you want/i.test(result.speech_text));
  }
});
test('ambiguous aliases ask for a title, while inactive or unsupported songs cannot generate',()=>{
  const ambiguous=[...catalog,{...catalog[0],id:'alternate',title:'Fireflies Acoustic',aliases:['Fireflies']}];
  const result=routeSongRequestPreRouter('Play Fireflies',ambiguous).result;
  assert.equal(result.should_generate_schedule,false); assert.equal(result.matched_song_id,null); assert.match(result.assistant_message,/Which/);
  for(const songs of [[{...catalog[0],active:false}],[{...catalog[0],playable:false}],[{...catalog[0],visible_in_guest:false}]]) {
    assert.equal(routeSongRequestPreRouter('Play Fireflies',songs),null);
  }
  assert.equal(routeSongRequestPreRouter('Play Imaginary Song',catalog),null);
});
test('low confidence and recommendations cannot smuggle automatic generation through normalization',()=>{
  const base=routeSongRequestPreRouter('Play Fireflies',catalog).result;
  for(const overrides of [{confidence:.4},{intent:'suggest_song'},{matched_song_id:'fake'},{needs_confirmation:true}]) {
    assert.equal(normalizeAiSongRequestResult({...base,...overrides},catalog,'local_fallback').should_generate_schedule,false);
  }
});
