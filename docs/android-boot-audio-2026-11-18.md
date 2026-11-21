# Android : services audio et démarrage du téléphone — 18 novembre 2026

## Signalement et périmètre

Google Play signale deux points d'entrée de services restreints au démarrage :
`expo.modules.audio.service.AudioControlsService.postOrStartForegroundNotification` et
`expo.modules.audio.service.AudioRecordingService.startForegroundWithNotification`.

Pour une application ciblant Android 15+, lancer un service `mediaPlayback` depuis un récepteur `BOOT_COMPLETED` est interdit ; la restriction du type `microphone` existe depuis Android 14. Une tentative interdite peut produire `ForegroundServiceStartNotAllowedException`. Référence : [changements Android 15](https://developer.android.com/about/versions/15/behavior-changes-15#fgs-boot-completed).

L'utilisateur identifie le binaire concerné comme **Android 1.0.19, code 185**. Travail limité au projet mobile et à sa configuration Android, sans modification du backend, de la base, des dépendances ou de la version Expo, sans déploiement ni soumission Google Play. L'AAB exact du build 185 n'a pas été fourni ni inspecté : les constats de code ci-dessous portent sur le dépôt et les dépendances actuellement installées. Le correctif local ne modifie pas ce binaire déjà publié.

## Constat vérifié dans les sources actuelles

- `expo-audio` installé : **1.1.1**. Son manifeste de bibliothèque déclare les deux services, avec les types `mediaPlayback` et `microphone`, même sans utilisation applicative de ces fonctionnalités.
- Le plugin fourni avec cette version ne propose pas l'option `enableBackgroundPlayback` des versions récentes. Ajouter cette option à cette ancienne version ne suffirait pas à retirer son service. La décision se fonde sur le code installé, pas sur la documentation d'un autre SDK.
- Le seul lecteur `expo-audio` applicatif se trouve dans la branche iOS de `services/foregroundRideSound.ts`, avec `shouldPlayInBackground: false`. Aucun usage applicatif d'enregistrement Expo ou de commandes multimédias d'écran verrouillé n'a été trouvé.
- Android utilise `com.zwanga.notifications.RideAlertAudioService` et son lecteur natif pour les alertes. Les anciens binaires disposent d'un repli par notification. Ces chemins ne nécessitent pas les deux services Expo signalés.
- Les déclarations de récepteurs au démarrage des bibliothèques de notifications et de tâches ne démontrent pas à elles seules un appel réel aux deux services Expo. Le signalement Play est pris en charge par leur retrait puisqu'ils sont inutilisés ; les traces fournies ne prouvent pas cette chaîne d'appel.

## Correctif appliqué

- `plugins/withUnusedExpoAudioServicesRemoved.js`, enregistré depuis `app.plugin.js`, ajoute deux règles de fusion `tools:node="remove"` avec les noms qualifiés exacts. Ces règles suppriment les déclarations de bibliothèque au prochain build. Elles sont idempotentes et ne contiennent ni ancien filtre d'intention ni attribut contradictoire.
- `android/app/src/main/AndroidManifest.xml`, versionné dans ce dépôt, contient les mêmes règles pour les builds qui ne refont pas de prebuild.
- Le mécanisme officiel est décrit dans [la fusion des manifestes Android](https://developer.android.com/build/manage-manifests#node_markers). Aucun fichier de `node_modules` n'est modifié ; une réinstallation ne doit pas réintroduire ces services dans le manifeste final.
- `tests/androidUnusedAudioServices.test.js` protège le plugin, son raccordement, l'idempotence, les deux ordres d'application avec le plugin d'alertes, le miroir natif et la conservation des composants/permissions utiles. Les assertions sur le manifeste réel ne recopient pas ses paramètres privés dans les sorties de test.
- `GOOGLE_PLAY_FOREGROUND_SERVICE_DECLARATION.md` et `GOOGLE_PLAY_FORM_RESPONSES.md` ne prétendent plus que `FOREGROUND_SERVICE_MEDIA_PLAYBACK` est bloqué ou inutilisé. La déclaration doit correspondre au service réel d'alerte Zwanga, et son approbation reste du ressort de Google.

## Comportements conservés

- Service audio Zwanga, permission `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, notification persistante, plein écran, canaux, délais et actions d'acceptation/refus inchangés.
- Récepteurs `BOOT_COMPLETED`, permissions et services de localisation inchangés. Aucune suppression globale de `RECEIVE_BOOT_COMPLETED`.
- Permission microphone conservée pour les autres modules qui pourraient en avoir besoin ; retrait ciblé du service d'enregistrement Expo uniquement.
- iOS : aucun changement de permission, de session vocale, du lecteur ou du mode audio de fond ajouté précédemment.
- Pas de contournement des restrictions Android, pas de baisse du SDK cible, pas de lancement différé artificiel d'un service interdit au démarrage.
- Limite pour les évolutions futures : activer l'enregistrement Expo en arrière-plan ou ses commandes audio d'écran verrouillé sur Android nécessitera de revoir cette politique et de tester leurs conditions de démarrage. Ces fonctionnalités ne sont pas utilisées actuellement ; l'initialisation native d'`ExpoAudio` inspectée ne lance pas ces services.

## Lecture distincte des trois traces jointes

| Trace | Observation réelle du thread principal | Limite du diagnostic |
| --- | --- | --- |
| 1 | Attente Binder dans `IActivityManager.unbindService`, via Google Play Services Cloud Messaging. | Pas de preuve d'un démarrage des services audio ; besoin du motif ANR, du contexte et du build pour identifier la cause. |
| 2 | Attente de rendu dans `RenderProxy.setStopped` / `HardwareRenderer`, avec attente de tampon graphique côté RenderThread et bibliothèque EGL du fournisseur. | Blocage graphique à investiguer séparément ; la trace seule ne permet pas d'accuser une carte, une animation ou le code audio. |
| 3 | Thread principal dans `MessageQueue.nativePollOnce`. | Instantané de boucle d'événements en attente, insuffisant pour identifier le responsable d'un ANR antérieur. |

Aucune de ces trois pièces ne contient `BOOT_COMPLETED`, les deux noms de services Expo ou `ForegroundServiceStartNotAllowedException`. Ce correctif ne doit donc pas être présenté comme la résolution des trois ANR ni comme une disparition démontrée des crashs.

## Vérifications

- **45 tests JavaScript réussis, zéro échec, zéro ignoré** : nouvelle politique Android, parité des sources natives, protections des alertes natives, session de sonnerie et reprises iOS. Ils vérifient des contrats/source et des I/O simulées, pas un redémarrage physique.
- ESLint ciblé sans erreur ; contrôle de parité natif réussi ; contrôle de taille : **1 411 sources, aucune au-delà de 400 lignes** ; `git diff --check` sans erreur.
- Le premier passage avait une assertion trop stricte sur l'ordre des services du manifeste ; elle a été corrigée pour comparer seulement les composants concernés, sans afficher le manifeste complet. Les 45 tests ont ensuite été relancés avec succès.
- La première tentative Gradle a échoué avant la fusion : le wrapper tentait un téléchargement interdit dans l'environnement. La seconde, avec Gradle 8.14.3 déjà installé et son cache local, a généré le bundle JavaScript Android (3 487 modules), mais a échoué sur le prédicat `onlyIf` de `ReactAndroid:hermes-engine:downloadHermes`. Elle ne valide donc pas le build natif. Le mode release de ce dépôt reconstruit React Native/Hermes depuis les sources ; cette dépendance est distincte du retrait des deux services Expo.
- **Fusion release vérifiée** : Gradle a ensuite terminé `:app:processReleaseMainManifest` avec `BUILD SUCCESSFUL`. Ce contrôle a exclu, uniquement en arguments de commande, les tâches `:react-native:packages:react-native:ReactAndroid:preBuild` et `:react-native:packages:react-native:ReactAndroid:hermes-engine:preBuild` qui préparent la compilation C++. Le bundle et les autres ressources ont été conservés, et les dépendances Android manquantes ont été récupérées. Aucun changement de configuration Gradle ou de version des dépendances n'a été appliqué. **Ce résultat n'est pas une compilation native complète ni une production d'AAB.**
- Lecture et assertions indépendantes sur `android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml` : les deux services Expo sont absents ; `RideAlertAudioService` reste de type `mediaPlayback`, `LocationTaskService` de type `location`, le service Notifee de type `shortService`. Les permissions de démarrage, de lecture audio et de localisation, ainsi que les cinq récepteurs de `BOOT_COMPLETED`, sont présents. Le contrôle n'affiche aucun paramètre privé du manifeste.
- Limites et essais intermédiaires : exclure aussi le bundle empêchait Gradle de résoudre ses fournisseurs de ressources ; le contrôle suivant, hors ligne, a buté sur des AAR absentes du cache. Ces deux essais ne sont pas comptés comme réussis. Lors de l'essai final, PowerShell a signalé un `NativeCommandError` pour l'avertissement Expo `NODE_ENV` non défini, malgré la terminaison réussie annoncée par Gradle. La vérification indépendante du XML a ensuite terminé avec un code zéro. Cela ne vaut pas validation des variables du prochain build de production.
- Après la reprise, les **mêmes 45 tests** ont été relancés avec succès, y compris le contrôle du raccordement de `app.plugin.js` dans `app.config.js` ; ils ne sont pas additionnés aux résultats précédents.
- Le contrôle intégral de livraison de plus de 4 000 tests réalisé lors de l'intervention précédente n'est pas annoncé comme relancé pour ce correctif ciblé.

## Avant soumission

1. Produire un **nouveau binaire Android** : une mise à jour JavaScript OTA ne peut pas modifier le manifeste du binaire publié.
2. Inspecter le manifeste final de l'AAB/APK : absence des deux services Expo, présence du service audio Zwanga et de ses permissions, localisation et récepteurs nécessaires conservés. Ne pas confondre les marqueurs du manifeste source avec les services effectivement empaquetés.
3. Sur un appareil de test Android 15 puis 16, avec backend de test : redémarrage sans trajet, puis redémarrage avec une session de test autorisée, absence de démarrage audio automatique/crash ; réception d'une nouvelle commande après redémarrage, carte persistante et son selon les permissions du système.
4. Tester écran verrouillé, autre application, retour dans Zwanga, accepter/refuser/expiration, mode silencieux et notification désactivée. Vérifier le suivi GPS, sans envoyer d'alerte à des comptes réels.
5. Vérifier le nouvel artefact dans Play Console. Le retrait local ne prouve ni la disparition de l'avertissement sur un ancien artefact actif ni l'approbation de la déclaration de service.
