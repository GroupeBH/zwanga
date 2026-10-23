# Demandes entrantes — boucles de validation du 22 octobre 2026

## Périmètre et contrat

Mobile Zwanga et dépôt voisin `zwanga-backend`, sans déploiement ni modification
de la base de production. Ce document sépare le code appliqué, les tests exécutés
et les validations natives restant à faire.

- Une invitation dispatch suit `pending → accepted | declined | expired | cancelled`.
  Une même décision peut être répétée sans second effet ; une décision opposée
  ou une invitation devenue obsolète est refusée par le serveur.
- Le verrouillage serveur reste demande → invitation → présence. Aucun appel
  réseau n'est ajouté dans ces transactions. Le premier conducteur accepté gagne.
- `expiresAt` est fixé à l'allocation. Une reprise d'envoi ne doit pas le prolonger.
  La durée existante de 30 secondes reste configurable (10–120 secondes).
- Une demande programmée ou partagée garde son choix de véhicule et ses contrôles
  de consentement ; son alerte sonore n'est pas son échéance métier.
- Les nouvelles réservations ouvrent la gestion du trajet, sans réintroduire les
  anciens écrans intermédiaires. Un trajet en cours reste prioritaire.
- Le serveur décide ; Socket.io signale ; REST réconcilie ; FCM/APNs transportent ;
  Notifee présente. Un push reçu n'est jamais une preuve d'acceptation.
- La pause de 24 heures après quatre demandes proches sans suite, l'exclusion
  de l'auteur, les permissions, les modes silencieux et les changements de compte
  restent applicables à tous les canaux.

## LOOP 0 — Exploration

- IMPLEMENTED : inventaire de l'existant, sans changement fonctionnel.
- TESTED : lecture des services, routes, configuration et tests existants ; état Git.
- RESULT : PASS pour l'exploration, pas une validation sur appareils.
- ISSUES : renouvellement des délais à la reprise d'envoi ; absence de transport
  des alertes sur le socket existant ; plein écran Android non raccordé ; token
  iOS actuel via Expo et non Firebase ; compteur ancré au rendu du composant.
- FIXES : aucune à ce stade.
- NEXT LOOP : contrat puis correctifs backend.

## LOOP 1 — Architecture

- IMPLEMENTED : contrat ci-dessus ; réutilisation du namespace Socket.io `/chat`
  et de ses salons privés authentifiés, sans nouvelle connexion parallèle.
- TESTED : revue des transitions et des verrous existants.
- RESULT : PASS pour la conception ; implémentation à vérifier séparément.
- ISSUES : livraison push et exécution en arrière-plan non garanties ; permission
  plein écran Android et validation APNs nécessitent une configuration native.
- FIXES : conserver un repli notification et ne jamais simuler un appel VoIP.
- NEXT LOOP : backend, Android, iOS, interface, cas limites et validation.

## Présentation retenue

Selon le guide frontend : surface calme, typographie lisible, identité Zwanga et
actions visibles sans défilement. Ordre : titre/temps restant, trajet, passager et
tarif, informations secondaires, décision. Retour visuel au toucher et indicateur
de confirmation réseau uniquement ; pas d'animation décorative ni de nouvelle carte
native sur l'écran entrant.

## LOOP 2 — Backend

- IMPLEMENTED : suppression de `recover-driver-offer.ts` et de son invocation :
  plus de renouvellement d'une invitation ni d'une fenêtre sonore à la reprise.
  Fenêtre sonore ancrée à la création de la notification. Lecture d'une offre
  plus stricte (affectation, trajet existant, date limite, prix absent).
  `RideAlertRealtime` réutilise les salons privés du gateway chat ; `RideAlertChanges`
  publie les changements connus après commit, jamais après rollback. L'annulation
  utilise la sauvegarde de la demande verrouillée pour déclencher ce suivi.
- TESTED : 42 tests transport/échéances ; 54 tests de politique et d'intégration
  PostgreSQL/PostGIS, cluster local temporaire (dont concurrence réelle) ; 48 tests
  transport/APNs/temps réel après ajout des nouveaux modules ; TypeScript backend.
  Les comptes sont ceux des exécutions successives, non des tests tous distincts.
- RESULT : PASS pour ces exécutions ; résultats finaux consignés dans LOOP 7.
- ISSUES : un socket n'est pas une file durable ; un accusé fournisseur ne prouve
  pas que le conducteur a entendu le téléphone. Les changements en SQL brut sans
  identité d'entité ne déclenchent pas automatiquement le subscriber.
