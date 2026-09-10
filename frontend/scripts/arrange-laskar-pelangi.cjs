const fs = require('node:fs');
const path = require('node:path');
const score = require('./sources/laskar-pelangi-score.json');
const root = path.join(__dirname, '../public/songs');
const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const transpose = note => {
  const [,pc,oct] = note.match(/^([A-G]#?)(\d)$/);
  const midi = (Number(oct)+1)*12+names.indexOf(pc)+score.transposition_semitones;
  return names[midi%12]+(Math.floor(midi/12)-1);
};
const notes = [];
const rests = [];
score.measures.forEach((measure,i) => {
  let beat=i*4;
  if (measure.reduce((n,x)=>n+x[1],0)!==4) throw new Error(`Measure ${i+1} does not total four beats`);
  for (const [source,duration] of measure) {
    if(source==='R') rests.push([beat,beat+duration]);
    else notes.push({note:transpose(source),beat,duration_beats:duration,role:'melody',source_note:source,source_measure:i+1,playback_strength_multiplier:i>=16?1.1:1});
    beat+=duration;
  }
});
const bass = {G:'C4',C:'F4',Bm:'E4',Em:'A3',D:'G3',Am:'D4'};
score.chords.forEach((chords,i)=>chords.forEach((chord,j)=>{
  let beat=i*4+j*2;
  if(rests.some(([start,end])=>beat>=start&&beat<end)) {
    const next=notes.find(n=>n.beat>=beat && n.beat<(i+1)*4);
    if(!next)return;
    beat=next.beat;
  }
  notes.push({note:bass[chord],beat,duration_beats:.24,role:'accompaniment',source_measure:i+1,source_chord:chord,playback_strength_multiplier:1.15});
}));
notes.sort((a,b)=>a.beat-b.beat||a.note.localeCompare(b.note));
const arrangement={format_version:'angklung_song.v1',id:'laskar_pelangi_nidji',title:'Laskar Pelangi',aliases:['laskar pelangi','nidji','laskar pelangi nidji'],category:'indonesian_modern',difficulty:'medium',tempo_bpm:90,time_signature:'4/4',physical_rack_map:'G3-C6',arrangement_status:'sheet_transcription_draft_needs_listening_review',playable:true,demo_safe:false,has_validated_notes:true,playback_policy:'authored',arrangement_policy:{preserve_authored_dynamics:true},notes,metadata:{source:score.source,source_key:score.source_key,target_key:'C major',transposition_semitones:5,source_measures:26,source_duration_beats:104,arrangement_notes:'Ties combined; written rests retained. Bass is newly arranged from printed chord symbols, not a transcribed bass staff. Physical holds capped at two seconds by scheduler. Screenshot transcription needs listening review.'}};
fs.writeFileSync(path.join(root,'arrangements/laskar_pelangi_nidji.json'),JSON.stringify(arrangement,null,2)+'\n');
