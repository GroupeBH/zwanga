# Correctifs de performance et de fiabilité — 25 septembre 2026

Suite à [l'audit du 25 septembre](PERFORMANCE_RELIABILITY_AUDIT_2026_09_25.md).
Les six points ci-dessous sont corrigés dans le code local. Aucun déploiement,
paiement réel ou changement de données de production n'a été exécuté.

## 1. Requêtes de recharge après confirmation — P1

**Problème :** la lecture du statut fournissait le tag Wallet qu'elle invalidait
elle-même après succès, entraînant une nouvelle lecture puis une autre invalidation.

**Solution appliquée :** la lecture du statut ne fournit plus ce tag. Elle conserve
l'invalidation du solde et de l'historique après succès. Chaque lecture déclenchée
par le monitoring libère son abonnement RTK à la fin ; fermeture/changement de
contexte libèrent également l'abonnement en cours.

**Fichiers :** `store/api/walletApi.ts`,
`hooks/wallet/useWalletTopUpMonitoring.ts`,
`hooks/arrival-payment/useArrivalPaymentMonitoring.ts`.

**Conservé :** suivi explicite des transactions en attente, récupération d'une
référence existante, actualisation du solde et paiement de la réservation après
recharge. L'annulation concerne seulement une lecture, jamais une transaction.

**Tests :** store Redux Toolkit réel avec réseau simulé : un succès rafraîchit le
solde sans relancer sa propre vérification ; les invalidations Wallet ultérieures
ne relancent pas le statut. Les tests de sortie d'écran/changement de compte et de
vérifications simultanées restent valides.

## 2. Arbitrage conducteur/passager pour le suivi global — P1

**Problème :** les deux tâches pouvaient être sélectionnées simultanément quand
un compte conducteur voyageait comme passager avec un ancien trajet encore actif.

**Solution appliquée :** `selectRideTracking` utilise la participation et la
propriété des trajets communes à l'accueil. Une réservation passager réellement
en cours prime sur un ancien trajet conducteur. À défaut, le trajet possédé en
cours prime sur une simple réservation future à préarmer. La sélection globale
ne conserve qu'un rôle à la fois. Le cas `no_show` encore suivi est conservé.

**Fichiers :** `features/activity/rideTrackingSelection.ts`,
`features/activity/tripParticipation.ts`,
`components/ActiveRideLocationCoordinator.tsx`.

**Conservé :** préarmement des réservations futures lorsque l'utilisateur n'est
pas déjà dans une participation active, GPS en arrière-plan et une seule
réservation responsable pour plusieurs places. La lecture de détail utilise
`currentData`, afin de ne pas reprendre le statut du précédent argument RTK.

**Tests :** conducteur voyageant comme passager, préarmement face à un trajet
conducteur actif, mauvaise identité/propriété, réservations multi-places,
réservation suivante après dépose et composant global avec ses effets réels.

## 3. Cycle natif GPS conducteur — P1

**Problème :** un arrêt tardif de A pouvait couper B après que B avait annoncé
son démarrage, car seule la persistance de session était sérialisée.

**Solution appliquée :** file d'exécution commune pour sauvegarde de session,
démarrage et arrêt natif. Réservation d'une génération avant les permissions :
une réponse ancienne ne peut pas réactiver une demande arrêtée/remplacée. Les
arrêts issus des réponses réseau et de la fin automatique utilisent aussi cette
file. Un arrêt sans session revérifie l'inactivité dans la file. Une nouvelle
destination n'hérite plus des coordonnées du trajet précédent.

**Fichiers :** `services/background/driverGpsProfile.ts`,
`services/driverBackgroundLocationTask.ts`,
`services/background/driverTripCompletion.ts`.

**Conservé :** options natives de précision, indicateur/service de suivi,
permissions, temporisations d'envoi, finalisation automatique, persistance des
points de contrôle et réutilisation d'une tâche existante pour le même trajet.

**Tests :** arrêt A différé suivi d'un démarrage B, réponse tardive de permission
après arrêt, arrêt d'un ancien trajet, conservation des coordonnées du même trajet
et absence d'héritage entre deux trajets. Native I/O simulé, pas de mesure appareil.

## 4. Dépose et arrêt du suivi — P2

**Problème :** certains composants ignoraient les horodatages de dépose lorsque
les booléens correspondants étaient absents d'une réponse.

**Solution appliquée :** prédicat `hasPassengerFinishedRide` partagé avec la
sélection GPS et la vérification de réservation de la tâche passager préarmée.
Une réponse de détail indiquant un trajet terminé/annulé arrête également le
suivi global même si la liste d'activité est en retard.

**Fichiers :** les fichiers de sélection ci-dessus et
`services/passengerBackgroundLocationTask.ts`.

**Conservé :** paiements encore dus après la dépose, autres réservations actives
et activités des autres passagers. Aucune confirmation financière n'est inventée.

**Tests :** `droppedOffAt`/`droppedOffConfirmedAt` seuls, booléens et statut terminé,
fin du transport avec paiement en attente, suppression de l'abonnement de premier
plan et rejet de son callback tardif.

## 5. Amorçage de la localisation — P2

**Problème :** attendre une position GPS initiale retardait l'abonnement au flux
partagé, même si des échantillons étaient déjà disponibles.

**Solution appliquée :** abonnement immédiat, puis amorçage facultatif depuis la
dernière position connue. L'amorçage expire après deux secondes ; une réponse
périmée/trop imprécise ou plus ancienne qu'une position reçue n'est pas livrée.
Le flux partagé existant acquiert les nouvelles positions : aucun appel
`getCurrentPositionAsync` bloquant ni nouveau watcher indépendant n'est ajouté.
Le starter global conserve la responsabilité du dialogue de permission afin de
ne pas en ouvrir deux en parallèle.

**Fichiers :** `services/rideLocationBootstrap.ts`,
`hooks/driver-navigation/useDriverLocationTracking.ts`,
`components/ActiveRideLocationCoordinator.tsx`.

**Conservé :** validation de fraîcheur, de précision, des sauts et des coordonnées
dans le listener conducteur, calcul d'itinéraire initial, flux natif partagé et
fallback premier plan existant. Une lecture native de dernière position ne peut
pas être annulée via cette API ; sa réponse est ignorée après expiration/sortie.

**Tests :** cache qui ne répond pas, cache tardif après une position récente,
cache frais, expiration et démontage. Pas de reproduction physique d'un GPS lent.

## 6. Historique des jetons borné — P2

**Problème :** téléchargement de toutes les écritures, puis rendu intégral dans
un `ScrollView`, proportionnel à l'ancienneté du compte.

**Solution mobile :** page de 25 écritures, navigation précédent/suivant,
`currentData` pour ne pas afficher la mauvaise page, liste `FlatList` virtualisée,
libération immédiate du cache des pages sans abonné. Un rafraîchissement revient
aux opérations récentes. Les curseurs sont conservés, pas les lignes des anciennes
pages. Les modals restent hors de la liste et du fond désactivé.

**Solution backend :** `GET /wallet/ledger/page`, authentifié, avec `HistoryPageDto`
et pagination existante par couple `(createdAt, id)`, incluant les microsecondes.
Filtrage par compte authentifié et type de portefeuille ; maximum 50 écritures
par page. `/wallet/ledger` demeure inchangé pour les anciennes applications.
Le guide Postgres a orienté le choix du curseur plutôt qu'un OFFSET croissant.
L'index existant `(userId, createdAt)` est conservé ; aucun nouvel index ni migration
n'est introduit. Les plans d'exécution sur une base de production restent à mesurer.

**Fichiers mobile :** `store/api/walletApi.ts`,
`hooks/wallet/useWalletController.tsx`, `app/wallet.tsx`,
`features/screen-styles/app/wallet/container.styles.ts`.

**Fichiers backend :** `src/wallet/wallet.controller.ts`,
`src/wallet/wallet.service.ts`, `src/wallet/wallet-ledger-page.ts` et son test.

**Déploiement :** publier le backend avant l'application pour permettre l'accès
à toutes les anciennes opérations. Si l'endpoint n'existe pas encore (404/405),
la nouvelle app affiche les 30 opérations récentes du résumé avec une indication
de limitation, sans télécharger l'ancien historique illimité. Une panne 5xx n'est
pas assimilée à un historique vide. Aucune ancienne opération n'est supprimée.

**Tests :** ordre/curseur, normalisation des montants, taille bornée, isolement du
compte dans la requête, curseur invalide, ancien backend et panne réseau. Tests
SQL sur métadonnées TypeORM, sans connexion à une base réelle.

## Vérifications et limites

- 56 tests mobile ciblés réussis (GPS, cache, portefeuille et overlays).
- 11 tests backend ciblés réussis. Un premier essai des projections SQL avait
  dépassé le délai de préparation de cinq secondes pendant les contrôles parallèles ;
  relance avec `--testTimeout=60000` réussie, sans changement du code testé.
- TypeScript mobile et backend : contrôles sans émission réussis.
- ESLint ciblé : aucune erreur sur les principaux fichiers modifiés.
- Frontières réseau valides ; 944 sources mobiles sous la limite de 400 lignes.
- Vérification des différences : pas d'erreur d'espacement ; modifications
  préexistantes conservées.
- Suite mobile complète : 1 007 tests réussis sur 1 009. Les deux échecs
  préexistants de références restent dans `sourceExtractions.test.js`.
  Les références n'ont pas été réécrites pour les masquer.
- Aucun build release, essai physique, déploiement ni profilage thermique/mémoire.
  Valider sur iOS/Android les trajets longs, veille/réveil, changement de participation,
  déposes multiples et paiements, puis la navigation dans un historique important.
