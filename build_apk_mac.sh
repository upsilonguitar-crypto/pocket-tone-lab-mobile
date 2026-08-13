#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  echo "ANDROID_HOME / ANDROID_SDK_ROOT n'est pas défini."
  echo "Installe Android Studio puis ouvre Settings > Android SDK et installe Android SDK Platform 35."
  exit 1
fi
if [[ -x ./gradlew ]]; then
  ./gradlew :app:assembleDebug
elif command -v gradle >/dev/null 2>&1; then
  gradle :app:assembleDebug
else
  echo "Gradle introuvable. Installe Android Studio ou Gradle."
  exit 1
fi
APK="app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK" ]]; then
  echo ""
  echo "APK généré: $APK"
else
  echo "Build terminé mais APK introuvable."
  exit 1
fi
