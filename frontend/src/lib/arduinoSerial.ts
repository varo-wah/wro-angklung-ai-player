import type { ActuatorCommand } from "./types";

export const ANGKLOBOT_SERIAL_PROTOCOL_VERSION = 1;
export const ANGKLOBOT_SERIAL_BAUD_RATE = 115_200;
export const ANGKLOBOT_MIN_CHANNEL = 0;
export const ANGKLOBOT_MAX_CHANNEL = 17;
const ARDUINO_BOOT_DELAY_MS = 2_000;
const ARDUINO_HANDSHAKE_TIMEOUT_MS = 10_000;
const ARDUINO_HANDSHAKE_RETRY_MS = 500;
const ARDUINO_WAKE_SWEEP_TIMEOUT_MS = 60_000;

export type ArduinoConnectionStatus = "unsupported" | "disconnected" | "connecting" | "connected" | "error";
export type ArduinoOutputMode = "unknown" | "dry_run" | "active";

export type ArduinoConnectionState = {
  status: ArduinoConnectionStatus;
  outputMode: ArduinoOutputMode;
  message: string;
};

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

type SerialApiLike = {
  getPorts?: () => Promise<SerialPortLike[]>;
  requestPort: () => Promise<SerialPortLike>;
};

type NavigatorWithSerial = Navigator & {
  serial?: SerialApiLike;
};

type ReadyMessage = {
  outputMode: ArduinoOutputMode;
};

export function getInitialArduinoConnectionState(): ArduinoConnectionState {
  if (typeof window === "undefined") {
    return {
      status: "disconnected",
      outputMode: "unknown",
      message: "Checking browser support…",
    };
  }

  const serial = (navigator as NavigatorWithSerial).serial;
  if (!window.isSecureContext || !serial) {
    return {
      status: "unsupported",
      outputMode: "unknown",
      message: "Web Serial requires localhost or HTTPS in a Chromium-based browser.",
    };
  }

  return {
    status: "disconnected",
    outputMode: "unknown",
    message: "Arduino not connected.",
  };
}

export function encodeArduinoNoteCommand(command: ActuatorCommand): string {
  if (
    !Number.isInteger(command.actuator_channel) ||
    command.actuator_channel < ANGKLOBOT_MIN_CHANNEL ||
    command.actuator_channel > ANGKLOBOT_MAX_CHANNEL
  ) {
    throw new Error(`Arduino channel ${command.actuator_channel} is outside the supported 0-17 rack range.`);
  }

  const durationMs = Math.round(command.duration_seconds * 1000);
  if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > 5000) {
    throw new Error(`Arduino duration ${command.duration_seconds}s is outside the supported 1-5000 ms range.`);
  }

  const strength = Math.round(command.strength * 1000);
  if (!Number.isFinite(command.strength) || command.strength < 0 || command.strength > 1) {
    throw new Error(`Arduino strength ${command.strength} is outside the supported 0-1 range.`);
  }

  return `NOTE,${command.actuator_channel},${durationMs},${strength}`;
}

