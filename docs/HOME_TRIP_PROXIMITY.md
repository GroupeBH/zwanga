# Priorité géographique des trajets publiés sur l’accueil

Les suggestions sont classées selon la distance à vol d’oiseau entre la position
de l’utilisateur et le point de départ du trajet, comme les demandes de trajet.
Ce n’est ni la distance jusqu’à l’arrivée ni celle jusqu’au conducteur en mouvement.

- Les réservations existantes restent prioritaires, avec le trajet réservé en cours en tête.
- Les autres trajets sont classés par tranches de distance de 500 mètres :
  0–499 m, 500–999 m, etc. Dans une même tranche, le départ le plus tôt
  passe devant ; à horaire égal, la distance exacte départage les trajets.
  La proximité reste prioritaire entre deux tranches différentes.
- Un départ sans coordonnées utilisables suit les départs localisés, sans être supprimé.
- Sans position utilisable, le classement par jour/horaire est conservé,
  avec l’identifiant comme dernier critère stable.
- Le tri précède la limite de dix trajets et alimente la liste comme les marqueurs de la carte.
- Les exclusions existantes et le traitement dédié du trajet en cours restent actifs.

`useHomeController` transmet la position déjà obtenue par `useHomeLocation` à
`useHomeTripSelection`. Le calcul réutilise les règles de coordonnées du projet
et `calculateDistanceMeters`, sans nouveau suivi GPS ni appel d’itinéraire.
Chaque distance est calculée une fois par trajet ; le résultat est mémorisé tant
que les données et les valeurs latitude/longitude restent identiques.
Les tableaux du cache RTK Query ne sont pas modifiés.

Exemple : un départ dans 10 minutes à 300 m passe avant un départ demain à
100 m. En revanche, un départ à 100 m reste devant un départ à 1 km.
Le seuil est centralisé dans `HOME_DEPARTURE_DISTANCE_BAND_METERS`.

Le tri porte sur les résultats disponibles des requêtes existantes (proximité et
liste générale), ou sur les trajets conservés localement en repli hors connexion.
Il ne remplace pas une recherche exhaustive côté serveur.

Tests : `node --test tests/homeTripPriority.test.js tests/homeModules.test.js tests/homeRequestPriority.test.js`.
