# Correctifs de performance — 23 septembre 2026

## Périmètre et statut

Correction des cinq problèmes relevés dans l'audit : reprise de navigation,
GPS passager en attente, stockage du suivi conducteur, historiques financiers
et accumulation de messages. Les modifications sont dans les dépôts mobile
`zwanga` et API `zwanga-backend`. Elles ne sont pas déployées par cette intervention.

Les constats et tests ci-dessous concernent le code et des exécutions JavaScript.
Aucune mesure thermique, mémoire native, batterie ou FPS sur appareil physique
n'a été réalisée. Ces correctifs ne prouvent pas la disparition des freezes,
crashs iOS/Android ou du crash natif SoLoader signalé séparément.

## 1. P1 — Reprise conducteur répétée, y compris hors écran

**Problème.** Le contrôle REST/GPS au retour dans la navigation dépendait d'une
fonction recréée avec les objets de trajet. Des mises à jour du cache pouvaient
relancer ce travail, sans nouvelle reprise réelle de l'écran.

**Solution.** `hooks/driver-navigation/useDriverForegroundCompletion.ts` utilise
un callback stable, des paramètres lus dans une référence actualisée et une garde
de requête liée à l'écran et au trajet. Chaque retour asynchrone est vérifié avant
d'appliquer un résultat. Une réponse obsolète ne peut plus présenter la fin de
trajet ni lancer la suite de la récupération après avoir quitté cet écran.
Une position du flux partagé datant de moins de dix secondes, avec une précision
acceptable, évite une acquisition GPS ponctuelle supplémentaire.

`useDriverProgressLifecycle.ts` déclenche la récupération sur l'activation de
l'écran, le changement de trajet ou l'arrivée des informations nécessaires,
et non sur chaque nouvelle référence de l'objet trajet. Le listener AppState
reste unique. Le compte à rebours de prise en charge s'arrête hors écran et à zéro.
`useDriverNavigationSession.ts` transmet explicitement l'état actif de l'écran.

**Conservé.** Réconciliation du trajet et des réservations, traitement d'une fin
confirmée par le serveur, détection automatique d'arrivée, seuils de précision,
contrôle des horodatages et reprise de la détection d'embarquement. Les lectures
RTK partagées ne sont pas annulées pour leurs autres consommateurs. Un rapide
aller-retour ne reste pas bloqué par une ancienne promesse : le verrou est
réinitialisé à la sortie, et l'ancien résultat ne déverrouille pas le nouveau.

**Vérifié.** Tests de mises à jour répétées du trajet, écran caché, retour de veille,
réponse reçue après perte du focus, retour rapide pendant une requête et réemploi
d'un GPS frais. Une acquisition native déjà engagée peut finir : son résultat
est ignoré si la session n'est plus courante, elle n'est pas annoncée comme annulée.

## 2. P1 — GPS précis avant le démarrage du trajet passager

**Problème.** Le préarmement pouvait activer le profil haute précision jusqu'à
deux heures avant le départ, alors que le trajet n'avait pas encore commencé.

**Solution.** Nouveau `services/background/passengerGpsProfile.ts`, intégré dans
`services/passengerBackgroundLocationTask.ts` :

- En attente : `Accuracy.Balanced`, intervalle Android de 30 s, regroupement
  demandé de 10 s ; pas d'envoi des positions d'attente pour valider l'embarquement.
- Trajet actif : retour au profil existant `Accuracy.High`, intervalle Android
  de 8 s et regroupement demandé de 2 s.
- Promotion possible depuis le contrôle d'état en arrière-plan ou depuis
  l'application ouverte. Options mises à jour sur la tâche native existante,
  sans arrêt/redémarrage volontaire du gestionnaire de localisation.
- Changements de profil et arrêts sérialisés ; une ancienne réservation ne
  remplace ni n'arrête la nouvelle. La dernière série de positions acquise en
  attente est ignorée lors de la promotion ; les suivantes alimentent le suivi.

**Conservé.** Permissions, contrôle du démarrage par le serveur, erreurs réseau,
temporisations de reprise, suivi actif, publication locale du GPS, double canal
de transport et protections contre les envois concurrents. Les rappels lorsque
le téléphone reste immobile sont conservés (`distanceInterval: 0`, pas de pause
automatique) pour qu'un iPhone en veille puisse découvrir le démarrage.
Une réservation déjà déposée arrête le préarmement.

**Limites.** Il s'agit d'un profil moins exigeant, pas d'un arrêt du GPS en attente.
Les intervalles demandés ne sont pas une garantie de fréquence iOS : le système
et les autorisations restent décisionnaires. Tests avec modules natifs simulés
sur les branches iOS/Android ; réveil réel, précision, batterie et longue veille
à contrôler sur appareils.

## 3. P2 — Écritures AsyncStorage identiques à répétition

