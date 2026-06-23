from pathlib import Path

import pytest

from src.song_parser import Note, Song, SongParseError, load_song, parse_song


def test_parse_song_returns_typed_song() -> None:
    song = parse_song(
        {
            "title": "Test Song",
            "tempo_bpm": 100,
            "notes": [
                {"note": "C4", "start": 0, "duration": 0.5},
                {"note": "D4", "start": 0.5, "duration": 0.25},
            ],
        }
    )

    assert song == Song(
        title="Test Song",
        tempo_bpm=100,
        notes=(
            Note(note="C4", start=0.0, duration=0.5),
            Note(note="D4", start=0.5, duration=0.25),
        ),
    )


def test_load_song_reads_json_file(tmp_path: Path) -> None:
    song_path = tmp_path / "song.json"
    song_path.write_text(
        """
        {
          "title": "File Song",
          "tempo_bpm": 90,
          "notes": [{"note": "A4", "start": 0, "duration": 1}]
        }
        """,
        encoding="utf-8",
    )

    song = load_song(song_path)

    assert song.title == "File Song"
    assert song.notes[0].note == "A4"


@pytest.mark.parametrize(
    "raw_song",
    [
        {},
        {"title": "", "tempo_bpm": 120, "notes": [{"note": "C4", "start": 0, "duration": 1}]},
        {"title": "Bad", "tempo_bpm": 0, "notes": [{"note": "C4", "start": 0, "duration": 1}]},
        {"title": "Bad", "tempo_bpm": 120, "notes": []},
        {"title": "Bad", "tempo_bpm": 120, "notes": [{"note": "", "start": 0, "duration": 1}]},
        {"title": "Bad", "tempo_bpm": 120, "notes": [{"note": "C4", "start": -1, "duration": 1}]},
        {"title": "Bad", "tempo_bpm": 120, "notes": [{"note": "C4", "start": 0, "duration": 0}]},
    ],
)
def test_parse_song_rejects_invalid_data(raw_song: dict) -> None:
    with pytest.raises(SongParseError):
        parse_song(raw_song)
