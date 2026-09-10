const test=require('node:test');const assert=require('node:assert/strict');const load=require('./load-typescript.cjs');
function setup(enabled='1'){
 const forwarded=[];
 const route=load('src/app/api/robot/wireless/route.ts',{Request,Response,AbortSignal,process:{env:{ANGKLOBOT_WIRELESS_ENABLED:enabled,ANGKLOBOT_BRIDGE_HOST:'192.168.1.10',ANGKLOBOT_BRIDGE_TOKEN:'test-only-token-00000000000000000000'},cwd:()=>'/test/frontend'},fetch:async(url,options)=>{forwarded.push({url,options});return new Response('SCHED,OK');}});
 return {route,forwarded};
}
function req(origin,line='SCHED,BEGIN,1,2'){return new Request('http://localhost:3002/api/robot/wireless',{method:'POST',headers:{host:'localhost:3002',origin,'content-type':'application/json'},body:JSON.stringify({line})});}
test('wireless proxy permits local schedule protocol without exposing the token',async()=>{
 const {route,forwarded}=setup();const config=await route.GET(new Request('http://localhost:3002/api/robot/wireless'));assert.deepEqual(await config.json(),{host:'192.168.1.10'});
 assert.equal((await route.POST(req('http://localhost:3002'))).status,200);assert.equal(forwarded.length,1);assert.equal(forwarded[0].options.body,'SCHED,BEGIN,1,2\n');
});
test('disabled, cross-origin and calibration requests never reach the bridge',async()=>{
 for(const [enabled,origin,line] of [['0','http://localhost:3002','ARM'],['1','https://untrusted.example','ARM'],['1','http://localhost:3002','ALLON']]){
 const {route,forwarded}=setup(enabled);assert.ok((await route.POST(req(origin,line))).status>=400);assert.equal(forwarded.length,0);
 }
});
