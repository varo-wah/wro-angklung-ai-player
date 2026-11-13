"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useStudio } from "./runtime/useStudio";
import { StudioAppearanceControls } from "./StudioAppearance";
import { APPEARANCE_BOOTSTRAP } from "./runtime/preferences";

export type IconName =
  | "home"
  | "library"
  | "device"
  | "settings"
  | "play"
  | "pause"
  | "stop"
  | "heart"
  | "arrow"
  | "search"
  | "volume"
  | "mute"
  | "previous"
  | "next"
  | "shuffle"
  | "repeat"
  | "queue"
  | "plus"
  | "up"
  | "down"
  | "close"
  | "sun"
  | "moon"
  | "check";
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    moon: <path d="M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11Z" />,
    previous: <><path d="M5 5v14" /><path d="m18 5-10 7 10 7Z" fill="currentColor" stroke="none" /></>,
    next: <><path d="M19 5v14" /><path d="m6 5 10 7-10 7Z" fill="currentColor" stroke="none" /></>,
    shuffle: <><path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4" /></>,
    repeat: <><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3" /></>,
    queue: <><path d="M3 6h18M3 12h12M3 18h9" /><path d="m18 14 5 4-5 4Z" fill="currentColor" stroke="none" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    up: <path d="m5 15 7-7 7 7" />,
    down: <path d="m5 9 7 7 7-7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
      </>
    ),
    library: (
      <>
        <rect x="3" y="4" width="4" height="16" rx="1" />
        <rect x="10" y="4" width="4" height="16" rx="1" />
        <path d="m17 4 4 1-1 15-4-1Z" />
      </>
    ),
    device: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4M8 8v5m4-5v5m4-5v5" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="8" cy="7" r="3" />
        <circle cx="16" cy="17" r="3" />
      </>
    ),
    play: <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" strokeWidth="4" />
      </>
    ),
    stop: (
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="2"
        fill="currentColor"
        stroke="none"
      />
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    volume: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5Zm5 5 6 6m0-6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark() {
  return (
    <span className="studio-brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { snapshot, actions, robotMode, connection, toggleOutput } = useStudio();
  const navigation: [string, string, IconName][] = [
    ["/studio", "Player", "play"],
    ["/studio/library", "Library", "library"],
    ["/studio/settings", "Preferences", "settings"],
  ];
  return (
    <div className="studio-app" data-theme={snapshot.preferences.theme} suppressHydrationWarning
      style={{ "--ui-scale": snapshot.preferences.interfaceScale / 100 } as CSSProperties}>
      <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }} />
      <a className="studio-skip" href="#studio-main">
        Skip to content
      </a>
      <aside className="studio-sidebar">
        <Link className="studio-brand" href="/studio">
          <BrandMark />
          <span>
            angklobot<span className="studio-brand-caption">STUDIO</span>
          </span>
        </Link>
        <div className="studio-workspace">
          <span className="studio-avatar">A</span>
          <div>
            Performance workspace<small>Studio · Version 2</small>
          </div>
        </div>
        <span className="studio-nav-label">WORKSPACE</span>
        <nav aria-label="Studio navigation" style={{ gridTemplateColumns: `repeat(${navigation.length + 1}, minmax(0, 1fr))` }}>
          {navigation.map(([href, label, icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon name={icon} />
              <span className="studio-nav-label-full">{label}</span>
              <span className="studio-nav-label-short">{href === "/studio/settings" ? "Settings" : href === "/studio/device" ? "Live" : label}</span>
              {href === "/studio/library" && snapshot.catalog.length > 0 ? (
                <small>{snapshot.catalog.length}</small>
              ) : null}
            </Link>
          ))}
          <a href="/legacy" className="studio-legacy-mobile" aria-label="Legacy interface"><Icon name="settings"/><span>Legacy</span></a>
        </nav>
        <a className="studio-legacy-link" href="/legacy">Legacy interface ↗</a>
        <div className="studio-sidebar-bottom">
          <div className="studio-local-dot" />
          <span>
            Made for a living tradition.<small>Rooted in Indonesia.</small>
          </span>
        </div>
      </aside>
      <div className="studio-workspace-body">
        <header className="studio-topbar">
          <span>
            Workspace{" "}
            <span className="studio-breadcrumb">
              /{" "}
              {navigation.find(([href]) => href === pathname)?.[1] ?? "Studio"}
            </span>
          </span>
          <div className="studio-topbar-actions">
            <button className="studio-output-badge" onClick={toggleOutput} aria-pressed={robotMode}><span />{robotMode ? "Use computer audio" : "Play on angklung"}</button>
            <StudioAppearanceControls />
          </div>
        </header>
        <main id="studio-main" className="studio-main">
          {connection}
          {snapshot.error ? (
            <div className="studio-alert" role="alert">
              <span>{snapshot.error}</span>
              <button
                onClick={() =>
                  snapshot.catalogStatus === "error"
                    ? void actions.reloadCatalog()
                    : snapshot.songStatus === "error" && snapshot.selectedSongId
                      ? void actions.selectSong(snapshot.selectedSongId)
                      : actions.clearError()
                }
              >
                {snapshot.catalogStatus === "error" ||
                snapshot.songStatus === "error"
                  ? "Retry"
                  : "Dismiss"}
              </button>
            </div>
          ) : null}
          {snapshot.storageWarning ? (
            <div className="studio-alert" role="status">
              {snapshot.storageWarning}
            </div>
          ) : null}
          {snapshot.validationErrors.length ? (
            <div className="studio-alert" role="alert">
              <span>Preview unavailable: {snapshot.validationErrors[0]}</span>
              <Link href="/studio/settings">Review arrangement</Link>
            </div>
          ) : null}
          {children}
        </main>
      </div>
      <StudioPlayer />
    </div>
  );
}

export function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function volumeOptions(current: number) {
  const levels = new Set(Array.from({ length: 11 }, (_, index) => index * 10));
  levels.add(current);
  return [...levels].sort((a, b) => a - b).map(level => <option key={level} value={level}>{level}%</option>);
}

function StudioPlayer() {
  const { snapshot: s, actions: a, robotMode, outputLabel, toggleOutput } = useStudio();
  const playing = s.playback === "playing";
  const canPlay =
    s.songStatus === "ready" &&
    !!s.schedule &&
    !s.validationErrors.length &&
    s.safety?.overall === "PASSED";
  const favorite =
    !!s.selectedSongId && s.preferences.favoriteIds.includes(s.selectedSongId);
  return (
    <footer className="studio-player" aria-label={outputLabel + " player"}>
      <div className="studio-player-song">
        <div className="studio-mini-art">
          <BrandMark />
        </div>
        <div>
          <strong>
            {s.songStatus === "loading"
              ? "Preparing arrangement…"
              : (s.catalog.find(song => song.id === s.selectedSongId)?.title ?? "Choose your first song")}
          </strong>
          <small>{outputLabel}</small>
        </div>
        <button
          className="studio-icon-button studio-player-favorite"
          aria-label={
            favorite
              ? "Remove current song from favourites"
              : "Favourite current song"
          }
          aria-pressed={favorite}
          disabled={!s.selectedSongId}
          onClick={() => s.selectedSongId && a.toggleFavorite(s.selectedSongId)}
        >
          <Icon name="heart" size={17} />
        </button>
        <label className="studio-side-volume" title={robotMode ? "Robot volume" : "Preview volume"}>
          <Icon name="volume" size={16} />
          <select aria-label={robotMode ? "Player robot volume" : "Player preview volume"}
            disabled={robotMode && !s.schedule} value={s.preferences.volume}
            onChange={event => a.setVolume(Number(event.target.value))}>
            {volumeOptions(s.preferences.volume)}
          </select>
        </label>
      </div>
      <div className="studio-player-middle">
        <div className="studio-player-buttons">
          <button className="studio-icon-button" aria-label="Shuffle queue" title="Shuffle queue" aria-pressed={s.shuffle} onClick={() => a.setShuffle(!s.shuffle)}><Icon name="shuffle" size={17} /></button>
          <button className="studio-icon-button" aria-label="Previous song" title="Previous song" disabled={s.queueIndex < 0 || s.songStatus === "loading"} onClick={() => void a.previous()}><Icon name="previous" size={18} /></button>
          <button
            className="studio-play-button"
            aria-label={s.inputMode === "conduct" ? "Song playback unavailable in Conduct mode" : playing ? "Pause" : robotMode ? "Play on robot" : "Play preview"}
            disabled={s.inputMode === "conduct" || !canPlay || s.playback === "starting"}
            onClick={() => (playing ? a.pause() : void a.play())}
          >
            <Icon name={playing ? "pause" : "play"} />
          </button>
          <button className="studio-icon-button" aria-label="Next song" title="Next song" disabled={s.songStatus === "loading" || !s.queue.length || (s.queueIndex >= s.queue.length - 1 && s.repeat !== "all")} onClick={() => void a.next()}><Icon name="next" size={18} /></button>
          <button className="studio-icon-button studio-repeat-button" aria-label={`Repeat: ${s.repeat}`} title={`Repeat: ${s.repeat}`} aria-pressed={s.repeat !== "off"} onClick={() => a.setRepeat(s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off")}><Icon name="repeat" size={17} />{s.repeat === "one" ? <b>1</b> : null}</button>
          <button className="studio-icon-button studio-stop-button" aria-label="Stop playback" title="Stop playback" onClick={a.stop}><Icon name="stop" size={17} /></button>
          <button hidden={robotMode}
            className="studio-icon-button"
            aria-label={s.preferences.muted ? "Unmute preview" : "Mute preview"}
            aria-pressed={s.preferences.muted}
            onClick={() => a.setMuted(!s.preferences.muted)}
          >
            <Icon name={s.preferences.muted ? "mute" : "volume"} size={18} />
          </button>
        </div>
        <div className="studio-progress">
          <span>{formatTime(s.positionSeconds)}</span>
          <input
            aria-label="Playback position"
            type="range"
            min="0"
            max={s.durationSeconds || 1}
            step="0.1"
            value={s.positionSeconds}
            disabled={!canPlay}
            onChange={(e) => a.seek(Number(e.target.value))}
          />
          <span>{formatTime(s.durationSeconds)}</span>
        </div>
      </div>
      <button className="studio-player-output" onClick={toggleOutput}>
        <Icon name="device" size={17} />
        <span>
          {outputLabel}<small>Change output</small>
        </span>
      </button>
    </footer>
  );
}
