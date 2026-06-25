"""CLI for converting source inputs into internal song JSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from src.song_sources.models import SourceInput, SourceResult, SourceType
from src.song_sources.youtube_source import (
    SourceValidationError,
    create_youtube_source,
    get_youtube_source_warnings,
)
from src.transcription.mock_transcriber import transcribe_mock
from src.transcription.transcription_to_song import transcription_to_song_dict, write_internal_song


def process_source(source_input: SourceInput, output_dir: str | Path = "songs/imported") -> SourceResult:
    """Run mocked transcription and write internal song JSON."""

    note_events = transcribe_mock(source_input)
    song_data = transcription_to_song_dict(source_input.title, note_events)
    output_path = write_internal_song(song_data, output_dir=output_dir)

    warnings = get_source_warnings(source_input)
    return SourceResult(
        title=source_input.title,
        source_type=source_input.source_type,
        confidence=0.25,
        is_exact=False,
        warnings=warnings,
        internal_song_path=str(output_path),
    )


def build_source_input(source_type: SourceType, title: str, path_or_url: str) -> SourceInput:
    """Create a normalized source input for supported source types."""

    if source_type == "youtube_url":
        return create_youtube_source(path_or_url, title)

    raise SourceValidationError(f"Source type is not implemented yet: {source_type}")


def get_source_warnings(source_input: SourceInput) -> tuple[str, ...]:
    if source_input.source_type == "youtube_url":
        return get_youtube_source_warnings(source_input)
    return ()


def main() -> None:
    parser = argparse.ArgumentParser(description="Process a song source into internal song JSON.")
    parser.add_argument(
        "--source-type",
        required=True,
        choices=("built_in", "local_audio", "youtube_url", "midi", "musicxml"),
    )
    parser.add_argument("--url", help="URL for youtube_url sources.")
    parser.add_argument("--path", help="Path for local file sources.")
    parser.add_argument("--title", required=True)
    parser.add_argument("--output-dir", default="songs/imported")
    args = parser.parse_args()

    path_or_url = args.url or args.path
    if not path_or_url:
        parser.error("--url or --path is required.")

    try:
        source_input = build_source_input(args.source_type, args.title, path_or_url)
        result = process_source(source_input, output_dir=args.output_dir)
    except SourceValidationError as exc:
        parser.error(str(exc))

    print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
