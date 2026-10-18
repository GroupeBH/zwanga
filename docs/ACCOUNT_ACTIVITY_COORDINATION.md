# Coordination de l'activité personnelle

Date : 22 septembre 2026. Périmètre : application mobile et `zwanga-backend`.

## 1. Problème et correction

Plusieurs composants globaux et hooks de l'accueil demandaient périodiquement
les listes de trajets, réservations et demandes du compte, même sans activité.
RTK Query partage les requêtes identiques, mais les réponses volumineuses et les
changements de métadonnées de chargement restaient traités par les abonnés.
Le nombre de composants montés n'est pas, à lui seul, une mesure du coût CPU.

Un seul `AccountActivityCoordinator` possède maintenant la surveillance globale.
Il lit `GET /api/v1/me/activity` via RTK Query. Le serveur renvoie un résumé avec
trois empreintes stables. Seule une catégorie modifiée entraîne une nouvelle
lecture de sa liste complète. Les composants GPS/paiement/notification restent
montés : leurs responsabilités métier n'ont pas été déplacées dans un composant
monolithique, ni supprimées.

Il s'agit d'une migration incrémentale : les DTO et caches existants continuent
d'alimenter les fonctionnalités. Ce n'est PAS la suppression de toutes les
requêtes de l'application, ni le remplacement des flux GPS et des sockets.

## 2. Contrat serveur et coût des lectures

`src/activity/activity.controller.ts` expose un GET protégé par `@Auth()`.
L'identifiant du compte vient exclusivement du JWT, jamais d'un paramètre client.
La réponse porte `Cache-Control: private, no-store`.

La réponse contient :

| Champ | Utilisation mobile |
| --- | --- |
| `schemaVersion: 1`, `userId` | Validation du contrat et isolation du compte |
| `trips`, `bookings`, `requests` | Chacun contient `count` et une `revision` SHA-256 |
| `hasLiveActivity` | Cadence renforcée si trajet en cours ou paiement initié |
| `passengerTrackingBookingId` | Préarmement du suivi passager à l'approche du départ |

`activity.service.ts` exécute trois lectures groupées en parallèle, limitées au
compte authentifié. Les colonnes sont explicites, sans hydratation des DTO,
notes, géocodage, calcul de prix, aperçu d'itinéraire ou appel externe.
Les règles `activeTripWhere` et `activeBookingWhere` existantes conservent les
trajets non terminés, l'activité récente sur 48 h et les paiements initiés.
Les demandes ouvertes/sélectionnées et les demandes modifiées depuis 48 h sont
incluses. Aucun trajet inachevé n'est supprimé par une limite arbitraire de nombre.

Les empreintes incluent les états métier pertinents : réservation, embarquement,
dépose, paiement, tarif ajusté, interruption, offre, horaires et itinéraire.
Les horodatages/coordonnées de suivi GPS et l'heure courante ne les font pas
changer à chaque lecture. Les positions fixes de départ/destination sont bien
incluses. `activity.model.ts` normalise l'ordre des colonnes/lignes et les doublons
de jointure avant le hash ; un simple changement d'ordre SQL ne déclenche pas
de relecture. Le nombre représente les identifiants distincts, pas les jointures.

Le résumé est petit, mais le travail SQL n'est pas constant quel que soit le
volume d'activité. Les demandes sélectionnées non clôturées peuvent s'accumuler
et les jointures d'interruption produire plusieurs lignes. Il reste nécessaire
de mesurer les plans et volumes réels avant de conclure sur le CPU PostgreSQL.
Les règles de la compétence `supabase-postgres-best-practices` ont guidé les
projections explicites et l'absence de requêtes par élément ; aucune migration
ou modification d'index n'a été faite sans mesure.

### Cohérence du cache des réservations

Problème : constater une nouvelle empreinte en base, puis recevoir une ancienne
liste depuis Redis, ferait considérer à tort le changement comme traité.

Solution dans `src/bookings/bookings.service.ts` : le chemin `scope=activity`
ne lit ni n'écrit le cache de liste. Les lectures ordinaires/historiques gardent
leur cache existant. Les lectures de détail métier restent inchangées. Ce choix
augmente le coût unitaire de cette lecture d'activité, mais elle n'est plus
répétée périodiquement lorsque l'état est inchangé. Le bilan réel reste à mesurer.

## 3. Cadences et cycle de vie mobile

