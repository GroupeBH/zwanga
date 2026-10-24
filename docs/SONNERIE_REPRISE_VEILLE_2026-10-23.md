# Reprise sonore iOS et réveil Android — 23 octobre 2026

## Périmètre et constat

Signalements utilisateur : la notification apparaît et sonne sur l’iPhone
verrouillé, puis reste silencieuse après ouverture de la demande ; certains
Android ne réveillent pas leur écran. Aucun de ces signalements n’a été reproduit
sur appareil physique pendant cette intervention. Les modèles/builds Android
concernés et leurs réglages ne sont pas encore connus.

L’inspection a identifié des chemins susceptibles d’expliquer ces symptômes :

- Le gestionnaire Notifee d’un toucher en arrière-plan ouvrait un lien sans
  conserver le contenu de la notification. La carte peut ne plus être présente
  lorsque les hooks d’authentification/navigation prennent le relais.
- La reprise du lecteur après `inactive` attendait l’énumération des cartes ;
  sur iOS, un second fournisseur Notifee était lu pour une restauration déjà
  effectuée via Expo et le centre de notifications iOS.
- Le lecteur Expo conservait un objet sans vérifier si sa lecture s’était
  réellement interrompue. Le contrôle de santé existait seulement pour le
  lecteur Android natif.
- La condition Android de plein écran exigeait `isKeyguardLocked()`. Elle
  excluait un écran éteint sans verrouillage (délai de verrouillage ou appareil
  sans verrouillage), même avec consentement et autorisation plein écran.

Ces chemins sont constatés dans le code ; leur rôle exact sur les téléphones
signalés reste à confirmer par essais natifs.

## Solution appliquée

- `services/notifeeBackgroundHandler.ts` : conserve un toucher simple dans le
  tampon existant avant le lien de navigation. Il ne conserve pas une décision
  Accepter/Refuser à rejouer ; ces actions gardent leur traitement dédié.
- `hooks/notifications/useRideRinging.ts` : sur iOS, réconcilie immédiatement
  les alertes déjà connues à l’activation/au montage ; utilise uniquement
  l’énumération Expo pour la restauration iOS. Le protocole de transfert Android
  et les garde-fous de session restent inchangés.
- `services/foregroundRideSound.ts` : adapte le lecteur Expo au contrôle de santé
  existant avec `isLoaded`/`playing`. Une lecture perdue entraîne une libération
  et une reprise bornée, au plus trois échecs par épisode, avec temporisation.
  Les pauses détenues par la synthèse vocale ne sont pas traitées comme des pannes.
- `native/android/notifications/DriverAlertModule.java` et son miroir
  `android/app/src/main/java/com/zwanga/notifications/DriverAlertModule.java` :
  autorisent la présentation éligible lorsque le téléphone est verrouillé **ou**
  lorsque l’écran n’est pas interactif. Un écran allumé et déverrouillé n’est pas
  couvert par cette condition.

## Comportements conservés et limites

- Aucun toucher simple n’accepte ni ne refuse une demande. Une décision confirmée
  arrête uniquement l’alerte correspondante ; une erreur de mutation reste une
  erreur. Aucun nouveau débit, appel réseau, mécanisme de polling serveur ou
  changement backend n’a été ajouté.
- Son en premier plan uniquement pour le lecteur applicatif iOS ; arrêt en
  arrière-plan/inactivité, puis reprise des alertes en mémoire au retour actif.
  Aucun faux appel VoIP, mode audio arrière-plan ni contournement du silencieux.
- `ringUntil` n’est ni prolongé ni remplacé : une notification nouvellement
  restaurée après sa fenêtre sonore reste silencieuse, même si sa demande est
  encore consultable. Une alerte déjà mémorisée conserve son comportement
  antérieur jusqu’à la décision ou son expiration métier. Réarmer une ancienne
  notification à partir d’une validation serveur fraîche est une évolution
  distincte, non appliquée ici.
- Android conserve les contrôles de build, consentement, autorisation système,
  notifications/canal, mode sonore et Ne pas déranger. Pas de réveil forcé via
  un nouveau WakeLock, pas de volume imposé, pas de modification de manifeste.
  L’artefact debug local contient déjà la permission `WAKE_LOCK` par fusion des
  dépendances ; cela ne valide pas l’artefact installé chez l’utilisateur.
- Le plein écran reste désactivé dans le manifeste source ordinaire ; sa
  configuration dépend du build existant. Le correctif ne l’active pas sur tous
  les appareils. Le réveil standard Notifee reste utilisé lorsque éligible.
- Un nouveau binaire Android est nécessaire pour le changement Java. Ni le
  réveil sur chaque fabricant, ni une sonnerie sans coupure au déverrouillage
  iOS ne sont garantis par les tests JavaScript.

Références : [événements Notifee](https://notifee.app/react-native/docs/events/),
[interactions iOS](https://notifee.app/react-native/docs/ios/interaction/),
[limites plein écran Android](https://source.android.com/docs/core/permissions/fsi-limits),
[sons de notification Apple](https://developer.apple.com/documentation/usernotifications/unnotificationsound).

## Vérifications réalisées

- 160 tests ciblés réussis, aucun ignoré : notifications/actions, restauration,
  session/sonnerie, voix, permissions plein écran et parité des sources natives.
- `tests/iosRingingWake.test.js` exécute les vrais hooks/services avec I/O natifs
  simulés : carte retirée après toucher, demande et réservation, retour depuis
  `inactive` malgré une lecture bloquée, restauration sans toucher, ancienne
  alerte silencieuse, lecture interrompue, pause vocale et arrêt après décision.
- `tests/rideScreenWakeNative.test.js` compile/exécute la méthode Java réelle
  d’éligibilité avec substituts système : écran éteint non verrouillé, verrouillé,
  écran allumé déverrouillé, autorisation/consentement/build refusés et services
  absents. Ce n’est pas une compilation complète Android ni un essai écran réel.
- TypeScript sans émission, parité natif/plugin, taille des sources et
  `git diff --check` réussis.
- ESLint ciblé : aucune erreur, deux avertissements préexistants dans le
  gestionnaire Notifee (`require` facultatif et variable `catch` inutilisée).

À tester avec les prochains binaires : iPhone verrouillé, ouverture au toucher
et après déverrouillage simple, réponse acceptée/refusée, expiration et fermeture
de l’app ; Android écran éteint avec/sans verrouillage, permission plein écran
accordée/refusée, Ne pas déranger et réglages d’économie d’énergie du fabricant.
Aucun déploiement, aucun push réel et aucune action sur un trajet réel effectués.
