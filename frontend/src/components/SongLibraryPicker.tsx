"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { SONG_LIBRARY_GROUPS, songLibraryGroup, songLibraryGroupLabel } from "@/lib/songLibraryGroups";

import type { SongCatalogEntry } from "@/lib/songTypes";

type SongLibraryPickerProps = {
  songs: SongCatalogEntry[];
  selectedSongId: string;
  onSelect: (songId: string) => void;
};

const ALL_CATEGORIES = "all";

export function SongLibraryPicker({ songs, selectedSongId, onSelect }: SongLibraryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedSong = songs.find((song) => song.id === selectedSongId);

  const categories = useMemo(
    () => SONG_LIBRARY_GROUPS.map(group => ({ ...group, count: songs.filter(song => songLibraryGroup(song) === group.id).length })).filter(group => group.count > 0),
    [songs],
  );

  const filteredSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return songs
      .filter((song) => category === ALL_CATEGORIES || songLibraryGroup(song) === category)
      .filter((song) => {
        if (!normalizedQuery) {
          return true;
        }

        return [song.title, song.id, songLibraryGroupLabel(song), ...(song.aliases ?? [])]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => {
        const groupOrder = SONG_LIBRARY_GROUPS.findIndex(group => group.id === songLibraryGroup(left)) - SONG_LIBRARY_GROUPS.findIndex(group => group.id === songLibraryGroup(right));
        return groupOrder || left.title.localeCompare(right.title);
      });
  }, [category, query, songs]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchInputRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function selectSong(songId: string) {
    onSelect(songId);
    setIsOpen(false);
    setQuery("");
  }

  return (
    <>
      <div>
        <span className="block text-sm font-semibold text-slate-200">Built-in Song</span>
        <button
          aria-haspopup="dialog"
          className="mt-2 flex w-full items-center justify-between gap-3 rounded border border-white/10 bg-black/45 px-3 py-3 text-left outline-none hover:border-lime-300/40 hover:bg-white/[0.06] focus:border-lime-300/70"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-100">
              {selectedSong?.title ?? "Choose a song"}
            </span>
            <span className="mt-0.5 block text-xs text-slate-400">
              {songs.length} songs available{selectedSong?.category ? ` / ${songLibraryGroupLabel(selectedSong)}` : ""}
            </span>
          </span>
          <span className="shrink-0 rounded border border-lime-300/30 bg-lime-300/10 px-2.5 py-1 text-xs font-bold text-lime-200">
            Browse
          </span>
        </button>
      </div>

      {isOpen ? (
        <div
          aria-label="Song library"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setIsOpen(false);
            }
          }}
          role="dialog"
        >
          <div className="flex max-h-[min(820px,calc(100dvh-24px))] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-white/15 bg-[#0a0e14] shadow-[0_30px_100px_rgba(0,0,0,0.7)]">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime-300">Built-in Library</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-50">Choose a song</h3>
                <p className="mt-1 text-sm text-slate-400">Browse by genre, or search by title and alternate name.</p>
              </div>
              <button
                aria-label="Close song library"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/10 bg-white/5 text-xl text-slate-300 hover:border-white/25 hover:text-white"
                onClick={() => setIsOpen(false)}
                title="Close"
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-5">
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="song-library-search">
                Search songs
              </label>
              <input
                autoComplete="off"
                className="mt-2 w-full rounded border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-lime-300/70"
                id="song-library-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try Fireflies, Perfect, or Yellow"
                ref={searchInputRef}
                type="search"
                value={query}
              />
              <label className="mt-3 block text-xs font-semibold text-slate-400 sm:hidden" htmlFor="song-library-group">Group</label>
              <select
                id="song-library-group"
                className="mt-1 w-full rounded border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 sm:hidden"
                value={category}
                onChange={event => setCategory(event.target.value)}
              >
                <option value={ALL_CATEGORIES}>All songs ({songs.length})</option>
                {categories.map(group => <option key={group.id} value={group.id}>{group.label} ({group.count})</option>)}
              </select>
              <div className="mt-3 hidden flex-wrap gap-2 sm:flex" aria-label="Filter songs by group">
                {[{ id: ALL_CATEGORIES, label: "All songs", count: songs.length }, ...categories].map((group) => (
                  <button
                    aria-pressed={category === group.id}
                    className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-semibold ${
                      category === group.id
                        ? "border-lime-300/60 bg-lime-300/15 text-lime-200"
                        : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-slate-200"
                    }`}
                    key={group.id}
                    onClick={() => setCategory(group.id)}
                    type="button"
                  >
                    {group.label}<span className="text-[10px] opacity-70">{group.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5 text-xs text-slate-400 sm:px-5">
              <span>{filteredSongs.length} results</span>
              <span>{songs.length} total</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
              {filteredSongs.length > 0 ? (
                <div className="divide-y divide-white/[0.07]">
                  {filteredSongs.map((song, index) => {
                    const isSelected = song.id === selectedSongId;
                    const group = songLibraryGroup(song);
                    const startsGroup = category === ALL_CATEGORIES && (index === 0 || songLibraryGroup(filteredSongs[index - 1]) !== group);
                    return (
                      <Fragment key={song.id}>
                      {startsGroup && <h4 className="bg-[#101720] px-3 py-2.5 text-xs font-bold tracking-wide text-slate-300">{songLibraryGroupLabel(song)} <span className="ml-2 font-normal text-slate-500">{filteredSongs.filter(item => songLibraryGroup(item) === group).length}</span></h4>}
                      <button
                        aria-current={isSelected ? "true" : undefined}
                        className={`flex w-full items-center justify-between gap-4 px-3 py-3 text-left hover:bg-white/[0.05] ${
                          isSelected ? "bg-lime-300/[0.08]" : ""
                        }`}
                        key={song.id}
                        onClick={() => selectSong(song.id)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className={`block truncate text-sm font-semibold ${isSelected ? "text-lime-200" : "text-slate-100"}`}>
                            {song.title}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>{songLibraryGroupLabel(song)}</span>
                            {song.difficulty ? <span>{formatLabel(song.difficulty)}</span> : null}
                            {song.physical_rack_map ? <span>Rack {song.physical_rack_map}</span> : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-bold text-lime-300">{isSelected ? "Selected" : "Choose"}</span>
                      </button>
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm font-semibold text-slate-300">No songs match this search.</p>
                  <button
                    className="mt-3 text-sm font-semibold text-lime-300 hover:text-lime-200"
                    onClick={() => {
                      setQuery("");
                      setCategory(ALL_CATEGORIES);
                    }}
                    type="button"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
