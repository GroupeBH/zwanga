# Correctifs de performance — 17 septembre 2026

Périmètre : application mobile et dépôt voisin `zwanga-backend`. Aucun déploiement, paiement réel ni modification de `.env` n'a été effectué. Ces changements réduisent des travaux inutiles identifiés dans le code ; ils ne prouvent pas à eux seuls la disparition de tous les gels ou de la chauffe sur téléphone.

## 1. Cycle de vie du détail d'un trajet

Fichiers : `hooks/trip-detail/useTripDetailData.ts`, `useTripDetailActivity.ts`, `useTripDetailTracking.ts`, `useTripDetailRouteCoordinates.ts` et `useTripDetailController.ts`.

- L'activité dépend du focus de l'écran **et** du premier plan de l'application.
- Le polling propre au détail, son abonnement GPS et ses abonnements de suivi sont suspendus quand l'écran est couvert ou l'application passe en arrière-plan.
- La tâche GPS native d'un trajet actif reste sous le contrôle du coordinateur global : fermer le détail ne termine pas le trajet.
- Les réponses d'itinéraire et les connexions socket arrivées après fermeture sont ignorées par cet écran.
- Les réservations et les fonctions de présentation sont accessibles aux callbacks via une référence actualisée, sans quitter/rejoindre la room à chaque réponse du polling.
- L'animation infinie inutilisée du détail a été retirée.

Les abonnements RTK Query au cache ne sont pas tous retirés sur cet écran : une autre vue ou un coordinateur peut encore mettre à jour les données partagées. Ce correctif suspend les travaux propres à l'écran, pas le suivi métier global.

## 2. Estimation de l'arrivée

Fichier : `hooks/trip-detail/useTripDetailArrivalEstimate.ts`.

L'ancien effet déclenchait immédiatement une lecture puis une autre après cinq secondes, et recommençait à chaque position. Désormais :

- une seule lecture en cours pour l'instance active ;
- première estimation dès que les coordonnées et la durée sont disponibles ;
- lecture suivante au plus tôt après 30 secondes si le déplacement atteint 50 mètres ;
- rafraîchissement après 120 secondes sans déplacement suffisant ;
- les positions intermédiaires sont regroupées, la dernière position est utilisée ;
- aucun résultat ni rappel périodique ne subsiste après désactivation ;
- le repli local durée/progression reste disponible si le réseau échoue.

Les requêtes continuent d'utiliser le cache d'itinéraires et la couche RTK Query existants. Les seuils d'embarquement, de dépose, d'envoi GPS et de paiement à l'approche de la destination n'ont pas été modifiés.

## 3. Recherches géographiques

Fichiers : `hooks/search/useLatestTripSearch.ts` et `useSearchController.ts`.

Un délai de 350 ms regroupe les changements rapides de critères. Une nouvelle recherche annule la précédente. Un numéro de génération empêche une réponse ancienne de remplacer les résultats récents, même si l'annulation réseau arrive trop tard. La perte du focus et le démontage annulent aussi ces lectures. Au retour, une recherche valide peut repartir.

Seules des lectures sont annulées : aucune création, réservation ou transaction n'est interrompue par ce mécanisme.

## 4. Messagerie paginée

### Backend

Nouveau contrat : `GET /conversations/:id/messages/page?limit=50&before=<curseur>`.

- `limit` est optionnel, vaut 50 par défaut et est limité à 100.
- Réponse : `{ data: Message[], nextCursor: string | null }`, du plus récent au plus ancien.
- Curseur opaque combinant `createdAt` et `id`, ordre décroissant stable sur ces deux valeurs.
- Les microsecondes PostgreSQL sont conservées dans le curseur. Utiliser uniquement `Date.toISOString()` aurait tronqué cette précision et risqué de sauter des messages.
- Lecture `limit + 1`, sans téléchargement de l'historique complet ni comptage total.
- L'appartenance à la conversation est vérifiée avant la lecture. Le filtre de conversation et le curseur sont paramétrés.
- La pagination continue même si le message servant de frontière a été supprimé.
- L'ancienne route `/messages` est conservée pour les anciennes versions de l'application.

Le choix d'une pagination par curseur suit le guide PostgreSQL utilisé pour cette intervention. L'index existant sur conversation/date est conservé ; aucune migration de base de données n'est ajoutée. Les performances SQL réelles restent à mesurer sur un volume représentatif.

### Mobile

Fichiers : `store/api/messages/pages.ts`, `updateMessageCache.ts`, `app/chat/[id].tsx`, `components/chat/ChatMessageList.tsx` et les hooks de messagerie.

- Une requête infinie RTK Query conserve les pages ; seuls les 50 derniers messages sont demandés initialement.
- Le bouton « Voir les messages précédents » charge les pages plus anciennes. Un échec permet de réessayer sans masquer les pages déjà reçues.
- Les messages sont dédoublonnés par identifiant. Un message reçu est inséré localement ; il ne provoque plus de tri complet de l'historique.
- Envoi, édition et suppression mettent à jour les caches ancien et paginé lorsqu'ils existent.
- La liste reste virtualisée, inversée et mémorisée ; saisir un brouillon ne reconstruit pas ses lignes.
- Le cache peut être libéré 30 secondes après le dernier abonnement. Il n'y a pas de plafond arbitraire supprimant les anciennes pages pendant leur lecture : la mémoire dépend encore du nombre de pages volontairement ouvertes.
- Pour un ancien serveur retournant 404 sur la nouvelle route, la première lecture utilise l'ancienne route. L'historique reste accessible, mais le gain de volume exige le déploiement backend. Aucun repli de ce type sur 403, 503 ou une page suivante.

