"""MIDI source placeholder."""

from src.song_sources.youtube_source import SourceValidationError


def create_midi_source(*_: object) -> None:
    raise SourceValidationError("MIDI import is not implemented yet.")
