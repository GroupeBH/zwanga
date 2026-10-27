# Audit de fiabilité de la livraison des sonneries

> Suite du 26 octobre 2026 : les correctifs et leurs validations locales sont
> d?taill?s dans [le rapport d?int?gration](FIABILISATION_SONNERIE_INTEGRATION_2026-10-26.md).
> Les constats ci-dessous d?crivent l??tat avant ces corrections.

Date : 26 octobre 2026. Périmètre : derniers correctifs de diffusion des demandes,
notifications, récepteur Android v6, reprise au premier plan et marimba continu,
dans `zwanga` et le dépôt voisin `zwanga-backend`.

## Verdict

La chaîne n'est pas encore validée pour une livraison sans raté. Les tests
existants ciblés réussissent, mais l'audit révèle des défauts de débit et de
secours dans des scénarios qu'ils ne couvraient pas. Les correctifs ci-dessous
sont des recommandations, **pas des changements fonctionnels appliqués par cet
audit**. Aucun déploiement, envoi FCM/APNs ou accès à une base réelle effectué.

Les seules modifications de cet audit sont ce rapport, sa référence dans le
journal et le script de reproduction `scripts/audits/audit-ride-delivery.cjs`.
Les changements applicatifs précédents sont conservés.

## Constats prioritaires

### F1 — P1 : la diffusion rapide s'arrête après cinq destinataires

**Preuve :** `zwanga-backend/src/notifications/notifications.service.ts:754`
interrompt la boucle dès que `processed < 10`. Pourtant la sélection urgente à
la ligne 791 prend au maximum `5 - urgentWorkers` notifications. La condition
est donc toujours vraie après un lot non vide.

**Reproduction :** exécution de la méthode réelle extraite par AST TypeScript,
avec fournisseur immédiat et lots de cinq. Résultat : un seul lot, cinq
destinataires, au lieu de continuer à vider la file dans le budget prévu.

**Impact :** les cinquante conducteurs sélectionnés par un lot de dispatch ne
reçoivent pas tous l'envoi immédiatement. Les suivants dépendent des nouveaux
passages cron et appels de dispatch. Plusieurs demandes simultanées et des
temps réseau élevés peuvent consommer la fenêtre de réponse avant l'envoi.
Le délai exact dépend du nombre d'instances et de déclenchements ; aucune
latence de production n'a été mesurée ici.

**Correctif recommandé :** faire correspondre la condition de poursuite à la
taille effectivement réclamée ; vider plusieurs lots dans un budget borné en
conservant cinq envois simultanés et les verrous existants. Ajouter un test de
débit pour 50 puis plusieurs centaines de destinataires.

### F2 — P1 : un fournisseur lent peut occuper tous les workers au-delà de la fenêtre sonore

**Preuve :** `notifications.service.ts:434,760,818,834` attend directement
`getMessaging(...).send(...)`. Le heartbeat renouvelle le claim tant que cet
appel n'est pas terminé. La constante applicative de 10 secondes sert au
timeout Expo et au diagnostic, pas à interrompre l'envoi Firebase.

Le SDK installé `firebase-admin` 14.2.0 configure un timeout de 15 secondes par
tentative et jusqu'à quatre reprises sur certaines erreurs réseau/503 :
`node_modules/firebase-admin/lib/messaging/messaging-api-request-internal.js:25`
et `lib/utils/api-request.js:111`. Plusieurs tentatives peuvent donc dépasser
la fenêtre sonore de 60 secondes.

**Reproduction :** les méthodes de file réelles sont exécutées avec cinq envois
simulés non résolus. À une horloge simulée de +61 secondes, les cinq places
restent occupées et le nouveau lot est refusé. Les promesses sont ensuite
résolues pour terminer proprement l'essai. Ce n'est pas une mesure de panne FCM.

**Impact :** pendant un ralentissement fournisseur, les autres conducteurs
visés attendent derrière des alertes dont l'utilité peut déjà avoir expiré.
Le claim de 20 secondes protège les crashes de worker, mais pas ce cas où le
worker vit encore et renouvelle son bail.

**Correctif recommandé :** définir un budget d'envoi/reprise compatible avec
l'échéance métier, mesurer l'attente en file et isoler les envois dégradés. Le
transport doit permettre un arrêt maîtrisé des reprises. Un simple
`Promise.race` abandonnant un envoi toujours actif créerait un risque de doublon
et ne constitue pas une correction suffisante.

### F3 — P1 : la publication native Android n'a pas de secours après un échec