## 5. Lectures globales centrées sur l'activité

Contrats compatibles :

- `GET /trips/my-trips?scope=activity`
- `GET /bookings/my-bookings?scope=activity`

Sans ce paramètre, les écrans d'historique gardent leur comportement précédent. Le filtrage est effectué en base, sous l'identité de l'utilisateur connecté.

Le scope conducteur conserve tous les trajets à venir/en cours et les trajets terminés ou partis au cours des dernières 48 heures. Le scope passager conserve les réservations en attente/acceptées/absence/embarquement incertain, celles mises à jour ou déposées depuis 48 heures et les paiements `initiated`, même plus anciens. Aucun nombre maximal ne tronque les trajets actifs.

La fenêtre de 48 heures couvre notamment les fenêtres existantes des paiements d'arrivée et des avis conducteur. Les relations et demandes d'interruption continuent d'être jointes. Le scope d'activité des réservations possède une clé de cache distincte : il ne remplace jamais l'historique complet. La durée de cache existante est conservée. Les invalidations de la clé passager suppriment aussi sa projection d'activité via `CacheService.del`, afin que les actions et paiements ne laissent pas un second cache obsolète.

Les coordinateurs de suivi, de paiement, la bannière de trajet en cours et l'activité de l'accueil partagent ces nouveaux caches RTK Query. Les mutations conservent les tags d'invalidation existants ; l'acceptation met également à jour le nouveau cache de réservations.

### Alertes de paiement conducteur

`activityTripMapper.ts` extrait les avis à partir des réservations **déjà incluses** dans les trajets du conducteur. `DriverPaymentNoticeCoordinator.tsx` ne relit donc plus séparément jusqu'à quatre listes de réservations toutes les minutes.

Le montant confirmé, les tarifs d'interruption, le mode de paiement et le nom du passager sont conservés. Les règles de sélection des trajets et la mémorisation des avis déjà vus restent en place. La vérification périodique utilise le polling RTK Query partagé, suspendu en arrière-plan.

## 6. Validation et limites

Contrôles exécutés : compilation TypeScript mobile et compilation TypeScript du code de production backend ; tests ciblés de cycle de vie, ETA, recherche, pagination, cache de messages et montants ; contrôles de taille des sources et des frontières HTTP.

Résultats : 501 tests mobiles réussis sur 502 (écart PIN préexistant décrit ci-dessous), 11 tests backend ajoutés réussis, 827 sources mobiles contrôlées sans dépassement de 400 lignes et aucun appel HTTP direct hors des couches RTK Query autorisées. ESLint sur les hooks modifiés de cycle de vie, ETA et recherche : aucune erreur ni avertissement.

Les nouveaux tests backend couvrent les curseurs, la précision temporelle, les limites, l'autorisation et les filtres d'activité. Ils utilisent des repositories simulés, pas une base de production. Les tests mobiles simulent les interfaces natives : ils ne mesurent ni FPS, ni température, ni consommation batterie.

Écarts préexistants à ne pas confondre avec ce lot : le test d'empreinte `sourceExtractions` de `userApi` attend encore d'anciens endpoints PIN ; la compilation backend incluant tous les tests signale des erreurs de types dans les tests OTP, identité légale et genre. Le code de production backend compile séparément avec `tsconfig.build.json`.

Commandes ciblées :

```sh
node --test tests/performanceReadScheduling.test.js tests/messagePagination.test.js tests/tripDetailPerformance.test.js tests/activityTrips.test.js
node --test tests/chatScreen.test.js tests/chatLifecycle.test.js tests/chatSendMessage.test.js tests/searchScreen.test.js
node scripts/check-source-size.cjs
node scripts/check-network-boundaries.js
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Dans `zwanga-backend` :

```sh
node node_modules/jest/bin/jest.js --runInBand src/chat/message-page.spec.ts src/common/activity-read-policy.spec.ts src/common/services/activity-cache.spec.ts
node node_modules/typescript/bin/tsc --project tsconfig.build.json --noEmit --incremental false
```

## 7. Déploiement et recette physique

1. Déployer le backend avant la nouvelle version mobile pour bénéficier immédiatement de la pagination et des scopes d'activité. Aucune migration ni nouvelle variable d'environnement n'est requise pour ce lot.
2. Vérifier sur un iPhone et un Android en version release : 30 minutes de navigation, 20 allers-retours détail/navigation/accueil, arrière-plan et retour avec réseau lent.
3. Vérifier en duo conducteur/passager : embarquement, dépose, interruption/reprise, paiement à 150 mètres, cash/jetons/électronique et alerte du conducteur.
4. Avec plus de 100 messages : ouvrir plusieurs pages, recevoir/envoyer/éditer/supprimer, quitter pendant un chargement et réouvrir. Vérifier le maintien de la position de lecture et l'accès à tout l'historique.
5. Comparer sur les mêmes appareils mémoire, requêtes, CPU et chauffe avant/après. La précision GPS native n'est pas abaissée sans cette mesure et sans revalidation des automatismes.

Au terme de ce premier lot, les estimations dans les listes et les historiques restaient ouverts. Ils sont traités dans le [complément : historiques et aperçus d'arrivée](PERFORMANCE_HISTORIQUES_2026-09-17.md). La recette physique en version release reste ouverte.
