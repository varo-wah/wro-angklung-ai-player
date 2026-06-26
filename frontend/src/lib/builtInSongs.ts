export type BuiltInSongNote = {
  note: string;
  start: number;
  duration: number;
};

export type BuiltInSong = {
  id: string;
  title: string;
  tempo_bpm: number;
  notes: BuiltInSongNote[];
};

export const BUILT_IN_SONGS: BuiltInSong[] = [
  {
    id: "twinkle_twinkle",
    title: "Twinkle Twinkle",
    tempo_bpm: 100,
    notes: [
      { note: "G4", start: 0.0, duration: 0.45 },
      { note: "G4", start: 0.5, duration: 0.45 },
      { note: "D5", start: 1.0, duration: 0.45 },
      { note: "D5", start: 1.5, duration: 0.45 },
      { note: "E5", start: 2.0, duration: 0.45 },
      { note: "E5", start: 2.5, duration: 0.45 },
      { note: "D5", start: 3.0, duration: 0.8 },
    ],
  },
  {
    id: "happy_birthday",
    title: "Happy Birthday",
    tempo_bpm: 95,
    notes: [
      { note: "G4", start: 0.0, duration: 0.35 },
      { note: "G4", start: 0.4, duration: 0.35 },
      { note: "A4", start: 0.8, duration: 0.7 },
      { note: "G4", start: 1.6, duration: 0.7 },
      { note: "C5", start: 2.4, duration: 0.7 },
      { note: "B4", start: 3.2, duration: 1.0 },
    ],
  },
  {
    id: "ode_to_joy",
    title: "Ode to Joy",
    tempo_bpm: 110,
    notes: [
      { note: "B4", start: 0.0, duration: 0.45 },
      { note: "B4", start: 0.5, duration: 0.45 },
      { note: "C5", start: 1.0, duration: 0.45 },
      { note: "D5", start: 1.5, duration: 0.45 },
      { note: "D5", start: 2.0, duration: 0.45 },
      { note: "C5", start: 2.5, duration: 0.45 },
      { note: "B4", start: 3.0, duration: 0.45 },
      { note: "A4", start: 3.5, duration: 0.45 },
      { note: "G4", start: 4.0, duration: 0.45 },
      { note: "G4", start: 4.5, duration: 0.45 },
      { note: "A4", start: 5.0, duration: 0.45 },
      { note: "B4", start: 5.5, duration: 0.45 },
      { note: "B4", start: 6.0, duration: 0.65 },
      { note: "A4", start: 6.7, duration: 0.3 },
      { note: "A4", start: 7.1, duration: 0.8 },
    ],
  },
];
