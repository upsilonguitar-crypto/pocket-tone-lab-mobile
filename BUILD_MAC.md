# Build rapide sur Mac

## Android Studio (recommandé)

- Installer Android Studio.
- Ouvrir `pocket_tone_lab_mobile`.
- Accepter l'installation de SDK Platform 35 proposée par Android Studio.
- Connecter le téléphone avec le mode développeur / débogage USB si tu veux lancer directement l'app.
- Cliquer **Run** ou **Build > Build APK(s)**.

## Terminal

```bash
brew install gradle
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd pocket_tone_lab_mobile
./build_apk_mac.sh
```

Le debug APK se trouvera dans :

```text
app/build/outputs/apk/debug/app-debug.apk
```
