# Adresses lisibles — 16 septembre 2026

## Problème corrigé

Le sélecteur utilisait le premier fragment de `formattedAddress` avant la
virgule comme titre. Ainsi `J83F+5G4, Av. Bakole 1, Kinshasa` devenait
`J83F+5G4`, malgré la présence d'un nom d'avenue exploitable.

## Règle commune côté mobile

`utils/readableLocation.ts` traite les libellés sans changer les coordonnées,
les identifiants des lieux ni le texte des requêtes de recherche.

- Retrait des Plus Codes complets/courts dans les textes affichés.
- Retrait prudent des identifiants compacts de type `HF6ZT7E` en début de
  fragment, sans supprimer RN1, UPN, les numéros de rues ou les dates.
- Priorité au nom lisible fourni (repère choisi, favori personnalisé), puis
  au lieu nommé dans les composants d'adresse, à l'avenue/rue et au quartier.
- Un nom automatique préfixé par `Q/`, `Quartier`, `Commune`, ou correspondant
  à un quartier/une localité dans les composants reçus ne passe plus devant
  une rue disponible. Un `premise` préfixé `Q/` n'est pas assimilé à un monument.
- Si le composant `route` manque, recherche d'un fragment d'adresse commençant
  par une voie explicite (`Avenue`, `Av`, `Av.`, `Rue`, `Rte`, `Boulevard`, etc.),
  éventuellement précédée d'un numéro. Le numéro reste conservé même si le
  fournisseur écrit `Avenue` dans un champ et `Av` dans l'autre.
- Utilisation du texte d'adresse nettoyé ou des composants disponibles comme
  contexte, avec suppression des répétitions exactes.
- Sans information exploitable : `Point sélectionné` / `Ma position` et
  `Position exacte enregistrée sur la carte`. Aucun monument voisin n'est
  inventé ou présenté comme étant l'emplacement exact du passager.

Les types de composants (`route`, `neighborhood`, `premise`, `plus_code`, etc.)
suivent la [documentation Google de géocodage inverse](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-reverse-geocoding).
Le backend transmet déjà ces composants ; aucune migration ni modification
de contrat obligatoire n'est nécessaire.

## Parcours couverts

- Sélection sur la carte, bouton « Ma position » et confirmation du sélecteur.
- Suggestions Google et détails d'un lieu recherché.
- Favoris affichés ou choisis dans le sélecteur et ancienne sélection rouverte.
- Préremplissage GPS utilisé par l'accueil, la publication et la demande.
- Géocodage des adresses saisies manuellement.
- Détails des trajets et des demandes, côté conducteur comme côté passager :
  titre du trajet, bloc départ/destination et légendes des cartes.
- Récapitulatif de réservation et intitulé du trajet dans le modal de modification.
- Noms inclus dans le partage déclenché depuis le détail du trajet.

Les lieux déjà enregistrés en base ne sont pas réécrits par cette modification.
Une nouvelle sélection validée transmet le libellé lisible au formulaire.

### Présentation des lieux déjà enregistrés

`utils/routeLocationLabels.ts` adapte les anciennes données à la présentation.
Les mappers de trajets peuvent recopier la même adresse complète dans `name`
et `address` : l'adaptateur ne la prend pas pour un nom personnalisé et extrait
le titre utile avec la règle commune. Il ne modifie ni le cache RTK Query,
ni les valeurs originales des formulaires, ni les coordonnées.

`components/trip/RouteLocationDetails.tsx` est partagé par les résumés conducteur
et passager. Il affiche le titre, le contexte restant (sans répéter le titre),
puis le repère saisi lorsqu'il existe. Les textes reviennent à la ligne et les
libellés complets sont accessibles aux lecteurs d'écran. Les résumés et cartes
utilisent les mêmes libellés dérivés.
Les repères saisis sont conservés tels quels : une instruction utilisateur ou
un code de portail n'est pas traité comme un code de géocodage.

`hooks/useRouteLocationLabels.ts` et `hooks/useRouteStopLabel.ts` conservent
la priorité du libellé enregistré. Une variation du GPS du conducteur, du prix
ou du statut ne déclenche pas une nouvelle recherche.

Si une ancienne entrée ne contient qu'un code, un ancien texte d'attente
(`Destination`, `Ma position`, etc.) ou aucun nom, les détails peuvent désormais
récupérer une adresse avec les coordonnées du point de départ/destination
enregistré. Ils n'utilisent jamais la position actuelle de l'utilisateur.
La réponse est normalisée avec la règle commune, composants d'adresse compris.

