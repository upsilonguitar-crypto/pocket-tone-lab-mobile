# Pocket Tone Lab Mobile X

Application Android autonome pour SONICAKE Pocket Master / QME-10.

## Philosophie de sécurité

- La connexion MIDI **n'autorise aucune écriture**.
- À chaque connexion, `Hardware Guard` repasse automatiquement en **LOCKED**.
- Les écritures temporaires demandent un armement explicite.
- Une sauvegarde permanente demande **un second armement** + le choix User 1–50 + la confirmation de l'interface.
- Le transport Java refuse les messages non-SysEx et les messages anormalement grands.
- Aucune commande de firmware, bootloader, factory reset, erase ou écriture usine n'est implémentée.
- Le workflow `.prst` est totalement offline et ne touche jamais au matériel.

## Fonctions

### Tone Studio
- 301 presets, 46 artistes, 133 presets morceaux/sections.
- Chaîne NR / FX1 / DRV / AMP / IR / EQ / FX2 / DLY / RVB.
- Gros potards tactiles, sliders et bypass.
- Preset browser sous forme de bottom-sheet.
- Mode Focus.

### Format natif `.prst`
- Import natif Pocket Master.
- Vérification signature, taille 515 octets et CRC-8/SMBus.
- Reconstruction du preset en interface graphique.
- Export natif `.prst` auto-vérifié.
- Le fixture `samples/CLEAN AMBIENT.prst` fait un round-trip **octet pour octet**.
- Les 301 presets intégrés passent l'encodeur natif.


### Tone Match automatique
- Analyse audio **100 % locale** : aucun extrait n'est envoyé vers un serveur.
- Référence par fichier audio + capture de ton son actuel pendant 8 secondes ou import d'un second fichier.
- Fenêtre d'analyse réglable (début + durée) pour viser un riff/solo précis.
- Analyse FFT : balance spectrale, centroid, dynamique, niveau, caractère drive et estimation d'espace.
- Trois modes : guitare isolée/solo, rythmique dense, guitare dans un mix complet.
- Proposition de corrections limitées sur AMP / DRV / EQ / Delay / Reverb / volume global.
- **A/B local** Original ↔ Match avant tout envoi.
- Réglage de force 20–100 % pour éviter la sur-correction.
- Ne remplace jamais automatiquement les modèles AMP/DRV et ne sauvegarde jamais dans la pédale.
- Historique local des 12 dernières analyses.

### Tone DNA
6 macros : Agressivité, Ambiance, Brillance, Chaleur, Tightness, Sustain.

### Vault
- Snapshots A/B.
- Setlists locales.
- Tone Health.
- BPM → Delay Time.
- Export JSON et `.prst`.

### Performance Mode mobile
- Current preset géant.
- PREV / LOAD / NEXT.
- Setlist tactile.
- Tap Tempo.
- Keep screen awake.
- Hardware Guard visible et contrôlable sans ouvrir les réglages.
- Feedback haptique.

### Android natif
- WebView locale : aucun serveur Flask requis.
- Android `MidiManager` pour découvrir/ouvrir les périphériques MIDI.
- USB MIDI direct quand le Pocket Master est exposé au système Android comme périphérique MIDI.
- Les périphériques Bluetooth apparaissent également s'ils sont exposés par Android comme MIDI ; le BLE propriétaire SONICLINK n'est pas forcé/émulé dans cette version.
- Import via sélecteur de fichiers Android.
- Export via `ACTION_CREATE_DOCUMENT`.
- Partage Android natif des `.prst`.

## Protocole de contrôle direct

Pour éviter d'embarquer une table SysEx figée, l'app récupère **à la demande** les tables reverse-engineerées du projet PocketEdit et les met en cache localement pendant 7 jours. Cette étape n'est utilisée que pour le contrôle direct du matériel. Le Tone Studio et les `.prst` fonctionnent sans Internet.

Si le protocole ne peut pas être chargé, l'app reste pleinement utilisable en mode offline et **aucune écriture matérielle n'est tentée**.

## Build Android Studio

1. Installer Android Studio.
2. Ouvrir ce dossier comme projet.
3. Installer Android SDK Platform 35 si Android Studio le demande.
4. `Build > Build APK(s)`.

APK debug :

`app/build/outputs/apk/debug/app-debug.apk`

Sur macOS avec Gradle installé :

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
./build_apk_mac.sh
# Le script ./gradlew télécharge Gradle 8.9 automatiquement.
```

## Tests offline fournis

Depuis la racine, adapter les chemins si besoin puis lancer avec Node 22+ :

- `tools/test_mobile_codec.js` : round-trip du `.prst` de référence.
- `tools/test_all_presets.js` : encode les 301 presets et contrôle taille + CRC.
- `tools/test_mobile_connector.js` : simulation Hardware Guard + envoi + sauvegarde/ACK.
- `tools/test_tone_match.js` : test du moteur FFT/matching et de l’application sûre sur un preset.

## Important avant le premier test matériel

1. Tester d'abord l'import/export `.prst` dans SONICLINK sans connecter la pédale.
2. Connecter ensuite le Pocket Master et laisser Hardware Guard verrouillé.
3. Vérifier que la détection MIDI est correcte.
4. Pour un premier envoi, utiliser uniquement une écriture **temporaire**.
5. Ne tester la sauvegarde permanente que sur un slot User dont le contenu est sauvegardé ailleurs.
