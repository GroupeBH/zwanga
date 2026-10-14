# Android — tâches natives, photos et diagnostic des crashs

Date : 14 octobre 2026. Périmètre : application mobile, correctifs locaux à livrer dans un nouveau build natif.

## Constat et niveau de preuve

L'audit a retrouvé dans le code compilé de l'AAB 159 deux défauts de
`expo-task-manager@14.0.9` : callbacks non supprimés après achèvement et événements
simultanés ajoutés à une liste locale non suivie. La trace de manque de mémoire
accessible concernait cependant la version 146 de l'émulateur, pas un appareil
physique équipé de la 159. Ces défauts ne prouvent pas la cause de chaque fermeture
au lancement ou pendant l'authentification.

Le traitement des grandes photos décodait aussi l'original avant redimensionnement.
Il s'agit d'un risque de pic mémoire constaté dans le code, pas d'une mesure de RAM
sur les téléphones signalés.

## Solutions appliquées

### Gestionnaire de tâches Android

`scripts/patch-expo-task-lifecycle.cjs`, appelé par `postinstall`, corrige la source
native sans changement de version Expo ni nouvelle dépendance :

- suppression du callback avant invocation, donc pas de rétention permanente des
  objets `JobService` / `JobParameters` après achèvement ;
- ajout des événements simultanés à la liste partagée existante ;
- protection des accès concurrents au registre des callbacks et aux opérations
  de comptage/fin de tâche ; handler explicitement attaché au thread principal ;
- éviction des callbacks après le délai natif existant de 15 secondes, sans second
  appel à `jobFinished` et sans déclarer terminée une tâche JavaScript encore active ;
- nettoyage lors d'un échec de chargement du moteur en arrière-plan ou de la
  désinscription globale ; les réponses sans identifiant d'événement sont ignorées.

Les événements restent suivis jusqu'à leur achèvement JavaScript même si leur
callback Android a expiré. Le correctif ne change ni la durée de sonnerie, ni la
durée métier d'une proposition, ni les endpoints, ni la fréquence GPS. La limitation
existante des lots GPS à 64 positions est conservée. La désinscription d'une tâche
isolée ne déclenche pas de purge des tâches voisines ; son callback restant est
borné par le délai natif.

Le patch refuse une source Expo non reconnue. `eas-build-post-install` vérifie sa
présence. `expo-task-manager` demeure dans `buildFromSource`, sans substitution par
un AAR précompilé qui ignorerait le correctif.

