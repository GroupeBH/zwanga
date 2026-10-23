# Correctifs de fiabilité native — 23 octobre 2026

## Périmètre et constats

Suite à l'audit Android/iOS : arrêt GPS conditionné par l'effacement disque,
sonnerie native sans arrêt autonome lorsque JavaScript se bloque, relais vers
l'arrière-plan sans action plein écran, classes Android manuelles perdues après
une régénération Expo et différences entre plugin iOS et Podfile conservé.
Le contrôle local des Pods iOS échoue également : le lock présent ne contient
pas les dépendances Didit et Crashlytics attendues.

## Solutions appliquées

### Arrêt du GPS conducteur

- `services/driverBackgroundLocationSession.ts` invalide en mémoire une session
  explicitement arrêtée avant son effacement disque. Un effacement refusé n'est
  plus confondu avec une demande d'arrêt visant un autre trajet.
- `services/background/driverGpsProfile.ts` tente l'arrêt natif dans un `finally`,
  même après expiration de l'attente d'effacement, dès que l'appartenance au
  trajet a été établie. Un arrêt global reste inconditionnel.
- La mutation disque garde son verrou jusqu'à sa vraie terminaison : un résultat
  tardif ne doit pas effacer la session du prochain trajet.
- Les erreurs de lecture ordinaires en cours de trajet ne deviennent pas des
  ordres d'arrêt. Les cadences GPS conducteur/passager et proximité restent
  inchangées. Un arrêt obsolète du trajet A ne coupe pas le suivi du trajet B.
- Limite : un disque durablement inaccessible ne permet pas de garantir
  l'effacement persistant. La copie mémoire est invalidée ;
  une suppression peut être retentée. L'arrêt natif est demandé même si cette
  suppression échoue ; un appel natif lui-même bloqué reste une limite distincte.
  Un processus redémarré doit toujours
  réconcilier ses données avec le serveur.

### Sonnerie native

- `ForegroundAlertPlayer.java` possède un délai autonome de 15 secondes, renouvelé
  uniquement par les contrôles de santé JavaScript associés au bon jeton de
  lecture. Ces contrôles existants sont espacés de cinq secondes.
- La lecture et la vibration s'arrêtent si JavaScript ne renouvelle plus ce délai.
  Le délai de préparation de cinq secondes reste distinct. Une pause de synthèse
  vocale reste valide tant que les contrôles continuent.
- L'arrêt après décision, les protections contre les anciens jetons, le mode
  silencieux, Ne pas déranger et le nettoyage au passage en arrière-plan restent
  conservés. Aucun volume système forcé, service ou verrou de réveil ajouté.
- Cela protège d'un blocage du thread JS, pas d'un blocage du thread principal
  Android. Aucun changement du lecteur iOS.

### Relais plein écran

- `services/backgroundRideRinging.ts` utilise `rideAlertFullScreenAction` pour les
  réservations, offres et demandes proches transférées au téléphone verrouillé.
- Même contrôle d'autorisation système, consentement conducteur et activation
  native du build que pour une nouvelle notification. Ni réautorisation forcée,
  ni prolongation du délai serveur, ni plein écran conducteur pour les réponses
  destinées au passager. Les notifications ordinaires restent le repli.
- Les profils de build ne sont pas activés implicitement pour la production.

### Sources natives reproductibles

- `native/android/notifications/` devient la source canonique des quatre classes
  Java : module, package, lecteur et activité plein écran. Les copies dans
  `android/app/src/main/java/com/zwanga/notifications/` sont conservées pour le
  workflow natif actuel.
- `plugins/withDriverAlertSources.js`, appelé par `withIncomingRideAlerts.js`,
  recopie ces sources et enregistre `DriverAlertPackage` pendant un prebuild.
  Un MainApplication non reconnu provoque une erreur explicite.
- `plugins/withIosBridgeSettings.js` remplace les anciennes transformations
  divergentes de `app.plugin.js`. Le bloc délimité de `ios/Podfile` conserve les
  réglages Maps et Firebase existants, sans ajout global de modular headers.
- `scripts/check-native-sources.cjs` vérifie la concordance des sources et des
  réglages iOS. Il est exécuté par `check:release` et par la préparation macOS.
  Commande locale : `npm run check:native-sources`.

## iOS : étape non exécutée sur Windows

`Podfile.lock` n'a pas été réécrit manuellement. Avec les dépendances npm
installées, exécuter sur macOS avec Xcode/CocoaPods :

```sh
npm run prepare:ios-native
```

Le script contrôle la toolchain et la concordance des sources, lance `pod install`,
puis vérifie Didit/Crashlytics. Il s'arrête à la première erreur. Conserver le
`Podfile.lock` réellement généré après examen du diff. Le contrôle iOS reste
bloquant tant que cette résolution n'a pas eu lieu ; il n'a pas été désactivé.

## Vérifications et limites

- Tests de régression ajoutés pour effacement refusé/bloqué, mutation tardive,
  isolation des trajets, reprise plein écran avec consentement et repli passager.
- Transformations de plugins testées sur des fixtures et copies dans des
  répertoires temporaires : idempotence, classes copiées, intégration du package,
  coexistence du correctif iOS de version minimale et détection des divergences.
  Aucun `prebuild --clean` exécuté dans le projet utilisateur.
- Le lecteur Java complet a été compilé/exécuté avec `javac` et des substituts
  Android/RN : arrêt à 15 s, renouvellement, mauvaise identité, pause vocale,
  expiration de préparation, callback tardif et nettoyage. Ce test ne mesure
  ni le matériel audio ni le cycle de vie réel d'un téléphone.
- Le contrôle global `node scripts/check-release.cjs` réussit : concordance native,
  TypeScript, ESLint, frontières réseau, taille des sources et 2 615 tests réussis,
  zéro échec, un test de politique CocoaPods ignoré faute de Ruby. Le contrôle
  du patch GPS, la configuration de toolchain iOS et `git diff --check` passent.
  Ce sont des contrôles locaux ; ils ne constituent pas une certification native.
- Le premier passage global a détecté une référence de styles périmée dans
  `tests/fixtures/sourceExtractions.json`. La référence du paiement a été
  actualisée pour le seul ajout antérieur `cashFallbackOption`, effectivement
  utilisé pour proposer les espèces. Sans cette clé, l'empreinte des 84 styles
  précédents reste strictement identique ; aucun style existant n'a été modifié
  pour contourner le test.
- Aucun déploiement, paiement réel, changement de base de données ou de `.env`.
  Aucune archive iOS ni compilation release Android réalisée ici.

## Recette native restante avant publication

Un nouveau binaire Android est nécessaire pour le délai natif et les ajouts
Java ; une OTA seule ne les apporte pas. Tester le binaire release, car le
projet compile les sources React Native corrigées en release mais utilise par
défaut les AAR en debug. Sur appareils physiques : notification en veille,
consentement accordé/refusé, ouverture des actions après déverrouillage, passage
au verrouillage pendant une sonnerie, mode silencieux, deux demandes successives,
fin du trajet et disparition du suivi GPS. Sur iOS : archive avec Pods résolus,
connexion, Didit, navigation et réception des symboles Crashlytics. Aucun constat
d'absence de crash ou de réduction de chauffe n'est établi par ces tests locaux.
