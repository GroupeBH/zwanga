# Stabilité iOS/Android — complément du 23 septembre 2026

## Périmètre et statut

Suite de l'audit et des [correctifs de performance](PERFORMANCE_AUDIT_2026_09_23.md).
Cette intervention traite les courses entre opérations GPS, les fermetures de
modals, les lectures financières globales, le compte à rebours passager et la
prise en compte du patch Android. Les changements sont locaux dans `zwanga` et
`zwanga-backend` : aucun déploiement, aucune migration ni transaction financière.

Les défauts de code corrigés sont identifiés ; leur responsabilité dans chaque
incident de production reste une hypothèse sans trace native correspondante.
Les tests JavaScript ne prouvent ni la disparition des freezes ni une baisse
mesurée de la température ou de la consommation.

## 1. Suivi GPS passager : démarrages et arrêts concurrents

**Problème.** Sérialiser uniquement l'appel natif ne suffisait pas : une lecture
de session avant la file d'opérations, puis une suppression tardive, pouvait
effacer une nouvelle réservation. Une demande de permission encore ouverte
pouvait aussi réactiver un suivi après sa demande d'arrêt.

**Solution appliquée.** `services/background/passengerGpsProfile.ts` utilise une
file commune pour les lectures de contrôle, écritures et opérations natives.
Une révision réservée avant les permissions invalide les démarrages dépassés.
Les mises à jour relisent la réservation courante à l'intérieur de la file.
L'arrêt d'une ancienne réservation ne supprime pas la nouvelle. Un callback
ayant précédemment trouvé une session vide revérifie avant d'arrêter le GPS.
Une opération rejetée ne bloque pas les suivantes.

`services/passengerBackgroundLocationTask.ts` utilise cette file pour démarrer,
arrêter, promouvoir le suivi d'attente et revenir au profil d'attente. Il ne
réécrit plus la session indépendamment de l'opération native associée.

**Conservé.** Permissions, profils Balanced/High, fréquences, détection du départ,
transport RTK Query, validations de coordonnées et temporisations réseau.
La file concerne l'instance JavaScript de l'application : elle n'est pas un
verrou distribué entre processus. Le comportement de réveil iOS reste à tester.

**Vérification.** `tests/passengerGpsProfile.test.js` : ancien arrêt concurrent
avec nouveau démarrage, permission tardive après arrêt, mise à jour obsolète,
arrêt sans session devenu obsolète et reprise après erreur de stockage.

## 2. Modals : réduire un conflit global et récupérer une fermeture incomplète

**Problèmes.** La notification globale de paiement conducteur pouvait demander
un contrôleur natif iOS pendant qu'un autre modal était présenté. Plusieurs
actions attendaient ensuite indéfiniment `onDismiss` si ce retour n'arrivait pas.

**Solution appliquée.** `components/DriverPaymentNoticeCoordinator.tsx` affiche
désormais sa notification dans le système de panneaux internes déjà employé
pour le paiement passager. Le panneau est suspendu lorsqu'un modal natif est
présent, puis reprend. L'accès au trajet suit la fermeture logique du panneau,
sans attendre `InteractionManager` ou une animation UIKit supplémentaire.

Dans `features/navigation/RideModal.tsx`, une fermeture native iOS demandée
dispose d'un secours après deux secondes : l'élément natif est d'abord démonté,
puis son blocage du panneau interne est libéré et le callback exécuté une fois.
Un événement natif tardif ne doit pas répéter l'action. La réouverture, le
démontage du composant ou une fermeture normale annulent ce secours.
`components/ui/DialogProvider.tsx` oublie une action de fermeture devenue
obsolète quand son dialogue est explicitement remplacé ou annulé.

**Conservé.** Priorités SOS/confirmation/paiement, données et boutons de paiement,
formulaires natifs, présentations `pageSheet`, fenêtres imbriquées de choix de
lieu et callbacks existants. Il ne s'agit PAS d'une sérialisation universelle
de tous les modals : imposer une telle file aux formulaires imbriqués pourrait
les bloquer. La récupération JavaScript ne garantit pas à elle seule l'état
final de UIKit sur tous les appareils.

**Vérification.** `tests/rideOverlays.test.js` simule les fermetures normales,
l'absence de `onDismiss`, les callbacks tardifs, réouvertures, démontages,
suspensions entre panneaux et 500 cycles de changement de scope. Aucun essai
sur iPhone physique n'a été réalisé pendant cette intervention.

## 3. Historiques financiers globaux remplacés par un contexte ciblé

**Problème.** La pagination des écrans ne supprimait pas les abonnements à
l'historique complet utilisés par le coordinateur d'arrivée et la reprise
d'abonnement depuis le profil.

