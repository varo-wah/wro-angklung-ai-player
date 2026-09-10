const test=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs');
function setup(override){
 const lines=[],states=[];let timer=0;
 const replies=line=>line==='HELLO,1'?'READY,1,ACTIVE':line==='SCHED,CAPS'?'SCHED,1,4096':line==='STATUS'?'STATUS,READY,PROTOCOL=1,ARMED=FALSE':line==='ESTOP'?'ACK,DISARM':line==='ARM'?'ACK,ARM':line.startsWith('SCHED,RUN')?'SCHED,STARTING,500':'SCHED,OK';
 const fetch=async(_url,options={})=>{
  if(!options.body)return {ok:true,json:async()=>({host:'192.168.1.10'})};
  const {line}=JSON.parse(options.body);lines.push(line);
  if(override){const result=await override(line);if(result)return result;}
  return {ok:true,json:async()=>({line:replies(line)})};
 };
 const {Esp32Transport}=load('src/lib/esp32Transport.ts',{fetch,AbortSignal,crypto:require('node:crypto').webcrypto,performance:{now:()=>0},setInterval:()=>++timer,clearInterval:()=>{},setTimeout:(fn,ms)=>{if(ms>=450)queueMicrotask(fn);return ++timer;},clearTimeout:()=>{}});
 return {transport:new Esp32Transport(state=>states.push(state)),lines,states};
}
const note=(start,duration=1)=>({command_id:'test',note:'C5',instrument_id:'c5',actuator_channel:10,action:'shake',start_time_seconds:start,duration_seconds:duration,strength:.8});
test('buffered Wi-Fi uploads capped holds before ARM, handles resume offsets, then stops',async()=>{
 const {transport:t,lines}=setup();await t.connect();assert.equal(t.connected,true);
 await t.preparePlayback([note(0),note(2,4),note(3)],2);
 assert.ok(lines.some(l=>/^SCHED,ADD,\d+,0,0:10:2000:800;1000:10:1000:800$/.test(l)));
 assert.ok(lines.findIndex(l=>l.startsWith('SCHED,ADD'))<lines.indexOf('ARM'));
 assert.ok(lines.indexOf('ARM')<lines.findIndex(l=>l.startsWith('SCHED,RUN')));
 await t.sendNote(note(2));assert.ok(!lines.some(l=>l.startsWith('NOTE,')));
 await t.allOff();assert.equal(lines.at(-1),'ESTOP');await t.disconnect();
});
test('stop during an upload cannot subsequently ARM or RUN',async()=>{
 let release,started;const waiting=new Promise(r=>started=r);
 const {transport:t,lines}=setup(async line=>{if(line.startsWith('SCHED,ADD')){started();await new Promise(r=>release=r);}});
 await t.connect();const pending=t.preparePlayback([note(0)]);await waiting;await t.allOff();release();
 await assert.rejects(pending,/cancelled/i);assert.ok(!lines.includes('ARM'));assert.ok(!lines.some(l=>l.startsWith('SCHED,RUN')));await t.disconnect();
});
test('old single-note-only bridge is rejected before arming',async()=>{
 const {transport:t,lines}=setup(line=>line==='SCHED,CAPS'?{ok:true,json:async()=>({line:'ERROR,UNKNOWN_COMMAND'})}:null);
 await assert.rejects(t.connect(),/UNKNOWN_COMMAND/);assert.equal(t.connected,false);assert.ok(!lines.includes('ARM'));
});
