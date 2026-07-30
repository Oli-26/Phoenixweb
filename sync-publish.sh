#!/usr/bin/env bash
# Mirror the source app into publish/, which is what netlify.toml deploys.
set -euo pipefail
cd "$(dirname "$0")"

rsync -a --delete css/ publish/css/
rsync -a --delete data/ publish/data/
rsync -a --delete js/ publish/js/
cp index.html auth.html favicon.ico publish/

echo "publish/ synced"