Pendant la recherche, le bloc indique `Recherche de l’adresse…`. Si le nom
reste introuvable ou si le réseau échoue, il indique `Nom du lieu indisponible`
et conserve le repère saisi. Aucun message serveur technique n'est affiché.
Le titre utilise uniquement les noms connus : `Départ : Botango` tant que
l'arrivée n'est pas résolue, puis `Botango vers Av. Bakole 1` si cette adresse
est effectivement reçue. Il ne présente plus `Destination` comme un nom propre.

### Cache de récupération et stockage durable

`getRouteLocationAddress` est une lecture RTK Query utilisant le POST existant
`/google-maps/reverse-geocode`. La mutation du sélecteur reste inchangée.

- Aucune requête si un libellé lisible existe déjà.
- Aucune requête sans coordonnées numériques valides ; les points de secours
  `(0, 0)` et `hasCoordinates: false` sont exclus.
- Requêtes simultanées dédupliquées par coordonnées/langue/région.
- Résultat conservé en mémoire 5 minutes après le dernier désabonnement.
  Les réponses reçues sans nom exploitable bénéficient aussi de ce cache.
- Pas de polling ni de rafraîchissement forcé au montage ou au focus.
  La reconnexion réseau permet de réessayer sur un écran actif.
- Pas de souscription réseau pour un écran inactif ou un formulaire masqué.
- Utilisation de `currentData` pour ne jamais afficher la réponse d'un ancien
  point après un changement d'itinéraire ; démontage géré par RTK Query.
- Coordonnées, prix, cache du trajet et formulaires ne sont jamais réécrits.

Ce cache n'est **pas** un enregistrement permanent du nom récupéré.
Le backend stocke déjà `departureLocation` / `arrivalLocation` et leurs points
GPS pour les trajets et les demandes. Pour éviter toute nouvelle résolution
des anciennes entrées entre appareils ou après expiration du cache, une étape
distincte doit compléter les libellés manquants **côté serveur**, puis les
renvoyer dans le trajet. Cette persistance n'est pas réalisée par ce correctif
mobile. Elle devra préserver les noms choisis par l'utilisateur et ne jamais
associer une réponse tardive à des coordonnées modifiées entre-temps.

Exemple complémentaire : `Q/Mazamba Domicile, 3b Av Matadi, Kinshasa, RDC`
donne le titre `3b Av Matadi` et l'adresse
`3b Av Matadi, Q/Mazamba Domicile, Kinshasa, RDC`. L'avenue passe en tête des
deux lignes ; le quartier reste présent comme contexte. Les noms explicites
comme `Maison` ou `Église La Compassion` restent des titres valables.

## Performance et concurrence

- Aucune recherche de monument supplémentaire, aucun nouveau polling.
- Les appels Google existants et la récupération des anciennes adresses passent par RTK Query.
- Le géocodage inverse demande les textes en français, avec région RDC.
- Temporisation existante de 400 ms, cache borné à 40 adresses pour 5 minutes
  et annulation des lectures obsolètes conservés.
- Une adresse reçue ne modifie jamais le point choisi sur la carte.
- Une réponse tardive ne remplace pas le nom d'un favori choisi entre-temps,
  même si ses coordonnées sont identiques.
- La validation du point reste possible hors connexion.

## Vérification

Tests automatisés : `tests/readableLocation.test.js` et
`tests/locationPicker.test.js`, avec transports et GPS simulés ;
`tests/routeLocationDetails.test.js` vérifie les anciennes données, leur
immutabilité, la mémorisation, les deux rôles sur les demandes, les marqueurs
de carte et l'affichage accessible sans tronquer les noms.
`tests/routeLocationResolution.test.js` couvre la récupération asynchrone, les
coordonnées invalides, les réponses obsolètes, les anciens textes d'attente,
les changements d'écran et le repli hors connexion.
`tests/routeLocationCache.test.js` utilise un vrai store Redux/RTK Query avec
transport simulé pour vérifier déduplication, réutilisation et désabonnement.

À vérifier sur téléphone Android et iOS :

1. Choisir le point de la capture : « Av. Bakole 1 » remplace le code.
2. Tester une adresse avec un repère connu, puis un quartier sans rue nommée.
3. Rechercher un code : la recherche reste possible, seul son affichage change.
4. Choisir un favori « Maison » pendant une réponse réseau lente : son nom reste.
5. Couper Internet, choisir un point et confirmer : les coordonnées sont conservées.

Les tests n'interrogent pas Google en direct et ne garantissent pas qu'un nom
d'avenue ou de monument existe pour chaque point : cela dépend des données
reçues du fournisseur.
