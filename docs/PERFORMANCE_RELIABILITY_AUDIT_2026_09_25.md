# Audit de performance et de fiabilité — 25 septembre 2026

## Périmètre et méthode

Audit du code mobile actuel, y compris les modifications non commitées déjà
présentes. Revue transversale du démarrage Android, de la navigation, des
coordinateurs globaux, des cartes/GPS, des abonnements et sockets, de RTK Query,
des paiements, du portefeuille, des modals, du chat et des lectures d'écran.
Le contrat de l'historique des jetons a également été vérifié dans le backend
local `zwanga-backend`. Il ne s'agit pas d'un audit exhaustif de ce backend.

Cette intervention ajoute uniquement ce rapport et sa référence dans le journal.
**Aucun correctif applicatif n'est appliqué dans cet audit.** Les corrections
ci-dessous sont des travaux proposés, distincts des protections déjà présentes.
Les changements existants de l'utilisateur sont conservés.

## P1 — Corrections prioritaires

### 1. Vérification de recharge qui invalide sa propre requête

- **Source :** `store/api/walletApi.ts:276`, notamment les lignes 279 et 287.
- **Constat :** `checkWalletTopUpStatus` fournit le tag `Wallet/ME`. À chaque
  réponse réussie, son `onQueryStarted` invalide ce même tag. Tant qu'un abonné
  reste présent, RTK Query relance la vérification qui invalide encore son tag.
  Les hooks lazy du portefeuille et du paiement à l'arrivée peuvent conserver
  cet abonnement après la fin de leur boucle de vérification explicite.
- **Preuve JavaScript :** chargement du module TypeScript réel avec un store
  Redux Toolkit réel et un `baseQuery` simulé. Un seul appel initial produit
  cinq appels réseau simulés : quatre succès, puis une erreur volontaire pour
  arrêter l'expérience. Aucun polling configuré dans cette reproduction.
- **Impact :** vérifications répétées et rafraîchissements des données Wallet et
  PaymentHistory, indépendamment des limites du monitoring de l'interface.
  Risque de trafic, de travail JS et de sollicitations serveur inutiles.
- **À faire :** séparer le tag de suivi d'une transaction du tag du solde ;
  libérer l'abonnement de lecture lorsque le suivi se termine ; ajouter un test
  avec le middleware RTK réel vérifiant l'absence d'auto-invalidation.
- **À conserver :** actualisation du solde après succès, reprise des paiements
  en attente et absence de nouvelle initiation de paiement automatique.

### 2. Deux rôles GPS peuvent être actifs pour le même compte

- **Source :** `components/ActiveRideLocationCoordinator.tsx:78`, 148 et 181.
- **Constat :** le coordinateur sélectionne indépendamment un trajet conducteur
  `ongoing` et une réservation passager active. Il ne réutilise pas l'arbitrage
  de `features/activity/tripParticipation.ts`, qui donne priorité à la
  réservation active sur un ancien trajet conducteur encore déclaré en cours.
- **Preuve JavaScript :** avec un ancien trajet conducteur A en cours et une
  réservation passager B en cours, le composant réel appelle les deux fonctions
  de démarrage GPS simulées, l'une pour A et l'autre pour B.
- **Impact :** deux suivis logiques restent actifs ; la position du passager
  peut encore être envoyée comme celle du conducteur de A. Les coûts natifs
  supplémentaires et l'échauffement ne sont pas mesurés par cette simulation.
- **À faire :** partager l'arbitrage de participation avec l'accueil et la
  bannière ; vérifier l'appartenance du trajet ; distinguer le préarmement
  passager d'une participation effectivement active.
- **À conserver :** GPS en arrière-plan pendant le bon trajet, préarmement utile,
  réservations de plusieurs places et rôle passager d'un compte conducteur.

### 3. Course entre arrêt et démarrage du GPS conducteur

- **Source :** `services/driverBackgroundLocationTask.ts:258`, 280 et 330 ;
  `services/background/driverTaskLifecycle.ts`.
- **Constat :** les écritures de session sont protégées, mais l'ensemble
  « session + démarrage/arrêt de la tâche native » n'est pas sérialisé.
  L'arrêt de A peut effacer sa session puis attendre le système ; B écrit sa
  session, constate que la tâche tourne encore et annonce un démarrage réussi ;
  l'arrêt tardif de A coupe alors la tâche utilisée par B.
- **Preuve JavaScript :** exécution des fonctions publiques réelles avec les
  opérations natives simulées et un arrêt différé. Résultat : démarrage B
  retournant `true`, session B conservée, tâche native simulée arrêtée.
- **Impact :** suivi et progression automatique susceptibles de manquer après
  une transition de trajet, sans que l'état de session indique l'arrêt.
- **À faire :** sérialiser le cycle natif complet et utiliser une génération
  pour invalider les opérations anciennes ; vérifier également les appels
  initiés par l'écran de navigation et les arrêts après réponse serveur tardive.
- **À conserver :** arrêt à la déconnexion et fin du trajet ; ne pas arrêter
  le trajet suivant ni supprimer son état à cause d'une ancienne opération.

