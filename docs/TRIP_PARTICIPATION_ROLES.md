# 25 septembre 2026 — Rôle dans le trajet, distinct du rôle du compte

## Problème et constat

Signalement : un compte conducteur qui réserve un trajet apparaît comme conducteur
dans la bannière et peut ouvrir l'interface conducteur d'un autre trajet.

L'inspection ne montre pas de conversion directe `isDriver → rôle de la bannière` :
la bannière vérifiait déjà `trip.driverId`. En revanche, elle sélectionnait toujours
un trajet publié encore marqué « en cours » avant une réservation active. Cette
branche est reproduite dans un test avec les deux activités simultanées ; elle
peut expliquer une bannière correspondant au mauvais trajet. Sans les réponses API
du cas signalé, ce n'est pas une preuve de sa cause exacte en production.

Autre défaut confirmé : la navigation conducteur montait ses contrôleurs avant
toute vérification de propriété. La gestion affichait un refus, mais ses hooks
étaient déjà exécutés. Un ancien lien ou une URL incorrecte pouvait donc ouvrir
des traitements conducteur sans en avoir les droits côté serveur.

## Solution appliquée

- `features/activity/tripParticipation.ts` : règles partagées fondées sur
  l'utilisateur, le propriétaire du trajet et sa réservation. Aucun rôle global
  ni véhicule possédé ne confère de droits sur un trajet tiers. En présence d'un
  objet conducteur imbriqué, son identifiant doit être cohérent avec `driverId`.
- `components/OngoingTripBanner.tsx` : priorité à la réservation acceptée d'un
  trajet en cours, avant une ancienne activité conducteur. Affichage « Passager »,
  ouverture de `/booking/navigate/<bookingId>` et notification permanente avec le
  même rôle. Les réservations annulées, terminées, déposées, étrangères au compte
  ou incohérentes avec le trajet ne sont pas retenues.
- `components/trip/DriverTripAccessGuard.tsx`, `app/trip/navigate/[id].tsx` et
  `app/trip/manage/[id].tsx` : vérification avant montage des contrôleurs GPS,
  sockets et actions conducteur. Un passager ayant une réservation active du
  trajet est redirigé vers sa navigation. Sinon, accès refusé avec retour à
  l'accueil ; une erreur réseau propose une nouvelle tentative.
- Le garde utilise `currentData`, vérifie l'identifiant de route et réinitialise
  le sous-arbre au changement de trajet/compte. Le repli hors connexion existant
  reste utilisable pour le propriétaire ; un refus 401/403/404 ne l'autorise pas.
- `hooks/driver-navigation/useDriverNavigationData.ts` et
  `hooks/manage-trip/useManageTripState.ts` : pas de requête de réservations
  conducteur avant vérification de propriété ; le statut « navigation en cours »
  conducteur est aussi conditionné par cette propriété.
- `hooks/home/useHomeDriverActivity.ts`, `useHomePassengerActivity.ts`,
  `useHomeTripSelection.ts`, `useHomeSheet.ts`, `useHomeLocation.ts` : cohérence de
  l'accueil avec la réservation active. Un rôle conservé dans une notification
  peut aider à retrouver un trajet mais ne prouve pas sa propriété. Il ne suffit
  plus à afficher « conducteur » ni à associer le GPS à un trajet conducteur.

## Comportements conservés et performance

- Le compte reste conducteur et conserve ses fonctionnalités sur ses propres
  trajets. Le parcours d'activation conducteur n'est pas modifié.
- Une réservation de plusieurs places reste rattachée au seul réservant ; aucune
  duplication des confirmations ou du paiement par place n'est introduite.
- Pas de nouveau polling, watcher GPS ni timer. Les abonnements utilisent les
  caches RTK Query existants ; le garde ne monte pas de carte pour un non-propriétaire.
- Aucun trajet historique n'est terminé automatiquement et aucune réservation,
  somme, permission serveur ou donnée de compte n'est modifiée par cette correction.
- Contrôles backend relus, non modifiés : `TripsService.startTrip`, `pauseTrip`,
  `completeTrip` recherchent le couple `id/driverId` ; `BookingsService.findAllByTrip`,
  `confirmPickup`, `confirmDropoff` contrôlent aussi le conducteur propriétaire.
  L'interface mobile ne remplace pas ces contrôles serveur.

## Vérifications

- 81 tests JavaScript ciblés passent : bannière et notifications, accès aux deux
  écrans conducteur, compte conducteur voyageant comme passager, réservation de
  trois places, ancien suivi conducteur, changement de compte/route, droits
  inconnus, refus HTTP, repli hors connexion, accueil, priorités et rôles du compte.
- Tests ajoutés : `tests/tripParticipation.test.js` ; tests étendus :
  `tests/ongoingTripBanner.test.js`, `tests/homeModules.test.js`. Adaptation des
  mocks du cache partagé dans `driverBookingReadAccess.test.js` et
  `homePriorityDismissals.test.js`. `navigationHeaders.test.js` vérifie aussi que
  les contacts et modals conducteur restent branchés après autorisation du garde.
- `git diff --check` valide ; 935 sources contrôlées, aucune au-delà de 400 lignes.
- TypeScript mobile : `tsc --noEmit --incremental false` valide.
- Suite mobile complète : **958/960** passent. Les deux échecs préexistants de
  `sourceExtractions.test.js` concernent les empreintes des styles de réservations
  et des endpoints PIN. Ces sources et leurs références ne sont pas modifiées ici.
- Validation native non réalisée. À tester avec deux comptes et deux appareils :
  réservation par un conducteur actif, bannière hors navigation, clic sur une
  ancienne notification conducteur, trois places, mise en veille puis reprise,
  réseau indisponible, retour sur un trajet réellement publié par ce conducteur.
  Les tests simulés ne prouvent pas l'absence de crash iOS/Android.
