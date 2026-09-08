const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
function engine() {
  const oscillators = [], curves = [];
  class Context {
    currentTime = 10;
    state = 'running';
    destination = {};
    createOscillator() {
      const stops = [];
      const o = { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, addEventListener() {}, start() {}, stop(t) { stops.push(t); }, stops };
      oscillators.push(o); return o;
    }
    createGain() { return { gain: { setValueCurveAtTime(curve, start, duration) { curves.push({ curve, start, duration }); } }, connect() {}, disconnect() {} }; }
  }
  const module = load('src/lib/audioEngine.ts', { window: { AudioContext: Context } });
  return { audio: new module.AudioEngine(), oscillators, curves, ...module };
}
test('long notes sustain through full duration, with strength-proportional gain', () => {
  const { audio, curves, oscillators } = engine();
  audio.playNote('C5', 3, 0.8);
  audio.playNote('G3', 3, 0.4);
  assert.equal(curves[0].duration, 3);
  assert.equal(oscillators[0].stops[0], 13);
  const middle = Math.floor(curves[0].curve.length / 2);
  assert.ok(curves[0].curve[middle] > 0.07);
  assert.ok(Math.abs(curves[0].curve[middle] / curves[1].curve[middle] - 2) < 0.001);
  assert.equal(curves[0].curve[0], 0);
  assert.equal(curves[0].curve.at(-1), 0);
});
test('zero strength is silent; retrigger stops previous same pitch; stop cancels all', () => {
  const { audio, oscillators } = engine();
  audio.playNote('C5', 2, 0);
  assert.equal(oscillators.length, 0);
  audio.playNote('C5', 2, 0.8);
  audio.playNote('C5', 0.06, 0.8);
  assert.equal(oscillators[0].stops.at(-1), undefined);
  assert.equal(oscillators[1].stops[0], 10.06);
  audio.stopAll();
  assert.equal(oscillators[1].stops.at(-1), undefined);
});
