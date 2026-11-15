import type { HandFrame } from "./camera";
import type { Recognition } from "./gestures";

export type YoloFrame = HandFrame & { recognition: Recognition | null; message: string };

/** One in-flight local inference; stop aborts requests and invalidates late frames. */
export class YoloCamera {
  private epoch = 0;
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: AbortController | null = null;
  private video: HTMLVideoElement | null = null;
  constructor(private onFrame: (frame: YoloFrame) => void, private onError: (message: string) => void) {}
  async start(video: HTMLVideoElement, deviceId?: string) {
    this.stop();
    const epoch = this.epoch;
    try {
      if (!["localhost", "127.0.0.1"].includes(location.hostname))
        throw new Error("Open Conduct on the Mac at localhost; camera frames stay on that Mac.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        width: { ideal: 640 }, height: { ideal: 480 }, ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      } });
      if (epoch !== this.epoch) { stream.getTracks().forEach(track => track.stop()); return false; }
      this.stream = stream; this.video = video; video.srcObject = stream;
      stream.getVideoTracks().forEach(track => { track.onended = () => this.fail("Camera disconnected.", epoch); });
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const context = canvas.getContext("2d")!;
      const tick = async () => {
        if (epoch !== this.epoch) return;
        try {
          const timestamp = performance.now();
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .75));
          if (epoch !== this.epoch || !blob) return;
          this.request = new AbortController();
          const response = await fetch("/api/conduct/frame", { method: "POST", body: blob, headers: { "Content-Type": "image/jpeg" }, signal: this.request.signal });
          const result = await response.json();
          if (epoch !== this.epoch) return;
          if (!response.ok) throw new Error(result.error || "YOLO inference failed.");
          this.onFrame({ ...result, timestamp });
          this.timer = setTimeout(() => void tick(), 80);
        } catch (error) { if (epoch === this.epoch) this.fail(error instanceof Error ? error.message : "Camera inference failed.", epoch); }
      };
      if (epoch !== this.epoch) return false;
      void tick();
      return true;
    } catch (error) {
      if (epoch === this.epoch) this.fail(error instanceof Error ? error.message : "Camera unavailable.", epoch);
      return false;
    }
  }
  stop() {
    ++this.epoch;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.request?.abort(); this.request = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); this.stream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; this.video = null; }
  }
  private fail(message: string, epoch: number) {
    if (epoch !== this.epoch) return;
    this.stop(); this.onError(message);
  }
}
