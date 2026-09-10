import type { SongCatalogEntry } from './songTypes';

// Browsing groups are independent of arrangement categories, which also drive
// playback behavior. Keep imports and hardware-trial rules intact.
export const SONG_LIBRARY_GROUPS = [
  { id: 'pop', label: 'Pop & ballads' },
  { id: 'rock', label: 'Rock & classics' },
  { id: 'film', label: 'Film & musicals' },
  { id: 'traditional', label: 'Traditional & folk' },
  { id: 'national', label: 'Indonesian national' },
  { id: 'indonesian_pop', label: 'Indonesian pop' },
  { id: 'instrumental', label: 'Instrumental' },
  { id: 'hardware', label: 'Hardware tests' },
] as const;
export type SongLibraryGroup = typeof SONG_LIBRARY_GROUPS[number]['id'];

export function songLibraryGroup(song: SongCatalogEntry): SongLibraryGroup {
  if (song.category === 'hardware_trial') return 'hardware';
  if (['viva_la_vida', 'yellow_coldplay', 'we_are_the_champions'].includes(song.id) || song.category === 'classic_pop') return 'rock';
  if (song.id === 'golden_huntrx' || song.category === 'musical_film') return 'film';
  if (song.id === 'untitled_flute_viola' || ['indonesian_traditional', 'sundanese_angklung_heritage'].includes(song.category ?? '')) return 'traditional';
  if (song.category === 'indonesian_national') return 'national';
  if (song.category === 'indonesian_modern') return 'indonesian_pop';
  if (song.category === 'instrumental') return 'instrumental';
  return 'pop';
}

export function songLibraryGroupLabel(song: SongCatalogEntry): string {
  return SONG_LIBRARY_GROUPS.find(group => group.id === songLibraryGroup(song))!.label;
}
