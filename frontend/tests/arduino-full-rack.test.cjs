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
  vm.runInNewContext(output, { exports, require, URL, Error, Promise, setTimeout, clearTimeout });
  return exports;
}

const {
  ANGKLOBOT_MAX_CHANNEL,
  ANGKLOBOT_MIN_CHANNEL,
  ANGKLOBOT_SERIAL_BAUD_RATE,
  ANGKLOBOT_SERIAL_PROTOCOL_VERSION,
  encodeArduinoNoteCommand,
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

test("the website retains 18 unique logical channels while physical pitch identity awaits validation", () => {
  assert.equal(ANGKLUNG_RANGE_NOTES.length, 18);
  assert.deepEqual(
    Array.from(buildFullAngklungRack(), ({ actuator_channel }) => actuator_channel),
    Array.from({ length: 18 }, (_, actuator_channel) => actuator_channel),
  );
  assert.equal(new Set(Object.values(FRONTEND_INSTRUMENT_MAP).map(({ actuator_channel }) => actuator_channel)).size, 18);
});

test("the obsolete four-channel frontend gate is absent", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/lib/arduinoSerial.ts"), "utf8");
  assert.doesNotMatch(source, /ANGKLOBOT_TRIAL_CHANNELS/);
  assert.doesNotMatch(source, /limited to low-register G3\/B3\/D4\/F4/);
});

test("full-rack firmware preserves the exact pin map and uses non-blocking software PWM", () => {
  const firmware = fs.readFileSync(
    path.resolve(__dirname, "../../hardware/arduino/mega_full_18_note/mega_full_18_note.ino"),
    "utf8",
  );
  const readPinArray = (name) => {
    const match = firmware.match(new RegExp(`const uint8_t ${name}\\[CHANNEL_COUNT\\] = \\{([^}]+)\\}`));
    assert.ok(match, `${name} must exist`);
    return match[1].split(",").map((value) => Number(value.trim()));
  };

  assert.deepEqual(readPinArray("IN1_PINS"), [8, 6, 4, 2, 28, 26, 32, 30, 12, 10, 24, 22, 38, 36, 42, 40, 46, 44]);
  assert.deepEqual(readPinArray("IN2_PINS"), [9, 7, 5, 3, 29, 27, 33, 31, 13, 11, 25, 23, 39, 37, 43, 41, 47, 45]);
  assert.deepEqual(readPinArray("PHYSICAL_ANGKLUNG_NUMBERS"), [6, 5, 1, 7, 3, 2, 5, 4, 7, 6, 2, 1, 4, 3, 6, 5, 1, 7]);
  assert.match(firmware, /const uint16_t PWM_PERIOD_US = 1000;/);
  assert.match(firmware, /uint8_t motorPowerPercent\[18\]/);
  assert.match(firmware, /uint16_t motorPulseMs\[18\]/);
  assert.match(firmware, /void updateSoftwarePwm\(\)/);
  assert.doesNotMatch(firmware, /\banalogWrite\s*\(/);
  assert.doesNotMatch(firmware, /\bdelay(?:Microseconds)?\s*\(/);
});

test("firmware starts with conservative live calibration and exposes safe debug commands", () => {
  const firmware = fs.readFileSync(
    path.resolve(__dirname, "../../hardware/arduino/mega_full_18_note/mega_full_18_note.ino"),
    "utf8",
  );
  const readCalibrationArray = (type, name) => {
    const match = firmware.match(new RegExp(`${type} ${name}\\[18\\] = \\{([^}]+)\\}`));
    assert.ok(match, `${name} must exist`);
    return match[1].split(",").map((value) => Number(value.trim()));
  };

  assert.deepEqual(readCalibrationArray("uint8_t", "motorPowerPercent"), Array(18).fill(20));
  assert.deepEqual(readCalibrationArray("uint16_t", "motorPulseMs"), Array(18).fill(120));
  assert.match(firmware, /MAX_CALIBRATION_POWER_PERCENT = 60/);
  assert.match(firmware, /MIN_CALIBRATION_PULSE_MS = 50/);
  assert.match(firmware, /MAX_PULSE_DURATION_MS = 180/);
  for (const commandName of ["TEST", "POWER", "PULSE", "CAL", "CALALL"]) {
    assert.match(firmware, new RegExp(commandName));
  }
  assert.match(firmware, /STATUS,READY,PROTOCOL=1,MODE=FULL18,ARMED=/);
});
