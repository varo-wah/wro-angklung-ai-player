import type { ActuatorCommand } from "./types";

export const ANGKLOBOT_SERIAL_PROTOCOL_VERSION = 1;
export const ANGKLOBOT_SERIAL_BAUD_RATE = 115_200;
export const ANGKLOBOT_TRIAL_CHANNELS = [0, 2, 4, 6] as const;
const ARDUINO_HANDSHAKE_TIMEOUT_MS = 5_000;
const ARDUINO_HANDSHAKE_RETRY_MS = 500;

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
  if (!Number.isInteger(command.actuator_channel) || command.actuator_channel < 0 || command.actuator_channel > 17) {
    throw new Error(`Arduino channel ${command.actuator_channel} is outside the supported 0-17 rack range.`);
  }

  const durationMs = Math.round(command.duration_seconds * 1000);
  if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > 5000) {
    throw new Error(`Arduino duration ${command.duration_seconds}s is outside the supported 1-5000 ms range.`);
  }

  const strength = Math.round(command.strength * 1000);
  if (!Number.isFinite(strength) || strength < 0 || strength > 1000) {
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
  private state: ArduinoConnectionState = getInitialArduinoConnectionState();

  constructor(private readonly onStateChange: (state: ArduinoConnectionState) => void) {
    this.publishState(this.state);
  }

  get connected(): boolean {
    return this.state.status === "connected" && Boolean(this.writer);
  }

  async connect(): Promise<void> {
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
      this.port = await serial.requestPort();
      this.publishState({ status: "connecting", outputMode: "unknown", message: "Opening Arduino at 115200 baud…" });
      await this.port.open({ baudRate: ANGKLOBOT_SERIAL_BAUD_RATE });

      if (!this.port.readable || !this.port.writable) {
        throw new Error("The selected serial port does not expose readable and writable streams.");
      }

      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();
      this.readLoop = this.readLines();

      const ready = await this.completeHandshake();

      this.publishState({
        status: "connected",
        outputMode: ready.outputMode,
        message:
          ready.outputMode === "active"
            ? "Arduino connected; hardware is configured and remains disarmed until Play."
            : "Arduino connected in dry-run mode; commands are received but outputs remain off.",
      });
    } catch (error) {
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

  async preparePlayback(commands: readonly ActuatorCommand[]): Promise<void> {
    if (!this.connected) {
      return;
    }

    const unsupportedChannels = [...new Set(commands.map((command) => command.actuator_channel))].filter(
      (channel) => !ANGKLOBOT_TRIAL_CHANNELS.includes(channel as (typeof ANGKLOBOT_TRIAL_CHANNELS)[number]),
    );
    if (unsupportedChannels.length > 0) {
      throw new Error(
        `Connected Arduino is limited to low-register G3/B3/D4/F4 channels 0, 2, 4, and 6. Schedule also contains: ${unsupportedChannels.join(", ")}.`,
      );
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

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    try {
      await this.allOff();
    } finally {
      await this.closePort();
      this.publishState({ status: "disconnected", outputMode: "unknown", message: "Arduino disconnected; outputs commanded off." });
    }
  }

  private waitForReadyMessage(): Promise<ReadyMessage> {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  private async completeHandshake(): Promise<ReadyMessage> {
    const readyPromise = this.waitForReadyMessage();
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

    throw new Error("Arduino did not complete the Angklobot handshake within 5 seconds.");
  }

  private async readLines(): Promise<void> {
    const decoder = new TextDecoder();
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
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
    const [messageType, version, mode] = line.split(",");
    if (messageType === "READY" && Number(version) === ANGKLOBOT_SERIAL_PROTOCOL_VERSION) {
      this.readyResolve?.({ outputMode: mode === "ACTIVE" ? "active" : "dry_run" });
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }

    if (messageType === "ERROR") {
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
    this.writeQueue = this.writeQueue.catch(() => undefined).then(() => writer.write(payload));
    await this.writeQueue;
  }

  private async closePort(): Promise<void> {
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
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
