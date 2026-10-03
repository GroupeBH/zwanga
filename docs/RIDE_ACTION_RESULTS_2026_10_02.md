# Modales de résultat d’embarquement et de dépose — 2 octobre 2026

## Périmètre et problème

L’utilisateur demande un retour visuel plus marqué après les actions manuelles
d’embarquement et de dépose, en cas de réussite ou d’échec. Le flux précédent
restait volontairement limité aux messages dans l’écran. Cette intervention
ajoute une **modale de résultat après l’action**, pas une nouvelle confirmation
avant de l’enregistrer. La double validation conducteur/titulaire demeure requise.

## Solution appliquée

La compétence frontend a guidé une carte centrée, une hiérarchie titre/message/
action, des zones de toucher de 44 points minimum et une couleur dominante par
état. L’entrée combine fondu/déplacement léger et mise à l’échelle de l’icône.
Les animations respectent la préférence système de réduction des animations.

La même modale couvre les situations suivantes, sans inventer un succès serveur :

- **Enregistrement local / envoi** : teinte orange, réponse sauvegardée sur le
  téléphone, transmission à venir ou en cours. Aucun drapeau final n’est créé.
- **Réponse reçue** : attente explicitement attribuée au conducteur ou au passager.
  Si le cache serveur indique que les deux réponses sont prêtes, le texte précise
  que le serveur termine la validation, sans demander une autre réponse.
- **Étape confirmée par le serveur** : vert, « Embarquement confirmé » ou
  « Dépose confirmée ». Une dépose confirmée n’est jamais annoncée comme payée.
- **Erreur locale** : rouge, confirmation non enregistrée et retour au trajet
  pour réessayer. Les erreurs techniques natives ne sont pas affichées brutes.
- **Refus serveur / désaccord** : rouge, confirmation non validée ou à vérifier,
  avec les indications déjà assainies par le modèle de reprise existant.

Un bouton principal et une croix ferment le résultat, sans mutation, navigation
ni nouvelle validation. Le contenu peut défiler avec de grandes polices ; le
bouton reste séparé du contenu défilant. Aucune fermeture automatique temporisée.
La réservation et son nombre de places restent identifiables ; le conducteur
voit le passager concerné.

Le résultat est attaché à l’écran de navigation, pas au bouton qui peut disparaître
après la dépose. Tant qu’il est ouvert, il évolue avec le reçu et les lectures
serveur déjà en cache, sans requête ou polling supplémentaire. Après fermeture,
un changement de statut ne rouvre pas automatiquement la modale : les états et
notifications existants continuent d’assurer le suivi du trajet.

## Fichiers concernés

- `features/ride-recovery/rideActionResultModel.ts` : états, textes, contrôle des
  identifiants/acteurs et distinction local/serveur.
- `features/ride-recovery/RideActionResultModal.tsx` et
  `rideActionResultStyles.ts` : rendu partagé, fermeture, animations et accessibilité.
- `features/ride-recovery/RideActionResult.tsx` : présentation liée au compte,
  trajet, réservation et écran actif ; lecture seule du cache des déclarations.
- `hooks/navigation/useRideActionFeedback.ts` : transmission du résultat après
  les gardes existantes, sans coordonnées GPS dans les métadonnées de présentation.
- `store/slices/rideRecoverySlice.ts` : un seul résultat transitoire en mémoire,
  effacement ciblé par identifiant et remise à zéro avec le compte. Cet état n’est
  pas enregistré dans la file persistante et n’autorise aucune transition métier.
- `features/ride-recovery/RideRecoveryControl.tsx` et
  `hooks/driver-navigation/useDriverPickupActions.ts` : branchement après sauvegarde
  ou échec, y compris le rappel conducteur après dépassement du point de récupération.
- `app/booking/navigate/[id].tsx` et `app/trip/navigate/[id].tsx` : hôtes passager
  et conducteur dans leur portée de navigation, indépendants de la carte/info du trajet.
- `features/navigation/rideOverlayStore.ts` : priorité du résultat entre paiement
  et confirmations importantes, toujours inférieure au SOS.
