"use client";

import { useState } from "react";
import { Icon } from "./StudioShell";
import { useStudio } from "./runtime/useStudio";

export function StudioPlaylists() {
  const { snapshot: s, actions: a, robotMode, toggleOutput } = useStudio();
  const [name, setName] = useState("");
  const [songId, setSongId] = useState("");
  const [submittedName, setSubmittedName] = useState("");
  const canEdit = !robotMode || !!s.schedule;
  const duplicate = s.preferences.playlists.some(list => list.name === name.trim());
  const title = (id: string) => s.catalog.find(song => song.id === id)?.title ?? "Unavailable song";
  const saved = submittedName && s.preferences.playlists.some(list => list.name === submittedName);

  return <div className="studio-playlist-page">
    <header className="performance-heading">
      <div><p className="studio-eyebrow">YOUR MUSIC / YOUR ORDER</p><h1>Playlists</h1><p>Keep your favourites together. Play them from start to finish.</p></div>
      <a className="performance-secondary" href="#playlist-builder"><Icon name="plus" size={18} /> Create playlist</a>
    </header>
    {!canEdit && <div className="studio-playlist-notice">
      <p>Connect the Mac controller and select a song to manage the robot’s playlists, or use computer audio to build playlists locally.</p>
      <button className="performance-secondary" onClick={toggleOutput}>Use computer audio</button>
    </div>}
    <div className="studio-playlist-layout">
      <section className="studio-saved-playlists" aria-label="Saved playlists">
        <div className="performance-section-heading"><h2>Saved playlists <span>{s.preferences.playlists.length}</span></h2></div>
        {s.preferences.playlists.length === 0 ? <div className="studio-playlist-empty">
          <Icon name="playlist" size={40} /><h2>Your first playlist starts here.</h2>
          <p>Add songs to the queue, give it a name, and save it. Your saved playlists stay after reloading.</p>
          <a href="#playlist-builder">Create your first playlist <Icon name="arrow" size={16} /></a>
        </div> : <div className="studio-playlist-cards">
          {s.preferences.playlists.map(list => <article className="studio-playlist-card" key={list.name}>
            <div className="studio-playlist-cover"><Icon name="playlist" size={32} /><span>{list.songs.length} {list.songs.length === 1 ? "song" : "songs"}</span></div>
            <h2>{list.name}</h2>
            <details><summary>View songs</summary><ol>{list.songs.map((id, index) => <li key={`${id}-${index}`}>{title(id)}</li>)}</ol></details>
            <div className="studio-playlist-card-actions">
              <button className="performance-primary" disabled={!canEdit} aria-label={`Play playlist ${list.name}`} onClick={() => void a.playPlaylist(list.name)}><Icon name="play" size={16} /> Play</button>
              <button className="studio-icon-button" disabled={!canEdit} aria-label={`Delete playlist ${list.name}`} title="Delete playlist" onClick={() => a.deletePlaylist(list.name)}><Icon name="trash" size={18} /></button>
            </div>
          </article>)}
        </div>}
        <div className="studio-playlist-repeat">
          <button className="performance-secondary" disabled={!canEdit} aria-pressed={s.repeat === "all"} onClick={() => a.setRepeat(s.repeat === "all" ? "off" : "all")}><Icon name="repeat" size={18} /> Repeat all: {s.repeat === "all" ? "on" : "off"}</button>
          <p>Turn this on to keep the playlist playing until you stop it.</p>
        </div>
      </section>
      <section id="playlist-builder" className="studio-playlist-builder" aria-label="Create playlist" tabIndex={-1}>
        <p className="studio-eyebrow">CREATE A PLAYLIST</p><h2>Save your queue</h2>
        <p>Use your current queue or add songs here. Saving does not start playback.</p>
        <form className="studio-playlist-add" onSubmit={event => { event.preventDefault(); if (canEdit && songId && s.queue.length < 200) a.addToQueue(songId); }}>
          <label htmlFor="playlist-song">Add a song</label>
          <select id="playlist-song" value={songId} disabled={!canEdit} onChange={event => setSongId(event.target.value)}>
            <option value="">Choose a song…</option>{s.catalog.map(song => <option key={song.id} value={song.id}>{song.title}</option>)}
          </select>
          <button className="performance-secondary" disabled={!canEdit || !songId || s.queue.length >= 200}><Icon name="queueAdd" size={18} /> Add to queue</button>
        </form>
        <h3>Queue · {s.queue.length} {s.queue.length === 1 ? "song" : "songs"}</h3>
        {s.queue.length ? <ol className="studio-playlist-draft">{s.queue.map((entry, index) => <li key={entry.key}><span>{title(entry.songId)}{index <= s.queueIndex && <small> · {index === s.queueIndex ? "Selected" : "Played"}</small>}</span><button className="studio-icon-button" disabled={!canEdit || index <= s.queueIndex} aria-label={`Remove ${title(entry.songId)} from queue`} onClick={() => a.removeFromQueue(entry.key)}><Icon name="close" size={16} /></button></li>)}</ol> : <p className="studio-playlist-hint">No songs yet. Choose a song above to begin.</p>}
        <form className="studio-playlist-save" onSubmit={event => {
          event.preventDefault();
          if (!canEdit || !s.queue.length || !name.trim() || duplicate || s.preferences.playlists.length >= 50) return;
          a.savePlaylist(name.trim()); setSubmittedName(name.trim()); setName("");
        }}>
          <label htmlFor="playlist-name">Playlist name</label>
          <input id="playlist-name" placeholder="e.g. Competition set" value={name} maxLength={64} onChange={event => { setName(event.target.value); setSubmittedName(""); }} />
          {duplicate && <p className="studio-playlist-hint">That name is already in use. Choose another name.</p>}
          {s.preferences.playlists.length >= 50 && <p className="studio-playlist-hint">You have reached the limit of 50 playlists.</p>}
          <button className="performance-primary" disabled={!canEdit || !s.queue.length || !name.trim() || duplicate || s.preferences.playlists.length >= 50}><Icon name="plus" size={18} /> Save playlist</button>
        </form>
        <p role="status" className="studio-playlist-hint">{saved ? `Saved “${submittedName}”.` : "Playlists are saved in the controller browser. Paired phones use the Mac’s playlists."}</p>
      </section>
    </div>
  </div>;
}
