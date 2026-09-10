# Four MIDI showcase arrangements — 9 September 2026

These are four individually configured arrangements, added to the existing local catalog. The original Downloads MIDI files and existing arrangements are preserved. No firmware upload, physical audition, commit, or deployment was performed.

Review completed: source-track comparison, representative chorus pitches, melodic contour, density, dynamics, original onset/tempo preservation, actual loader/scheduler/serial output, and live catalog visibility. Synthesized audition clips are in `outputs/showcase-review/index.html`. They use the application's triangle oscillator and shake envelope. Listening acceptance and physical calibration remain pending; software checks do not certify recognizability.

Track numbers below are zero-based Tone.js track indices. Program changes split some original musical tracks into several parsed tracks. Section labels without lyrics are inferred from MIDI phrase/register/texture changes, not an authoritative lyric alignment.

## Under the Sea — The Little Mermaid

- **Lead:** track 1, steel drums, carries the syllabic vocal melody. It is distinct from the instrumental steel-drum opening. Track 24 duplicates it and is removed. Track 3 provides the opening hook only.
- **Texture:** 539 lead attacks, 333 extra attacks. Selected muted-guitar syncopations and sparse fretless-bass roots preserve rhythmic motion. Marimba ostinatos, piccolo flourishes, backing voices, drums, and doubled ensemble tracks are excluded. Only one extra voice at a time.
- **Pitch:** +7 semitones, principally B-flat to F; octave placement follows phrases. Nine lead/intro attacks require one-semitone natural-note adaptation. Seven implausible C2/B-flat1/D2 lead notes at 68.65–70.17s are repaired three octaves upward before transposition. The final octave gesture at 189.28s is compressed to a repeated pitch to stay within the rack.
- **Handling:** the bouncy source articulation is retained instead of applying the global 50% sustain extension. Eleven extremely close ornaments are removed while keeping the following principal attack at its original time. Extra pulses are 120ms. The later source modulation is retained through the same transposition.
- **Physical audition:** listen for clear short melody attacks and enough 120ms low-note response. The chorus should remain above the syncopated support; adjust calibration only after hearing it on the rack.

## Golden — HUNTR/X

- **Lead:** extracted from track 0, named Harp but using a piano program. A continuity- and velocity-led voice selection replaces a highest-note-only pass. In particular, the repeated G4 vocal notes at 50.16–51.15s remain repeated instead of jumping to the piano's E5/D5 harmonies. Thirty-one inner attacks beneath held lead notes are excluded.
- **Texture:** 515 lead attacks and 225 extras. Keep selected left-hand roots, occasional two-note chorus support, rising figures, and repeated-note climax. Remove running left-hand subdivisions, octave doubles and inner sustained piano voices.
- **Pitch:** -7 semitones, G-based source to C-based rack arrangement. Zero accidental substitutions and zero additional interval changes in the extracted lead. This places parts of the vocal in the lower/middle rack; conflicting bass events yield to it rather than forcing abrupt melody octave jumps.
- **Handling:** preserve the MIDI's actual timing and tempo changes, including the slowing outro. Normalize the unusually low piano velocities into explicit section dynamics; later choruses and the repeated-note climax are stronger. Extras use 140ms pulses. The lower sung voice under chorus harmony was explicitly reworked after the first pass.
- **Physical audition:** check the lower vocal register and roughly 160ms repeated attacks first. Voice extraction from one piano track remains the largest musical uncertainty; audition the chorus before treating it as a finished showcase.

## Let It Go — Idina Menzel

- **Lead:** the Cello line is syllabic/monophonic; the Piano alternative is mostly chord repetitions and fills. Preserve parsed tracks 0, 1 and 2 as one musical line through late program changes to organ/tubular bells. Piano top voice supplies the instrumental introduction only.
- **Texture:** 359 melody/intro attacks and 151 extras. Sparse Sound 3 roots in the opening; selected second chord tones in choruses. Exclude percussion, pizzicato runs, busy high piano fills and orchestral stuck notes.
- **Pitch:** +4 semitones, A-flat to C. Nine one-semitone adaptations: one in the piano introduction and eight in the bridge. The main chorus needs no accidental substitutions. Vocal range fits by uniform transposition; the introduction is placed in the rack by octave.
- **Handling:** intimate verse → build → fuller choruses → strongest final chorus. Melody section strength rises from 0.80 to 1.25 before the master slider. Preserve long vocal holds, capped at 3.8s so Slower still fits the 5s protocol limit. Avoid filling the middle of sustained vocals with support pulses; extras are 160ms.
- **Physical audition:** check quiet low melody audibility, sustained chorus stability and whether final-chorus harmony masks the lead. Do not fix a quiet verse by flattening the entire song's dynamics.

## We Are the Champions — Queen

Playback now starts at the first “We are the champions” chorus (original MIDI 36.96s), shifted to 0s. The remaining song follows in order. Source/audit timestamps below retain their original values.

- **Lead:** track 9 strings matches embedded karaoke lyric timestamps. Track 15 is a delayed duplicate and is excluded. Piano 1 contributes only the vocal-free transition and ending as instrumental lead.
- **Texture:** 156 melody/transition attacks and 101 extras after the chorus-start trim. Restrained piano-root support in verses; selected paired chord tones in choruses. Remove duplicate guitars, choir clutter, delayed strings, drum kit and bass fills.
- **Pitch:** +7 semitones, with complete source choruses lowered one octave before transposition. This preserves the chorus opening as C5–B4–C5–B4–G4–E4–A4, rather than changing its characteristic semitones to whole tones. The full-source audit records twenty-five chromatic attacks adapted by one semitone across verses, fills and later chorus material. No contour reversals or isolated octave folds remain after the deliberate chorus-register adjustment.
- **Handling:** preserve original expressive onsets, long vocal holds and the ending's 95→76 BPM slowdown. Later refrains become stronger. Extra pulses remain 160ms and do not fill the middle of long vocal notes.
- **Physical audition:** check long chorus notes, short paired harmony pulses and low verse response. Review altered minor/blues inflections outside the chorus opening on the actual instrument.

## Playback integration and reproducibility

`playback_policy: "authored"` passes through the song loader. For these four songs only, the scheduler preserves the authored section strengths and melody durations instead of applying the generic Extra power floor or 50% melody extension. The master strength and Slower controls still work. Extra holds remain at most 180ms. `preserve_authored_dynamics` also prevents the existing library-balancing script from flattening these dynamics.

The importer records source filenames, SHA-256 hashes, track/note indices, original times/durations, every accidental substitution, octave repairs, removed ornaments, and section settings. It keeps original MIDI seconds, including tempo maps; it does not quantize the source to a new grid. Accompaniment is rejected when it conflicts with melody on the same rack note.

Rebuild from the unchanged supplied Downloads files:

```sh
cd frontend
node scripts/import-showcase.mjs                 # Inspect counts without writing
node scripts/import-showcase.mjs --write         # Update only these four entries
node scripts/render-showcase-review.cjs         # Local simulator audition clips
node --test tests/showcase-arrangements.test.cjs
```

All four schedules pass the validator in Melody only / Melody with Extra and Normal / Slower, with at most three simultaneous notes, no actual same-channel hold overlaps, valid serial encoding, and preserved source attacks. Tests also protect specific vocal anchors, section contrasts and original tempo changes. TypeScript passes. The full suite retains two unrelated baseline failures: firmware calibration expectations and the old arrangement balance hash snapshot.
