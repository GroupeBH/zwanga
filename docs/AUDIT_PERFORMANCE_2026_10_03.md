# Audit de performance du 3 octobre 2026

> Suite de l'audit : les cinq points ont depuis été traités dans le code local.
> Voir les [corrections, validations et limites](CORRECTIONS_PERFORMANCE_2026_10_03.md).
> Le présent rapport conserve l'état constaté avant cette implémentation.

## Périmètre et résultat

Scan du code local Expo/React Native : restauration de session, coordinateurs
globaux, requêtes RTK Query, listes, messagerie, parrainage, historiques,
cartographie et suivi GPS. Vérification ciblée, en lecture seule, des services
NestJS locaux de réservation, conversation et parrainage dans `zwanga-backend`.
Les corrections des audits précédents ont été consultées pour ne pas présenter
des problèmes déjà résolus comme de nouveaux constats.

**Quatre priorités réseau/serveur et une optimisation secondaire sont relevées.**
Leur présence dans le code est vérifiable ; leur impact en production dépend
notamment du volume par compte. Aucun blocage généralisé ou incident de chauffe
n'est démontré par cet audit.

**Aucun correctif fonctionnel appliqué.** Seuls ce rapport et son entrée dans
`CHANGEMENTS_TECHNIQUES.md` sont ajoutés. Aucun changement de dépendance, backend,
configuration native, base de données ou déploiement. Aucun secret, fichier
`.env`, journal de production ou compte utilisateur réel consulté.

Le guide `supabase-postgres-best-practices` a servi à distinguer les problèmes
de volume et d'allers-retours visibles dans le code des hypothèses de plans SQL.
Aucun index manquant ni temps SQL réel n'est affirmé sans mesures de base.

## Priorités

| Réf. | Priorité | Problème restant | Correction proposée, non appliquée |
| --- | --- | --- | --- |
| P01 | Moyenne, avant montée en volume | Parcours complet de la messagerie avant certains contacts directs | Résolution ciblée et idempotente de la conversation côté serveur |
| P02 | Moyenne, avant montée en volume | Lecture de toutes les réservations pour un seul détail ou profil | Lecture autorisée ciblée par trajet ; agrégat public pour les statistiques |
| P03 | Moyenne, avant montée en volume | Filleuls sans pagination ni virtualisation ; lectures du parrainage non suspendues hors écran | Pagination serveur, liste virtualisée et politique d'activité écran |
| P04 | Moyenne, selon commissions à débloquer | Traitement transactionnel des commissions répété dans trois endpoints de lecture | Réconciliation mutualisée et bornée, avec garanties comptables conservées |
| P05 | Faible, à profiler sur appareil | Parcours géométriques complets répétés côté passager | Prétraitement/cache géométrique et réutilisation des calculs stables |

La priorité décrit un risque, pas une latence de production mesurée. P01–P04
peuvent être traités avant P05 ; aucun ne justifie de réduire arbitrairement la
fraîcheur des données de sécurité ou de paiement.

## P01 — Ouvrir un contact peut parcourir toute la messagerie

**Sources :** `hooks/navigation/useTripContactMessaging.ts:43`, `:48`, `:49` ;
`store/api/messageApi.ts:73` ; backend `src/chat/chat.service.ts:53` et `:95`.

Sans `bookingId` et sans conversation déjà connue localement, le hook télécharge
successivement les pages de 50 conversations jusqu'au contact recherché ou à la
fin de la liste. Il ne navigue qu'ensuite. La pagination de la boîte de réception
est bien bornée ; c'est ce parcours de recherche spécifique qui ne l'est pas.

**Reproduction JavaScript réalisée :** exécution du vrai hook via la fixture de
`tests/tripContactMessaging.test.js`, avec 1 000 conversations fictives, aucun
contact correspondant et aucune réservation. Résultat : **20 lectures successives,
une création puis une navigation**, au maximum une lecture en vol. Réseau et
navigation simulés ; aucun message ou objet serveur réel créé.

Le temps d'attente cumule donc les réponses de ces pages. Exemple purement
illustratif, non mesuré : vingt réponses de 300 ms représentent environ six
secondes avant la création. La latence effective mobile n'est pas connue.

**Proposition :** endpoint autorisé de recherche/création d'un échange direct
pour les participants exacts, avec réutilisation atomique. Le POST général actuel
crée une conversation quand il n'y a pas de réservation : supprimer uniquement
la boucle client risquerait donc les doublons. Le chemin lié à une réservation
réutilise déjà son échange côté serveur et n'est pas concerné par ce scan.

**À préserver/tester :** droits de participation, échanges liés aux réservations,
absence de message automatique, doubles appuis, annulation, changement de compte
et réponses tardives. Harmoniser aussi le bouton historique du détail
(`hooks/trip-detail/useTripDetailContactActions.ts:48`), qui ne cherche que dans
une première page, plutôt que copier cette limitation comme correctif.

## P02 — Tout l'historique de réservations pour un écran ciblé

