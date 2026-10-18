# Correctifs de stabilité production — 7 octobre 2026

Suite à l'[audit de stabilité](AUDIT_STABILITE_PRODUCTION_2026_10_07.md),
application des correctifs mobiles S01–S03 et renforcement des contrôles de
compilation S04. Aucun backend, compte, montant, migration ou déploiement modifié.
Les changements préexistants sont conservés ; aucune dépendance ajoutée.

## S01 — Parcours de réservation et transitions de modaux

**Problème :** le formulaire, le sélecteur de position et le succès pouvaient
enchaîner des présentations natives concurrentes. Des ouvertures différées
restaient possibles après avoir quitté le parcours.

**Appliqué :**

- `app/trip/[id].tsx` héberge un `RideOverlayScope` lié au focus de la fiche.
- `features/trip-detail/TripBookingSuccessModal.tsx`, `TripImageModal.tsx`,
  `TripMapModal.tsx`, `TripReviewsModal.tsx` et `TripVehicleDetailsModal.tsx`
  utilisent `RideModal` et participent au même arbitrage que le formulaire.
- `TripBookingModal.tsx` et le succès gèrent explicitement le retour Android.
- `hooks/trip-detail/useTripBookingWizard.ts` retire les temporisations du
  sélecteur de réservation, rend origine/destination exclusifs et protège les
  ouvertures/navigation hors focus, après démontage et contre le double appui
  vers les réservations. La fermeture reste bloquée pendant une réservation.
- `features/navigation/RideModal.tsx`, `RideOverlayProvider.tsx` et
  `rideOverlayStore.ts` transmettent `onShow` après affichage effectif du panneau.
  C'est nécessaire pour conserver l'activation différée de la carte du sélecteur.
  Le rappel ne se répète pas à chaque modification des enfants ; il se répète
  lorsqu'un panneau redevient visible après suspension ou retour au premier plan.

**Conservé :** étapes, contrôles de places/identité, données saisies, requête de
réservation et écran de succès. Pas de changement de tarif ou de paiement.
Le risque UIKit est traité par une présentation dans la vue de l'écran, pas par
une nouvelle temporisation. Aucun crash UIKit n'a été reproduit ou déclaré résolu.

## S02 — Itinéraires bornés avant affichage

**Problème :** décodage sans budget, coordonnées invalides et calcul de bornes avec
déploiement d'un grand tableau dans `Math.min/max`, susceptible de lever une erreur.

**Appliqué :** `utils/routes/safePolyline.ts` centralise validation/décodage :
100 000 caractères encodés maximum, 10 000 points décodés maximum, coordonnées
finies dans les limites géographiques, rejet des encodages tronqués. Les aperçus
sont limités à 512 points par échantillonnage conservant les deux extrémités.
`utils/routeApi.ts` utilise ce décodeur ; `features/publish/publishModel.ts` et
`features/trip-request/requestFormModel.ts` valident les tracés et calculent leurs
bounds par boucle, sans déploiement d'arguments.

**Conservé :** cache borné, déduplication, annulation, distances/durées fournies
par le serveur et repli existant lorsqu'un itinéraire est inutilisable. Les modèles
ne présentent pas une simple ligne de repli comme un véritable itinéraire routier.
La simplification peut réduire le détail visuel des longs tracés ; les géométries
dépassant le budget sont rejetées. Les décodeurs de navigation déjà bornés restent
inchangés. Ces protections évitent des entrées excessives, sans mesure native de FPS.

## S03 — Robustesse des événements socket

**Problème :** un lot de positions non-tableau levait une exception ; un abonné
du chat qui échouait pouvait interrompre les abonnés suivants.

**Appliqué :** `services/socketPayloads.ts`, `services/trackingSocket.ts` et
`services/chatSocket.ts` valident les champs consommés, coordonnées et dates avant
diffusion. Les lots de positions sont limités à 256 éléments, filtrés ; les formats
tableau direct et objet `locations` restent acceptés. Chaque abonné du chat est
isolé par `try/catch`. Les avertissements sont limités en fréquence et ne contiennent
ni message, ni position, ni détail d'exception susceptible de révéler des données.

**Conservé :** partage des connexions, abonnements, nettoyage, événements valides
et position explicitement indisponible (`coordinates: null`). Les événements
invalides sont ignorés, pas transformés en données inventées. Le contrat de message
a été comparé au sérialiseur backend ; aucun endpoint ni socket serveur modifié.

## S04 — Contrôles des artefacts et instrumentation native

