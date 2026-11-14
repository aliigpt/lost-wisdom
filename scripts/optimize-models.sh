#!/usr/bin/env bash
# Shrinks every .glb in game/public/models: textures resized and converted to WebP.
# Usage: npm run optimize-models   (run after adding new models from Higgsfield)
set -euo pipefail
cd "$(dirname "$0")/../game/public/models"
for f in *.glb; do
  size=1024
  case "$f" in
    tree-*|rocks*) size=512 ;;                          # many copies, seen from afar
    clock-tower*|cottage*|bridge*) size=2048 ;;         # landmarks seen up close: keep them sharp
  esac
  before=$(du -k "$f" | cut -f1)
  npx gltf-transform optimize "$f" "$f.tmp.glb" --texture-compress webp --texture-size "$size" --simplify false --compress false > /dev/null
  mv "$f.tmp.glb" "$f"
  echo "$f: ${before} KB -> $(du -k "$f" | cut -f1) KB"
done
