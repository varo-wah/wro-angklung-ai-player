/** One interactive voice session per origin, shared by Guest and Voice Mode tabs. */
export class VoiceSessionLease {
  private releaseLock: (() => void) | null = null;
  private acquiring: Promise<void> | null = null;
  private revision = 0;

  acquire(): Promise<void> {
    if (this.releaseLock) return Promise.resolve();
    if (this.acquiring) return this.acquiring;
    if (!navigator.locks) return Promise.reject(new Error("Voice needs a browser with secure microphone access. Open this page on localhost or HTTPS in a current browser."));
    const revision = this.revision;
    this.acquiring = new Promise<void>((resolve, reject) => {
      void navigator.locks.request("angklobot-voice-session", { ifAvailable: true }, async lock => {
        if (!lock) { reject(new Error("Voice is active in another Angklobot tab. Turn it off there first.")); return; }
        if (revision !== this.revision) { reject(new Error("Voice session cancelled.")); return; }
        await new Promise<void>(release => { this.releaseLock = release; resolve(); });
      }).catch(reject);
    }).finally(() => { this.acquiring = null; });
    return this.acquiring;
  }

  release(): void {
    ++this.revision;
    this.releaseLock?.();
    this.releaseLock = null;
  }
}
