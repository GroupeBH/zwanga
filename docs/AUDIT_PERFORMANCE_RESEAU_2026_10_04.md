# Audit performance et réseau — 4 octobre 2026

> Mise à jour du 5 octobre : les cinq constats ont fait l'objet de
> [correctifs documentés](CORRECTIONS_PERFORMANCE_RESEAU_2026_10_05.md).
> Le texte ci-dessous décrit l'état observé lors de l'audit, avant ces corrections.
> Le nouvel acquittement GPS nécessite le déploiement du backend ; les essais
> physiques restent à réaliser.

## Périmètre et état des lieux

Audit du code local Expo/React Native : appels RTK Query, renouvellement de
session, activité des écrans, reconnexion, suivi GPS/WebSocket et chargement des
contacts. Lecture ciblée du backend voisin `zwanga-backend` pour vérifier le
contrat de confirmation et de normalisation des dates GPS. Les bibliothèques
installées RTK Query et Expo Contacts ont également été inspectées.

Les [corrections du 3 octobre](CORRECTIONS_PERFORMANCE_2026_10_03.md) et celles
des audits antérieurs sont prises en compte : les parcours complets de messagerie,
les réservations téléchargées pour un seul trajet, le parrainage non paginé et
les calculs géométriques déjà corrigés ne sont pas présentés comme des défauts
encore ouverts. La suite mobile complète passe dans l'état local actuel.

**Cinq constats restent ouverts.** Leurs mécanismes sont vérifiés dans le code
et par des simulations JavaScript ciblées ; leur fréquence et leur coût sur des
téléphones de production ne sont pas mesurés. Aucun crash, problème thermique
ou ralentissement généralisé n'est démontré par cet audit.

**Aucune correction fonctionnelle appliquée.** Seuls ce rapport et son entrée
dans `CHANGEMENTS_TECHNIQUES.md` sont ajoutés. Les modifications préexistantes,
notamment la terminologie « arrivée à destination », sont conservées. Aucun
changement de dépendance, configuration native, base de données ou backend ;
aucun déploiement. Ni `.env`, ni secret, ni carnet d'adresses réel, ni trafic
de production consulté.

## Priorités proposées

| Réf. | Priorité | Constat | Solution proposée, non appliquée |
| --- | --- | --- | --- |
| R01 | Moyenne, à traiter en premier | Renouvellement de session bloqué jusqu'à 60 s après un échec transitoire, même si Internet revient | Reprise contrôlée au retour du réseau, sans retirer la déduplication ni les protections de session |
| R02 | Moyenne | Confirmation GPS incompatible avec une date corrigée par le serveur | Acquittement explicite corrélé à l'échantillon et compatible avec les versions existantes |
| R03 | Moyenne | Polling de lectures d'affichage encore actif quand le réseau est déclaré hors ligne | Suspendre ces lectures hors connexion et les reprendre une fois sur l'écran visible |
| R04 | Moyenne | Certains écrans masqués gardent leurs abonnements réactualisables | Étendre la politique d'activité écran aux lectures concernées |
| R05 | Secondaire, surtout gros carnets | Chargement de tous les contacts, images inutilisées et filtrage complet par frappe | Pagination, retrait des images inutilisées et recherche bornée sans perdre de résultats |

Il s'agit d'un ordre de traitement, pas d'une mesure de gravité en production.
R01 et R02 concernent la reprise de service ; R03 et R04 le travail réseau
superflu ; R05 la charge locale et le temps d'ouverture de l'écran d'invitation.

## R01 — Retour du réseau sans reprise immédiate du renouvellement

**Sources :** `services/tokenRefresh.ts:9`, `:32`, `:34` et `:49` ;
`store/api/baseApi.ts:22` ; `services/nativeQueryListeners.ts:13`.

Après un échec transitoire de renouvellement (`FETCH_ERROR`, timeout ou erreur
serveur), `lastAttempt` reste renseigné. Pendant 60 secondes à compter du début
de la tentative, un nouvel appel avec le même refresh token et la même version
de session retourne `null` sans nouvelle requête. Le signal de reconnexion RTK
ne réinitialise pas cette attente.

