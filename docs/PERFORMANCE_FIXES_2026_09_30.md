# Corrections de performance — 30 septembre 2026

## Périmètre et constats

Implémentation des quatre recommandations du dernier audit : démarrage du GPS
passager, répétition de « Ma position », lectures Places obsolètes et accumulation
des pages de notifications/conversations. Les constats de l'audit et les mesures
ci-dessous proviennent de tests JavaScript avec entrées/sorties simulées, pas de
mesures CPU, mémoire native, chauffe ou batterie sur téléphone.

## Solutions appliquées

### Localisation

- `hooks/passenger-navigation/usePassengerLocationSharing.ts` s'abonne au flux GPS
  partagé immédiatement après autorisation. Le démarrage et la reprise ne lancent
  plus une acquisition ponctuelle susceptible de bloquer l'abonnement. Le helper
  existant `services/rideLocationBootstrap.ts` propose en parallèle un cache récent,
  avec attente de deux secondes maximum, sans remplacer une position live plus récente.
- Une permission activée dans les réglages est relue au retour au premier plan,
  sans réafficher automatiquement la demande système. Les vérifications concurrentes
  sont regroupées ; un refus n'ouvre aucun abonnement.
- `services/currentLocationRequest.ts` accepte des options de cache facultatives.
  `hooks/location-picker/useLocationPicker.ts` réutilise ce service partagé avec
  ses critères antérieurs : cache de 60 secondes, précision de 100 mètres,
  acquisition Balanced. Pas de secours vers un cache ancien dans le picker.
- L'acquisition fraîche attend au maximum dix secondes ; le délai global de
  quinze secondes du picker protège aussi l'attente des permissions. Fermeture,
  déplacement/clic sur la carte et nouveau choix libèrent l'attente de l'interface.
  Une réponse tardive ne remplace jamais le choix manuel.

L'appel ponctuel Expo ne possède pas de poignée d'annulation : une acquisition
native encore pendante reste partagée, même après expiration de l'attente UI.
Cela évite de la multiplier mais ne prétend pas arrêter cet appel dans l'OS.
Les autres consommateurs gardent leurs délais, précision et secours existants.
Les critères d'embarquement, fréquences d'envoi, métadonnées, secours REST,
événements métier et suivi natif en arrière-plan ne sont pas supprimés.

### Recherche de lieux

`utils/places/sharedPlaceRead.ts` partage les lectures Places par requête effective
et compte leurs consommateurs. `utils/googleMapsPlaces.ts` accepte un `AbortSignal`
optionnel pour autocomplete/recherche/détails. Le dernier consommateur qui annule
interrompt la requête RTK ; annuler un écran ne coupe pas un autre consommateur.
Une nouvelle requête identique attend que l'annulation précédente soit terminée
avant de repartir. Le passage recherche → sélection conserve une requête partagée
encore utile. Le picker annule sur remplacement, fermeture et démontage.

Transport authentifié RTK, classement des suggestions, limites géographiques,
favoris, lieux rapides, snapping sur itinéraire, géocodage et choix hors ligne
restent conservés. L'annulation client ne garantit pas l'arrêt d'un traitement
déjà commencé côté serveur ou fournisseur.

### Historiques bornés, toujours parcourables

- `store/api/boundedListPages.ts`, `notificationApi.ts` et `messageApi.ts` bornent
  chaque liste à six pages : 240 notifications ou 300 conversations selon les
  tailles de pages demandées. Des pages antérieures sont rechargeables dans les
  deux directions. Aucun élément n'est supprimé du serveur par cette éviction.
- Les invalidations et reconnexions relisent uniquement la première page encore
  en cache, pas toutes les pages visitées. Les autres pages restent rechargeables
  via les contrôles « plus récentes » / « plus anciennes ».
- `store/api/notifications/confirmedChange.ts` et la suppression de conversation
  répercutent les actions seulement après confirmation serveur. Les totaux de
  notifications restent ceux du serveur, réconciliés par la relecture bornée.
  Un refus ne valide pas localement une suppression ou une lecture.
- `app/notifications.tsx`, `app/(tabs)/messages.tsx` et
  `components/ui/HistoryPaginationFooter.tsx` rendent les deux directions explicites,
  bloquent les lectures lorsque l'écran est inactif/occupé et proposent de réessayer.
  Après une erreur, une relecture de la page courante précède la reprise de pagination,
  afin de réconcilier les offsets après suppression. Après éviction, le chargement
  des pages anciennes est explicite pour éviter une cascade `onEndReached`.
