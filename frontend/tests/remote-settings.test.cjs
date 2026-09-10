const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-typescript.cjs');
const {parseRobotAction}=load('src/lib/robotSession.ts');
test('paired settings action validates ranges and all enum values',()=>{
 const action={type:'settings',settings:{strength:.8,tempo:'slower',mode:'harmony'}};
 assert.equal(JSON.stringify(parseRobotAction(action)),JSON.stringify(action));
 for(const patch of [{strength:NaN},{strength:1.1},{strength:-1},{tempo:'fast'},{mode:'bad'}])assert.throws(()=>parseRobotAction({...action,settings:{...action.settings,...patch}}));
});
