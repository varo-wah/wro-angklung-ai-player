#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VOICE_DIR="${ANGKLOBOT_VOICE_DIR:-$ROOT_DIR/.voice}"
WHISPER_DIR="$VOICE_DIR/whisper.cpp"
WHISPER_VERSION="v1.8.1"
MODEL_NAME="${ANGKLOBOT_WHISPER_MODEL:-base}"

for command_name in git cmake; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name"
    echo "Install it first, then run this setup again."
    exit 1
  fi
done

mkdir -p "$VOICE_DIR"
if [[ ! -d "$WHISPER_DIR/.git" ]]; then
  git clone --depth 1 --branch "$WHISPER_VERSION" https://github.com/ggml-org/whisper.cpp.git "$WHISPER_DIR"
fi

cmake -S "$WHISPER_DIR" -B "$WHISPER_DIR/build" \
  -DWHISPER_BUILD_SERVER=ON \
  -DWHISPER_BUILD_TESTS=OFF
cmake --build "$WHISPER_DIR/build" --target whisper-server -j --config Release

MODEL_PATH="$WHISPER_DIR/models/ggml-$MODEL_NAME.bin"
if [[ -f "$MODEL_PATH" && $(stat -f%z "$MODEL_PATH") -lt 50000000 ]]; then
  echo "Removing an incomplete model download: $MODEL_PATH"
  rm "$MODEL_PATH"
fi
if [[ ! -f "$MODEL_PATH" ]]; then
  "$WHISPER_DIR/models/download-ggml-model.sh" "$MODEL_NAME"
fi

if [[ $(stat -f%z "$MODEL_PATH") -lt 50000000 ]]; then
  echo "Model download is incomplete. Run this setup again."
  exit 1
fi

echo "Local voice engine ready."
echo "Model: $MODEL_PATH"
echo "Start it with: scripts/start_voice_macos.sh"
