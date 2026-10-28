# Autorisations contextuelles : localisation, notifications et plein écran — 28 octobre 2026

## Périmètre et comportement appliqué

Application mobile uniquement, sans changement d’API ni intervention sur AWS.
La configuration locale de la prochaine build Android, y compris son profil EAS production,
inclut maintenant la capacité plein écran. Aucun build ou déploiement n’a été lancé.
Le composant visuel existant et son style sont conservés.

- Passager : après création confirmée d’une demande ou d’une réservation, proposer la localisation si elle n’est pas déjà accordée. Une demande retrouvée après une réponse réseau incertaine suit le même parcours. Aucun rappel pour un échec ou un résultat encore incertain.
- Le rappel attend la fermeture des fenêtres de succès et des autres fenêtres prioritaires. Il ne démarre pas pendant la navigation active, le paiement, le KYC, une entrée prioritaire, une alerte de trajet ou lorsque le clavier est visible.
- Le passage vers le détail d’une demande ne détruit pas le rappel : le coordinateur est monté au niveau de l’application.
- Conducteur : dès que le profil conducteur est confirmé et l’écran sûr disponible à la première connexion ou une connexion ultérieure, expliquer « Recevez les demandes proches, même écran éteint ». Ne plus attendre la publication d’un trajet ou une deuxième visite.
- L’historique du rappel conducteur reste conservé par compte, avec un intervalle minimal de 24 heures entre présentations de chaque type d’autorisation.
- Après la localisation, proposer les notifications/plein écran Android manquants, dès la première connexion et sans attente supplémentaire de 15 secondes. Si la localisation est déjà autorisée, commencer directement par l’étape manquante. Aucun passage par Profil → Alertes n’est nécessaire.
- « Plus tard » reste disponible. Refuser n’annule ni la demande ni la réservation.

## Parcours natif

1. Lire les autorisations réelles du téléphone, sans ouvrir automatiquement de fenêtre système.
2. Après appui sur Autoriser, demander la localisation au premier plan si nécessaire.
3. Si elle est accordée, demander la localisation en arrière-plan.
4. Android : utiliser le parcours officiel Expo/Android. Sur Android 11+, l’utilisateur doit choisir « Toujours autoriser » dans les autorisations système. En cas de refus permanent, ouvrir les réglages de Zwanga sur action explicite, avec les étapes Autorisations → Position.
5. iOS : demander l’autorisation native « Toujours ». Si iOS ne permet plus le dialogue, proposer les réglages Position → Toujours. Le cas « Autoriser une fois » peut refuser silencieusement la demande suivante malgré canAskAgain=true ; le parcours propose alors Réglages au lieu de boucler.
6. Relire les permissions au retour des réglages et ne pas confondre l’ouverture des réglages avec un accord.