**Preuve par lecture :** `native/android/notifications/RideFirebaseMessagingService.java:44,50,57,59`.
Le chemin v6 d'arrière-plan ne délègue pas à Expo. Une erreur Notifee, l'absence
de carte effectivement publiée ou l'attente dépassant quatre secondes produit
un journal local. Il n'y a ni reprise durable, ni publication de secours dans
ce chemin. Le dépassement de quatre secondes n'annule pas le callback : celui-ci
peut encore réussir, mais rien ne garantit qu'il terminera si le processus cesse.

**Impact :** FCM peut avoir accepté le push, puis le téléphone peut ne publier
aucune carte et ne jouer aucun son. Le serveur considère alors l'envoi comme
`SENT` (`notifications.service.ts:391`). Il ne relance pas un `SENT` en fonction
de l'absence de reçu d'affichage. Le socket aide seulement lorsqu'il est connecté.

**Correctif recommandé :** secours natif borné avec le même identifiant,
enregistrement durable de l'échec et reprise limitée à la validité de l'alerte.
Pour un traitement qui doit survivre à la courte fenêtre FCM, examiner un
travail Android approprié. Conserver les barrières de compte, la déduplication,
les autorisations et le silence/DND ; ne pas rejouer une demande déjà traitée.

La recommandation de terminer rapidement la présentation, ou de prolonger
explicitement son cycle de vie, est cohérente avec la
[documentation Firebase](https://firebase.google.com/docs/cloud-messaging/android-message-priority).
Une panne native de publication n'a pas été injectée sur appareil dans cet audit.

### F4 — P2 : une réservation encore valable peut disparaître si le push arrive après 60 secondes

**Preuve :** `RideNotificationBundle.java:37-42` exige `ringUntil > now` pour
valider toute la carte, et `RideFirebaseMessagingService.java:26` abandonne le
message sinon. La durée de transport des réservations est pourtant de cinq
minutes (`zwanga-backend/src/notifications/android-driver-backup.ts:39-41`).
Une réservation `pending` peut toujours être pertinente côté serveur après
l'expiration du son (`notifications.service.ts`, branche `new_booking` de
`isCriticalNotificationStillDeliverable`).

**Reproduction :** le payload serveur réel conserve un TTL de 300 000 ms avec
une fenêtre sonore déjà dépassée. La politique Java réelle, exécutée sur JVM,
accepte la même réservation à 59 secondes et la rejette à 61 secondes.

**Impact :** après une courte coupure réseau, aucune carte de cette réservation
n'est affichée par v6. L'ancien chemin v4 prévoyait une carte silencieuse après
la fenêtre sonore. La disparition est donc distincte de l'arrêt normal du son.

**Correctif recommandé :** séparer validité métier, possibilité d'afficher et
possibilité de sonner. Conserver une carte silencieuse pour une réservation
encore traitable, tout en rejetant une offre exclusive expirée et sans relancer
une ancienne sonnerie.

### F5 — P2 : la fin du son Android varie selon l'état de l'application

**Preuve par lecture :** `RideNotificationBundle.java:67-73` joue le fichier de
60 secondes sans répétition. Seul le dispatch porte un `timeoutAfter`, calculé
sur `expiresAt`, et non sur le plus petit délai entre cette date et `ringUntil`.
Une réservation ou demande proche reçue à +50 secondes peut ainsi commencer un
fichier complet de 60 secondes. Le passage au premier plan à +61 secondes peut
ensuite être silencieux puisque la restauration considère `ringUntil` dépassé
(`hooks/notifications/useRideRinging.ts`, `restoreDriver`).

**Impact :** incohérence possible entre téléphone verrouillé qui sonne encore
et ouverture qui ne reprend plus le son. La durée réelle de lecture système
reste à mesurer sur appareils ; ce scénario n'est pas une reproduction native
de la coupure signalée précédemment.

**Correctif recommandé :** définir une politique commune pour la durée
restante et son transfert, tout en conservant la carte utile après arrêt sonore.
Ne pas prolonger la validité d'une offre en renouvelant son délai à l'ouverture.

### F6 — P2 : les reçus ne permettent pas encore de détecter rapidement une livraison manquée

**Preuve par lecture :** les reçus natifs sont conservés localement puis envoyés
à l'entrée dans l'application (`services/rideNotificationReceipt.ts:45` et
`hooks/auth/usePushRegistration.ts`). La table `ride_notification_receipts` est
alimentée, mais aucune sélection de reprise push ne la consulte. Les horaires
serveur des reçus correspondent à leur synchronisation, pas nécessairement à
l'instant d'affichage sur le téléphone.

**Impact :** impossible de déduire du statut `SENT` que le conducteur a vu ou
entendu l'alerte, et impossible d'utiliser le délai de synchronisation comme
mesure fiable de la latence d'affichage. L'absence de reçu peut aussi vouloir
dire que le conducteur n'a pas ouvert l'app, pas que la livraison a échoué.

