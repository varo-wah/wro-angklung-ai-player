"""Local audio source placeholder."""

from src.song_sources.youtube_source import SourceValidationError


def create_local_audio_source(*_: object) -> None:
    raise SourceValidationError("Local audio transcription is not implemented yet.")
