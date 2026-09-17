# Complément performance : historiques et aperçus d'arrivée

Date : 17 septembre 2026. Suite du [premier lot](PERFORMANCE_2026-09-17.md).

## État des points ouverts

| Point | État |
| --- | --- |
| Historiques complets de trajets/réservations | Pagination implémentée côté serveur et mobile |
| Requêtes d'itinéraire par carte de liste | Retirées ; durée fournie par le serveur ou approximation locale compatible |
| Réservations montées toutes ensemble | Liste virtualisée et composant de carte stable |
| Chauffe, mémoire et gels sur téléphones | Validation physique release encore nécessaire |

Aucun déploiement, changement de `.env`, paiement réel ou lancement de migration n'a été effectué.

## 1. Historiques backend

Nouvelles routes authentifiées :

- `GET /trips/my-trips/history?limit=30&before=<curseur>&search=<texte>`
- `GET /bookings/my-bookings/history?limit=30&before=<curseur>&search=<texte>`

Réponse : `{ data: [...], nextCursor: string | null }`. Taille par défaut : 30 ; maximum : 100. La recherche est limitée à 100 caractères.

Le choix de pagination suit le guide PostgreSQL utilisé pendant l'intervention : curseur plutôt qu'offset, sélection des identifiants avant hydratation des relations et index commençant par l'identifiant de l'utilisateur.

- Tri décroissant date de départ/UUID ; pour une réservation sans trajet, repli sur sa date de création.
- Précision PostgreSQL à la microseconde conservée dans le curseur.
- Une date `asOf` figée à la première page maintient le même seuil d'expiration entre pages. Ce n'est pas un snapshot transactionnel : une modification simultanée peut nécessiter un rafraîchissement.
- Le curseur est lié au type de liste et à la recherche. L'identité du propriétaire vient toujours de l'authentification, jamais du curseur.
- Recherche en base dans les adresses, noms et véhicules ; accents français courants neutralisés. `%`, `_` et `!` sont traités littéralement, avec paramètres SQL liés.
- Sélection `limit + 1` sans comptage total ; seules les relations des identifiants retenus sont chargées. Les relations un-vers-plusieurs ne faussent pas la taille de page.
- Historiques : trajets terminés/annulés ou départs passés non démarrés ; réservations closes ou expirées selon les règles existantes. Un trajet en cours ne devient pas expiré uniquement parce que son départ est passé.
- Les anciennes routes complètes et les projections d'activité restent disponibles. Aucune limite de page n'est appliquée aux coordinateurs d'embarquement, de paiement ou d'interruption.

Fichiers backend : `common/history-page.ts`, `trips/trip-history.ts`, `bookings/booking-history.ts`, contrôleurs et services correspondants.

### Index à déployer

Migration enregistrée : `1780000036000-AddRideHistoryIndexes.ts`.

- `trips(driverId, departureDate DESC, id DESC)` : filtrage conducteur et ordre du curseur.
- `bookings(passengerId, tripId, id)` : filtrage passager et jointure avec le trajet. Le tri sur `COALESCE(trip.departureDate, booking.createdAt)` nécessite encore un tri de l'historique de cet utilisateur ; l'index ne supprime pas ce coût.

La recherche textuelle avec joker initial n'est pas une recherche indexée plein texte. Mesurer `EXPLAIN (ANALYZE, BUFFERS)` sur une base de recette volumineuse avant de décider d'un index dédié.

La migration utilise `CREATE INDEX`, comme les migrations transactionnelles existantes. Elle peut bloquer temporairement les écritures sur les tables concernées. Prévoir une fenêtre adaptée au volume ou une procédure de création concurrente validée avec l'exploitant. Aucun index n'a été créé ici sur une base réelle.

## 2. Historiques mobile

Fichiers : `store/api/{trip,booking}/history.ts`, `store/api/historyPage.ts`, `hooks/trips/useTripsFeeds.ts`, `hooks/bookings/useBookingsFeed.ts`, `utils/rideHistory.ts` et `components/ui/HistoryPaginationFooter.tsx`.

- Requêtes infinies RTK Query ; historique chargé uniquement lorsque l'onglet correspondant est visible au premier plan.
- Bouton « Charger la suite » : pas de boucle automatique au bas d'une liste courte. Un échec conserve les pages reçues et permet de réessayer.
- Pages dédoublonnées par identifiant. La recherche serveur, regroupée après 350 ms, retrouve aussi les trajets non encore chargés ; un changement de recherche n'affiche pas les pages d'une ancienne clé.
- Les comptes partiels ne sont plus présentés comme des totaux d'historique.
- Les écrans « Mes trajets » et « Mes réservations » utilisent des listes virtualisées. La carte de réservation n'est plus un nouveau type de composant recréé à chaque rendu ; ses animations d'entrée répétées ont été retirées.
- Les mutations conservent les tags d'invalidation `MyTrips`/`Booking` et leurs tags `LIST`.
- La suppression après erreur réseau ambiguë est vérifiée par une lecture ciblée du trajet : seul un 404 sur cet identifiant confirme la disparition. L'absence d'une ligne dans la page affichée n'est pas une preuve de suppression.
- Un backend ancien répondant 404 sur la première page déclenche un repli vers l'ancienne route complète. Pas de repli sur 403, 503 ou une page suivante. Le gain de volume requiert donc le nouveau backend.
- Les pages peuvent être libérées 30 secondes après le dernier abonnement. Les pages volontairement ouvertes restent en mémoire pendant la consultation : il n'y a pas de plafond qui ferait disparaître des éléments en cours de lecture.