**Sources :** `hooks/trip-detail/useTripDetailData.ts:85` et `:107` ;
`hooks/rating/useRatingData.ts:28` ; `app/passenger/[id].tsx:41` et `:69` ;
`store/api/booking/createBooking.endpoints.ts:60` ; backend
`src/bookings/bookings.service.ts:1367` et `:1384`.

Le détail d'un trajet terminé/annulé et l'écran de notation passager utilisent
`getMyBookings`, puis filtrent le résultat pour le trajet courant. L'endpoint
sans `scope=activity` charge toutes les réservations du compte avec trajet,
conducteur et véhicule, sans limite. Son cache serveur réduit certaines lectures
SQL, mais pas le volume téléchargé, transformé et conservé côté téléphone.
Le détail redemande cette liste lors du réabonnement à l'écran.

Le profil d'un autre passager charge lui aussi les réservations du compte connecté
avant de les filtrer par l'identifiant de la personne affichée : cette lecture
ne fournit normalement pas les statistiques recherchées pour un autre compte.

**Proposition :** une lecture des réservations du compte limitée au trajet
concerné, ou enrichissement du détail participant avec les seuls champs requis.
Pour le profil public, un agrégat serveur autorisé, et non le téléchargement
d'historiques privés. Conserver la pagination existante pour naviguer réellement
dans l'historique.

**À préserver/tester :** toutes les réservations pertinentes d'un même trajet,
notation et contestation, statuts annulé/terminé, paiements et droits passager /
conducteur. Ne pas simplement ajouter `take: 50` à l'ancien endpoint : cela
pourrait masquer la réservation recherchée. Les coordinateurs globaux utilisent
déjà `scope=activity` ; ce constat ne leur attribue pas une lecture de tout
l'historique au repos. Pas de mesure de taille HTTP ou de durée SQL réelle.

## P03 — Parrainage : volume affiché et travail hors écran

**Sources :** `app/referrals.tsx:28`, `:44`, `:63`, `:116` et `:190` ;
`store/api/referralApi.ts:65` ; backend `src/referrals/referrals.service.ts:456`,
`:459`, `:534` et `:575` ; `services/nativeQueryListeners.ts:29`.

La liste des filleuls est chargée sans pagination serveur, avec jointure utilisateur
et agrégation des gains de tous les filleuls. Le composant affiche ensuite tous
les éléments par `map` dans un `ScrollView`, sans fenêtre de rendu. Le nombre de
lignes montées augmente donc avec le nombre total de filleuls, y compris lors
des rendus liés à la saisie du montant de retrait.

Les commissions et retraits sont, eux, **déjà plafonnés à 100 chacun côté serveur**.
Il ne s'agit pas de listes illimitées. Toutefois, l'écran n'en montre respectivement
que huit et cinq après téléchargement, sans demander ces limites à l'API.

Les quatre lectures n'ont pas de `skip` lié à l'activité de l'écran et activent
`refetchOnFocus`. Dans ce projet, le focus RTK Query vient du retour au premier
plan de l'application, pas de la visibilité de cette route. Si cette page reste
montée sous une autre route, ses abonnements peuvent donc relire les quatre
endpoints au retour à l'application. Ce n'est pas un polling permanent en arrière-plan.

**Proposition :** pagination serveur stable des filleuls avec agrégation limitée
aux identifiants de la page ; `FlatList`/`SectionList` et lignes mémorisées ; limites
adaptées aux aperçus récents avec accès aux pages suivantes. Réutiliser la politique
`useScreenIsActive` des autres écrans pour les lectures d'affichage. Préserver
séparément les opérations de paiement et la réconciliation d'un retrait en cours.

**À préserver/tester :** compteurs globaux indépendants de la page, soldes serveur,
QR et partage, accès à tous les filleuls, actualisation manuelle, retour depuis
une application de paiement/partage et traitement des erreurs. Présence du défaut
confirmée par lecture croisée ; pas de mesure mémoire ni de rendu natif à forte volumétrie.

## P04 — Déblocage des commissions dans le chemin des lectures

**Sources backend :** `src/referrals/referrals.service.ts:386`, `:457`, `:535`,
`:797`, `:999`, `:1009` et `:1014` ; appels mobiles `app/referrals.tsx:44`.

Résumé, filleuls et commissions attendent chacun `releaseMatureRewardsForUser`.
Cette routine sélectionne jusqu'à 500 commissions arrivées à maturité et les
traite séquentiellement, dans une transaction par commission avec verrou
d'écriture, mouvements de solde et écritures de journal.

L'ouverture du parrainage lance les trois endpoints. Si plusieurs lectures voient
les mêmes commissions encore en attente, elles peuvent parcourir les mêmes
identifiants et attendre les mêmes verrous. Le contrôle du statut dans la
transaction empêche de présenter cela comme un double crédit démontré ; le risque
ici est du travail redondant et une attente avant affichage. Le cron horaire
existant réduit le stock à traiter, sans supprimer ce chemin de lecture coûteux.

