#!/usr/bin/env bash
# Mirror the source app into publish/, which is what netlify.toml deploys.
set -euo pipefail
cd "$(dirname "$0")"

rsync -a --delete css/ publish/css/
rsync -a --delete data/ publish/data/
rsync -a --delete js/ publish/js/
cp index.html auth.html favicon.ico publish/

hash=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
dirty=$(git diff --quiet 2>/dev/null || echo "+dirty")
stamp=$(date -u +%Y-%m-%d\ %H:%M\ UTC)
echo "export const VERSION = '${hash}${dirty} · ${stamp}';" > publish/js/version.js

echo "publish/ synced (version ${hash}${dirty})"
