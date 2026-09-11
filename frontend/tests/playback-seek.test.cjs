const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
test('remote seek validates position and interrupts queued playback', () => {
  const { parseRobotAction, isInterrupt } = load('src/lib/robotSession.ts');
  assert.equal(parseRobotAction({type:'seek', seconds:42.5}).seconds,42.5);
  assert.equal(isInterrupt({type:'seek', seconds:0}),true);
  for (const seconds of [-1, NaN, Infinity, '10', undefined]) assert.throws(()=>parseRobotAction({type:'seek',seconds}));
});
test('seeking preserves rests and invalidates notes from the old playback', () => {
  let id=0; const timers=new Map(), played=[];
  const {PlaybackEngine}=load('src/lib/playbackEngine.ts', {
    performance:{now:()=>0}, window:{setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;}, clearTimeout:i=>timers.delete(i),requestAnimationFrame:()=>99,cancelAnimationFrame:()=>{}}
  });
  const engine=new PlaybackEngine([{note:'C4',start_time_seconds:0},{note:'E4',start_time_seconds:12}],20,{onCommand:c=>played.push(c.note),onTimeUpdate:()=>{},onComplete:()=>{}});
  engine.play(0); const stale=[...timers.values()][0].fn;
  engine.stop(); engine.play(10);
  stale(); assert.deepEqual(played,[]);
  assert.deepEqual([...timers.values()].map(t=>t.delay),[2000,10000]);
  [...timers.values()][0].fn(); assert.deepEqual(played,['E4']);
});
