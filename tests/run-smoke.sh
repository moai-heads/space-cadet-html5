#!/usr/bin/env bash
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROMIUM_BIN="${CHROMIUM_BIN:-chromium}"
VIRTUAL_TIME_BUDGET="${VIRTUAL_TIME_BUDGET:-4000}"

if ! command -v "$CHROMIUM_BIN" >/dev/null 2>&1; then
  echo "ERROR: Chromium executable not found: $CHROMIUM_BIN" >&2
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required to serve the test pages" >&2
  exit 2
fi

cd "$ROOT_DIR"
node --check app.js

tmp_dir="$(mktemp -d)"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

port="$(python3 - <<'PY'
import socket
sock = socket.socket()
sock.bind(('127.0.0.1', 0))
print(sock.getsockname()[1])
sock.close()
PY
)"
python3 -m http.server "$port" --bind 127.0.0.1 >"$tmp_dir/server.log" 2>&1 &
server_pid=$!
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${port}/tests/input-smoke.html" >/dev/null 2>&1; then break; fi
  sleep .1
done

TESTS=(
  input-smoke
  table-features-smoke
  ramps-smoke
  rules-smoke
  tuning-smoke
  deck-scaffold-smoke
  deck-layers-smoke
  deck-metadata-smoke
  deck-access-smoke
  deck-routing-smoke
  deck-apron-smoke
  deck-palette-smoke
  deck-regression-smoke
  deck-comparison-smoke
  layout-smoke
  audio-smoke
  sound-smoke
  mission-sound-smoke
  controls-smoke
  ui-smoke
  presentation-smoke
  performance-smoke
  offline-smoke
)
GAMEPLAY_SIZES=(1280,900 900,700 390,844)

passed=0
failed=0
for test in "${TESTS[@]}"; do
  output="$tmp_dir/${test}.html"
  errors="$tmp_dir/${test}.err"
  args=(
    --headless
    --no-sandbox
    --disable-gpu
    --hide-scrollbars
    --virtual-time-budget="$VIRTUAL_TIME_BUDGET"
    --dump-dom
    "http://127.0.0.1:${port}/tests/${test}.html"
  )
  case "$test" in
    audio-smoke|sound-smoke|mission-sound-smoke|controls-smoke|ui-smoke|presentation-smoke|performance-smoke|gameplay-smoke)
      args+=(--autoplay-policy=no-user-gesture-required)
      ;;
  esac

  if "$CHROMIUM_BIN" "${args[@]}" >"$output" 2>"$errors" \
    && grep -q 'data-smoke="pass"' "$output"; then
    printf 'PASS  %s\n' "$test"
    passed=$((passed + 1))
  else
    printf 'FAIL  %s\n' "$test"
    grep -o '<pre id="result">[^<]*' "$output" | head -1 || true
    tail -3 "$errors" >&2 || true
    failed=$((failed + 1))
  fi
done

for size in "${GAMEPLAY_SIZES[@]}"; do
  label="gameplay-smoke[${size/,/_}]"
  safe_size="${size/,/_}"
  output="$tmp_dir/gameplay-${safe_size}.html"
  errors="$tmp_dir/gameplay-${safe_size}.err"
  args=(
    --headless
    --no-sandbox
    --disable-gpu
    --hide-scrollbars
    --window-size="$size"
    --virtual-time-budget=6000
    --dump-dom
    "http://127.0.0.1:${port}/tests/gameplay-smoke.html"
    --autoplay-policy=no-user-gesture-required
  )
  if "$CHROMIUM_BIN" "${args[@]}" >"$output" 2>"$errors" \
    && grep -q 'data-smoke="pass"' "$output"; then
    printf 'PASS  %s\n' "$label"
    passed=$((passed + 1))
  else
    printf 'FAIL  %s\n' "$label"
    grep -o '<pre id="result">[^<]*' "$output" | head -1 || true
    tail -3 "$errors" >&2 || true
    failed=$((failed + 1))
  fi
done

printf '\nRegression result: %d passed, %d failed\n' "$passed" "$failed"
if (( failed > 0 )); then exit 1; fi
