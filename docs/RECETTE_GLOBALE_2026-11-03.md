# Recette mobile et backend — 3 novembre 2026

## Conclusion

**Validation globale non acquise : ne pas considérer cette campagne comme un feu vert de déploiement.** Les deux défauts déterministes du dispositif de test ont été corrigés après la contre-vérification. La dernière recette a atteint le paiement espèces, sa réception, la clôture et les deux notations dans l'application connectée au backend local. Les trois défauts applicatifs constatés lors de ce parcours ont ensuite été corrigés dans les sources, avec tests ciblés et contre-vérification connectée du lien et du cash décrite ci-dessous. Les premiers ANR n'ont pas été reproduits dans les derniers contrôles, sans cause démontrée ; la lenteur du dev build et la validation physique/release restent ouvertes.

Ce document décrit uniquement les mesures de cette campagne, sans reprendre les résultats historiques comme s'ils avaient été rejoués. **La contre-vérification ci-dessous nuance les alertes Android : les nouveaux essais passent, sans démontrer la cause des échecs précédents.**

## Correction des trois défauts applicatifs — 3 novembre

### Solutions appliquées et comportements conservés

1. **Routage externe :** `utils/tripDeepLink.ts` reconnaît le chemin complet avant de choisir navigation, gestion ou détail ; le listener de `components/NotificationHandler.tsx` l'utilise. Options supportées `driverId`, `role`, `track`, `openEdit` conservées ; identifiant du chemin prioritaire et chemins imbriqués invalides rejetés. Les autres liens et les contrôles de propriété des écrans/API ne sont pas modifiés.
2. **Bilan cash :** le calcul commun de `zwanga-backend/src/driver-settlements/driver-settlements.service.ts` utilise `cashReceivedAt` et `cashReceivedAmount` persistés. Un reçu invalide ne devient pas un encaissement ; le montant reçu est borné au montant cash dû et le reste est séparé. Le total additionne chaque part une seule fois. Aucun changement de règlement, commission, bonus, portefeuille, schéma ou requête supplémentaire. Le nouveau champ est également transmis dans le résumé de notification. `types/earnings.ts`, `tripRevenuePresentation.ts` et `DriverBookingRevenue.tsx` affichent « Cash reçu » distinctement des crédits du portefeuille et du restant dû ; le champ est optionnel pour les anciens serveurs. Le total du message est nommé « Total du trajet », pas « Total attendu » lorsque de l'argent est déjà reçu.
3. **Fin manuelle ou d'origine inconnue :** `NavigationTripEndModal.tsx` et `useDriverCompletionActions.ts` utilisent le texte partagé de `tripCompletionCopy.ts` : « Le trajet est terminé. Vous pouvez maintenant noter vos passagers. » Le bilan ne déduit plus une arrivée GPS ni une clôture automatique du seul statut terminé. Le texte sur l'embarquement est retiré de ce bilan. Les événements d'approche, le délai de clôture automatique, les mutations et la navigation de notation ne changent pas.

### Vérifications réellement rejouées

- **Mobile JavaScript : 95/95 réussis.** Neuf fichiers : `tripDeepLink`, `tripCompletionPresentation`, `driverRevenue`, `driverBookingRevenue`, `notificationNavigation`, `driverPaidRequestCompletion`, `navigationLifecycle`, `navigationAssistance`, `sourceExtractions`. Le test du listener monte le vrai `NotificationHandler` avec les adaptateurs natifs simulés et lui transmet les événements `Linking`. Tests de reçus nouveaux/anciens serveurs, montants push sous forme de chaînes, total sans double comptage, voix neutre, déduplication, approche et auto-clôture conservées, arrêt des annonces après démontage, notation et différé conservés. Les erreurs initiales du nouveau banc (adaptateur `StyleSheet`/`Platform`, espaces autour du texte du bouton) ont été corrigées avant cette passe finale.
- **Backend unitaire : 55/55 réussis dans cinq suites.** `driver-trip-cash-revenue.spec.ts`, `driver-booking-revenue.spec.ts`, `driver-cash-subsidy.spec.ts`, `driver-settlements.service.spec.ts`, `bookings/cash-receipts.spec.ts`. Reçus cash complets, plusieurs passagers, complément jetons/cash, reçus absents/invalides, plafonnement/reste, notification et absence de double crédit couverts. Réseau limité au local. Ces tests ne sont pas une nouvelle recette PostgreSQL des paiements.
- **Statique :** TypeScript des deux dépôts, ESLint mobile des fichiers concernés, frontières réseau, parité native et taille des sources réussis. 1 271 sources contrôlées, aucune au-dessus de 400 lignes. Pas de modification native ni de compilation native dans cette passe.
- **Émulateur Android + serveur local relancé :** reprise du dernier trajet synthétique déjà terminé, sans changement d'état métier. Les ouvertures ADB de `zwanga://trip/navigate/<id>` puis `zwanga:///trip/navigate/<id>` atteignent la navigation et son écran de trajet terminé attendu. La lecture RTK de l'identifiant exact est `fulfilled` ; aucune requête de détail à identifiant contenant `/` n'est présente. Captures `.expo/global-e2e-ui-20261103/three-fixes-completed-trip.{png,xml}` et `three-fixes-triple-slash.{png,xml}`.
- **Réconciliation REST/mobile :** le résumé global renvoie 1 200 FC reçus, zéro cash restant, 1 800 FC crédités et 3 000 FC au total. Les mêmes valeurs sont reçues par l'endpoint RTK Query réel du mobile. L'appui sur le récapitulatif d'arrivée ouvre le reçu avec « Cash reçu 1 200 CDF » et « Gains crédités 1 800 CDF », capture `three-fixes-cash-receipt.{png,xml}` dans le même dossier. Aucun second paiement ou encaissement n'a été lancé. La session conducteur est conservée et l'application rendue à l'accueil.

