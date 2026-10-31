import type { Esp32CommandLink } from './esp32Transport';
export type BridgeSerialPort = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: { dataTerminalReady: boolean }): Promise<void>;
};

/** Framed request IDs isolate responses from boot logs, diagnostics and cancelled work. */
export class Esp32UsbLink implements Esp32CommandLink {
  private port: BridgeSerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reading: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private nextId = 0;
  private pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly choosePort?: () => Promise<BridgeSerialPort>) {}
  async open() {
    if (this.closing) await this.closing;
    const serial = (navigator as Navigator & { serial?: { requestPort(): Promise<BridgeSerialPort> } }).serial;
    if (!window.isSecureContext || (!serial && !this.choosePort)) throw new Error('ESP32 USB needs Web Serial in a secure desktop browser.');
    this.port = await (this.choosePort ? this.choosePort() : serial!.requestPort());
    await this.port.open({ baudRate: 115200 });
    await this.port.setSignals?.({ dataTerminalReady: true });
    if (!this.port.readable || !this.port.writable) throw new Error('ESP32 USB streams are unavailable.');
    this.reader = this.port.readable.getReader(); this.writer = this.port.writable.getWriter();
    this.reading = this.read();
    // Native CDC or a USB-UART bridge can reset on open. No commands during boot.
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  request(line: string): Promise<string> {
    if (!this.writer) return Promise.reject(new Error('ESP32 USB disconnected.'));
    if (!/^[\x20-\x7e]{1,3000}$/.test(line)) return Promise.reject(new Error('Invalid USB bridge command.'));
    if (this.pending.size >= 8) return Promise.reject(new Error('ESP32 USB request limit reached.'));
    const id = this.nextId = this.nextId % 999999 + 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('ESP32 USB response timed out.')); }, 3000);
      this.pending.set(id, { resolve, reject, timer });
      // STOP is written immediately; it never waits for an earlier command ACK.
      void this.writer!.write(new TextEncoder().encode(`USB,${id},${line}\n`)).catch(error => this.fail(error));
    });
  }
  private fail(error: unknown) {
    const err = error instanceof Error ? error : new Error('ESP32 USB connection lost.');
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
  }
  private async read() {
    let buffer = ''; const decoder = new TextDecoder();
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
          const m = /^USB,(\d+),(\d+),(.*)$/.exec(line); if (!m) continue;
          const id = Number(m[1]), p = this.pending.get(id); if (!p) continue;
          this.pending.delete(id); clearTimeout(p.timer);
          if (Number(m[2]) !== 200 || m[3].startsWith('ERROR,')) p.reject(new Error(m[3]));
          else p.resolve(m[3]);
        }
        if (buffer.length > 4096) throw new Error('ESP32 USB response exceeds frame limit.');
      }
      this.fail(new Error('ESP32 USB disconnected.'));
    } catch (error) { this.fail(error); }
  }
  async close() {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      this.fail(new Error('ESP32 USB closed.'));
      await this.reader?.cancel().catch(() => {}); await this.reading;
      this.reader?.releaseLock(); this.reader = null; this.reading = null;
      this.writer?.releaseLock(); this.writer = null;
      await this.port?.setSignals?.({ dataTerminalReady: false }).catch(() => {});
      await this.port?.close().catch(() => {}); this.port = null;
    })();
    try { await this.closing; } finally { this.closing = null; }
  }
}
