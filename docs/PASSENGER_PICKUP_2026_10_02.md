# Embarquement manuel du passager — 2 octobre 2026

**Rapport historique, règle remplacée.** La demande finale rétablit la validation
du conducteur et du titulaire pour l’embarquement et la dépose, tout en conservant
les actions en un appui. Voir le [rapport final](RIDE_CONFIRMATION_PAYMENT_2026_10_02.md)
pour l’état effectivement retenu, le paiement unifié et les vérifications finales.
Les comportements et résultats ci-dessous décrivent l’intervention antérieure.

## Périmètre et problème constaté

Dans la navigation passager, « Je suis à bord » ouvrait une feuille de choix,
puis demandait un nouvel enregistrement. Le backend exigeait aussi une déclaration
du conducteur pour appliquer cet embarquement manuel. Un simple raccourci dans
l'interface aurait donc laissé le passager en attente. Le constat repose sur la
capture fournie et le code, pas sur une reproduction sur appareil.

Objectif : une seule action du titulaire suffit à confirmer manuellement
l'embarquement pour toutes les places de sa réservation. L'embarquement
automatique reste une autre possibilité. L'arrivée n'est pas simplifiée dans
cette intervention.

## Solution effectivement appliquée

### Application

- `features/ride-recovery/RideRecoveryControl.tsx` relie directement le bouton à
  la file persistante existante, sans ouvrir la feuille. Un verrou synchrone
  bloque les doubles appuis, le bouton indique l'enregistrement en cours et
  l'état apparaît dans l'écran. Une erreur d'écriture locale laisse le bouton
  réessayable. Les callbacks anciens revérifient réservation, écran et compte.
- `features/ride-recovery/rideRecoveryPresentation.ts` retire au conducteur les
  actions d'embarquement, sans retirer la lecture des confirmations ni les
  actions d'arrivée et de désaccord sur l'arrivée.
- `features/ride-recovery/rideRecoveryModel.ts` traduit le refus serveur réservé
  au passager et distingue la validation serveur en cours d'une attente de
  l'autre personne.
- `features/ride-recovery/rideOutboxEngine.ts` reprend une ancienne déclaration
  du passager encore provisoire lorsque le nouveau serveur la déclare prête.
  Il réutilise exactement le reçu initial, sans nouvelle preuve ni nouvel
  identifiant. Pas de promotion des déclarations conducteur, d'arrivée ou en
  désaccord. Les autres accusés provisoires restent réconciliés en lecture.
- `hooks/passenger-navigation/usePassengerNavigationNotices.ts` évite une modale
  de succès supplémentaire après l'action manuelle du titulaire. Les avis
  d'embarquement automatique sont conservés lorsqu'il n'y a pas de confirmation
  manuelle du compte courant.
- `features/driver-navigation/NavigationPickupBypassModal.tsx`,
  `hooks/driver-navigation/useDriverPickupActions.ts`,
  `hooks/driver-navigation/useDriverBookingActionGuard.ts` et
  `app/trip/navigate/[id].tsx` remplacent l'ancien « Pris en charge » conducteur
  par « Attendre sa confirmation ». Cette action ferme seulement le rappel ;
  elle n'écrit aucune déclaration. Le texte explique le bouton côté passager.
  Annulation de réservation et arrêt du trajet privé restent disponibles selon
  leurs conditions existantes.

Hors connexion, le reçu est enregistré sur le téléphone puis transmis par le
coordinateur existant. L'application ne fabrique pas de drapeau `pickedUp` :
seul l'accusé serveur établit la validation. Une déclaration d'arrivée peut
toujours être mise en file après un embarquement enregistré hors connexion,
mais elle reste soumise aux contrôles serveur.

### Backend (`../zwanga-backend` depuis la racine de l'application)

- `src/ride-declarations/ride-declaration.model.ts` et
  `src/ride-declarations/ride-declaration.policy.ts` séparent la règle
  d'embarquement de celle d'arrivée : le reçu positif du passager suffit pour
  l'embarquement. Les désaccords historiques ne sont pas effacés. Les relances
  reprennent les preuves initiales et ne rafraîchissent pas artificiellement
  la date d'un ancien reçu.
- `src/ride-declarations/ride-declarations.service.ts` contrôle le titulaire
  authentifié et interdit toute déclaration d'embarquement par le conducteur,
  y compris via les anciennes routes. La transaction applique directement
  l'embarquement avec `manual_passenger_confirmation`. Trajet actif,
  réservation acceptée, validité temporelle et KYC requis restent vérifiés.
- `src/bookings/bookings.service.ts` interdit également l'ancien point d'entrée
  interne de confirmation conducteur. Le worker accepte le nouveau mode manuel
  pour les notifications après commit, tout en traitant les anciennes
  confirmations doubles. Aucun débit n'est ajouté à l'embarquement.
