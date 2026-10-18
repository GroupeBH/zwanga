# Caméra de navigation et consommation GPS — 22 septembre 2026

## Constats et limites du diagnostic

Le saut vers l'océan et la chauffe signalés ne sont pas reproduits sur appareil
physique dans cette intervention. Les corrections ciblent des risques constatés
dans le code, sans conclure qu'ils expliquent à eux seuls tous les symptômes.

- La carte passager commence sous le bandeau mesuré, mais le cadrage ajoutait
  de nouveau toute la hauteur de ce bandeau dans ses marges.
- Les marges fixes pouvaient dépasser la place disponible sur une petite carte.
- Les points passager n'étaient pas revalidés au moment des commandes caméra ;
  le premier cadrage était considéré comme réussi même sans point utilisable.
- Le conducteur pouvait lancer une animation de perspective en même temps que
  le cadrage issu d'une réponse d'itinéraire.
- `Number(null)`, `Number('')` et `Number(false)` pouvaient transformer une
  coordonnée absente en zéro dans la normalisation partagée.
- Accueil et gestion du trajet utilisaient leur propre `watchPositionAsync`,
  même lorsqu'une tâche de trajet fournissait déjà des positions.
- `timeInterval` est une option Android : elle ne limite pas les callbacks iOS.
  Voir la [documentation Expo Location SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/location/#locationoptions).

## Corrections

### Caméra conducteur et passager

`utils/navigation/mapCamera.ts` centralise les coordonnées admises, la région
initiale et le cadrage. Les coordonnées restent soumises aux limites RDC et à
la correction existante des latitude/longitude inversées. Une latitude réelle
de zéro reste valide en RDC ; seules les valeurs absentes ou invalides sont exclues.

Le cycle de vie de la carte conserve ses dimensions dans une référence, sans
nouveau rendu à chaque mesure. Les commandes attendent toujours le chargement
natif et un layout non nul. Les marges sont bornées proportionnellement pour
laisser au moins 40 % de chaque axe au calcul natif. Les points identiques ou
quasi identiques passent par un cadrage sur un point, pas par des limites nulles.

Côté passager, la marge supérieure interne est de 24 points, sans compter deux
fois le bandeau. Un cadrage initial refusé ou sans données pourra être retenté
lorsque les données arrivent. Après réussite, les mises à jour GPS ne recentrent
pas la caméra en boucle. Les actions de recentrage restent disponibles.

Sur iOS, les cadrages ne sont plus animés. La perspective initiale conducteur
attend la fin du calcul de route et utilise `setCamera`, avec une vue à plat,
au lieu d'une animation inclinée à 60 degrés. Le conducteur peut toujours
manipuler la carte. Android conserve l'animation de perspective.

Ces protections ne constituent pas une preuve d'absence de défaut dans les SDK
cartographiques ; leur comportement visuel doit encore être testé sur appareils.

### Partage du GPS et mises à jour de l'interface

`useUserLocation` accepte une clé `driver:<tripId>` ou `passenger:<bookingId>`.
L'accueil et la gestion d'une course utilisent alors `subscribeRideLocation`,
comme la navigation. Les échantillons de la tâche native sont réutilisés ; si
celle-ci ne fournit plus de positions, le secours premier plan reste partagé.
Sortir d'un écran retire son abonnement, pas celui des autres consommateurs.

Le flux d'affichage transmis à Redux est limité à une mise à jour toutes les
5 secondes en contexte de navigation, ou toutes les 15 secondes en recherche
de proximité. Aucun timer supplémentaire : le filtrage s'effectue à réception.
Cette limitation ne touche PAS les positions métier nécessaires au suivi,
aux confirmations automatiques, à l'embarquement ou à la dépose.

Les seuils de fraîcheur, les requêtes RTK Query, les paiements, les réglages
natifs de détachement/gel Android et les permissions restent inchangés.

## Ce qui reste volontairement actif

La tâche native d'une course continue quand l'utilisateur consulte un autre
écran. Le préarmement passager jusqu'à deux heures avant le départ reste lui
aussi inchangé, avec sa précision actuelle : il sert au démarrage du suivi
lorsque le téléphone est déjà en veille. Son coût énergétique mérite une mesure
distincte avant de changer la précision ou la cadence, afin de ne pas retarder
la détection de l'embarquement.

## Vérifications

- `npm run test:navigation` : lifecycle, cadrage, reprise après arrière-plan,
  invalidation des callbacks tardifs, partage du GPS et écoute conducteur.
  Résultat : 43 tests réussis. Vérification TypeScript réussie ; lint sans erreur
  (trois avertissements préexistants dans la gestion du trajet et le contrôleur
  passager). Contrôle des frontières réseau réussi.
- Tests ajoutés : petites cartes/rotation, coordonnées absentes/océan, points
  identiques, attente des données, 1 000 mises à jour sans recentrage automatique,
  10 minutes de GPS simulé sans multiplication des abonnements, suivi métier
  non ralenti et nettoyage au changement de trajet/écran.
- Suite complète : 670 tests réussis sur 672. Les deux snapshots déjà en défaut
  concernent les styles des réservations et les endpoints PIN utilisateur,
  non modifiés ici.
- Les fichiers applicatifs modifiés restent sous 400 lignes. L'exception
  préexistante `app/wallet.tsx` (414 lignes) est hors périmètre.

## Validation release sur appareils réels

1. Comparer 15 minutes sur Profil/Accueil sans course ni réservation proche,
   puis avec une réservation à venir : relever consommation et température.
2. Faire une course conducteur et une course passager de 30–60 minutes. Vérifier
   embarquement, suivi, paiement et dépose ; ne pas désactiver les automatismes.
3. Pendant ces essais : petits écrans, rotation, texte agrandi, réseau lent,
   changement de point à rejoindre, recalcul, ouverture de modals, veille et reprise.
4. Vérifier le cadrage initial et les boutons de recentrage, sans saut à 0/0,
   sans recentrage forcé après manipulation manuelle.
5. Comparer CPU, mémoire et énergie en build release sur le même iPhone, dans
   des conditions comparables. Les tests JavaScript ne mesurent pas la chauffe
   et ne remplacent pas ce contrôle natif.
