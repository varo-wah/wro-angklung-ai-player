const {test}=require('node:test');const assert=require('node:assert/strict');const React=require('react');const {createRoot}=require('react-dom/client');const {JSDOM}=require('jsdom');const load=require('./load-typescript.cjs');
const {routeSongRequestPreRouter}=load('src/lib/ai/localFallbackMatcher.ts');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function harness({warning=false,failed=false,draft=false,requestDelay,audioDelay,pathname='/guest',robotRole='viewer',remoteSend}={}) {
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:3000/guest'});global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const catalog=[{id:'test-song',title:'Test Song',path:'/test.json',active:true,playable:true,demo_safe:!draft,visible_in_guest:true}];
 const song={...catalog[0],notes:[{note:'G3',start:0,duration:1}],tempo_bpm:120};
 const schedule={song:{title:song.title},timing:{total_duration_seconds:1},commands:[]}; let plays=0; const snapshots=[]; let robotOptions; const sent=[];
 const modules={
  '@/hooks/useRobotSession': { useRobotSession: opts => {
    robotOptions = opts;
    return {
      role: robotRole, credentials: { current: { role: robotRole } },
      statusRef: { current: { hostOnline: robotRole !== 'viewer' } },
      status: { hostOnline: robotRole !== 'viewer', arduino: { status: robotRole === 'viewer' ? 'disconnected' : 'connected', outputMode: 'active', message: 'USB' }, playbackState: 'idle' },
      cancelQueued() { opts.interrupt(); },
      send: async action => { sent.push(action); return remoteSend ? remoteSend(action) : { id: 'remote-request', result: { ok: true, value: 'Playing Test Song.', pending: true } }; },
    };
  } },
  '@/components/RobotSessionStatus':{RobotSessionStatus:()=>null},
  'next/navigation':{usePathname:()=>pathname},'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
  '@/lib/songCatalog':{loadSongCatalog:async()=>catalog,getActiveCatalogSongs:s=>s,getVisibleCatalogSongs:s=>s},
  '@/lib/songLoader':{loadSongArrangement:async()=>song},
  '@/lib/audioEngine':{AudioEngine:class {async ensureReady(){await audioDelay?.promise;}stopAll(){}}},
  '@/lib/playbackEngine':{PlaybackEngine:class {play(){plays++;}stop(){}}},
  '@/lib/arduinoSerial':{getInitialArduinoConnectionState:()=>({status:'disconnected'}),ArduinoSerialController:class { constructor(onState){this.onState=onState;this.connected=false;} async connect(){this.connected=true;this.onState({status:'connected',outputMode:'active',message:'USB'});} async preparePlayback(){} async allOff(){} async disarm(){} async disconnect(){this.connected=false;} }},
  '@/lib/instrumentMap':{buildFullAngklungRack:()=>[]},
  '@/lib/scheduleBuilder':{buildScheduleFromBuiltInSong:()=>schedule,scaleNotes:s=>s},
  '@/lib/scheduleValidator':{validateSchedulePayload:s=>({ok:!failed,schedule:s,errors:failed?['Invalid timing']:[]})},
  '@/lib/safetyValidator':{validateMotorSafety:()=>({overall:failed?'FAILED':'PASSED',checks:warning?[{status:'warning'}]:[]})},
  '@/lib/systemSync':{createSyncTabId:()=> 'test',readStoredSystemSnapshot:()=>null,SYSTEM_SYNC_LIBRARY_VERSION:'test',createSystemSyncController:()=>({publish:s=>snapshots.push(s),close(){}})},
 };
 const fetch=async(url,options)=>{const body=JSON.parse(options.body);if(body.message!=='Hello')await requestDelay?.promise;return {ok:true,json:async()=>routeSongRequestPreRouter(body.message,catalog)?.result??{intent:'greeting',assistant_message:'Hello',should_search_catalog:false}};};
 const {AngklungSystemProvider,useAngklungSystem}=load('src/components/AngklungSystemProvider.tsx',{window:dom.window,document:dom.window.document,fetch},modules);
 let api;function Probe(){api=useAngklungSystem();return null;}const root=createRoot(dom.window.document.getElementById('root'));
 await React.act(async()=>root.render(React.createElement(AngklungSystemProvider,null,React.createElement(Probe))));
 return {get api(){return api;},get plays(){return plays;},get robotOptions(){return robotOptions;},sent,snapshots,cleanup:async()=>{await React.act(async()=>root.unmount());dom.window.close();}};
}
test('one confident request generates, validates and starts the existing playback path',async()=>{
 const h=await harness();try {let response;await React.act(async()=>{response=await h.api.requestSong('Play Test Song');});assert.equal(h.plays,0);assert.equal(response,'Playing Test Song.');await React.act(async()=>h.api.startPendingUserModePlayback());assert.equal(h.plays,1);assert.equal(h.api.playbackState,'playing');assert.equal(h.api.aiPendingSongId,null);}finally{await h.cleanup();}
});
test('failed validation still prevents automatic playback',async()=>{
 const h=await harness({failed:true});try{await React.act(async()=>h.api.requestSong('Play Test Song'));await React.act(async()=>h.api.startPendingUserModePlayback());assert.equal(h.plays,0);}finally{await h.cleanup();}
});
test('User Mode queues validated drafts and warnings until after speech while operator mode retains review gating',async()=>{
 for(const options of [{draft:true},{warning:true}]){const h=await harness(options);try{let response;await React.act(async()=>{response=await h.api.requestSong('Play Test Song');});assert.equal(response,'Playing Test Song.');assert.equal(h.plays,0);await React.act(async()=>h.api.startPendingUserModePlayback());assert.equal(h.plays,1,JSON.stringify(options));}finally{await h.cleanup();}}
 for(const options of [{draft:true,pathname:'/control'},{warning:true,pathname:'/control'}]){const h=await harness(options);try{await React.act(async()=>h.api.requestSong('Play Test Song'));assert.equal(h.plays,0,JSON.stringify(options));}finally{await h.cleanup();}}
});
test('User Mode treats warnings as non-blocking regardless of notice visibility',async()=>{
 const h=await harness({warning:true});try{
  await React.act(async()=>h.api.setShowSafetyNotices(false)); let response;
  await React.act(async()=>{response=await h.api.requestSong('Play Test Song');});
  assert.equal(response,'Playing Test Song.'); assert.equal(h.plays,0); await React.act(async()=>h.api.startPendingUserModePlayback());
  assert.equal(h.plays,1); assert.equal(h.api.safetyReport.overall,'PASSED');
 }finally{await h.cleanup();}
});
test('Clear Chat removes persisted messages and pending state while preserving settings and catalog',async()=>{
 const h=await harness({warning:true});try{await React.act(async()=>h.api.requestSong('Play Test Song'));const settings=h.api.settings;const selected=h.api.selectedSongId;
 await React.act(async()=>h.api.clearChat());assert.equal(h.api.chatMessages.length,0);assert.equal(h.api.aiPendingSongId,null);assert.equal(h.api.settings,settings);assert.equal(h.api.selectedSongId,selected);assert.equal(h.api.supportedSongs.length,1);assert.equal(h.snapshots.at(-1).chatMessages.length,0);
 }finally{await h.cleanup();}
});
test('clearing while AI is pending discards its reply and prevents generation',async()=>{
 const delay=deferred(),h=await harness({requestDelay:delay});try{let request;await React.act(async()=>{request=h.api.requestSong('Play Test Song');});await React.act(async()=>h.api.clearChat());await React.act(async()=>{delay.resolve();await request;});assert.equal(h.api.chatMessages.length,0);assert.equal(h.plays,0);assert.equal(h.api.schedule,null);}finally{await h.cleanup();}
});
test('leaving the voice route during audio preparation prevents delayed playback',async()=>{
 const delay=deferred(),h=await harness({audioDelay:delay});try{let request;await React.act(async()=>{request=h.api.requestSong('Play Test Song');});await React.act(async()=>h.api.cancelConversationRequest());await React.act(async()=>{delay.resolve();await request;});assert.equal(h.plays,0);}finally{await h.cleanup();}
});

