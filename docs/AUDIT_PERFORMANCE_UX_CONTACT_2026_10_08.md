# Correctifs performance et ergonomie — 8 octobre 2026

## Périmètre et problèmes constatés

Application mobile : accueil/GPS, Mes trajets, Demandes, Alertes conducteur,
contrôle d'accès aux trajets, ajout de véhicule et contact avant acceptation.
L'audit a constaté des abonnements GPS indépendants, des rafraîchissements de
listes redondants, un bouton de permission bloqué après erreur, des messages
d'accès imprécis et des réglages trop verbeux. L'impact batterie était une
hypothèse issue du code, pas une mesure sur appareil.

## Solutions effectivement appliquées

### Localisation partagée

- `hooks/useUserLocation.ts`, `services/rideLocationStream.ts` et
  `services/nearbyDriverLocation.ts` partagent les positions de proximité avec
  l'accueil via un canal limité au compte. La réception native remplace le
  suivi de secours ; une dernière position de proximité est gardée en mémoire
  pour éviter de rouvrir inutilement un abonnement au retour sur l'accueil.
- Le secours reste disponible au premier démarrage sans position native, sans
  permission d'arrière-plan, après arrêt explicite ou silence natif prolongé
  (120 secondes, contrôle toutes les 15 secondes). Un court chevauchement peut
  donc exister avant le premier échantillon natif ; il ne s'agit pas d'une
  promesse de zéro abonnement concurrent dans toutes les conditions.
- Les trajets en cours conservent leur seuil de fraîcheur et leur surveillance
  rapide. Les échantillons d'embarquement/arrivée ne sont pas ralentis.
- Les callbacks iOS fréquents partagent la vérification native de permission
  pendant 30 secondes. Une erreur invalide ce résultat ; démarrage/reprise
  explicite, arrêt, changement de session et désactivation gardent leurs
  contrôles immédiats. Une révocation système est revérifiée au prochain
  callback après cette fenêtre, sans contourner le contrôle de permission iOS.
- Fraîcheur/précision des positions, cadence d'envoi serveur, attente progressive
  après panne réseau et suspension pendant un trajet sont conservées. Aucune
  position supplémentaire n'est enregistrée sur disque.

### Lectures réseau et erreurs

- `hooks/trips/useTripsFeeds.ts` supprime les deux polls indépendants de
  60 secondes. Le coordinateur d'activité existant garde la responsabilité des
  révisions serveur et du repli pour les anciens backends. Seul l'onglet visible
  lance sa lecture ; historique paginé, recherche différée et rafraîchissement
  manuel restent disponibles. Les actions tardives sont suspendues hors écran,
  hors connexion ou après changement de compte.
- `hooks/requests/useRequestsData.ts` suspend aussi les lectures/polls hors
  connexion. Les données déjà présentes restent affichables avec un état
  d'erreur ; une première ouverture hors ligne ne montre ni chargement infini
  ni faux résultat vide. Le poll des demandes publiques est conservé : il ne
  correspond pas à l'activité personnelle du coordinateur.
- `components/trip/DriverTripAccessGuard.tsx` et
  `features/navigation/tripAccessFeedback.ts` distinguent panne réseau, service
  indisponible, absence du trajet, session et accès refusé. La nouvelle tentative
  affiche un chargement et désactive le bouton pendant la lecture. Les règles
  d'appartenance serveur et de récupération des trajets en cours sont inchangées.

### Réglages et zones tactiles

- `components/profile/NearbyDriverLocationPermission.tsx` propose un vrai bouton
  Réessayer après échec du chargement des permissions, sans demander une nouvelle
  autorisation automatiquement.
- `app/driver-availability.tsx` présente le statut et les actions en premier ;
  les détails de sélection, fraîcheur et restrictions système sont repliés sous
  « En savoir plus ». L'explication de l'utilisation de la localisation en
  arrière-plan reste visible avant la demande de permission. Aucun modal ajouté.
- `features/profile/ProfileVehiclesSection.styles.ts` agrandit la zone du bouton
  d'ajout à 48 × 48 unités, sans changer son action.

### Discuter du prix avant d'accepter

Cette section décrit la première livraison. Le même jour, le parcours a été
remplacé à la demande de l'utilisateur par le modal Appeler / WhatsApp / Zwanga,
avec accès serveur explicite au numéro. Le hook est désormais
`hooks/request-detail/useRequestPassengerContact.ts` et le test
`tests/requestPassengerContact.test.js`. L'évolution, ses autorisations et ses
contrôles sont documentés dans
[Contact passager avant acceptation](CONTACT_PASSAGER_AVANT_ACCEPTATION_2026_10_08.md).

