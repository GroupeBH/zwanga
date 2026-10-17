# Alertes proches et cadence de localisation — 17 octobre 2026

## Demande et périmètre

Notifier tous les conducteurs admissibles à 5 km d'une commande, actualiser la
position hors course environ toutes les 3 minutes, et rappeler au conducteur de
rouvrir l'application après plus de 6 heures sans position. La cadence pendant
une course doit rester inchangée. Modifications mobile et backend adjacent
zwanga-backend ; aucune modification de configuration AWS, aucun déploiement.

## Solutions appliquées

### Diffusion à plusieurs conducteurs

- Le rayon est fixé à 5 000 mètres dans nearby-driver-policy.ts. L'ancien
  réglage de rayon ne peut plus étendre ce périmètre. Position récente,
  compte conducteur actif, dernière identité approuvée, véhicule actif du type
  demandé, places suffisantes et installation compatible restent nécessaires.
  Le passager demandeur, les comptes suspendus et les conducteurs déjà occupés
  restent exclus. Une invitation immédiate en attente par conducteur maximum.
- dispatch.service.ts et scheduled-request-alert.ts sélectionnent au plus
  50 destinataires par transaction, du plus proche au plus éloigné. Le cron
  existant, toutes les 5 secondes, poursuit les lots sans renvoyer à un même
  conducteur pour la même commande. Ce plafond borne le travail par lot, pas
  le nombre total de destinataires tant que la commande reste disponible.
- Les commandes immédiates donnent plusieurs invitations accepter/refuser.
  Le verrou sur la commande garantit un seul gagnant ; les autres invitations
  sont annulées en base. Une répétition du gagnant reste idempotente.
- Les commandes programmées conservent une alerte sonore ouvrant leurs détails,
  sans réservation automatique du conducteur ni nouvelles actions de notification.
  Leur dédoublonnage tient compte des anciennes notifications déjà persistées.
- Lorsque le dispatch géographique est activé, trip-requests.service.ts ne
  revient plus à la diffusion historique non géographique en cas d'absence de
  destinataire ou d'erreur transitoire. Le cron reprend la recherche.
- La file transactionnelle existante conserve ses cinq envois urgents simultanés
  maximum. La livraison est revérifiée avant envoi, hors des verrous métier.
  Les changements de sonnerie précédents restent décrits dans
  [Sonnerie conducteur](SONNERIE_CONDUCTEUR.md).

### Position hors course

- services/nearbyDriverLocationPolicy.ts utilise 180 000 ms pour un conducteur
  mobile comme immobile. Seule une nouvelle mesure valide est envoyée : âge
  maximal 30 secondes, précision au plus 250 mètres, coordonnées et horodatage
  valides, position simulée refusée. Une réponse réseau lente ne décale pas
  inutilement le prochain échantillon de 3 à 6 minutes.
- services/nearbyDriverLocation.ts conserve la tâche native unique en précision
  équilibrée, l'indicateur iOS et le service Android visible. Au retour au premier
  plan, une ancienne inscription native adopte une seule fois la nouvelle cadence.
  Aucun lancement natif supplémentaire depuis l'arrière-plan.
- Le suivi nécessite toujours les autorisations système et respecte la
  désactivation explicite, la déconnexion et les changements de compte. Aucun
  contournement du consentement, aucune collecte en file d'attente pour rejeu.
- La durée de validité serveur d'une position reste par défaut de 5 minutes.
  Un ancien réglage inférieur à 5 minutes utilise désormais ce défaut pour ne
  pas rendre un conducteur indisponible entre deux échantillons de 3 minutes.
- components/profile/NearbyDriverLocationPermission.tsx explique la cadence
  indicative et le fait que le téléphone peut retarder les mises à jour.

### Pendant une course : comportement conservé

Les services de navigation conducteur/passager et leurs profils ne sont pas
modifiés. Le démarrage d'une course suspend la recherche de clients. Le profil
conducteur conserve notamment sa haute précision, son intervalle configuré de
8 secondes et son regroupement différé de 2 secondes. Les limites d'envoi,
le suivi passager, les confirmations et la fin de course restent existants.
Il ne s'agit pas d'une promesse de livraison GPS toutes les 8 secondes.

### Rappel après six heures

- Nouveau helper backend stale-location-reminder.ts, appelé par un cron Nest
  toutes les 5 minutes. Il vérifie les conducteurs connus dont la dernière
  position reçue date de plus de 6 heures, par lots de 100 maximum.
- Un seul événement est créé par période sans nouvelle position. Le marqueur
  locationReminderSentAt est enregistré dans la même transaction que la
  notification ; les workers concurrents utilisent SKIP LOCKED. Une nouvelle
  position réarme le rappel pour un prochain épisode.
