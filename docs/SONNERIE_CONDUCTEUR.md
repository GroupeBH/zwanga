# Alertes conducteur — sonnerie du téléphone

## 17 octobre 2026 — périmètre et problème

La sonnerie des commandes proches et des réservations est signalée comme trop
faible. Le code utilisait déjà un fichier de 29 secondes et une boucle Android
limitée à 30 secondes, mais le canal `booking-ring-v2` utilisait le son Zwanga
et les attributs audio de notification, pas ceux de la sonnerie du téléphone.
Le volume réellement entendu n'a pas été mesuré sur un appareil physique.

## Solution appliquée

- **Android 8 et suivants** : nouveau canal `driver-phone-ring-v3`, sonnerie
  choisie dans le téléphone (`RingtoneManager.TYPE_RINGTONE`), attribut audio
  `USAGE_NOTIFICATION_RINGTONE`, importance haute, vibration et contenu privé
  sur écran verrouillé. Pas de faux appel, de permission plein écran, de lecteur
  audio, de service permanent ni d'augmentation forcée du volume système.
- Le module est invoqué à la configuration des notifications, sans lecture
  audio au lancement. Un bridge absent, en erreur ou bloqué plus de 5 secondes
  conserve le canal v2. Les anciens binaires et les appareils antérieurs à
  Android 8 restent compatibles avec le son fourni par l'application.
- Les canaux existants ne sont ni supprimés ni réinitialisés. Un canal v2
  silencieux, désactivé, personnalisé ou dont le groupe est bloqué reste utilisé.
  Lors d'une migration autorisée, les autres préférences sont conservées. Les
  paramètres propres au canal v3 restent ensuite entièrement sous contrôle de
  l'utilisateur. Le mode silencieux et « Ne pas déranger » ne sont pas contournés.
- **iOS et secours Android** : fichier PCM original renforcé, toujours mono
  22 050 Hz, 29 secondes et 1 278 944 octets. Doubles impulsions plus longues,
  fréquences médianes et compression douce, sans saturation. Même nom de fichier
  pour conserver les payloads APNs/FCM et les ressources natives existantes.
- `Paramètres > Sonnerie et vibrations` ouvre les réglages système du canal sur
  Android, ou ceux de l'application sur iOS. Le précédent interrupteur « Sons »
  ne modifiait qu'un état React temporaire et ne contrôlait pas le son système.

### Transport et compatibilité backend

La capacité v3 n'est annoncée que sur Android, après création effective du canal
et disponibilité de la tâche de notifications en arrière-plan. iOS reste en v2.
La capacité est toujours liée au propriétaire et au jeton push courant.

Les réservations et offres immédiates gardent le protocole d'actions existant.
Les commandes programmées proches passent en **data-only uniquement pour v3**,
avec le marqueur `delivery: driver-phone-v3`. Notifee présente alors une seule
notification et borne sa sonnerie par un timeout natif de 30 secondes maximum.
Le TTL FCM ne suffit pas : il limite la livraison, pas la durée du son.
Les commandes programmées restent des liens vers les détails, sans acceptation
exclusive ni nouveaux boutons accepter/refuser.

Les installations v1/v2 gardent leurs payloads précédents. Un backend qui refuse
v3 avec HTTP 400 est réessayé en v2 ; aucune rétrogradation automatique n'est faite
sur erreur d'authentification, réseau ou serveur. Après déploiement du backend,
rouvrir l'application pour renouveler l'enregistrement.

La table existante `driver_notification_clients` et sa clé primaire `userId`
suffisent : les recherches paramétrées reconnaissent aussi l'empreinte v3, sans
migration, nouveau droit SQL ni changement des critères de proximité/véhicule.
La sélection du conducteur, le statut des commandes et le drapeau d'activation
du dispatch sont conservés. Les notifications de messagerie et les alertes
d'acceptation destinées au passager ne passent pas au canal de sonnerie conducteur.

## Fichiers concernés

Application :

- `android/app/src/main/java/com/zwanga/notifications/DriverAlertModule.java`,
  `DriverAlertPackage.java`, et enregistrement dans `MainApplication.kt` ;
- `services/driverAlertChannel.ts`, `driverNotifications.ts`,
  `backgroundNotificationTask.ts`, `notifeeBackgroundHandler.ts` ;
- `features/notifications/driverRinging.ts`, `rideSound.ts` ;
- `hooks/auth/usePushRegistration.ts`, `hooks/notifications/useDriverNotifications.ts`,
  `store/api/driverDispatchApi.ts`, `app/settings.tsx`, `types/notifee.d.ts` ;
