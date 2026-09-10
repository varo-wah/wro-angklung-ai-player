// Render reproducible audition clips using the app's triangle-wave shake envelope.
const fs=require('node:fs');
const path=require('node:path');
const load=require('../tests/load-typescript.cjs');
const {noteToFrequency,shakeEnvelopeAt}=load('src/lib/audioEngine.ts');
const {buildScheduleFromBuiltInSong:build}=load('src/lib/scheduleBuilder.ts');
const output=path.resolve(__dirname,'../../outputs/showcase-review');
fs.mkdirSync(output,{recursive:true});
const clips={under_the_sea:36.4,golden_huntrx:47.71,let_it_go:60.657,we_are_the_champions:0};
function wav(notes,start){
 const rate=22050,length=20,buffer=Buffer.alloc(44+rate*length*2),samples=new Float32Array(rate*length);
 for(const n of notes){
  const onset=n.start_time_seconds-start,duration=n.duration_seconds;
  if(onset<0||onset>=length)continue;
  const frequency=noteToFrequency(n.note),offset=Math.round(onset*rate);
  for(let j=0;j<Math.min(Math.round(duration*rate),samples.length-offset);j++){
   const t=j/rate;samples[offset+j]+=(2/Math.PI)*Math.asin(Math.sin(2*Math.PI*frequency*t))*.12*n.strength*shakeEnvelopeAt(t,duration);
  }
 }
 buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples.length*2,40);
 let peak=0;for(let i=0;i<samples.length;i++){peak=Math.max(peak,Math.abs(samples[i]));buffer.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);}
 if(peak>=1)throw Error('Preview clipping');
 return buffer;
}
(async()=>{
 let cards=[];
 for(const [id,start]of Object.entries(clips)){
  const data=require(`../public/songs/arrangements/${id}.json`);
  const song=await load('src/lib/songLoader.ts',{fetch:async()=>({ok:true,json:async()=>data})}).loadSongArrangement({id,title:data.title,path:'/review'});
  for(const mode of ['melody','harmony'])fs.writeFileSync(path.join(output,`${id}-${mode}.wav`),wav(build(song,{strength:.8,tempo:'normal',mode}).commands,start));
  cards.push(`<article><h2>${data.title}</h2><p>Excerpt at ${start.toFixed(1)} seconds. Simulator synthesis at 80% strength.</p><label>Melody only<audio controls preload="none" src="${id}-melody.wav"></audio></label><label>Melody with Extra<audio controls preload="none" src="${id}-harmony.wav"></audio></label><p>${data.metadata.calibration_review}</p></article>`);
 }
 fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Angklobot showcase auditions</title><style>body{font:17px system-ui;background:#101827;color:#e8edf4;max-width:850px;margin:40px auto;padding:20px}article{border-top:1px solid #43536a;padding:24px 0}p{color:#b9c7d9;line-height:1.5}label{display:inline-block;margin:12px 24px 12px 0}audio{display:block;margin-top:8px;max-width:100%}</style><h1>Showcase auditions</h1><p>Compare the same passage with and without Extra. These previews use the app's synthesized sound; they are not recordings of the physical rack. Use the controller for full-song playback.</p>${cards.join('')}<script>document.addEventListener('play',e=>document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause()}),true)</script></html>`);
 console.log(output);
})();
