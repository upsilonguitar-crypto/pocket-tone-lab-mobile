# Pocket Tone Lab Mobile V5 — Design Notes

## But

La V5 ne remplace pas le moteur fonctionnel de la V4. Elle ajoute une coque mobile dédiée, inspirée de la grammaire visuelle SONICLINK, avec une navigation et une densité adaptées au téléphone.

## Navigation

La barre à 7 entrées disparaît sur mobile. Elle devient :

1. Tone — éditeur principal
2. Presets — bibliothèque en bottom-sheet
3. Match — Tone Match + boucle itérative
4. Live — performance/setlist
5. Tools — Generator, Vault, Pocket Master, Modèles

## Tone Studio

- App-bar fixe compacte.
- Preset courant visible en permanence.
- Statut USB accessible d'un tap.
- Chaîne FX horizontale avec les assets SONICLINK d'origine.
- Un seul module ouvert à la fois.
- Gros potards tactiles 2 colonnes (3 sur grands téléphones/tablettes).
- Le Preset Browser devient une feuille mobile superposée.

## Tone Match

- Étapes Target / Your Tone / Match Engine lisibles verticalement.
- Score et corrections au centre.
- A/B puis validation.
- Boucle itérative avec meilleur score, rollback, force adaptative et anti-overshoot conservés.

## Live

- Preset courant très lisible.
- PREV / LOAD / NEXT géants.
- Tap tempo et Hardware Guard immédiatement accessibles.
- Setlist verticale.

## Sécurité

Aucune protection V4 n'est supprimée :

- Hardware Guard verrouillé par défaut ;
- écriture temporaire explicitement armée ;
- sauvegarde permanente séparée ;
- confirmation du slot User ;
- aucun firmware/bootloader/reset/erase exposé.
