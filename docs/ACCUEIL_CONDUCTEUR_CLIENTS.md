# Accueil conducteur centré sur les clients

Date : 18 octobre 2026. Périmètre : découverte de l’accueil mobile conducteur,
accès volontaire à la recherche de trajets et commandes de navigation.

## Problème et solution appliquée

La coexistence des onglets Clients/Trajets sur l’accueil pouvait faire confondre
les passagers à prendre et les trajets d’autres chauffeurs. Le mode sélectionné
passait aussi à Trajets pendant une course et pouvait y rester ensuite.

L’accueil suit désormais directement le rôle : Clients pour un conducteur,
trajets publiés pour un passager. Plus de sélecteur de contenu ni de bascule
automatique vers des trajets publics si aucun client n’est disponible. Les états
de chargement, d’erreur et le bouton Réessayer correspondent au flux clients.
Voir tout et la tuile du nombre de clients ouvrent `/requests`.

Le bouton secondaire **Chercher un trajet**, sous Publier/Commander, ouvre `/search`
pour voyager comme passager. La recherche existante démarre sur les trajets
publiés, y compris pour un compte conducteur ; ce bouton ne change pas son rôle.
Commander permet toujours de créer sa propre commande. Les clients restent
le seul type de suggestion sur l’accueil. La présentation reprend la retenue du
skill `frontend-skill` : titre unique, accès secondaire explicite, pas de nouveau
modal, d’animation ou de bouton fixé au bas de l’écran.

## Fichiers concernés

- `components/home/HomeTripsSheet.tsx` : rubrique Clients, suppression des onglets,
  accès à la liste des clients et bouton Chercher un trajet avec libellé/hint
  d’accessibilité, sans masquer Publier, Commander, statut ou gains.
- `components/home/HomeDashboard.tsx` : suppression des anciennes propriétés de
  sélection du flux.
- `hooks/home/useHomeSheet.ts` : flux dérivé du rôle, sans état ou effet de bascule ;
  ouverture/repli et récupération de la préférence après trajet conservés.
- `features/home/homeTypes.ts`, `HomeTripsSheet.styles.ts` : retrait du type et
  des styles des anciens onglets ; style blanc/bleu du bouton de recherche,
  hauteur tactile minimale de 44 points.
- `hooks/home/useHomeTripFeed.ts` : requêtes publiques proches et générales,
  polling et actualisation manuelle désactivés pour l’accueil conducteur. Une
  ancienne réponse en cache n’alimente plus sa découverte ni un loader/une erreur
  du mauvais flux. Les requêtes de recherche restent indépendantes.
- `hooks/home/useHomeTripSelection.ts` : exclusion des suggestions publiques
  pour le conducteur, même depuis Redux ; conservation de ses réservations comme
  passager, de ses trajets publiés prioritaires et de son trajet actif.
- `features/driver-navigation/DriverNavigationControls.tsx` : boutons Partager
  le trajet et Arrêter le trajet directement visibles ; son dans Plus. Protections
  et détails dans [Navigation conducteur simple](NAVIGATION_CONDUCTEUR_SIMPLE.md).
- `scripts/preview-driver-home.cjs`, `scripts/preview-active-navigation.cjs` :
  aperçus locaux des vrais composants React Native via Web, données fictives,
  aucune requête métier ou géolocalisation.

## Comportements conservés et précautions

- Aucun changement du rôle, des droits, de la barre d’onglets ou du backend.
- Les réservations personnelles et trajets du conducteur restent accessibles et
  peuvent rester affichés en priorité sur la carte. Ce ne sont pas des suggestions
  publiques. L’utilisateur conducteur qui voyage comme passager ne perd pas le
  suivi de sa réservation.
- Le flux passager conserve ses trajets proches, son élargissement géographique
  et temporel, et ses réservations. Aucun client d’autrui n’y est affiché.
- La carte, sa position, la taille de la section inférieure, les GPS/sockets,
  règles de proximité et notifications ne sont pas modifiés. La section conserve
  son défilement lorsque toutes les actions et suggestions ne tiennent pas.
- L’arrêt explicite garde la pause sans passager et l’accord requis des passagers
  à bord. Partager conserve son lien et sa feuille de partage. Ce travail ne
  supprime pas ces protections et ne crée aucune nouvelle mutation métier.

## Vérifications et résultats

**206 tests JavaScript réussis, zéro échec**, via `node --test --test-concurrency=2`
sur les fichiers suivants de `tests/` :

- `homeCompactLayout.test.js`, `homeModules.test.js`, `homeTripPriority.test.js`
- `homeMapPriorities.test.js`, `homeDriverReservations.test.js`
- `homeForegroundLifecycle.test.js`, `homeIdlePerformance.test.js`
- `homeRoleLoader.test.js`, `homeRequestPriority.test.js`, `homePriorityDismissals.test.js`
- `auditCorrections.test.js`, `navigationHeaders.test.js`
- `driverPendingBookingLayout.test.js`, `driverInterruptionExit.test.js`
- `driverNavigationCompact.test.js`, `rideRecoveryUI.test.js`, `searchScreen.test.js`

Cas ajoutés/adaptés : ancien mode Trajets ignoré sur accueil conducteur, aucun
repli vers un trajet public si les clients sont absents/en erreur/en chargement,
requêtes publiques réellement ignorées dans les options des hooks (avec/sans GPS),
cache non réinjecté, changement de rôle immédiat, retour après trajet, préservation
des réservations personnelles, recherche conducteur démarrant sur les trajets,
arrêt/partage disponibles sans menu et désactivés pendant traitement/hors écran.

TypeScript sans émission, ESLint ciblé et `git diff --check` réussis. Contrôles
réseau et taille réussis : 1 090 sources, aucune au-delà de 400 lignes. Lint de
ce complément sans erreur ni avertissement ; les avertissements documentés pour
d’autres fichiers du changement précédent ne sont pas présentés comme corrigés.

Aperçus Web inspectés : accueil conducteur aux largeurs 320/390 px et navigation
de descente aux formats 320 × 568 / 390 × 760. Carte et icônes de substitution,
données fictives. Le bouton de recherche et les commandes Partager/Arrêter sont
visibles ; la liste de clients reste défilante sans modifier la taille de la carte.

## Limites

Aucun essai sur téléphone Android/iOS, build ou déploiement effectué. Les tests
de hooks simulent les requêtes : ce ne sont pas des mesures de trafic réseau
réel ni de mémoire, de batterie ou de crashs. Les très grandes polices, lecteurs
d’écran, partage natif, confirmations multi-passagers et retours entre accueil,
recherche et trajet restent à vérifier sur appareils avant livraison.