Le système décide de la présentation exacte. Aucun lien privé ni permission contournée.
Les déclarations natives existantes ACCESS_BACKGROUND_LOCATION et NSLocationAlways / UIBackgroundModes location ont été inspectées, sans modification.
Référence : [documentation officielle Expo Location, permissions en arrière-plan](https://docs.expo.dev/versions/latest/sdk/location/#background-permissions). L’implémentation Android du paquet expo-location installé a également été inspectée.

## Réutilisation et protections

- services/tripLocationPermission.ts : relais UI en mémoire, borné et lié à la génération de session. Déduplication, regroupement des succès rapprochés, rejet des anciennes réponses après changement de compte. Un observateur défaillant ne transforme pas une création réussie en erreur.
- components/TripLocationPermissionCoordinator.tsx : inspection des permissions et affichage après les opérations confirmées ; état conservé pendant le passage dans les réglages.
- hooks/profile/useNearbyLocationPermission.ts : même séquence native et mêmes protections contre doubles appuis, lecture bloquée, résultat tardif et changement de compte. Nouveau mode passenger-trip, sans lecture/écriture des préférences conducteur ni démarrage GPS.
- components/location/BackgroundLocationApproval.tsx : explication adaptée au passager, même mise en page, action explicite et possibilité de différer.
- hooks/trip-request/useRequestSubmission.ts et hooks/trip-detail/useTripBookingSubmission.ts : branchements après succès.
- components/ReduxProvider.tsx : montage du coordinateur.
- hooks/notifications/useDriverPermissionPrompt.ts et components/DriverPermissionsCoordinator.tsx : rappel dès la première connexion et possibilité de réessayer une lecture native en erreur.

L’autorisation passager ne démarre pas un suivi permanent et ne transforme pas le compte en conducteur.
Les tâches de suivi des trajets, leur déclenchement historique, les cadences GPS et les transmissions existantes restent inchangés.
Ce rappel ne garantit ni une sonnerie de notification ni l’exécution GPS lorsque l’OS arrête l’application.

## Notifications et plein écran Android : complément appliqué

Les modales existantes et leur style restent utilisés ; textes raccourcis, boutons
explicites et « Plus tard » conservé. Exemples :

- Localisation : « Recevez les demandes proches, même écran éteint. »
- Notifications bloquées : « Recevez les alertes de nouvelles demandes de trajet. »
- Plein écran : « Voyez les nouvelles demandes même téléphone verrouillé. »

La mention de collecte, d’envoi au serveur et d’utilisation en arrière-plan est
conservée pour la localisation ; le texte distingue conducteur et passager.

Parcours conducteur après présentation et appui volontaire :

1. Si les notifications de l’application sont désactivées, « Ouvrir les notifications »
   ouvre leur page système via Notifee, et non seulement le réglage du canal sonore.
   Si indisponible sur un ancien appareil/OEM, repli sur les réglages de Zwanga.
2. Après retour, relire les permissions réelles. Un retour sans accord ne valide rien.
3. Sur Android 14+, si l’accès spécial manque, « Ouvrir les réglages » utilise
   ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT avec le package Zwanga via le bridge existant.
4. Sur une version Android antérieure, ou si l’accès système est déjà accordé,
   « Activer » enregistre seulement le consentement conducteur nécessaire.
5. Fermer cette étape uniquement si notifications, consentement et accès système sont
   tous présents. Une lecture en erreur permet de réessayer sans accorder de permission.

Protection contre double appui, compte changé, démontage, arrière-plan et redirection
tardive après expiration du délai d’ouverture. Aucun réglage n’est ouvert sans appui.
Pas de nouveau polling, requête HTTP, forçage du volume, contournement de Ne pas déranger
ou déverrouillage du téléphone.

Fichiers complémentaires :

- hooks/notifications/useDriverPermissionPrompt.ts : séquence dès première connexion.
- components/DriverPermissionsCoordinator.tsx : étape notifications avant plein écran.
- hooks/notifications/useDriverFullScreenPermission.ts : ouverture, relecture et retry.
- hooks/profile/useNearbyLocationPermission.ts : sur Android, une lecture fraîche autorisant
  un nouveau dialogue remplace l’ancien indicateur de refus ; le cas iOS Always reste distingué.
- services/driverAlertChannel.ts : réglage des notifications application ou canal existant.
- components/permissions/DriverFullScreenApproval.tsx et components/location/BackgroundLocationApproval.tsx : textes et boutons courts.
- plugins/withIncomingRideAlerts.js, app.config.js, eas.json, scripts/configure-ride-alert-build.cjs
  et android/app/src/main/AndroidManifest.xml : capacité native activée et règles alignées
  entre Expo, EAS et le manifeste déjà versionné.
- DriverAlertModule.java et RideNotificationBundle.java, sources canoniques et miroirs Android :
  ne plus exiger USE_FULL_SCREEN_INTENT sur Android antérieur à 10. Cette permission
  n’existe qu’à partir de l’API 29 ; consentement et autres contrôles restent obligatoires.
  Référence : [Android, USE_FULL_SCREEN_INTENT](https://developer.android.com/reference/android/Manifest.permission#USE_FULL_SCREEN_INTENT).

La capacité native est activée par défaut dans la configuration, et explicitement
dans le profil EAS production. ZWANGA_DRIVER_FULL_SCREEN_ENABLED=false permet de
la désactiver lors de la génération native ; une valeur invalide la désactive aussi.
Modifier cette option nécessite de régénérer un manifeste cohérent et reconstruire,
pas seulement de changer une variable Metro ou serveur.

Consentement conducteur et autorisation système restent distincts de la capacité
de la build. Les anciennes builds sans capacité restent sur les notifications normales.
Une mise à jour native est indispensable : ni le backend ni une mise à jour JavaScript
seule ne peuvent ajouter une permission au manifeste installé.

Avant distribution, renseigner la déclaration USE_FULL_SCREEN_INTENT dans Play Console
et vérifier l’acceptation pour l’usage réel de Zwanga. L’accord automatique est réservé
aux usages éligibles d’appel/alarme ; il n’est pas supposé ici.
Références : [Google Play, permissions sensibles Android 14](https://support.google.com/googleplay/android-developer/answer/13392821?hl=en),
[Android, limites des intents plein écran](https://source.android.com/docs/core/permissions/fsi-limits).

iOS : pas d’équivalent générique à cet accès spécial pour une demande de trajet.
Les notifications et sons ordinaires restent utilisés ; pas de faux appel CallKit/VoIP.
L’autorisation de localisation conserve le dialogue natif puis le repli Réglages si nécessaire.

## Vérifications effectuées

Première étape localisation : 306 tests JavaScript ciblés réussis, avec I/O natifs simulés : permissions, onboarding,
GPS conducteur/passager, coordinateur de trajet, modales, recherche, demandes,
réservations et contrôles de formulaire. Cas couverts notamment :

- première connexion conducteur, autorisation déjà accordée et rappel non répété ;
- création réussie / échouée / encore incertaine, rapprochement après timeout ;
- suppression du rappel après accord, bouton Plus tard, erreurs de lecture et de réglages ;
- Android avec refus permanent et retour des réglages ;
- iOS avec refus silencieux Always et repli explicite Réglages ;
- double appui, déconnexion, changement de compte, démontage et résultat natif tardif ;
- absence d’activation GPS et de modification des préférences conducteur pour le passager.

Tests ajoutés : tripLocationPermission.test.js, tripLocationPermissionCoordinator.test.js,
bookingLocationPermission.test.js. Tests existants enrichis : tripRequestForm,
backgroundLocationApproval, driverPermissionCoordinator et driverPermissionOnboarding.

Complément modales courtes et plein écran : 61 tests JavaScript ciblés réussis
(9 fichiers), dont nouvel onboarding sans délai, permissions refusées, retour sans
accord, ouverture app/canal, double appui, timeout, compte changé et CTA Android 13/14.
Ces tests incluent des contrôles statiques du manifeste et des fichiers natifs,
pas une compilation ou un essai natif. Nouveau fichier : fullScreenApprovalCopy.test.js.

Autres contrôles réussis :

- node node_modules/typescript/bin/tsc --noEmit --incremental false
- ESLint sur les fichiers modifiés et ajoutés, sans avertissement
- node scripts/check-network-boundaries.js
- node scripts/check-source-size.cjs
- git diff --check

Sur le complément, TypeScript, ESLint ciblé sans erreur, parité des sources
natives, frontières réseau et taille des sources passent. Un avertissement préexistant
reste dans app.config.js:27 : HAS_IOS_GOOGLE_SERVICES_FILE non utilisé. Le contrôle complet
check-release s’arrête sur une erreur ESLint préexistante hors périmètre :
scripts/relay-fix-work/apply.cjs:9, __dirname non déclaré. Ce script n’a pas été modifié.

La suite complète a donc été lancée séparément sur 339 fichiers : 2 822 tests,
2 821 réussis, aucun échec, 1 ignoré car Ruby n’est pas installé (environ 294 secondes).
Le contrôle des versions de l’application/Didit/iOS, des builds, des demandes,
réservations, notifications et permissions est inclus. Aucun secret .env n’est chargé
par les tests de configuration ajoutés.

Après le dernier correctif API Android <29, 15 contrôles supplémentaires/ciblés
relancés réussissent : rideScreenWakeNative, rideFullScreen, rideFullScreenPreference
et rideAlertBuild. Ils compilent/exécutent notamment la méthode Java de décision
extraite du code réel avec des services système simulés (API 28, 29 et 34), et vérifient
la cohérence avec la création de notification native. Il ne s’agit ni d’un APK compilé
ni d’un essai sur appareil. La parité canonique/mirroir Android passe également.

## Recette native restant à effectuer

Sur une build de développement (pas Expo Go), puis une build de distribution :

1. Android 11+ : retirer l’autorisation arrière-plan, créer une demande, vérifier le modal après succès puis choisir Toujours autoriser ; revenir et confirmer sa fermeture.
2. Répéter après réservation, avec Plus tard, refus au premier plan et refus permanent. Vérifier que l’opération reste enregistrée et que le parcours d’origine fonctionne.
3. iPhone : tester Autoriser lorsque l’app est active puis Toujours ; tester séparément Autoriser une fois puis le repli Réglages. Vérifier le résultat réel au retour.
4. Nouveau compte conducteur reconnu par le serveur : vérifier le rappel sur l’accueil dès la première connexion. Refuser puis revenir rapidement : pas de répétition avant 24 heures.
5. Tester clavier, fenêtre de succès, alerte de trajet, passage en arrière-plan et déconnexion pendant le dialogue ; aucune activation de l’ancien compte.
6. Après accord, effectuer un vrai trajet écran éteint et contrôler le suivi côté serveur. Ce dernier point n’est pas mesuré par les tests JavaScript.
7. Nouvelle build Android : premier accès conducteur avec notifications bloquées ;
   vérifier le bouton vers leurs réglages puis, au retour, celui vers l’accès plein écran.
8. Android 14+ : refuser puis accorder l’accès spécial, revenir sans modification,
   révoquer une autorisation, tester « Plus tard » et le rappel après 24 heures.
9. Sur téléphone physique verrouillé, envoyer une vraie demande : vérifier notification,
   sonnerie et plein écran selon les permissions, y compris mode Ne pas déranger.
   Répéter sans consentement : la notification normale doit rester disponible.
10. Android 13 : pas de page d’accès spécial ; seule l’activation interne est proposée
    après autorisation des notifications. Sur iPhone, aucun modal plein écran Android.
11. Android 9 : vérifier l’activation explicite sans attente d’une permission introduite
    uniquement sur Android 10 ; vérifier aussi le repli en notification normale.

Aucun build natif, essai sur téléphone physique, envoi GitHub ou déploiement effectué dans cette intervention.
