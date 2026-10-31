const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
function setup(supported=true){let callbacks,timer,stops=0;
 const {MacReplySpeech}=load('src/lib/macReplySpeech.ts',{setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){}},{'./voice':{speakVoiceResponse:(text,language,c)=>{callbacks=c;return supported?{}:null;},stopSpeaking:()=>stops++}});
 return {speech:new MacReplySpeech(),end:()=>callbacks.onEnd(),timeout:()=>timer(),stops:()=>stops};
}
test('Mac response resolves after speech, cancellation blocks continuation',async()=>{
 const h=setup();let done=false;const p=h.speech.speak('Playing Golden','en').then(x=>{done=true;return x;});await Promise.resolve();assert.equal(done,false);h.end();assert.equal(await p,true);
 const cancelled=h.speech.speak('Next song','en');h.speech.cancel();assert.equal(await cancelled,false);assert.equal(h.stops(),1);
});
test('unsupported or stalled Mac speech cannot prevent command acknowledgement',async()=>{
 assert.equal(await setup(false).speech.speak('Ready','en'),true);
 const h=setup();const p=h.speech.speak('Ready','en');h.timeout();assert.equal(await p,true);assert.equal(h.stops(),1);
});
