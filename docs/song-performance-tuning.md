# Angklobot tempo and articulation report

21 musical arrangements receive slower performance presets. The score JSON, pitches, note counts, volume tuning, and hardware calibration remain unchanged.

## Tempo changes

| Song | Source BPM | Tuned BPM | Reduction |
|---|---:|---:|---:|
| A Whole New World | 108 | 97 | 10.2% |
| Perfect | 120 | 108 | 10.0% |
| Viva La Vida | 138 | 110 | 20.3% |
| Count on Me | 89 | 71 | 20.2% |
| See You Again | 80 | 64 | 20.0% |
| Memories | 88 | 70 | 20.5% |
| Fireflies | 92 | 74 | 19.6% |
| Yellow | 81 | 73 | 9.9% |
| Photograph | 108 | 97 | 10.2% |
| A Thousand Years | 160 | 128 | 20.0% |
| Bubuy Bulan | 111 | 100 | 9.9% |
| Die With a Smile | 82.5 | 66 | 20.0% |
| All of Me | 120 | 108 | 10.0% |
| Just the Way You Are | 109 | 98 | 10.1% |
| Lantas | 86 | 77 | 10.5% |
| Love Story | 117 | 105 | 10.3% |
| Peaches | 120 | 96 | 20.0% |
| River Flows in You | 65 | 58 | 10.8% |
| Shape of You | 120 | 96 | 20.0% |
| Someone You Loved | 110 | 99 | 10.0% |
| Tokecang | 140 | 112 | 20.0% |

## Preserved

Indonesia Raya (92 BPM), Indonesia Pusaka (65 BPM with a 66 BPM final section), Tanah Airku (120 BPM), hardware trials, and the already sparse Can’t Help Falling in Love (67 BPM) retain their supplied timing and articulation. Bengawan Solo now uses its replacement single-staff score at 76 BPM. You Are the Reason uses its supplied 86 BPM dynamic-hold arrangement with softer short low notes. These supplied-score arrangements remain outside the generic slowdown profile. The unused legacy Perfect score is unchanged.

## Articulation

- Uniformly stretch attack times to the tuned tempo for both beat-based and seconds-based arrangements.
- Trim up to 40 ms from each stretched hold, limited to 25% in the general trim. Existing Fireflies articulation remains in effect.
- Target 60 ms silence before the next activation of the same channel when feasible; keep at least 70 ms hold, or the existing shorter hold for notes already under 70 ms.
- A repeat with insufficient available spacing cannot meet the target gap. Simultaneous duplicate notes and dense chords are preserved, not silently dropped.
- Strength multipliers and existing calibration are unchanged.

## Selection method and limits

Attack starts within 30 ms were grouped to avoid counting rolled chords as independent fast passages. Songs with a lower-quartile attack interval below 220 ms received approximately 20% tempo reduction; the remaining selected songs approximately 10%. These are initial operator-tuning presets, not measured motor certification. Slowing and release gaps do not reduce chord size or eliminate residual ringing.

## Testing

Preset tests check all 23 songs for uniform start-time scaling, exact note count/pitch/strength preservation, and shorter holds. Exclusion and repeat-gap tests pass. Typecheck passes. Full suite: 78 pass, with the same two existing firmware assertion failures. At tuned default tempo, no profiled command exceeds the existing 5-second serial duration limit. There are still 13 same-channel transitions below the 60 ms target, including coincident events or spacing too short to preserve the minimum pulse; these need listening review or source-arrangement edits.

## Test in the website

Refresh, reselect a song, keep Tuned default, click Generate, then Play Simulation or use your existing Arduino connection. The displayed BPM shows the selected performance tempo. Slower applies a further 20% BPM reduction.
