# Corrections de performance du 3 octobre 2026

## Périmètre et statut

Implémentation des cinq constats P01–P05 de
[l'audit du même jour](AUDIT_PERFORMANCE_2026_10_03.md), dans l'application
Expo/React Native et le backend NestJS local `../zwanga-backend`.
Les corrections sont appliquées au code local, pas déployées.
Les demandes antérieures ne sont pas réimplémentées : elles sont couvertes
par les tests de non-régression existants.

Aucun fichier fonctionnel supprimé, aucune dépendance ajoutée, aucune migration,
configuration Expo/native ou règle tarifaire modifiée. Aucun `.env`, compte réel,
secret ou journal de production consulté pour cette intervention.

Le guide `supabase-postgres-best-practices` a orienté les lectures bornées,
la pagination par curseur et les verrous limités à la transaction. Aucun index
supplémentaire n'est présenté comme nécessaire sans plan SQL mesuré.

## P01 — Messagerie depuis un trajet

**Problème :** la recherche d'un contact direct parcourait les pages de la boîte
de réception ; le bouton historique du détail avait encore sa propre recherche
limitée à la première page.

**Ajouté :** `POST /conversations/direct`, authentifié et limité en fréquence,
avec un `userId` UUID validé. Le service vérifie l'existence des participants,
refuse l'auto-contact et résout/crée une conversation générale pour exactement
les deux participants, sans réservation ni troisième participant. Un verrou
transactionnel PostgreSQL sur la paire triée coordonne les appels concurrents.
Les créations générales sans titre à deux participants réutilisent ce chemin.
Les conversations déjà dupliquées ne sont ni fusionnées ni supprimées ; la plus
récemment mise à jour est choisie.

**Supprimé :** recherche locale puis boucle de téléchargement de la messagerie,
ancienne recherche séparée du détail et abonnement Redux aux conversations
devenu inutile sur cet écran.

**Amélioré :** un appel ciblé avant navigation, indépendamment du nombre de
conversations. Le contact du détail utilise le même hook que les modaux de
contact. Le chargement reste visible jusqu'à la navigation ; les doubles appuis
et réponses après fermeture, changement de compte ou déconnexion restent bloqués.
L'indicateur analytique `reused_existing_conversation`, désormais inconnu du
client, est retiré ; l'événement d'ouverture est conservé.

**Conservé :** échange exact associé à une réservation, contrôles d'accès,
créations de groupes/titres explicites, appels, WhatsApp, partage du trajet,
erreurs en français et absence de message envoyé automatiquement.

**Fichiers :** `hooks/navigation/useTripContactMessaging.ts`,
`hooks/trip-detail/useTripDetail{ContactActions,BookingState,Controller,Data}.ts`,
`features/trip-detail/TripDetailContentSheet.tsx`, `store/api/messageApi.ts` ;
backend `src/chat/{direct-conversation,chat.service,conversations.controller}.ts`
et `src/chat/dto/conversation.dto.ts`.

## P02 — Réservations ciblées et profil passager

**Ajouté :** `GET /bookings/my-bookings/trip/:tripId`, authentifié, UUID validé,
filtré par l'identifiant passager du JWT **et** le trajet demandé. Il conserve
toutes les réservations correspondantes, les relations utiles, demandes
d'interruption et aperçus de route. Aucun plafond arbitraire ne masque une ancienne
réservation du trajet. Nouvelle requête RTK `getMyBookingsForTrip`, cache inactif
de 30 secondes, avec les tags d'invalidation habituels.

**Supprimé :** téléchargement de tout l'historique personnel pour le détail
d'un ancien trajet, la notation et le profil public d'un passager. Les anciennes
API d'historique restent disponibles pour les consommateurs existants.

**Amélioré :** notation et profil public suspendent leurs lectures hors écran.
Le détail des trajets actifs garde sa lecture `scope=activity`. Acceptation,
interruption et dépose propagent leurs résultats dans le nouveau cache ciblé,
sans inventer un paiement réussi ni terminer le trajet global.

Le profil réutilise `stats.bookingsAsPassenger`, **déjà exposé par le profil
public serveur** : aucun nouvel endpoint de statistiques privées. Les tuiles
« Acceptées » / « Complétées », auparavant déduites de l'historique du compte
connecté et donc trompeuses pour un autre passager, sont remplacées par
« Note moyenne » / « Avis reçus ». La tuile « Réservations » utilise le total
serveur, ou « — » si cet agrégat est absent.

**Conservé :** séparation des lectures conducteur/passager, statuts, nombre de
places, paiement, droit de notation, contestation et annulations.

**Fichiers :** `store/api/booking/createBooking.endpoints.ts`,
`store/api/bookingApi.ts`, `hooks/trip-detail/useTripDetailData.ts`,
`hooks/rating/useRatingData.ts`, `app/passenger/[id].tsx`, `types/users.ts`,
`store/api/user/getProfileSummary.endpoints.ts`,
`store/api/trip/interruptionResponseCache.ts`,
`store/middleware/passengerRideCompletion.ts` ; backend
`src/bookings/bookings.{controller,service}.ts`.

## P03 — Parrainage borné et virtualisé

**Ajouté :** trois routes paginées authentifiées :
`GET /referrals/me/referrals/page`, `/referrals/me/rewards/page` et
`/referrals/me/withdrawals/page`. Curseurs validés, ordre décroissant date/ID,
limite serveur de 100 maximum et sélection des identifiants avant chargement
des relations. Les gains des filleuls sont agrégés uniquement pour la page
demandée, en conservant le filtre sur le parrain connecté.

L'application demande **20 filleuls, 8 commissions et 5 retraits** par page.
Des contrôles précédent/suivant/réessayer donnent accès aux autres pages,
y compris aux anciens retraits auparavant invisibles après le découpage local.
Les compteurs restent les totaux serveur, pas les tailles des pages.

**Supprimé :** `ScrollView` avec montage de tous les filleuls, téléchargement
de 100 commissions/retraits pour n'en montrer que 8/5, et relectures de cet écran
couvert déclenchées par le focus global de l'application.

**Amélioré :** `FlatList`, lignes de filleuls mémorisées, premier lot et lots de
rendu de 8, fenêtre de 5. Le hook dédié suspend les quatre lectures hors écran
ou sans compte, sans polling. Retour écran avec contrôle de fraîcheur de
30 secondes, reconnexion et actualisation manuelle conservés. Un ancien callback
d'actualisation ne relance pas de requêtes après changement de compte ou perte
d'activité. Les trois historiques distinguent erreur réseau et liste vide.

**Conservé :** QR, copie/partage du lien, invitation, soldes exclusivement serveur,
règles KYC/retrait, saisie du montant et procédure FlexPay. Les éléments de
header/footer restent de type stable lors de la saisie. Leur espacement est
maintenu explicitement dans la liste virtualisée et les lignes gardent leur fond
blanc et leur bordure. Les erreurs du résumé
sont signalées ; aucun solde disponible n'est calculé optimistement côté mobile.

**Fichiers :** `app/referrals.tsx`, `store/api/referralApi.ts`, nouveaux
`hooks/referrals/useReferralScreenData.ts`,
`features/referrals/{ReferralPageControls,ReferralPersonRow}.tsx` et
`features/referrals/referralScreenStyles.ts` (styles existants déplacés) ; backend
`src/common/history-page.ts`, `src/referrals/referrals.{controller,service}.ts`.

**Compatibilité :** les routes historiques non paginées restent inchangées pour
les anciennes applications. Leur volume n'est donc pas corrigé pour ces anciens
clients ; la nouvelle application utilise exclusivement les pages pour cet écran.

## P04 — Réconciliation des commissions

**Ajouté :** helper backend `src/referrals/reward-reconciliation.ts`, promesse
partagée par compte entre appels simultanés du même processus, verrou PostgreSQL
transactionnel par compte pour sérialiser les lots entre instances, sélection
verrouillée de **25 commissions maximum par transaction**. Maximum conservé :
20 lots, soit 500 commissions par invocation. Le verrouillage `SKIP LOCKED`
laisse au cron ou à une annulation les commissions qu'ils traitent déjà.

**Supprimé :** transaction individuelle pour chaque commission dans ce chemin
de lecture et répétition simultanée du même travail au sein d'un processus.
Le verrouillage du lot précède les écritures de compte pour éviter d'attendre
une commission déjà verrouillée après avoir pris le compte.

**Amélioré :** au cas limite de 500 commissions, le test simulé observe
20 transactions partagées entre trois appels simultanés, au lieu d'une
transaction par commission et par parcours. Ce chiffre n'est pas une mesure
de latence SQL ; les opérations de contrôle et de journal par commission restent.
La promesse est retirée du registre après succès **ou échec**, permettant un réessai.

**Conservé :** réconciliation attendue avant résumé, filleuls, commissions et
retrait ; durée de retenue ; vérification du statut sous verrou ; débit du compte
en attente, crédit disponible et leurs **deux écritures comptables** ; contrôle
du montant retirable côté serveur. Aucun cache temporel de « solde supposé à jour ».
Le cron et le chemin individuel gardent leur transaction existante.
Une panne dans un lot doit annuler le lot via la transaction TypeORM ; les lots
antérieurs validés restent acquis. Le réessai revérifie les statuts.

Les tests unitaires couvrent mutualisation, borne, reprise après erreur,
séparation des comptes, journaux et absence de second crédit après libération.
Le rollback effectif PostgreSQL et la concurrence réelle cron/retrait/remboursement
ne sont **pas** validés par une base réelle pendant cette intervention.
Une commission verrouillée par un autre traitement peut n'apparaître débloquée
qu'à une lecture ultérieure ; seuls les mouvements déjà confirmés sont affichés.

**Fichiers :** nouveau helper ci-dessus et `src/referrals/referrals.service.ts`.

## P05 — Géométrie du suivi passager

**Ajouté :** `utils/navigation/passengerRouteAnalysis.ts`, qui réutilise l'index
géométrique existant, partage les résultats entre orientation et route restante,
normalise la route une fois par référence et conserve la projection de destination
tant que route/destination ne changent pas. Cache détenu par l'écran et renouvelé
au changement de trajet : deux résultats de position maximum, plus la projection
de destination. Benchmark reproductible `scripts/benchmark-passenger-route.cjs`.

**Supprimé :** recherches exhaustives répétées de la position/destination et
normalisations redondantes dans ce chemin passager.

**Amélioré :** `trimPolylineFromCurrentPosition` accepte une analyse pré-calculée,
tout en conservant son fonctionnement pour les autres appelants. La construction
de la portion restante parcourt encore ses sommets : ce n'est pas une suppression
de tout calcul linéaire.

**Conservé :** seuil d'alignement 100 m, coordonnées et distances de la portion
restante, replis hors route, comportement sur routes inversées/intersections,
notifications et seuils métier d'embarquement/dépose, fréquence GPS et réception
des positions. La double validation et les modaux de paiement ne sont pas modifiés.

**Fichiers :** helper et benchmark ci-dessus, `utils/navigation/routeProgress.ts`,
`hooks/passenger-navigation/usePassengerDriverCameraTracking.ts`,
`usePassengerNavigationController.ts`, `usePassengerNavigationPresentation.ts`.

## Vérifications et mesures

- **1 341 tests JavaScript de l'application réussis, aucun échec ni test ignoré** :
  tous les `tests/*.test.js`, via `node --test --test-reporter=tap --test-concurrency=2`.
  Dépendances natives et réseau simulés, pas un parcours physique sur téléphone.
  Après le dernier ajustement d'espacement header/footer, 30 tests ciblés
  (parrainage, QR, contact et accès/détail trajet) ont été relancés avec succès.
- **52 tests backend ciblés réussis, huit suites**, via Jest `--runInBand` :
  `referrals/performance-read-sql`, `referrals/referral-pages`,
  `referrals/reward-reconciliation`, `referrals/referrals.service`,
  `chat/direct-conversation`, `chat/chat-access`, `bookings/pickup-vehicle-read`,
  `common/history-page` (`src/**/*.spec.ts`). Ce n'est pas toute la suite backend.
  Le SQL est généré avec les vraies métadonnées TypeORM sans connexion PostgreSQL ;
  les transactions des tests unitaires sont simulées.
- Nouveaux tests mobiles : `passengerRouteAnalysis.test.js` et
  `referralScreenPerformance.test.js`. Tests de messagerie, accès aux réservations,
  synchronisation dépose/interruption, suivi passager et partage adaptés au
  nouveau contrat. Vérification de la structure JSX du parrainage : pagination,
  maintien du QR et conservation de la saisie au rerendu, pas validation visuelle native.
- La première exécution complète a révélé des fixtures obsolètes : deux tests
  d'authentification avaient besoin d'un mock `Redirect` Expo Router, déjà importé
  par l'écran avant cette intervention. Des empreintes de styles/contrats étaient
  également décalées : comparaison à `git show HEAD` effectuée avant mise à jour.
  `tests/fixtures/sourceExtractions.json` tient maintenant compte de ces écarts
  préexistants et des nouveaux endpoint/cache/agrégat de cette intervention.
  Aucun test supprimé ni assertion métier désactivée ; le code métier auth,
  cash, publication et gains conducteur n'a pas été modifié pour ces fixtures.
- TypeScript mobile `--noEmit` et backend `--noEmit -p tsconfig.build.json` : réussis.
- ESLint des sources TypeScript mobiles modifiées/ajoutées : **0 erreur,
  9 avertissements préexistants** (dépendance d'effet, imports/types et variables
  inutilisées dans les hooks détail/navigation).
- Contrôle réseau : réussi, aucun HTTP direct ajouté hors RTK Query.
  Taille des sources : **1 002 sources, aucune au-dessus de 400 lignes**.
  `git diff --check` réussi dans les deux dépôts.
- Micro-benchmark Node final, route fictive de **8 000 points, 500 positions** :
  ancien calcul **1 630 ms**, nouveau **380 ms**, construction incluse ; une
  construction, 501 analyses, 23 295 projections de segments et 500 réutilisations.
  Une exécution locale, sujette à variation. Les tests comparent les portions
  restantes exactement et les angles à une tolérance numérique de `1e-10`.
  Cela ne mesure ni FPS natif, ni HTTP, ni chauffe, ni crashs, ni autonomie.

## Livraison et limites restantes

1. Déployer d'abord le backend contenant les nouvelles routes. Les anciens clients
   gardent leurs routes ; un nouveau client face à l'ancien serveur recevrait
   une erreur pour les nouvelles routes (pas de repli vers le téléchargement massif).
2. Vérifier en préproduction les accès de deux comptes, la création directe
   concurrente, les pages historiques et les écritures/refus de retrait sur une
   vraie base. Aucun index/migration à exécuter au titre de cette intervention.
3. Distribuer ensuite l'application. Essais iOS/Android release nécessaires :
   contact depuis détail/modal, retour écran, QR/partage, clavier/retrait,
   pagination, anciens trajets/notation, interruption, dépose et suivi cartographique.

Pas de déploiement, mesure SQL `EXPLAIN ANALYZE`, charge multi-instance, connexion
production ou essai physique réalisé. Les gains serveur exacts, la mémoire,
les FPS et la consommation doivent encore être mesurés. Aucun traitement
financier différé nouveau ni diminution de fréquence GPS n'est introduit.