**Correctif recommandé :** conserver les étapes sélectionné/envoi accepté/reçu/
affiché/action avec leur origine et leurs horodatages, publier des mesures
agrégées de délai et d'échec, puis décider de reprises bornées et dédupliquées.
Un reçu d'affichage ne prouvera jamais à lui seul une émission acoustique.

## Ce qui est confirmé par les vérifications locales

- 157 tests mobiles ciblés réussis, aucun ignoré : session, auteur exclu,
  enregistrement/rotation du token, anciens ponts, restauration, actions,
  transfert de son, permissions, transport socket, WAV et parité des sources.
  Cette exécution comprend le test JVM de politique native ; la majorité reste
  constituée de tests JavaScript avec entrées/sorties natives simulées.
- 64 tests backend unitaires ciblés réussis, dans cinq suites : claims,
  payload v6, suppression de l'ancienne suspension pour demandes ignorées,
  notifications avec actions et invariance des échéances. Aucun serveur ou
  cluster PostgreSQL lancé pour cet audit ; les essais PostgreSQL du correctif
  précédent ne sont pas présentés comme rejoués ici.
- Script d'audit exécuté avec succès : il **confirme les défauts** F1/F2/F4 ; son
  code de sortie zéro signifie que les sondes ont terminé, pas que la livraison
  a été validée. Méthodes et politique natives réelles, fournisseur/DB simulés.
- ESLint du nouveau script : aucune erreur.
- Source canonique et ressource sonore Android déjà couvertes par les tests de
  parité ; aucun changement natif pendant cet audit, aucune nouvelle compilation
  native, aucun essai sur téléphone physique ou émission réelle FCM/APNs.

Commandes reproductibles :

```text
node scripts/audits/audit-ride-delivery.cjs
node --test tests/rideDeliveryFixes.test.js tests/pushRegistration.test.js tests/rideAlertSession.test.js tests/rideSoundRecovery.test.js tests/rideAudioReliability.test.js tests/rideAlertRestoration.test.js tests/rideAlertEntryRestore.test.js tests/driverNotificationNativeAssets.test.js tests/nativeSourceParity.test.js tests/nativeRidePayload.test.js tests/rideRealtime.test.js tests/ownRequestBackgroundNotification.test.js tests/driverNotifications.test.js tests/driverNotificationActions.test.js
```

Le script nécessite le dépôt voisin pour les méthodes serveur et un JDK pour
la sonde Java ; il annonce explicitement l'absence de JDK. Les journaux locaux
de cette exécution se trouvent sous `.expo/ride-alert-audit-20261026/`.

## Cohérence, ciblage et limites de validation

- Le rayon serveur reste de 5 km **pour les conducteurs éligibles**, avec
  exclusion de l'auteur, compte actif, KYC, véhicule et disponibilité. Il s'agit
  de la dernière position enregistrée, pas d'une mesure GPS instantanée.
- Les anciennes pénalités pour demandes ignorées restent supprimées. Un refus
  sur une demande précise reste conservé, ainsi que la première acceptation
  gagnante et l'invalidation des offres concurrentes.
- Les nouvelles capacités exigent un nouveau binaire Android et le serveur
  compatible. Un téléphone utilisant encore un ancien binaire ne profite pas
  du nouveau récepteur v6. Aucune configuration de production n'a été lue.
- Le marimba continu est présent dans les ressources testées, mais son énergie
  moyenne plus faible ne prouve pas son audibilité dans un environnement bruyant.
  Le fichier iOS reste sous la limite de 30 secondes indiquée par
  [Apple](https://developer.apple.com/documentation/usernotifications/unnotificationsound).
- FCM essaie de délivrer rapidement les messages prioritaires, sans garantir
  que chaque téléphone sera immédiatement réveillé. Android/OEM, réseau,
  permissions, économie d'énergie et silence restent déterminants.
  [Référence Firebase](https://firebase.google.com/docs/cloud-messaging/android-message-priority).

Avant validation de production : corriger F1–F4 puis exercer les autres points,
tester une vraie livraison sur plusieurs Android et un iPhone, application
ouverte/fermée/verrouillée, déverrouillage pendant le son, refus/acceptation,
réseau coupé puis rétabli, plusieurs demandes concurrentes et permissions refusées.
Vérifier carte visible avant son, origine Zwanga identifiable, route correcte,
arrêt après décision et absence de double traitement. Une garantie absolue de
sonnerie sur tous les appareils n'est pas techniquement démontrable ici.
