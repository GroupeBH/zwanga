# Sonneries des demandes — 8 octobre 2026

## Constat et périmètre

La sonnerie PCM `driver_ring.wav` de 29 secondes était déjà embarquée dans les
projets natifs et configurée pour `driver_dispatch_offer` (invitation ciblée au
conducteur proche) et `new_booking` (réservation d'un trajet publié). En revanche,
`trip_request_accepted`, envoyé au passager après acceptation, utilisait le son
standard. L'enregistrement de compatibilité des installations et les invitations
de réservation dépendaient aussi de l'activation de l'allocation de proximité.

Une annonce générale `trip_request` est distincte d'une invitation de proximité :
elle peut être envoyée à tous les conducteurs. Elle reste standard pour ne pas
faire sonner longuement des conducteurs qui ne sont pas les destinataires ciblés.
La sélection du conducteur proche, la fraîcheur GPS et les échéances serveur ne
sont pas modifiées. Aucun incident de son de production reproduit physiquement.

## Solutions appliquées et fichiers

Backend `../zwanga-backend` :

- `src/notifications/notifications.service.ts` : mutualisation de la lecture de
  compatibilité liée au compte et au token push courant ; `trip_request_accepted`
  utilise le son embarqué pour une installation v2, indépendamment du rôle du
  passager. Sur Android, alerte FCM avec canal `booking-ring-v2`, son `driver_ring`,
  priorité haute, contenu privé sur écran verrouillé et identifiant de remplacement
  par demande. Sur iOS/Expo, `driver_ring.wav` et interruption `time-sensitive`.
  Durée de validité transport de cette confirmation : 60 secondes, distincte de
  la durée du son et de l'historique en base. Le passager n'obtient aucun bouton
  Accepter/Refuser ni protocole d'action conducteur.
- `src/trip-requests/dispatch/dispatch.service.ts` : l'enregistrement de capacité
  est possible pour un passager même si l'allocation de proximité est désactivée.
  Les réservations publiées ne dépendent plus de ce drapeau pour leurs actions
  et leur son. Le drapeau continue de contrôler les invitations de proximité.
  Pas de nouvelle migration, de requête SQL modifiée ou de déclenchement du dispatch.
- `src/notifications/driver-action-notifications.spec.ts` : tests de transport,
  compatibilité v0/v1/v2, destinataire passager, indépendance du drapeau et maintien
  des alertes générales standard.

Mobile :

- `features/notifications/rideSound.ts` identifie uniquement la confirmation
  distante portant `ringAlert: request-accepted-v1`.
- `features/notifications/driverInvitation.ts` reconnaît ce marqueur dans les
  enveloppes brutes Expo/FCM sans le transformer en invitation conducteur.
- `services/backgroundNotificationTask.ts` laisse APNs/FCM afficher cette alerte
  et jouer son son, sans recréer une notification locale avec le son par défaut.
  Les invitations Android restent data-only, affichées par Notifee avec leurs actions.
- `services/driverNotifications.ts` adapte le nom visible du canal existant.
  Son identifiant et sa configuration sonore sont conservés ; les préférences
  système de l'utilisateur ne sont pas réinitialisées.
- `tests/requestAcceptanceSound.test.js` et `tests/driverNotifications.test.js` :
  enveloppes, absence de doublon en arrière-plan, canal long indépendant du rôle,
  navigation vers la demande ou le trajet déjà créé et conservation des autres push.

## Comportements conservés et compatibilité

Les deux chemins serveur d'acceptation (direct et dispatch transactionnel)
envoyaient déjà `trip_request_accepted` au passager : leurs mutations, destinataires
et garanties d'idempotence restent inchangés. La notification confirme une
acceptation serveur, pas un simple appui sur le téléphone du conducteur.

La capacité v2 est déjà annoncée automatiquement par les clients compatibles,
après configuration des catégories, du canal et de la tâche de fond. Pas d'étape
d'adhésion ajoutée. Sans capacité enregistrée pour le token courant, le serveur
conserve une notification standard, plutôt que demander un son inexistant sur un
ancien binaire. Les migrations existantes du dispatch doivent déjà être installées.

Aucune dépendance, son, permission, écran, webhook ou connexion socket ajouté.
Les réglages silencieux/volume/Focus et restrictions d'arrière-plan restent sous
contrôle du système ; ni le son audible ni la livraison à la seconde ne sont garantis.
Le fichier dure **29 secondes**, pas une boucle illimitée : Apple exige moins de
30 secondes. [Documentation Apple](https://developer.apple.com/documentation/usernotifications/unnotificationsound).
Les réglages sonores d'un canal Android existant ne sont pas réécrits par sa
recréation. [Documentation Notifee](https://notifee.app/react-native/reference/androidchannel/).

## Vérifications effectuées

- 41 tests JavaScript mobiles ciblés réussis : son natif embarqué (PCM/durée et
  correspondance Android), actions conducteur, enregistrement, réception et navigation.
- 86 tests backend du dossier notifications réussis, avec transports simulés,
  dont 12 tests de transport/actions dans `driver-action-notifications.spec.ts`.
- TypeScript mobile et backend avec `tsconfig.build.json` : réussis sans émission.
- ESLint mobile ciblé : zéro erreur, deux avertissements préexistants dans
  `backgroundNotificationTask.ts` (import conditionnel et variable de catch inutilisée).
- Frontière réseau et contrôle des 1 043 sources mobiles : réussis.
- Contrôle TypeScript backend englobant tous les tests : échec dans des tests
  non modifiés (`activity`, `keccel-otp`, `payments`, `trip-request-privacy`,
  `legal-identity`, `user-gender`, `trip-loyalty`). Ces erreurs de fixtures ne sont
  pas corrigées dans ce périmètre. Le contrôle du code de production réussit.
- Aucun push réel, compte réel, déploiement, build natif ou test acoustique physique
  exécuté. Ces tests ne prouvent pas qu'un téléphone de production sonne 29 secondes.

## Mise en service et recette

Déployer le backend corrigé selon la procédure habituelle (aucun déploiement ici).
Distribuer le client corrigé. Pour un ancien binaire n'embarquant pas la sonnerie,
une mise à jour JavaScript seule ne suffit pas ; un nouveau build natif est requis :

```sh
eas build --platform android --profile production
eas build --platform ios --profile production
```

Avec deux appareils physiques de test et des installations compatibles :

1. Ouvrir les apps, autoriser les notifications, laisser l'enregistrement push se
   terminer ; vérifier les réglages du canal Android et des sons iOS.
2. Conducteur éligible avec position récente : créer une demande immédiate proche,
   puis vérifier l'invitation ciblée, sonnerie longue et actions Accepter/Refuser.
3. Accepter : vérifier que **le passager** reçoit une seule alerte sonore longue ;
   son appui ouvre la demande, ou le trajet s'il existe déjà.
4. Refaire avec app ouverte, en arrière-plan et écran verrouillé ; accepter/refuser
   avant expiration, tester l'expiration et la reconnexion. Un arrêt forcé Android
   n'est pas équivalent à une simple mise en arrière-plan.
5. Vérifier une réservation publiée et un message normal : actions et son dédié
   conservés pour la réservation, son standard pour le message et l'annonce générale.

Un canal désactivé/silencieux doit être réactivé volontairement par l'utilisateur,
pas contourné par la création répétée de canaux. Ne pas promettre une sonnerie
audible en mode silencieux ou une position conducteur actualisée quand l'OS bloque
la collecte. Pas de certification physique iOS/Android réalisée à ce stade.

## Complément — Sonnerie en arrière-plan et arrêt à l'ouverture

### Constat et choix validé le 8 octobre 2026

Le titre signalé est « Demande à proximité / proposition à proximité », pas
l'annonce générale envoyée à tous les conducteurs. Le signalement concerne
Android et iOS dans la bêta. L'utilisateur a confirmé : **arrêter dès l'ouverture
de Zwanga**, même depuis l'icône de lancement. Si une invitation arrive alors que
l'app est déjà ouverte, l'écran existant la présente sans sonnerie prolongée.
Cette règle remplace l'idée précédente de boucler un lecteur audio dans l'écran.

Constats du code, distincts d'une reproduction sur téléphone :

- Android ne demandait pas `loopSound` et une réservation sans `expiresAt` n'avait
  pas de limite native d'affichage. Un doublon pouvait actualiser cette limite.
- L'enregistrement v2 sur iOS était abandonné si l'enregistrement de la tâche de
  fond échouait, alors que l'alerte sonore APNs et le pont Notifee n'en dépendent
  pas. Cela peut maintenir le repli serveur sur le son standard ; ce scénario
  n'a pas été établi sur le téléphone bêta signalé.
- Le fichier source et sa copie Android sont bien du PCM mono 22 050 Hz, 16 bits,
  d'une durée mesurée de 29 secondes. Cela ne prouve pas leur présence dans le
  binaire actuellement installé depuis le store.

### Corrections effectivement appliquées

- `services/driverNotifications.ts` : notification Android prioritaire existante
  avec `loopSound`, `ongoing`, `lightUpScreen` et `autoCancel`. `timeoutAfter`
  est géré nativement et borné à 30 secondes ou à l'échéance plus proche. Aucun
  minuteur JavaScript en arrière-plan, service audio permanent ou dépendance ajouté.
  Déduplication bornée à 100 entrées par processus, liée au destinataire/session ;
  un doublon ne réinitialise plus la sonnerie. Le serveur fournit aussi une
  échéance absolue pour éviter un nouveau délai complet après un redémarrage.
  Contrôles supplémentaires si l'app passe au premier plan pendant l'affichage.
- `features/notifications/driverRinging.ts` et `driverInvitation.ts` : durée
  sonore séparée de l'expiration métier, lecture de `ringUntil`, échéances invalides
  silencieuses et délais plus courts respectés sur Android.
- `hooks/notifications/useDriverNotifications.ts` : retrait ciblé des alertes
  d'invitation au démarrage/reprise, sans envoyer de décision au serveur. Lecture
  des enveloppes Expo au premier plan conservant le routage de l'invitation.
  `components/NotificationHandler.tsx` supprime le son iOS de ces invitations au
  premier plan ; aucun lecteur audio de remplacement n'est démarré.
- `app/incoming-driver.tsx` : nettoyage également à la perte de focus et sur la
  fermeture explicite. Accepter/Refuser et le contrôle d'autorisation restent
  inchangés. Ouvrir/quitter l'app ne signifie pas accepter ou refuser.
- `hooks/auth/usePushRegistration.ts` : iOS annonce v2 même si l'enregistrement
  Expo de tâche de fond retourne false. Android continue d'exiger cette tâche
  avant d'annoncer la compatibilité data-only. Réessais et liaison au token courant
  conservés. `types/notifee.d.ts` décrit la méthode native existante
  `getDisplayedNotifications`, auparavant absente de la déclaration locale.
- Backend `src/notifications/notifications.service.ts` : invitations v2 avec
  `ringUntil = min(maintenant + 30 s, expiration de l'offre)` et TTL FCM/Expo
  correspondant. Les réservations ne deviennent **pas** expirées à la fin du son.
  Pas de migration, de changement de sélection du conducteur ou de commission.
- Tests : `tests/driverNotifications.test.js`, `driverNotificationResponse.test.js`,
  `pushRegistration.test.js` et, côté backend,
  `src/notifications/driver-action-notifications.spec.ts`.

### Comportements conservés et limites

Les messages, annonces générales, notifications de revenus et alertes au passager
après acceptation gardent leurs parcours existants. Pas de nouvel écran d'adhésion,
de socket de fond, de webhook, de CallKit/PushKit ou de permission Android
`USE_FULL_SCREEN_INTENT`. Le canal `booking-ring-v2` est conservé : ses réglages
ne changent pas, seule la notification devient répétitive et bornée ; un canal
mis en silencieux par l'utilisateur n'est pas contourné.

Android annule l'alerte native à la limite sonore ; la réservation reste consultable
dans l'app et dans l'historique serveur. Sur iOS, le son de 29 secondes est lu une
seule fois par le système, sans boucle native d'appel ; la carte peut rester dans
le centre de notifications. La suppression à l'ouverture est demandée au système,
mais son effet acoustique réel doit être vérifié sur iPhone. Un TTL borne l'attente
chez le transporteur, pas une garantie d'arrêt audio précis après livraison APNs.
Le serveur refuse toujours les réponses aux offres déjà expirées/traitées.

Les réglages volume, silencieux, Focus/Ne pas déranger, sons autorisés, économie
d'énergie et restrictions constructeur restent déterminants. Les capacités
`time-sensitive` ne sont pas des alertes critiques contournant le mode silencieux.
Les anciens clients non enregistrés v2 gardent volontairement leur compatibilité.
Un arrêt forcé Android n'offre pas les mêmes garanties qu'une app en arrière-plan.

Références : [options Notifee Android](https://notifee.app/react-native/reference/notificationandroid/),
[sons Apple](https://developer.apple.com/documentation/usernotifications/unnotificationsound).

### Vérifications et mise en service

- 67 tests mobiles ciblés réussis : règles de sonnerie, actions, assets natifs,
  enregistrement, navigation et disponibilité automatique du conducteur.
- 94 tests backend du dossier notifications réussis (14 dans la suite de transport
  des invitations). Aucun envoi push réel effectué par ces tests.
- TypeScript mobile et backend avec `tsconfig.build.json` réussis sans émission.
- Lint mobile ciblé (code et tests modifiés) et `git diff --check` réussis.
- Aucun build EAS lancé, aucune signature Apple modifiée, aucun déploiement effectué,
  aucun test physique ou certification du correctif en production.

Déployer le backend corrigé puis reconstruire et distribuer les deux clients :

```sh
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

Le profil `dev` actuel cible le simulateur iOS : ne pas l'utiliser pour conclure
sur la sonnerie réelle. Pour iOS production, le profil de provisioning doit
autoriser la capability Time Sensitive déjà déclarée dans le projet. Après
installation, ouvrir Zwanga connecté et en ligne pour enregistrer le token et
la capacité v2 avant de verrouiller le téléphone.

Recette sur deux appareils physiques de test :

1. Envoyer une invitation de proximité à un conducteur éligible dont la position
   est encore récente, puis une réservation publiée. Vérifier un seul son dédié,
   les actions et la limite d'environ 30 s (29 s côté iOS, éventuellement moins
   sur Android si l'offre expire avant). Ne pas conclure à partir d'un simulateur.
2. Ouvrir par la notification après quelques secondes : vérifier l'arrêt et la
   destination. Refaire en ouvrant par l'icône : vérifier l'arrêt sans réponse
   implicite ; consulter ensuite l'invitation dans l'app.
3. Tester Accepter et Refuser depuis l'alerte verrouillée, l'expiration sans action,
   une réponse tardive, puis une connexion lente. Vérifier la réponse serveur et
   l'alerte passager après acceptation. Aucun succès ne doit être inventé hors ligne.
4. Recevoir une invitation avec Zwanga déjà ouvert : écran de proposition sans
   sonnerie prolongée. Passer ensuite en arrière-plan : aucune relance automatique.
5. Tester sons désactivés/Focus et notifications classiques pour contrôler les
   réglages utilisateur et l'absence de régression. Sur iOS, désactiver aussi
   l'actualisation en arrière-plan et vérifier l'enregistrement v2 en ligne.

En cas de son standard persistant, vérifier dans **le build distribué** la présence
de `driver_ring.wav`, l'enregistrement v2 pour le token courant et les paramètres
du canal/sons iOS, avant toute modification supplémentaire de l'architecture.

## Tester en développement sur téléphone

Le profil `dev-device` ajouté le 8 octobre hérite de `dev` sans changer le profil
simulateur existant ni `production`. Il produit un client de développement pour
distribution interne : APK Android et build iPhone (`simulator: false`).
`expo-dev-client` était déjà une dépendance, aucune installation supplémentaire.
Vérifications locales : 9 tests de versions, profil et assets natifs réussis
(`appVersions.test.js`, `driverNotificationNativeAssets.test.js`) ; contrôle des
différences réussi. Aucun build ni essai sur téléphone exécuté dans cette étape.

Lancer la commande correspondant au téléphone depuis le projet mobile :

```powershell
npx.cmd eas-cli@latest build --platform android --profile dev-device
```

Pour iPhone, enregistrer l'appareil s'il ne l'est pas déjà, puis construire :

```powershell
npx.cmd eas-cli@latest device:create
npx.cmd eas-cli@latest build --platform ios --profile dev-device
```

Le build iOS physique nécessite les droits de signature Apple adaptés et un profil
incluant cet iPhone ainsi que la capability Time Sensitive déjà déclarée.
Les identifiants natifs restent les mêmes : ces builds ne sont pas configurés
pour cohabiter côte à côte avec la bêta store. Utiliser un téléphone de test ; ne
pas désinstaller une application contenant des données locales non sauvegardées
pour contourner un conflit de signature Android.

Installer le build fourni par EAS, puis lancer Metro :

```powershell
npx.cmd expo start --dev-client
```

Alternative Android avec SDK local et téléphone USB en débogage :
`npx.cmd expo run:android --device` compile, installe et démarre le serveur local.
Pas de `prebuild --clean` nécessaire pour ces corrections ; les projets natifs
suivis sont préservés. Ces commandes sont une recette, pas des actions exécutées.

Attention : le choix d'un environnement de développement **ne sélectionne pas à
lui seul le backend de développement**. Contrôler `EXPO_PUBLIC_API_URL` et les
variables nécessaires de l'environnement EAS choisi, sans en publier les valeurs.
L'API locale doit être accessible depuis le téléphone (pas `localhost` du PC ni
l'adresse réservée à l'émulateur). Le backend corrigé doit fonctionner et avoir
ses transports push FCM/APNs/Expo configurés. Ne pas générer de demandes de test
sur la production par erreur.

Ouvrir le client connecté au serveur Metro, se connecter avec un compte de test,
autoriser les notifications et laisser l'enregistrement v2 se terminer. Garder
Metro et le backend accessibles, puis mettre l'app en arrière-plan/verrouiller
le téléphone. Depuis un second compte de test, créer l'invitation de proximité
ou la réservation. Vérifier le son, les deux actions et l'arrêt en revenant via
la notification puis via l'icône. Un client de développement dépendant de Metro
ne remplace pas une recette release autonome avec processus arrêté.

Références : [clients de développement Expo](https://docs.expo.dev/develop/development-builds/introduction/),
[distribution interne et enregistrement iPhone](https://docs.expo.dev/build/internal-distribution/).