## P2 — Autres corrections nécessaires

### 4. La fin du transport n'est pas reconnue uniformément par le GPS

- **Source :** `components/ActiveRideLocationCoordinator.tsx:27` versus
  `features/activity/tripParticipation.ts:4`.
- Le coordinateur ignore `droppedOffAt` et `droppedOffConfirmedAt`, contrairement
  à l'accueil. Une réservation encore `accepted` avec un horodatage de dépose,
  mais sans les booléens correspondants, reste éligible au suivi.
- **Preuve JavaScript :** le composant démarre encore le suivi d'une réservation
  synthétique avec `droppedOffAt` renseigné. Ce constat concerne les réponses
  partielles ou incohérentes ; il ne prouve pas leur fréquence en production.
- **À faire :** employer le prédicat commun de fin du transport dans les
  coordinateurs et tâches concernées, sans confondre paiement dû et présence
  physique à bord. Tester les horodatages seuls et les autres réservations actives.

### 5. L'acquisition GPS initiale bloque l'abonnement au flux partagé

- **Source :** `hooks/driver-navigation/useDriverLocationTracking.ts:132` et 175 ;
  `components/ActiveRideLocationCoordinator.tsx:232` et 242.
- Le code attend `getCurrentPositionAsync` avant de s'abonner aux positions
  partagées. Il n'y a pas de délai limite à cette étape. Le repli conducteur sur
  la dernière position connue n'intervient qu'après un rejet, pas pendant une
  attente prolongée.
- **Impact conditionnel :** tant que cette promesse attend, l'écran ne reçoit
  pas le flux partagé, même si celui-ci dispose déjà de positions. Ce n'est pas
  une preuve de blocage général du thread JS ou de crash natif.
- **À faire :** s'abonner d'abord ; amorcer depuis une dernière position fraîche ;
  borner l'attente initiale et ignorer toute réponse périmée après sortie.
- **À conserver :** contrôle de fraîcheur/précision, rejet des coordonnées
  invalides et envoi des positions métier indépendamment du rendu de la carte.

### 6. Historique des jetons non borné, rendu intégralement

- **Sources :** `store/api/walletApi.ts:244`,
  `hooks/wallet/useWalletController.tsx:97`, `app/wallet.tsx:311` ;
  backend `src/wallet/wallet.service.ts:165`.
- `/wallet/ledger` renvoie toutes les écritures, sans pagination. Le contrôleur
  mobile conserve cette liste entière et l'écran la rend avec `.map()` dans un
  `ScrollView`. La limite de 30 du résumé `/wallet/me` ne limite pas cet endpoint.
- **Impact :** payload, mémoire et nombre de vues augmentent avec l'ancienneté
  du compte. Aucun seuil de ralentissement sur appareil n'a été mesuré ici.
- **À faire :** pagination serveur, pages bornées dans le cache mobile et liste
  virtualisée ; préserver l'accès aux anciennes opérations et le rafraîchissement
  des opérations récentes. Ne pas simplement supprimer les anciennes lignes.

## Vérifications réalisées

- TypeScript : `tsc --noEmit --incremental false` réussit.
- Suite JavaScript complète : **982 tests réussis / 984**, environ 83,5 s pour
  cette exécution. Deux échecs déjà présents dans `tests/sourceExtractions.test.js` :
  comparaison des styles extraits et empreintes des endpoints `userApi`.
  Examiner les divergences avant d'actualiser une référence, sans masquer un
  changement non souhaité. Ces échecs ne prouvent pas un crash natif.
- Contrôle des frontières réseau : réussi.
- Contrôle de taille : **941 sources**, aucune au-delà de 400 lignes.
- Expériences supplémentaires en mémoire : boucle de recharge, double sélection
  GPS, horodatage de dépose seul et chevauchement arrêt/démarrage. Modules réels,
  données synthétiques, réseau et opérations natives simulés ; aucun appel à un
  service de paiement réel, aucune écriture de données utilisateur.

## Protections présentes et limites de l'audit

Les optimisations précédentes existent toujours : analyse de route mutualisée,
limitation des mises à jour visuelles GPS, flux GPS partagé, suspension de
plusieurs lectures d'écrans inactifs, cache de chat borné, délais de vérification
des paiements et arbitrage des overlays. Le gel global Android reste désactivé
volontairement ; ce seul réglage ne démontre pas que les cartes cachées tournent.

Le contrôle des bibliothèques Android est branché aux builds release. Seul un
APK debug est présent localement dans les sorties examinées : aucun AAB release
ni APK split distribué par le Play Store n'a été validé dans cet audit.

Pas d'essai sur iPhone/Android physique, de mesure mémoire/énergie, d'accès aux
logs de production ou de reproduction native longue durée. Les défauts ci-dessus
ne permettent donc ni d'attribuer tous les gels iOS à une cause unique ni de
garantir l'absence de crash Android. Après correction, prévoir des essais release
avec plusieurs passagers, veille/réveil, réseau instable, dépose/paiement, puis
enchaînement de trajets et retour prolongé sur l'accueil.
