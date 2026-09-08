# Frontières réseau de l'application mobile

Toutes les requêtes HTTP de l'application passent par RTK Query. Le contrôle
`npm run check:network` empêche l'ajout de `fetch`, `axios` ou `XMLHttpRequest`
directement dans le code applicatif.

Les couches HTTP autorisées sont :

- `store/api/baseApi.ts` pour l'API Zwanga authentifiée ;
- `store/api/authRefreshApi.ts` pour le renouvellement de session sans créer
  de boucle d'authentification ;
- `store/api/mapboxApi.ts` pour les services Mapbox, sans transmettre le jeton
  Zwanga à un service tiers.

Les connexions Socket.IO de chat et de suivi sont des flux temps réel, pas des
requêtes HTTP. Elles restent dans leurs services dédiés et alimentent les
caches RTK Query après réception des événements. Les notifications push et les
API natives du téléphone sont également hors du périmètre HTTP.