**Backend.** Nouvelle lecture authentifiée `GET /payments/history/context`,
avec un DTO validé dans `src/payments/payment-context.ts`, branchée dans
`payments.controller.ts` et `payments.service.ts` :

- Réservation : dernier paiement correspondant à ses identifiants historiques,
  limité à une ligne, toujours restreint au compte authentifié.
- Abonnement : dernière tentative encore en attente depuis moins de 30 minutes,
  en ignorant les messages de refus connus. Recherche par pages de 25 si des
  tentatives refusées précèdent une tentative valable ; pas de troncature
  arbitraire qui ferait perdre une reprise de paiement.
- Réponse de zéro ou une transaction, passée par le formateur client existant.
  Aucun payload brut du prestataire ni nouvelle écriture comptable.

Le guide `supabase-postgres-best-practices` a orienté le périmètre par compte
et les lectures bornées avec curseur. Aucun service Supabase ni nouvelle
migration n'est introduit. Pas d'EXPLAIN ni de mesure sur la base de production.
La recherche d'abonnement réutilise le paginateur existant, qui compte aussi
les lignes correspondantes ; ce coût reste à mesurer, pas à déclarer nul.

**Mobile.** `store/api/paymentContext.ts` et `paymentApi.ts` fournissent les
lectures ciblées RTK Query. Intégration dans `useArrivalPaymentState`,
`useArrivalPaymentCompletion`, `useProfileData`, `useSubscriptionPaymentState`
et `useSubscriptionPaymentRestore`. Les UUID absents ne sont pas envoyés sous
forme de chaînes `null` ou `undefined`.

**Conservé.** Réconciliation, reçu du dernier paiement, reprise d'abonnement,
références de transactions existantes, invalidation du cache et règles de
paiement. Les anciens endpoints restent disponibles. Un serveur répondant
404/405 à la nouvelle route déclenche une lecture de compatibilité de l'ancien
historique, puis son filtrage ; les erreurs 401/403/429/5xx ne la déclenchent pas.
Déployer le backend en premier pour obtenir réellement l'économie réseau.
Les règles de prix, cash, jetons et versements ne changent pas.

**Vérification.** `tests/paymentContext.test.js`, tests de reprise d'arrivée,
profil et écrans inactifs ; côté backend `payment-context.spec.ts` : isolation
par compte, identifiants historiques, pagination après des refus, absence de
résultat, erreurs et validation du DTO. Dépôts et transport simulés, pas de débit.

## 4. Compte à rebours passager arrêté lorsqu'il est inutile

**Problème.** Le timer de prise en charge pouvait continuer à réveiller le
thread JavaScript hors écran et à réécrire zéro après expiration.

**Solution.** `usePassengerTripDestinationNotice.ts` reçoit `isScreenActive`
depuis `usePassengerNavigationController.ts`. Pas d'intervalle en arrière-plan,
hors écran, sans date valide ou après expiration. Au retour, le temps restant
est recalculé depuis l'heure réelle, et non depuis des ticks manqués. Les
dépendances des effets utilisent les références/setters stables individuels.

**Conservé.** Avertissements de prise en charge, décisions serveur, notifications
et suivi GPS indépendant de l'affichage. `tests/passengerCountdown.test.js`
vérifie masquage, reprise, expiration et date invalide avec une horloge simulée.

## 5. Android : intégrer effectivement le patch de dessin

**Problème constaté.** Le postinstall corrigeait la source Kotlin de React Native,
mais la compilation Android employait un AAR précompilé Maven. Modifier cette
source ne modifiait donc pas la bibliothèque utilisée dans l'application.

**Solution appliquée.** `plugins/withPatchedReactAndroid.js`, appelé par
`app.plugin.js`, ajoute la substitution Gradle vers les sources installées de
ReactAndroid et Hermes. `android/settings.gradle` contient la même configuration
pour le projet natif déjà présent. Le plugin est idempotent après prebuild.
La substitution est activée pour les tâches release ou les tâches globales
`assemble`, `build`, `bundle`. Les tâches debug ciblées conservent les AAR usuels
afin de ne pas imposer un compilateur hôte aux développeurs Windows. Pour un
debug représentatif du correctif ou une inspection des dépendances, utiliser
`-Pzwanga.buildReactNativeFromSource=true`. Un contrôle de présence du marqueur
du patch refuse une compilation source release dont le postinstall a été omis.
Le patch existant `scripts/patch-react-native-drawing-order.js` reste exécuté
au postinstall et conserve son contrôle de compatibilité de la source.

**Conservé.** Versions Expo/React Native, architecture React Native et règles de
gel/détachement des écrans, quatre ABI Android. Pas d'activation globale de
`freezeOnBlur` ni de suppression aveugle de bibliothèques. Contrepartie : les
builds demandent davantage de temps, des outils C++ et des téléchargements
natifs. Le build EAS complet reste à exécuter avant publication.