## 3. Aperçus d'arrivée sans requête par carte

Fichiers backend : `common/route-preview.ts`, `google-maps/google-maps.service.ts`, sérialisation des trajets et listes de réservations.

Lorsqu'un itinéraire de conduite est déjà calculé par les formulaires ou la navigation, son résumé de durée est conservé dans le cache. La clé inclut les coordonnées de départ et d'arrivée, leur sens et une précision de cinq décimales. Les variantes piétonnes, avec étapes ou routes à éviter ne contaminent pas ce résumé standard. Il n'y a pas d'association basée uniquement sur un nom de lieu.

Ordre de préférence pour une liste :

1. Estimation enregistrée au démarrage d'un trajet déjà démarré, rapportée à son heure réelle de départ.
2. Résumé d'un itinéraire déjà calculé pour ces coordonnées, âgé de moins de 24 heures.
3. Approximation géographique explicite : distance à vol d'oiseau × 1,3, vitesse indicative de 30 km/h, minimum une minute. Ce n'est ni le trafic réel ni un itinéraire routier garanti.
4. Absence d'estimation si les coordonnées ou la date ne sont pas exploitables.

Le serveur fournit `estimatedDurationSeconds`, `arrivalEstimateSource` et `previewArrivalDate`. Le résumé est petit, stocké dans le cache existant borné ; la durée de vie est exprimée en millisecondes pour `cache-manager` v5. Une panne de ce cache ne bloque pas la liste. Plusieurs réservations d'un même trajet partagent la même lecture de résumé dans une réponse.

Côté mobile, `useTripArrivalTime` est un simple calcul mémorisé utilisant `utils/tripArrivalPreview.ts`. Il n'ouvre aucune requête, tâche différée ou souscription native. Pour les anciens serveurs, le repli est calculé localement et signalé « Arrivée approx. ». Si aucune estimation n'est possible, l'interface n'utilise plus l'heure de départ comme fausse heure d'arrivée.

Ces données sont exclusivement destinées à l'affichage. Elles ne modifient ni le prix accepté, ni les montants de paiement, ni les seuils GPS, ni la date limite persistée, ni le calcul précis de la navigation. Une durée de 24 heures n'est pas une prévision de trafic actualisée.

## 4. Vérifications

- Compilation TypeScript mobile et code de production backend réussie.
- 10 tests mobiles ajoutés : pagination, compatibilité ancien serveur, maintien des trajets actifs, cycle de vie des requêtes, suppression après erreur ambiguë, propagation de durée et 100 aperçus sans I/O.
- 10 tests backend ajoutés : validation, microsecondes, curseurs, recherche paramétrée, filtre propriétaire, cache de durée, estimation indisponible/approximative et dédoublonnage des lectures.
- Les 21 tests backend ciblés de ce lot et du précédent passent.
- Suite mobile complète : 511 tests réussis sur 512. L'unique écart connu, non lié à ces changements, concerne l'empreinte des endpoints PIN dans `sourceExtractions`.
- 835 fichiers source mobiles contrôlés, aucun au-delà de 400 lignes ; frontière HTTP RTK Query respectée.

Les tests backend simulent les repositories : aucune mesure SQL sur des données réelles n'est revendiquée. Les tests mobiles simulent les interfaces natives.

L'émulateur Android connecté possède `com.zwanga` 1.0.10, build 120, marqué `DEBUGGABLE`. Une mesure mémoire ponctuelle a été possible, mais ce n'est ni une comparaison avant/après du nouveau code en release, ni une preuve concernant la chauffe iOS. Aucun iPhone physique n'a été testé ici.

Commandes :

```sh
# Mobile
node --test tests/rideHistoryPagination.test.js tests/tripArrivalPreview.test.js tests/tripDeletionReconciliation.test.js
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/check-source-size.cjs
node scripts/check-network-boundaries.js

# Depuis zwanga-backend
node node_modules/jest/bin/jest.js --runInBand src/common/history-page.spec.ts src/common/route-preview.spec.ts src/chat/message-page.spec.ts src/common/activity-read-policy.spec.ts src/common/services/activity-cache.spec.ts
node node_modules/typescript/bin/tsc --project tsconfig.build.json --noEmit --incremental false
```

## 5. Recette restante avant de clore la performance en production

1. Préparer les index sur la base de recette, puis déployer le backend avant le mobile. Tester des comptes avec plusieurs centaines de réservations et trajets ; vérifier tout l'historique, les annulations et la recherche d'une ancienne adresse.
2. Simuler une perte de réseau pendant la page suivante, un changement de recherche et une suppression. Vérifier l'absence de ligne perdue et de faux succès.
3. Sur iPhone et Android physiques en release : mesurer mémoire, CPU, fluidité, requêtes, batterie et température sur 30 minutes de trajet et sur l'accueil. Comparer avec le même scénario et le même appareil avant/après.
4. Vérifier les parcours conducteur/passager : embarquement, arrivée, paiement à 150 mètres, interruption/reprise, navigation et messagerie. Ces validations ne sont pas remplacées par un succès de compilation.
