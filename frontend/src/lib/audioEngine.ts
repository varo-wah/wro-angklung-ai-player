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

  async ensureReady(): Promise<void> {
    const context = this.getContext();
    if (context.state === "suspended") {
      await context.resume();
    }
  }

  playNote(note: string, durationSeconds: number, strength: number) {
    const context = this.getContext();

    const frequency = noteToFrequency(note);
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const toneDuration = Math.max(0.08, Math.min(durationSeconds, 1.4));
    const level = Math.max(0.02, Math.min(strength, 1)) * 0.22;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + toneDuration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + toneDuration + 0.04);
  }

  private getContext(): AudioContext {
    if (this.context?.state === "closed") {
      this.context = null;
    }

    if (!this.context) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio is not supported in this browser.");
      }
      this.context = new AudioContextClass();
    }

    return this.context;
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
