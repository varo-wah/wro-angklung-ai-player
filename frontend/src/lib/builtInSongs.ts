export type BuiltInSongNote = {
  note: string;
  start: number;
  duration: number;
};

export type BuiltInSong = {
  id: string;
  title: string;
  aliases?: string[];
  tempo_bpm: number;
  notes: BuiltInSongNote[];
};

type MelodyToken = [note: string, beats: number];

const seq = (
  notes: string[],
  start: number,
  step: number,
  duration: number
): BuiltInSongNote[] =>
  notes.map((note, i) => ({
    note,
    start: Number((start + i * step).toFixed(3)),
    duration,
  }));

const chord = (
  notes: string[],
  start: number,
  duration: number,
  spread = 0.025
): BuiltInSongNote[] =>
  notes.map((note, i) => ({
    note,
    start: Number((start + i * spread).toFixed(3)),
    duration: Number(Math.max(duration - i * spread, 0.1).toFixed(3)),
  }));

const toTimedNotes = (
  melody: MelodyToken[],
  tempoBpm: number
): BuiltInSongNote[] => {
  const secondsPerBeat = 60 / tempoBpm;
  let cursor = 0;

  return melody.flatMap(([note, beats]) => {
    const start = cursor;
    const duration = beats * secondsPerBeat * 0.88;

    cursor += beats * secondsPerBeat;

    if (note === "REST") return [];

    return [
      {
        note,
        start: Number(start.toFixed(3)),
        duration: Number(duration.toFixed(3)),
      },
    ];
  });
};

const ROMANTIC_FLIGHT_MELODY: MelodyToken[] = [
  // Phrase 1
  ["C5", 1],
  ["G5", 1],
  ["F5", 1],
  ["E5", 1.5],
  ["REST", 0.5],

  // Phrase 2
  ["C5", 0.5],
  ["B4", 0.5],
  ["A4", 0.5],
  ["G4", 0.5],
  ["E5", 1],
  ["G5", 1],
  ["E5", 0.75],
  ["D5", 0.5],
  ["D5", 0.5],
  ["E5", 1],
  ["REST", 0.5],

  // Phrase 3
  ["G5", 0.75],
  ["F5", 0.5],
  ["E5", 0.5],
  ["D5", 0.5],
  ["C5", 0.75],
  ["D5", 0.5],
  ["E5", 0.75],
  ["C5", 0.5],
  ["D5", 0.5],
  ["C5", 1],
  ["REST", 0.5],

  // Phrase 4
  ["G5", 0.75],
  ["F5", 0.5],
  ["E5", 0.5],
  ["D5", 0.5],
  ["C5", 0.75],
  ["A4", 0.5],
  ["C5", 0.5],
  ["A4", 1],
  ["REST", 0.75],

  // Phrase 5
  ["C5", 1],
  ["G5", 1],
  ["F5", 1],
  ["E5", 1.5],
  ["REST", 0.5],

  // Phrase 6
  ["C5", 0.5],
  ["B4", 0.5],
  ["A4", 0.5],
  ["G4", 0.5],
  ["E5", 1],
  ["G5", 0.75],
  ["A5", 0.75],
  ["E5", 0.75],
  ["D5", 0.5],
  ["D5", 0.5],
  ["E5", 1],
  ["REST", 0.5],

  // Phrase 7
  ["G5", 0.75],
  ["F5", 0.5],
  ["E5", 0.5],
  ["D5", 0.5],
  ["C5", 0.75],
  ["D5", 0.5],
  ["E5", 0.75],
  ["C5", 0.5],
  ["D5", 0.5],
  ["C5", 1],
  ["REST", 0.5],

  // Phrase 8
  ["G5", 0.75],
  ["F5", 0.5],
  ["E5", 0.5],
  ["D5", 0.5],
  ["C5", 0.75],
  ["A4", 0.5],
  ["C5", 0.5],
  ["A4", 1],
  ["REST", 0.75],

  // Ending run
  ["G5", 0.5],
  ["F5", 0.5],
  ["E5", 0.5],
  ["D5", 0.5],
  ["D5", 0.5],
  ["C5", 0.5],
  ["D5", 0.5],
  ["E5", 0.5],
  ["D5", 0.5],
  ["C5", 0.5],
  ["D5", 0.5],
  ["E5", 0.5],
  ["D5", 0.5],
  ["C5", 1.5],
];

