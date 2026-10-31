"use client";

import { StudioAppearanceSettings } from "./StudioAppearance";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  SONG_LIBRARY_GROUPS,
  songLibraryGroup,
  songLibraryGroupLabel,
} from "@/lib/songLibraryGroups";
import type { SongCatalogEntry } from "@/lib/songTypes";
import { useStudio } from "./runtime/useStudio";
import { Icon, formatTime } from "./StudioShell";

function BambooArtwork() {
  return (
    <svg
      className="studio-bamboo"
      viewBox="0 0 480 350"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bamboo" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#c5cf83" />
          <stop offset=".44" stopColor="#f0edbd" />
          <stop offset="1" stopColor="#90a067" />
        </linearGradient>
        <linearGradient id="frame" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#bcca86" />
          <stop offset="1" stopColor="#73915c" />
        </linearGradient>
      </defs>
      <circle cx="259" cy="175" r="143" stroke="#edf5d8" strokeOpacity=".12" />
      <circle cx="259" cy="175" r="114" stroke="#edf5d8" strokeOpacity=".08" />
      <g transform="rotate(-12 255 180)">
        <path
          d="M130 57v230m244-240v240"
          stroke="url(#frame)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M128 81h247M127 268h249"
          stroke="#b0bf7b"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {[0, 1, 2, 3, 4, 5, 6].map((v) => (
          <g key={v} transform={`translate(${148 + v * 32} ${95 + v * 7})`}>
            <path d="M0-20v38" stroke="#d9d9a5" strokeWidth="2" />
            <rect
              x="-9"
              y="10"
              width="18"
              height={145 - v * 10}
              rx="8"
              fill="url(#bamboo)"
            />
            <rect
              x="-7"
              y="12"
              width="7"
              height={56 - v * 5}
              rx="3.5"
              fill="#344d37"
            />
            <path
              d={`M-9 ${110 - v * 7}h18M-9 ${117 - v * 7}h18`}
              stroke="#727d4e"
              strokeWidth="2"
            />
            <path
              d={`M2 ${72 - v * 5}v${53 - v * 3}`}
              stroke="#ffffff"
              strokeOpacity=".3"
            />
          </g>
        ))}
        <path
          d="M116 294h272"
          stroke="#99a96d"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="m137 289-9-19m239 19 8-19" stroke="#8da164" strokeWidth="6" />
      </g>
      <path
        d="M394 68v22m-11-11h22M97 209v14m-7-7h14"
        stroke="#e8e9b0"
        strokeOpacity=".65"
      />
      <circle cx="404" cy="230" r="3" fill="#dce5b2" />
    </svg>
  );
}

function SongArt({
  song,
  index = 0,
}: {
  song: SongCatalogEntry;
  index?: number;
}) {
  const group = songLibraryGroup(song);
  return (
    <div className={`studio-song-art art-${group}`} aria-hidden="true">
      <svg viewBox="0 0 260 160" fill="none">
        <circle
          cx={130 + (index % 3) * 12}
          cy="84"
          r="58"
          stroke="currentColor"
          strokeWidth=".8"
        />
        <circle
          cx="130"
          cy="84"
          r="42"
          stroke="currentColor"
          strokeWidth=".8"
        />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <path
            key={i}
            d={`M${74 + i * 14} ${70 - Math.sin(i * 1.1 + index) * 22}v${28 + Math.sin(i * 1.1 + index) * 44}`}
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <span>
        {group === "traditional" || group === "national"
          ? "NUSANTARA"
          : "BAMBOO SESSIONS"}
      </span>
    </div>
  );
}