- `tests/rideActionResult.test.js`, `rideActionResultModal.test.js`,
  `rideRecoveryUI.test.js`, `navigationHeaders.test.js` : tests nouveaux/adaptés.
- `scripts/preview-ride-result.cjs` : aperçu reproductible des vrais composants via
  React Native Web, avec données fictives et icônes substituées pour le navigateur.

## Précautions contre les régressions

- Confirmation toujours en un appui ; aucun accord conducteur/passager fabriqué.
  Détection automatique et déclarations de désaccord inchangées.
- Une réussite de sauvegarde n’est pas assimilée à une confirmation finale.
  Les réponses d’un autre compte, trajet, passager ou événement sont ignorées.
- La sortie de l’écran ferme le résultat présenté ; une réponse tardive après
  perte de focus ou changement de compte ne doit pas l’afficher. Un écran inactif
  du même trajet ne ferme pas le résultat d’un autre écran actif.
- Une ancienne fermeture ne peut pas effacer un nouveau résultat. Fermer la
  modale n’efface pas le reçu ni les tentatives persistantes d’envoi.
- La feuille de sélection conducteur ferme après une réponse positive. En cas
  d’échec, elle reste disponible derrière le résultat pour permettre une reprise.
- Utilisation du système de superposition interne existant, pas d’empilement de
  contrôleurs UIKit. Une seule superposition reçoit les interactions ; le SOS
  et les confirmations importantes restent prioritaires. Le paiement peut reprendre
  après fermeture du résultat, avec son état conservé.
- Aucun nouveau débit, calcul tarifaire, appel HTTP, abonnement GPS ou timer de
  synchronisation. Aucun changement backend dans cette intervention.

## Vérifications réalisées

**212 tests JavaScript frontend réussis, aucun échec**, avec :

```powershell
$rideResultChecks = rg --files tests | Where-Object { $_ -match '(rideActionResult.*|rideOverlays|rideRecovery.*|arrivalPayment.*|paymentContext|paymentRetention|nearArrivalPayment|cashReceipt|pickupProximity|passengerCountdown|passengerRideCompletion|multiPassengerNavigation|navigationHeaders|driverPickupAnalysis|passengerDriverInterruption|passengerInterruptionPreview|interruptionSettlement|notificationNavigation)\.test\.js$' }
node --test --test-concurrency=4 $rideResultChecks
```

Ces tests couvrent les deux étapes et les deux rôles, les erreurs de stockage,
les refus serveur, les réponses en attente, les résultats obsolètes, le nettoyage
des portées, les doubles appuis, le maintien de la modale après disparition du
bouton, la priorité SOS/paiement et la préférence d’animation réduite. Les tests
de navigation isolent explicitement le composant de résultat ; ses propres tests
contrôlent la logique et le rendu avec des doubles React Native.

Contrôles complémentaires :

- TypeScript `--noEmit --incremental false` : réussi.
- ESLint ciblé sur les sources de cette intervention : aucune erreur ni avertissement.
- Frontière réseau : valide ; 984 sources contrôlées, aucune au-dessus de 400 lignes.
- `git diff --check` : réussi.
- Aperçu `node scripts/preview-ride-result.cjs`, puis capture locale Chrome inspectée :
  embarquement/dépose confirmés, attente, hors connexion, échec serveur et erreur
  locale sur 320 × 568 avec texte agrandi à 1,4. L’action principale est visible
  dans ces aperçus ; le contenu long reste défilable. La capture est un artefact
  local ignoré par Git sous `.expo/ride-result-preview/preview.png`.

## Limites restantes

Tests JavaScript et aperçu navigateur uniquement : pas d’essai sur appareil
physique, de validation d’animation native, de lecteur d’écran réel ni de mesure
de chauffe/crash/performance native. À vérifier sur Android/iOS : arrivée des deux
validations dans les deux ordres, mode avion/reconnexion, serveur indisponible,
retour arrière, texte agrandi, SOS et paiement déjà ouverts.

Les règles backend sont celles du [rapport précédent](RIDE_CONFIRMATION_PAYMENT_2026_10_02.md),
sans modification dans ce lot UI. Ses résultats backend ne sont pas présentés
comme une nouvelle exécution. Aucun déploiement, build natif ou paiement réel.
