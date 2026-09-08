#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VOICE_DIR="${ANGKLOBOT_VOICE_DIR:-$ROOT_DIR/.voice}"
PYTHON="${ANGKLOBOT_WAKEWORD_PYTHON:-python3}"
"$PYTHON" -m venv "$VOICE_DIR/wakeword-venv"
"$VOICE_DIR/wakeword-venv/bin/python" -m pip install -r "$ROOT_DIR/scripts/requirements-wakeword.txt"
"$VOICE_DIR/wakeword-venv/bin/python" "$ROOT_DIR/scripts/prepare_wakeword_models.py" --output "$VOICE_DIR/wakeword-models"
echo 'Runtime ready. A trained hey_angklobot.onnx is still required; see docs/wakeword-macos.md.'
echo 'List microphones: scripts/start_wakeword_macos.sh --list-devices'
