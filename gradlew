#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VER="8.9"
DIST="$ROOT/.gradle-dist/gradle-$VER"
if [[ ! -x "$DIST/bin/gradle" ]]; then
  mkdir -p "$ROOT/.gradle-dist"
  ZIP="$ROOT/.gradle-dist/gradle-$VER-bin.zip"
  echo "Téléchargement Gradle $VER…"
  curl -L --fail --retry 3 "https://services.gradle.org/distributions/gradle-$VER-bin.zip" -o "$ZIP"
  unzip -q -o "$ZIP" -d "$ROOT/.gradle-dist"
fi
exec "$DIST/bin/gradle" "$@"
