import { encodeArduinoNoteCommand, type ArduinoConnectionState } from "./arduinoSerial";
import type { RobotTransport } from "./robotTransport";
import type { ActuatorCommand } from "./types";

const ENDPOINT = "/api/robot/wireless";
const MAX_SCHEDULE_NOTES = 4096;

export class Esp32Transport implements RobotTransport {
  private online = false;
  private connecting = false;
  private epoch = 0;
  private scheduleId = 0;
  private heartbeat: ReturnType<typeof setTimeout> | null = null;
  private stopping: Promise<void> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private probing = false;
  private probeTask: Promise<void> | null = null;
  private playing = false;
  private host = "";

  constructor(private readonly publish: (state: ArduinoConnectionState) => void) {}
  get connected() { return this.online; }

  private state(status: ArduinoConnectionState["status"], message: string) {
    this.publish({ status, outputMode: this.online ? "active" : "unknown", message });
  }

  private async request(line: string): Promise<string> {
    const response = await fetch(ENDPOINT, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line }), signal: AbortSignal.timeout(6000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "ESP32 bridge unavailable.");
    if (typeof result.line !== "string") throw new Error("Invalid bridge response.");
    if (result.line.startsWith("ERROR,")) throw new Error(`Mega: ${result.line}`);
    return result.line;
  }

  private async expect(line: string, expected: string) {
    const actual = await this.request(line);
    if (actual !== expected) throw new Error(`Expected ${expected}; received ${actual}.`);
  }

  async connect() {
    if (this.online || this.connecting) return;
    this.connecting = true;
    const epoch = ++this.epoch;
    this.state("connecting", "Connecting to ESP32 over Wi-Fi…");
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      const config = await response.json();
      if (!response.ok) throw new Error(config.error || "Start the local Wi-Fi website server.");
      this.host = config.host;
      await this.expect("HELLO,1", "READY,1,ACTIVE");
      await this.expect("SCHED,CAPS", "SCHED,1,4096");
      const status = await this.request("STATUS");
      if (!status.startsWith("STATUS,READY,PROTOCOL=1,")) throw new Error("Mega status was not confirmed.");
      if (status.includes("ARMED=TRUE")) throw new Error("Mega is already armed. Stop the active controller before connecting.");
      if (epoch !== this.epoch) return;
      this.online = true;
      this.state("connected", `ESP32 Wi-Fi · ${this.host} · Mega ready, disarmed`);
      this.poll = setInterval(() => {
        if (!this.playing && !this.stopping && !this.probing && this.online) {
          this.probing = true;
          this.probeTask = this.expect("PING", "PONG").catch(error => this.fail(error)).finally(() => { this.probing = false; this.probeTask = null; });
        }
      }, 5000);
    } catch (error) {
      if (epoch === this.epoch) this.fail(error);
      throw error;
    } finally { this.connecting = false; }
  }

  async reconnectAuthorized() { await this.connect(); return this.online; }

  private fail(error: unknown) {
    const wasPlaying = this.playing;
    this.online = false; this.playing = false; ++this.epoch;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    // Stop before publishing: the provider's error handler also requests allOff.
    if (wasPlaying) void this.stop().catch(() => {});
    this.state("error", error instanceof Error ? error.message : "ESP32 connection failed.");
  }

  async preparePlayback(commands: readonly ActuatorCommand[], offset = 0) {
    if (!this.online) throw new Error("Connect ESP32 Wi-Fi before playback.");
    const notes = commands.filter(command => command.start_time_seconds >= offset)
      .map(command => {
        const [, channel, duration, strength] = encodeArduinoNoteCommand(command).split(",");
        const at = Math.round((command.start_time_seconds - offset) * 1000);
        if (!Number.isFinite(at) || at < 0 || at > 1800000) throw new Error("Wireless schedule exceeds 30 minutes.");
        return { at, value: `${at}:${channel}:${duration}:${strength}` };
      }).sort((a, b) => a.at - b.at);
    if (notes.length > MAX_SCHEDULE_NOTES) throw new Error("Wireless buffer supports up to 4096 notes. Use USB for this arrangement.");
    const preparation = ++this.epoch;
    this.playing = true;
    await this.probeTask;
    if (preparation !== this.epoch || !this.online) throw new Error("Playback preparation cancelled.");
    const epoch = this.epoch + 1;
    await this.stop();
    const current = () => {
      if (epoch !== this.epoch || !this.online) throw new Error("Playback preparation cancelled.");
    };
    current();
    this.playing = true;
    this.scheduleId = (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1;
    const id = this.scheduleId;
    try {
      await this.expect(`SCHED,BEGIN,${id},${notes.length}`, "SCHED,OK"); current();
      for (let index = 0; index < notes.length; index += 32) {
        await this.expect(`SCHED,ADD,${id},${index},${notes.slice(index, index + 32).map(note => note.value).join(";")}`, "SCHED,OK");
        current();
      }
      await this.expect("ARM", "ACK,ARM"); current();
      const sent = performance.now();
      await this.expect(`SCHED,RUN,${id}`, "SCHED,STARTING,500"); current();
      const received = performance.now();
      if (received - sent > 400) throw new Error("Wi-Fi start acknowledgment was too slow. Playback cancelled.");
      const keep = async () => {
        if (epoch !== this.epoch) return;
        try {
          const result = await this.request(`SCHED,KEEP,${id}`);
          if (result !== "SCHED,RUNNING" && result !== "SCHED,READY") throw new Error("ESP32 schedule stopped.");
          if (epoch === this.epoch) this.heartbeat = setTimeout(() => { void keep(); }, 400);
        } catch (error) { if (epoch === this.epoch) this.fail(error); }
      };
      this.heartbeat = setTimeout(() => { void keep(); }, 400);
      // Estimate the ESP32 start from the request midpoint, then align browser audio.
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 500 - (received - sent) / 2)));
      current();
    } catch (error) {
      if (epoch === this.epoch) this.fail(error);
      throw error;
    }
  }

  async sendNote(_command: ActuatorCommand) {
    // Notes were uploaded before ARM; browser timers only drive audio/visuals.
    if (!this.online || !this.playing) throw new Error("ESP32 scheduled playback is not active.");
  }

  private stop(): Promise<void> {
    ++this.epoch; this.playing = false;
    if (this.heartbeat) clearTimeout(this.heartbeat);
    this.heartbeat = null; this.scheduleId = 0;
    if (this.stopping) return this.stopping;
    const request = this.expect("ESTOP", "ACK,DISARM");
    this.stopping = request.finally(() => { this.stopping = null; });
    return this.stopping;
  }
  async allOff() { if (this.online || this.playing || this.stopping) await this.stop(); }
  async disarm() { await this.stop(); }
  async disconnect() {
    ++this.epoch;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    try { if (this.online || this.playing) await this.stop(); }
    finally {
      this.online = false; this.playing = false;
      this.state("disconnected", "ESP32 Wi-Fi disconnected.");
    }
  }
  async runWakeSweep(): Promise<boolean> {
    throw new Error("The ESP32 bridge does not support the wake sweep. Use Arduino USB for that action.");
  }
}
