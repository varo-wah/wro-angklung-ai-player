import { randomBytes, randomInt } from "node:crypto";
import { COMMAND_QUEUE_MS, COMMAND_RUN_MS, HOST_LEASE_MS, OFFLINE_ROBOT, isInterrupt, type RobotAction, type RobotCommand, type RobotResult, type RobotView } from "./robotSession";
import type { ArduinoConnectionState } from "./arduinoSerial";
import type { SyncedSystemSnapshot } from "./systemSync";

export class SessionError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
type Entry = RobotCommand & { owner: string; state: "queued" | "running" | "done"; startedAt?: number; result?: RobotResult };
/** One Mac server process, one USB owner. Never persist commands across a restart. */
export class RobotSessionStore {
  private host: { token: string; code: string; lastSeen: number; arduino: ArduinoConnectionState; snapshot: SyncedSystemSnapshot | null } | null = null;
  private clients = new Set<string>();
  private commands = new Map<string, Entry>();
  private revision = 0;
  private pairAttempts: number[] = [];
  constructor(private now = () => Date.now()) {}
  private expire() {
    if (this.host && this.now() - this.host.lastSeen >= HOST_LEASE_MS) {
      this.host = null;
      this.clients.clear();
      this.failOutstanding("Mac controller went offline. Command cancelled.");
      this.revision++;
    }
    for (const [id, command] of this.commands) {
      if (command.state !== "done" && this.now() - (command.startedAt ?? command.createdAt) > (command.state === "queued" ? COMMAND_QUEUE_MS : COMMAND_RUN_MS)) {
        command.state = "done";
        command.result = { ok: false, error: "Command expired. It will not be replayed." };
      }
      if (this.now() - command.createdAt > 120000) this.commands.delete(id);
    }
  }
  private failOutstanding(error: string) {
    for (const command of this.commands.values()) if (command.state !== "done") {
      command.state = "done";
      command.result = { ok: false, error };
    }
  }
  private requireHost(token: string) {
    this.expire();
    if (!this.host || this.host.token !== token) throw new SessionError("Controller session expired. Enable remote control again on the Mac.", 401);
    return this.host;
  }
  private requireClient(token: string) {
    this.expire();
    if (!this.clients.has(token)) throw new SessionError("Pair this device with the Mac controller.", 401);
    if (!this.host) throw new SessionError("Mac controller offline.");
    return this.host;
  }
  claim() {
    this.expire();
    if (this.host) throw new SessionError("Another Mac tab owns this control session. Release it there first.");
    this.host = { token: randomBytes(32).toString("hex"), code: String(randomInt(100000, 1000000)), lastSeen: this.now(), arduino: { ...OFFLINE_ROBOT.arduino, message: "Connect Arduino in the Mac controller tab." }, snapshot: null };
    this.clients.clear();
    this.commands.clear();
    this.revision++;
    return { token: this.host.token, code: this.host.code };
  }
  pair(code: string) {
    this.expire();
    this.pairAttempts = this.pairAttempts.filter(time => this.now() - time < 60000);
    if (this.pairAttempts.length >= 20) throw new SessionError("Too many pairing attempts. Wait one minute.", 429);
    this.pairAttempts.push(this.now());
    if (!this.host || code !== this.host.code) throw new SessionError("Incorrect code or Mac controller offline.", 403);
    if (this.clients.size >= 32) throw new SessionError("This session has reached its device limit.", 429);
    const token = randomBytes(32).toString("hex");
    this.clients.add(token);
    return { token };
  }
  view(token?: string, since = -1): RobotView {
    this.expire();
    const host = this.host;
    if (!host) return { ...OFFLINE_ROBOT, revision: this.revision };
    if (token && token !== host.token) this.requireClient(token);
    return {
      hostOnline: true, arduino: host.arduino, sourceLabel: host.snapshot?.sourceLabel ?? "", playbackState: host.snapshot?.playbackState ?? "idle", lastSeen: host.lastSeen,
      revision: this.revision,
      ...(token && since !== this.revision ? { snapshot: host.snapshot } : {}),
    };
  }
  heartbeat(token: string, arduino: ArduinoConnectionState, snapshot?: SyncedSystemSnapshot, acknowledgements: { id: string; result: RobotResult }[] = [], cancelOutstanding = false) {
    const host = this.requireHost(token);
    if (cancelOutstanding) this.failOutstanding("Cancelled by the Mac operator.");
    host.lastSeen = this.now();
    host.arduino = arduino;
    if (snapshot) { host.snapshot = snapshot; this.revision++; }
    for (const ack of acknowledgements) {
      const entry = this.commands.get(ack.id);
      if (entry?.state === "running") { entry.state = "done"; entry.result = ack.result; }
    }
    if (arduino.status !== "connected") this.failOutstanding("Arduino disconnected. Reconnect it on the Mac before sending commands.");
    // Interrupts are delivered even while an AI request or sweep is running.
    const commands: RobotCommand[] = [];
    const interrupt = [...this.commands.values()].find(c => c.state === "queued" && isInterrupt(c.action));
    const next = interrupt ?? (![...this.commands.values()].some(c => c.state === "running") ? [...this.commands.values()].find(c => c.state === "queued") : undefined);
    if (next) { next.state = "running"; next.startedAt = this.now(); commands.push({ id: next.id, action: next.action, createdAt: next.createdAt }); }
    return { ...this.view(token, this.revision), commands };
  }
  enqueue(token: string, id: string, action: RobotAction) {
    const host = this.requireClient(token);
    const existing = this.commands.get(id);
    if (existing) {
      if (existing.owner !== token) throw new SessionError("Command ID already in use.");
      return { id };
    }
    if (host.arduino.status !== "connected") throw new SessionError("Arduino is not connected to the Mac. Command was not sent.");
    if (action.type === "start_pending") {
      const request = this.commands.get(action.requestId);
      if (!request || request.owner !== token || request.action.type !== "request" || request.state !== "done" || !request.result?.pending) throw new SessionError("No pending song belongs to this request.");
    }
    if (isInterrupt(action)) this.failOutstanding("Cancelled by a stop, pause, or reset command.");
    if ([...this.commands.values()].filter(c => c.state !== "done").length >= 8) throw new SessionError("Controller busy. Wait for the current request.", 429);
    this.commands.set(id, { id, action, owner: token, createdAt: this.now(), state: "queued" });
    return { id };
  }
  result(token: string, id: string) {
    this.expire();
    const entry = this.commands.get(id);
    // A cancelled result remains readable by its original sender after lease loss.
    if (!entry || entry.owner !== token) throw new SessionError("Command not found.", 404);
    return { state: entry.state, result: entry.result };
  }
  release(token: string) {
    this.requireHost(token);
    this.host = null;
    this.clients.clear();
    this.failOutstanding("Mac controller released the session.");
    this.revision++;
  }
}
const globalStore = globalThis as typeof globalThis & { angklobotRobotSession?: RobotSessionStore };
export const robotSessionStore = globalStore.angklobotRobotSession ??= new RobotSessionStore();
