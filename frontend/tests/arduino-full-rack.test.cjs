const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath) {
  const source = fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
  const exports = {};
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  vm.runInNewContext(output, {
    exports, require, URL, Error, Promise, setTimeout, clearTimeout, TextEncoder,
    navigator: {}, window: {isSecureContext: true, setTimeout, clearTimeout},
  });
  return exports;
}

const {
  ANGKLOBOT_MAX_CHANNEL,
  ANGKLOBOT_MIN_CHANNEL,
  ANGKLOBOT_SERIAL_BAUD_RATE,
  ANGKLOBOT_SERIAL_PROTOCOL_VERSION,
  encodeArduinoNoteCommand,
  ArduinoSerialController,
} = load("src/lib/arduinoSerial.ts");
const { ANGKLUNG_RANGE_NOTES, FRONTEND_INSTRUMENT_MAP, buildFullAngklungRack } = load("src/lib/instrumentMap.ts");

function command(channel, overrides = {}) {
  return {
    command_id: `test-${channel}`,
    start_time_seconds: 0,
    note: ANGKLUNG_RANGE_NOTES[channel] ?? "G3",
    instrument_id: `angklung_${String(channel + 1).padStart(2, "0")}`,
    actuator_channel: channel,
    action: "shake",
    duration_seconds: 0.18,
    strength: 0.8,
    ...overrides,
  };
}

test("protocol v1 formatting accepts every full-rack channel", () => {
  assert.equal(ANGKLOBOT_SERIAL_PROTOCOL_VERSION, 1);
  assert.equal(ANGKLOBOT_SERIAL_BAUD_RATE, 115200);
  assert.equal(ANGKLOBOT_MIN_CHANNEL, 0);
  assert.equal(ANGKLOBOT_MAX_CHANNEL, 17);

  for (let channel = 0; channel <= 17; channel++) {
    assert.equal(encodeArduinoNoteCommand(command(channel)), `NOTE,${channel},180,800`);
  }
});

test("channels outside 0-17 are rejected", () => {
  assert.throws(() => encodeArduinoNoteCommand(command(-1)), /outside the supported 0-17 rack range/);
  assert.throws(() => encodeArduinoNoteCommand(command(18)), /outside the supported 0-17 rack range/);
});

test("the website retains the intended G3-C6 logical channel order", () => {
  const expectedNotes = ["G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"];
  assert.deepEqual(Array.from(ANGKLUNG_RANGE_NOTES), expectedNotes);
  assert.equal(
    JSON.stringify(buildFullAngklungRack().map(({ note, actuator_channel }) => ({ note, actuator_channel }))),
    JSON.stringify(expectedNotes.map((note, actuator_channel) => ({ note, actuator_channel }))),
  );
  for (const [actuator_channel, note] of expectedNotes.entries()) {
    assert.equal(FRONTEND_INSTRUMENT_MAP[note].actuator_channel, actuator_channel);
  }
});

test("the obsolete four-channel frontend gate is absent", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/lib/arduinoSerial.ts"), "utf8");
  assert.doesNotMatch(source, /ANGKLOBOT_TRIAL_CHANNELS/);
  assert.doesNotMatch(source, /limited to low-register G3\/B3\/D4\/F4/);
});