test('remote visitor forwards requests and post-speech start without running a local engine',async()=>{
 const h=await harness({robotRole:'remote'});try{
  await React.act(async()=>h.api.requestSong('Play Test Song'));
  assert.equal(h.sent[0].type,'request');assert.equal(h.plays,0);assert.equal(h.api.schedule,null);
  await React.act(async()=>h.api.startPendingUserModePlayback());
  assert.equal(h.sent[1].type,'start_pending');assert.equal(h.sent[1].requestId,'remote-request');assert.equal(h.plays,0);
 }finally{await h.cleanup();}
});
test('USB owner executes a remote visitor request using validation and waits for speech completion',async()=>{
 const h=await harness({robotRole:'host',pathname:'/control',draft:true});try{
  await React.act(async()=>h.api.connectArduino());let response;
  await React.act(async()=>{response=await h.robotOptions.execute({id:'request-1',action:{type:'request',text:'Play Test Song',language:'en'}});});
  assert.equal(response.pending,true);assert.equal(h.plays,0);
  await React.act(async()=>h.robotOptions.execute({id:'start-1',action:{type:'start_pending',requestId:'request-1'}}));
  assert.equal(h.plays,1);
  await React.act(async()=>{response=await h.robotOptions.execute({id:'start-2',action:{type:'start_pending',requestId:'request-1'}});});
  assert.equal(response.ok,false);assert.equal(h.plays,1);
 }finally{await h.cleanup();}
});
test('remote owner rejects physical playback after USB loss and never accepts mirrored state as commands',async()=>{
 const h=await harness({robotRole:'host',pathname:'/control'});try{
  let response;await React.act(async()=>{response=await h.robotOptions.execute({id:'play',action:{type:'play'}});});
  assert.equal(response.ok,false);assert.match(response.error,/disconnected/);assert.equal(h.plays,0);
  await React.act(async()=>h.robotOptions.applySnapshot({updatedAt:Date.now()+1000,playbackState:'playing'}));
  assert.equal(h.api.playbackState,'idle');assert.equal(h.plays,0);
 }finally{await h.cleanup();}
});
test('Stop invalidates a generated remote request before delayed TTS completion',async()=>{
 const h=await harness({robotRole:'host',pathname:'/control'});try{
  await React.act(async()=>h.api.connectArduino());
  await React.act(async()=>h.robotOptions.execute({id:'request-1',action:{type:'request',text:'Play Test Song',language:'en'}}));
  await React.act(async()=>h.api.emergencyStopPlayback());let response;
  await React.act(async()=>{response=await h.robotOptions.execute({id:'late',action:{type:'start_pending',requestId:'request-1'}});});
  assert.equal(response.ok,false);assert.equal(h.plays,0);
 }finally{await h.cleanup();}
});

test('a spoken or typed remote stop takes the interrupt path instead of queuing behind AI',async()=>{
 const h=await harness({robotRole:'remote'});try{
  let result;await React.act(async()=>{result=await h.api.requestSong('stop');});
  assert.equal(h.sent[0].type,'estop');assert.equal(result,'Stopped playback.');assert.equal(h.plays,0);
 }finally{await h.cleanup();}
});
