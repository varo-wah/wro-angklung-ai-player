"use client";

import { useEffect, useRef, useState } from 'react';
import { useStudio } from '../studio/runtime/useStudio';
import { HandCamera, type HandFrame } from './camera';
import { SIGNS, NOTES, GestureGate, calibrationReady, handFeatures, recognize, type Recognition, type Samples, type Sign } from './gestures';

const EDGES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

export function ConductView() {
  const { snapshot, actions } = useStudio();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLElement>(null);
  const camera = useRef<HandCamera | null>(null);
  const frame = useRef<HandFrame | null>(null);
  const gate = useRef(new GestureGate());
  const [status, setStatus] = useState<'idle' | 'starting' | 'tracking'>('idle');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState('');
  const [samples, setSamples] = useState<Samples>({});
  const [lowY, setLowY] = useState<number | null>(null);
  const [highY, setHighY] = useState<number | null>(null);
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [handCount, setHandCount] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const current = useRef({ samples, lowY, highY });
  current.current = { samples, lowY, highY };
  const ready = calibrationReady(samples, lowY, highY);
  const captured = SIGNS.filter(sign => (samples[sign]?.length ?? 0) >= 3).length;

  useEffect(() => {
    actions.setInputMode('conduct');
    const clear = () => {
      frame.current = null; gate.current = new GestureGate();
      actions.stop(); setRecognition(null); setHandCount(0); setLatency(null);
      const context = canvas.current?.getContext('2d');
      if (context && canvas.current) context.clearRect(0, 0, canvas.current.width, canvas.current.height);
    };
    const session = new HandCamera(result => {
      // Ignore results captured too long ago, even if the worker returns successfully.
      if (performance.now() - result.timestamp > 350) { clear(); return; }
      frame.current = result; setStatus('tracking'); setHandCount(result.landmarks.length);
      setLatency(result.inferenceMs);
      const target = canvas.current; const source = video.current;
      const context = target?.getContext('2d');
      if (target && context && source) {
        target.width = source.videoWidth || 640; target.height = source.videoHeight || 480;
        context.clearRect(0, 0, target.width, target.height);
        for (const hand of result.landmarks) {
          context.strokeStyle = '#dbe6a8'; context.lineWidth = 3;
          for (const [a,b] of EDGES) {
            context.beginPath(); context.moveTo(hand[a].x * target.width, hand[a].y * target.height);
            context.lineTo(hand[b].x * target.width, hand[b].y * target.height); context.stroke();
          }
          context.fillStyle = '#fff8dc';
          for (const point of hand) { context.beginPath(); context.arc(point.x * target.width, point.y * target.height, 4, 0, Math.PI * 2); context.fill(); }
        }
      }
      const config = current.current;
      const detected = result.landmarks.length === 1 ? recognize(result.landmarks[0], config.samples, config.lowY, config.highY) : null;
      setRecognition(detected);
      if (!detected) actions.silenceConductPreview();
      const note = gate.current.update(detected?.note ?? null, result.timestamp);
      if (note) actions.previewConductNote(note);
    }, message => { clear(); setStatus('idle'); setError(message); });
    camera.current = session;
    const halt = () => { session.stop(); clear(); setStatus('idle'); };
    const visibility = () => { if (document.hidden) halt(); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') halt(); };
    const watchdog = setInterval(() => {
      if (frame.current && performance.now() - frame.current.timestamp > 350) clear();
    }, 100);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('pagehide', halt);
    return () => {
      session.stop(); clearInterval(watchdog); camera.current = null;
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('keydown', keyboard); window.removeEventListener('pagehide', halt);
      actions.setInputMode('player');
    };
  }, [actions]);

  async function start() {
    setError(''); setNotice(''); actions.stop(); gate.current = new GestureGate();
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError('Open Studio on localhost or HTTPS in a browser with camera access.'); return;
    }
    if (!video.current || !camera.current) return;
    const session = camera.current;
    setStatus('starting');
    const started = await session.start(video.current, device || undefined);
    if (started && camera.current === session) {
      try { setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')); }
      catch { /* The default camera remains usable without enumeration permission. */ }
    }
  }

  function stop() {
    camera.current?.stop(); actions.stop(); frame.current = null; gate.current = new GestureGate();
    setStatus('idle'); setRecognition(null); setHandCount(0); setLatency(null);
    const target = canvas.current; if (target) target.getContext('2d')?.clearRect(0, 0, target.width, target.height);
  }

  function usableHand() {
    const result = frame.current;
    if (!result || result.landmarks.length !== 1 || performance.now() - result.timestamp > 350) {
      setNotice('Show exactly one hand clearly before capturing a sample.'); return null;
    }
    return result.landmarks[0];
  }

  function capture(sign: Sign) {
    const hand = usableHand(); if (!hand) return;
    const features = handFeatures(hand); if (!features) { setNotice('Move closer so your hand is clear.'); return; }
    actions.stop(); gate.current = new GestureGate(); setRecognition(null);
    setSamples(previous => ({ ...previous, [sign]: [...(previous[sign] ?? []).slice(-11), features] }));
    setNotice(`${sign} sample captured. Use small natural variations for the next sample.`);
  }

  function captureHeight(upper: boolean) {
    const hand = usableHand(); if (!hand) return;
    actions.stop(); gate.current = new GestureGate();
    if (upper) setHighY(hand[0].y); else setLowY(hand[0].y);
    setNotice(`${upper ? 'Upper' : 'Lower'} Do position saved.`);
  }

  function exportSamples() {
    const blob = new Blob([JSON.stringify({ version: 1, purpose: 'personal-conduct-preview', signs: SIGNS,
      samples, lowDoY: lowY, highDoY: highY, notes: NOTES, camera: video.current?.videoWidth
        ? { width: video.current.videoWidth, height: video.current.videoHeight } : null }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'angklobot-conduct-samples.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="conduct-view">
    <header className="conduct-heading"><div><p className="conduct-eyebrow">PLAY WITH YOUR HANDS</p>
      <h1>Conduct Angklobot</h1><p>A camera, your hand signs, and a little practice.</p></div>
      <div className="conduct-heading-actions"><span className="conduct-pill">Sound preview · motors disabled</span>
        <div className="conduct-buttons"><button className="conduct-primary" disabled={status !== 'idle'} onClick={() => void start()}>Start camera</button>
          <button className="conduct-stop" disabled={status === 'idle' && !snapshot.conductReady} onClick={stop}>Stop camera &amp; sound</button></div></div></header>
    <div className="conduct-grid">
      <section className="conduct-stage" ref={stage} aria-label="Conducting display">
        <div className="conduct-stage-bar"><span><i className={status === 'tracking' ? 'is-live' : ''} />{status === 'idle' ? 'Camera off' : status === 'starting' ? 'Opening camera and hand model…' : 'Live hand tracking'}</span>
          <button onClick={() => { void stage.current?.requestFullscreen?.().catch(() => setError('Fullscreen is unavailable in this browser.')); }}>Full screen ↗</button></div>
        <div className="conduct-camera">
          <video ref={video} autoPlay muted playsInline aria-label="Mirrored camera preview" />
          <canvas ref={canvas} aria-hidden="true" />
          {status === 'idle' && <div className="conduct-camera-empty"><span aria-hidden="true">✋</span><h2>Your stage is ready.</h2><p>Connect a camera and place your hand in view.</p></div>}
          {status !== 'idle' && <span className="conduct-camera-tag">{handCount === 1 ? 'One hand in view' : handCount > 1 ? 'Show one hand to conduct' : 'Waiting for a hand'}</span>}
        </div>
        <div className="conduct-note"><div><span>RECOGNIZED SIGN</span><strong>{recognition?.sign ?? '—'}</strong></div>
          <div><span>SELECTED NOTE</span><strong>{recognition?.note ?? '—'}</strong></div>
          <p>{snapshot.conductReady ? (snapshot.preferences.muted ? 'Sound preview muted' : 'Sound preview enabled') : ready ? 'Ready for sound preview' : 'Capture your signs to begin'}<small>{latency === null ? 'Local processing on your Mac' : `${Math.round(latency)} ms inference · camera-to-sound delay not measured`}</small></p></div>
        <div className="conduct-note-strip">{[...SIGNS, 'Do′'].map((sign, i) => <span key={`${sign}-${i}`} className={recognition?.note === NOTES[i] ? 'active' : ''}>{sign}<small>{NOTES[i]}</small></span>)}</div>
      </section>
      <aside className="conduct-controls">
        <section className="conduct-card"><p className="conduct-eyebrow">01 / CAMERA</p><h2>Connect your view</h2>
          <label htmlFor="conduct-camera-device">Camera</label><select id="conduct-camera-device" value={device} disabled={status !== 'idle'} onChange={event => setDevice(event.target.value)}>
            <option value="">Default camera</option>{devices.map((item, i) => <option key={item.deviceId} value={item.deviceId}>{item.label || `Camera ${i + 1}`}</option>)}</select>
          <p>Keep your position fixed and your fingers visible. Camera images stay on this Mac.</p></section>
        <section className="conduct-card"><p className="conduct-eyebrow">02 / YOUR HAND SIGNS</p><h2>Personal calibration <small>{captured}/7</small></h2>
          <p>Use the same hand. Capture at least three examples of each sign, varying the pose slightly.</p>
          <div className="conduct-signs">{SIGNS.map(sign => <button key={sign} disabled={status !== 'tracking' || handCount !== 1} onClick={() => capture(sign)}><strong>{sign}</strong><span>{samples[sign]?.length ?? 0} / 3</span></button>)}</div>
          <div className="conduct-heights"><button disabled={status !== 'tracking' || handCount !== 1} onClick={() => captureHeight(false)}>Set lower Do {lowY !== null ? '✓' : ''}</button>
            <button disabled={status !== 'tracking' || handCount !== 1} onClick={() => captureHeight(true)}>Set upper Do {highY !== null ? '✓' : ''}</button></div>
          {lowY !== null && highY !== null && lowY - highY < 0.15 && <p className="conduct-warning">Place upper Do clearly above lower Do, then capture both positions again.</p>}
          {notice && <p role="status">{notice}</p>}
          <div className="conduct-small-actions"><button disabled={!Object.keys(samples).length} onClick={exportSamples}>Export samples</button><button onClick={() => { actions.stop(); setSamples({}); setLowY(null); setHighY(null); setRecognition(null); gate.current = new GestureGate(); setNotice('Calibration cleared.'); }}>Clear calibration</button></div>
          <p className="conduct-fine">Samples stay in this tab until exported. This personal prototype needs testing across people and camera positions.</p></section>
        <section className="conduct-card"><p className="conduct-eyebrow">03 / LISTEN</p><h2>Try a phrase</h2>
          <button className="conduct-primary conduct-wide" disabled={!ready || status !== 'tracking' || snapshot.conductReady} onClick={() => { gate.current = new GestureGate(); void actions.enableConductPreview(); }}>Enable sound preview</button>
          <p>A settled sign plays one short note. Release your sign briefly to repeat it. Unknown poses stay silent.</p>
          <p className="conduct-fine">Song playback is paused while this mode is open. Stop or Escape releases the camera and sound.</p></section>
      </aside>
    </div>
    {error && <div className="conduct-error" role="alert">{error}</div>}
  </div>;
}