test("full-rack firmware preserves the exact pin map and uses non-blocking software PWM", () => {
  const firmware = fs.readFileSync(
    path.resolve(__dirname, "../../hardware/arduino/mega_full_18_note_web_serial/mega_full_18_note_web_serial.ino"),
    "utf8",
  );
  const readPinArray = (name) => {
    const match = firmware.match(new RegExp(`const uint8_t ${name}\\[CHANNEL_COUNT\\] = \\{([^}]+)\\}`));
    assert.ok(match, `${name} must exist`);
    return match[1].split(",").map((value) => Number(value.trim()));
  };

  assert.deepEqual(readPinArray("IN1_PINS"), [6, 8, 2, 4, 28, 26, 32, 30, 12, 10, 24, 22, 36, 34, 41, 38, 44, 42]);
  assert.deepEqual(readPinArray("IN2_PINS"), [7, 9, 3, 5, 29, 27, 33, 31, 14, 11, 25, 23, 37, 35, 42, 39, 45, 43]);
  assert.deepEqual(readPinArray("PHYSICAL_ANGKLUNG_NUMBERS"), [5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 1]);
  assert.match(firmware, /const uint16_t PWM_PERIOD_US = 1000;/);
  assert.match(firmware, /uint8_t motorPowerPercent\[CHANNEL_COUNT\]/);
  assert.match(firmware, /uint16_t motorPulseMs\[CHANNEL_COUNT\]/);
  assert.match(firmware, /void updateSoftwarePwm\(\)/);
  assert.doesNotMatch(firmware, /\banalogWrite\s*\(/);
  assert.doesNotMatch(firmware, /\bdelay(?:Microseconds)?\s*\(/);
});

test("firmware starts with conservative live calibration and exposes safe debug commands", () => {
  const firmware = fs.readFileSync(
    path.resolve(__dirname, "../../hardware/arduino/mega_full_18_note_web_serial/mega_full_18_note_web_serial.ino"),
    "utf8",
  );
  const readCalibrationArray = (type, name) => {
    const match = firmware.match(new RegExp(`${type} ${name}\\[(?:18|CHANNEL_COUNT)\\] = \\{([^}]+)\\}`));
    assert.ok(match, `${name} must exist`);
    return match[1].split(",").map((value) => Number(value.trim()));
  };

  assert.deepEqual(readCalibrationArray("uint8_t", "motorPowerPercent"), [30, 28, 30, 30, 30, 30, 25, 30, 25, 30, 30, 25, 25, 25, 55, 35, 22, 25]);
  assert.deepEqual(readCalibrationArray("uint16_t", "motorPulseMs"), Array(18).fill(550));
  assert.match(firmware, /MAX_CALIBRATION_POWER_PERCENT = 60/);
  assert.match(firmware, /MIN_CALIBRATION_PULSE_MS = 50/);
  assert.match(firmware, /MAX_PULSE_DURATION_MS = 5000/);
  for (const commandName of ["TEST", "SWEEP", "POWER", "PULSE", "CAL", "CALALL"]) {
    assert.match(firmware, new RegExp(commandName));
  }
  assert.match(firmware, /F\("STATUS,READY,PROTOCOL="\)/);
  assert.match(firmware, /F\(",MODE="\)/);
  assert.match(firmware, /F\(",ARMED="\)/);
});

test("NOTE conversion validates raw strength and rounds seconds to milliseconds", () => {
  assert.equal(encodeArduinoNoteCommand(command(17, {duration_seconds: 0.5504, strength: 0.5})), "NOTE,17,550,500");
  for (const strength of [-0.0001, 1.0001, NaN, Infinity]) {
    assert.throws(() => encodeArduinoNoteCommand(command(0, {strength})), /strength/);
  }
  for (const duration_seconds of [0, -1, 5.001, NaN, Infinity]) {
    assert.throws(() => encodeArduinoNoteCommand(command(0, {duration_seconds})), /duration/);
  }
  assert.throws(() => encodeArduinoNoteCommand(command(1.5)), /channel/);
});

function connectedController() {
  const controller = new ArduinoSerialController(() => {});
  const lines = [];
  controller.state = {status: "connected", outputMode: "active", message: "test"};
  controller.writer = {write: async (bytes) => lines.push(new TextDecoder().decode(bytes).trim()), releaseLock() {}};
  return {controller, lines};
}

test("preparation validates all 18 channels before ARM and ALL_OFF", async () => {
  const {controller, lines} = connectedController();
  await controller.preparePlayback(Array.from({length: 18}, (_, channel) => command(channel)));
  assert.deepEqual(lines, ["ARM", "ALL_OFF"]);
  for (let channel = 0; channel < 18; channel++) await controller.sendNote(command(channel));
  assert.equal(lines[19], "NOTE,17,180,800");
  lines.length = 0;
  await assert.rejects(controller.preparePlayback([command(0), command(18)]), /channel/);
  assert.deepEqual(lines, []);
});

test("wake greeting uses the fast fixed-output firmware sweep and disarms after completion", async () => {
  const {controller, lines} = connectedController();
  const greeting = controller.runWakeSweep();
  for (let index = 0; index < 20 && lines.length < 3; index++) await new Promise(resolve => setImmediate(resolve));
  controller.handleLine("ACK,SWEEP,DONE");
  assert.equal(await greeting, true);
  assert.deepEqual(lines, ["ARM", "CALIBRATE", "SWEEP,30,150,50", "CALDONE", "DISARM"]);
});

test("disconnect shuts down and disarms before releasing serial", async () => {
  const {controller, lines} = connectedController();
  await controller.disconnect();
  assert.deepEqual(lines, ["ALL_OFF", "DISARM"]);
  assert.equal(controller.connected, false);
});
