#!/usr/bin/env bash
# Install the HUD's Electron. Electron's own unzip step can fail on newer Node (it leaves an
# Electron.app with no frameworks), so if that happens, unzip the cached download with macOS's ditto.
set -euo pipefail
cd "$(dirname "$0")"
npm install --no-audit --no-fund
E=node_modules/electron
if [ ! -d "$E/dist/Electron.app/Contents/Frameworks" ]; then
  zip=$(ls ~/Library/Caches/electron/*/electron-v33.2.1-darwin-arm64.zip 2>/dev/null | head -1)
  [ -n "$zip" ] || { (cd "$E" && node install.js); zip=$(ls ~/Library/Caches/electron/*/electron-v33.2.1-darwin-arm64.zip | head -1); }
  rm -rf "$E/dist" && mkdir "$E/dist" && ditto -x -k "$zip" "$E/dist"
fi
printf 'Electron.app/Contents/MacOS/Electron' > "$E/path.txt"
echo "HUD ready. Run: npm start   (or: npm run mock)"
