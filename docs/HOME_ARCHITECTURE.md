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