- FIXES : relecture REST au retour/reconnexion ; polling de 5 s limité à l'écran
  d'invitation actif et non terminé ; expiration locale conforme au serveur.
- NEXT LOOP : Android.

## LOOP 3 — Android

- IMPLEMENTED : `rideAlertFullScreen.ts`, extension `DriverAlertModule`,
  `IncomingRideActivity`, préférence facultative et plugin `withIncomingRideAlerts`.
  Déclenchement conditionné par build, consentement du compte, permission spéciale,
  téléphone verrouillé et politique sonore existante. Aucun forçage de volume,
  aucun faux appel, aucun déverrouillage automatique. Surface native privée,
  actions transmises au flux Notifee existant après déverrouillage ; notification
  habituelle conservée en cas d'absence/refus/erreur du mécanisme plein écran.
- TESTED : tests JS de garde et d'idempotence du plugin ; compilation Android
  `:app:compileDebugJavaWithJavac` réussie (13 min 16 s). L'essai hors ligne avait
  échoué car Didit 4.9.1 manquait au cache. Cette compilation Java/Kotlin n'est ni
  une archive release, ni un essai sur téléphone physique.
- RESULT : BLOCKED pour la validation complète sur appareil/distribution.
- ISSUES : autorisation Android 14+, déclaration/règles Play et comportement OEM.
- FIXES : permission `USE_FULL_SCREEN_INTENT` absente du manifeste livré par défaut ;
  option désactivée. `ZWANGA_DRIVER_FULL_SCREEN_ENABLED=true` doit être appliqué
  au prébuild Android après vérification de la distribution, puis recompilation.
  Puisque `android/` est versionné, changer une variable EAS seule ne modifie pas
  le manifeste existant. Ne pas lancer un prebuild destructif sans revue du diff.
- NEXT LOOP : iOS.

## LOOP 4 — iOS

- IMPLEMENTED : Firebase Messaging 23.8.8 aligné sur les modules installés,
  exclu de l'autolinking Android ; acquisition/rotation du token iOS, capacité
  serveur v5, APNs `alert`, catégorie de proximité, son `driver_ring.wav`,
  `interruption-level: time-sensitive`, expiration et collapse ID. Patch Notifee
  v3 compatible corps Expo et données APNs ; anciennes catégories conservées.
- TESTED : contrats APNs et garde de compatibilité JS ; TypeScript mobile.
- RESULT : BLOCKED pour build/notification APNs réelle sur iPhone.
- ISSUES : Xcode/CocoaPods et validation des identifiants APNs Firebase non
  accessibles dans cette session Windows. `ios/Podfile.lock` n'a pas été inventé.
- FIXES : activation coordonnée via `EXPO_PUBLIC_IOS_FCM_ENABLED=true` seulement
  après backend v5 + configuration Firebase APNs + `pod install` sur macOS et
  nouveau build. Par défaut, les utilisateurs gardent le transport Expo/APNs.
  Un ancien binaire sans le module natif conserve également ce transport.
  `ios/Podfile` applique à `RNFBMessaging` le réglage de modules déjà utilisé pour
  les autres ponts Firebase ; son résultat Xcode reste à vérifier. Une erreur
  d'initialisation Firebase ne lève pas d'exception depuis le rendu ou les listeners.
- NEXT LOOP : interface et synchronisation.

## LOOP 5 — Interface

- IMPLEMENTED : titre explicite, délai en haut, trajet compact, décisions fixes
  visibles ; état réseau non confirmé désactive l'acceptation ; délai calculé
  au départ HTTP puis limité par une horloge monotone, sans remise à zéro au rendu
  ni lors d'un changement d'heure. Arrêt de l'alerte à l'expiration/état terminal.
- TESTED : calcul des délais, horloge reculée, données invalides ; tests existants
  de réservation/entrée (réutilisation de la gestion du trajet).
- RESULT : PASS pour la logique testée ; vérification visuelle sur appareil à faire.
- ISSUES : aucune estimation de distance fiable n'est fournie par ce contrat ;
  aucune distance fictive n'est affichée.
- FIXES : conserver la fiche de commande pour le choix d'un véhicule, la priorité
  des trajets actifs et les écrans protégés (paiement/chat/navigation).
- NEXT LOOP : non-régression globale et cas limites.

## LOOP 6 — Synchronisation et cas limites

