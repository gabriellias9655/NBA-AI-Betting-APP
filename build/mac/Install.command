#!/bin/bash
# Double-click this file after opening the DMG (or unzipping the download).
# It removes macOS "downloaded from internet" quarantine and installs the app.
set -euo pipefail

APP_NAME="World Cup 2026 Lab.app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC=""

if [ -d "$SCRIPT_DIR/$APP_NAME" ]; then
  SRC="$SCRIPT_DIR/$APP_NAME"
else
  for vol in /Volumes/World\ Cup\ 2026\ Lab*; do
    if [ -d "$vol/$APP_NAME" ]; then
      SRC="$vol/$APP_NAME"
      break
    fi
  done
fi

if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  osascript -e 'display alert "World Cup 2026 Lab not found" message "Place Install.command in the same folder as World Cup 2026 Lab.app, or drag the app to Applications and run in Terminal:\nxattr -cr \"/Applications/World Cup 2026 Lab.app\""' || true
  exit 1
fi

echo "Removing download quarantine (required for apps from public URLs)…"
xattr -cr "$SRC" 2>/dev/null || true

DEST="/Applications/$APP_NAME"
if [ -d "$DEST" ]; then
  rm -rf "$DEST"
fi

echo "Installing to Applications…"
ditto "$SRC" "$DEST"
xattr -cr "$DEST" 2>/dev/null || true

echo "Done. Opening World Cup 2026 Lab…"
open "$DEST"
