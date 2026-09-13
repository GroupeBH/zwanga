# Découpage de l'accueil — 12 septembre 2026

## Périmètre

Lors du découpage initial, `app/(tabs)/index.tsx` est passé de 4 193 à 88 lignes pour assembler les sections. Les dix composants de `components/home/` et les quatorze hooks de `hooks/home/` avaient chacun au plus 300 lignes. L'encart de demande prioritaire décrit en fin de document ajoute un composant et un hook dédiés, sans modification des contrats serveur.

## Répartition

| Modules | Responsabilité |
| --- | --- |
| `HomeMap` / `HomeMapMarkers` | Carte native, véhicules, demandes, passagers et bulle de position. |
| `HomeHeader` / `HomeActivityCards` | Profil, notifications, publication/recherche, réservations reçues et demande active. |
| `HomeTripsSheet` / cartes d'aperçu | Panneau rétractable, choix trajets/demandes, listes horizontales virtualisées. |
| Chargements / `HomeLocationButton` | Animations avec nettoyage et action de recentrage. |
| `useHomeContext` / `useHomeLocation` | Contexte d'écran, sélecteurs Redux, utilisateur RTK Query et hook GPS existant. |
| `useHomeDriverActivity` / `useHomePassengerActivity` / `useHomeTripFeed` | Requêtes RTK Query, réservations, demandes et catalogue proche/général. |
| `useHomeTripSelection` / `useHomeSheet` | Priorités d'affichage, restauration du trajet actif et état du panneau. |
| `useHomeTracking` / `useHomePassengerMarkers` | Suivi socket existant, alertes dédupliquées et positions passagers filtrées. |
| `useHomeMap` / `useHomeMapNavigation` | Coordonnées, sélection, caméra et délai de libération des vues natives avant navigation. |
| `useHomeUserLocation` / `useHomeMarkerReadiness` | Recentrage asynchrone et rappels de dessin Android annulables. |
| `useHomeController` | Assemblage des hooks, chacun appelé une seule fois par instance d'écran. |
| `features/home/` | Modèles, types, messages de suivi, politique carte, images et styles par section. |

## États, réseau et comportement

- Les données serveur restent dans RTK Query ; aucun appel HTTP direct ni nouvelle copie globale n'est ajouté. Le suivi WebSocket reste dans le service partagé `trackingSocket` existant.
- Le rayon de recherche et le catalogue de secours existant restent dans Redux Toolkit. La synchronisation `setTrips` (50 trajets maximum) est conservée pour les consommateurs existants. Elle n'est pas remplacée par un nouveau slice concurrent.
- L'ouverture du panneau, la sélection, les références de carte, les temporisations et les positions socket transitoires restent locales. Les objets natifs et les `Set`/`Map` internes ne sont pas placés dans Redux.
- Les options de polling, les conditions de rôle, les priorités des réservations/demandes, les limites des listes et les garde-fous géographiques sont conservés.
- Une réservation active ou sa restauration continue à rétracter le panneau et à réserver la carte au trajet concerné.
- Les références à jour des réservations et des callbacks évitent de recréer l'abonnement de suivi à chaque réponse réseau. Sortir de l'accueil quitte sa participation au trajet et retire ses abonnements, sans fermer le service partagé des autres écrans.
- L'en-tête, les cartes d'activité, le panneau et le bouton de recentrage sont mémorisés ; les callbacks du panneau sont stables. Les cartes d'aperçu conservent leur mémorisation et les listes leur virtualisation.

## Garde-fous ajoutés lors de l'extraction

- La navigation différée est annulée si l'écran perd le focus ; le délai natif iOS/Android, la protection contre les doubles clics et le délai de récupération sont conservés.
- Une localisation ou une adresse reçue après fermeture de la carte ne déclenche plus d'animation ou de mise à jour du marqueur. Les doubles clics de recentrage sont bloqués immédiatement, et les temporisations de bulle sont nettoyées.
- Les rappels de dessin Android sont regroupés par marqueur, vérifient son identité et sont annulés au changement de trajet, à la fermeture de la carte ou au démontage.
- Un callback Android inaccessible dans la branche exclusivement iOS du marqueur véhicule a été retiré. Les images et le rendu existants restent inchangés.

## Vérifications

```sh
npm run test:home
node --test tests/homeModules.test.js tests/homeRequestPriority.test.js tests/profileModules.test.js tests/tripRequestForm.test.js tests/performancePolicy.test.js tests/referralAttributionPolicy.test.js
npm run check:network
npx tsc --noEmit
npx eslint "app/(tabs)/index.tsx" components/home features/home hooks/home tests/homeModules.test.js
```

Les 20 tests spécifiques utilisent le code TypeScript réel avec le réseau et les objets natifs simulés : coordonnées, expiration des demandes, ordre des trajets, restauration, cache dégradé, rôles, temporisations de navigation/carte, suivi conducteur/passager, déduplication, arrêt hors focus, recentrage et panneau.

Lors du découpage initial, la comparaison syntaxique des styles a retrouvé les 206 définitions encore utilisées sans changement de valeur. Six styles déjà inutilisés ont été supprimés ; ils restent récupérables dans Git. Les exports Expo/Hermes Android et iOS avec source maps ont réussi.

