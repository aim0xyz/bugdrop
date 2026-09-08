#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/promo/.render"
OUT="$ROOT/dist/bugdrop-promo-1080p.mp4"
POSTER="$ROOT/dist/bugdrop-promo-poster.png"

FONT_REG="/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_MONO="/System/Library/Fonts/Menlo.ttc"

mkdir -p "$WORK" "$ROOT/dist"

make_base() {
  local output="$1"
  magick -size 1920x1080 xc:'#090a09' \
    -fill '#141713' -draw 'circle 1660,80 2160,580' \
    -fill '#1b211b' -draw 'circle 80,1030 500,610' \
    "$output"
}

add_badge() {
  local image="$1"
  local number="$2"
  local label="$3"
  magick "$image" \
    -fill '#ef4e33' -draw 'circle 1740,920 1830,920' \
    -gravity northwest -font "$FONT_BOLD" -fill '#10110f' -pointsize 34 \
    -annotate +1718+870 "$number" \
    -font "$FONT_MONO" -pointsize 15 \
    -annotate +1691+930 "$label" \
    "$image"
}

make_base "$WORK/scene-01.png"
magick "$WORK/scene-01.png" \
  "$ROOT/extension/icons/128.png" -geometry 176x176+172+170 -composite \
  -font "$FONT_BOLD" -fill '#f7f4ed' -pointsize 152 -gravity northwest \
  -annotate +172+385 'STOP EXPLAINING' \
  -fill '#ef4e33' -annotate +172+545 'BUGS.' \
  -font "$FONT_MONO" -fill '#a9b0a5' -pointsize 28 \
  -annotate +178+780 'WEB  /  iOS  /  ANDROID' \
  "$WORK/scene-01.png"
add_badge "$WORK/scene-01.png" '01' 'CAPTURE'

make_base "$WORK/scene-02.png"
magick "$WORK/scene-02.png" \
  -stroke '#2b3029' -strokewidth 2 -fill none \
  -draw 'roundrectangle 138,170 1782,910 34,34' \
  -stroke none -fill '#ef4e33' -draw 'roundrectangle 140,170 160,910 10,10' \
  -font "$FONT_MONO" -fill '#98a094' -pointsize 26 -gravity northwest \
  -annotate +205+235 'THE OLD WAY' \
  -font "$FONT_BOLD" -fill '#f7f4ed' -pointsize 104 \
  -annotate +205+330 '“IT BROKE.”' \
  -fill '#858d82' -pointsize 46 -annotate +205+510 'No context. No evidence. No clue.' \
  -font "$FONT_MONO" -fill '#ef4e33' -pointsize 28 \
  -annotate +205+720 'DROP THE GUESSWORK  →' \
  "$WORK/scene-02.png"
add_badge "$WORK/scene-02.png" '02' 'REPRO'

make_base "$WORK/scene-03-bg.png"
magick "$ROOT/docs/desktop-preview.png" -resize 1120x -gravity north -crop 1120x720+0+0 +repage \
  -bordercolor '#e9e4da' -border 6 "$WORK/desktop-card.png"
magick "$WORK/scene-03-bg.png" \
  -fill '#00000080' -draw 'roundrectangle 695,165 1845,915 38,38' \
  "$WORK/desktop-card.png" -gravity east -geometry +75+0 -composite \
  -font "$FONT_MONO" -fill '#ef4e33' -pointsize 28 -gravity northwest \
  -annotate +120+185 '01 / CAPTURE' \
  -font "$FONT_BOLD" -fill '#f7f4ed' -pointsize 72 \
  -annotate +120+260 'RECORD THE' -annotate +120+350 'REAL BUG.' \
  -font "$FONT_REG" -fill '#a9b0a5' -pointsize 34 \
  -annotate +120+520 'Clicks. Logs.' -annotate +120+570 'Screenshots. Video.' \
  "$WORK/scene-03.png"
add_badge "$WORK/scene-03.png" '03' 'EVIDENCE'

make_base "$WORK/scene-04-bg.png"
magick "$ROOT/docs/preview.png" -resize 1340x -gravity north -crop 1340x790+0+0 +repage \
  -bordercolor '#e9e4da' -border 6 "$WORK/review-card.png"
magick "$WORK/scene-04-bg.png" \
  -fill '#00000080' -draw 'roundrectangle 80,105 1460,955 38,38' \
  "$WORK/review-card.png" -gravity west -geometry +90+0 -composite \
  -font "$FONT_MONO" -fill '#ef4e33' -pointsize 28 -gravity northwest \
  -annotate +1510+190 '02 / REVIEW' \
  -font "$FONT_BOLD" -fill '#f7f4ed' -pointsize 66 \
  -annotate +1510+270 'KEEP THE' -annotate +1510+350 'CONTEXT.' \
  -font "$FONT_REG" -fill '#a9b0a5' -pointsize 31 \
  -annotate +1510+505 'Remove private' -annotate +1510+550 'evidence first.' \
  "$WORK/scene-04.png"
