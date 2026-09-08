const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const captures=[], requests=[], errors=[]; let wakes=0;
  class VoiceCaptureError extends Error { constructor(message, code) { super(message); this.code=code; } }
  class BrowserVoiceRecorder {
    recordUntilSilence(options) { this.pending=deferred(); captures.push({...this.pending,options,recorder:this}); return this.pending.promise; }
    cancel() { this.pending?.reject(new VoiceCaptureError('Cancelled','cancelled')); }
  }
  const exports=load('src/lib/wakeWord.ts',{AbortController},{'@/lib/voice':{
    BrowserVoiceRecorder,VoiceCaptureError,
    transcribeVoiceRecording(audio,language,signal,purpose) { const pending=deferred(); requests.push({...pending,audio,language,signal,purpose}); return pending.promise; },
  }});
  return {...exports,VoiceCaptureError,captures,requests,errors,listener:new exports.WhisperWakeListener(()=>wakes++,error=>errors.push(error)),get wakes(){return wakes;}};
}
test('whole utterances accept close spellings and reject mentions and unrelated speech',()=>{
  const {matchesWakePhrase}=harness();
  for(const phrase of ['Angklobot','Hey Angklobot',' HEY, ANGKLOBOT! ','Hey angklo bot.','Hey anglo bot','Hey angklubot']) assert.equal(matchesWakePhrase(phrase),true,phrase);
  for(const phrase of ['','Hey Siri','Hey robot','Hey','What songs can you play?','Please say Hey Angklobot','Hey Angklobot what songs can you play','Hey Angklung','Hey angry robot','Hey Uncle about']) assert.equal(matchesWakePhrase(phrase),false,phrase);
});
test('one capture at a time, local wake transcription, and a match consumes the arm',async()=>{
  const h=harness(); await h.listener.arm(); await h.listener.arm(); assert.equal(h.captures.length,1);
  assert.equal(h.captures[0].options.maxRecordingMs,4000);
  h.captures[0].resolve('first'); await flush(); assert.equal(h.requests[0].language,'en'); assert.equal(h.requests[0].purpose,'wake');
  h.requests[0].resolve('What songs can you play?'); await flush(); assert.equal(h.wakes,0); assert.equal(h.captures.length,2);
  h.captures[1].resolve('second'); await flush(); h.requests[1].resolve('Hey Angklobot'); await flush();
  assert.equal(h.wakes,1); assert.equal(h.captures.length,2);
  await h.listener.arm(); assert.equal(h.captures.length,3); await h.listener.disable(); assert.equal(h.errors.length,0);
});
test('silence is never uploaded and suspend cancels capture',async()=>{
  const h=harness(); await h.listener.arm(); h.captures[0].reject(new h.VoiceCaptureError('Silence','no_speech')); await flush();
  assert.equal(h.requests.length,0); assert.equal(h.captures.length,2); await h.listener.suspend(); assert.equal(h.errors.length,0);
  await h.listener.disable(); await assert.rejects(h.listener.arm(),/stopped/);
});
test('suspend aborts transcription and discards late matching results',async()=>{
  const h=harness(); await h.listener.arm(); h.captures[0].resolve('audio'); await flush();
  let suspended=false; const stopping=h.listener.suspend().then(()=>{suspended=true;});
  assert.equal(h.requests[0].signal.aborted,true); assert.equal(suspended,false);
  h.requests[0].resolve('Hey Angklobot'); await stopping; assert.equal(h.wakes,0); assert.equal(h.captures.length,1);
  await h.listener.arm(); assert.equal(h.captures.length,2); await h.listener.disable();
});
test('fatal microphone and Whisper errors stop the loop and report once',async()=>{
  const h=harness(); await h.listener.arm(); h.captures[0].reject(new h.VoiceCaptureError('Permission revoked','permission_denied')); await flush();
  assert.equal(h.errors.length,1); assert.equal(h.captures.length,1); await h.listener.disable();
  const g=harness(); await g.listener.arm(); g.captures[0].resolve('audio'); await flush(); g.requests[0].reject(new Error('Whisper unavailable')); await flush();
  assert.equal(g.errors.length,1); assert.equal(g.captures.length,1); await g.listener.disable();
});
test('close discards late microphone permission results',async()=>{
  const h=harness(); await h.listener.arm(); h.captures[0].recorder.cancel=()=>{};
  h.listener.close(); h.captures[0].resolve('late audio'); await flush();
  assert.equal(h.requests.length,0); assert.equal(h.wakes,0); assert.equal(h.errors.length,0);
});
