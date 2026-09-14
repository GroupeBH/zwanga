# Fermeture Android au lancement : configuration Crashlytics

## Anomalie trouvée

Le SDK `@react-native-firebase/crashlytics` était installé et déclaré dans les
plugins Expo, mais les fichiers Gradle Android versionnés ne contenaient ni sa
dépendance de build ni son application au module `app`.

Sans ce plugin, l'identifiant de build attendu par le SDK n'est pas généré.
Firebase peut alors échouer pendant son initialisation native, avant JavaScript
et avant les écrans. Les protections JavaScript ne peuvent pas intercepter cette
erreur. C'est une cause probable du signalement Play Store, à confirmer avec le
journal du build distribué ; aucun journal de ce téléphone n'a été fourni.

Sources : [installation Android de React Native Firebase](https://rnfirebase.io/crashlytics/android-setup)
et [comportement EAS avec les dossiers natifs existants](https://docs.expo.dev/workflow/continuous-native-generation/#usage-with-eas-build).

## Correction et prévention

- `android/build.gradle` déclare `firebase-crashlytics-gradle:3.0.6`, version
  fournie par le plugin Expo de React Native Firebase installé lors du correctif.
- `android/app/build.gradle` applique Crashlytics après Google Services.
- Le hook EAS `eas-build-pre-install` vérifie ces deux éléments. Cette vérification
  ne charge ni le SDK ni les secrets et n'ajoute aucun travail au démarrage de l'app.
- Le plugin Expo existant reste nécessaire pour les futures générations natives.

Contrôles locaux :

```powershell
npm run check:android-crashlytics
npm run test:android-crashlytics
cd android
.\gradlew.bat :app:injectCrashlyticsMappingFileIdRelease --console=plain
```

La dernière commande doit générer une ressource contenant
`com.google.firebase.crashlytics.mapping_file_id` dans `android/app/build/generated`.
Elle vérifie l'injection de l'identifiant, pas le démarrage complet sur téléphone.

Vérifications effectuées lors du correctif : tâche Gradle release réussie et
identifiant généré non vide, 177 tests Node réussis (dont 6 pour ce contrôle),
TypeScript sans erreur et ESLint ciblé sans erreur. Aucun nouvel AAB n'a été
publié ni testé sur le téléphone affecté dans cette intervention.

## Validation avant redistribution

Un nouveau binaire Android est indispensable ; une mise à jour JavaScript seule
ne peut pas corriger Gradle. Depuis la racine :

```powershell
eas build --platform android --profile production
```

Le profil `production` produit l'AAB destiné au Play Store. Le profil `dev` est un
client de développement et ne doit pas servir à cette validation. EAS gère le
numéro de build distant avec `autoIncrement` ; relever le `versionCode` réellement
distribué dans la console Play, pas seulement la version Expo.

Installer le nouveau build depuis la piste de test interne puis vérifier un
démarrage à froid, une réouverture et un lancement sans réseau, idéalement sur le
téléphone affecté. Ne pas effacer les données d'un utilisateur pour diagnostiquer.
Si la fermeture persiste, récupérer le rapport Android vitals du même
`versionCode` ou, après reproduction sur un appareil connecté :

```powershell
adb logcat -b crash -d -t 200
```

Retirer les données personnelles et secrets éventuels avant de partager ce journal.
