# Audit des risques de blocage et de crash mobile — 6 novembre 2026

## Suivi des corrections

Après cet audit, les correctifs A1, A2 et A3 ont été appliqués à la demande de l'utilisateur. Le détail et les résultats de vérification figurent dans l'entrée « Correctifs de sortie de navigation et de lecteur audio Android » du [journal technique](CHANGEMENTS_TECHNIQUES.md). A4 reste à résoudre sur macOS. Les constats ci-dessous décrivent l'état observé avant ces corrections, pas leur résultat.

## Conclusion

L'audit identifie une sortie de navigation non récupérable si son nettoyage lève une exception, un risque de blocage du thread principal Android dans le lecteur de sonnerie, et deux obstacles à la qualification d'une nouvelle version. Aucun crash natif de la version actuelle n'a été reproduit sur appareil dans cette passe. Les tests JavaScript réussis ne constituent pas une certification iOS/Android.

Audit du code mobile présent dans l'espace de travail, y compris ses modifications non commitées. Aucun correctif applicatif, changement backend, déploiement ou appel à un fournisseur réel n'a été effectué. Seuls ce rapport, son entrée de journal et des diagnostics locaux ignorés dans `.expo/` ont été ajoutés.

## Constats

### A1 — Sortie de navigation bloquée après une exception de nettoyage

- **Priorité :** P2, durcissement de la récupération d'erreur sur Android et iOS.
- **Sources :** `hooks/driver-navigation/useDriverNavigationExit.ts:144`, `:199` et `:216` ; chaîne de désabonnement dans `services/rideLocationBootstrap.ts` et `services/rideLocationStream.ts`.
- **Mécanisme :** `navigateBackSafely` et `navigateHomeSafely` positionnent `isExitingRef` avant `stopNavigationSideEffects`. Ce nettoyage appelle notamment `locationSubscription.current.remove()` sans protection. S'il lève une exception synchrone, la libération de la carte et la navigation ne sont jamais programmées. Le verrou reste actif et les appuis suivants ne font plus rien. Le même nettoyage est utilisé au démontage.
- **Preuve :** injection d'une exception dans `remove()` en exécutant le vrai hook transpilé avec le harnais de hooks du projet. Deux cas normaux atteignent leur destination ; deux cas dégradés constatent l'exception, le verrou persistant et l'absence de navigation, même au deuxième appui. Les quatre assertions passent parce qu'elles vérifient le comportement actuel, défaut compris.
- **Limite :** l'exception GPS est simulée. Aucun téléphone n'a naturellement déclenché cette erreur pendant cet audit ; cela ne prouve ni un crash natif ni la fréquence de ce scénario. Une promesse native rejetée et une exception synchrone sont deux cas distincts ; cette sonde couvre le second.
- **Correctif proposé, non appliqué :** rendre chaque nettoyage indépendant, libérer les références même en cas d'erreur et garantir la récupération du verrou de sortie. Ajouter des tests de non-régression qui attendent une sortie effective malgré un nettoyage partiellement défaillant.

### A2 — Opérations audio synchrones sur le thread d'interface Android