### Limites

Le backend local était arrêté au début de la contre-vérification (`ECONNREFUSED`) ; l'utilisateur l'a relancé avec la même base. Les essais connectés ci-dessus ont ensuite réussi. La cause de cet arrêt n'est pas établie. Le trajet déjà clôturé présente son écran de consultation, pas une nouvelle clôture : la nouvelle copie du modal final et de sa synthèse vocale est donc vérifiée ici par les tests de composants/hooks, sans prétendre l'avoir réécoutée sur appareil physique. Pas de nouveau parcours complet paiement/notation, ni de push réel, de test iPhone, de compilation release ou de certification de stabilité native. Aucun déploiement ni modification de production.

## Dernière recette de bout en bout — 3 novembre

Cette section actualise les constats précédents. Les sections suivantes conservent l'historique des passes antérieures, notamment leur parcours UI alors incomplet. Aucun correctif métier n'est appliqué pendant cette dernière recette.

### Parcours réellement exécuté

- Émulateur Android, application principale de développement installée, JavaScript local et backend local sur le port 5200. Le compte conducteur connecté est celui désigné par l'utilisateur comme compte de test. Un passager synthétique et une demande ciblant uniquement ce conducteur sont créés par les API normales.
- Réception automatique dans Zwanga au premier plan observée avec itinéraire, montant, compte à rebours et accepter/refuser. Une première invitation expire pendant les captures manuelles ; sa demande et son passager fictif sont ensuite annulés/désactivés. Ce dépassement du délai par le testeur n'est pas attribué à l'application.
- Sur la demande suivante, après expiration de l'invitation, ouverture explicite du détail toujours disponible, puis **acceptation par le bouton de l'application** : offre acceptée, demande `driver_selected`, réservation `accepted`, trajet `upcoming`. Le panneau de contact est fermé sans appeler ni écrire à qui que ce soit.
- **Départ via l'interface conducteur** : trajet `ongoing`, navigation affichée. Le contrôleur prépare ensuite la session du passager synthétique ; cette préparation via le runtime n'est pas un test du formulaire de connexion.
- **Embarquement déclaré dans l'interface passager**, toast de réception puis attente de l'autre acteur. La confirmation conducteur est rejouée par l'API normale, ce qui valide `pickedUp` et `pickedUpConfirmedByPassenger`. Ce segment est donc un parcours hybride UI/API, pas deux téléphones conduisant réellement ensemble.
- **Arrivée confirmée dans l'interface passager** : réservation `completed`, dépose confirmée, ouverture du paiement. Une confirmation de dépose conducteur via API rejouée ensuite conserve cet état.
- **Choix espèces via l'interface passager** : 1 200 FC affichés après bonus de bienvenue de 60 % sur le tarif synthétique de 3 000 FC. Le simple choix espèces ne vaut pas encaissement et ne déclenche pas prématurément la notation.
- Retour au conducteur : depuis l'accueil, **« Reprendre la navigation conducteur »**, puis **Plus → Mes gains → Confirmer le cash reçu → Oui, cash reçu**. Lecture serveur : `cashReceivedAt` présent, montant de réservation 1 200, mode cash. Le récapitulatif par réservation distingue 1 800 de gains crédités et 1 200 de cash reçu ; aucun débit Mobile Money n'est lancé.
- **Panneau « Paiement reçu »** effectivement affiché au conducteur ; après fermeture, **panneau centré « Terminer le trajet ? »** avec arrivée et paiement confirmés. Appui sur terminer : trajet `completed`. Ce test ne distingue pas à lui seul une livraison socket d'une récupération REST.
- **Notation conducteur → passager** via l'interface : personne unique identifiée, aucune étoile présélectionnée, choix explicite de 4/5, envoi et retour à l'accueil.
- Retour au passager : **« Paiement confirmé », « Rien à payer de nouveau »**, puis **« Noter le conducteur »**. Choix explicite de 5/5, envoi et retour à l'accueil.
- Lecture PostgreSQL finale, limitée au seul trajet synthétique : **deux avis distincts**, 4/5 du conducteur et 5/5 du passager, tous deux `verificationVersion=1`. Réservation terminée, dépose et cash confirmés. Le statut technique de paiement reste `not_required` pour le cash ; la preuve d'encaissement est le champ dédié, pas un faux succès de paiement électronique.

Preuves locales : `.expo/global-e2e-connected-20261103-final.json`, captures/XML `.expo/global-e2e-ui-20261103/final-e2e-*`, lecture SQL finale sans identifiants dans la sortie. Les captures comportent des informations de comptes de test : ne pas les publier brutes. Les deux retours à l'accueil sont capturés dans `final-e2e-{driver,passenger}-rating-home`.

### Défauts reproduits pendant cette passe

