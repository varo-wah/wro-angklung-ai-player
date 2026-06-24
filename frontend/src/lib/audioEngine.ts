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

  playNote(note: string, durationSeconds: number, strength: number) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.context ??= new AudioContextClass();

    const frequency = noteToFrequency(note);
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const toneDuration = Math.max(0.08, Math.min(durationSeconds, 1.4));
    const level = Math.max(0.02, Math.min(strength, 1)) * 0.22;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + toneDuration);

    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + toneDuration + 0.04);
  }
}

export function noteToFrequency(note: string): number {
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

  const semitonesFromA4 = semitoneOffset + (octave - 4) * 12;
  return 440 * 2 ** (semitonesFromA4 / 12);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