- `src/bookings/bookings.controller.ts` conserve les routes existantes vers le
  service transactionnel et précise leur règle propre à chaque étape.

La compétence `supabase-postgres-best-practices` a guidé la préservation de
l'ordre des verrous **trajet puis réservation**, des transactions sans appels
réseau et du worker d'effets externes après commit. Aucune migration ni
modification du schéma ou du garde SQL des désaccords n'a été nécessaire.

## Protections et comportements conservés

- Une réservation de plusieurs places a un seul titulaire et un seul reçu.
- Les appels répétés n'appliquent pas deux fois la transition. Un autre
  utilisateur ne peut pas confirmer à la place du titulaire.
- Une validation automatique déjà acquise reste autoritaire ; une relance
  manuelle tardive ne remplace pas sa méthode de détection.
- Les contraintes temporelles existantes restent appliquées, notamment aux
  anciens reçus provisoires : délai de 72 heures, tolérance d'horloge de cinq
  minutes et date de démarrage du trajet.
- La confirmation d'arrivée manuelle reste bilatérale ; paiements à l'arrivée,
  paiements anticipés autorisés, cash et jetons ne sont pas modifiés.
- Les files persistantes restent isolées par compte ; l'arrière-plan suspend
  les envois et le retour au premier plan reprend la synchronisation.
- SOS, contacts, notifications automatiques et signalements sont conservés.

## Vérifications réalisées

**Tests JavaScript frontend : 132 réussis, aucun échec**, avec :

```powershell
node --test --test-concurrency=4 tests/rideRecoveryUI.test.js tests/rideRecovery.test.js tests/pickupProximity.test.js tests/passengerCountdown.test.js tests/nearArrivalPayment.test.js tests/multiPassengerNavigation.test.js tests/navigationHeaders.test.js tests/driverPendingBookingLayout.test.js tests/passengerDriverInterruption.test.js tests/passengerInterruptionPreview.test.js tests/passengerRideCompletion.test.js tests/notificationNavigation.test.js tests/performanceGpsPlaces.test.js tests/driverPickupAnalysis.test.js
```

Les nouveaux cas couvrent l'appui direct sans modale, stockage lent ou défaillant,
doubles appuis, changement de compte/écran, réservation annulée ou embarquée
automatiquement, groupes, reprise du reçu initial, absence de modale de succès
manuelle et rappel conducteur sans écriture. Les autres suites contrôlent
arrivée, paiements, interruptions, GPS et navigation.

**Tests unitaires backend : 113 réussis dans quatre suites**, avec :

```powershell
node node_modules/jest/bin/jest.js --runInBand --no-cache --runTestsByPath src/ride-declarations/ride-declaration.policy.spec.ts src/ride-declarations/ride-declarations.service.spec.ts src/bookings/boarding-detection.spec.ts src/bookings/bookings.service.spec.ts
```

Ils couvrent notamment l'autorisation titulaire, le refus conducteur/tier,
l'idempotence, les preuves expirées non redatables, la préservation des
désaccords, le worker après commit, la détection automatique et les paiements.
Les fichiers de tests modifiés sont les quatre tests frontend `rideRecovery`,
`rideRecoveryUI`, `pickupProximity`, `multiPassengerNavigation`, ainsi que
les deux specs de `ride-declarations` et `bookings.service.spec.ts`.

Contrôles complémentaires :

- TypeScript frontend `--noEmit --incremental false` : réussi.
- TypeScript backend `-p tsconfig.build.json --noEmit --incremental false` : réussi.
- ESLint ciblé : aucune erreur ; cinq avertissements de dépendances de hooks
  préexistants dans `usePassengerNavigationNotices.ts`, également vérifiés sur
  la version `HEAD` non modifiée du fichier.
- Frontière réseau : valide, aucun appel HTTP direct hors RTK Query.
- Taille des sources : 977 fichiers contrôlés, aucun au-dessus de 400 lignes.
- `git diff --check` frontend et backend : réussi.

## Livraison et limites restantes

Livrer le backend avant la nouvelle application : l'ancien serveur continuerait
à exiger les deux confirmations. Les anciens clients conducteur peuvent encore
présenter une action désormais refusée par le serveur ; la nouvelle application
la remplace par le rappel expliqué ci-dessus. Aucun déploiement, build natif,
changement de version ou migration n'a été réalisé dans cette intervention.

Tests locaux avec stockage, services et base simulés : pas de mesure sur Android
ou iOS, ni test d'intégration concurrente sur PostgreSQL réel. À valider sur
appareil avant livraison : appui avec réseau lent, mode avion puis reconnexion,
retour après fermeture, double appui et réception côté conducteur. Vérifier
aussi l'embarquement automatique sans action manuelle et l'arrivée/paiement
habituel. Aucune amélioration de chauffe, de crash ou de latence native mesurée
n'est revendiquée.
