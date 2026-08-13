# Push rapide vers GitHub

Dépôt cible : `upsilonguitar-crypto/pocket-tone-lab-mobile`

Depuis macOS :

```bash
cd pocket_tone_lab_mobile_github_ready
git init
git branch -M main
git add .
git commit -m "Pocket Tone Lab Mobile X"
git remote add origin https://github.com/upsilonguitar-crypto/pocket-tone-lab-mobile.git
git push -u origin main
```

Si GitHub demande une authentification, utilisez votre compte GitHub / GitHub CLI.

Dès le push, `.github/workflows/build-apk.yml` compile automatiquement l'APK.

L'artefact s'appelle `pocket-tone-lab-mobile-debug-apk`.