export function StudioHome() {
  const { snapshot: s, actions: a } = useStudio();
  const featured = useMemo(() => {
    const ids = [
      "ampar_ampar_pisang",
      "bengawan_solo",
      "you_are_the_reason",
      "indonesia_pusaka",
    ];
    const songs = ids
      .map((id) => s.catalog.find((song) => song.id === id))
      .filter((song): song is SongCatalogEntry => !!song);
    return [
      ...songs,
      ...s.catalog.filter((song) => !ids.includes(song.id)),
    ].slice(0, 4);
  }, [s.catalog]);
  const recent = s.preferences.recentIds
    .map((id) => s.catalog.find((song) => song.id === id))
    .filter((song): song is SongCatalogEntry => !!song)
    .slice(0, 3);
  return (
    <>
      <div className="studio-page-heading">
        <div>
          <p className="studio-eyebrow">YOUR MUSIC, REIMAGINED</p>
          <h1>Make room for music.</h1>
          <p>Discover familiar melodies with a different kind of instrument.</p>
        </div>
        <span className="studio-edition">STUDIO / 02</span>
      </div>
      <section className="studio-hero">
        <div className="studio-hero-copy">
          <span className="studio-hero-kicker">
            <span /> THE SOUND OF BAMBOO
          </span>
          <h2>
            A living tradition.
            <br />A new way to play.
          </h2>
          <p>
            Explore your angklung collection.
            <br />
            Find a melody. Make it your own.
          </p>
          <Link
            href="/studio/library"
            className="studio-button studio-button-cream"
          >
            Explore library <Icon name="arrow" size={17} />
          </Link>
          <small>
            {s.catalogStatus === "ready"
              ? `${s.catalog.length} arrangements`
              : "Loading your collection"}
            <span />
            18-note G3–C6 rack
          </small>
        </div>
        <BambooArtwork />
        <span className="studio-hero-caption">
          INDONESIAN ROOTS. NEW POSSIBILITIES.
        </span>
      </section>
      <section className="studio-section">
        <div className="studio-section-heading">
          <div>
            <h2>Find your next melody</h2>
            <p>A few places to begin.</p>
          </div>
          <Link href="/studio/library">
            View library <Icon name="arrow" size={15} />
          </Link>
        </div>
        <div className="studio-song-grid">
          {featured.map((song, i) => (
            <article className="studio-song-card" key={song.id}>
              <button
                className="studio-song-open"
                aria-label={`Select ${song.title}`}
                onClick={() => void a.selectSong(song.id)}
              >
                <SongArt song={song} index={i} />
                <div className="studio-card-copy">
                  <strong>{song.title}</strong>
                  <small>{songLibraryGroupLabel(song)}</small>
                </div>
                <span className="studio-card-arrow">
                  <Icon
                    name={s.selectedSongId === song.id ? "check" : "arrow"}
                    size={16}
                  />
                </span>
              </button>
            </article>
          ))}
          {s.catalogStatus === "loading" ? (
            <p className="studio-empty" role="status">
              Loading arrangements…
            </p>
          ) : null}
        </div>
      </section>
      <div className="studio-overview-bottom">
        <section className="studio-section">
          <div className="studio-section-heading">
            <div>
              <h2>Recently played</h2>
              <p>Your next session starts here.</p>
            </div>
          </div>
          {recent.length ? (
            <div className="studio-recent-list">
              {recent.map((song, i) => (
                <button
                  key={song.id}
                  onClick={() => void a.selectSong(song.id)}
                >
                  <span className="studio-row-number">0{i + 1}</span>
                  <span>
                    <strong>{song.title}</strong>
                    <small>{songLibraryGroupLabel(song)}</small>
                  </span>
                  <Icon
                    name={s.selectedSongId === song.id ? "check" : "arrow"}
                    size={17}
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="studio-empty">
              Play an arrangement to build your listening history.
            </p>
          )}
        </section>
        <section className="studio-start-card">
          <div className="studio-start-icon">
            <Icon name="device" size={25} />
          </div>
          <div>
            <p className="studio-eyebrow">FROM SCREEN TO STAGE</p>
            <h2>Have an Angklobot?</h2>
            <p>
              Use the operator console to connect your instrument and run a
              physical performance.
            </p>
            <Link href="/studio/device">
              Meet your device <Icon name="arrow" size={15} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

export function StudioLibrary() {
  const { snapshot: s, actions: a } = useStudio();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [favorites, setFavorites] = useState(false);
  const categories = SONG_LIBRARY_GROUPS.filter(
    (g) =>
      g.id !== "hardware" &&
      s.catalog.some((song) => songLibraryGroup(song) === g.id),
  );
  const songs = s.catalog.filter(
    (song) =>
      (!favorites || s.preferences.favoriteIds.includes(song.id)) &&
      (group === "all" || songLibraryGroup(song) === group) &&
      `${song.title} ${(song.aliases ?? []).join(" ")}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <div className="studio-page-heading">
        <div>
          <p className="studio-eyebrow">A COLLECTION WITH CHARACTER</p>
          <h1>Your music library.</h1>
          <p>
            {s.catalog.length} arrangements, ready to explore in audio preview.
          </p>
        </div>
      </div>
      <div className="studio-library-tools">
        <label className="studio-search">
          <Icon name="search" size={19} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs or aliases"
            aria-label="Search library"
          />
        </label>
        <button
          className="studio-filter-favorites"
          aria-pressed={favorites}
          onClick={() => setFavorites(!favorites)}
        >
          <Icon name="heart" size={16} />
          Favourites{" "}
          <span>
            {
              s.preferences.favoriteIds.filter((id) =>
                s.catalog.some((song) => song.id === id),
              ).length
            }
          </span>
        </button>
      </div>
      <div className="studio-filters" aria-label="Song categories">
        <button aria-pressed={group === "all"} onClick={() => setGroup("all")}>
          All music
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            aria-pressed={group === category.id}
            onClick={() => setGroup(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>
      <div className="studio-library-list">
        <div className="studio-list-heading">
          <span>ARRANGEMENT</span>
          <span>COLLECTION</span>
          <span>FAVOURITE</span>
        </div>
        {songs.map((song, i) => (
          <div
            className={`studio-library-row ${s.selectedSongId === song.id ? "is-selected" : ""}`}
            key={song.id}
          >
            <button
              className="studio-library-select"
              onClick={() => void a.selectSong(song.id)}
              aria-label={`Select ${song.title}`}
            >
              <span className="studio-row-number">
                {s.selectedSongId === song.id ? (
                  <Icon name="check" size={17} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <span>
                <strong>{song.title}</strong>
                <small>
                  {s.selectedSongId === song.id
                    ? "Selected for preview"
                    : "18-note arrangement"}
                </small>
              </span>
            </button>
            <span className="studio-row-category">
              {songLibraryGroupLabel(song)}
            </span>
            <button
              className="studio-icon-button"
              aria-label={`${s.preferences.favoriteIds.includes(song.id) ? "Unfavourite" : "Favourite"} ${song.title}`}
              aria-pressed={s.preferences.favoriteIds.includes(song.id)}
              onClick={() => a.toggleFavorite(song.id)}
            >
              <Icon name="heart" size={18} />
            </button>
          </div>
        ))}
        {!songs.length ? (
          <div className="studio-empty">
            <h2>
              {s.catalogStatus === "loading"
                ? "Loading your collection…"
                : "No arrangements here yet."}
            </h2>
            <p>
              {s.catalogStatus === "loading"
                ? "Your library will appear shortly."
                : "Try another search or save a few favourites."}
            </p>
          </div>
        ) : null}
      </div>
      <p className="studio-footnote">
        Select a song to prepare its synthesized preview, then press Play when
        you are ready.
      </p>
    </>
  );
}

export function StudioDevice() {
  return (
    <>
      <div className="studio-page-heading">
        <div>
          <p className="studio-eyebrow">CHOOSE YOUR OUTPUT</p>
          <h1>From listening to playing.</h1>
          <p>Know where the music is going before you press play.</p>
        </div>
      </div>
      <div className="studio-device-grid">
        <section className="studio-panel studio-active-device">
          <div className="studio-device-illustration">
            <Icon name="volume" size={58} />
          </div>
          <span className="studio-status-pill">Active in Studio</span>
          <h2>Computer audio</h2>
          <p>
            Explore the collection with synthesized angklung audio on this
            device. No robot connection is created by Studio.
          </p>
          <div className="studio-detail-row">
            <span>Output</span>
            <strong>Browser audio</strong>
          </div>
          <div className="studio-detail-row">
            <span>Instrument range</span>
            <strong>18 notes · G3–C6</strong>
          </div>
        </section>
        <section className="studio-panel">
          <div className="studio-device-illustration studio-device-olive">
            <Icon name="device" size={58} />
          </div>
          <span className="studio-status-pill studio-status-neutral">
            Operator console
          </span>
          <h2>Your physical Angklobot</h2>
          <p>
            Connect, calibrate, and control your robot through the existing
            operator console. Studio audio stops when you leave this workspace.
          </p>
          <a className="studio-button studio-button-dark" href="/control">
            Open operator console <Icon name="arrow" size={17} />
          </a>
          <small className="studio-device-note">
            USB and ESP32 options depend on your browser, local services, and
            hardware setup.
          </small>
        </section>
      </div>
      <section className="studio-device-info">
        <h2>One clear boundary</h2>
        <p>
          Studio is currently an audio preview workspace. Robot connection,
          voice assistance, and physical playback remain in the operator
          console. Other open controller tabs keep their own sessions.
        </p>
      </section>
    </>
  );
}

export function StudioSettings() {
  const { snapshot: s, actions: a } = useStudio();
  return (
    <>
      <div className="studio-page-heading">
        <div>
          <p className="studio-eyebrow">SET THE TONE</p>
          <h1>Your studio, your way.</h1>
          <p>Preferences and favourites are saved in this browser.</p>
        </div>
      </div>
      <StudioAppearanceSettings />
      <section className="studio-panel studio-settings-panel">
        <h2>Playback preferences</h2>
        <div className="studio-setting">
          <div>
            <h3>Preview sound</h3>
            <p>Mute the synthesized audio on this device.</p>
          </div>
          <button
            className="studio-switch"
            role="switch"
            aria-label="Mute synthesized audio"
            aria-checked={s.preferences.muted}
            onClick={() => a.setMuted(!s.preferences.muted)}
          >
            <span />
          </button>
        </div>
        <div className="studio-setting">
          <div>
            <h3>Tempo</h3>
            <p>Slow down to hear the details of an arrangement.</p>
          </div>
          <div className="studio-segmented">
            <button
              aria-pressed={s.preferences.tempo === "normal"}
              onClick={() => a.setTempo("normal")}
            >
              Original
            </button>
            <button
              aria-pressed={s.preferences.tempo === "slower"}
              onClick={() => a.setTempo("slower")}
            >
              Slower
            </button>
          </div>
        </div>
        <div className="studio-setting">
          <div>
            <h3>Arrangement</h3>
            <p>Hear the melody alone, or include its supporting parts.</p>
          </div>
          <div className="studio-segmented">
            <button
              aria-pressed={s.preferences.mode === "melody"}
              onClick={() => a.setMode("melody")}
            >
              Melody
            </button>
            <button
              aria-pressed={s.preferences.mode === "harmony"}
              onClick={() => a.setMode("harmony")}
            >
              With accompaniment
            </button>
          </div>
        </div>
        <p className="studio-footnote">
          Changing tempo or arrangement stops the current preview and prepares
          it again.
        </p>
      </section>
      <section className="studio-panel studio-settings-panel">
        <h2>Current arrangement</h2>
        <div className="studio-detail-row">
          <span>Song</span>
          <strong>{s.song?.title ?? "No song selected"}</strong>
        </div>
        <div className="studio-detail-row">
          <span>Preview duration</span>
          <strong>{formatTime(s.durationSeconds)}</strong>
        </div>
        <div className="studio-detail-row">
          <span>Schedule checks</span>
          <strong>
            {s.validationErrors.length
              ? "Needs review"
              : s.safety?.overall === "PASSED"
                ? "Passed for preview"
                : "Not prepared"}
          </strong>
        </div>
        {s.validationErrors.length ? (
          <ul className="studio-validation-errors">
            {s.validationErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        ) : null}
        <p className="studio-footnote">
          Software checks do not verify physical movement or hardware readiness.
        </p>
      </section>
      <div className="studio-about">
        <span className="studio-eyebrow">ANGKLOBOT STUDIO · V2 PREVIEW</span>
        <p>A new home for your angklung collection. Preview edition.</p>
      </div>
    </>
  );
}
