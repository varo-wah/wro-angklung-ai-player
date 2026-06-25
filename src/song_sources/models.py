"""Data models for song source ingestion."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


SourceType = Literal["built_in", "local_audio", "youtube_url", "midi", "musicxml"]


@dataclass(frozen=True)
class SourceInput:
    """A normalized request to import a song from a source."""

    source_type: SourceType
    title: str
    path_or_url: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_type": self.source_type,
            "title": self.title,
            "path_or_url": self.path_or_url,
            "metadata": self.metadata,
        }


@dataclass(frozen=True)
class SourceResult:
    """Result of converting a source into internal song JSON."""

    title: str
    source_type: SourceType
    confidence: float
    is_exact: bool
    warnings: tuple[str, ...]
    internal_song_path: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "source_type": self.source_type,
            "confidence": self.confidence,
            "is_exact": self.is_exact,
            "warnings": list(self.warnings),
            "internal_song_path": self.internal_song_path,
        }