export const BUILT_IN_SONGS: BuiltInSong[] = [
  {
    id: "twinkle_twinkle",
    title: "Twinkle Twinkle — Layered Angklung",
    aliases: ["twinkle", "twinkle twinkle"],
    tempo_bpm: 100,
    notes: [
      // Main: G G D D E E D
      ...chord(["G4", "B4", "D5"], 0.0, 0.45),
      { note: "G5", start: 0.0, duration: 0.42 },

      { note: "D5", start: 0.5, duration: 0.2 },
      { note: "G5", start: 0.5, duration: 0.42 },

      ...chord(["G4", "B4"], 1.0, 0.45),
      { note: "D6", start: 1.0, duration: 0.42 },

      { note: "B4", start: 1.5, duration: 0.2 },
      { note: "D6", start: 1.5, duration: 0.42 },

      ...chord(["C5", "G5"], 2.0, 0.45),
      { note: "E6", start: 2.0, duration: 0.42 },

      { note: "G5", start: 2.5, duration: 0.2 },
      { note: "E6", start: 2.5, duration: 0.42 },

      ...chord(["G4", "B4", "D5"], 3.0, 0.85),
      { note: "D6", start: 3.0, duration: 0.8 },

      // Main: C C B B A A G
      ...chord(["C5", "E5", "G5"], 4.0, 0.45),
      { note: "C6", start: 4.0, duration: 0.42 },

      { note: "G5", start: 4.5, duration: 0.2 },
      { note: "C6", start: 4.5, duration: 0.42 },

      ...chord(["G4", "D5", "G5"], 5.0, 0.45),
      { note: "B5", start: 5.0, duration: 0.42 },

      { note: "D5", start: 5.5, duration: 0.2 },
      { note: "B5", start: 5.5, duration: 0.42 },

      ...chord(["A4", "D5"], 6.0, 0.45),
      { note: "A5", start: 6.0, duration: 0.42 },

      { note: "D5", start: 6.5, duration: 0.2 },
      { note: "A5", start: 6.5, duration: 0.42 },

      ...chord(["G4", "B4", "D5", "G5"], 7.0, 0.9),
      { note: "G5", start: 7.0, duration: 0.85 },

      // Middle: D D C C B B A
      ...chord(["D5", "A5"], 8.0, 0.45),
      { note: "D6", start: 8.0, duration: 0.42 },

      { note: "A5", start: 8.5, duration: 0.2 },
      { note: "D6", start: 8.5, duration: 0.42 },

      ...chord(["C5", "G5"], 9.0, 0.45),
      { note: "C6", start: 9.0, duration: 0.42 },

      { note: "G5", start: 9.5, duration: 0.2 },
      { note: "C6", start: 9.5, duration: 0.42 },

      ...chord(["G4", "D5", "G5"], 10.0, 0.45),
      { note: "B5", start: 10.0, duration: 0.42 },

      { note: "D5", start: 10.5, duration: 0.2 },
      { note: "B5", start: 10.5, duration: 0.42 },

      ...chord(["A4", "D5", "A5"], 11.0, 0.9),
      { note: "A5", start: 11.0, duration: 0.85 },

      // Final phrase
      ...chord(["G4", "B4", "D5"], 12.0, 0.45),
      { note: "G5", start: 12.0, duration: 0.42 },

      { note: "D5", start: 12.5, duration: 0.2 },
      { note: "G5", start: 12.5, duration: 0.42 },

      ...chord(["G4", "B4"], 13.0, 0.45),
      { note: "D6", start: 13.0, duration: 0.42 },

      { note: "B4", start: 13.5, duration: 0.2 },
      { note: "D6", start: 13.5, duration: 0.42 },

      ...chord(["C5", "G5"], 14.0, 0.45),
      { note: "E6", start: 14.0, duration: 0.42 },

      { note: "G5", start: 14.5, duration: 0.2 },
      { note: "E6", start: 14.5, duration: 0.42 },

      ...chord(["G4", "B4", "D5", "G5"], 15.0, 1.1),
      { note: "D6", start: 15.0, duration: 1.0 },
    ],
  },

  {
    id: "happy_birthday",
    title: "Happy Birthday — Layered Angklung",
    aliases: ["happy birthday", "birthday"],
    tempo_bpm: 95,
    notes: [
      // Happy birthday to you
      { note: "G5", start: 0.0, duration: 0.3 },
      { note: "G5", start: 0.4, duration: 0.3 },

      ...chord(["C5", "E5", "G5"], 0.8, 0.65),
      { note: "A5", start: 0.8, duration: 0.6 },

      { note: "G5", start: 1.6, duration: 0.6 },

      ...chord(["C5", "E5", "G5"], 2.4, 0.65),
      { note: "C6", start: 2.4, duration: 0.6 },

      ...chord(["G4", "B4", "D5"], 3.2, 0.95),
      { note: "B5", start: 3.2, duration: 0.9 },

      // Happy birthday to you
      { note: "G5", start: 4.4, duration: 0.3 },
      { note: "G5", start: 4.8, duration: 0.3 },

      ...chord(["G4", "B4", "D5"], 5.2, 0.65),
      { note: "A5", start: 5.2, duration: 0.6 },

      { note: "G5", start: 6.0, duration: 0.6 },

      ...chord(["D5", "A5"], 6.8, 0.65),
      { note: "D6", start: 6.8, duration: 0.6 },

      ...chord(["C5", "E5", "G5"], 7.6, 0.95),
      { note: "C6", start: 7.6, duration: 0.9 },

      // Happy birthday dear...
      { note: "G5", start: 8.8, duration: 0.3 },
      { note: "G5", start: 9.2, duration: 0.3 },

      ...chord(["C5", "E5", "G5"], 9.6, 0.65),
      { note: "G6", start: 9.6, duration: 0.6 },

      ...chord(["E5", "G5", "C6"], 10.4, 0.65),
      { note: "E6", start: 10.4, duration: 0.6 },

      ...chord(["C5", "F5", "A5"], 11.2, 0.65),
      { note: "C6", start: 11.2, duration: 0.6 },

      ...chord(["G4", "B4", "D5"], 12.0, 0.65),
      { note: "B5", start: 12.0, duration: 0.6 },

      ...chord(["A4", "D5", "A5"], 12.8, 0.95),
      { note: "A5", start: 12.8, duration: 0.9 },

      // Happy birthday to you
      { note: "F6", start: 14.0, duration: 0.3 },
      { note: "F6", start: 14.4, duration: 0.3 },

      ...chord(["F5", "A5", "C6"], 14.8, 0.65),
      { note: "E6", start: 14.8, duration: 0.6 },

      ...chord(["C5", "E5", "G5"], 15.6, 0.65),
      { note: "C6", start: 15.6, duration: 0.6 },

      ...chord(["G4", "B4", "D5"], 16.4, 0.65),
      { note: "D6", start: 16.4, duration: 0.6 },

      ...chord(["C5", "E5", "G5", "C6"], 17.2, 1.15),
      { note: "C6", start: 17.2, duration: 1.1 },
    ],
  },

  {
    id: "ode_to_joy",
    title: "Ode to Joy — Layered Angklung",
    aliases: ["ode to joy", "ode"],
    tempo_bpm: 112,
    notes: [
      // Phrase 1
      ...chord(["G4", "D5", "G5"], 0.0, 0.45),
      { note: "B5", start: 0.0, duration: 0.42 },

      { note: "D5", start: 0.5, duration: 0.2 },
      { note: "B5", start: 0.5, duration: 0.42 },

      ...chord(["C5", "E5", "G5"], 1.0, 0.45),
      { note: "C6", start: 1.0, duration: 0.42 },

      ...chord(["G4", "B4", "D5"], 1.5, 0.45),
      { note: "D6", start: 1.5, duration: 0.42 },

      ...chord(["G4", "B4", "D5"], 2.0, 0.45),
      { note: "D6", start: 2.0, duration: 0.42 },

      ...chord(["C5", "E5", "G5"], 2.5, 0.45),
      { note: "C6", start: 2.5, duration: 0.42 },

      ...chord(["G4", "D5", "G5"], 3.0, 0.45),
      { note: "B5", start: 3.0, duration: 0.42 },

      ...chord(["A4", "D5", "A5"], 3.5, 0.45),
      { note: "A5", start: 3.5, duration: 0.42 },

      // Phrase 2
      ...chord(["G4", "B4", "D5"], 4.0, 0.45),
      { note: "G5", start: 4.0, duration: 0.42 },

      { note: "D5", start: 4.5, duration: 0.2 },
      { note: "G5", start: 4.5, duration: 0.42 },

      ...chord(["A4", "D5", "A5"], 5.0, 0.45),
      { note: "A5", start: 5.0, duration: 0.42 },

      ...chord(["G4", "D5", "G5"], 5.5, 0.45),
      { note: "B5", start: 5.5, duration: 0.42 },

      ...chord(["G4", "B4", "D5"], 6.0, 0.65),
      { note: "B5", start: 6.0, duration: 0.62 },

      ...chord(["A4", "D5", "A5"], 6.7, 0.3),
      { note: "A5", start: 6.7, duration: 0.28 },

      ...chord(["A4", "D5", "A5"], 7.1, 0.85),
      { note: "A5", start: 7.1, duration: 0.8 },

      // Phrase 3
      ...chord(["G4", "D5", "G5"], 8.1, 0.45),
      { note: "B5", start: 8.1, duration: 0.42 },

      { note: "D5", start: 8.6, duration: 0.2 },
      { note: "B5", start: 8.6, duration: 0.42 },

      ...chord(["C5", "E5", "G5"], 9.1, 0.45),
      { note: "C6", start: 9.1, duration: 0.42 },

      ...chord(["G4", "B4", "D5"], 9.6, 0.45),
      { note: "D6", start: 9.6, duration: 0.42 },

      ...chord(["G4", "B4", "D5"], 10.1, 0.45),
      { note: "D6", start: 10.1, duration: 0.42 },

      ...chord(["C5", "E5", "G5"], 10.6, 0.45),
      { note: "C6", start: 10.6, duration: 0.42 },

      ...chord(["G4", "D5", "G5"], 11.1, 0.45),
      { note: "B5", start: 11.1, duration: 0.42 },

      ...chord(["A4", "D5", "A5"], 11.6, 0.45),
      { note: "A5", start: 11.6, duration: 0.42 },

      // Final resolution
      ...chord(["G4", "B4", "D5"], 12.1, 0.45),
      { note: "G5", start: 12.1, duration: 0.42 },

      { note: "D5", start: 12.6, duration: 0.2 },
      { note: "G5", start: 12.6, duration: 0.42 },

      ...chord(["A4", "D5", "A5"], 13.1, 0.45),
      { note: "A5", start: 13.1, duration: 0.42 },

      ...chord(["G4", "D5", "G5"], 13.6, 0.45),
      { note: "B5", start: 13.6, duration: 0.42 },

      ...chord(["A4", "D5", "A5"], 14.1, 0.45),
      { note: "A5", start: 14.1, duration: 0.42 },

      ...chord(["G4", "B4", "D5", "G5"], 14.6, 1.15),
      { note: "G5", start: 14.6, duration: 1.1 },
    ],
  },

  {
    id: "romantic_flight_melody",
    title: "Romantic Flight — Angklung Melody",
    aliases: ["romantic flight", "romantic flight melody", "angklung melody"],
    tempo_bpm: 96,
    notes: toTimedNotes(ROMANTIC_FLIGHT_MELODY, 96),
  },

  {
    id: "romantic_flight_angklung",
    title: "Romantic Flight — Angklung Adaptation",
    aliases: ["romantic flight adaptation", "romantic flight angklung", "angklung adaptation"],
    tempo_bpm: 108,
    notes: [
      // Opening shimmer — soft flying intro
      ...chord(["G4", "B4", "D5", "G5"], 0.0, 0.7),
      ...seq(["B5", "D6", "E6", "D6", "B5"], 0.2, 0.32, 0.25),

      ...chord(["C5", "E5", "G5"], 2.0, 0.65),
      ...seq(["C6", "D6", "E6", "G6"], 2.15, 0.3, 0.24),

      ...chord(["A4", "D5", "A5"], 3.8, 0.65),
      ...seq(["E6", "D6", "C6", "A5"], 3.95, 0.3, 0.24),

      ...chord(["G4", "B4", "D5", "G5"], 5.6, 0.9),
      { note: "B5", start: 5.75, duration: 0.3 },
      { note: "D6", start: 6.1, duration: 0.3 },
      { note: "G6", start: 6.45, duration: 0.65 },

      // Main theme — wider, more emotional
      ...chord(["C5", "E5", "G5", "C6"], 7.4, 0.45),
      { note: "G6", start: 7.4, duration: 0.35 },
      { note: "E6", start: 7.85, duration: 0.3 },
      { note: "D6", start: 8.2, duration: 0.3 },
      { note: "C6", start: 8.55, duration: 0.45 },

      ...chord(["G4", "D5", "G5"], 9.2, 0.45),
      { note: "B5", start: 9.2, duration: 0.3 },
      { note: "D6", start: 9.55, duration: 0.3 },
      { note: "E6", start: 9.9, duration: 0.3 },
      { note: "D6", start: 10.25, duration: 0.45 },

      ...chord(["A4", "D5", "A5"], 10.95, 0.45),
      { note: "A5", start: 10.95, duration: 0.28 },
      { note: "C6", start: 11.3, duration: 0.28 },
      { note: "D6", start: 11.65, duration: 0.28 },
      { note: "F6", start: 12.0, duration: 0.45 },

      ...chord(["F5", "A5", "C6"], 12.75, 0.45),
      { note: "E6", start: 12.75, duration: 0.3 },
      { note: "D6", start: 13.1, duration: 0.3 },
      { note: "C6", start: 13.45, duration: 0.3 },
      { note: "B5", start: 13.8, duration: 0.5 },

      // Rising flight section — more motion
      ...chord(["G4", "B4", "D5"], 14.7, 0.35),
      ...seq(["G5", "A5", "B5", "D6", "E6", "G6"], 14.7, 0.22, 0.18),

      ...chord(["C5", "E5", "G5"], 16.2, 0.35),
      ...seq(["C6", "D6", "E6", "G6", "A6"], 16.2, 0.24, 0.18),

      ...chord(["A4", "D5", "A5"], 17.7, 0.35),
      ...seq(["A5", "C6", "D6", "F6", "A6"], 17.7, 0.24, 0.18),

      ...chord(["G4", "B4", "D5", "G5"], 19.2, 0.7),
      { note: "G6", start: 19.25, duration: 0.22 },
      { note: "A6", start: 19.55, duration: 0.22 },
      { note: "B6", start: 19.85, duration: 0.22 },
      { note: "C7", start: 20.2, duration: 0.75 },

      // Big cinematic chorus
      ...chord(["C5", "E5", "G5", "C6"], 21.2, 0.5),
      { note: "G6", start: 21.2, duration: 0.35 },
      { note: "E6", start: 21.65, duration: 0.3 },
      { note: "C6", start: 22.0, duration: 0.3 },
      { note: "D6", start: 22.35, duration: 0.3 },
      { note: "E6", start: 22.7, duration: 0.55 },

      ...chord(["G4", "B4", "D5", "G5"], 23.5, 0.5),
      { note: "D6", start: 23.5, duration: 0.3 },
      { note: "E6", start: 23.85, duration: 0.3 },
      { note: "G6", start: 24.2, duration: 0.3 },
      { note: "E6", start: 24.55, duration: 0.45 },

      ...chord(["A4", "D5", "A5", "D6"], 25.25, 0.5),
      { note: "A6", start: 25.25, duration: 0.35 },
      { note: "G6", start: 25.7, duration: 0.3 },
      { note: "F6", start: 26.05, duration: 0.3 },
      { note: "E6", start: 26.4, duration: 0.45 },

      ...chord(["F5", "A5", "C6"], 27.1, 0.5),
      { note: "F6", start: 27.1, duration: 0.3 },
      { note: "E6", start: 27.45, duration: 0.3 },
      { note: "D6", start: 27.8, duration: 0.3 },
      { note: "C6", start: 28.15, duration: 0.6 },

      // Arpeggio bridge — imitates piano movement
      ...seq(["G4", "B4", "D5", "G5", "B5", "D6"], 29.1, 0.18, 0.14),
      ...seq(["C5", "E5", "G5", "C6", "E6", "G6"], 30.3, 0.18, 0.14),
      ...seq(["A4", "D5", "A5", "D6", "F6", "A6"], 31.5, 0.18, 0.14),
      ...seq(["G4", "B4", "D5", "G5", "B5", "D6", "G6"], 32.7, 0.16, 0.13),

      // Final return — strong ending
      ...chord(["C5", "E5", "G5", "C6"], 34.2, 0.45),
      { note: "E6", start: 34.2, duration: 0.28 },
      { note: "G6", start: 34.55, duration: 0.28 },
      { note: "A6", start: 34.9, duration: 0.28 },
      { note: "G6", start: 35.25, duration: 0.45 },

      ...chord(["G4", "B4", "D5", "G5"], 36.0, 0.45),
      { note: "D6", start: 36.0, duration: 0.28 },
      { note: "E6", start: 36.35, duration: 0.28 },
      { note: "G6", start: 36.7, duration: 0.28 },
      { note: "B6", start: 37.05, duration: 0.45 },

      ...chord(["C5", "E5", "G5", "C6"], 37.9, 0.5),
      { note: "C7", start: 37.9, duration: 0.75 },

      ...chord(["C5", "E5", "G5", "C6", "C7"], 39.0, 1.4),
    ],
  },
];
