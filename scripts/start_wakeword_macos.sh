#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VOICE_DIR="${ANGKLOBOT_VOICE_DIR:-$ROOT_DIR/.voice}"
PYTHON="$VOICE_DIR/wakeword-venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  echo 'Run scripts/setup_wakeword_macos.sh first.' >&2
  exit 1
fi
cd "$ROOT_DIR"
exec "$PYTHON" -m src.wakeword.service \
  --model "${ANGKLOBOT_WAKEWORD_MODEL:-$VOICE_DIR/wakeword-models/hey_angklobot.onnx}" \
  --features "$VOICE_DIR/wakeword-models" \
  --port "${ANGKLOBOT_WAKEWORD_PORT:-8765}" \
  --threshold "${ANGKLOBOT_WAKEWORD_THRESHOLD:-0.5}" \
  "$@"
