import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { SONG_LIBRARY_GROUPS, songLibraryGroup, songLibraryGroupLabel } from "../../lib/songLibraryGroups";
import { createBrowserPorts } from "./runtime/browserAdapters";
import { StudioController } from "./runtime/studioController";
import { BambooArtwork } from "./BambooArtwork";

const player = new StudioController(createBrowserPorts());
const time = (seconds: number) => Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");

function PublicLibrary() {
  const s = useSyncExternalStore(player.subscribe, player.getSnapshot);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  useEffect(() => {
    void player.initialize();
    window.addEventListener("pagehide", player.stop);
    return () => window.removeEventListener("pagehide", player.stop);
  }, []);
  const selected = s.catalog.find(song => song.id === s.selectedSongId);
  const playing = s.playback === "playing";
  const groups = SONG_LIBRARY_GROUPS.filter(item => s.catalog.some(song => songLibraryGroup(song) === item.id));
  const search = query.trim().toLowerCase();
  const songs = s.catalog.filter(song => (!group || songLibraryGroup(song) === group)
    && [song.title, ...(song.aliases ?? [])].some(value => value.toLowerCase().includes(search)));
  const canPlay = s.songStatus === "ready" && !!s.schedule && !s.validationErrors.length && s.safety?.overall === "PASSED";
  function listen() { if (playing) player.pause(); else void player.play(); }

  return <div className="library-layout">
    <section className="listen-card" aria-label="Audio preview">
      <div className="art"><BambooArtwork /></div>
      <div className="listen-copy"><p className="caption">{playing ? "Now playing" : s.playback === "paused" ? "Paused" : "Audio preview"}</p>
        <h2>{selected?.title ?? "Choose a song"}</h2>
        {selected && <p className="collection">{songLibraryGroupLabel(selected)}</p>}
        <div className="transport"><button onClick={listen} disabled={!canPlay || s.playback === "starting"}>{playing ? "Ⅱ　Pause" : "▶　Play preview"}</button>
          <span>{time(s.positionSeconds)} / {time(s.durationSeconds)}</span></div>
      </div>
    </section>
    <section className="catalog" aria-label="Song catalog">
      <div className="tools">
        <input type="search" aria-label="Search songs" placeholder="Search songs…" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Collection" value={group} onChange={e => setGroup(e.target.value)}><option value="">All collections</option>
          {groups.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      </div>
      {s.catalogStatus === "ready" && <p className="count">{songs.length} {songs.length === 1 ? "arrangement" : "arrangements"}</p>}
      {s.catalogStatus === "loading" && <p role="status">Loading songs…</p>}
      {(s.error || s.validationErrors.length > 0) && <div role="alert">{s.error || s.validationErrors[0]} {s.catalogStatus === "error" && <button onClick={() => void player.reloadCatalog()}>Retry</button>}</div>}
      {s.catalogStatus === "ready" && !songs.length && <p>No songs match your search. <button onClick={() => { setQuery(""); setGroup(""); }}>Show all songs</button></p>}
      <ul>{songs.map(song => {
        const current = song.id === selected?.id;
        const pause = current && playing;
        return <li key={song.id}><button className="song" data-selected={current} aria-label={(pause ? "Pause " : "Play ") + song.title}
          onClick={() => current && canPlay ? listen() : void player.playSong(song.id)}>
          <span className="disc" aria-hidden="true">{pause ? "Ⅱ" : "▶"}</span><span><strong>{song.title}</strong><small>{songLibraryGroupLabel(song)}</small></span>
        </button></li>;
      })}</ul>
    </section>
  </div>;
}

createRoot(document.getElementById("library")!).render(<PublicLibrary />);
