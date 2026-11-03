# Audit mobile et backend — 3 novembre 2026

## Conclusion

**Avis : ne pas considérer cette révision comme validée pour la production.** Deux défauts prioritaires sont reproduits : une boucle de rendu dans les reçus conducteur et une suppression d'alertes encore pertinentes lors du retour dans l'application. Le contrôle de livraison mobile est rouge. Le backend passe les tests unitaires exécutés et l'intégration des reçus de paiement, mais cela ne valide ni la réception réelle FCM/APNs ni une archive iOS.

Audit des sources mobile `855c6fe` et backend `302dca6`, avec arbres de travail propres au début. Lecture transversale, tests existants, sondes ciblées et banc natif Android isolé. Ce document n'est pas une certification exhaustive de tous les écrans ou de tous les appareils.

Aucun correctif fonctionnel appliqué, aucun déploiement, aucune modification de compte ou de paiement de production. Seuls ce rapport et son entrée de journal sont destinés à être versionnés. Les sondes et sorties locales se trouvent dans `.expo/` et ne sont pas versionnées. Les vérifications de sécurité et de transactions suivent respectivement les guides `security-best-practices` et `supabase-postgres-best-practices` ; aucun service Supabase n'a été utilisé.

Suivi : les corrections et résultats **postérieurs** à cet instantané sont consignés
dans [CORRECTIFS_AUDIT_GLOBAL_2026-11-03.md](CORRECTIFS_AUDIT_GLOBAL_2026-11-03.md).

## Périmètre

- Mobile : reprise d'activité, navigation, panneaux partagés, sonnerie premier/arrière-plan, relais natif Android, restauration iOS, voix d'approche, paiement d'arrivée, notation et proposition de fin de course.
- Backend : dispatch/reprise des offres, disponibilité, notifications persistées, reçus et vérification des paiements, authentification/OTP, frontières réseau, transactions et isolation des utilisateurs.
- Livraison : TypeScript, ESLint, garde de release, dépendances npm, parité des sources natives, CocoaPods et compilation du banc Android.
- Non exécuté : audit AWS/production, charge distribuée, campagne de vrais push, paiement opérateur réel, test terrain GPS, build release complet ou essai iPhone physique.

## Constats prioritaires

### A01 — P1 : boucle de rendu à l'ouverture des reçus conducteur — reproduite

**Sources :** `features/driver-navigation/DriverDropoffReceipts.tsx:23`, `features/navigation/RideModal.tsx:55`, `features/navigation/rideOverlayStore.ts:57`, `features/navigation/RideOverlayProvider.tsx:13`.

Le composant qui produit le panneau s'abonne à l'objet complet `active` via `useRideOverlay()`. Son panneau republie des enfants JSX dans `store.put()` à chaque rendu. Cette publication modifie l'objet observé et déclenche un nouveau rendu du producteur, qui republie ses enfants.

**Preuve :** la sonde `.expo/audit-driver-receipt-loop.cjs` monte le vrai composant, le vrai `RideModal` et le vrai store avec React/React DOM ; l'ouverture provoque `Maximum update depth exceeded`. Les primitives d'affichage natives sont simulées. Le test réussit parce qu'il attend cette erreur, pas parce que le défaut serait corrigé.

**Impact :** rupture du rendu dans la navigation conducteur après une dépose, lorsqu'on ouvre le récapitulatif. Le code est partagé iOS/Android ; un arrêt du processus natif sur chaque plateforme n'a pas été démontré. Ce défaut est distinct du chemin passager déjà corrigé.

