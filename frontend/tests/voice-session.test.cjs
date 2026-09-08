const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-typescript.cjs');
test('Guest and Voice tabs share an exclusive lease and release it on navigation',async()=>{
  let held=false;
  const locks={request:async(name,options,callback)=>{ if(held)return callback(null);held=true;try {await callback({name});} finally {held=false;} }};
  const {VoiceSessionLease}=load('src/lib/voiceSessionLease.ts',{navigator:{locks}});
  const guest=new VoiceSessionLease(), voice=new VoiceSessionLease();
  await guest.acquire(); await guest.acquire(); await assert.rejects(voice.acquire(),/another Angklobot tab/);
  guest.release(); await new Promise(r=>setImmediate(r)); await voice.acquire(); voice.release();
});
test('unmount during lock acquisition cannot start a late microphone session',async()=>{
  let callback;const locks={request:async(name,options,cb)=>{callback=cb;}};
  const {VoiceSessionLease}=load('src/lib/voiceSessionLease.ts',{navigator:{locks}});
  const session=new VoiceSessionLease();const pending=session.acquire();session.release(); await callback({});
  await assert.rejects(pending,/cancelled/);
});
