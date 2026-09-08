const { test }=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
function request(purpose='wake') {
  const form=new FormData(); form.append('audio',new File(['wav'],'voice.wav',{type:'audio/wav'})); form.append('language','en'); if(purpose)form.append('purpose',purpose);
  return new Request('http://localhost:3000/api/speech/transcribe',{method:'POST',body:form});
}
function endpoint(url,fetch) {
  return load('src/app/api/speech/transcribe/route.ts',{Request,Response,File,FormData,AbortController,process:{env:{WHISPER_SERVER_URL:url}},fetch});
}
test('wake transcription refuses an external Whisper server without sending audio',async()=>{
  let requests=0; const {POST}=endpoint('https://example.com',()=>requests++);
  const response=await POST(request()); assert.equal(response.status,503); assert.equal(requests,0);
});
test('wake transcription accepts loopback and keeps the existing speech contract',async()=>{
  let calls=0; const {POST}=endpoint('http://127.0.0.1:8080',async(url,options)=>{
    calls++;assert.equal(url,'http://127.0.0.1:8080/inference'); assert.equal(options.body.get('language'),'en');
    assert.equal(options.body.get('no_context'),'true');
    return Response.json({text:' Hey Angklobot. '});
  });
  const response=await POST(request()); assert.equal(response.status,200);
  assert.equal((await response.json()).text,'Hey Angklobot.'); assert.equal(calls,1);
});
test('empty transcription returns no-speech and invalid audio never reaches Whisper',async()=>{
  let calls=0; const {POST}=endpoint('http://localhost:8080',async()=>{calls++;return Response.json({text:''});});
  assert.equal((await POST(request())).status,422);
  assert.equal((await POST(new Request('http://localhost/test',{method:'POST',body:new FormData()}))).status,400);
  assert.equal(calls,1);
});
