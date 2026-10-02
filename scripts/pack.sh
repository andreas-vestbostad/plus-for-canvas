#!/bin/sh
# Builds plus-for-canvas-<version>.zip for a GitHub release.
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
OUT="plus-for-canvas-$VERSION.zip"
rm -f "$OUT"
zip -qr "$OUT" manifest.json src options icons _locales LICENSE -x "icons/icon.svg"
echo "$OUT"