1. **Lien externe vers la navigation conducteur mal interprété.** À chaud, `zwanga://trip/navigate/<id>` et sa variante sans hôte `zwanga:///trip/navigate/<id>` aboutissent à « Trajet introuvable ». La requête `getTripById` contient `navigate/<id>` (45 caractères) au lieu du seul UUID ; elle reçoit HTTP 404, alors que la lecture du même trajet par son identifiant réel réussit. `components/NotificationHandler.tsx` traite `trip/manage/` explicitement, puis tous les autres `trip/` comme un détail : il manque le cas `trip/navigate/`. Reproduction répétée avec les deux liens. **La reprise depuis le bouton de l'accueil fonctionne** et a permis de finir la recette. Le problème ne démontre pas une panne de toutes les ouvertures depuis notification ; les chemins utilisant directement le routeur ne sont pas équivalents à ce lien externe.
2. **Récapitulatif global de clôture ambigu malgré un cash enregistré.** Après « Oui, cash reçu », le reçu par réservation et le panneau de paiement affichent correctement la réception. Mais le panneau final du trajet affiche encore **« À recevoir en cash »** pour 1 200 FC. `features/driver-payments/tripRevenuePresentation.ts` présente toujours `cashToCollectAmount` comme à recevoir. Dans `zwanga-backend/src/driver-settlements/driver-settlements.service.ts`, le calcul de ce champ additionne les montants des réservations cash terminées sans distinguer `cashReceivedAt`. Il faut distinguer le cash déjà reçu du restant dans le contrat et la présentation du résumé global ; aucune seconde collecte n'a été exécutée pendant le test.
3. **Texte de fin automatique après une action manuelle.** Après appui sur « Terminer le trajet », `features/driver-navigation/NavigationTripEndModal.tsx` affiche « terminé automatiquement » et une arrivée détectée à environ 942 mètres, alors que la clôture a été volontairement simulée sans déplacement GPS. Le texte sur l'embarquement automatique reste aussi présent dans ce panneau final. Cela ne prouve pas une clôture GPS à 942 mètres : **c'est le scénario de clôture manuelle et sa présentation qui sont observés**. Le panneau initial de confirmation centré et la nouvelle interface de notation sont, eux, lisibles dans les captures.

Ces trois constats ont été documentés sans correction pendant la demande de test, puis traités à la demande suivante dans la section « Correction des trois défauts applicatifs » ci-dessus. Ne pas confondre un message trompeur avec une perte comptable : la réception du cash et les avis ont été vérifiés en base locale.

### Reprise du banc et précautions

- Le backend local a cessé de répondre en cours de parcours ; son ancien processus n'était plus présent. L'utilisateur l'a relancé avec la même base, puis `/health/live` a répondu HTTP 200. Le trajet en cours a été repris sans réinitialisation ni nouvelle demande. La cause de cet arrêt n'a pas été établie ; ce n'est pas une preuve de panne de production.
- `scripts/audits/connected-local-session.cjs` conserve les événements, permet la préparation/restauration des sessions fictives et refuse une navigation si le rôle attendu n'est pas effectivement connecté. L'adoption du conducteur n'est validée qu'après lecture réussie de son profil et de ses véhicules.
- Le compilateur d'expressions du débogueur Hermes rejette la syntaxe `async` injectée. L'outillage utilise maintenant une chaîne de promesses et un drapeau de fin sans secret. Ce défaut du banc empêchait le changement de rôle ; ce n'était pas une erreur du code métier compilé par Metro.
- Pour reprendre le seul passager créé par ce contrôleur après perte des identifiants en mémoire, une action de récupération explicite vérifie conducteur, trajet en cours, description synthétique exacte, compte passager actif fictif et création datant de moins d'une heure. Elle exige un seul résultat. Son mot de passe fictif est renouvelé dans une transaction courte avec comparaison de l'ancien hash, puis la connexion normale est utilisée. Le guide PostgreSQL a orienté cette transaction bornée ; aucun compte préexistant ni schéma n'a été modifié. Aucune valeur d'identifiant, de mot de passe ou de jeton n'est consignée ici.
- Le lien du contrôleur utilise désormais la forme à trois barres ; cela **ne corrige pas** le défaut applicatif décrit plus haut. Pour cette recette, la reprise conducteur s'est faite par le bouton de l'accueil. Les délais de capture ADB et quelques captures prises avant la fin d'une transition sont conservés comme limites du banc, pas transformés en succès de l'application.
- Session conducteur initiale restaurée avant arrêt du contrôleur. Le trajet synthétique terminé, ses deux avis, le compte fictif associé et les écritures comptables locales restent archivés comme preuve. Pas d'effacement forcé de données financières, pas de compte réel supprimé. Le premier scénario non accepté a été annulé et son unique compte synthétique désactivé. Le backend et Metro sont laissés actifs.

### Vérifications complémentaires de cette passe

