#!/usr/bin/env bash
# Copies the scene renders into this campaign and rebuilds the "hôm qua / hôm nay" comparison.
# Run from the repository root. Without an argument it reads public/ on origin/main (what
# production serves); with a directory argument it reads that public/ folder instead, e.g. a
# checkout where `node scripts/capture-landing-media.mjs` has just run.
set -euo pipefail

CAMPAIGN=assets/campaigns/20261122-ca-ngua-3d-ban-moi/creatives/social
OLD_MATCH=assets/campaigns/20261121-ca-ngua-3d-soft-launch/creatives/raw/match-mobile-390x844.png
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
SRC=$(mktemp -d)
trap 'rm -rf "$SRC"' EXIT

if [[ $# -gt 0 ]]; then
  FROM="$1"
  cp -R "$FROM/." "$SRC/"
else
  FROM="origin/main @ $(git fetch -q origin main && git rev-parse --short origin/main)"
  for f in og-image.jpg landing/hero-mobile.jpg landing/hero-poster.jpg landing/hero.mp4 \
    landing/rule-ra-chuong.webp landing/rule-da-ngua.webp landing/rule-ve-dich.webp; do
    mkdir -p "$SRC/$(dirname "$f")"
    git show "origin/main:public/$f" > "$SRC/$f"
  done
fi

cp "$SRC/og-image.jpg" "$CAMPAIGN/og-1200x630.jpg"
cp "$SRC/landing/hero-mobile.jpg" "$CAMPAIGN/tet-board-780x1560.jpg"
cp "$SRC/landing/hero-poster.jpg" "$CAMPAIGN/tet-board-1280x720.jpg"
cp "$SRC/landing/hero.mp4" "$CAMPAIGN/tet-board-loop-7s.mp4"
for rule in rule-ra-chuong rule-da-ngua rule-ve-dich; do
  magick "$SRC/landing/$rule.webp" "$CAMPAIGN/$rule-800x600.png"
done

magick \
  \( "$OLD_MATCH" -resize 540x1270^ -gravity center -extent 540x1270 \
     -background '#1a0f0a' -gravity north -splice 0x80 -font "$FONT" -pointsize 44 -fill '#f3e3c3' -annotate +0+18 'HÔM QUA' \) \
  \( "$CAMPAIGN/tet-board-780x1560.jpg" -resize 540x1270^ -gravity center -extent 540x1270 \
     -background '#1a0f0a' -gravity north -splice 0x80 -font "$FONT" -pointsize 44 -fill '#f2c14e' -annotate +0+18 'HÔM NAY' \) \
  +append -stroke '#f2c14e' -strokewidth 4 -draw 'line 540,80 540,1350' -quality 90 \
  "$CAMPAIGN/hom-qua-hom-nay-1080x1350.jpg"

echo "Refreshed from $FROM"
ls -la "$CAMPAIGN"
