# Angklobot conversation acceptance tests

These tests assume the active visible catalog is loaded and playback safety validation remains enabled.

| # | User message | Expected behavior |
|---|---|---|
| 1 | `what is an angklung?` | Explain that it is an Indonesian bamboo instrument and each pitch sounds when shaken. |
| 2 | `how does this machine work?` | Explain AI request → catalog → validation → actuator schedule → angklung playback. |
| 3 | `why can't you play Shape of You?` | Explain that unsupported songs need MIDI/MusicXML conversion and G3-C6 validation. |
| 4 | `play Fireflies` | Deterministically match Fireflies and ask for confirmation. |
| 5 | `what songs can you play?` | List active visible catalog songs. |
| 6 | `what makes this AI?` | Explain local Ollama conversation, interpretation, recommendations, and the validation boundary. |
| 7 | `what makes this robotics?` | Explain motorized angklung actuation and the schedule-to-actuator pipeline. |
| 8 | `can you play anything from YouTube?` | State that YouTube reference mode is future work and current playback requires validated arrangements. |
| 9 | `stop` | Stop immediately without an AI request. |
| 10 | `play something emotional` | Recommend an active emotional catalog song and ask for confirmation. |

Safety invariants: exact song titles and aliases are routed before open-ended AI; only active visible catalog IDs survive post-processing; confirmation is required before schedule generation; validation remains final authority; AI never generates notes or motor commands directly.
