#!/usr/bin/env bash
# Download each senator's photo, shrink to a ~40px thumbnail, base64-encode it
# into a data: URI, and write data/photos.csv. Inline URIs are CSP-safe in dives.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/img
HOST="https://unitedstates.github.io/images/congress/225x275"

# bioguide list from the spine CSV (skip header)
BGS=$(tail -n +2 data/members_spine.csv | cut -d, -f1)

echo "bioguide_id,photo_uri" > data/photos.csv
ok=0; miss=0
for BG in $BGS; do
  if curl -fsS --max-time 30 -H "User-Agent: Mozilla/5.0" "$HOST/$BG.jpg" -o "data/img/$BG.src.jpg" 2>/dev/null; then
    sips -Z 40 "data/img/$BG.src.jpg" --out "data/img/$BG.jpg" >/dev/null 2>&1 || cp "data/img/$BG.src.jpg" "data/img/$BG.jpg"
    URI=$(duckdb -noheader -list -c "SELECT 'data:image/jpeg;base64,' || base64(content) FROM read_blob('data/img/$BG.jpg')")
    printf '%s,"%s"\n' "$BG" "$URI" >> data/photos.csv
    ok=$((ok+1))
  else
    miss=$((miss+1)); echo "  MISS $BG" >&2
  fi
done
echo "photos: $ok ok, $miss missing" >&2
