#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINATION="${1:-$SCRIPT_DIR/../bgm}"
BASE_URL="https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com"

tracks=(
  "comedy|Alls Fair In Love"
  "electronic|3 am West End"
  "epic|Adventure"
  "horror|Alien Invasion"
  "misc|A Good Bass for Gambling"
  "romantic|A Very Brady Special"
  "scoring|Action Strike"
  "upbeat|Advertime"
  "world|Aquatic City Vanished"
)

for entry in "${tracks[@]}"; do
  mood="${entry%%|*}"
  title="${entry#*|}"
  directory="$DESTINATION/$mood"
  output="$directory/$title.mp3"
  partial="$output.part"
  encoded_name="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$title.mp3")"

  mkdir -p "$directory"
  if [[ -s "$output" ]]; then
    echo "already present: $mood/$title.mp3"
    continue
  fi

  curl --fail --location --retry 3 --silent --show-error \
    "$BASE_URL/$encoded_name" \
    --output "$partial"
  [[ -s "$partial" ]]
  mv "$partial" "$output"
  echo "downloaded: $mood/$title.mp3"
done
