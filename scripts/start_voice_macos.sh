#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VOICE_DIR="${ANGKLOBOT_VOICE_DIR:-$ROOT_DIR/.voice}"
WHISPER_DIR="$VOICE_DIR/whisper.cpp"
MODEL_NAME="${ANGKLOBOT_WHISPER_MODEL:-base}"
SERVER_BIN="$WHISPER_DIR/build/bin/whisper-server"
MODEL_PATH="$WHISPER_DIR/models/ggml-$MODEL_NAME.bin"

if [[ ! -x "$SERVER_BIN" || ! -f "$MODEL_PATH" ]]; then
  echo "Voice engine is not installed. Run scripts/setup_voice_macos.sh first."
  exit 1
fi

exec "$SERVER_BIN" \
  --host 127.0.0.1 \
  --port "${ANGKLOBOT_WHISPER_PORT:-8080}" \
  --model "$MODEL_PATH" \
  --threads "${ANGKLOBOT_WHISPER_THREADS:-4}"
