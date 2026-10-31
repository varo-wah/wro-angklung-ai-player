import type { Point } from './gestures';

export type HandFrame = { timestamp: number; inferenceMs: number; landmarks: Point[][] };
type CameraEnvironment = {
  getMedia: (deviceId?: string) => Promise<MediaStream>;
  createWorker: () => Worker;
  bitmap: (video: HTMLVideoElement) => Promise<ImageBitmap>;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
};
const browserEnvironment: CameraEnvironment = {
  getMedia: deviceId => navigator.mediaDevices.getUserMedia({ audio: false, video: {
    width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  } }),
  createWorker: () => new Worker('/vision/hand-worker.js'),
  bitmap: video => createImageBitmap(video),
  requestFrame: callback => requestAnimationFrame(callback),
  cancelFrame: handle => cancelAnimationFrame(handle), now: () => performance.now(),
};

/** Owns every track, worker and frame; late permission results cannot resurrect a stopped session. */
export class HandCamera {
  private epoch = 0;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private animation = 0;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private video: HTMLVideoElement | null = null;
  constructor(private readonly onFrame: (frame: HandFrame) => void,
    private readonly onError: (message: string) => void,
    private readonly environment: CameraEnvironment = browserEnvironment) {}

  async start(video: HTMLVideoElement, deviceId?: string): Promise<boolean> {
    this.stop();
    const epoch = this.epoch;
    try {
      const stream = await this.environment.getMedia(deviceId);
      if (epoch !== this.epoch) { stream.getTracks().forEach(track => track.stop()); return false; }
      this.stream = stream; this.video = video; video.srcObject = stream;
      for (const track of stream.getVideoTracks()) track.onended = () => this.fail('The camera disconnected.', epoch);
      await video.play();
      if (epoch !== this.epoch) return false;
      const worker = this.environment.createWorker(); this.worker = worker;
      let busy = false; let lastVideoTime = -1; let lastSent = -Infinity;
      const loop = (now: number) => {
        if (epoch !== this.epoch) return;
        this.animation = this.environment.requestFrame(loop);
        if (busy || now - lastSent < 66 || video.readyState < 2 || video.currentTime === lastVideoTime) return;
        busy = true; lastSent = now; lastVideoTime = video.currentTime;
        this.armTimeout('Hand tracking stopped responding. Restart the camera.', epoch, 2000);
        void this.environment.bitmap(video).then(bitmap => {
          if (epoch !== this.epoch) { bitmap.close(); return; }
          worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
        }).catch(() => this.fail('Could not read a camera frame.', epoch));
      };
      worker.onerror = () => this.fail('Hand tracking could not start. Check local vision assets and restart.', epoch);
      worker.onmessage = ({ data }) => {
        if (epoch !== this.epoch) return;
        if (data.type === 'ready') {
          this.clearTimeout(); this.animation = this.environment.requestFrame(loop);
        } else if (data.type === 'result') {
          busy = false; this.clearTimeout();
          this.onFrame(data as HandFrame);
        } else if (data.type === 'error') this.fail('Hand tracking failed. Restart the camera or reload the page.', epoch);
      };
      this.armTimeout('The local hand model did not start. Restart the camera.', epoch, 20000);
      worker.postMessage({ type: 'init' });
      return true;
    } catch (error) {
      if (epoch !== this.epoch) return false;
      const denied = error instanceof Error && error.name === 'NotAllowedError';
      this.fail(denied ? 'Camera permission was denied. Allow the camera in browser settings, then try again.'
        : 'The camera could not be opened. Check its connection and close other apps using it.', epoch);
      return false;
    }
  }

  stop(): void {
    ++this.epoch; this.environment.cancelFrame(this.animation); this.clearTimeout();
    this.worker?.terminate(); this.worker = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); this.stream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; this.video = null; }
  }
  private clearTimeout() { if (this.timeout) clearTimeout(this.timeout); this.timeout = null; }
  private armTimeout(message: string, epoch: number, ms: number) {
    this.clearTimeout(); this.timeout = setTimeout(() => this.fail(message, epoch), ms);
  }
  private fail(message: string, epoch: number) {
    if (epoch !== this.epoch) return;
    this.stop(); this.onError(message);
  }
}
