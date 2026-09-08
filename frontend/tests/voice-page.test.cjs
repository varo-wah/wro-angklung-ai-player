const {test}=require('node:test');const assert=require('node:assert/strict');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const load=require('./load-typescript.cjs');
const voiceLib=load('src/lib/voice.ts');
const {voicePresentation}=load('src/components/VoiceControls.tsx',{}, {'@/lib/voice':voiceLib});
const base={state:'idle',muted:false,language:'en',error:null,wakeWord:{enabled:false,status:'Wake word off',error:null},startListening(){},setLanguage(){},setMuted(){}};
test('orb presentation distinguishes every existing voice state and wake activation',()=>{
 for(const state of ['idle','listening','transcribing','thinking','speaking','error'])assert.equal(voicePresentation({...base,state}).state,state);
 assert.equal(voicePresentation({...base,wakeWord:{enabled:true,status:'Listening for “Hey Angklobot”'}}).state,'wake');
 assert.equal(voicePresentation({...base,wakeWord:{enabled:true,status:'Wake word detected'}}).state,'detected');
});
test('Voice Mode renders speaking animation and controls without chat bubbles or debug transcripts',()=>{
 const {default:Page}=load('src/app/voice/page.tsx',{}, {'@/hooks/useVisitorAssistant':{useVisitorAssistant:()=>({system:{showSafetyNotices:true,setShowSafetyNotices(){}},voice:{...base,state:'speaking',transcript:'private test transcript',wakeWord:{...base.wakeWord,lastHeard:'debug text'}}})}});
 const html=renderToStaticMarkup(React.createElement(Page));assert.match(html,/data-voice-state="speaking"/);assert.match(html,/Speaking…/);assert.match(html,/Stop speaking/);assert(!html.includes('private test transcript'));assert(!html.includes('debug text'));assert(!html.includes('chat-message'));
});
