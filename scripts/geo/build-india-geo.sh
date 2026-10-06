#!/usr/bin/env bash
# Regenerates public/geo/india_states.geojson + india_districts.geojson from pinned public sources.
# Usage: bash scripts/geo/build-india-geo.sh [outDir=public/geo]
set -euo pipefail
OUT="${1:-public/geo}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
BASE=https://github.com/ramSeraph/indian_admin_boundaries/releases/download
curl -fsSL -o "$WORK/SOI_States.geojsonl.7z"    "$BASE/states/SOI_States.geojsonl.7z"
curl -fsSL -o "$WORK/SOI_Districts.geojsonl.7z" "$BASE/districts/SOI_Districts.geojsonl.7z"
( cd "$WORK" && sha256sum -c - <<'SUMS'
210bbb0d95d7e1b2a7ecd358d855c184521ef8f3cb2cdc566420b6384060f5ce  SOI_States.geojsonl.7z
d160bc8cab093d58ba7f400a4ae44bd3d0ff521b7955bedfb0ff5dc5e8cc72ba  SOI_Districts.geojsonl.7z
SUMS
)
# throwaway toolchain (not added to the app's package.json)
( cd "$WORK" && npm init -y >/dev/null && npm i --silent --no-audit --no-fund mapshaper@0.6.121 7zip-bin@5.2.0 >/dev/null )
SEVENZ="$(cd "$WORK" && node -p "require('7zip-bin').path7za")"; chmod +x "$SEVENZ"
"$SEVENZ" x -y -o"$WORK" "$WORK/SOI_States.geojsonl.7z" >/dev/null
"$SEVENZ" x -y -o"$WORK" "$WORK/SOI_Districts.geojsonl.7z" >/dev/null
node "$HERE/prepare-india-geo.mjs" "$WORK/SOI_States.geojsonl" "$WORK/SOI_Districts.geojsonl" "$WORK"
MS="$WORK/node_modules/.bin/mapshaper"
mkdir -p "$OUT"
"$MS" -i "$WORK/states_clean.geojson"    -simplify 0.9% weighting=0.7 keep-shapes -o "$OUT/india_states.geojson"    format=geojson precision=0.001
"$MS" -i "$WORK/districts_clean.geojson" -simplify 1%   weighting=0.7 keep-shapes -o "$OUT/india_districts.geojson" format=geojson precision=0.001
# one label/bubble anchor per district, computed on the full-resolution polygons (always inside the polygon)
"$MS" -i "$WORK/districts_clean.geojson" -points inner -filter-fields key,name,state_code,state_abbr,disputed -o "$OUT/india_district_points.geojson" format=geojson precision=0.0001
ls -l "$OUT"/india_*.geojson
sha256sum "$OUT"/india_states.geojson "$OUT"/india_districts.geojson "$OUT"/india_district_points.geojson