Référence du correctif amont de la fuite :
[Expo #47844](https://github.com/expo/expo/pull/47844).

### Préparation des photos

Le module Java local `native/bounded-image/android/BoundedImagePackage.java`, copié
dans `android/app/src/main/java/com/zwanga/images/`, est enregistré dans
`MainApplication.kt`. `plugins/withBoundedImage.js` conserve cette configuration
lors d'un futur prebuild ; `scripts/validate-bounded-image.cjs` vérifie la copie
native et l'enregistrement avant le build.

- Lecture des dimensions sans bitmap puis décodage sous-échantillonné, au plus
  2 048 pixels par côté avant transformation ; pas de première allocation pleine taille.
- Travail sur un thread dédié, une préparation à la fois, fermeture des flux et
  libération des bitmaps dans `finally`, y compris en cas d'échec d'export.
- Orientation EXIF, proportions et absence d'agrandissement conservées. Sortie JPEG
  dans un nouveau fichier cache, sans modification de l'original ni copie des métadonnées.
- `quality: 1` dans le sélecteur Android évite la recompression pleine résolution
  de `expo-image-picker` : l'original est copié puis préparé par le nouveau module.
- `utils/prepareLocalImage.ts` est utilisé pour les profils (1 024 pixels, qualité
  0,8) et documents KYC (maximum 2 000 pixels, qualité 0,9). Le sous-échantillonnage
  par puissances de deux peut produire une résolution inférieure au maximum :
  vérifier la lisibilité des pièces sur appareil réel.
- iOS conserve le traitement via ImageManipulator ; ses références sont libérées
  explicitement. Les écrans de choix, confirmation et annulation restent identiques.
- Sur un ancien binaire Android sans le module, une petite image reste traitable ;
  une image supérieure à 2 048 pixels est refusée plutôt que décodée sans protection.
  Une erreur native n'entraîne jamais une seconde tentative pleine résolution.

Fichiers applicatifs : `utils/profilePhoto.ts`, `utils/prepareLocalImage.ts`,
`hooks/profile/useProfilePhotoSelection.ts`, `components/identity/AwsKycProvider.tsx`.
Les permissions, vérifications KYC serveur, protections contre les doubles clics,
annulations et changements de compte sont conservées.

Référence : [décodage économe des bitmaps Android](https://developer.android.com/topic/performance/graphics/load-bitmap).

### Crashlytics natif

`android/app/build.gradle` et `plugins/withAndroidCrashlyticsSymbols.js` activent
les symboles pour release et indiquent les bibliothèques fusionnées avant stripping.
La configuration attend l'application du plugin Firebase, y compris sur un prebuild.
Le contrôle `scripts/validate-android-crashlytics.js` refuse une configuration incomplète.

`scripts/upload-android-crashlytics-symbols.cjs` lance
`:app:uploadCrashlyticsSymbolFileRelease` dans le hook EAS de succès, après validation
de l'AAB, seulement pour Android / profil production. Une erreur d'envoi remonte
comme échec du hook, au lieu d'être masquée. Aucun envoi n'a été lancé pendant cette
intervention. La précision dépend des symboles réellement fournis par les bibliothèques
externes ; l'activation seule ne garantit pas des lignes source pour tous les SDK.

Référence : [Crashlytics NDK](https://firebase.google.com/docs/crashlytics/android/get-started-ndk).

## Vérifications

- Tests Java compilant les véritables méthodes patchées : 10 000 fins de tâches,
  chevauchement, réponses tardives/dupliquées, expiration, réponse sans identifiant,
  isolation des comptes applicatifs, exception dans un callback et 2 000 tâches
  supplémentaires réparties sur deux threads.
- Tests Java du calcul de sous-échantillonnage : grandes images, panoramas,
  dimensions invalides et valeurs extrêmes.
- Tests JavaScript : routage vers le module Android, absence de décodage préalable,
  repli sûr pour ancien binaire, libération des références iOS même en cas d'échec,
  synchronisation native/prebuild, sélecteurs, configuration et garde d'envoi des symboles.
- Le patch a été appliqué en mémoire à la source originale du paquet npm 14.0.9
  présent dans le cache : résultat identique à la source installée, sans téléchargement.
- Compilation Java du module photo avec les API Android 36 et React Native 0.81.5
  locales réussie. Trois avertissements concernent des annotations absentes du
  classpath de ce contrôle isolé ; ce n'est pas une compilation Gradle complète.

Suite complète : 243 fichiers, 1 989 tests réussis, zéro échec ou test ignoré.
Après le renforcement du test concurrent, les 15 tests tâches/photos/Crashlytics
ont également été relancés avec succès. TypeScript, ESLint ciblé, contrôles réseau,
taille des sources, patch installé et synchronisation native sont réussis.
Les tests Java utilisent des doubles pour Handler/JobService : ils ne mesurent pas
la mémoire d'un processus Android et ne valident pas le comportement du système en veille.

## Livraison et recette restante

Depuis la racine du projet :

```powershell
npm.cmd run test:android-startup
npm.cmd run check:release
npx.cmd eas-cli@latest build --platform android --profile production
```

Le profil production existant incrémente le numéro de build distant. Aucun changement
de version marketing, de signature, de backend ou de configuration AWS n'est nécessaire
pour ces correctifs. Ne pas livrer ce lot uniquement en OTA : les changements Java
nécessitent un nouveau binaire. Aucun build EAS, upload de symboles, déploiement ou
installation sur téléphone n'a été effectué ici.

Sur un téléphone de test, vérifier une installation neuve **et** une mise à jour
conservant les données :

1. Démarrage connecté/déconnecté, connexion PIN et Google, inscription avec et sans photo.
2. Photo de galerie haute résolution, portrait/paysage, image tournée, caméra,
   annulation pendant préparation ; vérifier aussi la lisibilité des pièces KYC.
3. GPS conducteur actif, veille prolongée, retour au premier plan, changement de
   compte, fin de trajet et notifications de proximité pendant ces transitions.
4. Contrôler l'évolution mémoire sur un Android ARM64 peu doté en RAM et vérifier
   également un appareil à pages de 16 Ko. Les contrôles ELF ne remplacent pas ce test.
5. Contrôler le hook d'envoi des symboles puis la réception Crashlytics d'un crash
   contrôlé dans un **build de diagnostic réservé aux testeurs**, après relancement.
   Aucun bouton de crash ni déclencheur de crash n'est livré aux utilisateurs.

Pour une fermeture persistante, recueillir la trace du nouveau build via Android
Vitals, Crashlytics ou `adb logcat -b crash -d`, en retirant toute donnée personnelle
avant partage. La disparition des crashs ne peut être annoncée avant cette recette.
