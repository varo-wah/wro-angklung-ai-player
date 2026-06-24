export type ActuatorCommand = {
  command_id: string;
  start_time_seconds: number;
  note: string;
  instrument_id: string;
  actuator_channel: number;
  action: string;
  duration_seconds: number;
  strength: number;
};

export type ActuatorSchedule = {
  format_version: "actuator_schedule.v1";
  project: string;
  song: {
    title: string;
    tempo_bpm: number;
    time_signature: string;
  };
  generated_at: string;
  timing: {
    time_unit: "seconds";
    zero_time: "playback_start";
    total_duration_seconds: number;
  };
  hardware_profile: {
    instrument_type: string;
    controller: string;
    default_action: string;
  };
  commands: ActuatorCommand[];
  validation: {
    status: string;
    warnings: string[];
    errors: string[];
  };
};

export type RackInstrument = {
  note: string;
  instrument_id: string;
  actuator_channel: number;
};

export type PlaybackState = "idle" | "playing" | "paused" | "stopped";
