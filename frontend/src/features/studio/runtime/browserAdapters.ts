import { AudioEngine } from "../../../lib/audioEngine";
import { PlaybackEngine } from "../../../lib/playbackEngine";
import { loadSongCatalog } from "../../../lib/songCatalog";
import { loadSongArrangement } from "../../../lib/songLoader";
import { PREFERENCE_KEY } from "./preferences";
import type { StudioPorts } from "./ports";

// App-owned and lazy internally: route remounts reuse one audio context instead
// of accumulating suspended contexts. Each controller silences it on disposal.
const browserAudio = new AudioEngine();
let audioOwner: symbol | null = null;

/** No robot transport or server API is reachable through the Studio ports. */
export function createBrowserPorts(): StudioPorts {
  const owner = Symbol("studio-audio-owner");
  let muted = false;
  return {
    repository: { loadCatalog: loadSongCatalog, loadSong: loadSongArrangement },
    preferences: {
      load: () => {
        const stored = window.localStorage.getItem(PREFERENCE_KEY);
        return stored === null ? null : JSON.parse(stored) as unknown;
      },
      save: (preferences) => window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences)),
    },
    audio: {
      ensureReady: () => {
        audioOwner = owner;
        browserAudio.setMuted(muted);
        return browserAudio.ensureReady();
      },
      playNote: (note, duration, strength) => {
        if (audioOwner === owner) browserAudio.playNote(note, duration, strength);
      },
      setMuted: (value) => {
        muted = value;
        if (audioOwner === owner) browserAudio.setMuted(value);
      },
      stopAll: () => {
        // A disposed provider may finish unlocking after its replacement starts.
        // It must never silence audio owned by that replacement.
        if (audioOwner === owner) browserAudio.stopAll();
      },
    },
    createPlayback: (schedule, callbacks) => new PlaybackEngine(
      schedule.commands,
      schedule.timing.total_duration_seconds,
      callbacks,
    ),
  };
}
