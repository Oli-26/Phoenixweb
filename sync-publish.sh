#!/usr/bin/env bash
# Mirror the source app into publish/, which is what netlify.toml deploys.
set -euo pipefail
cd "$(dirname "$0")"

# Read the working-tree state before the rsync, which would otherwise dirty
# publish/js/version.js itself and make every build report +dirty.
hash=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
dirty=$(git diff --quiet 2>/dev/null || echo "+dirty")

rsync -a --delete css/ publish/css/
rsync -a --delete data/ publish/data/
rsync -a --delete js/ publish/js/
cp index.html auth.html favicon.ico publish/

stamp=$(date -u +%Y-%m-%d\ %H:%M\ UTC)
echo "export const VERSION = '${hash}${dirty} · ${stamp}';" > publish/js/version.js

echo "publish/ synced (version ${hash}${dirty})"