Lorsque l'access token est expiré, `baseQueryWithReauth` refuse correctement de
l'envoyer et retourne une indisponibilité. Cependant, même une actualisation
manuelle peut donc échouer après le retour d'Internet, jusqu'à la fin du délai.
Le problème ne touche pas les appels utilisant encore un access token valide.
La conservation du contexte hors ligne est correcte et ne doit pas être retirée.

**Reproduction :** vrai module `tokenRefresh.ts`, horloge et transport simulés.
Échec réseau à T0, réseau ensuite disponible : à T0 + 59 999 ms, toujours une
seule requête et résultat `null` ; à T0 + 60 000 ms, deuxième requête et succès.
Ce délai est une règle du code, pas une durée de requête mobile mesurée.

**Proposition :** permettre une tentative contrôlée après une transition fiable
hors ligne → en ligne, et définir une politique explicite pour l'actualisation
manuelle. Conserver une seule tentative en vol, un délai anti-boucle pour les
pannes persistantes et l'isolation par version de session. Un retour réseau ne
doit ni contourner un refus d'authentification serveur ni restaurer un compte
déconnecté. Ajouter le scénario panne → reconnexion aux tests de renouvellement.

## R02 — Position acceptée, mais confirmation GPS rejetée localement

**Sources mobiles :** `services/trackingLocationDelivery.ts:23`, `:45`, `:48` ;
`hooks/driver-navigation/useDriverLocationEmission.ts:75` et `:80` ;
`hooks/passenger-navigation/usePassengerLocationSharing.ts:182` et `:192`.
**Sources backend :** `src/common/utils/tracking-coordinates.ts:17` et `:144` ;
`src/trips/trips.service.ts:3663` ; `src/bookings/bookings.service.ts:6242` ;
`src/tracking/tracking.gateway.ts:197` et `:243`.

Le client exige que la date de l'écho serveur soit au moins égale à `recordedAt`
pour confirmer l'envoi. Le backend corrige pourtant une date supérieure de plus
de cinq secondes à son horloge, en la remplaçant par sa date de réception.
La même position peut donc être enregistrée et diffusée, mais son écho être
rejeté par le client. Les handlers de la gateway locale émettent cet écho sans
retour d'acquittement positif explicite utilisable par le client.

Après 2,5 secondes sans confirmation reconnue, le client signale un échec et
ses hooks autorisent un repli HTTP pour la même position. Les protections de
fréquence et de requête en vol limitent le trafic : ce n'est pas une boucle
illimitée ni une perte systématique de position.

**Reproduction :** vraie normalisation du backend et vrai module mobile de
confirmation, socket simulé. Horloge client en avance de 10 secondes : le backend
ramène la date à sa réception ; l'écho aux mêmes coordonnées laisse l'envoi en
attente ; à 2 500 ms, rejet de la promesse et aucune livraison confirmée enregistrée
dans le registre partagé. Le repli HTTP est vérifié dans les appelants, sans
envoi HTTP réel ni écriture en base pendant cette reproduction.

**Proposition :** acquittement serveur positif corrélé à l'échantillon original
après acceptation, sans confondre un ancien instantané avec un nouvel envoi.
Distinguer position acceptée, ignorée car obsolète et réellement refusée. Prévoir
la compatibilité des anciens clients/gateways et conserver les contrôles serveur
de fraîcheur, de coordonnées et de participation. Ne pas simplement supprimer
la comparaison de date, ni augmenter arbitrairement le timeout. Tester aussi
écho tardif, doublon, reconnexion et double transport.

## R03 — La connectivité ne suspend pas tous les pollings d'affichage

**Sources :** `hooks/home/useHomeTripFeed.ts:54` et `:60` ;
`app/driver-earnings.tsx:38`, `:51` et `:64` ;
`hooks/request-detail/useRequestDetailData.ts:52` ;
`services/nativeQueryListeners.ts:13` ; `store/api/baseApi.ts:26`.
Vérification de la bibliothèque installée :
`node_modules/@reduxjs/toolkit/src/query/core/buildMiddleware/polling.ts:109`.

