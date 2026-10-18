# 25 septembre 2026 — Accueil après la dépose du passager

## Périmètre et problème

Application mobile : sélection de l'activité de l'accueil, statut sous la
salutation, carte, panneau des offres, profil GPS et cache des réservations.

Le signalement montre un accueil conservant « Trajet conducteur en cours » et
un panneau « Trajet réservé en cours » après la descente du passager.
L'inspection établit trois défauts reproductibles dans le code :

- `useHomeTripSelection` verrouillait le panneau et vidait les marqueurs dès
  qu'une ancienne information de notification existait, même sans trajet actif.
- `HomeHeader` pouvait afficher le rôle conducteur de cette information avant
  de tenir compte de la réservation passager réelle.
- Le détail d'une réservation et les listes RTK Query étaient indépendants.
  Une dépose connue dans le détail n'était pas immédiatement reflétée dans la
  liste d'activité ; plusieurs filtres ignoraient également les horodatages
  de dépose et ne vérifiaient que les booléens.

Ces branches sont reproduites par les tests. Sans trace réseau de l'incident,
leur présence n'établit pas la chronologie exacte du cas photographié.

## Solution appliquée et fichiers

- `features/activity/tripParticipation.ts` : fin du transport reconnue par
  le statut terminé, la dépose conducteur/passager ou leurs horodatages.
  Une réservation associée à un trajet terminé ou annulé n'est plus active.
  La bannière utilise déjà cette règle partagée. Aucun règlement n'est déduit
  de ces informations : être descendu ne signifie pas avoir payé.
- `hooks/home/useHomePassengerActivity.ts` : les réservations déposées sortent
  de la sélection active et du suivi du trajet, sans suppression de leur cache
  ni de l'historique. Une autre réservation active du même trajet reste prise
  en compte. Le filtrage vérifie l'identité du réservant.
- `hooks/home/useHomeTripSelection.ts` : seule une participation active
  verrouille l'accueil. Sinon les offres disponibles réapparaissent ; une
  notification obsolète ne maintient plus une carte sans marqueurs.
  Le trajet réservé est recherché indépendamment de la limite de dix suggestions,
  avec repli sur le trajet imbriqué ou les données du flux déjà en cache.
- `components/home/HomeHeader.tsx`, `app/(tabs)/index.tsx` : le statut affiché
  est fourni uniquement par les trajets conducteur/passager réellement retenus.
- `hooks/home/useHomeDriverActivity.ts`, `useHomeLocation.ts` : le profil GPS
  de navigation utilise la participation réelle. Une ancienne notification
  ne suffit plus à maintenir ce profil après la fin du transport.
- `store/middleware/passengerRideCompletion.ts`, `store/index.ts` : à réception
  d'un détail ou d'une confirmation réussie, propager uniquement les indicateurs
  de dépose vers les listes du passager et son détail. Réconcilier également
  une réponse tardive de liste/détail avec la dépose déjà connue dans les caches.
  Le traitement ne s'exécute que pour les réponses pertinentes, sans polling,
  timer supplémentaire, cache permanent ni nouvelle requête.

## Comportements conservés et précautions

- Pas de dépose optimiste : une action en attente ou refusée ne termine rien.
- Ciblage par compte, réservation et trajet. Trois places restent une seule
  réservation ; les autres réservations ne sont pas terminées par association.
- Aucun changement de montant, mode de paiement, statut financier, identité,
  véhicule ou trajet global. Le paiement restant demeure dans les parcours
  existants et n'empêche plus à lui seul le retour à l'accueil normal.
- Un trajet conducteur réellement en cours ou une autre réservation active
  restent affichés. Une annulation n'est pas remplacée par un statut terminé.
- Les caches existants restent utilisables hors connexion ; sans donnée active
  connue, la notification seule n'impose plus le mode trajet à l'accueil.
- Les listes restent mémorisées et la carte conserve son cycle de vie natif.
  La synchronisation ne crée pas de réservation absente des listes.
- Aucun changement backend ou déploiement réalisé.

## Vérifications et limites

Tests JavaScript dédiés : `tests/passengerRideCompletion.test.js` et
`tests/homeRideCompletion.test.js`. Ils couvrent dépose automatique/manuelle
reçue par l'API, interruption confirmée, réponses tardives, erreur API,
changement de compte, réservation de plusieurs places, paiement en attente,
autre réservation active, libération du panneau et retour au GPS de proximité.
Les tests d'accueil existants ont été adaptés pour fournir une participation
réelle, et non une notification seule, là où ils attendent un trajet actif.

Résultats de validation consignés dans le journal des changements.
Les tests exécutent les modules TypeScript et des caches RTK Query réels avec
les entrées/sorties natives simulées ; ils ne constituent pas un essai iOS/Android.

À vérifier sur deux appareils : terminer une réservation avec un conducteur qui
continue son trajet, revenir immédiatement à l'accueil, reprendre un paiement
non réglé, répéter après veille et sous réseau lent, puis vérifier qu'un autre
passager à bord continue d'être suivi. Une dépose non encore reçue du serveur
reste dépendante de la reconnexion/synchronisation existante. Aucune garantie
de disparition des blocages natifs ou de la chauffe n'est annoncée.
