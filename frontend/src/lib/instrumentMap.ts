export type FrontendInstrumentMapping = {
  note: string;
  instrument_id: string;
  actuator_channel: number;
};

export const ANGKLUNG_RANGE_NOTES = [
  "G3",
  "A3",
  "B3",
  "C4",
  "D4",
  "E4",
  "F4",
  "G4",
  "A4",
  "B4",
  "C5",
  "D5",
  "E5",
  "F5",
  "G5",
  "A5",
  "B5",
  "C6",
] as const;

export const FRONTEND_INSTRUMENT_MAP: Record<string, FrontendInstrumentMapping> = Object.fromEntries(
  ANGKLUNG_RANGE_NOTES.map((note, index) => [
    note,
    {
      note,
      instrument_id: `angklung_${String(index + 1).padStart(2, "0")}`,
      actuator_channel: index,
    },
  ]),
);

export function buildFullAngklungRack(): FrontendInstrumentMapping[] {
  return ANGKLUNG_RANGE_NOTES.map((note) => FRONTEND_INSTRUMENT_MAP[note]);
}
