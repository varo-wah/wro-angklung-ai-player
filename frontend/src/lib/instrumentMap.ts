export type FrontendInstrumentMapping = {
  note: string;
  instrument_id: string;
  actuator_channel: number;
};

export const ANGKLUNG_RANGE_NOTES = [
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
  "D6",
  "E6",
  "F6",
  "G6",
  "A6",
  "B6",
  "C7",
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
