#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATUS_CONFIG="$FRONTEND_DIR/status-site/runtime-config.js"
FIREBASE_PROJECT="${ANGKLOBOT_FIREBASE_PROJECT:-angklobot-control-panel}"
FIREBASE_TARGET="${ANGKLOBOT_FIREBASE_TARGET:-status}"
LOCAL_ORIGIN="${ANGKLOBOT_LOCAL_ORIGIN:-http://localhost:3000}"
TUNNEL_LOG="$(mktemp -t angklobot-cloudflared.XXXXXX)"
TUNNEL_PID=""

cleanup() {
  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT INT TERM

for required_command in cloudflared curl firebase; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Missing required command: $required_command"
    exit 1
  fi
done

if ! curl --fail --silent --show-error --max-time 5 "$LOCAL_ORIGIN/api/system/status" >/dev/null; then
  echo "Angklobot is not reachable at $LOCAL_ORIGIN."
  echo "Start Ollama, Whisper, and Next.js before running this script."
  exit 1
fi

echo "Starting a free Cloudflare Quick Tunnel…"
cloudflared tunnel --url "$LOCAL_ORIGIN" --no-autoupdate --logfile "$TUNNEL_LOG" >/dev/null 2>&1 &
TUNNEL_PID="$!"

TUNNEL_URL=""
for _ in {1..30}; do
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Cloudflare Tunnel stopped before returning an address."
    exit 1
  fi
  TUNNEL_URL="$(sed -nE 's|.*(https://[a-z0-9-]+\.trycloudflare\.com).*|\1|p' "$TUNNEL_LOG" | head -n 1)"
  [[ -n "$TUNNEL_URL" ]] && break
  sleep 1
done

if [[ ! "$TUNNEL_URL" =~ ^https://[a-z0-9-]+\.trycloudflare\.com$ ]]; then
  echo "Cloudflare did not provide a valid Quick Tunnel address."
  exit 1
fi

printf 'window.ANGKLOBOT_STATUS_CONFIG = {\n  backendOrigin: "%s",\n  refreshIntervalMs: 10000,\n};\n' "$TUNNEL_URL" > "$STATUS_CONFIG"

echo "Publishing the current tunnel address to Firebase Hosting…"
cd "$FRONTEND_DIR"
firebase deploy \
  --only "hosting:$FIREBASE_TARGET" \
  --config "$FRONTEND_DIR/firebase.status.json" \
  --project "$FIREBASE_PROJECT"

echo
echo "Angklobot tunnel: $TUNNEL_URL/guest"
echo "Firebase status page: check the Hosting URL shown above"
echo "Leave this process running. Press Ctrl+C to take Angklobot offline."
wait "$TUNNEL_PID"
