# Audit de l'absence de notification et de sonnerie

Date : 26 octobre 2026. Audit du code mobile, des sources natives, du backend
local voisin et de tests ciblés. Aucun correctif fonctionnel ni déploiement
effectué pendant cet audit.

## Signalement et niveau de preuve

L'utilisateur indique qu'au dernier test en production, plusieurs téléphones
avec des comptes conducteurs différents n'ont affiché **aucune notification**.
Cela oriente d'abord vers la sélection et la livraison des alertes, plutôt que
vers le contenu sonore. Les plateformes, numéros des builds réellement
installés, version du backend déployé et journaux de cet incident ne sont pas
disponibles dans cet audit. Aucune cause unique de l'incident n'est certifiée.

Le partage d'un compte entre téléphones n'explique pas ce signalement. Le
backend conserve bien un seul jeton push courant par compte, mais ce mécanisme
concerne un autre scénario.

## Constats classés

### P1 — Reprise d'un envoi interrompu plus tardive que l'expiration de l'invitation

`zwanga-backend/src/notifications/notifications.service.ts`,
`dispatchNotificationLane` : une notification réclamée par un worker est marquée
`pending` avec `TRANSACTIONAL_PUSH_CLAIMED`. Après arrêt du worker, elle n'est
réclamée de nouveau qu'après **120 secondes**. La fenêtre sonore et la réponse
par défaut d'une offre immédiate durent **60 secondes**. Un arrêt entre la prise
en charge et l'appel au transport peut ainsi faire perdre l'invitation entière,
sans notification sur le téléphone. Une erreur normalement remontée suit un
autre chemin de reprise, après 15 secondes.

**Preuve :** sonde exécutant la méthode réelle avec un dépôt simulé : cutoff de
reprise supérieur à 119 secondes, comparé à la durée de 60 secondes. Ce n'est
pas un essai de panne d'un serveur de production.

**À corriger :** lease d'envoi récupérable avant l'expiration métier, avec
propriété de claim et protection des workers encore actifs ; scénario de crash
à tester. Ne pas simplement prolonger une invitation déjà expirée.

### P1 — Les demandes immédiates ne sont pas diffusées à tous les conducteurs proches

`zwanga-backend/src/trip-requests/dispatch/dispatch.service.ts`, `allocate` :
`if (pending.length) return` puis sélection par distance avec `LIMIT 1`.
Un seul conducteur est invité à la fois. Une invitation en attente empêche
l'invitation suivante jusqu'à décision ou expiration. Cela diffère de l'attente
antérieure « tous les conducteurs à 5 km ». Le commentaire de création parlant
de diffusion dans `trip-requests.service.ts` ne décrit pas cette implémentation.

Les demandes **planifiées**, dans `scheduled-request-alert.ts`, ont une diffusion
par lots de 50 destinataires éligibles. Une demande immédiate et une demande
planifiée ne constituent donc pas le même test.

Ce choix explique l'absence d'alerte simultanée sur les autres téléphones, mais
pas, à lui seul, l'absence totale sur le premier destinataire. Sa correction
demande de conserver la protection contre plusieurs acceptations concurrentes.

### P2 — La reprise temps réel est encore bornée à 30 secondes

`zwanga-backend/src/notifications/ride-realtime-delivery.ts` filtre
`createdAt > now() - interval '30 seconds'`. En parallèle,
`NotificationService.driverRingUntil` accorde maintenant 60 secondes.
Après indisponibilité temporaire du worker temps réel, un événement vieux de
45 secondes est exclu alors que sa sonnerie reste valide. Cela fragilise le
secours lorsque l'application est ouverte ; le push indépendant peut encore
fonctionner.

**Preuve :** sonde sur le SQL réellement émis et la méthode réelle de calcul
de l'échéance : 45 secondes exclues du premier, encore valides dans la seconde.
**À corriger :** aligner la reprise sur l'échéance métier/sonore effective, sans
réactiver des demandes traitées ou expirées.

### P2 — Le secours Android est visible mais volontairement silencieux

`zwanga-backend/src/notifications/android-driver-backup.ts` émet le secours v4
sur `driver-alert-backup-v1` avec `sound: 'none'`.
`services/driverAlertFallback.ts` crée aussi ce canal sans son. La carte sonore
Notifee dépend ensuite de l'exécution de `displayDriverInvitation` en JavaScript.
Si le traitement de fond ne démarre pas ou ne termine pas, le secours natif ne
peut pas, à lui seul, faire sonner le téléphone. Les anciens protocoles v1–v3
peuvent en outre dépendre entièrement de ce traitement pour présenter la carte.

