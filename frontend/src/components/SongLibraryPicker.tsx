"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
    () => Array.from(new Set(songs.map((song) => song.category).filter((value): value is string => Boolean(value)))).sort(),
    [songs],
  );

  const filteredSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return songs
      .filter((song) => category === ALL_CATEGORIES || song.category === category)
      .filter((song) => {
        if (!normalizedQuery) {
          return true;
        }

        return [song.title, song.id, ...(song.aliases ?? [])]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => left.title.localeCompare(right.title));
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
              {songs.length} songs available{selectedSong?.category ? ` / ${formatLabel(selectedSong.category)}` : ""}
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
          <div className="flex max-h-[min(760px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-white/15 bg-[#0a0e14] shadow-[0_30px_100px_rgba(0,0,0,0.7)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime-300">Built-in Library</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-50">Choose a song</h3>
                <p className="mt-1 text-sm text-slate-400">Search by title or alternate name.</p>
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

            <div className="border-b border-white/10 px-4 py-3 sm:px-5">
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
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filter songs by category">
                {[ALL_CATEGORIES, ...categories].map((item) => (
                  <button
                    aria-pressed={category === item}
                    className={`shrink-0 rounded border px-3 py-1.5 text-xs font-semibold ${
                      category === item
                        ? "border-lime-300/60 bg-lime-300/15 text-lime-200"
                        : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-slate-200"
                    }`}
                    key={item}
                    onClick={() => setCategory(item)}
                    type="button"
                  >
                    {item === ALL_CATEGORIES ? "All songs" : formatLabel(item)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-xs text-slate-400 sm:px-5">
              <span>{filteredSongs.length} results</span>
              <span>{songs.length} total</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
              {filteredSongs.length > 0 ? (
                <div className="divide-y divide-white/[0.07]">
                  {filteredSongs.map((song) => {
                    const isSelected = song.id === selectedSongId;
                    return (
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
                            <span>{formatLabel(song.category ?? "uncategorized")}</span>
                            {song.difficulty ? <span>{formatLabel(song.difficulty)}</span> : null}
                            {song.physical_rack_map ? <span>Rack {song.physical_rack_map}</span> : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-bold text-lime-300">{isSelected ? "Selected" : "Choose"}</span>
                      </button>
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
