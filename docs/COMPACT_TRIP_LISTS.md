# Cartes compactes des trajets et réservations

## Écrans concernés

- `app/(tabs)/trips.tsx` : listes « Publiés » et « Réservations ».
- Détail conducteur : réservations reçues dans `ManageTripBookings`.
- `app/my-requests.tsx` et les deux onglets de `app/requests.tsx` : demandes personnelles et disponibles.
- `app/bookings.tsx` : réservations actives et historique.
- Le formulaire de modification, les confirmations de suppression et les règles métier restent inchangés.

## Informations et actions

`features/trips/TripListCards.tsx` réutilise `CompactTripCard` :

- départ et destination en gras, chacun sur une ligne ;
- statut, horaire de départ, places et montant ;
- photo de 32 points, nom, note et véhicule dans la ligne secondaire ;
- prix par place pour un trajet publié, total estimé calculé comme auparavant pour une réservation ;
- destination personnelle du passager conservée lorsqu’elle existe.

Toucher la carte ouvre le même détail qu’auparavant. « Modifier » n’apparaît que si la modification est autorisée. « Supprimer » conserve son ouverture de confirmation, et reste absent pour les trajets issus d’une demande. Les boutons sont séparés de la zone tactile du résumé : une action ne déclenche pas simultanément l’ouverture du détail.

Dans les réservations reçues, la photo et le nom forment un seul accès au profil, avec un chevron. Le bouton « Profil » redondant a été retiré. Accepter, refuser, contacter, annuler avant embarquement et noter conservent leurs conditions, leurs identifiants, leurs indicateurs de traitement et leurs destinations. Les états de progression passent sous les actions au lieu de les comprimer.

## Taille et performance

Les marges entre les cartes passent à 8 points ; les marges latérales de « Mes trajets » sont de 12 points. Les zones d’action gardent une hauteur minimale de 44 points. Les textes secondaires sont bornés, les statuts peuvent revenir à la ligne, et les lecteurs d’écran conservent le résumé complet.

Les listes virtuelles, la pagination, les filtres, Redux et RTK Query ne changent pas. Les cartes publiées et réservées restent mémorisées avec `React.memo`. Aucun nouveau timer, effet de navigation, calcul d’itinéraire ou appel de profil n’est ajouté. Les estimations d’arrivée ne sont plus calculées dans ces aperçus et restent accessibles dans les détails. Les photos utilisent les URL déjà reçues, avec initiales de remplacement.

## Demandes et réservations personnelles

`RequestListCard` remplace les mises en page dupliquées. Le statut, les deux bornes du départ souhaité, les places, le budget **par place**, les offres et le conducteur sélectionné restent affichés. Le tri de « Mes demandes », la mise en avant de la demande active et l’ouverture via `getTripRequestDetailHref` sont conservés. Les demandes disponibles gardent la photo du passager et, pour les conducteurs, une action « Accepter » séparée qui ouvre la demande comme auparavant. La date de création et la description ne prennent plus de place dans l’aperçu ; le détail reste accessible en touchant la carte.

`BookingListCard` conserve la photo du conducteur, la destination personnelle et le montant total estimé existant. Sans trajet chargé, « Prix à préciser » remplace l’ancien repli qui affichait par erreur le nombre de places comme un montant. La carte ouvre le détail ; les actions suivre, WhatsApp, annuler et noter gardent leurs conditions et identifiants. Les messages de synchronisation restent visibles sans faux bouton d’état. Les actions reviennent à la ligne sur petit écran et restent d’au moins 44 points.

Les animations d’entrée par ligne et le journal de données complet de « Mes demandes » ont été retirés. Les listes de demandes rendent six éléments initialement, par lots de six, avec une fenêtre de cinq écrans. Le polling lié à l’activité de l’écran et les sources RTK Query sont inchangés.

## Ajustement de l’accueil

