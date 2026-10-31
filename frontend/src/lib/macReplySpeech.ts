import { speakVoiceResponse, stopSpeaking, type VoiceLanguage } from './voice';

/** One Mac reply at a time, with a bounded wait even if browser TTS never finishes. */
export class MacReplySpeech {
  private finish: ((completed: boolean) => void) | null = null;
  cancel() {
    if (!this.finish) return;
    this.finish(false);
    stopSpeaking();
  }
  speak(text: string | null, language: VoiceLanguage): Promise<boolean> {
    this.cancel();
    if (!text?.trim()) return Promise.resolve(true);
    return new Promise(resolve => {
      const finish = (completed: boolean) => {
        if (this.finish !== finish) return;
        this.finish = null; clearTimeout(timer); resolve(completed);
      };
      const timer = setTimeout(() => { finish(true); stopSpeaking(); }, 10000);
      this.finish = finish;
      try {
        if (!speakVoiceResponse(text, language, { onStart() {}, onEnd: () => finish(true) })) finish(true);
      } catch { finish(true); }
    });
  }
}