- Deux scénarios cross-repository HTTP réel local + PostgreSQL + Redis + actions mobiles : **2 réussis, 78 hors sélection**, sortie 0, environ 179,5 secondes de suite. Les deux expirations réelles de 40 secondes ont relayé après **40 288 ms et 40 946 ms** dans ce banc. Preuves : `.expo/global-e2e-sequential-probe-20261103-last-e2e.{log,json}`. Le transport fournisseur est un faux FCM local ; ces délais ne sont pas une mesure de production.
- Matrice native de présentation rejouée entièrement : **19 contrôles réussis, sortie 0**. Carte et actions, montant, déduplication, rejet/indisponibilité du validateur, repli natif, événements expirés, récupération WorkManager, réveil de l'écran, absence de plein écran sans accord Android, plein écran avec accord et bandeau hors application déverrouillée. Preuve : `.expo/final-e2e-native-delivery-20261103/native-matrix.json` ; la ligne descriptive de périmètre n'est pas comptée comme un contrôle.
- Service audio natif rejoué entièrement : **11 scénarios réussis, sortie 0**. Publication Notifee tardive sans doublon, audio/bandeau hors app après huit secondes, notification sonore concurrente, deux pertes temporaires de focus, perte permanente avec carte conservée, veille/déverrouillage, maintien du bandeau après notification concurrente, relais de premier plan, arrêt à la décision et à l'échéance métier. Preuves : `.expo/final-e2e-native-audio-20261103/results.json`, captures et journaux associés.
- Ces deux matrices utilisent le paquet séparé `com.zwanga.audit` avec les sources natives et un validateur local simulé. Elles vérifient les états du lecteur/service et de SystemUI, **pas une mesure acoustique ni une livraison FCM/APNs réelle**. Les cartes/services du banc ont été retirés, son accord plein écran réinitialisé, puis l'application principale et la session conducteur locale restaurées. Aucun droit du paquet principal n'a été forcé.
- ESLint de l'outillage modifié, taille des sources (**1 269 sources, aucun dépassement**) et `git diff --check` des deux dépôts réussis. La garde globale précédente n'est pas comptée comme réexécutée ici.
- Les lectures des événements Android pendant le parcours n'ont pas trouvé de nouvel événement ANR/crash de l'application dans les fenêtres consultées. Pas de test de charge, de mesure de chauffe ou de certification d'absence de crash. Le binaire principal reste l'ancien dev build ; iOS et les vrais encaissements FlexPay ne sont pas testés dans cette passe.

## Correctifs et consolidation après contre-vérification — 3 novembre

### Solutions effectivement appliquées

