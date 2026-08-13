#!/usr/bin/env bash
set -euo pipefail
REPO="https://github.com/upsilonguitar-crypto/pocket-tone-lab-mobile.git"
if [ ! -d .git ]; then
  git init
fi
git branch -M main
git add .
if ! git diff --cached --quiet; then
  git commit -m "Pocket Tone Lab Mobile X"
fi
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO"
else
  git remote add origin "$REPO"
fi
git push -u origin main
printf '\nPush terminé. GitHub Actions va maintenant compiler l\047APK.\n'