Le compteur sous « Bonjour » a été supprimé ; les nombres restent dans le panneau des résultats. Le profil, la photo et les notifications restent accessibles. Un trajet en cours conserve son libellé utile sous la salutation.

Le panneau développé n’a plus de hauteur fixe : la liste horizontale virtualisée occupe la hauteur de ses cartes, avec seulement 8 points sous celles-ci. La hauteur repliée et le décalage iOS au-dessus de la barre d’onglets restent conservés. `onSheetLayout` sert uniquement à placer le bouton de recentrage de la carte au-dessus du panneau ; sa mesure n’est jamais réinjectée dans la hauteur du panneau, pour éviter une boucle de mise en page. Les mesures identiques sont dédupliquées et les dimensions invalides ignorées. Aucun effet de caméra, timer ou requête n’est ajouté.

## Vérification

- `npm run test:trip-cards` : affichage, photos, navigation, restrictions d’édition/suppression, destination personnelle, montants affichés, acceptation/refus, traitement en cours, annulation avant embarquement, contact et notation.
- `tests/personalListCards.test.js` : données, photos, offres, suivi, contact, annulation, synchronisation, expiration et notation.
- `tests/homeCompactLayout.test.js` : salutation sans compteur, panneau intrinsèque et stabilité sur 100 mesures répétées, iOS et Android simulés.
- `node scripts/preview-home-cards.cjs` : aperçus statiques à 320 et 390 pixels dans `.expo/home-cards-preview/driver-lists.html`, `personal-lists.html` et `layout.html`, avec images de test locales.
- TypeScript, lint, limite de 400 lignes et frontière réseau contrôlés séparément.

Avant diffusion : vérifier sur iOS et Android les textes agrandis, les longues adresses, les différentes réservations et les actions pendant une connexion lente. Les aperçus web et tests simulés ne remplacent pas une validation native.

## Résumé dans « Gestion du trajet »

`ManageTripSummary` isole le résumé conducteur : horaire discret, deux lignes de lieux en gras, puis places disponibles/capacité et tarif sur une ligne. Le statut reste dans l’en-tête de l’écran au lieu d’être répété. La grande frise et les sous-cartes avec icônes entourées sont supprimées. Un tarif nul affiche « Gratuit » ; un tarif positif est indiqué par place, sans multiplication ni modification des données métier.

Les libellés utilisent le formateur local commun `getRouteStopLabel`, sans géocodage supplémentaire ni réécriture des adresses stockées. Les lecteurs d’écran disposent de l’adresse complète et du sens départ/arrivée. Les lieux peuvent occuper deux lignes ; les statistiques reviennent à la ligne si nécessaire. Aucune hauteur fixe ni désactivation de l’agrandissement du texte n’est imposée.

La modification des adresses conserve son action et sa condition `upcoming`, avec une zone tactile d’au moins 44 points. Passagers, interruptions, sécurité, rafraîchissement et boutons fixes restent inchangés. Le résumé est mémorisé avec `React.memo`, sans effet, animation, mesure de disposition ni abonnement réseau.

`tests/manageTripSummary.test.js`, inclus dans les deux commandes de tests ci-dessus, vérifie ces informations et actions. Le script d’aperçu produit également `manage-summary.html` à 320 et 390 pixels avec trajets gratuits/payants, longs noms et grandes valeurs. Cet aperçu web ne constitue pas un test de crash sur appareil natif.

## Durcissement iOS / Android après compactage

### Détail public et recherche

Dans `TripSummary`, le grand titre « départ vers destination » a été supprimé : chaque lieu n’apparaît qu’une fois dans le bloc d’adresses. Les horaires complets accompagnent désormais les lieux, avec la mention « Arrivée estimée ». Le composant commun `RouteLocationDetails` conserve les adresses complémentaires, les repères et les textes accessibles, sans tronquer les lieux. Son mode compact et ses horaires sont optionnels ; les détails des demandes gardent leur présentation par défaut.

