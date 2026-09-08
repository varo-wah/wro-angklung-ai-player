const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function fixture({earlyReady = false, respondOn = 1} = {}) {
  let now = 0;
  let incoming;
  let closed = false;
  let hellos = 0;
  let portPickerRequests = 0;
  const timers = [];
  const writes = [];
  const states = [];
  const logs = [];
  const encoder = new TextEncoder();
  const port = {
    readable: new ReadableStream({start(controller) { incoming = controller; }}),
    writable: new WritableStream({write(bytes) {
      const line = new TextDecoder().decode(bytes).trim();
      writes.push({line, at: now});
      if (line === "HELLO,1" && ++hellos === respondOn) {
        // Reply immediately, fragmented and after unrelated boot output.
        incoming.enqueue(encoder.encode("Commands...\r\nCALALL\n  READY,1,AC"));
        incoming.enqueue(encoder.encode("TIVE \r\n"));
      }
    }}),
    async open(options) {
      assert.equal(options.baudRate, 115200);
      incoming.enqueue(encoder.encode("ANGKLOBOT FULL 18 READY — OUTPUTS DISARMED\r\n"));
      if (earlyReady) incoming.enqueue(encoder.encode("READY,1,ACTIVE\n"));
    },
    async close() { closed = true; },
  };
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, "../src/lib/arduinoSerial.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS},
  }).outputText, {
    exports, TextEncoder, TextDecoder, Error, DOMException,
    Date: {now: () => now},
    console: {debug: (...args) => logs.push(args.join(" "))},
    window: {
      isSecureContext: true,
      setTimeout(fn, ms) { const timer = {fn, at: now + ms}; timers.push(timer); return timer; },
      clearTimeout(timer) { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
    },
    navigator: {serial: {getPorts: async () => [port],requestPort: async () => { portPickerRequests++; return port; }}},
  });
  const controller = new exports.ArduinoSerialController(state => states.push(state));
  async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
  async function advance(ms) {
    now += ms;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= now) timers.splice(i, 1)[0].fn();
    }
    await flush();
  }
  return {controller, port, writes, states, logs, flush, advance, get portPickerRequests(){return portPickerRequests;},
    endReader: () => incoming.close(), isClosed: () => closed};
}

test("authorized Mega reconnect avoids another browser port picker", async () => {
  const f = fixture();
  const reconnect = f.controller.reconnectAuthorized();
  await f.flush();
  await f.advance(2000);
  assert.equal(await reconnect, true);
  assert.equal(f.portPickerRequests, 0);
  assert.equal(f.controller.connected, true);
  await f.controller.disconnect();
});

test("Mega boot waits 2000 ms, ignores startup text and accepts fragmented immediate READY", async () => {
  const f = fixture();
  const connect = f.controller.connect();
  await f.flush();
  assert.equal(f.controller.connected, false);
  await f.advance(1999);
  assert.deepEqual(f.writes, []);
  await f.advance(1);
  await connect;
  assert.deepEqual(f.writes, [{line: "HELLO,1", at: 2000}]);
  assert.equal(f.controller.connected, true);
  assert.equal(f.states.at(-1).outputMode, "active");
  assert.ok(f.logs.includes("[Angklobot Serial] READY recognized"));
  await f.controller.disconnect();
  assert.equal(f.port.readable.locked, false);
  assert.equal(f.port.writable.locked, false);
  assert.equal(f.controller.receiveBuffer, "");
  assert.equal(f.controller.readyResolve, null);
  assert.equal(f.controller.readyReject, null);
  assert.equal(f.isClosed(), true);
});

test("READY received during boot is retained until handshake starts", async () => {
  const f = fixture({earlyReady: true, respondOn: Infinity});
  const connect = f.controller.connect();
  await f.flush();
  assert.deepEqual(f.writes, []);
  await f.advance(2000);
  await connect;
  assert.equal(f.controller.connected, true);
  await f.controller.disconnect();
});

test("HELLO retries every 500 ms after boot", async () => {
  const f = fixture({respondOn: 2});
  const connect = f.controller.connect();
  await f.flush();
  await f.advance(2000);
  assert.equal(f.controller.connected, false);
  await f.advance(500);
  await connect;
  assert.deepEqual(f.writes.map(w => w.at), [2000, 2500]);
  assert.equal(f.controller.connected, true);
  await f.controller.disconnect();
});

test("handshake allows 10 seconds after boot then releases the port", async () => {
  const f = fixture({respondOn: Infinity});
  const connect = f.controller.connect();
  await f.flush();
  await f.advance(2000);
  for (let i = 0; i < 19; i++) await f.advance(500);
  assert.equal(f.states.at(-1).status, "connecting");
  await f.advance(500);
  await connect;
  assert.equal(f.states.at(-1).status, "error");
  assert.match(f.states.at(-1).message, /10 seconds/);
  assert.equal(f.writes.length, 20);
  assert.equal(f.isClosed(), true);
  assert.equal(f.port.readable.locked, false);
  assert.equal(f.port.writable.locked, false);
});

test("reader closing during boot cannot falsely connect or leak a rejection", async () => {
  const f = fixture();
  const connect = f.controller.connect();
  await f.flush();
  f.endReader();
  await f.flush();
  await f.advance(2000);
  await connect;
  assert.equal(f.states.at(-1).status, "error");
  assert.deepEqual(f.writes, []);
  assert.equal(f.isClosed(), true);
});

test("disconnect during boot cancels handshake without transmitting HELLO", async () => {
  const f = fixture();
  const connect = f.controller.connect();
  await f.flush();
  await f.controller.disconnect();
  await f.advance(2000);
  await connect;
  assert.deepEqual(f.writes, []);
  assert.equal(f.states.at(-1).status, "disconnected");
  assert.equal(f.isClosed(), true);
});
