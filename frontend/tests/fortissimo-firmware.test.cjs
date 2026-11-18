const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
test('firmware ceiling preserves dynamics and EEPROM fallback', () => {
  const src=fs.readFileSync(path.resolve(__dirname,'../../hardware/arduino/mega_full_18_note_web_serial/mega_full_18_note_web_serial.ino'),'utf8');
  function fn(name){const a=src.indexOf('void '+name+'(');let b=src.indexOf('{',a)+1,d=1;while(d){if(src[b]==='{')d++;if(src[b]==='}')d--;b++;}return src.slice(a,b);}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ffmax-'));
  try {
    fs.writeFileSync(path.join(dir,'test.cpp'), `
#include <cstdint>
#include <cassert>
#include <cstring>
const int CHANNEL_COUNT=18, FORTE_EEPROM_BASE=64;
uint8_t forteMaxPercent[18],motorPowerPercent[18];uint16_t duty;
void beginPulse(uint8_t,uint16_t d,unsigned long){duty=d;}
struct Store{uint8_t data[128]; Store(){memset(data,255,128);} uint8_t read(int a){return data[a];}} EEPROM;
${fn('startMotorPulseCalibrated')}
${fn('loadForteCalibration')}
int main(){
 loadForteCalibration();for(int i=0;i<18;i++)assert(forteMaxPercent[i]==255);
 motorPowerPercent[3]=30;startMotorPulseCalibrated(3,300,1000);assert(duty==450);
 for(int p=0;p<=100;p++){forteMaxPercent[3]=p;for(int s=0;s<=1000;s++){startMotorPulseCalibrated(3,300,s);assert(duty==p*10*s/1000);assert(duty<=p*10);}}
 EEPROM.data[70]=47;EEPROM.data[71]=47^255;loadForteCalibration();assert(forteMaxPercent[3]==47);
 EEPROM.data[71]=47;loadForteCalibration();assert(forteMaxPercent[3]==255);
}`);
    execFileSync('c++',['-std=c++11',path.join(dir,'test.cpp'),'-o',path.join(dir,'test')]);
    execFileSync(path.join(dir,'test'));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
