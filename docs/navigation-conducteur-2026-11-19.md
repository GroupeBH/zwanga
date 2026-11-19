# Navigation conducteur — 19 novembre 2026

## Périmètre et problème

La référence visuelle fournie par l'utilisateur privilégie la carte, la prochaine
instruction et une action principale. La navigation Zwanga cumulait un grand
en-tête, les informations passager et plusieurs commandes permanentes, au
détriment de la carte. Modification mobile uniquement, sans backend ni déploiement.

## Solution appliquée

- Bandeau bleu nuit en haut : retour, état/connexion, SOS, flèche, distance de la
  prochaine manœuvre et instruction. Durée/distance restantes restent fixes sous
  le texte, même lorsque les instructions défilent en grande police.
- Panneau passager compact en bas, au-dessus de deux commandes : « Ma position »
  et « Plus ». Partage et arrêt du trajet rejoignent le menu existant ; les autres
  commandes restent accessibles dans ce même menu.
- Le panneau de confirmation disparaît après embarquement et revient à 500 m
  de la destination, selon la politique existante. Perte GPS, données périmées
  ou besoin de récupération conservent leurs exceptions de visibilité.
- Réservation urgente : réponse prioritaire conservée. À grande police, son
  contenu peut défiler dans une zone bornée ; aucune promesse de « zéro scroll ».
- SOS reste visible dans le bandeau, sans doublon dans le panneau inférieur.
  L'option `showSos` garde sa valeur par défaut pour les autres écrans.

Fichiers : `features/driver-navigation/DriverNavigationGuidance.tsx`,
`DriverNavigationTopPanel.tsx`, `DriverNavigationControls.tsx`,
`driverNavigationLayout.ts`, `driverPendingBookingLayout.ts`,
`features/navigation/NavigationAssistanceButtons.tsx`, `app/trip/navigate/[id].tsx`.

## Précautions

Aucune modification des calculs de trajet, de la source GPS, de la sonnerie,
de la synthèse vocale, du moteur de carte ou des mutations d'embarquement,
d'arrivée et de paiement. Les actions existantes restent protégées contre les
réponses tardives, les doubles validations et les changements de compte.
Le retour ne termine pas le trajet ; l'arrêt conserve sa confirmation.
Pas de nouveau modal UIKit, de dépendance native ou d'animation décorative.

## Vérifications

- 138 tests JavaScript ciblés réussis : navigation, réservations prioritaires,
  visibilité à 500 m, GPS périmé, récupération, partage, retrait et grandes polices.
- TypeScript et ESLint ciblé : code de sortie 0.
- Aperçu des composants réels avec React Native Web : 24 cas conducteur,
  largeurs 320/390, police simulée 100/200 %, prise en charge, arrivée, croisière,
  réservation, absence d'instruction et réseau indisponible. Vérifications de
  débordement horizontal, chevauchement, dimensions tactiles et visibilité SOS.
  Rapport et captures sous `.expo/active-navigation-preview/` (non versionnés).
- Outillage adapté : `scripts/preview-active-navigation.cjs` et
  `scripts/check-active-navigation-preview.cjs`. Carte et données synthétiques,
  aucun trafic API ni position réelle dans ces aperçus.

Ces aperçus ne sont pas des essais Android/iOS. Les polices y sont simulées et
les tuiles natives ne sont pas rendues. Il reste à vérifier sur appareils : zones
sûres, petites tailles, police système agrandie, menu, SOS, notifications pendant
la conduite et la veille. Aucun nouveau binaire ni disparition d'ANR/crash n'est
certifié par cette intervention.
