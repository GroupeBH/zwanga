# Livraison des alertes et marimba adouci

Date : 26 octobre 2026. Périmètre : application, sources Android et dépôt local
voisin `zwanga-backend`. Suite à l'audit d'absence de notification sur plusieurs
comptes conducteurs distincts. Aucun déploiement, envoi réel aux utilisateurs ou
changement de base de production effectué.

## Transport et son

La sonnerie est un fichier **embarqué dans l'application**. Firebase/FCM
transporte le push Android ; iOS utilise Firebase/APNs ou Expo/APNs selon la
capacité enregistrée. Le socket relaie les événements quand l'application est
connectée. REST consulte les données, enregistre les capacités et reçus, et
traite les acceptations/refus. Ces transports ne téléchargent pas la sonnerie.

À la demande de l'utilisateur, le générateur original à deux tons a été remplacé
par un motif de marimba léger continu : quatre notes, attaque de 20 ms,
harmoniques brèves, notes espacées de 360 ms mais prolongées sur 1,6 seconde
et superposées, sans pause entre motifs. Cette continuité répond à la dernière
demande de l'utilisateur. Aucun enregistrement tiers
utilisé. Fichiers : `scripts/generate-driver-ring.cjs`,
`assets/sounds/driver_ring.wav`, `assets/sounds/android/driver_ring.wav` et copie
Android `android/app/src/main/res/raw/driver_ring.wav`.

Mesures réelles du PCM local, normalisées entre 0 et 1 :

| Fichier | Durée | Crête | RMS |
| --- | --- | --- | --- |
| iOS / lecteur Expo | 29 s | 0,7400 | 0,2489 |
| Android | 60 s | 0,7400 | 0,2489 |

Le fichier précédent avait une crête d'environ 0,927 et un RMS d'environ 0,61.
Ces mesures confirment une énergie sonore moyenne plus faible ; elles ne mesurent
pas le volume acoustique d'un téléphone. Les préférences de volume, le silence,
Ne pas déranger et les canaux personnalisés restent respectés. Le nom de ressource
reste `driver_ring`, pour conserver les réglages des canaux existants.

## Correctifs serveur appliqués

- `src/trip-requests/dispatch/dispatch.service.ts` diffuse les demandes immédiates
  par lots de **50 conducteurs éligibles dans un rayon de 5 km**, puis continue
  aux passages suivants même si des invitations précédentes sont en attente.
  La sélection ne s'arrête plus au premier conducteur. Les verrous de présence,
  l'exclusion de l'auteur, le véhicule compatible, les invitations déjà traitées
  et l'indisponibilité pendant une autre course restent contrôlés. La première
  acceptation valide gagne et invalide les invitations concurrentes.
- `src/notifications/notification-push-claim.ts` et `notifications.service.ts` :
  lease de reprise urgente ramené de 120 à **20 secondes**, renouvelé toutes les
  5 secondes pendant un envoi actif. Les écritures portent un identifiant unique
  de claim : un ancien worker ne peut ni renouveler ni écraser le résultat du
  suivant. Aucun appel réseau sous verrou transactionnel. Le nombre d'alertes
  urgentes réclamées correspond aux emplacements d'envoi disponibles.
- `src/notifications/ride-realtime-delivery.ts` : reprise socket sur la fenêtre
  de 60 secondes, avec réévaluation de la pertinence métier avant livraison.
  L'échéance originale n'est jamais renouvelée par une relance.
- `src/notifications/native-android-driver-push.ts` : protocole Android v6,
  sélectionné uniquement après déclaration de la capacité par le nouveau binaire.
  Payload prioritaire, identité/échéances conservées, taille bornée sous 4 Ko.
  Les anciennes capacités et le transport iOS conservent leur chemin.
- `src/notifications/ride-notification-receipt.ts`, contrôleur et DTO du dispatch :
  reçu authentifié `received` / `displayed`, lié au destinataire, idempotent et
  distinct du statut d'acceptation par FCM. Migration additive
  `1780000093000-RideNotificationReceipts.ts`, enregistrée dans l'index des
  migrations. Pas de modification financière ou de décision depuis ce reçu.

La reprise est au moins une fois : une réponse FCM perdue peut laisser une
incertitude de livraison. Le claim protège les écritures serveur ; la
déduplication par notification protège la présentation côté téléphone. Cela ne
constitue pas une garantie d'exécution exactement une fois du fournisseur réseau.

## Correctifs Android et application appliqués

- Nouvelles sources canoniques `native/android/notifications/NativeRideDelivery.java`,
  `RideNotificationBundle.java`, `RideFirebaseMessagingService.java`, plus leurs
  miroirs générés. Le service étend celui d'Expo : messages ordinaires et rotation
  du token conservent le traitement Expo. Les invitations v6 valides en arrière-plan
  publient directement une carte Notifee sonore avec destination, prix disponible
  et actions, **avant le démarrage de JavaScript**. Au premier plan, le chemin Expo
  et le lecteur existant restent responsables de l'alerte.
- Carte conservée après ouverture, mêmes identifiants et actions que JavaScript,
  pas de seconde carte Expo pour la livraison native v6. Réveil demandé après
  publication, verrou de réveil borné à 1,5 seconde. Plein écran uniquement pour
  un build activé, consentement du conducteur, autorisation Android, écran verrouillé
  ou éteint et politique audio compatible. Le système/OEM peut refuser ce réveil.
