import type { ActuatorCommand } from "./types";

export type RobotTransportMode = "usb" | "esp32";

/** Shared operator controls. USB keeps its existing implementation. */
export interface RobotTransport {
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnectAuthorized(): Promise<boolean>;
  preparePlayback(commands: readonly ActuatorCommand[], offset?: number): Promise<void>;
  sendNote(command: ActuatorCommand): Promise<void>;
  allOff(): Promise<void>;
  disarm(): Promise<void>;
  runWakeSweep(): Promise<boolean>;
}
