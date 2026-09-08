export type SongPerformanceProfile = { tempo_bpm: number; release_seconds: number; repeat_gap_seconds: number; source_bpm: number; attack_interval_q25_seconds: number };

// Explicit operator-tuning defaults; source scores remain unchanged.
export const SONG_PERFORMANCE_PROFILES: Record<string, SongPerformanceProfile> = {
  "a_whole_new_world": {
    "tempo_bpm": 97,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 108,
    "attack_interval_q25_seconds": 0.284
  },
  "perfect_musescore_ver": {
    "tempo_bpm": 108,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 120.0,
    "attack_interval_q25_seconds": 0.25
  },
  "viva_la_vida": {
    "tempo_bpm": 110,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 138.000193,
    "attack_interval_q25_seconds": 0.217
  },
  "count_on_me": {
    "tempo_bpm": 71,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 89.00004,
    "attack_interval_q25_seconds": 0.169
  },
  "see_you_again": {
    "tempo_bpm": 64,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 80,
    "attack_interval_q25_seconds": 0.188
  },
  "memories_maroon5": {
    "tempo_bpm": 70,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 88,
    "attack_interval_q25_seconds": 0.17
  },
  "fireflies_owl_city": {
    "tempo_bpm": 74,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 92,
    "attack_interval_q25_seconds": 0.163
  },
  "yellow_coldplay": {
    "tempo_bpm": 73,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 81,
    "attack_interval_q25_seconds": 0.37
  },
  "photograph_ed_sheeran": {
    "tempo_bpm": 97,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 108,
    "attack_interval_q25_seconds": 0.278
  },
  "a_thousand_years_christina_perri": {
    "tempo_bpm": 128,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 160,
    "attack_interval_q25_seconds": 0.188
  },
  "bubuy_bulan": {
    "tempo_bpm": 100,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 111,
    "attack_interval_q25_seconds": 0.252
  },
  "die_with_a_smile": {
    "tempo_bpm": 66,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 82.5,
    "attack_interval_q25_seconds": 0.182
  },
  "all_of_me": {
    "tempo_bpm": 108,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 120,
    "attack_interval_q25_seconds": 0.25
  },
  "just_the_way_you_are": {
    "tempo_bpm": 98,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 109,
    "attack_interval_q25_seconds": 0.275
  },
  "lantas": {
    "tempo_bpm": 77,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 86,
    "attack_interval_q25_seconds": 0.349
  },
  "love_story": {
    "tempo_bpm": 105,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 117,
    "attack_interval_q25_seconds": 0.256
  },
  "peaches": {
    "tempo_bpm": 96,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 120,
    "attack_interval_q25_seconds": 0.165
  },
  "river_flows_in_you": {
    "tempo_bpm": 58,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 65,
    "attack_interval_q25_seconds": 0.231
  },
  "shape_of_you": {
    "tempo_bpm": 96,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 120,
    "attack_interval_q25_seconds": 0.15
  },
  "someone_you_loved": {
    "tempo_bpm": 99,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 110,
    "attack_interval_q25_seconds": 0.273
  },
  "tokecang": {
    "tempo_bpm": 112,
    "release_seconds": 0.04,
    "repeat_gap_seconds": 0.06,
    "source_bpm": 140,
    "attack_interval_q25_seconds": 0.214
  },
};