- Ajout de « Discuter du prix » dans `features/request-detail/RequestDriverSummary.tsx`
  et `app/incoming-driver.tsx`. `app/request/[id].tsx` suspend le contact quand
  le formulaire d'acceptation est ouvert.
- `features/request-detail/RequestPassengerContact.tsx`,
  `features/request-detail/requestContactPolicy.ts` et
  `hooks/request-detail/useRequestPassengerMessaging.ts` ouvrent la messagerie
  interne uniquement sur action explicite. Chargement visible, protection contre
  les doubles clics et erreur permettant une nouvelle tentative.
- Avant ouverture, lecture fraîche de la demande via le hook lazy exporté dans
  `store/api/tripRequestApi.ts` : rejet des demandes annulées, expirées, attribuées
  ou appartenant au conducteur. Les réponses tardives après sortie de l'écran,
  changement de compte ou expiration d'une proposition ne redirigent pas.
- Backend existant examiné en lecture seule : `GET /trip-requests/:id` contrôle
  le rôle du lecteur et l'attribution ; `POST /conversations/direct` authentifie
  le compte, limite la fréquence, vérifie les participants et réutilise la
  conversation directe. Les lectures/envois de messages contrôlent l'appartenance.
  Il ne s'agit pas d'une nouvelle autorisation atomique liant une conversation
  au statut d'une demande : la messagerie directe générale existe déjà.
- Aucun numéro révélé par ce nouveau parcours, aucun message automatique, aucune
  acceptation, aucun changement de tarif et aucune prolongation des 30 secondes.
  Le montant appliqué reste celui de la demande ; un échange ne vaut pas
  modification du prix. Les notifications et les actions existantes sont conservées.
- Aucune dépendance, migration, modification du backend ou intervention en
  production pour cette intervention.

## Vérifications

- `npm run test:audit-ux` : 69 tests JavaScript ciblés réussis (régression,
  permissions, GPS partagé, lectures hors ligne et contact avant acceptation).
- Mesures simulées : 100 callbacks GPS en 10 secondes partagent une seule lecture
  de permission ; une heure simulée de positions natives ne crée aucun second
  abonnement GPS de l'accueil lorsque la source native est déjà disponible.
- `node --test --test-concurrency=4 tests/*.test.js` : 1 641 tests, 1 638 réussis,
  trois échecs de références dans `sourceExtractions.test.js`. Le hash des styles
  auth et ceux de `updateBookingStatus` / `acceptTripRequest` diffèrent déjà des
  références sur `HEAD` et sont inchangés par cette intervention. Ces références
  n'ont pas été régénérées pour masquer leurs écarts.
- `npx tsc --noEmit`, ESLint ciblé et `git diff --check` réussis ; 1 056 sources
  contrôlées, aucune au-dessus de 400 lignes. Aucun essai natif effectué.
- Tests ajoutés : `tests/auditUsabilityFixes.test.js`,
  `tests/requestPassengerMessaging.test.js`. Tests enrichis :
  `tests/nearbyDriverLocation.test.js`, `tests/nearbyDriverPermission.test.js`,
  `tests/driverAvailability.test.js`, `tests/rideLocationStream.test.js`,
  `tests/sharedScreenLocation.test.js`, `tests/requestsListData.test.js`,
  `tests/routeLocationDetails.test.js`. Commande ciblée ajoutée dans `package.json`.

## Essais sur appareil restant à réaliser

1. iOS et Android : ouvrir/revenir sur l'accueil avec/sans permission de veille,
   révoquer la permission, démarrer/terminer un trajet, puis changer de compte.
   Observer les abonnements, la fréquence réseau et la batterie avec les outils natifs.
2. Passer hors connexion dans Mes trajets/Demandes, revenir en ligne et vérifier
   les listes, leur historique, la nouvelle tentative et les changements d'onglet.
3. Depuis une demande ouverte, toucher deux fois « Discuter du prix », envoyer un
   message avec deux comptes de test et revenir à la demande : aucune acceptation
   ni modification de montant ne doit avoir eu lieu.
4. Répéter depuis une proposition de proximité, attendre son expiration et
   vérifier que la discussion ne prolonge pas son délai d'acceptation.

Ces essais natifs n'ont pas été effectués ici : aucune baisse mesurée de chauffe,
consommation ou fréquence de crash n'est annoncée. Ces correctifs ne changent pas
la configuration native ; un dev build existant compatible peut charger le JS
avec `npx expo start --dev-client`. Les permissions/tâches de veille ajoutées lors
de l'intervention précédente exigent toutefois un binaire qui les inclut déjà.
