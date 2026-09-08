#!/usr/bin/env bash
# Download whisper.cpp Linux x64 CLI + tiny.en ggml model for Tokfai STT worker.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$ROOT/bin"
MODEL_DIR="$ROOT/models"
mkdir -p "$BIN_DIR" "$MODEL_DIR"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "Fetching whisper.cpp Ubuntu x64 binaries..."
curl -fsSL -L \
  "https://github.com/ggml-org/whisper.cpp/releases/download/b4938/whisper-bin-ubuntu-x64.tar.gz" \
  -o "$TMP/whisper-bin-ubuntu-x64.tar.gz"
tar -xzf "$TMP/whisper-bin-ubuntu-x64.tar.gz" -C "$TMP"

SRC_DIR="$(find "$TMP" -type d -name 'whisper-bin-ubuntu-x64' | head -1)"
if [ -z "$SRC_DIR" ]; then
  echo "extract dir missing" >&2
  find "$TMP" | head -40 >&2
  exit 1
fi

# CLI + shared libs (libwhisper.so.1 etc.) must sit together for runtime loader.
cp -a "$SRC_DIR"/. "$BIN_DIR"/
chmod +x "$BIN_DIR/whisper-cli" "$BIN_DIR/main" 2>/dev/null || true
# Prefer whisper-cli name
if [ ! -x "$BIN_DIR/whisper-cli" ] && [ -x "$BIN_DIR/main" ]; then
  cp "$BIN_DIR/main" "$BIN_DIR/whisper-cli"
  chmod +x "$BIN_DIR/whisper-cli"
fi
echo "Installed $BIN_DIR/whisper-cli (+ shared libs)"

if [ ! -f "$MODEL_DIR/ggml-tiny.en.bin" ]; then
  echo "Fetching ggml-tiny.en.bin..."
  curl -fsSL -L \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin" \
    -o "$MODEL_DIR/ggml-tiny.en.bin"
fi

# Smoke the binary with libs on LD_LIBRARY_PATH
export LD_LIBRARY_PATH="$BIN_DIR:${LD_LIBRARY_PATH:-}"
"$BIN_DIR/whisper-cli" -h >/dev/null 2>&1 || "$BIN_DIR/whisper-cli" --help >/dev/null 2>&1 || true
ls -lh "$BIN_DIR/whisper-cli" "$BIN_DIR/libwhisper.so.1" "$MODEL_DIR/ggml-tiny.en.bin"
echo "TOKFAI_WHISPER_CPP_READY"
