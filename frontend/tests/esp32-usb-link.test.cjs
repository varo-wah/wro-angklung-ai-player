const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { ReadableStream, WritableStream } = require('node:stream/web');
test('USB correlates replies, ignores diagnostics, and sends STOP without waiting for NOTE', async () => {
  let input; const writes=[];
  const port={readable:new ReadableStream({start(c){input=c;}}),writable:new WritableStream({write(bytes){writes.push(new TextDecoder().decode(bytes));}}),async open(){},async close(){}};
  const {Esp32UsbLink}=load('src/lib/esp32UsbLink.ts',{navigator:{},window:{isSecureContext:true},TextEncoder,TextDecoder,setTimeout:(fn,ms)=>ms===2000?setTimeout(fn,0):setTimeout(fn,ms)});
  const link=new Esp32UsbLink(async()=>port); await link.open();
  const note=link.request('NOTE,0,100,800'); const rejected=assert.rejects(note,/PREEMPTED/);
  const stop=link.request('ESTOP'); await new Promise(setImmediate);
  assert.deepEqual(writes,['USB,1,NOTE,0,100,800\n','USB,2,ESTOP\n']);
  input.enqueue(new TextEncoder().encode('DBG,ACK,NOTE,0\nACK,NOTE,0\nUSB,999,200,PONG\nUSB,1,409,BRIDGE,PREEMPTED_BY_STOP\nUSB,2,200,ACK,'));
  input.enqueue(new TextEncoder().encode('DISARM\n')); await rejected; assert.equal(await stop,'ACK,DISARM');
  const ping=link.request('PING'); const disconnected=assert.rejects(ping,/disconnected/); input.close(); await disconnected; await link.close();
});
test('USB link uses the shared preloaded scheduler and releases ownership on disconnect',async()=>{
  const lines=[];let closed=false;
  const link={async open(){},async close(){closed=true;},async request(line){lines.push(line);return line==='HELLO,1'?'READY,1,ACTIVE':line==='SCHED,CAPS'?'SCHED,1,4096':line==='STATUS'?'STATUS,READY,PROTOCOL=1,ARMED=FALSE':line==='ESTOP'?'ACK,DISARM':line==='ARM'?'ACK,ARM':line.startsWith('SCHED,RUN')?'SCHED,STARTING,500':'SCHED,OK';}};
  const {Esp32Transport}=load('src/lib/esp32Transport.ts',{crypto:require('node:crypto').webcrypto,performance:{now:()=>0},setInterval:()=>1,clearInterval(){},setTimeout:(fn,ms)=>{if(ms>=450)queueMicrotask(fn);return 1;},clearTimeout(){}});
  const t=new Esp32Transport(()=>{},link); await t.connect();
  await t.preparePlayback([{command_id:'x',note:'C5',instrument_id:'c5',actuator_channel:10,action:'shake',start_time_seconds:0,duration_seconds:4,strength:.8}]);
  assert.ok(lines.some(l=>/^SCHED,ADD,\d+,0,0:10:2000:800$/.test(l)));
  assert.ok(!lines.some(l=>l.startsWith('NOTE,'))); await t.disconnect();
  assert.deepEqual(lines.slice(-2),['ESTOP','USB,RELEASE']);assert.equal(closed,true);
});
