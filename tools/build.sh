#!/usr/bin/env bash
# Rebuild the self-contained classic bundle (Three.js + game + embedded assets).
# Requires: pip install Pillow numpy  &&  npm i esbuild
set -e
cd "$(dirname "$0")/.."
echo "[1/3] generating textures & sprites (optional if assets/ already present)"
[ "${SKIP_GEN:-}" = "1" ] || python3 tools/gen_assets.py >/dev/null
echo "[2/3] embedding assets as data URIs"
python3 tools/embed_assets.py
echo "[3/3] bundling with esbuild"
npx esbuild src/main.js --bundle --format=iife --minify \
  --alias:three="$(pwd)/vendor/three.module.js" \
  --outfile=dist/game.bundle.js
echo "done -> dist/game.bundle.js ($(du -h dist/game.bundle.js | cut -f1))"