**Proposition :** mutualiser/coordonner cette réconciliation par compte, y compris
entre instances, avec travail borné. Étudier un traitement planifié plus adapté
et une lecture rapide d'un état comptable confirmé. Garder une réconciliation
fiable avant retrait ; ne pas afficher localement un solde supposé disponible et
ne pas simplement supprimer ces appels sans traiter la fraîcheur du solde.

**À préserver/tester :** journal comptable, retenue, unicité, remboursements,
concurrence lecture/retrait et pannes entre écritures. La présence de boucles et
transactions est confirmée par inspection. Aucun retard de cron, nombre réel de
commissions à maturité, conflit de verrou ou durée de transaction n'a été mesuré.

## P05 — Calculs géométriques passager sur de longs itinéraires

**Sources :** `hooks/passenger-navigation/usePassengerDriverCameraTracking.ts:31` ;
`hooks/passenger-navigation/usePassengerNavigationPresentation.ts:98` ;
`utils/routes/routeGeometry.ts:142` ; `utils/navigation/routeProgress.ts:163`.

Un changement de position conducteur recalcule l'orientation en parcourant la
route, puis le découpage du trajet restant recherche à nouveau les points les
plus proches de la position et de la destination. Ce dernier traitement renormalise
et parcourt plusieurs fois la polyline, dont une destination souvent inchangée.
Le chemin conducteur bénéficie déjà d'une analyse indexée ; cette partie
passager utilise encore les recherches exhaustives.

**Micro-mesure locale, non native :** appels des deux vraies fonctions
`getRouteAlignedPosition(..., 0.1)` et `trimPolylineFromCurrentPosition` pour
500 positions fictives, après 30 échauffements. Une exécution Node a donné
186 ms au total pour 1 000 points et 1 495 ms pour 8 000 points, soit environ
0,37 ms et 2,99 ms par paire de calculs. Ce n'est ni le temps de rendu d'une
carte ni un FPS mesuré, et aucune longueur représentative de production n'est connue.

**Proposition secondaire :** partager une analyse de route prétraitée, mettre en
cache la projection de destination et les longueurs cumulées. Vérifier l'équivalence
sur intersections, routes parallèles, demi-tours et destinations décalées avant
réutilisation. La réception visuelle est déjà limitée à une mise à jour toutes
les deux secondes (`features/passenger-navigation/driverLocationDisplay.ts`) :
ne pas présenter ce calcul comme exécuté à chaque frame et ne pas ralentir les
événements métier d'embarquement/dépose pour l'optimiser.

## Contrôles réalisés

- **132 tests JavaScript réussis, zéro échec**, en deux lots de 84 et 48 :
  `performancePolicy`, `performanceGpsPlaces`, `boundedInboxPages`,
  `boundedInboxScreens`, `accountActivity`, `screenIdlePolicy`,
  `performanceReadScheduling`, `rideLocationStream`, `tripContactMessaging`,
  `startupSession`, `navigationLifecycle`, `userLocationLifecycle`,
  `routeAnalysis`, `tripDetailPerformance` (`tests/*.test.js`). Tests existants,
  code TypeScript chargé avec dépendances natives/réseau simulées ; aucun test modifié.
- Reproduction additionnelle P01 sur 1 000 conversations fictives, décrite plus haut.
- `node node_modules/typescript/bin/tsc --noEmit` : réussi. Le lancement initial
  via `npx.ps1` était bloqué par la politique PowerShell ; le binaire local a été
  lancé directement, sans modifier la politique de la machine.
- `node scripts/check-network-boundaries.js` : réussi.
- `node scripts/check-source-size.cjs` : 997 sources, aucune au-dessus de 400 lignes.
- `node scripts/benchmark-driver-route.cjs` : trace fictive de 8 000 points et
  500 positions ; 839 ms pour l'ancien couple de recherches exhaustives contre
  9 ms pour l'analyse indexée existante, construction incluse. Nombre de projections
  de segments : 7 999 000 contre 18 992. Une exécution locale, pas un gain de
  production ni une correction effectuée pendant cet audit.
- `git diff --check` : réussi après ajout de la documentation.

Les tests confirment notamment l'absence de relectures de listes pour 600 résumés
d'activité inchangés, les limites des pages de messagerie/notifications, le partage
du GPS, le nettoyage lors des transitions d'écran et le démarrage avec jetons
valides sans appel réseau d'authentification. Cela ne remplace pas une mesure
complète de démarrage de l'application et de tous ses services.

## Limites et suite proposée

Les recommandations restent **à implémenter**. L'audit ne supprime ni requête,
ni garde, ni fonctionnalité : paiements, double validation embarquement/dépose,
file hors connexion, session, QR et localisation conservent leur comportement.

Pas d'essai iOS/Android physique, profilage Hermes/native, mesure mémoire/batterie,
trace réseau réelle, `EXPLAIN ANALYZE`, charge multi-instance ou test backend lancé.
Les chiffres ci-dessus sont exclusivement des mesures ou tests JavaScript locaux.
La suite utile est de corriger les volumes/allers-retours P01–P04 avec tests de
non-régression, puis mesurer P05 et les transitions carte sur une version release
sur appareils modestes. Aucun gain chiffré de chauffe, crashs ou autonomie promis.