- IMPLEMENTED : un seul socket `/chat`, abonnement uniquement au premier plan,
  contrôle du destinataire/de la session, rafales de rafraîchissement regroupées
  sur 200 ms et déduplication par le même service que le push. Le serveur publie
  l'invitation après l'enregistrement `SENT` pour conserver le compteur de pause.
  Les changements après commit utilisent un worker et une file bornée à 200 clés,
  sans attendre une seconde connexion de base dans le callback de transaction.
  Réponses passager Firebase raccordées à la même session sonore qu'Expo : arrêt
  à l'ouverture du trajet correspondant, pas d'action conducteur sur ces réponses.
- TESTED : doubles livraisons simultanées, accusés déjà traités, compte changé,
  arrière-plan, démontage, données invalides, horloge reculée, rollback, file saturée,
  fournisseur indisponible et absence de module natif. 92 tests mobiles ciblés,
  puis 41 tests ciblés après les derniers ajustements, tous réussis (dont deux
  nouveaux tests de l'écran dispatch : cache ancien et réponse non confirmée).
- RESULT : PASS pour les cas automatisés ; conditions natives listées plus bas.
- ISSUES : le socket complète le push et n'est pas un secours indépendant quand
  le fournisseur push est indisponible. La file de signaux n'est pas durable et
  une saturation abandonne des signaux, jamais une décision métier. Une annulation
  effectuée en SQL brut peut nécessiter une relecture REST ou l'expiration locale.
- FIXES : aucune prolongation de délai au renvoi ; refus de confirmer hors ligne ;
  invitations terminées arrêtent leur polling et leur compteur ; montant absent
  présenté comme indisponible, jamais comme un trajet gratuit.
- NEXT LOOP : validation globale et recette physique.

## LOOP 7 — Validation et stabilisation

- IMPLEMENTED : tests de non-régression et journal de validation dans les deux
  dépôts. Aucun déploiement, aucune nouvelle migration, aucun accès à une base
  de production, aucune fusion depuis `master`.
- TESTED : suite mobile complète : **2 477 tests, 2 476 réussis, 1 ignoré,
  0 échec** (590,6 s sur ce poste ; ce temps n'est pas une mesure de l'application).
  Le test ignoré exige Ruby/macOS pour exécuter la politique des cibles iOS.
  La suite complète précède les deux derniers tests dispatch ; ceux-ci et les
  chemins affectés ont été relancés dans la sélection finale de 41 tests.
  Backend final : **55 tests de politique/dispatch PostgreSQL/PostGIS réussis**
  (233,9 s, cluster jetable), puis **81 tests unitaires de notifications réussis**
  répartis dans cinq suites. Le subscriber est testé sur transaction réelle et
  les invitations socket sont vérifiées après enregistrement `SENT` uniquement.
  TypeScript mobile/backend réussis. ESLint ciblé sans erreur ni avertissement,
  frontières réseau valides ; 1 170 sources contrôlées, aucune au-dessus de 400 lignes.
  Les premières suites de notifications nécessitaient de simuler les deux nouveaux
  adaptateurs natifs ; les mocks ont été adaptés sans enlever d'assertions métier.
  Le délai de la fixture de notification est créé par test pour ne pas expirer
  pendant l'exécution des autres suites, sans prolongation en production.
- RESULT : BLOCKED pour la certification native complète ; PASS pour les
  vérifications automatisées ci-dessus et la compilation Android accessible.
- ISSUES : un essai PostgreSQL a dépassé les 30 s au démarrage d'`initdb` local,
  avant exécution des scénarios, pendant les autres vérifications. Ne pas présenter
  cet échec d'infrastructure comme un résultat métier. La première relance isolée
  a exécuté 53/55 tests avec succès ; deux préparations `beforeEach` (nettoyage
  `TRUNCATE` local) ont dépassé le timeout Jest de 5 s. Relance avec limite de
  20 s pour les tests/hooks, sans changer les délais métier ni les assertions.
  Cette dernière relance est entièrement passée ; aucune mesure de latence
  serveur de production ne peut être déduite de ces durées de préparation locale.
- FIXES : relance isolée ; garde d'activation explicite des deux nouveaux chemins
  natifs et maintien du transport de notification existant par défaut.
- NEXT LOOP : archive iOS sur macOS et recette native avant activation/distribution.

## Ordre de mise en service à valider hors de cette session

1. Déployer séparément le backend compatible v5 (et ses migrations préexistantes
   de proximité si elles ne le sont pas déjà), puis vérifier FCM/APNs et les salons
   Redis/Socket.io. Aucun de ces gestes n'a été effectué ici.
2. Sur macOS, exécuter `pod install` avec les dépendances verrouillées, conserver
   le lock généré, compiler une archive release et vérifier les délégués Expo,
   Notifee et Firebase ensemble, y compris les notifications ordinaires.
3. Activer `EXPO_PUBLIC_IOS_FCM_ENABLED` uniquement sur ce build compatible après
   validation de l'enregistrement v5. Ne pas activer sur un ancien serveur : le
   client ne rétrograde pas un token FCM iOS en capacité Android data-only.
4. Pour Android, vérifier l'éligibilité et les déclarations Play avant toute
   activation du plein écran, appliquer le plugin au projet natif et reconstruire.
   Sans activation, conserver le réveil et la notification habituels selon les
   autorisations du téléphone. Un simple changement OTA ne suffit pas.
5. Tester sur appareils réels : demande puis réservation, double livraison,
   deux conducteurs acceptant ensemble, refus, annulation, expiration, réseau
   interrompu, changement de compte, app ouverte/arrière-plan/arrêtée et verrouillage.
   Confirmer qu'un trajet en cours conserve sa priorité, que la demande partagée
   conserve son consentement et que la réponse passager s'arrête au bon écran.

## Sources et contraintes natives vérifiées

- [Notifications urgentes Android](https://developer.android.com/develop/ui/views/notifications/time-sensitive)
- [Règles Google Play / permissions sensibles](https://support.google.com/googleplay/android-developer/answer/13392821?hl=en)
- [Comportement Notifee](https://notifee.app/react-native/docs/android/behaviour/)
- [FCM iOS](https://firebase.google.com/docs/cloud-messaging/ios/receive-messages)
- [React Native Firebase iOS](https://rnfirebase.io/messaging/usage/ios-setup)

La réception en veille/force-stop, le silence/DND, les autorisations refusées,
l'ouverture exacte après déverrouillage, et l'annulation simultanée doivent être
testés sur Android 13/14+ et iPhone. Aucun résultat de batterie, latence native,
absence de crash ou livraison garantie n'est déduit des seuls tests JS.

## Activation pour les tests — 22 octobre 2026

Cette section complète l'état initial « désactivé par défaut » des boucles ci-dessus.
À la demande de l'utilisateur, les deux options sont activées dans le **nouveau
profil EAS `ride-alerts-test`**, qui hérite du profil production (AAB Play et archive
iOS pour TestFlight, environnement/API et incrémentation existants). Le profil
production lui-même n'est pas modifié. Ne pas distribuer ce build en production
sans la recette physique et les déclarations Play nécessaires.

### Solution appliquée et fichiers

- `eas.json` active les deux options non secrètes de build dans ce seul profil :
  plein écran Android et transport Firebase iOS. L'enregistrement v5 du backend
  et les identifiants APNs dans Firebase restent des prérequis externes.
- `scripts/configure-ride-alert-build.cjs`, raccordé au hook
  `eas-build-post-install` de `package.json`, applique le plugin au manifeste
  Android après installation des dépendances. Ceci est nécessaire puisque le
  projet natif est versionné et qu'EAS ne relance pas ses plugins automatiquement.
  La permission et la métadonnée sont ajoutées en mode activé ; en mode désactivé,
  la permission est retirée et la métadonnée repasse à faux. Aucun prebuild global,
  remplacement de clé ni modification des autres permissions. Le traitement iOS
  n'écrit pas dans Android. Une plateforme EAS absente/inconnue arrête le hook.
- `DriverAlertModule.java` expose séparément l'accord du conducteur, l'accès
  spécial Android et l'autorisation générale de notifications. Il ouvre directement
  l'écran Android dédié depuis l'activité courante, uniquement sur action explicite,
  et ne mémorise pas l'accord si l'ouverture échoue. Retour standard vers Zwanga
  avec le bouton/geste Retour ; pas de promesse de retour automatique au simple
  changement d'interrupteur dans les réglages.
- `DriverFullScreenPreference.tsx`, dans **Profil → Alertes conducteur**, explique
  l'option par une boîte de dialogue native de l'application avant « Continuer ».
  Ce dialogue explicatif n'est pas une permission Google ni une imitation de celle-ci.
  Sur Android 14+, le système décide dans son écran d'accès spécial. Au retour,
  les autorisations sont relues ; un accord local sans permission système affiche
  « Autorisation Android à activer », pas un faux succès. Refus, désactivation,
  changement de compte, arrière-plan, démontage et réponses tardives sont protégés.

### Commandes de build et prérequis

```sh
eas build --platform android --profile ride-alerts-test
eas build --platform ios --profile ride-alerts-test
```

Ces commandes ne publient pas automatiquement en production. La soumission aux
pistes de test se fait séparément. Un build avec `--profile production` n'active
pas ces nouvelles options par ce profil. Aucun build EAS n'a été lancé ici.

Pour iOS : backend v5 compatible sur l'environnement visé, configuration APNs
dans Firebase et résolution CocoaPods sur macOS obligatoires. Le serveur préparé
précédemment n'a pas été déployé dans cette session ; ne pas conclure que les
notifications fonctionneront avec un ancien serveur. La permission Apple de
notifications reste nécessaire ; aucun CallKit/PushKit ni faux appel n'est ajouté.

### Vérifications et limites

- Sélection finale : **94 tests mobiles ciblés réussis, aucun échec** : génération réelle
  du manifeste dans un dossier temporaire, activation/réversibilité/idempotence,
  isolation du profil de test, consentement, refus, révocation, retour des réglages,
  changement de compte, notification/sonnerie existantes et transport iOS.
  Le nouveau scénario de raccordement Notifee aux alertes dispatch/réservation/
  proximité, avec/sans premier plan, est inclus. Les exécutions intermédiaires
  de 93 puis 44 tests se recouvrent ; elles ne s'ajoutent pas à ce total.
- TypeScript mobile, ESLint ciblé (sans avertissement), frontières réseau,
  limite de taille des sources et `git diff --check` : réussis. Résolution réelle
  de la configuration Expo avec les deux options de test : activées.
- Compilation Android `:app:compileDebugJavaWithJavac --offline` réussie en
  4 min 12 s, après accès au cache Gradle local hors bac à sable. Cela vérifie le
  code Java/Kotlin, pas une archive release ni le déclenchement sur écran verrouillé.
- L'essai initial de compilation Android sous bac à sable n'a pas pu accéder à
  la distribution Gradle (réseau refusé). Ce n'est pas un échec du code Java.
- Aucun essai sur appareil réel, aucune mesure de latence/batterie, aucune
  certification d'absence de crash. iOS ne fournit pas une permission générique
  permettant à une notification de covoiturage d'ouvrir l'app en plein écran.

Références : [accès spécial Android 14](https://source.android.com/docs/core/permissions/fsi-limits),
[consentement et déclarations Play](https://support.google.com/googleplay/android-developer/answer/13392821?hl=en-GB10-1),
[permission de notifications Apple](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications),
[configuration Firebase/APNs](https://firebase.google.com/docs/cloud-messaging/ios/get-started).

## Autorisations contextuelles — 22 octobre 2026

### Problème et solution appliquée

Le parcours « Profil → Alertes conducteur » était trop difficile à découvrir.
La demande finale exclut un bouton supplémentaire sur l'accueil et préfère une
proposition contextualisée après publication ou lors d'une visite ultérieure.

- `components/DriverPermissionsCoordinator.tsx`, monté dans `ReduxProvider.tsx`,
  vérifie le conducteur du compte authentifié à partir du profil serveur déjà en
  cache. Aucun appel réseau supplémentaire : les caches d'activité, de trajets,
  de réservations et d'offres dispatch sont seulement observés.
- `hooks/notifications/useDriverPermissionPrompt.ts` et
  `features/permissions/driverPermissionRepository.ts` enregistrent la première
  visite et la première publication **observées sur cette installation**. La
  première visite sans publication reste silencieuse. Une visite suivante attend
  15 secondes continues au premier plan ; une interruption remet le délai à zéro.
  La publication réussie peut déclencher sans ce délai, mais seulement après la
  fermeture du retour de succès et le retour sur un écran calme (accueil/liste de
  trajets). Un formulaire de publication toujours ouvert n'est jamais recouvert.
- `services/driverPermissionOnboarding.ts` relie les publications à ce suivi local.
  `hooks/publish/usePublishSubmission.ts` ne signale qu'une création réussie ou
  réconciliée, simple ou récurrente. Une erreur de stockage de cette préférence ne
  transforme jamais une publication réussie en échec.
- Les autorisations manquantes sont proposées séparément : localisation en
  arrière-plan, puis plein écran sur les builds Android compatibles lorsque les
  notifications sont autorisées. « Autoriser » est l'action principale ; « Plus
  tard » et le retour Android ferment librement la proposition. Une réservation
  persistée de l'affichage évite les boucles après un redémarrage : au plus une
  proposition par autorisation et par visite, et pas de nouveau rappel avant
  24 heures. Cette temporisation commence à la réservation de l'affichage, donc
  une interruption à cet instant peut différer la proposition plutôt que gêner
  l'utilisateur. Aucune autorisation système n'est accordée par le simple affichage.
- `components/permissions/DriverFullScreenApproval.tsx` est une feuille sobre,
  défilable, avec icône, explication courte et deux choix. Elle ouvre directement
  l'accès Android existant après le clic, sans seconde confirmation de l'app.
  `useDriverFullScreenPermission.ts` mutualise la lecture et la validation native
  avec le réglage manuel `DriverFullScreenPreference.tsx`. Les autorisations sont
  relues au retour ; ouvrir les réglages ne suffit pas à afficher un succès.
- `BackgroundLocationApproval.tsx` accepte une priorité d'affichage optionnelle.
  Le coordinateur réutilise `useNearbyLocationPermission`, sa divulgation de
  collecte en arrière-plan, ses étapes système et sa gestion des refus. Il ne
  lance pas lui-même le GPS : `deferTrackingToCoordinator: true` laisse cette
  responsabilité au coordinateur de présence existant.
- `HomeHeader.tsx` ne monte plus le raccourci clignotant de permission et
  `HomeDashboard.tsx` ne lui transmet plus les propriétés correspondantes.
  Notifications, initiale du profil et recentrage de la carte sont conservés.
  Le composant historique est conservé mais non monté ; le réglage manuel de
  localisation dans Profil reste accessible.

### Précautions et comportements conservés

- Aucun modal pendant une course en cours, une demande/alerte entrante, une
  résolution d'entrée, un paiement, un formulaire ou une activité non vérifiée
  depuis le retour au premier plan. Un autre dialogue empêche le démarrage du
  parcours ; les confirmations et urgences restent prioritaires ensuite.
- Les modals sont rendus dans le gestionnaire d'overlays de l'app (`RideModal
  inApp`), pas dans une seconde fenêtre UIKit. L'étape sélectionnée et le hook de
  localisation survivent à l'aller-retour dans les autorisations du téléphone.
- Isolation par compte et version de session ; lectures/actions tardives après
  déconnexion, changement de rôle, démontage ou arrière-plan neutralisées. Une
  ancienne action de bouton ne peut pas ouvrir une permission après arrivée d'une
  course prioritaire.
- Écritures locales sérialisées, lectures/écritures bornées à 2 secondes chacune,
  un seul minuteur de présence, pas de polling. Un stockage invalide/indisponible
  suspend ce parcours facultatif, jamais l'accès à l'application.
- Les accès déjà accordés ne sont pas redemandés. Une découverte locale désactivée
  volontairement dans Profil n'est pas réactivée automatiquement quand la
  permission système existe déjà. Les fréquences GPS et le suivi des trajets en
  cours ne sont pas modifiés.

### Vérifications réalisées et limites

- 124 tests JavaScript ciblés réussis dans l'exécution finale : déclenchement,
  publication, refus/report, interruption, rôle/compte, modals, localisation,
  fullscreen, profil de build et non-régression de l'accueil. Ce total inclut les
  18 tests des deux nouvelles suites, dont lecture fullscreen tardive, démontage
  pendant la réservation locale et présentation facultative du modal. Les
  exécutions intermédiaires se recouvrent et ne doivent pas être additionnées.
- TypeScript `tsc --noEmit`, ESLint ciblé sans avertissement, contrôle des frontières
  réseau, limite de taille des sources et `git diff --check` réussis.
- Aucun essai de ce nouveau parcours sur appareil physique, aucune mesure native
  de consommation, aucun nouveau build/déploiement. À tester avec le profil
  `ride-alerts-test` : première publication, sortie/retour après 15 secondes,
  refus, retour sans choix, autorisation, demande entrante pendant le modal,
  compte passager et changement de compte.
- La première publication historique du compte n'est pas connue sans information
  serveur : le repère est local et peut être perdu après réinstallation. Ce choix
  évite une lecture métier supplémentaire pour une proposition facultative.
- Android décide de son écran d'accès spécial et de l'affichage sur écran verrouillé.
  Le retour utilise le geste/bouton Retour ; il n'est pas forcé au changement de
  l'interrupteur. iOS n'a pas de permission générique équivalente au plein écran :
  seule la proposition de localisation s'y applique. Les refus définitifs de
  localisation conservent le parcours existant avec explication avant les réglages.
  Aucun contournement du système, du verrouillage ou du mode silencieux n'est ajouté.