export class ArduinoSerialController {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoop: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private receiveBuffer = "";
  private readyResolve: ((message: ReadyMessage) => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private intentionalDisconnect = false;
  private lineWaiters = new Set<{
    match: (line: string) => boolean;
    reject: (error: Error) => void;
    resolve: (line: string) => void;
  }>();
  private wakeSweepPromise: Promise<boolean> | null = null;
  private state: ArduinoConnectionState = getInitialArduinoConnectionState();

  constructor(private readonly onStateChange: (state: ArduinoConnectionState) => void) {
    this.publishState(this.state);
  }

  get connected(): boolean {
    return this.state.status === "connected" && Boolean(this.writer);
  }

  async connect(portOverride?: SerialPortLike): Promise<void> {
    if (this.connected || this.state.status === "connecting") {
      return;
    }

    const serial = (navigator as NavigatorWithSerial).serial;
    if (!window.isSecureContext || !serial) {
      this.publishState(getInitialArduinoConnectionState());
      return;
    }

    this.intentionalDisconnect = false;
    this.publishState({ status: "connecting", outputMode: "unknown", message: "Choose the Arduino serial port…" });

    try {
      this.port = portOverride ?? await serial.requestPort();
      this.publishState({ status: "connecting", outputMode: "unknown", message: "Opening Arduino at 115200 baud…" });
      await this.port.open({ baudRate: ANGKLOBOT_SERIAL_BAUD_RATE });
      console.debug("[Angklobot Serial] port opened");

      if (!this.port.readable || !this.port.writable) {
        throw new Error("The selected serial port does not expose readable and writable streams.");
      }

      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();
      // Install before starting the reader: even an early READY must be retained.
      const readyPromise = this.waitForReadyMessage();
      // A read failure during boot must not become an unhandled rejection.
      void readyPromise.catch(() => undefined);
      console.debug("[Angklobot Serial] waiting for Mega boot");
      this.publishState({ status: "connecting", outputMode: "unknown", message: "Waiting for Arduino Mega to reboot…" });
      this.readLoop = this.readLines();
      console.debug("[Angklobot Serial] reader started");
      await delay(ARDUINO_BOOT_DELAY_MS);
      if (this.intentionalDisconnect) return;
      this.throwIfConnectionFailed();

      const ready = await this.completeHandshake(readyPromise);
      if (this.intentionalDisconnect) return;
      this.throwIfConnectionFailed();
      console.debug(`[Angklobot Serial] connected ${ready.outputMode === "active" ? "ACTIVE" : "DRY_RUN"}`);

      this.publishState({
        status: "connected",
        outputMode: ready.outputMode,
        message:
          ready.outputMode === "active"
            ? "Arduino connected; full 18-note hardware available (channels 0–17). Disarmed until Play."
            : "Arduino connected in dry-run mode; commands are received but outputs remain off.",
      });
    } catch (error) {
      if (this.intentionalDisconnect) return;
      const cancelled = error instanceof DOMException && error.name === "NotFoundError";
      await this.closePort();
      this.publishState(
        cancelled
          ? { status: "disconnected", outputMode: "unknown", message: "Arduino connection cancelled." }
          : {
              status: "error",
              outputMode: "unknown",
              message: error instanceof Error ? error.message : "Unable to connect to the Arduino.",
            },
      );
    }
  }

  /** Reopen a port the user previously authorized without showing another picker. */
  async reconnectAuthorized(): Promise<boolean> {
    if (this.connected) return true;
    const serial = (navigator as NavigatorWithSerial).serial;
    if (!window.isSecureContext || !serial?.getPorts) return false;
    const ports = await serial.getPorts();
    if (!ports.length) return false;
    await this.connect(ports[0]);
    return this.connected;
  }

  async preparePlayback(commands: readonly ActuatorCommand[]): Promise<void> {
    if (!this.connected) {
      return;
    }

    for (const command of commands) {
      encodeArduinoNoteCommand(command);
    }

    await this.writeLine("ARM");
    await this.writeLine("ALL_OFF");
  }

  async sendNote(command: ActuatorCommand): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.writeLine(encodeArduinoNoteCommand(command));
  }

  async allOff(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.writeLine("ALL_OFF");
  }

  async disarm(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.writeLine("DISARM");
  }

  /** Run a fast fixed-output full-rack greeting, then return to a disarmed state. */
  async runWakeSweep(): Promise<boolean> {
    if (!this.connected) return false;
    if (this.wakeSweepPromise) return this.wakeSweepPromise;

    const run = async () => {
      const completed = this.waitForLine((line) => line === "ACK,SWEEP,DONE", ARDUINO_WAKE_SWEEP_TIMEOUT_MS);
      try {
        await this.writeLine("ARM");
        await this.writeLine("CALIBRATE");
        await this.writeLine("SWEEP,30,150,50");
        await completed;
        await this.writeLine("CALDONE");
        await this.writeLine("DISARM");
        return true;
      } catch (error) {
        this.rejectLineWaiters(error instanceof Error ? error : new Error("Angklobot greeting sweep failed."));
        await completed.catch(() => undefined);
        try { await this.writeLine("ALL_OFF"); } catch { /* The serial link may already be unavailable. */ }
        try { await this.writeLine("DISARM"); } catch { /* The serial link may already be unavailable. */ }
        throw error;
      }
    };

    this.wakeSweepPromise = run().finally(() => { this.wakeSweepPromise = null; });
    return this.wakeSweepPromise;
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    try {
      await this.allOff();
      await this.disarm();
    } finally {
      await this.closePort();
      this.publishState({ status: "disconnected", outputMode: "unknown", message: "Arduino disconnected; outputs commanded off." });
    }
  }

  private throwIfConnectionFailed(): void {
    // The read loop can change state while connect awaits boot or a reply.
    if (this.state.status === "error") throw new Error(this.state.message);
  }