**Correctif proposé, non appliqué :** utiliser le snapshot booléen existant `useHasRideOverlay()` pour le producteur ; ajouter un test de rendu réel couvrant ouverture, mise à jour d'un reçu et fermeture. Conserver les priorités paiement/SOS, le masquage du récapitulatif et le panneau intégré, sans réintroduire d'empilement de modals natifs. Le contrat de stabilité des snapshots est décrit dans la [documentation React](https://react.dev/reference/react/useSyncExternalStore).

### A02 — P1 : une vérification momentanément impossible est traitée comme une fin d'alerte — reproduite

**Sources :** `services/rideRingValidation.ts:22`, `hooks/notifications/useRideRinging.ts:188`, `services/driverNotifications.ts:46` et `:315`, `services/rideAlertSession.ts:38` et `:134`.

`validateRideRing()` renvoie le même booléen `false` pour un refus serveur, une panne réseau, un timeout, une capacité absente et une expiration. Au retour au premier plan, ce résultat appelle `dismissDriverInvitation()`. Cette fonction acquitte l'alerte, annule sa carte et inscrit sa clé parmi les décisions locales ; un nouvel enregistrement de la même alerte est ensuite ignoré.

Une seconde incohérence concerne le secours iOS : `store/api/driverAlertRecoveryApi.ts:18` récupère la boîte de notifications et vérifie le détail par REST. Cette récupération peut légitimement restaurer une demande sans `ringValidationToken`. Dans le backend, `notifications.service.ts:614` ajoute ce jeton à une copie destinée au transport, alors que `findAllByUser()` (`:1463`) renvoie les lignes persistées. Au prochain passage `inactive → active`, la demande récupérée est donc rejetée faute de jeton.

**Preuve :** deux sondes dans `.expo/audit-alert-resume-probe.cjs` utilisent le hook et le validateur réels, avec transport/système simulés. Elles confirment l'appel du chemin de suppression sans aucune action accepter/refuser, pour une panne REST puis pour une demande récupérée via le modèle REST. L'acquittement durable en mémoire est établi par la lecture de la fonction appelée ; les opérations natives de suppression sont simulées dans ces sondes.

**Impact :** une coupure brève ou une interruption iOS peut faire perdre le guidage et empêcher la reprise sonore du même événement, bien que le conducteur n'ait pas répondu. Les deux tests iOS de reprise existants échouent également ; leurs anciennes données ne contiennent pas la nouvelle capacité. Ils ne suffisent pas seuls à démontrer un échec avec un push récent correctement signé.

**Correctif proposé, non appliqué :** distinguer `autorisé`, `refusé définitivement` et `indisponible temporairement`. Sur indisponibilité, conserver l'opportunité, sans son non autorisé ni acquittement de décision, et réessayer de manière bornée avant l'échéance. Donner un contrat cohérent au secours REST : capacité fraîche fournie par le serveur ou validation authentifiée de disponibilité adaptée. Ne jamais prolonger une offre, réactiver une demande annulée ni contourner le contrôle d'appartenance.

### A03 — P2 : le contrôle sonore empêche aussi la restauration silencieuse d'une demande — reproduite

**Sources :** `hooks/notifications/useRideRinging.ts:103` et `:133`, `services/rideRingValidation.ts:26`, `tests/rideAlertEntryRestore.test.js:9`.

Le contrôle exige une échéance sonore encore future avant d'atteindre la restauration `entryOnly`. Une carte conservée après la fin du son est donc annulée au lieu de devenir un candidat silencieux à l'ouverture du détail. Une échéance sonore passée ne prouve pourtant pas, à elle seule, qu'une demande non affectée n'est plus consultable.

**Preuve :** les deux cas Android/iOS de `rideAlertEntryRestore.test.js` échouent, puis échouent à nouveau dans une exécution séquentielle isolée. Aucune sonnerie périmée n'est demandée par ces tests : seulement une entrée de navigation silencieuse.

**Impact UX :** retour possible à l'accueil au lieu du détail attendu ; disparition d'un repère permettant d'identifier la sonnerie passée.

**Correctif proposé, non appliqué :** séparer droit de sonner et droit d'afficher/consulter. Vérifier la disponibilité métier avant acceptation et conserver un accès silencieux aux demandes encore valides. Les offres réellement expirées, refusées ou affectées ailleurs doivent rester exclues.

### A04 — P2 sécurité : la vérification FlexPay peut être désactivée sans garde de production — conditionnel

**Sources backend :** `src/payments/payments.controller.ts:44`, `src/payments/payments.service.ts:569`, `:616` et `:1751`, `src/payments/payments.service.spec.ts:536`.

Le callback générique est public. La vérification fournisseur est active par défaut, mais la configuration permet de la désactiver sans vérifier que l'environnement est un bac à sable. Pour les transactions hors recharges de portefeuille et hors retraits, le chemin restant peut enregistrer un succès à partir du contenu non signé du callback.

**Preuve :** branche explicite dans le service et test existant qui attend `SUCCEEDED` sans appel de vérification fournisseur quand l'option est désactivée. Ce test appartient à la suite backend exécutée.

**Impact conditionnel :** si cette option était désactivée en production, une personne disposant des identifiants d'une transaction pourrait tenter de falsifier sa confirmation. La configuration réelle de production n'a pas été consultée : aucune exposition active n'est affirmée.

**Protections conservées :** les recharges de jetons et les retraits imposent déjà leur vérification ; ne pas généraliser ce constat à ces chemins. Les callbacks PawaPay vérifiés ne sont pas concernés par cette option.

**Correctif proposé, non appliqué :** interdire cette désactivation hors environnement de test explicitement autorisé, avec garde au démarrage et test. Conserver la vérification fournisseur, l'idempotence et le rapprochement des paiements ; ne pas accepter davantage de callbacks pour « débloquer » l'UX.

### A05 — P2 : intégration native iOS locale non validée

**Sources :** `ios/Podfile.lock`, `scripts/validate-ios-crashlytics.cjs`, `scripts/prepare-ios-native.cjs`, hook `eas-build-post-install` de `package.json`.

Le diagnostic local signale des Pods Crashlytics absents et les Pods Didit attendus en version 4.9.1 absents ou incompatibles. Le contrôle de configuration de l'outillage iOS passe, mais aucune résolution CocoaPods ou archive Xcode ne peut être faite ici sous Windows.

**Impact :** la cohérence JavaScript ne suffit pas à valider les modules natifs et la collecte des symboles. C'est une lacune de validation de release, pas la preuve que l'archive EAS déployée utilise ce lock ni qu'un crash précis en découle. Une installation CocoaPods sur EAS peut produire un état différent.

**Action proposée :** sur macOS, exécuter `npm run prepare:ios-native`, conserver le lock réellement généré, construire une archive release, contrôler les symboles Crashlytics et tester KYC, permissions, audio et transitions des panneaux sur iPhone. Ne pas modifier les versions du lock à la main pour faire passer le contrôle.

### A06 — P2 : la validation globale de livraison est rouge et le banc d'alertes a pris du retard

**Sources :** `scripts/check-release.cjs`, `tests/iosRingingWake.test.js`, `tests/rideAlertEntryRestore.test.js`, `tests/navigationHeaders.test.js:10`, `tests/sourceExtractions.test.js:26`, `scripts/audits/test-native-ride-delivery.cjs:40`, `tests/android/ride-alert-harness/src/main/AndroidManifest.xml:3`.

Le contrôle mobile termine avec **6 échecs**, confirmés par une seconde passe ciblée :

- 2 reprises iOS : anciens messages sans la nouvelle capacité, à mettre en cohérence avec A02 et le contrat réseau ;
- 2 restaurations silencieuses Android/iOS : A03 ;
- 1 test d'assemblage navigation conducteur : le mock React Native n'expose pas `Platform`, utilisé par les nouvelles dépendances ; ce résultat ne démontre pas un `Platform` manquant dans une vraie application ;
- 1 empreinte `userApi` devenue obsolète après l'ajout de l'OTP de changement de mot de passe. La sécurité OTP ne doit pas être retirée pour satisfaire l'ancienne empreinte.

Le banc Android existant échoue aussi sur la première demande proche : il n'envoie pas de capacité et son manifeste retire volontairement Internet. La nouvelle prévalidation rend ce scénario incapable de vérifier une livraison complète de demande. Les premiers scénarios de réservation restent fonctionnels.

Côté backend, la vérification TypeScript incluant les tests remonte **62 diagnostics dans 32 fichiers `.spec.ts`** ; la compilation des sources de production avec `tsconfig.build.json` passe. Ne pas confondre ces erreurs de typage des tests avec un échec de compilation du serveur livré.

**Action proposée :** réparer les scénarios selon leurs contrats réels, sans ignorer les tests ni actualiser aveuglément les empreintes. Ajouter au banc natif un serveur local de validation isolé pour les demandes et des scénarios de dégradation réseau. Conserver l'interdiction de contacter la production. Ajouter un vrai rendu React des producteurs de panneaux, absent des simples tests de modèle.

### A07 — P3 performance : contention possible dans la présentation native Android — risque, pas ANR mesuré

**Sources :** `native/android/notifications/RideCardDelivery.java:78`, `:98` et `:126`, `native/android/notifications/RideUnlockBanner.java:64`, `native/android/notifications/RideAlertAudioService.java:31` et `:178`.

La publication garde `NativeRideDelivery.LOCK` pendant des lectures de notifications système et une attente pouvant cumuler 15 pauses de 20 ms. Certaines reprises postées sur le thread principal utilisent le même verrou. Le service audio contrôle aussi son état toutes les 500 ms avec des appels système.

**Impact possible :** latence de transition et saccades lorsque le système ou plusieurs publications sont ralentis. Ces 300 ms d'attente ne constituent pas à elles seules une preuve d'ANR. Aucun ANR attribuable à ce chemin n'a été reproduit dans cette campagne. Android souligne que les appels Binder ralentis et les verrous peuvent bloquer l'interface : [diagnostic officiel des ANR](https://developer.android.com/topic/performance/anrs/diagnose-and-fix-anrs).

**Amélioration proposée :** sortir les observations lentes du verrou global, puis revérifier atomiquement propriétaire et génération ; réduire les lectures redondantes. Mesurer avec Perfetto/StrictMode sur appareils modestes avant de changer les cadences. Conserver impérativement « carte visible avant audio », les échéances et la protection contre les doublons.

Autre point de rendu à mesurer : `components/ActiveRideResumeCoordinator.tsx:55` s'abonne à l'objet complet du panneau alors qu'il utilise seulement son store. Cela provoque du travail évitable lors des mises à jour des panneaux ; aucune boucle propre à ce coordinateur n'a été démontrée.

### A08 — P3 sécurité : alertes de dépendances restantes, sans vulnérabilité haute/critique signalée

`npm audit --json`, dépendances de développement incluses, retourne :

- mobile : **48 modérées et 1 faible** ;
- backend : **35 modérées et 1 faible** ;
- **0 haute et 0 critique** pour les deux instantanés.

Ce sont des entrées de paquets affectés, pas autant de vulnérabilités distinctes ni de chemins exploitables en production. Parmi les causes communes : [amplification de globparts dans minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) et [annulation incomplète de parcours dans glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).

L'exposition effective dépend de la provenance des motifs et de leur usage au runtime ; elle n'a pas été démontrée par une attaque. Planifier des mises à jour compatibles Expo/React Native/Nest, séparer les outils de build des dépendances réellement utilisées en production, puis rejouer les tests. Ne pas appliquer `npm audit fix --force` : les propositions automatiques comprennent des changements majeurs incompatibles. Aucun lock ou package modifié pendant cet audit.

## Résultats exécutés

Les campagnes ci-dessous se recouvrent : leurs nombres ne doivent pas être additionnés comme une couverture unique.

| Vérification | Résultat observé | Limite |
| --- | --- | --- |
| Mobile, garde de release complète | TypeScript, ESLint erreurs, frontières réseau, parité native, compatibilités URI/images et taille réussis ; 1 264 sources sous la limite | Parité des sources ≠ compilation native |
| Suite mobile complète | 3 164 tests : **3 157 réussis, 6 échoués, 1 ignoré** ; environ 903 s pour l'étape de tests | Test ignoré dépendant de Ruby ; durée de test, pas une mesure des performances de l'app |
| Nouvelle exécution des 4 fichiers en échec | 24 tests : 18 réussis, mêmes 6 échecs | Écarte un simple effet de concurrence de la première campagne |
| Sonde réelle React du reçu conducteur | 1 reproduction réussie de l'erreur attendue | Hôte React DOM et primitives natives simulées, pas un crash natif mesuré |
| Sondes de reprise d'alerte | 2 reproductions réussies du chemin de suppression indésirable | Réseau et AppState simulés |
| Backend, Jest global | **275 suites réussies**, 38 ignorées ; **3 373 tests réussis**, 755 ignorés | Intégrations opt-in non exécutées dans cette passe ; le wrapper PowerShell a retourné 1, mais le résumé Jest ne contient aucune suite échouée : ces nombres décrivent le résultat des tests, pas un feu vert global du processus |
| Backend TypeScript production | Réussi, `tsc -p tsconfig.build.json --noEmit --incremental false` | Pas un déploiement ni un test de charge |
| Backend TypeScript avec tests | 62 diagnostics de typage dans les fichiers de tests | Ne pas annoncer le contrôle TypeScript intégral vert |
| Reçus de paiement PostgreSQL/socket/REST/mobile | **6 tests réussis**, rapport JSON `success: true` | Nouvelle base locale PostGIS, fournisseurs et authentification de test ; pas d'argent ni de paiement opérateur réel |
| Dispatch et changement de conducteur sur PostgreSQL | **156 tests réussis**, 2 suites, rapport JSON `success: true` | Clusters temporaires, transport fournisseur simulé ; pas de Redis distribué ni de vrais push |
| Compilation Android du banc isolé | `assembleDebug` hors ligne réussi, 34 tâches | Sources Java courantes + Notifee, application de test, pas APK/AAB release Zwanga |
| Présentation native sur émulateur API 36 | 15 assertions/scénarios validés dans la matrice adaptée | Réservations pour le chemin positif ; demandes seulement pour refus sans capacité/expiration |
| Service audio natif sur le même émulateur | 11 scénarios validés | État du lecteur contrôlé, pas mesure acoustique ni validation de toutes les marques |
| Diagnostics iOS | Configuration d'outillage valide ; contrôle des Pods en échec | Pas de macOS, archive ou appareil iOS testé |

### Intégration financière réellement exercée

La suite `src/notifications/driver-payment-postgres.spec.ts` crée son propre cluster PostgreSQL local. Elle vérifie rollback sans reçu, unicité sur rejeu, socket suivi d'une lecture REST authentifiée, récupération REST après socket manqué, acquittement isolé par destinataire, parsing et phrase mobile, distinction choix des espèces/encaissement réel, débit mixte et confirmation cash concurrents. Les adaptateurs de transport et d'authentification restent des composants de test.

Le premier lancement a été bloqué par les permissions du bac à sable au démarrage de PostgreSQL. Le second, autorisé pour ce cluster temporaire, passe les 6 tests. Ce premier incident n'est pas classé comme défaut applicatif. Le cluster temporaire est arrêté et nettoyé par la suite ; aucun schéma métier existant n'est modifié.

### Dispatch et changement de conducteur réellement exercés

`src/trip-requests/dispatch/dispatch-postgres.spec.ts` passe **127 tests** et `src/trip-requests/change-request-driver.postgres.spec.ts` **29 tests**, sur des clusters PostgreSQL/PostGIS éphémères. Durée de la campagne : environ 184 secondes, non assimilable à une latence utilisateur.

La campagne couvre notamment les acceptations concurrentes et les horaires compatibles/incompatibles, la limite stricte des positions de moins de 48 heures et la reprise après actualisation, les candidats en file, refus/expiration, récupération des notifications et réouverture de la demande après changement de conducteur. Les verrous et mutations SQL sont réels ; le transport fournisseur est simulé, et la branche optionnelle d'injection vers l'émulateur n'est pas activée. Ce résultat ne certifie pas le transport complet d'une demande sur téléphone ni le fonctionnement de Redis en cluster.

### Scénarios Android réellement exercés

Le paquet installé/testé est **`com.zwanga.audit`**, pas le compte de l'application Zwanga. Pas de permission Internet dans ce banc. Les données sont synthétiques.

- Carte et actions de réservation, prix/destination, doublon sans nouvelle échéance, secours de publication, réservation tardive silencieuse, rejet de sa propre demande et d'une offre périmée.
- Reprise WorkManager sans moteur JavaScript, réveil de l'écran, carte seule sans autorisation système, plein écran avec autorisation, maintien de l'application courante sur téléphone déverrouillé.
- Publication tardive, son/bandeau après huit secondes hors app, notification audible concurrente, interruption audio temporaire, baisse temporaire de volume, perte permanente du focus conservant une carte silencieuse.
- Veille puis déverrouillage hors app, présence du bandeau après une notification concurrente, transfert du lecteur à l'entrée, arrêt à la suppression/décision et à l'échéance métier.

Les scripts originaux injectant une demande proche sans capacité ne passent plus la nouvelle admission. Deux adaptateurs locaux limitent donc explicitement les chemins positifs aux **réservations** ; aucune validation de sécurité n'est désactivée dans le code natif. Cela ne valide pas le parcours serveur → FCM → téléphone d'une demande proche.

L'émulateur utilise des pages mémoire de 4 Ko. Aucun artefact release récent n'a été validé pour 16 Ko. Aucun résultat sur Samsung/Xiaomi ou iPhone physique n'est extrapolé de ce banc.

## Protections constatées et à conserver

- Outbox et événements de paiement persistés dans la transaction, clés de déduplication, récupération REST lorsqu'un socket manque ; les tests financiers isolés corroborent ces garanties sur leurs scénarios.
- Dispatch avec échéances, exclusions et verrous métier ; Redis sert d'accélérateur et la récupération SQL existe. Une confirmation FCM d'envoi ne doit pas être confondue avec une carte réellement affichée ou un son audible.
- Validation des entrées et contrôles d'appartenance, révocation/session, limitation d'authentification, OTP bornés et preuves à usage unique. Aucun besoin de retirer ces contrôles pour améliorer l'UX.
- Côté mobile, renouvellement de session mutualisé, contrôles de session sur les retours asynchrones, cartes et sonnerie dédupliquées, délais de reprise bornés, priorité aux paiements et aux alertes de sécurité.
- La notation ne devient disponible qu'après le statut de réservation et le paiement requis ; une recharge seule ou le choix du cash ne suffit pas. La proposition de terminer une course reste soumise à son état réel et à l'absence de passagers restant à traiter.
- Les annonces d'approche réutilisent les positions et le lecteur existants. Les seuils restent approximatifs : les tests ne prouvent pas une précision GPS réelle à dix mètres.

## Ordre de correction et critères de sortie

1. Corriger A01 puis tester avec React réel les reçus, paiements, confirmation de fin de course et SOS.
2. Corriger A02/A03 avec un résultat réseau à trois états et une distinction son/navigation. Tester réception valide, indisponibilité temporaire, expiration, annulation, refus, changement de compte et secours iOS REST.
3. Réparer le garde de livraison A06 ; le relancer intégralement sans exclusions opportunistes. Préserver le contrat OTP et fournir des fixtures de demande compatibles avec la nouvelle validation.
4. Verrouiller la configuration de vérification financière A04 ; conserver les tests transactionnels/idempotents.
5. Résoudre et archiver les dépendances natives iOS, puis faire une recette release iPhone et Android physique avec Crashlytics/Android vitals. Déployer le backend compatible avant un mobile exigeant la capacité de sonnerie.
6. Mesurer les verrous/IPC Android et les rendus ; traiter les dépendances vulnérables avec des versions compatibles.

Critères non acquis : taux réel de réception sonore, latence p95 du dispatch, charge API/SQL/Redis, démarrage à froid, mémoire/FPS/chauffe sur appareil, contraintes OEM et validation des binaires iOS/Android release. Aucun « zéro crash », « zéro ANR » ou « sonnerie garantie » n'est annoncé.

## Traces et reproduction locales

- `.expo/audit-global-mobile-20261103.log` : garde mobile complète.
- `.expo/audit-failures-recheck-20261103.log` : confirmation ciblée des 6 échecs.
- `.expo/audit-driver-receipt-loop.cjs` et son log daté : reproduction du composant réel.
- `.expo/audit-alert-resume-probe.cjs` et son log daté : deux sondes de reprise.
- `.expo/audit-global-backend-20261103.log`, `.expo/audit-backend-typescript-20261103.log`, `.expo/audit-backend-build-typescript-20261103.log`.
- `.expo/audit-driver-payment-integration-retry-20261103.json` : preuve structurée des 6 tests d'intégration.
- `.expo/audit-dispatch-integration-20261103.json` : preuve structurée des 156 tests de dispatch/changement de conducteur.
- `.expo/audit-native-build-cached-20261103.log`, `.expo/audit-native-delivery-20261103.log` : compilation et limite du scénario original.
- `.expo/audit-booking-delivery-20261103/native-matrix.json`, `.expo/audit-booking-audio-20261103/results.json` : matrices positives limitées aux réservations.
- `.expo/audit-mobile-dependencies-online-20261103.json`, `.expo/audit-backend-dependencies-online-20261103.json` : sorties npm ; la sortie mobile contient aussi des notices npm et n'est pas un JSON pur.

Commandes principales : Node 24.22.1, `node scripts/check-release.cjs`, `node --test --test-concurrency=1` sur les quatre fichiers indiqués, Jest `--runInBand`, TypeScript sans émission, Gradle `assembleDebug --offline` dans `tests/android/ride-alert-harness`. Les intégrations PostgreSQL utilisent uniquement leurs variables de chemins de binaires de test et des ports loopback aléatoires, pas la configuration applicative.
