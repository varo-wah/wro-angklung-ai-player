const NOTE_OFFSETS: Record<string, number> = {
  C: -9,
  "C#": -8,
  Db: -8,
  D: -7,
  "D#": -6,
  Eb: -6,
  E: -5,
  F: -4,
  "F#": -3,
  Gb: -3,
  G: -2,
  "G#": -1,
  Ab: -1,
  A: 0,
  "A#": 1,
  Bb: 1,
  B: 2,
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private toneCache = new Map<string, string>();
  private useHtmlAudioFallback = false;
  private activeOscillators = new Set<OscillatorNode>();
  private activeHtmlAudio = new Set<HTMLAudioElement>();
  private noteVoices = new Map<string, () => void>();

  async ensureReady(): Promise<void> {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) {
      this.useHtmlAudioFallback = true;
      await this.playHtmlTone(440, 0.03, 0.001);
      return;
    }

    const context = this.getContext(AudioContextClass);
    if (context.state === "suspended") {
      await context.resume();
    }
    this.playUnlockPulse(context);
    if (context.state === "suspended") {
      throw new Error("Browser audio is still suspended. Click Play again or check browser audio permissions.");
    }
  }

  playNote(note: string, durationSeconds: number, strength: number) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(strength)) return;
    this.noteVoices.get(note)?.();
    this.noteVoices.delete(note);
    const frequency = noteToFrequency(note);
    const toneDuration = durationSeconds;
    const level = Math.max(0, Math.min(strength, 1)) * 0.12;
    if (level === 0) return;

    if (this.useHtmlAudioFallback) {
      void this.playHtmlTone(frequency, toneDuration, level, note);
      return;
    }

    const context = this.getContext();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    // A shaken instrument continues sounding while driven, rather than decaying
    // like a struck bell. Keep gain proportional to command strength.
    const curve = createShakeEnvelope(toneDuration, level);
    gain.gain.setValueCurveAtTime(curve, now, toneDuration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    const stop = () => { try { oscillator.stop(); } catch { /* Already ended. */ } };
    this.noteVoices.set(note, stop);
    this.activeOscillators.add(oscillator);
    oscillator.addEventListener("ended", () => {
      this.activeOscillators.delete(oscillator);
      if (this.noteVoices.get(note) === stop) this.noteVoices.delete(note);
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
    oscillator.start(now);
    oscillator.stop(now + toneDuration);
  }

  stopAll(): void {
    for (const oscillator of this.activeOscillators) {
      try {
        oscillator.stop();
      } catch {
        // Oscillators may already have ended; emergency stop remains idempotent.
      }
    }
    this.activeOscillators.clear();
    this.noteVoices.clear();

    for (const audio of this.activeHtmlAudio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // A detached fallback audio element is already silent.
      }
    }
    this.activeHtmlAudio.clear();
  }

  private getContext(AudioContextClass = window.AudioContext ?? window.webkitAudioContext): AudioContext {
    if (this.context?.state === "closed") {
      this.context = null;
    }

    if (!this.context) {
      if (!AudioContextClass) {
        throw new Error("Web Audio is not supported in this browser.");
      }
      this.context = new AudioContextClass();
    }

    return this.context;
  }

  private playUnlockPulse(context: AudioContext) {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, now);
    gain.gain.setValueAtTime(0.0001, now);
    oscillator.connect(gain);
    gain.connect(context.destination);
    this.activeOscillators.add(oscillator);
    oscillator.addEventListener("ended", () => this.activeOscillators.delete(oscillator), { once: true });
    oscillator.start(now);
    oscillator.stop(now + 0.02);
  }

  private async playHtmlTone(frequency: number, durationSeconds: number, level: number, note?: string): Promise<void> {
    const audio = new Audio(this.getToneDataUrl(frequency, durationSeconds, level));
    this.activeHtmlAudio.add(audio);
    const stop = () => { audio.pause(); audio.currentTime = 0; this.activeHtmlAudio.delete(audio); };
    if (note) this.noteVoices.set(note, stop);
    audio.addEventListener("ended", () => {
      this.activeHtmlAudio.delete(audio);
      if (note && this.noteVoices.get(note) === stop) this.noteVoices.delete(note);
    }, { once: true });
    try {
      await audio.play();
    } catch (error) {
      this.activeHtmlAudio.delete(audio);
      throw error;
    }
  }

  private getToneDataUrl(frequency: number, durationSeconds: number, level: number): string {
    const key = `${frequency}-${durationSeconds}-${level}`;
    const cached = this.toneCache.get(key);
    if (cached) {
      return cached;
    }

    const dataUrl = createToneDataUrl(frequency, durationSeconds, level);
    if (this.toneCache.size >= 128) this.toneCache.delete(this.toneCache.keys().next().value!);
    this.toneCache.set(key, dataUrl);
    return dataUrl;
  }
}

export function shakeEnvelopeAt(time: number, duration: number): number {
  const fade = Math.min(0.015, duration / 4);
  const edge = Math.max(0, Math.min(1, time / fade, (duration - time) / fade));
  return edge * (0.88 + 0.12 * Math.cos(2 * Math.PI * 16 * time));
}

export function createShakeEnvelope(duration: number, level: number): Float32Array {
  const count = Math.max(3, Math.ceil(duration * 200) + 1);
  return Float32Array.from({ length: count }, (_, i) => level * shakeEnvelopeAt(i * duration / (count - 1), duration));
}

function createToneDataUrl(frequency: number, durationSeconds: number, level: number): string {
  const sampleRate = 22050;
  const sampleCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);

  writeString(bytes, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeString(bytes, 8, "WAVE");
  writeString(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(bytes, 36, "data");
  view.setUint32(40, sampleCount * 2, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const envelope = shakeEnvelopeAt(time, durationSeconds);
    const triangle = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * frequency * time));
    const sample = triangle * level * envelope;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:audio/wav;base64,${window.btoa(binary)}`;
}

function writeString(bytes: Uint8Array, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    bytes[offset + index] = text.charCodeAt(index);
  }
}

export function noteToFrequency(note: string, octaveShift = 0): number {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note.trim());
  if (!match) {
    return 440;
  }

  const [, pitchClass, octaveText] = match;
  const octave = Number(octaveText);
  const semitoneOffset = NOTE_OFFSETS[pitchClass];
  if (semitoneOffset === undefined || !Number.isFinite(octave)) {
    return 440;
  }

  const semitonesFromA4 = semitoneOffset + (octave + octaveShift - 4) * 12;
  return 440 * 2 ** (semitonesFromA4 / 12);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
