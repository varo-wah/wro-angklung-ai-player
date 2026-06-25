"""YouTube source validation for future piano reference mode."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from src.song_sources.models import SourceInput


YOUTUBE_MOCK_WARNING = "Real YouTube audio extraction/transcription is not implemented yet; using mocked transcription."


class SourceValidationError(ValueError):
    """Raised when a song source input is invalid."""


def create_youtube_source(url: str, title: str) -> SourceInput:
    """Validate a YouTube URL and return normalized source input."""

    normalized_url = url.strip()
    normalized_title = title.strip()
    if not normalized_title:
        raise SourceValidationError("YouTube source title must be a non-empty string.")
    if not is_valid_youtube_url(normalized_url):
        raise SourceValidationError(f"Invalid YouTube URL: {url}")

    return SourceInput(
        source_type="youtube_url",
        title=normalized_title,
        path_or_url=normalized_url,
        metadata={
            "provider": "youtube",
            "transcription_mode": "mock",
            "warning": YOUTUBE_MOCK_WARNING,
        },
    )


def get_youtube_source_warnings(_: SourceInput) -> tuple[str, ...]:
    """Return warnings attached to mocked YouTube ingestion."""

    return (YOUTUBE_MOCK_WARNING,)


def is_valid_youtube_url(url: str) -> bool:
    """Return True when the URL looks like a YouTube watch or short URL."""

    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if parsed.scheme not in {"http", "https"}:
        return False

    if host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
        if parsed.path == "/watch":
            video_ids = parse_qs(parsed.query).get("v", [])
            return any(video_id.strip() for video_id in video_ids)
        return parsed.path.startswith("/shorts/") and len(parsed.path.split("/")) >= 3

    if host == "youtu.be":
        return bool(parsed.path.strip("/"))

    return False