**Preuve :** sonde du payload réel du secours et lecture des deux chemins.
Cela peut expliquer « carte sans son » sur certains appareils, mais n'établit
pas la cause de « aucune carte » sur tous les téléphones. Google précise que le
traitement d'un message prioritaire dispose d'un temps limité et que sa réception
ne doit pas dépendre de longs traitements asynchrones :
[documentation FCM](https://firebase.google.com/docs/cloud-messaging/android-message-priority).

**À étudier :** une présentation sonore native autonome, avec une seule entité
responsable du son et des actions, sans double alerte quand JavaScript reprend.

### P2 — Le repli audio des anciens binaires Android est incomplet

`services/foregroundRideSound.ts` vérifie
`NativeModules.ZwangaDriverAlerts?.canPlayForegroundRingtone` avant d'atteindre
le lecteur Expo de repli. Si cette méthode native est absente, le résultat est
faux et le repli n'est jamais démarré, même avec un canal et une autorisation
valides. Le test existant des anciens binaires couvre l'absence de la sonde de
santé, mais conserve cette méthode de permission.

**Preuve :** sonde du module réel, permissions autorisées et pont absent :
`RING_SYSTEM_AUDIO_UNAVAILABLE`, aucun lecteur prêt. Le pont est présent dans
les sources natives actuelles ; l'existence de téléphones concernés en production
reste à vérifier. Toute correction doit conserver le respect du silence et de
Ne pas déranger.

### P2 — La réception par le téléphone n'est pas mesurée de bout en bout

Le backend expose `POST /driver-dispatch/notifications/:id/received` dans
`dispatch.controller.ts`. La recherche du mobile ne trouve aucun appel à cette
route. Les acquittements de `driverNotifications.ts` concernent l'état local des
alertes et les décisions, pas ce reçu serveur.

`NotificationStatus.SENT` est attribué après acceptation du message par le
transport. Il ne prouve ni affichage ni lecture sonore. Un `receivedAt` absent
n'est pas non plus une preuve de non-réception avec ces clients. Les codes
`RideAudio` aident pour certaines erreurs, mais tous les refus attendus et
abandons de traitement ne sont pas remontés avec une cause structurée.

**À corriger :** étapes corrélées, sans payload personnel : destinataire retenu,
envoi accepté/refusé, réception appareil, carte publiée, lecture démarrée ou
empêchée et raison. Les métriques ne doivent pas ralentir l'alerte.

## Causes communes à contrôler sur l'environnement réellement déployé

Ces éléments sont des hypothèses pour l'incident, pas des valeurs de
configuration observées :

1. **Version du backend.** La suppression de la suspension après quatre refus
   a été préparée localement mais pas déployée par l'assistant. Un ancien worker
   peut encore appliquer la suspension de 24 heures. Les délais de 30/60 secondes
   diffèrent aussi selon la révision exécutée.
2. **Transport Firebase/APNs/Expo.** L'initialisation Firebase peut échouer sans
   arrêter le serveur. Un envoi FCM direct est alors refusé avec « FCM non
   configuré sur le serveur ». Une sonde locale a confirmé ce chemin. Vérifier
   aussi erreurs d'identifiants/projet, jetons invalidés et reçus Expo. Aucune
   clé, aucun fichier de secrets et aucune configuration de production n'ont
   été lus pour cet audit.
3. **Worker, migrations et configuration du dispatch.** Avec le dispatch activé,
   une sélection vide ou en erreur n'emprunte pas le broadcast historique.
   Les échecs du worker sont journalisés, mais la création de la demande peut
   rester réussie. Avec le dispatch désactivé, la création revient à une demande
   standard et à ses notifications ordinaires ; elle ne bénéficie pas du même
   flux sonore. Ce n'est pas équivalent à l'absence de tout push.
4. **Éligibilité et localisation en base.** Compte conducteur actif, dernier KYC
   approuvé, véhicule actif du bon type/capacité, jeton push, position utilisable,
   pas de trajet incompatible ni invitation exclusive déjà en attente. La
   proximité physique ne suffit pas si le serveur utilise une ancienne position.
   Une position `discoveryEnabled=true` reste actuellement utilisable sans limite
   d'âge ; un opt-out explicite et les anciennes présences expirées sont exclus.
5. **Autorisations et restrictions du téléphone.** Notifications désactivées,
   canal muet/bloqué, mode silence, volume de notification nul, Ne pas déranger,
   app arrêtée de force, restrictions d'exécution ou retards réseau. Ces conditions
   peuvent expliquer certains appareils, mais ne sont pas démontrées pour tous
   les comptes du test signalé.

Le plein écran n'est pas une condition nécessaire à la carte et au son. Le
profil `ride-alerts-test` active explicitement ses options Android et Firebase
iOS ; le profil production n'énonce pas ces activations dans son bloc local.
Les valeurs effectivement fournies au build distant n'ont pas été vérifiées.
L'absence de plein écran n'explique pas, à elle seule, une absence de push.

## Où se trouve le son

| Usage | Source dans l'application | Copie ou référence native |
| --- | --- | --- |
| Android actuel | `assets/sounds/android/driver_ring.wav` | `android/app/src/main/res/raw/driver_ring.wav` |
| Notification iOS | `assets/sounds/driver_ring.wav` | Ressource `driver_ring.wav` déclarée dans `ios/zwanga.xcodeproj/project.pbxproj` |
| Lecteur Expo au premier plan | `assets/sounds/driver_ring.wav` | `require` dans `services/foregroundRideSound.ts` |

Mesures réelles des fichiers locaux : PCM mono 16 bits, 22 050 Hz ; Android
60,0 secondes / 2 646 044 octets ; iOS 29,0 secondes / 1 278 944 octets. Les deux
copies Android sont identiques par SHA-256. Les échantillons ne sont pas
silencieux : crête normalisée 0,927 et RMS d'environ 0,61. Ces mesures ne
représentent pas le volume acoustique d'un téléphone.

`scripts/generate-driver-ring.cjs` génère les sons et
`plugins/withDriverAlertSources.js` recopie la variante Android au prebuild.
Le son est embarqué, pas téléchargé lors de la demande. Le lecteur natif
`ForegroundAlertPlayer.java` utilise toutefois **le son du canal Android** ; un
canal ancien personnalisé peut conserver le choix système de l'utilisateur.
[Android réserve ces choix à l'utilisateur après création du canal](https://developer.android.com/develop/ui/compose/notifications/channels).

Sur iOS, Apple impose un fichier de notification inférieur à 30 secondes, d'où
la variante de 29 secondes. Le lecteur au premier plan peut la boucler :
[documentation Apple](https://developer.apple.com/documentation/usernotifications/unnotificationsound).

## Vérifications réalisées et limites

- 111 tests mobiles ciblés réussis : autorisations/enregistrement, canaux,
  secours, transfert arrière-plan/premier plan, interruptions et reprise audio.
- 46 tests backend ciblés réussis : construction des payloads, transports
  simulés, échéances et réévaluation des décisions.
- Cinq sondes de caractérisation réussies : les quatre frontières backend
  décrites plus haut et le pont audio absent. Elles démontrent le comportement
  actuel, pas son adéquation au besoin ni la disparition d'un incident.
- `node scripts/check-native-sources.cjs` réussi. Aucune compilation native.
- Manifeste Android debug local : Expo gère FCM ; le module Firebase Messaging
  réservé à iOS est exclu de l'autolinking Android. Aucun conflit de ces deux
  services n'a été constaté dans cet artefact local. Le binaire store n'a pas
  été extrait ni inspecté.
- Premier lancement des sondes Jest corrigé après mélange des environnements
  de test mobile/backend ; quatre sondes ensuite exécutées avec la pile backend.
- Aucun téléphone physique, aucun envoi FCM/APNs réel, aucun accès à la base de
  production et aucun déploiement pendant cet audit. Les résultats ne certifient
  ni réception ni réveil de l'écran sur les appareils signalés.

## Priorité pour diagnostiquer le test signalé

Retrouver la fenêtre et la demande du test côté exploitation, puis vérifier :
nombre de conducteurs sélectionnés ; existence des notifications persistées ;
statuts, motif de suppression ou erreur de transport ; workers et version du
backend ; enfin réception et paramètres du téléphone. Sans notification créée,
enquêter sur le dispatch et l'éligibilité. Avec `failed`, enquêter sur l'envoi.
Avec `sent`, examiner les reçus et l'appareil sans assimiler ce statut à une
preuve de réception. Les correctifs des constats P1/P2 ci-dessus restent à
implémenter ; les fichiers fonctionnels n'ont pas été modifiés par cet audit.
