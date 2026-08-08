export type VoiceLanguage = "en" | "id";

export type VoiceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

export const VOICE_LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  en: "English",
  id: "Bahasa Indonesia",
};

const LANGUAGE_TAGS: Record<VoiceLanguage, string> = {
  en: "en-US",
  id: "id-ID",
};

const SILENCE_THRESHOLD = 0.025;
const SILENCE_DURATION_MS = 1200;
const MAX_RECORDING_MS = 15000;

export class VoiceCaptureError extends Error {
  constructor(
    message: string,
    readonly code: "unsupported" | "permission_denied" | "no_microphone" | "no_speech" | "cancelled" | "recording_failed",
  ) {
    super(message);
    this.name = "VoiceCaptureError";
  }
}

export class BrowserVoiceRecorder {
  private audioContext: AudioContext | null = null;
  private chunks: Blob[] = [];
  private intervalId: number | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private rejectRecording: ((reason: Error) => void) | null = null;
  private speechDetected = false;
  private stream: MediaStream | null = null;

  async recordUntilSilence(): Promise<Blob> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new VoiceCaptureError("Voice input is not supported by this browser.", "unsupported");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new VoiceCaptureError("Microphone permission was denied. Allow microphone access in Safari and try again.", "permission_denied");
      }
      if (name === "NotFoundError") {
        throw new VoiceCaptureError("No microphone was detected.", "no_microphone");
      }
      throw new VoiceCaptureError("Safari could not start the microphone.", "recording_failed");
    }

    const mimeType = selectRecordingMimeType();
    this.mediaRecorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.speechDetected = false;

    const AudioContextConstructor = window.AudioContext;
    this.audioContext = new AudioContextConstructor();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let lastSpeechAt = startedAt;

    return new Promise<Blob>((resolve, reject) => {
      this.rejectRecording = reject;

      this.mediaRecorder!.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.mediaRecorder!.onerror = () => {
        this.cleanup();
        reject(new VoiceCaptureError("The microphone recording failed.", "recording_failed"));
      };
      this.mediaRecorder!.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || mimeType || "audio/mp4" });
        const heardSpeech = this.speechDetected;
        this.cleanup();
        if (!heardSpeech || blob.size === 0) {
          reject(new VoiceCaptureError("I did not hear any speech. Please try again.", "no_speech"));
          return;
        }
        resolve(blob);
      };

      this.mediaRecorder!.start(250);
      this.intervalId = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = calculateRms(samples);
        const now = performance.now();
        if (rms >= SILENCE_THRESHOLD) {
          this.speechDetected = true;
          lastSpeechAt = now;
        }
        if ((this.speechDetected && now - lastSpeechAt >= SILENCE_DURATION_MS) || now - startedAt >= MAX_RECORDING_MS) {
          this.stop();
        }
      }, 100);
    });
  }

  stop(): void {
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.stop();
    }
  }

  cancel(): void {
    const reject = this.rejectRecording;
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.cleanup();
    reject?.(new VoiceCaptureError("Voice capture cancelled.", "cancelled"));
  }

  private cleanup(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close();
    }
    this.audioContext = null;
    this.mediaRecorder = null;
    this.rejectRecording = null;
  }
}

export async function transcribeVoiceRecording(blob: Blob, language: VoiceLanguage): Promise<string> {
  const wavBlob = await convertRecordingToWav(blob);
  const formData = new FormData();
  formData.append("audio", wavBlob, "angklobot-voice.wav");
  formData.append("language", language);

  const response = await fetch("/api/speech/transcribe", {
    body: formData,
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as { error?: unknown; text?: unknown } | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Local speech transcription is unavailable.");
  }
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) {
    throw new Error("I could not understand that recording. Please try again.");
  }
  return text;
}

export function speakVoiceResponse(
  text: string,
  language: VoiceLanguage,
  callbacks: { onEnd: () => void; onStart: () => void },
): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return null;
  }
  const speechText = text.trim();
  if (!speechText) {
    return null;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speechText);
  const languageTag = LANGUAGE_TAGS[language];
  utterance.lang = languageTag;
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.voice = chooseVoice(window.speechSynthesis.getVoices(), languageTag);
  utterance.onstart = callbacks.onStart;
  utterance.onend = callbacks.onEnd;
  utterance.onerror = callbacks.onEnd;
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

async function convertRecordingToWav(blob: Blob): Promise<Blob> {
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const samples = resampleToMono(decoded, 16000);
    return new Blob([encodePcm16Wav(samples, 16000)], { type: "audio/wav" });
  } catch {
    throw new Error("Safari recorded audio in a format that could not be decoded.");
  } finally {
    await audioContext.close();
  }
}

function resampleToMono(audioBuffer: AudioBuffer, targetRate: number): Float32Array {
  const sourceLength = audioBuffer.length;
  const outputLength = Math.max(1, Math.round((sourceLength * targetRate) / audioBuffer.sampleRate));
  const output = new Float32Array(outputLength);
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) => audioBuffer.getChannelData(index));
  const ratio = audioBuffer.sampleRate / targetRate;

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = outputIndex * ratio;
    const lowerIndex = Math.min(sourceLength - 1, Math.floor(sourcePosition));
    const upperIndex = Math.min(sourceLength - 1, lowerIndex + 1);
    const fraction = sourcePosition - lowerIndex;
    let sample = 0;
    for (const channel of channels) {
      sample += channel[lowerIndex] + (channel[upperIndex] - channel[lowerIndex]) * fraction;
    }
    output[outputIndex] = sample / channels.length;
  }
  return output;
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function selectRecordingMimeType(): string | undefined {
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function calculateRms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

function chooseVoice(voices: SpeechSynthesisVoice[], languageTag: string): SpeechSynthesisVoice | null {
  const exactMatch = voices.find((voice) => voice.lang.toLowerCase() === languageTag.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }
  const baseLanguage = languageTag.split("-")[0].toLowerCase();
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(`${baseLanguage}-`)) ?? voices.find((voice) => voice.default) ?? null;
}