**Android :** `scripts/elf-validation.cjs`, `android-archive.cjs` et
`validate-android-native.cjs` vérifient désormais toutes les bibliothèques `.so`
embarquées, y compris celles de dépendances/modules, en conservant le contrôle des
bibliothèques indispensables. Vérification des architectures, segments ELF,
troncatures, doublons et alignement des segments LOAD : 16 Ko en 64 bits, 4 Ko en
32 bits. Sur APK, contrôle aussi de l'alignement ZIP des bibliothèques non compressées.
Lecture bibliothèque par bibliothèque avec budget de décompression, sans charger
le bundle entier en mémoire. Les hooks Gradle/EAS existants utilisent ce contrôle.

Un AAB ne prouve pas l'alignement ZIP des APK distribués : les APK générés doivent
aussi être contrôlés et exécutés sur une cible 16 Ko. Ce contrôle statique ne remplace
pas une installation ni un test de chargement natif.

**iOS :** `scripts/validate-ios-crashlytics.cjs` et les scripts `package.json`
ajoutent un contrôle des Pods RNFirebase/Firebase Crashlytics et de la phase de
configuration/symboles. `eas-build-post-install` le lance sur iOS après installation
des Pods dans le workflow EAS standard ; `check:ios-crashlytics` permet le contrôle
local. Un build incomplet doit échouer explicitement au lieu de perdre silencieusement
l'instrumentation. Les fichiers générés CocoaPods/Xcode ne sont pas fabriqués à la main.

**Limite réelle :** les fichiers iOS locaux sont encore non synchronisés. Le nouveau
contrôle échoue actuellement pour Pods/phase absents. L'installation des Pods sur
macOS ou lors du prochain build EAS reste nécessaire, suivie d'une vérification de
réception d'un rapport symboliqué de test. La présence des scripts ne prouve pas
la réception des rapports et ne prouve pas l'état du binaire déjà publié.

Références des contrôles : [alignement Android 16 Ko](https://developer.android.com/guide/practices/page-sizes),
[ordre des hooks EAS](https://docs.expo.dev/build-reference/npm-hooks/).

## Vérifications réalisées

- Tests ajoutés : `tests/productionStability.test.js`, `iosCrashlytics.test.js` ;
  tests complétés : `androidNativeArtifact.test.js`, `rideOverlays.test.js`.
  Ils exécutent les modules avec événements/itinéraires synthétiques et hooks
  simulés : ce ne sont pas des essais physiques UIKit/Android.
- `tests/performancePolicy.test.js` : donnée simulée de message complétée pour
  respecter le contrat réel ; conservation des assertions de partage/nettoyage.
- Résultat final de la suite et des contrôles : voir le journal des changements.
- APK debug local existant : contrôle ELF/ZIP réussi avec `--abis=x86_64`.
  Ce n'est ni un nouveau build ni la certification d'un artefact release ARM64.
- Contrôle iOS local : échec attendu détaillé ci-dessus, à résoudre par CocoaPods
  sur macOS/EAS. Aucun build natif, rapport de crash production ou essai de chauffe
  n'a été réalisé pendant ces correctifs.

## Commandes et recette native restant à réaliser

Contrôles locaux JavaScript :

```sh
npx tsc --noEmit
node --test --test-concurrency=4 tests/*.test.js
npm run check:network
npm run check:source-size
```

Sur macOS, dans `ios`, lancer `pod install` (ou la commande Bundler du projet),
puis depuis la racine `npm run check:ios-crashlytics`. Pour de nouveaux builds natifs
stores, à lancer volontairement après vérification des configurations :

```sh
eas build --platform ios --profile production
eas build --platform android --profile production
node scripts/validate-android-native.cjs chemin/vers/application.aab
node scripts/validate-android-native.cjs chemin/vers/application.apk --abis=arm64-v8a
```

Sur iPhone physique/TestFlight et Android release (dont cible 16 Ko), vérifier :

1. Réservation → origine/destination sur carte → retour formulaire → succès →
   réservations ; doubles appuis, retour Android, interruption et reprise de l'app.
2. Carte du sélecteur visible et interactive, conservation des champs ; fermeture
   des photos/avis/détails véhicule et absence de panneau réapparu hors parcours.
3. Trajets longs, réseau indisponible/reconnexion, messagerie et suivi temps réel.
4. Rapport de crash volontaire uniquement dans un environnement de test autorisé,
   avec symbolication vérifiée côté console pour chaque plateforme.

Aucune disparition de crashs, baisse de chauffe ou économie de batterie n'est
annoncée avant cette recette et l'observation de télémétrie réelle.
