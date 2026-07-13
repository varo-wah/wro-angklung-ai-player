# Song library rules

Angklobot may play only songs that are active, playable, and visible in the catalog at `frontend/public/songs/catalog.json`. Arrangement files live in `frontend/public/songs/arrangements/`, with one JSON file per song.

The assistant must never invent a playable song or claim that an unsupported request is ready. It may recommend validated catalog songs by title, alias, artist, mood, genre, category, tags, or request keywords when those fields are available.

Unsupported songs need MIDI or MusicXML conversion, rack remapping, arrangement review, and validation first. A catalog entry with `demo_safe: false` is a draft or simulator-test arrangement; it is not a claim of final physical motor safety. Final playback authority remains with application validation.