Statut/prix et places/distance sont présentés sur des lignes légères, sans les quatre tuiles d’information. La photo du conducteur, son profil, le détail du véhicule et les deux actions de contact restent présents. L’exigence d’identité vérifiée est conservée dans un bandeau court. La carte garde son ouverture plein écran, mais son ancien cartouche d’horaire et son bouton d’agrandissement font place à un seul accès « Voir la carte ». L’animation d’entrée du résumé a été retirée ; aucun timer, requête ou calcul d’itinéraire supplémentaire n’est introduit.

`useSearchResults` exclut les trajets du compte connecté (`driverId` ou `driver.id`) avant le tri et le comptage. La règle couvre les résultats serveur, la recherche par coordonnées et le cache local, sans modifier les données partagées ni les trajets accessibles dans « Mes trajets ». Le profil déjà présent dans Redux sert de repli pendant le chargement du profil distant. Le filtrage est mémorisé selon l’identifiant utilisateur et se met à jour lors d’un changement de compte.

Vérifications : `searchOwnTrips.test.js`, `searchScreen.test.js`, `tripDetailCompact.test.js`, `routeLocationDetails.test.js` et `tripDetailPerformance.test.js` sont inclus dans `test:ui-stability`. L’aperçu `trip-detail.html` couvre 320 et 390 pixels, les noms longs, les références et un trajet en cours.

### Cycle de vie des listes et de la carte d’accueil

- `HomeMap` est mémorisé avec la comparaison superficielle standard de React : une mesure du panneau ou un changement d’un autre élément de l’interface ne suffit plus à rendre les marqueurs natifs lorsque leurs entrées sont inchangées. Les changements de coordonnées, marqueurs, trajet ou visibilité restent pris en compte ; aucun comparateur personnalisé ne les ignore.
- `useHomeSheet` invalide les anciens événements de mise en page après repli, rotation, changement de visibilité ou démontage. Les mesures identiques sont toujours dédupliquées. Une mesure courante reçue pendant que l’écran est caché reste conservée, pour que le bouton de recentrage soit correctement placé au retour même si des données sont arrivées entre-temps.
- L’animation de chargement utilise une seule valeur et une seule interpolation par montage. Elle est explicitement non interactive, fonctionne sur le moteur natif, ne redémarre pas aux rendus ordinaires et s’arrête en quittant l’écran, en arrière-plan et au démontage.
- Les fonctions de rendu des réservations et de rafraîchissement du flux gardent leur identité tant que leurs dépendances ne changent pas. Le rafraîchissement ne rend donc plus inutiles la mémorisation des cartes et celle de l’action d’annulation. Les nouvelles données, le changement d’onglet et les états de traitement restent propagés.

`npm run test:ui-stability` réunit les tests d’accueil, cartes, navigation, GPS, messagerie et politique de performance. Les tests de cycle de vie simulent notamment 100 retours/rotations/replis et 1 000 rendus avec des dépendances inchangées, pour iOS et Android lorsque le comportement dépend de la plateforme. Ce sont des tests avec entrées/sorties natives simulées, pas une mesure de la mémoire réelle du téléphone.

Validation native avant diffusion :

1. Sur un build de production iOS et Android, rester sur l’accueil puis en navigation pendant 20 à 30 minutes ; surveiller la mémoire, les blocages et les rapports de crash.
2. Répéter ouverture/repli du panneau, swipe des priorités, changement d’onglet, détail/retour et arrière-plan/premier plan, y compris pendant un chargement lent.
3. Tester les grandes polices, les photos absentes ou lentes et les longues listes ; vérifier que les cartes, le recentrage, les actions de réservation et le suivi GPS restent utilisables.

Aucun changement de prix, paiement, statut de réservation, requête supplémentaire ou fréquence GPS n’est inclus dans ce durcissement. Les tests automatisés ne permettent pas de garantir l’absence de tout crash natif ou de manque de mémoire sur tous les appareils.