**Vérification réelle.** `:app:tasks` et `:app:dependencyInsight` pour
`releaseRuntimeClasspath` réussissent ; ce dernier confirme la sélection du
projet ReactAndroid local par substitution, avec le variant release attendu.
L'essai hors ligne a d'abord échoué faute de plugin Gradle dans le cache ;
la résolution avec téléchargement a ensuite réussi. Ce n'est pas un test
d'exécution Android et cela ne prouve pas l'absence de crash de dessin.
Après séparation debug/release, la résolution debug a également été vérifiée :
AAR React Native 0.81.5 conservé. Dans PowerShell, entourer l'argument de propriété
de quotes : `'-Pzwanga.buildReactNativeFromSource=true'` pour éviter son découpage.
La vérification du graphe `assembleRelease --dry-run` a également exécuté des
tâches de préparation du build inclus React Native : téléchargement des sources,
codegen et installation de CMake dans le SDK local. Elle a échoué lors de la
configuration de Hermes faute de `nmake`/compilateur C++ hôte sous Windows.
Aucun APK/AAB release nouveau n'a été généré. La compilation release complète
reste donc NON validée ; utiliser le builder Linux EAS ou un environnement
Windows C++ correctement initialisé, puis exécuter les essais natifs. Il ne
s'agit pas d'une validation de compilation Kotlin/C++ réussie.

## 6. Android : refuser un artefact sans bibliothèques natives attendues

**Problème signalé, cause non confirmée.** Un crash SoLoader indique une
bibliothèque `libc++_shared.so` introuvable. Le log seul ne permet pas de trancher
entre packaging, sélection ABI, installation de splits ou autre problème natif.

**Mesure appliquée.** `scripts/validate-android-native.cjs` inspecte APK/AAB :
présence unique et non vide de `libc++_shared.so`, `libreactnative.so` et
`libhermes.so` pour chaque ABI demandée, puis contrôle ELF de `libc++_shared.so`
(classe, endianness et machine). `scripts/android-archive.cjs` lit le répertoire
ZIP et la bibliothèque contrôlée sans charger tout le bundle en mémoire.
Un ZIP64 non pris en charge provoque une erreur explicite, pas une validation.

Le contrôle est exécuté après `assembleRelease`/`bundleRelease` dans
`android/app/build.gradle`, reproduit par le plugin Expo. Un échec fait échouer
la tâche release. `package.json` fournit également `check:android-native` et
un contrôle de fin de build EAS Android production.

**Vérification.** `tests/androidNativeArtifact.test.js` couvre les ABI absentes,
bibliothèques absentes, ELF incohérent, ZIP invalide et génération idempotente
du plugin. Le script accepte l'ancien APK debug local pour les quatre ABI.
Cet APK n'est PAS le nouvel AAB production ; aucun artefact Play correspondant
au crash n'a été examiné ici. Le contrôle ne valide ni tous les symboles natifs,
ni l'alignement des pages, ni les splits effectivement installés par Google Play.
Le crash SoLoader ne peut donc pas être déclaré résolu à ce stade.

## Validation et diffusion

- TypeScript mobile et backend production : contrôles sans émission réussis.
- ESLint ciblé : aucun avertissement ni erreur après correction des dépendances
  stables et des imports concernés.
- 897 sources applicatives contrôlées : aucun fichier au-dessus de 400 lignes.
- Frontière réseau : aucun nouvel appel HTTP direct hors RTK Query.
- Tests backend ciblés : 33 tests réussis dans quatre suites (contexte de paiement,
  pagination/projections et service de paiement). Pas de connexion DB réelle.
- Suite mobile : **789/791 tests réussis**, seuls les deux échecs préexistants de `sourceExtractions.test.js`
  subsistent (références des styles de réservation et des endpoints userApi).
  Les références n'ont pas été régénérées pour masquer ces écarts hors périmètre.

Avant diffusion : déployer la lecture backend, construire de nouveaux binaires,
contrôler l'AAB et les splits avec bundletool puis le canal de test interne Play.
Sur iPhone et Android physiques, tester un long trajet, la veille, le retour au
premier plan, les permissions GPS, les confirmations imbriquées, paiement/fermeture
et retour à l'accueil. Mesurer mémoire/CPU et surveiller les traces de crash.
Une mise à jour JavaScript seule ne peut pas livrer le changement natif Android.

Références : [compilation React Native depuis les sources](https://reactnative.dev/contributing/how-to-build-from-source),
[outils de test des bundles Android](https://developer.android.com/tools/bundletool),
[hooks de build Expo](https://docs.expo.dev/build-reference/npm-hooks/).