add_badge "$WORK/scene-04.png" '04' 'REVIEW'

make_base "$WORK/scene-05.png"
magick "$WORK/scene-05.png" \
  -font "$FONT_MONO" -fill '#ef4e33' -pointsize 28 -gravity northwest \
  -annotate +172+185 '03 / HAND OFF' \
  -font "$FONT_BOLD" -fill '#f7f4ed' -pointsize 92 \
  -annotate +172+285 'ONE CLEAN REPORT.' \
  -font "$FONT_BOLD" -pointsize 50 \
  -fill '#ef4e33' -annotate +172+500 '✓' -fill '#f7f4ed' -annotate +250+500 'Steps that reproduce' \
  -fill '#ef4e33' -annotate +172+610 '✓' -fill '#f7f4ed' -annotate +250+610 'Logs + failed requests' \
  -fill '#ef4e33' -annotate +172+720 '✓' -fill '#f7f4ed' -annotate +250+720 'Markdown + JSON export' \
  "$WORK/scene-05.png"
add_badge "$WORK/scene-05.png" '05' 'HAND OFF'

magick "$ROOT/extension/icons/128.png" \
  -alpha set -fuzz 1% -transparent '#e95034' \
  -trim +repage -resize x175 "$WORK/logo-mark.png"

magick -size 1920x1080 xc:'#ef4e33' \
  -fill '#db4029' -draw 'circle 1700,130 2200,630' \
  -fill '#f6654d' -draw 'circle 80,1020 560,540' \
  "$WORK/logo-mark.png" -gravity northwest -geometry +220+176 -composite \
  -font "$FONT_BOLD" -fill '#10110f' -pointsize 170 -gravity northwest \
  -annotate +430+185 'BugDrop' \
  -font "$FONT_BOLD" -fill '#fffaf2' -pointsize 74 \
  -annotate +185+500 'SHOW THE BUG.' -annotate +185+590 'KEEP THE CONTEXT.' \
  -font "$FONT_MONO" -fill '#10110f' -pointsize 30 \
  -annotate +190+790 'LOCAL-FIRST  ·  OPEN SOURCE  ·  MIT' \
  -fill '#fffaf2' -pointsize 31 -annotate +190+895 'github.com/aim0xyz/bugdrop' \
  "$WORK/scene-06.png"

ffmpeg -hide_banner -loglevel error -y \
  -loop 1 -t 3.5 -i "$WORK/scene-01.png" \
  -loop 1 -t 3.5 -i "$WORK/scene-02.png" \
  -loop 1 -t 4.3 -i "$WORK/scene-03.png" \
  -loop 1 -t 4.3 -i "$WORK/scene-04.png" \
  -loop 1 -t 3.5 -i "$WORK/scene-05.png" \
  -loop 1 -t 4.4 -i "$WORK/scene-06.png" \
  -f lavfi -t 21 -i "sine=frequency=55:sample_rate=48000" \
  -f lavfi -t 21 -i "sine=frequency=110:sample_rate=48000" \
  -filter_complex "
    [0:v]scale=1920:1080,fps=30,setsar=1[v0];
    [1:v]scale=1920:1080,fps=30,setsar=1[v1];
    [2:v]scale=1920:1080,fps=30,setsar=1[v2];
    [3:v]scale=1920:1080,fps=30,setsar=1[v3];
    [4:v]scale=1920:1080,fps=30,setsar=1[v4];
    [5:v]scale=1920:1080,fps=30,setsar=1[v5];
    [v0][v1]xfade=transition=fadefast:duration=0.5:offset=3.0[x1];
    [x1][v2]xfade=transition=smoothleft:duration=0.5:offset=6.0[x2];
    [x2][v3]xfade=transition=smoothleft:duration=0.5:offset=9.8[x3];
    [x3][v4]xfade=transition=fadefast:duration=0.5:offset=13.6[x4];
    [x4][v5]xfade=transition=fade:duration=0.5:offset=16.6,format=yuv420p[v];
    [6:a]volume=0.12,lowpass=f=150[a0];
    [7:a]volume=0.045,lowpass=f=420[a1];
    [a0][a1]amix=inputs=2:duration=first,volume=6,afade=t=in:st=0:d=1.2,afade=t=out:st=19.0:d=2.0[a]
  " \
  -map '[v]' -map '[a]' -t 21 \
  -c:v libx264 -preset slow -crf 17 -profile:v high -level 4.2 \
  -c:a aac -b:a 192k -movflags +faststart "$OUT"

magick "$WORK/scene-06.png" -resize 1600x900 "$POSTER"

echo "$OUT"
echo "$POSTER"