**Problème.** L'évaluation de fin de trajet relisait puis réécrivait la session
conducteur même lorsque ni la position ni l'état de proximité n'avaient changé.

**Solution.** `services/driverBackgroundLocationSession.ts` conserve une seule
session en mémoire après sa première lecture. Les opérations sont sérialisées.
Une valeur normalisée identique n'est pas réécrite. Lecture, changement de trajet,
mise à jour et suppression utilisent la même file d'opérations.

**Conservé.** Toute nouvelle position ou évolution de la temporisation d'arrivée
reste persistée immédiatement ; aucune fenêtre de perte de checkpoints n'est
introduite par un délai d'écriture. Une mise à jour tardive après suppression ne
recrée pas le trajet. Arrêter un ancien trajet ne supprime pas le nouveau.

**Mesure JavaScript.** Le test simulant 1 800 positions identiques (équivalent
logique d'une heure à un échantillon toutes les deux secondes, pas un essai natif
d'une heure) effectue **une lecture et zéro écriture** de checkpoint identique.
Les modifications de position et d'état d'arrivée produisent toujours des écritures.

## 4. P2 — Historiques financiers chargés et rendus intégralement

**Problème.** Les écrans paiements et revenus chargeaient des collections
complètes et montaient toutes leurs lignes dans des ScrollView.

**API ajoutées, anciennes routes conservées :**

| Route relative à l'API | Usage |
| --- | --- |
| `GET /payments/history/page` | Paiements paginés avec filtre de statut |
| `GET /payments/history/summary` | Nombre global et montants validés par devise |
| `GET /driver-settlements/earnings/page` | Gains paginés |
| `GET /driver-settlements/payouts/page` | Versements paginés |

**Backend.** `src/common/pagination/history-page.ts` borne la lecture à 50 lignes
maximum, 25 par défaut. Curseur composite date/UUID, précision PostgreSQL en
microsecondes préservée, ordre déterministe et compte issu de l'utilisateur
authentifié. Le comptage est cloné avant le filtre de curseur pour ne pas devenir
le nombre de lignes restantes. `src/payments/payment-history-page.ts` conserve
les regroupements de statuts et calcule les totaux par devise sans rapatrier tous
les objets. Intégration dans les controllers/services payments et driver-settlements.
Les formateurs existants de paiements et versements restent appliqués.

**Mobile.** `app/payment-history.tsx` et `app/driver-earnings.tsx` emploient FlatList,
des pages de 25 paiements/gains et de six versements, avec précédent/suivant et
réessai explicite. Les états de chargement ne font pas passer une nouvelle page
pour un historique vide. Les totaux et soldes ne sont pas calculés sur la seule
page affichée. `hooks/useHistoryCursor.ts` ne retient que les curseurs ; les
anciennes lignes ne sont pas accumulées dans l'état du composant. Les entrées
RTK des pages non utilisées sont conservées 15 secondes.

`store/api/paymentApi.ts`, `driverSettlementsApi.ts` et le nouveau
`financeHistoryPage.ts` gardent tout le HTTP dans RTK Query. L'actualisation
périodique des revenus/versements ne concerne que la première page et l'écran
actif. Résumé, détails, PDF, filtres, lien direct vers un paiement, choix du numéro
Mobile Money, idempotence et suivi des retraits restent disponibles.
`components/ui/HistoryPagination.tsx` partage les commandes de pagination.

**Déploiement progressif.** Si la nouvelle route répond 404/405 à la première page,
le mobile peut lire l'ancienne route et paginer localement. Une panne 5xx, une
erreur d'autorisation ou une erreur sur un curseur serveur ne déclenche pas un
téléchargement intégral de secours. Avec un ancien serveur, l'économie réseau
et mémoire de décodage reste donc incomplète : déployer le backend en premier.

**Index préparés.** Migration backend `1780000040000-AddFinancialHistoryIndexes.ts`,
enregistrée dans `src/database/migrations/index.ts`, pour les index compte/date/id
des paiements et versements et compte/COALESCE(availableAt, createdAt)/id des gains.
Le guide `supabase-postgres-best-practices` a orienté les curseurs et index composites.
Cette intervention n'utilise pas un service Supabase et ne crée aucune connexion.

**Précautions DB.** Migration préparée mais **non exécutée**. Elle utilise CREATE
INDEX standard, compatible avec le runner transactionnel existant, qui peut bloquer
les écritures pendant sa création. Prévoir une fenêtre adaptée ou faire préparer
ces mêmes index concurremment par l'exploitant avant cette migration. Ne pas lancer
aveuglément sur de grosses tables en production. Pas de mesure EXPLAIN, de temps
SQL ou de charge sur la base réelle ; les totaux restent des agrégations côté DB.

## 5. P2 — Accumulation du chat et reconnexion coûteuse

**Problème.** Une conversation conservait toutes les pages chargées ; la reprise
réseau pouvait les recharger toutes. La page de tête grossissait avec les sockets.

**Solution.** `store/api/messages/pages.ts` fixe six pages maximum et
`refetchCachedPages: false`. Le backend `src/chat/message-page.ts` et son DTO
ajoutent le curseur `after` et les réponses `previousCursor`/`newestCursor` pour
retrouver les pages récentes après éviction. Contrôle d'appartenance à la
conversation inchangé ; avant/après simultanés refusés ; curseurs opaques.

`store/api/messages/updateMessageCache.ts` met à jour les messages déjà chargés
sans retrier tout l'historique. La tête n'accumule pas plus de 100 messages : elle
se recharge automatiquement, avec un curseur de récupération si cette lecture
échoue. Un message récent n'est pas inséré artificiellement au milieu d'une
ancienne fenêtre. `app/chat/[id].tsx` et `ChatMessageList.tsx` donnent accès aux
messages plus récents, en plus des anciens ; les lectures sont protégées contre
les doubles clics et les écrans inactifs.

**Compatibilité.** Une API ancienne sans pagination, ou avec pagination uniquement
vers les anciens messages, utilise encore la lecture complète de secours. Cela
évite d'évincer des messages qu'elle ne saurait ensuite retrouver. La borne mémoire
complète nécessite le backend mis à jour. Les erreurs réseau ne sont pas transformées
en conversations vides. Aucun message n'est supprimé en base par ces évictions.

**Vérifié avec un vrai store RTK, transport simulé.** Parcours de 800 messages dans
les deux sens : au maximum six pages de 50 lignes pour ces lectures. Reconnexion
après six pages : une seule requête. Réception continue jusqu'à 350 messages :
tête bornée et ensemble de l'historique toujours accessible. Une conversation
initialement vide reste également bornée : en cas d'échec de rechargement, un
réessai explicite reste accessible sans avalanche de nouvelles requêtes socket.
Édition, suppression,
échos, erreur de reconnexion et retour vers les messages récents couverts.

## 6. Extraction du formulaire de partage de jetons

`features/wallet/WalletTransferModal.tsx` extrait le formulaire auparavant intégré
dans `app/wallet.tsx`, qui dépassait 400 lignes. Le contrôleur, les champs contrôlés,
le conteneur WalletSheetModal adapté au clavier et les handlers sont inchangés.
Pas de nouveau state, polling ou modal natif. Tests adaptés pour rendre le composant
extrait, en conservant les assertions sur le clavier et le déblocage de l'écran.

## Vérifications et limites restantes

- Suite mobile complète : 776 tests réussis sur 778 ; deux échecs préexistants dans
  `tests/sourceExtractions.test.js` (références de styles des réservations et de
  `userApi`). Reproduits avec les sources lues directement depuis HEAD, sans
  restaurer ni modifier le worktree. Les références n'ont pas été régénérées pour
  masquer ces différences hors périmètre.
- Backend : 54 tests réussis dans six suites, incluant pagination financière/chat,
  projection SQL à partir des vraies métadonnées TypeORM, paiements, gains et reprise
  de versements. Transport et dépôts simulés ; aucune transaction réelle.
- TypeScript mobile et backend de production sans émission : validés. Le contrôle
  backend incluant toutes les anciennes specs signale toujours des erreurs de
  fixtures hors périmètre (activity, OTP, confidentialité des demandes, users, loyalty).
- ESLint ciblé, frontières réseau et `git diff --check` contrôlés.
- 896 sources applicatives contrôlées : aucun fichier au-dessus de 400 lignes.
- Ni build natif, ni migration exécutée, ni paiement réel, ni déploiement.

Tests ajoutés : `foregroundRecovery`, `driverBackgroundSession`, `passengerGpsProfile`,
`financeHistory`, `messageCacheBounds` côté mobile ; `history-page` et
`history-projections` côté backend. Tests existants de pagination chat, retrait
et clavier wallet complétés/adaptés, sans supprimer d'assertions métier.

### Avant diffusion

1. Déployer les routes backend et préparer les index en tenant compte des verrous.
2. Tester navigation conducteur/passager sur iPhone et Android physiques, long trajet,
   préarmement immobile, veille, retour rapide, changement d'écran, interruption et
   fin automatique/manuelle ; vérifier le suivi et le paiement après la dépose.
3. Tester connexions intermittentes, conversation longue, navigation dans les deux
   sens, nouveaux messages, anciens reçus/PDF et historique de versements.
4. Comparer CPU, mémoire native, température et consommation avec la version précédente,
   puis suivre les rapports de crash après diffusion progressive. Ne pas assimiler
   les compteurs de tests JavaScript à une amélioration thermique mesurée.

Références techniques consultées : [pagination infinie RTK Query](https://redux-toolkit.js.org/rtk-query/usage/infinite-queries)
et [options de localisation Expo](https://docs.expo.dev/versions/latest/sdk/location/).
Les comportements ont aussi été vérifiés dans les dépendances installées et les tests.
