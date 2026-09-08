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
  private intervalId: number | null = null;
  private pcmChunks: Float32Array[] = [];
  private pcmSampleRate = 0;
  private processor: ScriptProcessorNode | null = null;
  private rejectRecording: ((reason: Error) => void) | null = null;
  private resolveRecording: ((recording: Blob) => void) | null = null;
  private speechDetected = false;
  private stream: MediaStream | null = null;
  private cancelled = false;

  async recordUntilSilence(options: { maxRecordingMs?: number; silenceDurationMs?: number } = {}): Promise<Blob> {
    if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === "undefined") {
      throw new VoiceCaptureError("Voice input is not supported by this browser.", "unsupported");
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (this.cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        throw new VoiceCaptureError("Voice capture cancelled.", "cancelled");
      }
      this.stream = stream;
    } catch (error) {
      if (error instanceof VoiceCaptureError) throw error;
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new VoiceCaptureError("Microphone permission was denied. Allow microphone access in your browser and try again.", "permission_denied");
      }
      if (name === "NotFoundError") {
        throw new VoiceCaptureError("No microphone was detected.", "no_microphone");
      }
      throw new VoiceCaptureError("Your browser could not start the microphone.", "recording_failed");
    }

    try {
      this.pcmChunks = [];
      this.speechDetected = false;

      const AudioContextConstructor = window.AudioContext;
      this.audioContext = new AudioContextConstructor();
      await this.audioContext.resume();
      if (this.cancelled) throw new VoiceCaptureError("Voice capture cancelled.", "cancelled");
      const source = this.audioContext.createMediaStreamSource(this.stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.pcmSampleRate = this.audioContext.sampleRate;
      this.processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        this.pcmChunks.push(new Float32Array(input));
        event.outputBuffer.getChannelData(0).fill(0);
      };
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      const samples = new Float32Array(analyser.fftSize);
      const startedAt = performance.now();
      let lastSpeechAt = startedAt;

      return await new Promise<Blob>((resolve, reject) => {
        this.rejectRecording = reject;
        this.resolveRecording = resolve;
        this.stream!.getTracks().forEach((track) => {
          track.onended = () => {
            const pendingReject = this.rejectRecording;
            this.rejectRecording = null;
            this.resolveRecording = null;
            this.cancel();
            pendingReject?.(new VoiceCaptureError("Microphone access ended. Check permission and input device.", "recording_failed"));
          };
        });

        this.intervalId = window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          const rms = calculateRms(samples);
          const now = performance.now();
          if (rms >= SILENCE_THRESHOLD) {
            this.speechDetected = true;
            lastSpeechAt = now;
          }
          if ((this.speechDetected && now - lastSpeechAt >= (options.silenceDurationMs ?? SILENCE_DURATION_MS)) || now - startedAt >= (options.maxRecordingMs ?? MAX_RECORDING_MS)) {
            this.stop();
          }
        }, 100);
      });
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  stop(): void {
    const resolve = this.resolveRecording;
    const reject = this.rejectRecording;
    if (!resolve || !reject) return;
    this.resolveRecording = null;
    this.rejectRecording = null;
    const heardSpeech = this.speechDetected;
    const recording = heardSpeech ? encodeCapturedPcm(this.pcmChunks, this.pcmSampleRate, 16000) : null;
    this.cleanup();
    if (!recording || recording.size === 0) {
      reject(new VoiceCaptureError("I did not hear any speech. Please try again.", "no_speech"));
      return;
    }
    resolve(recording);
  }

  cancel(): void {
    this.cancelled = true;
    const reject = this.rejectRecording;
    this.resolveRecording = null;
    this.rejectRecording = null;
    this.cleanup();
    reject?.(new VoiceCaptureError("Voice capture cancelled.", "cancelled"));
  }

  private cleanup(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.stream = null;
    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close();
    }
    this.audioContext = null;
    this.pcmChunks = [];
    this.pcmSampleRate = 0;
    this.rejectRecording = null;
    this.resolveRecording = null;
  }
}

export async function transcribeVoiceRecording(blob: Blob, language: VoiceLanguage, signal?: AbortSignal, purpose?: "wake"): Promise<string> {
  const wavBlob = blob.type === "audio/wav" || blob.type === "audio/x-wav" ? blob : await convertRecordingToWav(blob);
  const formData = new FormData();
  formData.append("audio", wavBlob, "angklobot-voice.wav");
  formData.append("language", language);
  if (purpose) formData.append("purpose", purpose);

  const response = await fetch("/api/speech/transcribe", {
    body: formData,
    method: "POST",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as { error?: unknown; text?: unknown } | null;
  if (!response.ok) {
    if (response.status === 422) throw new VoiceCaptureError("No speech was recognized. Please try again.", "no_speech");
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
    throw new Error("Your browser recorded audio in a format that could not be decoded.");
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

function encodeCapturedPcm(chunks: Float32Array[], sourceRate: number, targetRate: number): Blob | null {
  const sourceLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (sourceLength === 0 || sourceRate <= 0) return null;
  const source = new Float32Array(sourceLength);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk, offset);
    offset += chunk.length;
  }

  const outputLength = Math.max(1, Math.round((source.length * targetRate) / sourceRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = outputIndex * ratio;
    const lowerIndex = Math.min(source.length - 1, Math.floor(sourcePosition));
    const upperIndex = Math.min(source.length - 1, lowerIndex + 1);
    const fraction = sourcePosition - lowerIndex;
    output[outputIndex] = source[lowerIndex] + (source[upperIndex] - source[lowerIndex]) * fraction;
  }
  return new Blob([encodePcm16Wav(output, targetRate)], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
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
