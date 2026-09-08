import { BrowserVoiceRecorder, transcribeVoiceRecording, VoiceCaptureError } from "@/lib/voice";

/** Match the whole utterance, never a substring of a longer command or conversation. */
export function matchesWakePhrase(transcript: string): boolean {
  const normalized = transcript.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ").trim().replace(/\s+/g, " ");
  const words = normalized.split(" ");
  if (words[0] === "hey") words.shift();
  const name = words.join("");
  // Up to two transcription edits, with a recognizable beginning and ending.
  if (!name.startsWith("ang") || !name.endsWith("bot") || name.length < 7 || name.length > 11) return false;
  const target = "angklobot";
  let previous = Array.from({ length: target.length + 1 }, (_, i) => i);
  for (let i = 0; i < name.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < target.length; j++) {
      row.push(Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + Number(name[i] !== target[j])));
    }
    previous = row;
  }
  return previous[target.length] <= 2;
}

/** One browser microphone owner and one local Whisper request at a time. */
export class WhisperWakeListener {
  private generation = 0;
  private closed = false;
  private running: Promise<void> | null = null;
  private recorder: BrowserVoiceRecorder | null = null;
  private request: AbortController | null = null;

  constructor(private onWake: () => void, private onError: (error: unknown) => void, private onTranscript?: (text: string) => void) {}

  async arm(): Promise<void> {
    if (this.closed) throw new Error("Wake listening has stopped. Enable it again to restart.");
    if (this.running) return;
    const generation = ++this.generation;
    const running = this.listen(generation);
    this.running = running;
    void running.then(() => { if (this.running === running) this.running = null; });
  }

  async suspend(): Promise<void> {
    ++this.generation;
    this.recorder?.cancel();
    this.request?.abort();
    // Includes late permission grants and WAV conversion, so the command never overlaps.
    await this.running;
  }

  async disable(): Promise<void> {
    this.closed = true;
    await this.suspend();
  }

  close(): void { void this.disable(); }

  private async listen(generation: number): Promise<void> {
    const current = () => !this.closed && generation === this.generation;
    try {
      while (current()) {
        try {
          this.recorder = new BrowserVoiceRecorder();
          const audio = await this.recorder.recordUntilSilence({ maxRecordingMs: 4000, silenceDurationMs: 650 });
          this.recorder = null; // Recorder releases the microphone before resolving.
          if (!current()) return;
          this.request = new AbortController();
          const transcript = await transcribeVoiceRecording(audio, "en", this.request.signal, "wake");
          this.request = null;
          if (!current()) return; // A cancelled/stale transcription must never activate capture.
          this.onTranscript?.(transcript);
          if (matchesWakePhrase(transcript)) {
            ++this.generation; // Consume the detection; only explicit re-arm can listen again.
            this.onWake();
            return;
          }
        } catch (caught) {
          if (!current()) return;
          if (!(caught instanceof VoiceCaptureError && caught.code === "no_speech")) throw caught;
          // Silent segments are discarded by the recorder without calling Whisper.
        }
      }
    } catch (caught) {
      if (current()) { ++this.generation; this.onError(caught); }
    } finally {
      this.recorder?.cancel();
      this.recorder = null;
      this.request?.abort();
      this.request = null;
    }
  }
}