- **Priorité :** P2, risque d'ANR à qualifier nativement.
- **Sources :** `native/android/notifications/ForegroundAlertPlayer.java:24`, `:70`, `:79` et `:145`.
- **Mécanisme :** le lecteur au premier plan exécute `MediaPlayer.setDataSource(context, sound)` et `release()` sur le looper principal. Le son peut être celui du canal choisi dans Android, pas seulement une ressource embarquée. `prepareAsync()` ne déporte pas ces opérations précédentes. Le délai de préparation est posé après `setDataSource` et sur ce même looper : il ne peut pas interrompre celui-ci lorsqu'il est bloqué.
- **Conséquence possible :** fournisseur de son ou service média lent : interface figée pendant l'ouverture, la transition premier/arrière-plan ou l'arrêt d'une alerte. Les `try/catch` protègent des exceptions, pas d'un appel bloquant.
- **Preuve et limite :** constat statique, sans trace ANR ni durée de blocage mesurée. Les appels I/O et Binder synchrones lents sur le thread principal sont des causes reconnues d'ANR ; leur présence ici justifie une investigation, pas l'affirmation qu'un ANR s'est produit. [Documentation officielle Android](https://developer.android.com/topic/performance/issues/anr).
- **Correctif proposé, non appliqué :** sérialiser les opérations de ce lecteur sur un thread audio dédié, en conservant les contrôles de session, permission, silence et arrêt. Le service d'alerte en arrière-plan possède déjà cette séparation dans `RideAlertAudioSession.java` ; ce constat vise le lecteur de premier plan, pas tous les lecteurs.

### A3 — Contrôle de livraison bloqué par la référence des styles des gains

- **Priorité :** P1 pour la livraison ; ce n'est pas un crash en exécution.
- **Sources :** `tests/sourceExtractions.test.js:13`, `tests/fixtures/sourceExtractions.json`, `features/screen-styles/app/driver-earnings/container.styles.ts`, `package.json:13`.
- **Preuve :** le contrôle global échoue sur la comparaison des styles exportés par `features/screen-styles/app/driver-earnings/index.ts` : 47 clés réelles contre 45 attendues, empreinte différente. La relance isolée reproduit exactement cet échec. Le diff contient une refonte du panneau de gains, des suppressions et ajouts de styles : il ne s'agit pas simplement de deux valeurs à ajouter aveuglément.
- **Impact :** `eas-build-post-install` appelle le même contrôle ; dans cet état du code, cette étape échouera si les étapes précédentes passent.
- **Correctif proposé, non appliqué :** revoir les styles effectivement utilisés et approuver la nouvelle référence après vérification de l'interface. Ne pas supprimer le test ni actualiser son empreinte sans revue.

### A4 — Dépendances iOS non synchronisées dans le verrou local

- **Priorité :** qualification native requise avant diffusion.
- **Sources :** `ios/Podfile.lock`, `ios/Podfile:37`, `scripts/validate-ios-crashlytics.cjs:30`, `:45`, `package.json:58`.
- **Preuve :** le validateur local signale l'absence de `RNFBCrashlytics`, `FirebaseCrashlytics`, `SdkReactNative` et `DiditSDK/AutoDetection` dans le verrou. Le SDK JavaScript Didit et la configuration native attendent 4.9.1. Les Pods ne sont pas installés sur cette machine Windows.
- **Limite importante :** ce décalage ne prouve pas que le binaire distribué manque de ces modules ou crashe. Une installation CocoaPods sur la machine de build peut résoudre les dépendances. Le contrôle EAS doit être rejoué après cette installation. Les phases de configuration existantes ne remplacent pas la vérification du binaire résultant.
- **Suite proposée, non effectuée :** installer les Pods sur macOS, examiner et conserver le verrou généré, exécuter le validateur, puis tester l'archive iOS, Didit et la remontée d'erreurs symboliquées. Ne pas fabriquer manuellement un `Podfile.lock` pour satisfaire le contrôle.

## Vérifications réellement exécutées

| Vérification | Résultat et portée |
| --- | --- |
| `node scripts/check-release.cjs` | Échec global sur A3. Compatibilités URI/Metro, parité des sources natives, TypeScript, ESLint sans erreurs, frontières réseau et plafond de 400 lignes passent ; 1 296 sources contrôlées. |
| Suite JavaScript globale | 3 369 tests : **3 367 réussis, 1 échec, 1 ignoré**. L'ignoré nécessite Ruby pour la politique de cible de déploiement iOS. Durée de la seule étape de tests : environ 9 min 05 s ; pas une mesure de performance de l'application. |
| `node --test tests/sourceExtractions.test.js` | 6 réussis, 1 échec ; reproduction isolée de A3. Ne pas additionner ces résultats à la suite globale. |
| Sonde locale de sortie de navigation | 4 assertions réussies, dont 2 reproduisent le défaut A1 sous injection d'erreur. Dépendances natives simulées. |
| `node scripts/validate-ios-toolchain.cjs --config-only` | Configuration des images EAS acceptée ; aucun Xcode, SDK installé ni lancement iOS validé. |
| `node scripts/validate-ios-crashlytics.cjs` | Échec local décrit dans A4. |
| Harnais Java Android isolé | Compilation non réalisée : distribution Gradle non disponible pour le wrapper sans accès réseau ; seconde tentative avec Gradle 8.14.3 déjà installé bloquée par le plugin Android 8.11.0 absent du cache hors ligne. Aucun échec de compilation du code Java n'en est déduit. |
| Émulateur Android | Lecture de la version installée : Android API 36, application 1.0.18 / build 176, alors que le projet est en 1.0.20. Pas de recette des modifications actuelles sur ce binaire ancien. |

Exécution JavaScript avec Node 24.22.1. Rapports locaux ignorés : `.expo/audit-crash-20261106-release.log`, `.expo/audit-crash-20261106-snapshot-recheck.log`, `.expo/audit-crash-20261106-probes.{cjs,log}`, `.expo/audit-crash-20261106-java.log` et `.expo/audit-crash-20261106-java-cached.log`.

## Protections existantes examinées

La revue a couvert les sorties de navigation et cartes, les panneaux superposés, les alertes et transitions audio, le GPS arrière-plan, les caches de trajet et l'intégration Didit. Les protections suivantes restent en place ; cet audit ne les modifie pas :

- libération de la carte avant navigation, contrôle de génération, annulation des minuteries et récupération de navigation dans `useNavigationMapLifecycle` ;
- instantanés stables du magasin de panneaux, arbitrage des modales et garde de fermeture iOS ;
- bornes sur les coordonnées, géométries, caches et files d'alertes ;
- durée d'alerte bornée, contrôle de propriétaire et thread audio séparé pour le service Android en arrière-plan ;
- écoute GPS partagée, délais réseau et temporisation des reprises, sans attente réseau préalable à l'affichage des positions.

Les tests du projet incluent des simulations et des contrôles de sources. Ils n'exécutent pas le rendu natif UIKit/Fabric ni les services système réels. Leur réussite ne suffit donc pas à exclure une boucle de rendu sur appareil, un crash de carte, une fuite native ou une terminaison par manque de mémoire.

## Validation restante avant publication

1. Traiter A1/A2 et résoudre le contrôle A3 après revue, sans retirer les garde-fous existants ; rejouer la suite.
2. Produire les builds natifs exacts à distribuer, avec les dépendances iOS synchronisées. Qualifier les transitions carte, navigation et modales, retour arrière, sortie/reprise et changement de compte.
3. Sur Android physique, tester les alertes répétées, déverrouillage, ouverture de l'application, notification concurrente, refus/acceptation et perte réseau ; relever les traces ANR et latences du thread principal. Sur iPhone, compléter la même recette et les interruptions audio, permissions et parcours Didit.
4. Examiner les rapports symboliqués de la nouvelle version (Android vitals/Crashlytics et rapports iOS). Aucune consultation de ces services, aucun essai de paiement/push/SMS réel ni aucune mesure de mémoire, chauffe ou consommation sur appareil n'a été réalisé dans cette passe.

Le guide de rédaction a servi à séparer les résultats mesurés, les hypothèses conditionnelles et les actions proposées. Aucun correctif indiqué comme proposé dans ce rapport n'a été appliqué pendant cet audit.
