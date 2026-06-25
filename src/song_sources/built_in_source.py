"""Built-in song source placeholder."""

from src.song_sources.youtube_source import SourceValidationError


def create_built_in_source(*_: object) -> None:
    raise SourceValidationError("Built-in source ingestion is not implemented yet.")