- **Mobile :** revue des changements volontaires de notation (fond, espacements, dimensions accessibles et couleur d'action) puis mise à jour de la seule empreinte de `features/screen-styles/app/rate/detail/index.ts` dans `tests/fixtures/sourceExtractions.json`. Les 74 clés restent contrôlées ; les références des autres styles et des API restent inchangées. Aucun retour à l'ancienne interface et aucune assertion supprimée.
- **Backend :** `src/trip-requests/dispatch/sequential-dispatch.postgres.spec.ts` initialise désormais une fois par suite le schéma de reçus avec les migrations existantes `1780000093000`, `1780000094000` et `1780000106000`. Les colonnes de reprise déjà créées par la synchronisation ORM sont recréées par les migrations dans une transaction, uniquement dans la base neuve jetable. Le guide PostgreSQL a orienté ce traitement transactionnel, sans changement de migration déployée.
- **Parcours croisé :** `test/sequential-mobile-flow.ts` réutilise ce schéma courant au lieu de recréer puis retirer un ancien schéma pour chaque scénario. Le nettoyage entre tests reste assuré par la fixture. La colonne `audioEvents` est donc disponible pour le vrai gestionnaire HTTP des reçus. Aucun contrôle de propriétaire, délai de relais, déduplication ou assertion métier n'est assoupli.
- **Outillage local :** ajout du mode `notifications` à `scripts/audits/run-global-local-tests.cjs` pour exécuter séparément les tests PostgreSQL existants des reprises push et de la télémétrie audio. Environnement minimal, garde réseau locale et sélection explicite des binaires PostgreSQL conservés ; aucun chargement du fichier d'environnement de l'application.

### Vérifications réalisées après correction

- Tests mobiles ciblés (`sourceExtractions`, `ratingUx`, `ratingPresentation`, `ratingLifecycle`, `startupSession`) : **44 réussis, aucun échec ni test ignoré**, environ 10,7 s. Preuve : `.expo/consolidation-targeted-20261103.log`.
- Deux variantes HTTP mobile/backend rejouées : **2 réussies, 78 cas hors sélection ignorés**, environ 137,1 s. PostgreSQL et Redis locaux, création HTTP, publication vers un faux FCM local, reçu, refus/relais, deux expirations réelles de 40 secondes puis acceptation et protection contre les doublons. Preuve : `.expo/global-e2e-sequential-probe-20261103-fix.{log,json}`. Le composant mobile d'actions est exécuté ; il ne s'agit pas d'un parcours dans l'interface ni d'une réception FCM réelle.
- Suite complète du relais séquentiel après correction : **79 réussis, aucun échec, 1 benchmark optionnel ignoré**, environ 373,3 s. Elle inclut les deux scénarios précédents, les types de véhicules multiples, la concurrence, les récupérations Redis/SQL et le test avec 211 000 notifications historiques synthétiques. Preuve : `.expo/global-e2e-sequential-20261103-fix.{log,json}`. Les deux relais chronométrés passent autour de 40 secondes ; la durée de suite n'est pas une mesure de latence de production.
- TypeScript backend : sortie **0**, sans erreur. Preuve : `.expo/global-e2e-types-20261103-fix.log`.
- Reprises push et reçus audio sur PostgreSQL isolé : **4 réussis, aucun échec ni test ignoré**, environ 69,4 s. Vérification du délai `Retry-After`, changement de jeton après échec permanent, télémétrie bornée/idempotente avec refus d'un autre compte, retour arrière et réapplication de migration. Preuve : `.expo/global-e2e-notifications-20261103-fix.{log,json}`.
- Garde mobile complète `scripts/check-release.cjs` : **sortie 0**, correctifs URI/Metro présents, cohérence des sources natives, TypeScript, ESLint, frontière réseau et taille des sources validés (1 269 sources, aucun dépassement). Régressions : **3 191 réussies, aucun échec, 1 test ignoré sur 3 192**, environ 446,3 s pour cette phase. Le test ignoré nécessite Ruby/macOS pour vérifier la politique des cibles iOS. Preuve : `.expo/consolidation-release-20261103.log`. Cette garde ne compile pas le natif et ne remplace pas les essais sur appareils.
- Vérification des différences des deux dépôts : `git diff --check` réussi. Les changements préexistants de documentation/outillage sont conservés. Les suites ciblées et globales se recouvrent ; leurs comptes ne sont pas additionnés comme une couverture unique.

### Comportements conservés et limites

Aucun code métier mobile/backend, permission native, dépendance ou migration de production n'est changé par ces correctifs. La nouvelle UX de notation, les contrats HTTP, le relais séquentiel et les protections financières restent conservés. Aucun déploiement ni changement de la base utilisée par l'application.

Les paragraphes d'audit et de contre-vérification ci-dessous restent les preuves historiques **avant correction** ; leurs deux échecs de test ne décrivent plus l'état corrigé. Les essais natifs ne sont pas rejoués dans cette passe. Aucune correction de démarrage, suppression des ANR ou stabilité release n'est annoncée : il faut encore un binaire principal récent, des mesures de démarrage hors dev launcher et les essais physiques Android/iOS. Les résultats locaux ne certifient ni l'écoute effective de la sonnerie ni la livraison APNs/FCM réelle.

## Contre-vérification demandée le 3 novembre

Objectif : reproduire les quatre constats séparément, sans suites lourdes simultanées, sans correctif métier ni relâchement des assertions.

| Constat | Nouvelle exécution | Conclusion limitée aux essais effectués |
| --- | --- | --- |
| Présentation Android | Même matrice rejouée trois fois ; **19 contrôles réussis à chaque passage**, trois sorties 0 | Échecs précédents non reproduits dans ces conditions. Pas de preuve d'une correction ni de garantie sur tous les appareils. |
| ANR | Un démarrage à froid et trois retours arrière-plan/premier plan ; aucun nouvel événement ANR/crash dans les journaux observés | ANR précédent non reproduit. Démarrage à froid non validé : écran blanc et session encore non restaurée au contrôle initial. |
| Styles de notation | `sourceExtractions.test.js` seul : **6 réussis, 1 échec** | Même divergence de 74 clés/empreinte des styles de notation. Échec déterministe confirmé. |
| Reçu mobile/backend | Deux variantes cross-repository rejouées seules : **2 échecs, 78 tests hors sélection ignorés** | Même HTTP 500, PostgreSQL 42703, colonne `audioEvents` absente de la fixture. Cause reproduite. |

### Précisions Android et démarrage

- Aucun changement à `test-native-ride-delivery.cjs`, à ses délais ou assertions entre les trois passages. Les scénarios plein écran réservation, demande proche, offre de dispatch et repli natif sont tous passés, ainsi que le maintien du premier plan de l'autre application sur téléphone déverrouillé. Les 57 exécutions représentent **19 contrôles répétés**, pas 57 scénarios différents.
- Le banc reste `com.zwanga.audit` avec un validateur HTTP simulé local, pas une livraison FCM de production ni une validation iOS.
- Pour l'application principale, le premier lancement via le dev client rapporte `TotalTime=16318 ms` dans Android. Après une attente supplémentaire de 12 secondes puis les opérations de capture, l'écran est encore blanc et le runtime n'a pas restauré sa session. Ce temps Android n'est pas un temps d'accueil utilisable.
- Le script s'arrête alors en échec : **les deux autres démarrages à froid prévus n'ont pas été exécutés**. Il n'a pas été modifié pour faire passer ce constat. Une inspection ultérieure constate la session restaurée, l'accueil affiché et les requêtes locales abouties. La durée exacte de l'écran blanc n'a pas été mesurée en continu.
- Les trois retours arrière-plan/premier plan sont ensuite exécutés séparément et réussissent : session conservée, application visible, pas de dialogue d'erreur ni nouveau crash/ANR. Les captures confirment l'accueil. Cela n'annule pas l'observation du démarrage lent.
- La route de santé locale `/health/live` répond HTTP 200. Aucun diagnostic d'indisponibilité du backend n'est établi. L'événement ANR historique déjà présent avant l'essai n'est pas recompté.
- L'allègement de la charge peut contribuer aux différences avec la première campagne, mais la causalité n'est pas prouvée. Les résultats ne permettent ni de certifier un bug natif systématique, ni de déclarer le problème définitivement résolu.

### Preuves et modifications de l'outillage uniquement

- `.expo/recheck-native-20261103-run{1,2,3}.log` et dossiers `native-matrix.json` : trois matrices complètes.
- `.expo/recheck-style-20261103.log` : nouvelle divergence identique ; les changements de marges, fond et bouton sont visibles dans le commit UX existant. La référence n'a pas été régénérée.
- `.expo/global-e2e-sequential-probe-20261103-recheck.{log,json}` : deux erreurs identiques, durée de suite d'environ 37,3 s. PostgreSQL et Redis jetables, transport externe interdit par le test, aucune migration appliquée à la base de l'application.
- `.expo/recheck-startup-20261103/` : lancement à froid, capture blanche et échec conservé ; `.expo/recheck-startup-20261103-resume/` : trois reprises réussies. Capture d'accueil après récupération : `.expo/global-e2e-ui-20261103/recheck-delayed-startup.png`. Artefacts locaux potentiellement identifiants : ne pas publier bruts.
- Ajout de `scripts/audits/recheck-local-startup.cjs` : contrôle préalable du runtime de développement local, émulateur explicite, démarrage/reprise sans effacement de données, comparaison des événements Android avec une référence initiale, captures et bilan. Mode `resume` distinct pour ne pas écraser l'échec à froid.
- `scripts/audits/run-global-local-tests.cjs` accepte désormais un suffixe de rapport validé, afin de conserver les premières preuves. Les assertions, le schéma SQL et le code métier restent inchangés.
- ESLint ciblé et contrôle de taille réussis ; 1 269 sources contrôlées, aucun dépassement. Aucun compte ni trajet créé ou supprimé pendant cette contre-vérification. Backend utilisateur et Metro laissés actifs ; aucun déploiement.

**État actualisé : deux défauts du dispositif de test confirmés ; défauts Android précédents non reproduits dans cette passe, avec une lenteur de démarrage du dev build à investiguer. La validation release et le parcours complet à deux rôles restent à faire.**

## Environnement et périmètre

- Sources au début de campagne : mobile `d4045b9`, backend `55b7ae9`. Aucun changement fonctionnel de ces sources pendant cette recette.
- Windows, Node 24.22.1, PostgreSQL 18/PostGIS pour les bases jetables ; Redis local pour la suite de dispatch séquentiel.
- Backend de développement local sur le port 5200 et Metro sur 8081, déjà démarrés par l'utilisateur. Ils sont laissés en fonctionnement.
- Émulateur Android API 36. Application principale installée : **dev build 176 / 1.0.18**, alimentée par le JavaScript local. Ce binaire ne valide pas les dernières modifications natives de l'application principale.
- Banc Android séparé `com.zwanga.audit`, assemblé et installé avec les sources Java actuelles et Notifee (Gradle a réutilisé ses tâches à jour). Son intégration React Native/interface métier est simulée ; ce n'est pas le binaire principal complet.
- Compte conducteur connecté confirmé par l'utilisateur comme compte de test ; passager fictif créé pour cette seule recette et demande ciblant uniquement ce conducteur.
- Aucun déploiement, changement de production ou paiement prestataire volontaire. Les suites isolées empêchent les connexions hors boucle locale. Le backend déjà lancé par l'utilisateur n'a pas été instrumenté pour attribuer la réception à FCM, socket ou REST : **cette réception ne prouve pas le transport push distant**.
- Pas d'appareil physique ni d'environnement Xcode/iOS pour cette campagne.

## Résultats exécutés

Les suites se recouvrent : ne pas additionner les lignes pour annoncer un total de scénarios indépendants.

| Vérification | Résultat observé | Portée réelle |
| --- | --- | --- |
| Garde globale mobile `check-release.cjs` | 3 190 tests réussis, 1 échec, 1 ignoré | JavaScript et contrôles statiques ; sortie en échec |
| TypeScript, ESLint, taille, frontière réseau, parité native dans cette garde | Réussis avant la suite JS | Pas une compilation de release |
| Backend Jest global | 279 suites réussies, 38 ignorées ; 3 410 tests réussis, 760 ignorés | Tests isolés, intégrations nécessitant des services ignorées dans cette passe |
| TypeScript backend | Réussi | Vérification sans émission |
| Neuf suites PostgreSQL complémentaires | 245 tests réussis : 201 puis 44, aucun échec | Bases jetables ; les 44 initialement ignorés ont été exécutés dans la seconde passe |
| Dispatch séquentiel PostgreSQL + Redis + adaptateurs mobile | 77 réussis, 2 échecs, 1 ignoré | HTTP réel local, concurrence et délais ; publication fournisseur simulée |
| Compilation du banc Android actuel | Réussie | Gradle debug, pas un build release de l'application |
| Service audio natif Android | 11 scénarios réussis, sortie 0 | État du service, du lecteur et des notifications sur émulateur ; pas de mesure acoustique |
| Matrice native de livraison, dernière relance | 16 contrôles réussis puis échec sur l'offre de dispatch | Campagne interrompue ; scénarios suivants non validés |
| Parcours dans l'application principale et backend local | Création, réception en premier plan, acceptation, départ, déclaration conducteur d'embarquement vérifiés | Parcours à deux rôles incomplet ; voir ci-dessous |
| Vérification iOS locale | Échec du contrôle des Pods attendus | Checkout Windows sans installation CocoaPods validée ; pas une preuve d'échec d'archive EAS |

Les durées de suite (environ 768 s mobile, 773 s backend global, 278 s dispatch) sont des durées du banc sous charge. **Elles ne mesurent ni la latence utilisateur, ni la capacité du serveur en production.**

## Constats à traiter avant validation

### 1. Présentation native Android non stable dans la matrice

Une première tentative a été interrompue par un délai ADB. La relance suivante a validé 15 contrôles puis échoué sur la visibilité plein écran de `trip_request_nearby`, alors que le `fullScreenIntent` était présent. La dernière relance, une fois les autres suites lourdes terminées, a passé ce scénario mais échoué sur l'offre `driver_dispatch_offer` : `completed=false`, aucune carte observée.

Le résultat ne démontre pas une cause unique. Contraintes de temps de la validation serveur, publication Notifee, état de l'émulateur et attentes du banc restent à départager. Il serait incorrect de transformer cette intermittence en succès en augmentant simplement les délais du test.

Contrôles effectivement réussis dans la dernière relance : carte visible et actions, prix/places/horaire, déduplication sans prolongation, demande partagée, refus explicite du validateur, validateur indisponible, repli après échec Notifee, réservation tardive silencieuse, exclusion de l'auteur, offre expirée, publication tardive sans résurrection, reprise WorkManager, réveil de l'écran, autorisation locale insuffisante sans droit Android, plein écran réservation et demande proche avec droit Android.

Non atteints après l'échec final : plein écran de secours et scénario final téléphone déverrouillé de cette matrice. Les essais audio séparés vérifient le maintien du bandeau, mais ne remplacent pas ces scénarios.

Preuves : `.expo/global-e2e-native-delivery-retry-20261103.log`, `.expo/global-e2e-native-delivery-final-20261103.log` et dossiers de résultats correspondants. Le tableau de résultats contient également une ligne descriptive de périmètre, exclue des comptes de contrôles ci-dessus.

### 2. ANR réellement observés sur le dev build

- ANR lors d'un changement de focus : Android rapporte `Input dispatching timed out`, attente de 5 439 ms ; sortie de processus pour ANR à 15:48 UTC. RSS enregistrée à cette sortie : 857 Mo, sans mesure comparable de référence.
- Au redémarrage, autre dialogue « ne répond pas ». La trace du thread principal de ce démarrage passe par l'initialisation `DevLauncherController`, la réflexion Kotlin et `MainApplication.onCreate`.
- Après « Attendre », l'application a repris et le parcours local a été exécuté.

Le lancement de plusieurs suites et de l'émulateur sollicitait la machine. C'est un facteur possible, pas une causalité démontrée. Le chemin Dev Launcher est propre au développement ; il ne permet pas d'attribuer cet ANR au build App Store/Play Store. Les autres crashs/arrêts historiques présents dans `exit-info` précèdent cette campagne et ne sont pas comptés comme reproductions nouvelles.

Avant certification : refaire démarrage, reprise et navigation avec un binaire récent, puis un build release, sur appareils physiques. Aucune affirmation d'absence de crash, ANR, fuite mémoire ou chauffe n'est possible ici.

Preuves locales : `.expo/global-e2e-exit-info-20261103.txt`, `.expo/global-e2e-anr-dropbox-20261103.txt`, `.expo/global-e2e-last-anr-20261103.txt` et captures du dev build. Le journal Dropbox peut contenir des traces étrangères à cette application : ne retenir que celles décrites ci-dessus.

### 3. Deux intégrations mobile/backend bloquées par la fixture SQL

Les deux variantes `local cross-repository flow` échouent sur l'accusé de réception HTTP après création de la notification. Une relance ciblée avec journalisation des exceptions confirme PostgreSQL `42703` : colonne `audioEvents` absente de `ride_notification_receipts`.

`zwanga-backend/test/sequential-mobile-flow.ts` initialise les anciennes migrations des reçus et de reprise, alors que `src/notifications/ride-notification-receipt.ts` écrit désormais `audioEvents`. La migration `1780000106000-AlertDeliveryReliability.ts` définit ce champ, avec d'autres changements et une exigence de transaction.

La fixture doit être alignée sur le schéma courant, sans modifier une ancienne migration déployée ni appliquer aveuglément une migration dont certaines colonnes existent déjà via la synchronisation ORM du test. **Ce constat concerne la base jetable du test, pas une preuve de colonne absente en production.** Aucune migration de production n'a été exécutée.

Le vrai délai de relais de 40 secondes a passé son test (environ 41,6 s dans ce banc), ainsi que des scénarios de concurrence et de repli Redis/SQL. Cela ne suffit pas à valider les deux parcours bloqués.

Preuves : `.expo/global-e2e-sequential-20261103.{log,json}` et `.expo/global-e2e-sequential-probe-20261103.{log,json}`.

### 4. Garde mobile bloquée par une référence de styles

`tests/sourceExtractions.test.js` échoue pour `features/screen-styles/app/rate/detail/index.ts` : le nombre de clés reste 74, mais l'empreinte des valeurs diffère de `tests/fixtures/sourceExtractions.json` après les changements de notation. Cette référence nécessite une revue des différences puis une mise à jour intentionnelle si elles sont correctes. Elle n'a pas été régénérée pour masquer l'échec.

Il s'agit d'un blocage réel de la garde de build, pas d'un crash de l'application démontré par ce test.

### 5. Validation iOS encore manquante

Le contrôle local signale les Pods Crashlytics absents ainsi que les Pods Didit absents ou incompatibles avec le SDK installé. Ce checkout Windows ne permet pas de conclure sur une installation CocoaPods propre en CI macOS. Refaire `pod install`, contrôle de cohérence, archive et essais TestFlight. Aucun essai iPhone de sonnerie, déverrouillage, paiement ou notation n'a été effectué.

## Parcours réel vérifié et limites

1. Session locale et rôle conducteur contrôlés, sans afficher de jeton d'authentification.
2. Inscription API d'un passager fictif ; création API d'une demande ciblant le seul conducteur de test.
3. Apparition automatique dans Zwanga au premier plan : demande, compte à rebours, itinéraire, prix et actions accepter/refuser.
4. Appui sur accepter : serveur en `driver_selected`, offre acceptée, affichage de la confirmation et du détail. Le panneau de contact a été fermé sans passer d'appel.
5. Appui sur « Aller chercher le passager », puis confirmation de départ : trajet créé et navigation conducteur affichée.
6. Déclaration manuelle d'embarquement : toast de succès et attente de la confirmation passager, sans confirmer artificiellement sa présence.

Le passage vers une session passager dans la vraie interface n'a pas été mené à terme. Le contrôleur initial ne conservait pas ses identifiants fictifs ; le nettoyage de son compte a ensuite rendu ce scénario inutilisable pour la suite. **Paiement, réception du paiement conducteur, panneau de fin de course et notation ne sont donc pas validés ici comme un enchaînement UI complet.** Leurs tests JavaScript et PostgreSQL restent des preuves d'un autre niveau.

Les intégrations PostgreSQL exécutées couvrent notamment paiements mixtes, repli espèces, cohérence des montants, réception conducteur par socket/REST, changement de conducteur, rotation des sessions et inscription. Les opérateurs de paiement y sont simulés : aucun encaissement Mobile Money réel n'est certifié.

## Service audio : 11 scénarios natifs réussis

- Publication Notifee tardive sans double lecteur ni extension de l'échéance.
- Service, sonnerie et bandeau encore actifs après huit secondes hors application.
- Autre notification sonore sans arrêt du lecteur.
- Perte transitoire de focus et atténuation : reprise sans nouvelle alerte.
- Perte permanente de focus : arrêt du son, maintien de la carte en attente.
- Mise en veille, réveil et déverrouillage hors application.
- Bandeau et lecteur après déverrouillage puis notification concurrente.
- Entrée dans l'application : retrait du bandeau épinglé et relais du lecteur de premier plan.
- Décision : arrêt du service sans recréation de la carte.
- Expiration métier : arrêt audio et service.

Les deux reprises de focus sont deux scénarios distincts dans le rapport. Preuve : `.expo/global-e2e-native-audio-20261103/results.json` (11 entrées), captures et trace du banc associées. Ces résultats ne garantissent pas le même comportement sur tous les constructeurs Android ni sur iOS.

## Outillage ajouté et précautions

- `scripts/audits/run-global-local-tests.cjs` : orchestration des suites backend avec environnement minimal, garde réseau locale et PostgreSQL jetable explicitement sélectionné. Les lectures SQL de la session connectée sont en transactions courtes et en lecture seule, conformément au guide PostgreSQL utilisé pour ces essais.
- `scripts/audits/mobile-runtime-probe.cjs` : inspection du runtime Metro local, vérification d'adresse locale et captures réservées à l'émulateur ; sorties sans jetons. Les images/XML sont conservés sous `.expo`, pas dans la documentation versionnée.
- `scripts/audits/connected-local-session.cjs` : actions locales explicites, compte conducteur désigné, passager fictif et demande ciblée ; identifiants en mémoire seulement. Le contrôleur conserve désormais les événements entre reprises et ne désactive plus le passager si l'annulation de sa demande échoue.
- `scripts/audits/nest-local-errors.cjs` : journalisation des exceptions uniquement pour la relance Jest ciblée sur données synthétiques.

Pas de modification de logique métier mobile/backend, permission native, migration ou dépendance. Les échecs de test restent visibles ; aucune référence n'a été assouplie pour obtenir un résultat vert.

### Nettoyage effectué

L'annulation initiale de la demande était refusée car le trajet était déjà démarré. Le contrôleur initial a néanmoins désactivé/anonymisé **son unique passager fictif**, ce qui a annulé sa réservation. Cet ordre de nettoyage a été corrigé dans le contrôleur de test, pas dans l'application.

Le trajet fictif vide a ensuite été identifié par conducteur, description, libellé de test, fenêtre de création et absence de réservation non annulée, puis clôturé par les API normales. Réponse vérifiée : `completed`. Les traces métier restent archivées, aucune suppression SQL directe. Le passager fictif n'est pas restauré ; aucun compte préexistant n'a été supprimé. Cette clôture administrative d'un trajet vide n'est pas comptée comme un test du paiement/fin de course passager.

Les bases jetables sont gérées par les scripts de suites ; le backend et Metro de l'utilisateur sont laissés actifs. Les cartes/services du banc Android sont retirés et son accord plein écran réinitialisé en fin de matrice. Aucun changement d'autorisation du paquet principal n'a été utilisé pour faire passer le banc.

## Vérifications finales et suite recommandée

- ESLint ciblé des quatre scripts d'audit réussi ; contrôle de taille réussi (1 269 sources, aucun dépassement de 400 lignes) ; `git diff --check` réussi. Le backend n'a aucun changement de fichiers issu de cette campagne.
- Corriger la fixture de reçus et revoir la référence de styles ; rejouer les suites en échec.
- Isoler le défaut de présentation native, puis rejouer la matrice entièrement sans interruption.
- Fournir un binaire principal récent et finir le parcours conducteur/passager avec validation des deux côtés, paiement simulé contrôlé, reçu, fin et notation.
- Valider séparément iOS/TestFlight, Android release sur plusieurs constructeurs et les vrais transports FCM/APNs sur un environnement de test. Les conditions hors réseau, application tuée, écran verrouillé et refus de permissions doivent faire partie de cette recette finale.

Les journaux `.expo` contiennent des preuves locales temporaires, potentiellement des données du compte de test. Ne pas les publier bruts ni les joindre à un rapport public.