- `DriverAlertModule.java`, `services/nativeRideDelivery.ts`,
  `services/tokenSession.ts`, `hooks/auth/usePushRegistration.ts` : liaison native
  au compte courant avec date d'expiration de session, sans stockage natif du
  token d'authentification. Invalidation synchrone lors du changement de session,
  nettoyage des cartes natives connues, registre limité à 100 reçus. Un ancien
  binaire reste en v2/v4 ; un serveur rejetant v6 par validation permet un repli
  explicite v4/v3/v2, sans traiter une panne réseau comme une incompatibilité.
- `services/rideNotificationReceipt.ts`, `store/api/driverDispatchApi.ts`,
  `services/driverNotifications.ts` : réception/affichage signalés hors du chemin
  critique, requêtes bornées et dédupliquées, reprises espacées. Les reçus du
  service natif sont synchronisés à l'ouverture de l'application, avec budget de
  traitement limité. Ils ne prouvent pas que le haut-parleur a effectivement joué.
- `hooks/notifications/useDriverNotifications.ts` : une carte native publiée
  après l'énumération des cartes à l'entrée transmet aussi le son au lecteur
  de premier plan via l'événement `DELIVERED`. Pas besoin d'un second déverrouillage.
- `services/legacyRideSound.ts` et `foregroundRideSound.ts` : sans pont audio
  complet sur un ancien Android, le son est confié au canal système de la carte
  existante. Pas de lecteur média contournant silence/DND ; les erreurs asynchrones
  de publication restent détectables. La synthèse vocale ne reçoit pas cette
  exception de permission.
- `plugins/withDriverAlertSources.js`, `android/app/build.gradle`, manifeste et
  `scripts/check-native-sources.cjs` : un seul service FCM déclaré pour Expo/v6,
  dépendances natives explicites correspondant aux bibliothèques déjà présentes,
  génération idempotente et vérification de parité. Le harnais Android local
  conserve ses adaptateurs de test et utilise le son Android de 60 secondes.

## Vérifications et limites

- Compilation réelle des classes de l'application :
  `:app:compileDebugJavaWithJavac`, Gradle 8.14.3, SDK Android 36, réussie.
  Le premier essai a détecté des dépendances absentes du classpath applicatif ;
  elles ont été déclarées explicitement avant la compilation réussie.
- 148 tests backend ciblés couverts : diffusion et concurrence PostgreSQL/PostGIS
  sur cluster temporaire local, payloads, conservation des échéances, claim actif
  et obsolète, reçus et migration aller/retour. La dernière suite dispatch comporte
  71 tests réussis ; les 77 autres tests ciblés ont réussi lors de l'exécution
  précédente. Les attentes séquentielles ont été adaptées au broadcast. Le délai
  de préparation/nettoyage des fixtures PostgreSQL est passé de 5 à 30 secondes
  après dépassements sous charge Windows ; ce n'est pas un délai de l'application.
- TypeScript backend vérifié sans émission. Tests mobiles ciblés pour le changement
  de compte, repli de version, reçus, ancien pont audio, transfert au premier plan,
  absence de double décision et propriétés du WAV. Test JVM exécutant la politique
  native réelle de validation des dates, identifiants et exclusion de l'auteur.
- Dernier contrôle des six nouveaux fichiers backend : ESLint sans erreur ;
  les deux suites unitaires claim/payload natif ont été rejouées après typage et
  formatage, avec cinq tests réussis.
- Contrôle complet mobile `check-release.cjs` réussi : TypeScript, ESLint,
  frontières réseau, taille des sources, parité native et **2 741 tests réussis**,
  un test Ruby ignoré sous Windows. Après le dernier ajustement du marimba continu,
  12 tests WAV/parité réussis ; absence de trou sonore vérifiée par blocs de 100 ms.
  Aucun nouveau contrôle global répété pour cette seule régénération audio.
- Harnais Android compilé puis installé uniquement sur `emulator-5554`, paquet
  `com.zwanga.audit`, sans permission Internet. Le constructeur de carte natif
  de production a effectivement publié une notification Notifee avec **deux
  actions** sur `zwanga-ride-ring-v4` (`NATIVE_CARD_PROBE_OK`). Carte de test
  supprimée ensuite. Pas de FCM, serveur, comptes réels ni mesure acoustique dans
  cet essai ; le harnais ne valide pas tout le service de réception.
  Les essais JavaScript/JVM et la compilation ne sont pas des essais de réception
  Firebase réelle, de volume acoustique ou de réveil sur téléphones physiques.
- Aucune compilation iOS sur ce poste Windows, aucun test de production ni envoi
  FCM/APNs réel. La cause exacte de l'incident de production reste à confirmer
  avec la version déployée et les traces de sélection/livraison.

## Mise en service nécessaire

Prévoir le déploiement du backend et de sa migration additive, puis un nouveau
build Android pour le récepteur natif et les ressources sonores. Un nouveau build
iOS est nécessaire pour remplacer le son de notification embarqué. Ces opérations
ne sont pas exécutées ici. Tester ensuite sur appareils réels : application
ouverte, autre application au premier plan, écran verrouillé, permissions refusées,
canal muet, changement de compte, doublon push/socket et acceptations concurrentes.

Les capacités anciennes restent compatibles pendant le déploiement progressif.
Les réglages FCM/APNs, les workers réellement déployés, les tokens de production et
la fraîcheur/validité des positions restent des vérifications d'exploitation.