| Situation | Surveillance du résumé |
| --- | --- |
| Connecté, premier plan, réseau disponible, sans activité en cours | Toutes les 60 s |
| Trajet en cours ou paiement initié | Toutes les 30 s |
| Application en arrière-plan, hors ligne ou déconnectée | Abonnement de polling suspendu |
| Retour au premier plan / reconnexion | Nouvelle lecture du résumé |
| Mutation invalidant les tags métier / notification reçue ou ouverte | Résumé invalidé via RTK Query |

Il n'y a pas de nouveau `setInterval` ou watcher GPS. RTK Query gère les délais,
le cache réseau et les requêtes concurrentes. La disponibilité réseau utilise
son état `config.online` existant ; les erreurs HTTP restent possibles malgré
ce signal et sont traitées sans effacer l'activité connue.

Les hooks existants font toujours leur première lecture et conservent leur
abonnement au cache. Au premier résumé, une catégorie non vide est réconciliée
avec une lecture fraîche ; une catégorie vide sans données connues évite cette
lecture supplémentaire. Le retour au premier plan recrée la réconciliation :
il peut donc provoquer une lecture fraîche des catégories non vides. On ne
promet pas une absence de lectures complètes au démarrage ou à la reprise.

`activityQueryOptions.ts` met les pollings globaux/personnels de l'accueil à zéro
et sélectionne seulement `data`, `isSuccess`, `isLoading`. Les transitions de
`isFetching`/horodatage seules ne forcent plus ces consommateurs à se redessiner.
Une vraie modification des données continue naturellement de provoquer un rendu.

### Reprise sans boucle et sans perte d'état

`activityReconciliation.ts` garde en mémoire la dernière empreinte appliquée et
la dernière souhaitée par catégorie, avec une seule lecture en vol par catégorie.

- Une empreinte identique avec un cache sain ne relit rien.
- Une catégorie qui devient vide est relue si elle était connue : un trajet
  terminé ne reste pas actif uniquement parce que le résumé est désormais vide.
- Une lecture en échec n'est pas marquée comme appliquée. Le prochain résumé,
  même identique, la réessaie. Un échec de la première lecture est aussi réessayé.
- Des changements arrivant pendant une lecture lente sont regroupés ; seul
  l'état le plus récent est ensuite relu, sans cent requêtes concurrentes.
- Une ancienne lecture RTK déjà en vol est attendue AVANT la lecture fraîche :
  sa déduplication ne doit pas valider prématurément une nouvelle empreinte.
- Sortie du premier plan, perte réseau et changement de compte désactivent les
  travaux encore en attente. Une lecture partagée déjà lancée n'est pas annulée
  au détriment des autres écrans ; son résultat n'avance plus l'ancien coordinateur.
- Une réponse d'un autre compte, mal formée, en erreur 401/503 ou réseau ne
  devient jamais un résumé vide. Les règles de déconnexion existantes restent
  responsables de la remise à zéro des caches personnels.

La reprise après suspension conserve aussi `useArrivalPaymentRefresh` : une
lecture fraîche des réservations avant d'autoriser les modals de paiement.
La précédente double relance manuelle trajets/réservations depuis le listener
AppState de `ActiveRideLocationCoordinator` a, elle, été retirée.

### Préarmement passager

Supprimer les lectures périodiques des listes ne doit pas empêcher une réservation
d'entrer dans sa fenêtre de suivi sans modification de son objet.
Le serveur calcule séparément `passengerTrackingBookingId` selon la fenêtre
existante (+2 h / -12 h) et donne priorité à une réservation acceptée/en cours.
`useActivityTrackingSignal` lit uniquement le cache du résumé et fait réévaluer
le candidat du coordinateur GPS. Le calcul local existant reste disponible en
repli. Les tâches natives continuent indépendamment pendant la veille ; ce
résumé ne garantit pas une exécution JavaScript en arrière-plan.

## 4. Périmètre conservé et fichiers

Les formulaires, montants, seuils de paiement à l'approche, validations manuelles,
déposes, interruptions, sockets et API de mutations n'ont pas été réécrits.
Les autres coordinateurs ne sont pas démontés lorsqu'un résumé est vide : cela
pourrait perdre une reprise de paiement ou un travail en attente.

Les rafraîchissements des annonces/recherches visibles sur l'accueil restent
nécessaires : ils concernent les trajets des autres utilisateurs, pas le résumé
personnel. Les pollings des écrans de listes dédiés, des détails de trajet actif,
des réservations du conducteur, des statuts de paiement et les rafraîchissements
manuels ne sont pas supprimés. Le chiffre « une requête par minute » décrit
uniquement la découverte globale personnelle au repos, pas tout le trafic réseau.

