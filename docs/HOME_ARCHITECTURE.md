# Découpage de l'accueil — 12 septembre 2026

## Périmètre

`app/(tabs)/index.tsx` passe de 4 193 à 88 lignes et assemble les sections. Les dix composants de `components/home/` et les quatorze hooks de `hooks/home/` ont chacun au plus 300 lignes. Il s'agit d'une séparation des responsabilités, pas d'une refonte graphique ou d'une modification des contrats serveur.

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
node --test tests/homeModules.test.js tests/profileModules.test.js tests/tripRequestForm.test.js tests/performancePolicy.test.js tests/referralAttributionPolicy.test.js
npm run check:network
npx tsc --noEmit
npx eslint "app/(tabs)/index.tsx" components/home features/home hooks/home tests/homeModules.test.js
```

Les 20 tests spécifiques utilisent le code TypeScript réel avec le réseau et les objets natifs simulés : coordonnées, expiration des demandes, ordre des trajets, restauration, cache dégradé, rôles, temporisations de navigation/carte, suivi conducteur/passager, déduplication, arrêt hors focus, recentrage et panneau.

La comparaison syntaxique des styles retrouve les 206 définitions encore utilisées sans changement de valeur. Six styles déjà inutilisés ont été supprimés ; ils restent récupérables dans Git. Les exports Expo/Hermes Android et iOS avec source maps ont réussi.

Les tests automatisés ne remplacent pas une vérification sur téléphone : ouvrir plusieurs trajets depuis la carte, revenir à l'accueil, changer d'onglet pendant le recentrage, utiliser un trajet conducteur/passager en cours, puis tester la perte/reprise du réseau. Aucun gain de FPS, mémoire ou autonomie sur appareil réel n'est affirmé sans mesure.