Ces lectures conditionnent leur polling à l'activité de l'écran, pas à l'état
`zwangaApi.config.online`. Le bridge natif transmet correctement `onOffline` ;
dans la version installée, le planificateur de polling RTK contrôle le focus,
mais pas cet état de connectivité. `baseQueryWithReauth` n'interrompt pas non plus
une lecture ordinaire sur ce seul signal.

Ainsi, écran visible et mode avion peuvent encore provoquer des tentatives
périodiques, des changements d'état et du traitement d'erreurs. Il ne s'agit pas
de données effectivement transférées lorsque le téléphone est hors ligne, ni
d'un polling permanent après passage de l'application en arrière-plan. Plusieurs
de ces lectures désactivent aussi `refetchOnReconnect` : le retour réseau seul
ne garantit pas leur actualisation immédiate avant le prochain polling.

**Reproduction :** vrai store et middleware RTK Query, transport simulé sans
réseau. Avec `skipPollingIfUnfocused: true`, focus conservé et `onOffline`, trois
appels de `baseQuery` ont encore lieu dans la fenêtre observée. L'intervalle a
été accéléré à 20 ms et l'observation à 110 ms pour le test ; ce ne sont pas les
cadences de production et le nombre dépend de l'ordonnancement JavaScript.

**Proposition :** une politique de lecture d'affichage qui utilise activité et
connectivité, conserve le cache et planifie une reprise unique au retour réseau,
sans rafale sur tous les écrans. Les mutations financières, la file d'actions
durables, les contrôles d'autorité serveur et le GPS natif doivent rester gérés
séparément. Ne pas appliquer un blocage global susceptible de perdre des actions
ou d'empêcher une récupération lorsque le signal réseau est incertain.

## R04 — Polling arrêté ne signifie pas abonnement suspendu

**Sources :** `hooks/manage-trip/useManageTripState.ts:51` et `:89` ;
`hooks/request-detail/useRequestDetailData.ts:52` et `:60` ;
`app/my-requests.tsx:22` ; `hooks/publish/usePublishVehicleState.ts:24` ;
`services/nativeQueryListeners.ts:32` ; `components/ProtectedAppStack.tsx:20`.

Les détails gestion/demande et « Mes demandes » mettent bien leur polling à zéro
quand ils sont masqués. Mais ils ne suspendent pas l'abonnement et conservent
`refetchOnFocus: true`. La liste de véhicules de publication a le même type
d'abonnement. Ici, ce focus est le retour de l'application au premier plan, pas
la visibilité de la route dans la pile.

Si ces écrans restent montés sous un autre écran, un retour à l'application ou
une invalidation de leurs tags peut provoquer des lectures qui ne servent pas
l'affichage courant. La déduplication RTK reste effective pour une même clé :
ce constat ne signifie pas une requête par composant ni par rendu.

**Reproduction :** vrai store RTK Query et abonnement avec `pollingInterval: 0`,
`refetchOnFocus: true`. Une lecture initiale ; une deuxième après perte/reprise
du focus applicatif ; une troisième après invalidation du tag. Simulation du
maintien d'abonnement, sans montage natif de la pile de navigation.

**Proposition :** appliquer une politique `skip` liée à l'activité aux lectures
d'affichage concernées, comme dans le parrainage déjà corrigé. Garder la reprise
au retour d'écran et protéger les `refetch` tardifs d'un écran désabonné. Préserver
les formulaires, les données de réservation et les coordinateurs de trajet qui
doivent réellement rester actifs ; ne pas régler cela par un gel global des routes.

## R05 — Invitation : tout le carnet et des images non affichées

**Sources :** `app/invite.tsx:78`, `:96`, `:142`, `:224` et `:231`.
Bibliothèque installée : `node_modules/expo-contacts/src/Contacts.ts:436` ;
`node_modules/expo-contacts/ios/Serialization.swift:271` et `:339`.