- La suppression groupée distingue toujours les notifications affichées de
  l'historique complet, même au bout ancien de la liste. Recherche de conversation
  limitée aux éléments affichés, comme annoncé dans son champ.
- `store/slices/messagesSlice.ts` garde la fenêtre de résumés et seulement les
  compteurs positifs déjà connus hors fenêtre. Éviction/retour ne remettent donc
  pas les non-lus à zéro et ne les doublent pas. Lecture, suppression confirmée,
  liste serveur complète et déconnexion nettoient les compteurs concernés.
  Les corps des messages historiques ne sont pas réintroduits dans cette copie.

Limites conservées : pagination par offset/page sensible aux réordonnancements
concurrents du serveur ; la déduplication par identifiant et la relecture limitent
les incohérences mais ne remplacent pas des curseurs stables. Le backend actuel
ne fournit pas de compteur global de messages non lus : le badge reflète les
conversations déjà connues, pas celles jamais chargées. Les petits compteurs
hors fenêtre ne sont pas plafonnés arbitrairement ; une suppression/lecture sur
un autre appareil peut nécessiter une nouvelle lecture pour être réconciliée.
Un agrégat serveur et une recherche serveur globale restent des pistes différées.

## Vérifications et limites

- `tests/performanceGpsPlaces.test.js` : GPS bloqué, répétitions, réponse tardive,
  permissions, reprise, annulation et partage Places, dont un test avec le vrai
  Redux Toolkit et un transport simulé observant les signaux d'annulation.
- `tests/boundedInboxPages.test.js` : vingt pages parcourues avec six pages au
  maximum en cache, retour aux premières pages, mutations réussies/refusées,
  coupure pendant revalidation, anciennes pages devenues vides et non-lus.
- `tests/boundedInboxScreens.test.js` : navigation bidirectionnelle, absence de
  cascade automatique, état inactif/occupé, reprise après erreur et portée du retrait groupé.
- `tests/locationPicker.test.js` vérifie aussi l'annulation de la recherche
  remplacée et du détail devenu inutile. `package.json` inclut les nouveaux tests
  dans `test:performance`.

Mesures reproduites dans ces tests : une acquisition native simulée pour trois
tentatives GPS expirées ; une mutation + une lecture de liste après vingt pages
visitées, contre une mutation + vingt lectures dans l'audit. Ces chiffres concernent
le cache testé ; les autres abonnements/API peuvent avoir leurs propres lectures.

`npm.cmd run test:performance` : **47 tests réussis**, dont 28 nouveaux tests dédiés.
Le dernier cas ajouté couvre deux saisies différentes générant la même requête
Places effective : annuler l'une n'interrompt pas l'autre.
Une dernière passe des sept suites GPS/picker/adresses/navigation des notifications/
cycle de vie du chat/cache des messages réussit également ses **79 tests**.

Le passage complet des 158 fichiers, avant l'ajout de ce dernier cas Places,
donne **1 229 réussites sur 1 233**,
avec quatre échecs préexistants, reproduits séparément sur des fichiers inchangés :

- `driverBookingReadAccess.test.js` simule la requête de réservations actives sans
  `refetch`, alors que le hook appelle correctement cette requête pour un trajet actif.
  `tripDetailReadPolicy.test.js`, qui simule les deux variantes, passe.
- `sourceExtractions.test.js` compare d'anciennes empreintes : styles des revenus,
  `bookingApi.confirmCashReceipt` et `userApi.getProfileSummary`. Les fixtures
  d'extraction n'ont pas été remplacées dans cette intervention.

TypeScript sans émission : réussi. ESLint ciblé : aucune erreur ni avertissement
après vérification des dépendances d'effet du suivi passager. Frontière réseau :
valide, sans HTTP direct hors RTK. Taille des sources : 977 fichiers contrôlés,
aucun au-dessus de 400 lignes. `git diff --check` : réussi.

Pas de changement backend, de migration, de dépendance ajoutée ni de déploiement.
À valider sur Android/iOS physiques : premier fix GPS, retour des réglages et de
l'arrière-plan, longues listes, sélection cartographique, réseau lent/coupé,
positions de défilement et consommation. Aucun gain natif ni disparition de crash
ou de chauffe n'est annoncé sans ces essais.