Les tests automatisés ne remplacent pas une vérification sur téléphone : ouvrir plusieurs trajets depuis la carte, revenir à l'accueil, changer d'onglet pendant le recentrage, utiliser un trajet conducteur/passager en cours, puis tester la perte/reprise du réseau. Aucun gain de FPS, mémoire ou autonomie sur appareil réel n'est affirmé sans mesure.

## Priorité géographique des demandes et encart de dix minutes

Les demandes disponibles sont désormais classées par distance entre la position du conducteur et leur point de départ, avant la limite de dix résultats de l'accueil. Le calcul local réutilise les coordonnées Redux et la distance à vol d'oiseau ; il ne crée ni watcher GPS supplémentaire ni requête de calcul d'itinéraire. Une position manquante entraîne un classement par heure de départ. Les coordonnées de départ invalides passent après les coordonnées exploitables. La même fonction est utilisée dans la liste des demandes et, par défaut, dans leur recherche ; les tris explicites par budget et par horaire restent disponibles.

`useHomeRequestHighlight` affiche la première demande dans `HomeRequestHighlightCard`, sans l'accepter ni lui attribuer le statut d'un trajet en cours. L'encart ouvre le détail existant, où le conducteur choisit son véhicule pour accepter. Il ne remplace pas le suivi d'un trajet réellement en cours ou une réservation reçue à traiter ; lorsqu'il est visible, il prend temporairement la place de la carte d'un trajet publié à venir.

Le slice `homeRequestHighlights` ne stocke que les identifiants et échéances numériques. Les dix minutes commencent à la première présentation sur un accueil visible et au premier plan. Les rafraîchissements, changements d'onglet et remontages ne prolongent pas cette échéance ; le temps passé en arrière-plan est compté. Une demande nouvellement la plus proche peut remplacer l'encart, mais revenir à la précédente ne redémarre pas son délai. Une demande acceptée, attribuée, annulée ou retirée disparaît de l'encart dès la réception de son nouvel état. Après dix minutes, elle reste dans la liste si elle est encore disponible.

Un seul timeout est armé jusqu'à l'échéance, puis nettoyé à la fermeture ; aucun compte à rebours ne redessine l'accueil chaque seconde. La mémoire est limitée aux 200 dernières demandes mises en avant par session d'application. Elle est réinitialisée à la déconnexion ou au changement de compte, et n'est pas persistée après fermeture complète de l'application. Les données des demandes restent exclusivement dans RTK Query.

`tests/homeRequestPriority.test.js` couvre la distance, le repli sans GPS, le classement avant limitation, la durée, les rafraîchissements, le remontage, l'arrière-plan, les changements de demande et l'isolation de compte. Cette suite fait partie de `npm run test:home`.

## Disparition des demandes expirées (12 septembre 2026)

`features/trip-request/requestExpiration.ts` partage les deux règles du backend :
une demande sans conducteur accepté expire à `departureDateMax + 30 secondes` ;
avec un conducteur accepté, elle expire à `departureDateMax + 2 heures`.
Une offre simplement en attente n'accorde pas les deux heures. Les échéances ne
partent ni de la création ni de l'acceptation. Elles sont distinctes des dix minutes
de mise en avant sur Home et des trente secondes maximum de réévaluation.

`store/middleware/tripRequestExpiration.ts` réévalue le cache RTK Query, plutôt que
d'ajouter un polling HTTP ou un timer dans chaque écran. Une seule temporisation,
bornée à trente secondes et avancée à la prochaine échéance si elle est plus proche,
retire les demandes expirées du cache public utilisé par Home, la carte, Search et
la liste des demandes. Le détail et l'historique restent consultables avec le statut
`expired`, ce qui actualise également les compteurs de demandes actives du profil.
Les demandes attribuées ou associées à une offre acceptée gardent leurs liens au
conducteur et au trajet après expiration. Aucun trajet, réservation ou paiement
n'est annulé : le suivi d'une course déjà démarrée reste disponible normalement.

Les caches ne sont modifiés que lorsqu'une expiration est détectée : les contrôles
sans changement ne déclenchent pas de rendu React. Le minuteur est annulé à la perte
de focus native ou à la réinitialisation de l'API, puis les échéances sont revérifiées
immédiatement au retour au premier plan. Les refetches ne prolongent pas les délais ;
les réponses du serveur restent prioritaires, notamment en cas d'acceptation concurrente.
Cette protection fonctionne hors connexion pour les demandes déjà chargées, sous
réserve de l'heure de l'appareil. La confirmation persistante reste faite par le backend,
dont le cron d'expiration s'exécute désormais toutes les trente secondes.

La suite `tests/tripRequestExpiration.test.js`, incluse dans `npm run test:trip-request`,
utilise un véritable store RTK Query et une horloge simulée pour vérifier l'échéance,
le hors-ligne, l'arrière-plan, les rafraîchissements, les changements de compte et
l'absence de requêtes HTTP supplémentaires. À valider aussi sur appareils : expiration
sur chaque écran, retour après mise en veille, et demande acceptée juste avant l'échéance.
