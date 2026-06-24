import type { ActuatorCommand } from "./types";

type PlaybackCallbacks = {
  onCommand: (command: ActuatorCommand) => void;
  onTimeUpdate: (elapsedSeconds: number) => void;
  onComplete: () => void;
};

export class PlaybackEngine {
  private timers: number[] = [];
  private startedAtMs = 0;
  private elapsedBeforeStartMs = 0;
  private frameId: number | null = null;

  constructor(
    private readonly commands: ActuatorCommand[],
    private readonly totalDurationSeconds: number,
    private readonly callbacks: PlaybackCallbacks,
  ) {}

  play(fromSeconds: number) {
    this.clearTimers();
    this.elapsedBeforeStartMs = fromSeconds * 1000;
    this.startedAtMs = performance.now();
    const fromMs = fromSeconds * 1000;

    for (const command of this.commands) {
      const commandMs = command.start_time_seconds * 1000;
      if (commandMs < fromMs) {
        continue;
      }

      const timer = window.setTimeout(() => {
        this.callbacks.onCommand(command);
      }, commandMs - fromMs);
      this.timers.push(timer);
    }

    const completeMs = Math.max(0, this.totalDurationSeconds * 1000 - fromMs);
    this.timers.push(
      window.setTimeout(() => {
        this.callbacks.onTimeUpdate(this.totalDurationSeconds);
        this.callbacks.onComplete();
      }, completeMs),
    );

    this.tick();
  }

  pause(): number {
    const elapsedMs = this.currentElapsedMs();
    this.clearTimers();
    this.stopFrame();
    return elapsedMs / 1000;
  }

  stop() {
    this.clearTimers();
    this.stopFrame();
    this.elapsedBeforeStartMs = 0;
    this.callbacks.onTimeUpdate(0);
  }

  private tick() {
    this.callbacks.onTimeUpdate(Math.min(this.currentElapsedMs() / 1000, this.totalDurationSeconds));
    this.frameId = window.requestAnimationFrame(() => this.tick());
  }

  private currentElapsedMs(): number {
    return this.elapsedBeforeStartMs + performance.now() - this.startedAtMs;
  }

  private clearTimers() {
    for (const timer of this.timers) {
      window.clearTimeout(timer);
    }
    this.timers = [];
  }

  private stopFrame() {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
}