- Le rappel reste une notification ordinaire, sans sonnerie urgente ni
  coordonnées dans son contenu. utils/notificationNavigation.ts ouvre
  /driver-availability en vérifiant le compte destinataire.
- notifications.service.ts supprime un rappel devenu obsolète avant livraison
  ou réessai : nouvelle position, compte inéligible ou course commencée.
  Les reprises sur erreur utilisent la file persistante existante.

## Migration et livraison

Dans zwanga-backend, la migration
src/database/migrations/1780000074000-BroadcastDriverRequests.ts est enregistrée
dans migrations/index.ts. Elle remplace l'unicité « une invitation par commande »
par un index de lecture, conserve l'unicité par conducteur et par paire
commande/conducteur, et ajoute le marqueur et les index du rappel et du cron.

1. Vérifier les migrations en attente et sauvegarder la base cible selon la
   procédure habituelle. Les commandes de migration exécutent toutes les
   migrations en attente, pas uniquement celle-ci.
2. Prévoir une fenêtre contrôlée : arrêter les workers concernés, appliquer
   les migrations avec le pipeline backend existant, puis démarrer le nouveau
   backend. Les migrations ne sont pas automatiques au démarrage dans ce projet.
   Les créations d'index et l'ALTER TABLE prennent des verrous : surveiller leur
   durée sur la base réelle. Aucun index concurrent n'est prétendu ici.
3. Vérifier l'activation du dispatch et des crons existants. Aucune nouvelle
   variable d'environnement n'est nécessaire. Ne pas modifier de secrets.
4. Livrer le mobile. Le changement de cadence est JavaScript sur un binaire
   disposant déjà du suivi natif ; la sonnerie Android du téléphone et les
   ressources audio précédemment modifiées nécessitent les nouveaux binaires.

Le retour arrière refuse une base avec plusieurs invitations encore marquées
pending pour une commande : aucune annulation ou suppression silencieuse.
Laisser le nouveau worker marquer les invitations expirées avant de l'arrêter
et de revenir au schéma précédent. L'écoulement du temps seul ne change pas
leur statut en base.

## Vérifications réellement effectuées

- Mobile : 81 tests Node réussis, suites nearbyDriver*, driverAvailability,
  driverGpsLifecycle, driverBackgroundSession, passengerGpsProfile et
  notificationNavigation. Cas réseau lent, immobilité, anciennes tâches,
  callback arrière-plan simulé, déconnexion, permissions et profil en course.
- Backend : 115 tests réussis dans dispatch-postgres, scheduled-request-alert,
  scheduled-request-delivery, trip-request-alert-routing,
  driver-action-notifications et notifications.service.
- Une vraie instance PostgreSQL 18/PostGIS temporaire locale a exécuté les
  tests d'intégration : 52 destinataires en plusieurs lots, concurrence
  d'acceptation, seuil 4 999/5 001 mètres, rappels avant/après 6 heures, remise
  à zéro après GPS, workers concurrents, migration aller/retour et refus de
  retour destructif. Données synthétiques uniquement, aucune base applicative.
- Typage TypeScript mobile et production backend réussi. Ce n'est pas une
  validation de tous les tests du dépôt ni un essai de notification réelle.

## Limites et recette restante

- Android/iOS peuvent différer ou arrêter les tâches selon les permissions,
  l'économie d'énergie, la fermeture forcée et le constructeur. L'intervalle
  de 3 minutes est demandé, pas garanti à la seconde ; voir
  [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/) et
  [les limites Android](https://developer.android.com/about/versions/oreo/background-location-limits).
- Le rappel suppose qu'une position de découverte a déjà été reçue. Il ne peut
  pas dater un manque de position pour un conducteur qui n'en a jamais envoyé.
  La purge historique des présences après un jour reste inchangée. Si le service
  reste indisponible au-delà de cette rétention, certains rappels peuvent manquer.
  Une désactivation locale peut encore entraîner un rappel unique côté serveur.
- Les lots, la charge et APNs/FCM peuvent retarder les push ; aucune livraison
  simultanée ou exhaustive en toutes conditions n'est garantie. Une invitation
  expirée ou une commande prise entre-temps n'est plus envoyée. Une notification
  déjà reçue n'est pas retirée instantanément d'un autre téléphone par ce correctif.
- Tester sur Android/iPhone réels : deux conducteurs compatibles dans le rayon,
  un hors rayon, veille prolongée, économie d'énergie, reprise réseau,
  acceptations simultanées et passage découverte → course → découverte.
  Vérifier également le rappel et son ouverture, sans publier de positions.
  Aucune mesure de batterie, chauffe, volume acoustique ou résolution de crash
  n'a été réalisée. Aucun déploiement ni push réel envoyé pendant ces tests.
