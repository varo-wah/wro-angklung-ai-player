"""MusicXML source placeholder."""

from src.song_sources.youtube_source import SourceValidationError


def create_musicxml_source(*_: object) -> None:
    raise SourceValidationError("MusicXML import is not implemented yet.")
