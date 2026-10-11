# Compilation Android : optimisations sans changement d’offre

## 9 octobre 2026 — Périmètre et constat

Le journal fourni indique une annulation à **45 min**, dont **43 min 01 s** dans
Gradle. Le bundle JavaScript est terminé. React Native et Hermes sont compilés
depuis les sources pour quatre architectures. Le journal ne contient pas de
cause finale explicite : la limite de durée est une **hypothèse**, pas une erreur
de compilation ou un manque de mémoire démontré.

Cette compilation depuis les sources est intentionnelle : elle embarque le
correctif Kotlin `ZWANGA_DRAWING_ORDER_GUARD`. Revenir simplement aux AAR Maven
supprimerait ce correctif du binaire distribué.

## Solutions appliquées

- `eas.json`, uniquement `production.android` : activation du cache C/C++ EAS
  avec `EAS_USE_CACHE`, persistance du cache de résultats Gradle
  `/home/expo/.gradle/caches/build-cache-1`, clé `android-sdk54-gradle-v1`.
  Le chemin correspond au runner Linux EAS ; ce n’est pas un chemin de cache
  local Windows. Si le runner ou `GRADLE_USER_HOME` change, vérifier ce chemin.
- Même profil : remplacement de l’image mobile `latest` par
  `ubuntu-24.04-jdk-17-ndk-r27b`, adaptée au SDK 54. Cela réduit la variabilité de
  l’outillage ; ce changement ne prouve pas, à lui seul, un gain de durée.
- `android/gradle.properties` : activation du cache de tâches Gradle. Gradle
  réutilise les résultats des tâches éligibles selon leurs entrées ; aucune
  tâche arbitraire n’est forcée à être mise en cache.
- Désactivation de la recompression PNG facultative en release. Les ressources
  restent empaquetées et les pixels ne sont pas volontairement modifiés ; la
  taille des ressources peut augmenter. Gain de temps et taille non mesurés.
- `plugins/withPatchedReactAndroid.js` : mêmes propriétés appliquées lors d’un
  futur prebuild, de manière idempotente, sans doublons et sans réécriture des
  paramètres sans rapport. Le projet Android versionné est déjà synchronisé.
- `tests/androidBuildPerformance.test.js` et `package.json` : commande
  `npm run test:android-build` couvrant ces réglages et les contrôles natifs
  existants.

Les mécanismes sont ceux décrits dans la [documentation du cache EAS](https://docs.expo.dev/build-reference/caching/),
la [référence des images EAS](https://docs.expo.dev/build-reference/infrastructure/)
et la [documentation du cache Gradle](https://docs.gradle.org/current/userguide/build_cache.html).

## Comportements conservés

Les quatre ABI `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`, Hermes, la nouvelle
architecture, la compilation des sources patchées en release, les garde-fous
postinstall et la validation des bibliothèques ELF/16 Ko restent en place.
Les builds debug conservent leurs dépendances précompilées.

Aucune dépendance, offre payante, classe de machine, limite mémoire, version
d’application, fonctionnalité métier, configuration iOS ou backend modifiée.
Le workflow existant utilise déjà le profil `production` par défaut : aucun
nouveau déclencheur ou lancement automatique de build n’est ajouté.

Le cache personnalisé ne sauvegarde pas tout le dossier utilisateur, les clés
de signature, les fichiers d’environnement, `node_modules` ou le répertoire
complet des sorties de l’application. Il s’agit d’un cache de compilation EAS,
à réserver aux contributeurs et comptes de build de confiance.

## Vérifications réalisées

- `npm run test:android-build` : **9 tests JavaScript réussis**. Les archives ELF
  utilisées par les tests sont synthétiques, pas des APK/AAB de production.
- ESLint ciblé sur le plugin et les nouveaux tests : réussi, sans avertissement.
- Schéma des trois profils `eas.json` validé avec la bibliothèque de la CLI EAS
  installée (18.0.1), sans connexion au compte et sans envoi de build.
- `git diff --check` : réussi.
- `gradlew :app:bundleRelease --dry-run --offline` : **non abouti**. Le wrapper
  a tenté de télécharger Gradle 8.14.3 ; le réseau de l’environnement de
  vérification l’a refusé avant l’exécution de Gradle. Ce résultat ne valide ni
  le graphe de compilation ni un build natif.

Aucun build cloud lancé, aucun nouvel AAB produit et aucun essai sur appareil
physique effectué pendant cette intervention. Aucun gain mesuré ou disparition
de crash n’est annoncé.

## Prochain essai et limites

Lancer volontairement le prochain build Android avec la commande habituelle :

```sh
eas build --platform android --profile production
```

Ne pas ajouter `--clear-cache` pour comparer un build avec cache. Après un build
réussi, comparer avec un second build de la même révision et du même profil :
durée Gradle, durée totale, étapes de restauration/sauvegarde des caches et
tâches `FROM-CACHE`. Vérifier aussi la réussite du contrôle natif en fin de build.
Les builds restent soumis au quota habituel du compte ; aucun n’a été lancé ici.

Le **premier build à cache vide peut encore dépasser la limite**. La sauvegarde
du cache personnalisé EAS intervient après un build réussi : une annulation ne
garantit pas qu’un cache réutilisable existe. Le cache C/C++ ne remplace pas
toutes les étapes de configuration, de liaison, d’empaquetage et de signature.
Ne pas relancer indéfiniment si le premier build expire à nouveau : examiner
la dernière tâche et le motif d’arrêt EAS avant de choisir une autre stratégie.

Sur l’AAB issu du prochain build, tester via la piste interne Play : lancement
à froid, images/icônes, accueil/carte/navigation et retour d’arrière-plan sur
appareil physique. Les tests JavaScript ne suffisent pas à valider le rendu
natif ni le correctif anti-crash. Aucun nouveau build iOS n’est requis pour ces
seuls changements Android.

Différé : réduction des ABI, remplacement des sources patchées par un artefact
précompilé maîtrisé, changement de machine ou d’offre. Ces options ne sont pas
appliquées et demandent une validation distincte de compatibilité/coût.