Fichiers mobiles et responsabilités :

- `store/api/accountActivityApi.ts`, `baseApi.ts`, `zwangaApi.ts` : contrat validé,
  clé de cache par compte et tags partagés avec les mutations existantes.
- `components/AccountActivityCoordinator.tsx`, `ReduxProvider.tsx` : propriétaire
  unique du polling personnel et montage global.
- `features/activity/activityReconciliation.ts`, `activityQueryOptions.ts` :
  réconciliation sérialisée et sélection minimale des données.
- `ActiveRideLocationCoordinator.tsx`, `hooks/useActivityTrackingSignal.ts` :
  consommation du cache et préarmement sans polling de listes supplémentaire.
- `DriverPaymentNoticeCoordinator.tsx`, `hooks/arrival-payment/useArrivalPaymentState.ts`,
  `OngoingTripBanner.tsx`, `NotificationHandler.tsx` : abonnements partagés ;
  notifications invalidant le résumé, sans retrait de leurs traitements métier.
- `hooks/home/useHomeDriverActivity.ts`, `useHomePassengerActivity.ts` : mêmes
  données d'activité, sans cadence personnelle concurrente.
- `tests/accountActivity.test.js`, script `npm run test:activity` : tests reproductibles.

Backend : nouveau module `src/activity` enregistré dans `src/app.module.ts` ;
contrôleur, service de projection, modèle d'empreintes et tests ; ajustement
du cache d'activité dans `src/bookings/bookings.service.ts` décrit plus haut.

## 5. Déploiement progressif et limites

1. Déployer d'abord le backend exposant `/api/v1/me/activity`.
2. Contrôler l'authentification, les temps de réponse et les requêtes SQL avec
   des comptes sans activité, avec un trajet actif et avec un historique important.
3. Déployer ensuite le mobile, puis comparer les appels et les profils natifs.

Si l'endpoint renvoie 404/405, le coordinateur mobile réactive les trois anciens
pollings (trajets 60 s, réservations 45 s, demandes 60 s). Ils restent suspendus
hors premier plan/réseau. Le repli dure pour cette session du compte : après
mise en ligne du backend, un redémarrage de l'application ou une déconnexion/
reconnexion permet de redécouvrir l'endpoint. Une erreur temporaire 503, réseau
ou de contrat n'active pas ce repli et n'est pas assimilée à « aucun trajet ».

Aucun déploiement, accès à une base de production ou mesure thermique n'a été
réalisé pendant cette intervention. La réponse vide testée fait moins de 700
caractères JSON ; ce n'est ni une mesure réseau compressée ni un benchmark SQL.
Le hash n'est pas un mécanisme de push instantané : sans notification/mutation,
un changement distant est découvert à la prochaine lecture réussie du résumé.

## 6. Vérifications et recette restante

- Neuf tests mobiles ciblés : stabilité sur 600 résumés inchangés, disparition,
  reprise des erreurs, regroupement de requêtes lentes, changement de compte,
  arrière-plan/hors ligne, repli 404/405, lecture antérieure en vol et sélecteurs.
- Backend : quatre suites ciblées / onze tests sur empreintes, fenêtre temporelle,
  JWT, projections SQL TypeORM, politiques de lecture et cache d'activité.
  `src/activity/booking-activity.spec.ts` appelle la vraie méthode de lecture
  avec un cache volontairement ancien : activité fraîche et cache historique conservé.
  Les métadonnées réelles des entités sont utilisées pour générer le SQL ;
  aucune requête n'est exécutée sur un serveur PostgreSQL pendant ces tests.
- TypeScript mobile/backend et ESLint ciblé : contrôlés séparément.
- Les résultats de la suite globale et les limites préexistantes sont consignés
  dans [le journal](CHANGEMENTS_TECHNIQUES.md).

Recette physique avant généralisation : iPhone et Android modeste, 30–60 min
sur accueil/profil puis en trajet ; réserver/accepter/démarrer depuis un autre
compte ; passage dans la fenêtre de préarmement ; plusieurs embarquements,
déposes et interruptions ; paiement cash/jetons/électronique ; suspension puis
reprise après dépose ; réseau lent/hors ligne puis reconnexion ; changement de
compte pendant une requête lente. Vérifier caches, modals, GPS, notifications,
CPU/mémoire et température. Les tests JavaScript ne prouvent pas l'absence de
freeze, de crash ou de chauffe sur les appareils.