- `scripts/generate-driver-ring.cjs`, `assets/sounds/driver_ring.wav`,
  `android/app/src/main/res/raw/driver_ring.wav` ;
- tests `driverAlertChannel`, `driverNotifications`, `driverNotificationNativeAssets`,
  `pushRegistration`, `requestAcceptanceSound`.

Backend adjacent `zwanga-backend` :

- `src/notifications/notifications.service.ts`, `driver-action-notifications.spec.ts` ;
- `src/trip-requests/dispatch/dispatch.dto.ts`, `dispatch.service.ts`,
  `scheduled-request-alert.ts`, `scheduled-request-alert.spec.ts`.

Les changements préexistants de l'accueil et du portefeuille backend ne font
pas partie de cette intervention et ont été conservés.

## Vérifications et limites

- **67 tests JavaScript mobile réussis** : compatibilité native/v2, garde de
  5 secondes, inscription v3, secours HTTP 400, destinataire/session, dédoublonnage,
  expiration, arrêt à l'ouverture, actions, canaux et navigation inchangée.
- **74 tests Jest backend réussis** dans les quatre suites notifications/actions/
  commandes programmées/livraison. Appels push et accès base simulés : aucune
  notification réelle envoyée, aucun changement appliqué à la base de production.
- Typage mobile global réussi (`tsc --noEmit`). Lint mobile ciblé : aucune
  erreur, quatre avertissements sur des imports `require` et variables de catch
  déjà présents dans les handlers de fond. `git diff --check` réussi dans les
  deux dépôts (avertissements de conversion de fins de ligne uniquement).
- Comparaison numérique au WAV de `HEAD` : RMS **0,30975 → 0,60972**, soit
  **+5,88 dB de signal moyen** ; pic **0,87784 → 0,92651** (pleine échelle = 1).
  Ce n'est pas une mesure acoustique du haut-parleur, ni du volume système.
- Compilation isolée des deux classes Java avec Android SDK 36 et React Android
  0.81.5 réussie ; avertissements d'annotations absentes du classpath réduit et
  d'API React dépréciée. Ce contrôle n'est pas un build Gradle/AAB complet ni un
  essai de livraison native.
- Typage du backend de production (`tsconfig.build.json`) réussi. Le typage
  global incluant tous les tests reste en échec dans des fichiers hors de ce
  changement (activité, finances administrateur, migrations, portefeuille…).
- Aucun essai acoustique sur Android/iPhone physique, ni build EAS, soumission
  store, déploiement AWS ou changement d'environnement effectué. Un émulateur
  Android est connecté, mais le nouveau module n'y a pas été installé/testé.

## Déploiement et recette encore nécessaires

1. Déployer le backend compatible v3 en premier, sans migration SQL. Conserver
   les réglages existants d'envoi push et de dispatch ; aucun nouveau secret requis.
2. Construire et installer un **nouveau binaire Android et iOS**. Une mise à jour
   OTA seule ne fournit ni le module Java, ni le nouveau fichier sonore natif.
   Pour les appareils de développement :

   ```powershell
   npx.cmd eas-cli build --platform android --profile dev-device
   npx.cmd eas-cli build --platform ios --profile dev-device
   ```

   Pour les stores, utiliser le profil `production` (incrément distant déjà prévu).
   Le dossier Android est versionné : inclure les deux nouvelles classes et
   `MainApplication.kt` dans le build. Une régénération `prebuild --clean` n'est
   pas nécessaire et effacerait cette intégration manuelle ; il faudrait alors
   la reporter ou créer un config-plugin avant régénération.
3. Ouvrir l'application connectée une fois pour configurer le canal et enregistrer
   la capacité. Vérifier les autorisations, le volume de sonnerie et les réglages
   de notifications du système.
4. Tester sur téléphone physique verrouillé : réservation, commande immédiate,
   commande programmée proche, ouverture depuis l'icône, ouverture depuis l'alerte,
   accepter/refuser, aucune réponse pendant 30 secondes et doublon du même push.
5. Tester mode silencieux/DND, canal désactivé/personnalisé, ancien binaire,
   mise à jour sans effacement, déconnexion/changement de compte, réseau retardé
   et notification de messagerie. Ne pas conclure à l'absence de crash/chauffe
   sans essai natif. La livraison reste soumise aux autorisations et restrictions
   d'arrière-plan des systèmes, notamment après un arrêt forcé.

Références : [canaux Android](https://developer.android.com/reference/android/app/NotificationChannel),
[sons iOS](https://developer.apple.com/documentation/usernotifications/unnotificationsound),
[comportement Notifee Android](https://notifee.app/react-native/docs/android/behaviour/).
