"use client";

import { useAngklungSystem } from "@/components/AngklungSystemProvider";
import { PlaybackControls } from "@/components/PlaybackControls";
import { SongLibraryPicker } from "@/components/SongLibraryPicker";

export default function LiveSession() {
  const s = useAngklungSystem();
  const member = s.sessionRole !== "viewer";
  const music = s.supportedSongs.filter(song => song.category !== "hardware_trial");
  const ready = music.some(song => song.id === s.selectedSongId) && s.schedule && s.safetyReport?.overall === "PASSED";
  return <main className="mx-auto grid max-w-3xl gap-5 px-4 py-6">
    <h1 className="text-3xl font-semibold">Live performance</h1>
    <p>Enable the controller on the Mac. On your phone, open this page on the same server and enter the Mac’s pairing code.</p>
    {member && <>
      <section aria-label="Live song library">
        <h2 className="mb-2 font-semibold">Choose a song</h2>
        <SongLibraryPicker songs={music} selectedSongId={s.selectedSongId} onSelect={s.setSelectedSongId}/>
        <p role="status">{s.sourceLabel} · {s.playbackState}</p>
      </section>
      <PlaybackControls disabled={!ready} playbackState={s.playbackState} elapsedSeconds={s.elapsedSeconds}
        totalDurationSeconds={s.totalDuration} arduinoConnection={s.arduinoConnection} transportMode={s.transportMode}
        remoteControl={s.remoteControl} physicalControl={s.physicalControl} transportChanging={s.transportChanging}
        onTransportChange={s.setTransportMode} onPlay={s.playSchedule} onPause={s.pausePlayback} onStop={s.stopPlayback}
        onSeek={s.seekPlayback} onReset={s.resetPlayback} onEmergencyStop={s.emergencyStopPlayback}
        onConnectArduino={s.connectArduino} onDisconnectArduino={s.disconnectArduino}/>
    </>}
    {s.errors.length > 0 && <p role="alert">{s.errors.join(" · ")}</p>}
    {s.sessionRole === "host" ? <p>Stop playback and disable remote control above before returning to the preview player.</p>
    : <a href="/studio" className="underline">Back to Studio player</a>}
  </main>;
}
