const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
const {routeArrangementCommand:route}=load('src/lib/arrangementCommandRouter.ts');
test('spoken mode commands recognize melody and extra with polite wrappers',()=>{
 for(const s of ['melody','melody only','Switch to melody','please use melody only','melodi saja']) assert.equal(route(s),'melody',s);
 for(const s of ['extra','melody with extra','switch to melody with extra','harmony','melodi dengan pengiring']) assert.equal(route(s),'harmony',s);
});
test('song requests and questions do not accidentally change arrangement mode',()=>{
 for(const s of ['play Yellow','what is melody','play Unchained Melody','stop','']) assert.equal(route(s),null,s);
});