  private waitForReadyMessage(): Promise<ReadyMessage> {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  private async completeHandshake(readyPromise: Promise<ReadyMessage>): Promise<ReadyMessage> {
    const deadline = Date.now() + ARDUINO_HANDSHAKE_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.writeLine(`HELLO,${ANGKLOBOT_SERIAL_PROTOCOL_VERSION}`);
      const remainingMs = deadline - Date.now();
      const result = await Promise.race([
        readyPromise.then((ready) => ({ ready })),
        delay(Math.min(ARDUINO_HANDSHAKE_RETRY_MS, Math.max(0, remainingMs))).then(() => null),
      ]);
      if (result) {
        return result.ready;
      }
    }

    throw new Error("Arduino did not complete the Angklobot handshake within 10 seconds after the Mega boot delay.");
  }

  private async readLines(): Promise<void> {
    const decoder = new TextDecoder();
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          if (!this.intentionalDisconnect && this.reader) {
            throw new Error("The Arduino serial connection closed unexpectedly.");
          }
          break;
        }
        this.receiveBuffer += decoder.decode(value, { stream: true });
        this.consumeReceivedLines();
      }
    } catch (error) {
      if (!this.intentionalDisconnect) {
        const serialError = error instanceof Error ? error : new Error("The Arduino serial connection was interrupted.");
        this.readyReject?.(serialError);
        this.readyReject = null;
        this.readyResolve = null;
        this.publishState({ status: "error", outputMode: "unknown", message: serialError.message });
      }
    }
  }

  private consumeReceivedLines() {
    let newlineIndex = this.receiveBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.receiveBuffer.slice(0, newlineIndex).trim();
      this.receiveBuffer = this.receiveBuffer.slice(newlineIndex + 1);
      this.handleLine(line);
      newlineIndex = this.receiveBuffer.indexOf("\n");
    }
  }

  private handleLine(line: string) {
    line = line.trim();
    console.debug("[Angklobot Serial RX]", line);
    for (const waiter of Array.from(this.lineWaiters)) {
      if (waiter.match(line)) {
        this.lineWaiters.delete(waiter);
        waiter.resolve(line);
      }
    }
    if (line === "READY,1,ACTIVE" || line === "READY,1,DRY_RUN") {
      console.debug("[Angklobot Serial] READY recognized");
      this.readyResolve?.({ outputMode: line === "READY,1,ACTIVE" ? "active" : "dry_run" });
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }

    if (line.startsWith("ERROR,")) {
      this.rejectLineWaiters(new Error(`Arduino reported: ${line.slice("ERROR,".length) || "unknown protocol error"}`));
      this.publishState({
        status: this.connected ? "connected" : "error",
        outputMode: this.state.outputMode,
        message: `Arduino reported: ${line.slice("ERROR,".length) || "unknown protocol error"}`,
      });
    }
  }

  private async writeLine(line: string): Promise<void> {
    const writer = this.writer;
    if (!writer) {
      throw new Error("Arduino serial writer is unavailable.");
    }

    const payload = new TextEncoder().encode(`${line}\n`);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(() => {
      console.debug("[Angklobot Serial TX]", line);
      return writer.write(payload);
    });
    await this.writeQueue;
  }

  private async closePort(): Promise<void> {
    this.rejectLineWaiters(new Error("Arduino connection closed before the requested command completed."));
    this.readyReject?.(new Error("Arduino connection closed before the handshake completed."));
    this.readyReject = null;
    this.readyResolve = null;

    const reader = this.reader;
    this.reader = null;
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // The device may already be unplugged.
      }
      reader.releaseLock();
    }

    const writer = this.writer;
    this.writer = null;
    if (writer) {
      try {
        await this.writeQueue;
      } catch {
        // A failed write must not prevent the port from closing.
      }
      writer.releaseLock();
    }

    try {
      await this.readLoop;
    } catch {
      // readLines already reports non-intentional serial errors.
    }
    this.readLoop = null;
    this.receiveBuffer = "";
    this.writeQueue = Promise.resolve();

    const port = this.port;
    this.port = null;
    if (port) {
      try {
        await port.close();
      } catch {
        // The operating system may already have released an unplugged port.
      }
    }
  }

  private publishState(state: ArduinoConnectionState) {
    this.state = state;
    this.onStateChange(state);
  }

  private waitForLine(match: (line: string) => boolean, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let timeoutId = 0;
      const waiter = {
        match,
        reject: (error: Error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
        resolve: (line: string) => {
          window.clearTimeout(timeoutId);
          resolve(line);
        },
      };
      timeoutId = window.setTimeout(() => {
        if (!this.lineWaiters.delete(waiter)) return;
        reject(new Error("Arduino greeting sweep did not finish within 60 seconds."));
      }, timeoutMs);
      this.lineWaiters.add(waiter);
    });
  }

  private rejectLineWaiters(error: Error): void {
    for (const waiter of this.lineWaiters) waiter.reject(error);
    this.lineWaiters.clear();
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