L'écran appelle `getContactsAsync` sans `pageSize`, donc demande tous les contacts,
avec `PhoneNumbers` et `Image`. Il conserve les contacts avec numéro en mémoire
et parcourt cette collection à chaque modification de la recherche. Le chargement
initial affiche uniquement un indicateur jusqu'à la fin de cette opération.

La liste utilise déjà `FlatList` : **le rendu des lignes est virtualisé**. Le
problème est le volume récupéré et filtré, pas le montage simultané de toutes les
lignes. Les tableaux de résultats partagent leurs objets ; ce n'est pas une
copie profonde de chaque contact.

Les avatars ne rendent que des initiales, même quand une image existe. Sur iOS,
la bibliothèque inspectée matérialise pourtant les miniatures demandées avec
`UIImage` et une écriture locale de fichier. Ces opérations sont inutiles pour
le rendu actuel. Leur coût réel sur appareil n'a pas été mesuré.

**Reproduction :** vrai composant et harness de hooks existant, permissions et
API Contacts simulées avec 10 000 contacts fictifs. La requête n'a pas de limite
et demande les images ; la liste reçoit les 10 000 contacts ; une recherche sans
correspondance lit les 10 000 noms pour une frappe. Aucun carnet réel accédé,
aucune miniature créée et aucun benchmark natif effectué.

**Proposition :** ne plus demander les images tant qu'elles ne sont pas affichées,
charger par pages et proposer la recherche avec temporisation et résultats
complets. Une recherche limitée à la page déjà chargée serait une régression.
Garder l'invitation WhatsApp/SMS, le partage sans contacts, la gestion des permissions
et un chargement qui ne bloque pas inutilement l'accès au partage du lien.

## Vérifications effectuées et limites

- **1 343 tests JavaScript mobiles réussis, zéro échec, zéro test ignoré**,
  environ 99,5 s sur ce poste. Tous les fichiers `tests/**/*.test.js` retournés
  par `rg --files tests -g '*.test.js'`, avec
  `node --test --test-reporter=tap --test-concurrency=2`.
- Quatre reproductions supplémentaires avec assertions Node : cooldown,
  horloge GPS, polling hors ligne et abonnement masqué. Une cinquième simulation
  avec assertions porte sur le vrai écran d'invitation. Exécutées en mémoire
  via l'entrée standard de Node et les helpers `loadTypeScript.cjs` /
  `hookHarness.cjs` ; **elles ne sont pas ajoutées à la suite de régression**.
  Les futures corrections devront pérenniser ces cas dans les tests.
- TypeScript mobile : `node node_modules/typescript/bin/tsc --noEmit`, réussi.
- `node scripts/check-network-boundaries.js` : réussi, aucun appel HTTP direct
  hors de la frontière RTK Query autorisée. Ce contrôle d'architecture ne prouve
  pas l'absence de travail réseau superflu décrit plus haut.
- `node scripts/check-source-size.cjs` : **1 002 sources contrôlées, aucune
  au-dessus de 400 lignes**. Ce seuil ne mesure pas la vitesse d'exécution.
- `git diff --check` : réussi. Aucun fichier applicatif ou backend modifié
  par cet audit ; seuls les deux documents changent au titre de cette demande.

Les tests utilisent des dépendances natives et transports simulés ; pas de
profilage Hermes, mesure FPS/mémoire/température, build release, iPhone/Android
physique, charge serveur, benchmark SQL, capture réseau réelle ou contrôle du
déploiement. La suite backend complète n'est pas relancée : la vérification
backend de cet audit porte sur le contrat GPS et sa fonction pure de normalisation.

Avant correction/livraison, prévoir des essais release : réseau coupé puis rétabli
avec token expiré, pile de plusieurs écrans puis retour d'application, suivi GPS
avec délais/décalage d'horloge contrôlés, et carnet synthétique volumineux sur iOS
et Android. Relever séparément tentatives HTTP, délais, consommation mémoire et
temps de rendu, sans conclure à une amélioration native sur la seule base des tests JS.
