"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { SONG_LIBRARY_GROUPS, songLibraryGroup, songLibraryGroupLabel } from "@/lib/songLibraryGroups";
import { BrandMark, Icon, formatTime } from "./StudioShell";
import { useStudio } from "./runtime/useStudio";
import { QueueResizeHandle } from "./QueueResizeHandle";

export function StudioPerformance() {
  const { snapshot: s, actions: a } = useStudio();
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("all");
  const [group, setGroup] = useState("all");
  const [announcement, setAnnouncement] = useState("");
  const [queueDraft, setQueueDraft] = useState<number | null>(null);
  const selected = s.catalog.find((song) => song.id === s.selectedSongId);
  const playing = s.playback === "playing";
  const canPlay = s.songStatus === "ready" && !!s.schedule && !s.validationErrors.length;
  const upcoming = s.queue.slice(s.queueIndex + 1);
  const categories = SONG_LIBRARY_GROUPS.filter((category) => category.id !== "hardware"
    && s.catalog.some((song) => songLibraryGroup(song) === category.id));
  const songs = s.catalog.filter((song) => {
    const included = collection === "all" || (collection === "favorites"
      ? s.preferences.favoriteIds.includes(song.id) : s.preferences.recentIds.includes(song.id));
    return included && (group === "all" || songLibraryGroup(song) === group)
      && `${song.title} ${(song.aliases ?? []).join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  if (collection === "recent") songs.sort((left, right) => s.preferences.recentIds.indexOf(left.id) - s.preferences.recentIds.indexOf(right.id));

  return (
    <div className="performance-workspace">
      <div className="performance-heading">
        <div><p className="studio-eyebrow">ANGKLOBOT / PERFORMANCE WORKSPACE</p><h1>Let the music play.</h1></div>
        <Link className="performance-connect" href="/studio/device"><Icon name="device" size={17} /> Robot & phone connection <Icon name="arrow" size={16} /></Link>
      </div>
      <div className="performance-columns" style={{ "--queue-width": `${queueDraft ?? s.preferences.queueWidth}px` } as CSSProperties}>
        <div className="performance-main">
          <section className="performance-current" aria-label="Selected song">
            <div className={`performance-art${playing ? " is-playing" : ""}`} aria-hidden="true"><BrandMark /><span>ANGKLOBOT SESSIONS</span></div>
            <div className="performance-current-copy">
              <p className="performance-kicker"><span className={playing ? "is-playing" : ""} />{playing ? "NOW PLAYING · COMPUTER PREVIEW" : "SELECTED · COMPUTER PREVIEW"}</p>
              <h2>{s.songStatus === "loading" ? "Preparing arrangement…" : selected?.title ?? "Choose a song"}</h2>
              <p>{selected ? songLibraryGroupLabel(selected) : "Browse the library to get started."}{s.durationSeconds > 0 ? ` · ${formatTime(s.durationSeconds)}` : ""}</p>
              <div className="performance-current-actions">
                <button className="performance-primary" disabled={!canPlay || s.playback === "starting"}
                  onClick={() => playing ? a.pause() : void a.play()}><Icon name={playing ? "pause" : "play"} size={18} />{playing ? "Pause" : s.playback === "starting" ? "Starting…" : "Play preview"}</button>
                <button className="performance-secondary" disabled={!s.schedule} onClick={a.stop}><Icon name="stop" size={15} /> Stop</button>
              </div>
            </div>
          </section>

          <section className="performance-library" aria-label="Performance library">
            <div className="performance-section-heading"><h2>Your library <span>{s.catalog.length}</span></h2><span>Pick a song. Build your queue.</span></div>
            <div className="performance-library-tools">
              <label className="studio-search"><Icon name="search" size={19} /><input aria-label="Search performance library" placeholder="Search songs…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <select aria-label="Filter collection" value={group} onChange={(event) => setGroup(event.target.value)}>
                <option value="all">All collections</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
            </div>
            <div className="performance-library-tabs" aria-label="Library view">
              {[["all", "All songs"], ["favorites", "Favourites"], ["recent", "Recently played"]].map(([value, label]) =>
                <button key={value} aria-pressed={collection === value} onClick={() => setCollection(value)}>{label}</button>)}
              <span>{songs.length} {songs.length === 1 ? "song" : "songs"}</span>
            </div>
            <div className="performance-song-list" tabIndex={0} aria-label="Available songs">
              <div className="performance-list-labels" aria-hidden="true"><span>#</span><span>TITLE</span><span>COLLECTION</span><span>ACTIONS</span></div>
              {songs.map((song, index) => {
                const current = song.id === s.selectedSongId;
                const favorite = s.preferences.favoriteIds.includes(song.id);
                return <div className={`performance-song-row${current ? " is-selected" : ""}`} key={song.id}>
                  <span className="performance-song-number">{current && playing ? <span className="performance-equalizer" aria-label="Playing"><i /><i /><i /></span> : String(index + 1).padStart(2, "0")}</span>
                  <button className="performance-song-title" aria-label={`Select ${song.title}`} aria-pressed={current} onClick={() => void a.selectSong(song.id)}><strong>{song.title}</strong><small>{current ? playing ? "Playing preview" : "Selected" : songLibraryGroupLabel(song)}</small></button>
                  <span className="performance-song-category">{songLibraryGroupLabel(song)}</span>
                  <div className="performance-song-actions">
                    <button className="studio-icon-button" aria-label={`Play ${song.title}`} title={`Play ${song.title}`} onClick={() => void a.playSong(song.id)}><Icon name="play" size={17} /></button>
                    <button className="studio-icon-button" aria-label={`Add ${song.title} to queue`} title="Add to queue" disabled={s.queue.length >= 200} onClick={() => { a.addToQueue(song.id); setAnnouncement(`${song.title} added to queue.`); }}><Icon name="plus" size={18} /></button>
                    <button className="studio-icon-button performance-row-favorite" aria-label={`${favorite ? "Unfavourite" : "Favourite"} ${song.title}`} aria-pressed={favorite} onClick={() => a.toggleFavorite(song.id)}><Icon name="heart" size={17} /></button>
                  </div>
                </div>;
              })}
              {!songs.length && <div className="performance-empty"><Icon name="search" size={27} /><h3>{s.catalogStatus === "loading" ? "Loading your library…" : s.catalogStatus === "error" ? "Library unavailable" : "No songs found"}</h3><p>{s.catalogStatus === "error" ? "Use Retry above to load the library." : "Try another collection or search."}</p></div>}
            </div>
            <span className="performance-announcement" role="status">{announcement}</span>
          </section>
        </div>

        <aside id="studio-playback-queue" className="performance-queue" aria-label="Playback queue">
          <QueueResizeHandle width={queueDraft ?? s.preferences.queueWidth} onPreview={setQueueDraft} onCommit={a.setQueueWidth} />
          <div className="performance-queue-heading"><h2><Icon name="queue" size={19} /> Queue <span>{upcoming.length}</span></h2><button disabled={!upcoming.length} onClick={a.clearQueue}>Clear next</button></div>
          <div className="performance-queue-current"><p>NOW SELECTED</p><div><span className="performance-queue-art"><BrandMark /></span><span><strong>{selected?.title ?? "No song selected"}</strong><small>{playing ? "Playing on this computer" : s.songStatus === "loading" ? "Preparing…" : "Computer preview"}</small></span></div></div>
          <div className="performance-up-next-heading"><span>UP NEXT</span><span>{s.shuffle ? "Shuffled" : "In order"}</span></div>
          <ol className="performance-queue-list">
            {upcoming.map((entry, index) => {
              const song = s.catalog.find((candidate) => candidate.id === entry.songId);
              return <li key={entry.key}>
                <span className="performance-queue-number">{index + 1}</span>
                <button className="performance-queue-title" aria-label={`Play queued ${song?.title}`} onClick={() => void a.playQueueEntry(entry.key)}><strong>{song?.title}</strong><small>{song ? songLibraryGroupLabel(song) : ""}</small></button>
                <div className="performance-queue-actions">
                  <button aria-label={`Move ${song?.title} earlier`} title="Move earlier" disabled={index === 0} onClick={() => a.moveInQueue(entry.key, -1)}><Icon name="up" size={15} /></button>
                  <button aria-label={`Move ${song?.title} later`} title="Move later" disabled={index === upcoming.length - 1} onClick={() => a.moveInQueue(entry.key, 1)}><Icon name="down" size={15} /></button>
                  <button aria-label={`Remove ${song?.title} from queue`} title="Remove from queue" onClick={() => a.removeFromQueue(entry.key)}><Icon name="close" size={15} /></button>
                </div>
              </li>;
            })}
          </ol>
          {!upcoming.length && <div className="performance-empty-queue"><Icon name="queue" size={28} /><h3>Make room for the next song.</h3><p>Use <strong>+</strong> in the library to add songs here.</p></div>}
          <div className="performance-queue-options">
            <button aria-pressed={s.shuffle} onClick={() => a.setShuffle(!s.shuffle)}><Icon name="shuffle" size={16} /> Shuffle {s.shuffle ? "on" : "off"}</button>
            <button aria-label={`Queue repeat: ${s.repeat}`} onClick={() => a.setRepeat(s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off")}><Icon name="repeat" size={16} />{s.repeat === "off" ? "Repeat off" : s.repeat === "all" ? "Repeat all" : "Repeat one"}</button>
          </div>
          <p className="performance-queue-note">Your queue stays while you browse Studio. Reloading starts a fresh session.</p>
        </aside>
      </div>
    </div>
  );
}
