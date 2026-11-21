# Audit intégral de l'application Zwanga — 18 novembre 2026

## Conclusion

La vérification automatisée mobile est verte : **4 053 tests réussis, aucun échec, un test ignoré**. Le backend obtient **4 084 tests réussis, aucun échec, un test ignoré**, sur 327 suites validées. **18 scénarios supplémentaires d'intégration mobile/API/PostgreSQL réussissent**, avec des bases jetables. Les lectures connectées contrôlées depuis l'application fonctionnent avec le backend local. Cela ne constitue pas une certification de tous les parcours en production : des défauts d'interface sont confirmés, la voix d'approche est limitée au premier plan, et la validation native et des fournisseurs reste incomplète.

**Avis : validation locale favorable pour le socle JavaScript, mais pas de feu vert global de déploiement.** Corriger les constats fonctionnels ci-dessous et terminer les recettes bloquantes avant de déclarer les nouvelles fonctionnalités validées.

Cet audit n'a corrigé aucun code produit, changé aucun contrat API, installé aucune dépendance, exécuté aucune migration sur la base habituelle et effectué aucun déploiement. Les migrations des intégrations ont été appliquées uniquement à des bases temporaires dédiées aux essais. Les changements de cette intervention sont ce rapport et son entrée dans `CHANGEMENTS_TECHNIQUES.md`. Les modifications préexistantes des dépôts sont conservées.

## Périmètre, méthode et limites

- Application Expo/React Native : authentification/OTP, profil/KYC, rôles et onglets, publication et commandes de trajets, négociation, navigation, localisation, paiements, alertes, services, crédits, flottes et fiche publique QR.
- Backend NestJS : revue des contrats et protections associés, compilation TypeScript, tests automatisés isolés, requêtes HTTP locales en lecture seule et intégrations HTTP/PostgreSQL sur bases jetables séparées.
- Contrôles de dépendances npm mobile/backend et vérification des avis auprès de leurs sources, sans `audit fix`.
- Android : application de développement déjà ouverte, reliée au serveur local ; lectures effectuées avec sa session existante, sans exporter ses jetons. Binaire installé **1.0.18 (176)**, différent de la version source **1.0.20** ; ce n'est pas un nouveau build de livraison.
- Aucun accès ou changement AWS, aucun SMS, push ou paiement réel provoqué. Aucun changement de compte, de permissions ou de réglages dans cet audit. L'état temporaire de diagnostic JavaScript a été supprimé après les lectures.
- Pas de compilation Android/iOS de livraison, pas d'iPhone physique, de parcours routier réel, d'analyse Instruments/Perfetto, de test de charge, de bascule réseau opérateur ou de certification de sécurité exhaustive.
- Les portails admin/partenaire ne sont pas recettés dans un navigateur ici. Leurs parcours opérationnels de contrats et de flotte nécessitent une recette séparée.
- Références Git locales : mobile `857e9a4`, backend `3496b5d`, **avec modifications non commitées**. Le périmètre audité est le contenu présent dans les espaces de travail, pas seulement ces commits et pas une image de production.

Les preuves sont classées en **défaut confirmé**, **risque de configuration**, **écart fonctionnel** et **validation manquante**. Un test utilisant des doubles natifs ou une base simulée n'est pas présenté comme un test sur appareil ou PostgreSQL réel. Aucun taux de couverture de code n'a été mesuré.

## Constats prioritaires

### A1 — Clés React dupliquées dans l'accueil — P2, défaut confirmé

**Sources :** `components/home/HomeDashboard.tsx:35`, `:54`, `:111`.

`HomeLocationButton`, `HomeActivityCards` et `HomeRequestModal` utilisent tous `key={home.currentUser?.id}` sous le même parent. La troisième carte est conditionnelle, mais les deux autres composants partagent déjà la même clé lorsqu'un utilisateur est connecté.

**Preuve :** instanciation du composant réel avec hooks/enfants simulés et compte synthétique : trois enfants identifiés, une seule clé unique. L'avertissement observé pendant la recette Android précédente est cohérent avec ce code.

**Impact :** l'identification des enfants devient ambiguë lors des mises à jour de l'accueil, notamment avec les cartes et modals conditionnels. Risque de conservation ou de réinitialisation inattendue d'état. Cela ne prouve pas un crash natif ni la cause de tous les problèmes GPS signalés.

**Correction proposée, non appliquée :** distinguer les clés par composant tout en conservant leur changement au changement de compte ; ajouter un test de rendu avec les priorités affichées puis masquées. Ne pas supprimer la protection de remise à zéro intercomptes.

La règle d'unicité s'applique aux éléments frères, et non seulement aux éléments d'un même type. [Documentation React](https://react.dev/learn/rendering-lists#rules-of-keys).

### A2 — Les annonces vocales d'approche ne fonctionnent pas en arrière-plan par conception — P1 fonctionnel

**Sources :** `hooks/notifications/usePassengerApproachAnnouncement.ts:17`, `:23`, `:35`, `utils/navigationSpeech.ts:11`, `app.config.js:94`.

Le hook d'approche exige simultanément un écran actif et l'application au premier plan. Il vérifie également `isAppActive()` avant de publier une annonce et retire sa source vocale au nettoyage. Les annonces d'arrivée du conducteur ne sont donc pas garanties quand le passager change d'écran ou verrouille son téléphone : le code les suspend explicitement.

En complément, la voix de navigation est désactivée dans l'émulateur par `Device.isDevice`. La configuration iOS déclarée ne contient pas le mode de fond `audio`. Ces tests locaux ne peuvent pas valider la demande de guidage vocal en veille.

**Impact :** écart avec l'expérience souhaitée de suivi vocal hors application. Il faut distinguer cette limitation de la sonnerie d'une notification et du suivi GPS : ces trois mécanismes ont des cycles de vie différents. Le suivi de localisation possède bien une implémentation d'arrière-plan ; cet audit ne conclut pas qu'il est absent.

**Correction proposée, non appliquée :** définir précisément les annonces qui doivent survivre au changement d'écran et à la veille ; concevoir leur propriétaire de session et leur intégration native, puis tester interruptions téléphoniques, silencieux, Bluetooth, fin de trajet et déconnexion. Ne pas activer globalement le son en arrière-plan sans ces garde-fous : cela pourrait réintroduire une sonnerie persistante ou perturber les appels. Apple distingue explicitement la configuration de session audio et le mode de fond. [Documentation Apple](https://developer.apple.com/documentation/AVFAudio/AVAudioSession/Category-swift.struct/playback).

### A3 — Une commande affiche encore un tarif « /place » — P2, défaut confirmé

**Sources :** `features/trip-request/pricingDescription.ts:11`, `hooks/trip-request/useRequestBudgetSummary.ts:89`.

Le descriptif du prix contient encore `minimum …/place`. Il est utilisé dans le budget de création de commande, malgré la distinction demandée entre prix de la commande et prix par place d'un trajet publié. Un test existant valide même ce texte.

**Impact :** ambiguïté sur ce que le passager doit payer et sur ce que le conducteur accepte. Ce constat porte sur l'affichage ; il ne démontre pas un débit incorrect.

**Correction proposée, non appliquée :** séparer les descriptifs commande/covoiturage et afficher l'unité contractuelle réelle. Le helper est aussi utilisé par `hooks/publish/usePublishPriceEstimate.ts` : un remplacement global risquerait de fausser l'affichage des trajets publiés. Conserver les calculs serveur jusqu'à validation explicite d'un éventuel changement tarifaire.

### A4 — Une nouvelle offre de crédit masque la priorité d'un remboursement — P2, défaut confirmé

**Sources :** `features/pro-services/servicesDashboardModel.ts:4`, `features/pro-services/ServicesScreen.tsx:27`.

L'accueil Services choisit `offered ?? active[0]`. Le détail et l'échéancier ne sont chargés que pour ce crédit prioritaire, lorsqu'il est actif. Avec plusieurs crédits, les échéances des autres contrats ne participent donc pas à la priorité affichée.

**Preuve :** le modèle réel exécuté avec une offre et un crédit actif ayant une échéance passée sélectionne l'offre. Sans offre, l'ordre des crédits actifs décide, pas l'urgence des échéances.

**Impact :** un remboursement urgent peut ne pas apparaître dans « À traiter », alors que le conducteur dispose toujours de l'accès à « Mes crédits ». Ce n'est ni une suppression de dette ni une erreur de prélèvement démontrée.

**Correction proposée, non appliquée :** utiliser une synthèse des échéances de tous les crédits actifs, prioriser retard/échéance proche, puis les nouvelles offres. Éviter un appel réseau par crédit à chaque rendu ; préférer une synthèse serveur ou une lecture groupée. Tester plusieurs crédits, une offre simultanée, zéro crédit et une erreur de détail.

### A5 — Le contrôle de livraison mobile exclut les intégrations `.test.cjs` — P1 de validation

**Sources :** `scripts/check-release.cjs:8`, `tests/integration/bookingBackendE2E.test.cjs`, `tests/integration/assetCreditBackendE2E.test.cjs`.

Le collecteur accepte seulement les fichiers finissant par `.test.js`. Vérification du collecteur réel : **476 fichiers sélectionnés, aucun `.test.cjs`**. Les tests de réservation et de crédit avec intégration backend ne font donc pas partie du résultat vert annoncé par ce script. Le parcours OTP local possède également un exécutable distinct.

**Impact :** un contrôle mobile réussi ne démontre pas que DTO, migrations, verrous PostgreSQL et application mobile fonctionnent ensemble. C'est particulièrement important pour les remboursements et les contrats récemment ajoutés.

**Correction proposée, non appliquée :** conserver le contrôle rapide actuel mais ajouter un contrôle d'intégration explicite, sur base jetable, avec les dépendances nécessaires et arrêt immédiat en cas d'échec. Ne pas lancer automatiquement ces tests sur une base de production ni élargir le glob à tous les helpers `.cjs`.

**Vérification complémentaire de cet audit :** les deux suites `.test.cjs` ont finalement été lancées séparément et leurs 18 scénarios passent. Cela lève le doute pour ces scénarios dans cet environnement, mais ne corrige pas leur omission dans le contrôle standard ni ne valide tous les parcours transactionnels.

### A6 — En développement, une URL API manquante fait utiliser la production — P2, risque de configuration

**Source :** `config/env.ts:21`, `:31`, `:36`.

Sans URL explicite, le repli est l'API de production ; `__DEV__` ne fait qu'afficher un avertissement. Un développeur ou une recette sur une configuration incomplète peut ainsi effectuer des actions réelles.

**Preuve et limite :** comportement établi par lecture du code. Dans la session auditée, l'API était bien locale ; aucun envoi de test vers la production n'a été constaté.

**Correction proposée, non appliquée :** exiger une destination explicite pour les builds de développement/test et refuser les mutations de recette hors d'une liste d'hôtes autorisés. Préserver la compatibilité des builds de production correctement configurés.

### A7 — Agrandissement du texte fortement restreint — P2 accessibilité, risque à confirmer visuellement

**Sources :** `utils/configureFontScaling.ts:3`, `:19`, `app/(tabs)/_layout.tsx:74`.

Le projet configure un plafond global d'agrandissement à 1,15 pour les textes/champs et désactive l'agrandissement des labels de la barre d'onglets. Cette protection contre le débordement peut rendre l'interface moins lisible pour les personnes qui utilisent de grands caractères.

**Limite :** la présence de cette configuration est confirmée ; son effet exact sur chaque composant et chaque version native n'a pas été mesuré. Ce n'est pas une certification d'accessibilité négative de tous les écrans.

**Correction proposée, non appliquée :** tester Dynamic Type/Taille de police avec VoiceOver/TalkBack, privilégier des layouts adaptatifs sur authentification, paiement, navigation et Services, puis limiter seulement les éléments qui en ont réellement besoin.

## Dépendances et sécurité

### Résultats npm et triage

| Dépôt | Dernier résultat du registre, développement inclus | Interprétation vérifiée |
| --- | --- | --- |
| Mobile | 1 dépendance modérée, 0 élevée, 0 critique | `node-forge` reste à traiter |
| Backend | 1 dépendance faible, 0 élevée, 0 critique | `fast-xml-parser` reste à traiter |

Le premier passage renvoyait 49 dépendances affectées par dépôt, dont 48 élevées. Après vérification des sources et nouvelle lecture explicite avec `--include=dev`, le registre ne les remonte plus : l'avis `GHSA-fc5q-39xc-vjpf` a été **retiré le 18 novembre 2026**. Il ne doit pas être présenté comme 48 failles élevées confirmées dans chaque dépôt. Les décomptes npm ne sont ni le nombre de failles indépendantes ni une preuve d'exploitabilité dans Zwanga. [Avis GitHub retiré](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).

- **Mobile : `node-forge` 1.4.1**, présent sous Expo CLI et son outillage de signature. Quatre avis encore présents, dont trois modérés ; version corrigée indiquée : **1.4.3**. Pas d'import applicatif ou d'exploitation dans le binaire mobile établi ici. Prévoir une mise à jour transitive compatible et revalider la génération/signature. [Signature Ed25519](https://github.com/advisories/GHSA-6889-vf6x-f3g5), [TLS/compression](https://github.com/advisories/GHSA-w4xr-hqv8-ch44), [analyse HTTP](https://github.com/advisories/GHSA-6cv4-p8m7-4r25), [TLS/session](https://github.com/advisories/GHSA-j8rw-jp99-435v).
- **Backend : `fast-xml-parser` 5.11.0**, via `firebase-admin` → `@google-cloud/storage`. Avis faible de consommation CPU quadratique lorsque l'option non standard `stopNodes` est utilisée ; version corrigée indiquée : **5.12.0**. Le `TransferManager` installé construit `new XMLParser()` sans cette option ; la recherche dans les sources métier n'a pas trouvé d'usage direct. La présence de la version est confirmée, pas l'exposition d'une route Zwanga à ce cas précis. [Avis du mainteneur](https://github.com/advisories/GHSA-474x-hrwr-fgx4).
- Aucun `npm audit fix --force` exécuté. Les suggestions automatiques comprennent des changements majeurs, voire une ancienne version d'Expo : les appliquer globalement serait disproportionné et risquerait des régressions natives.

### Protections effectivement examinées

- Session mobile : stockage sécurisé, version de session, refresh mutualisé, garde contre les réponses reçues après changement de compte et traitement d'une intention de déconnexion.
- Authentification serveur : limites de fréquence sur login, envoi/vérification OTP et réinitialisation ; séparation des finalités OTP, verrou de concurrence et limitation des renvois. Aucun SMS réel envoyé pour cet audit.
- Publication : vérifications serveur du dossier conducteur et du droit d'utiliser le véhicule ; ne pas se fier seulement au masquage d'un bouton mobile.
- Paiements : distinction déclaration cash/confirmation conducteur, protections contre la transition depuis un paiement fournisseur incertain ; intentions/idempotence examinées pour les opérations sensibles.
- Crédit : contrôle d'accès propriétaire/administrateur, validation des conditions acceptées et des taux ; aucune acceptation, modification ou perception réelle de crédit effectuée.
- QR public : sérialisation explicite des champs. Les crédits publics se limitent au type de bien et au statut actif/soldé, sans montant, échéance, retard ou identifiant de contrat. URL de photo filtrée et indisponibilité du fichier tolérée.

Ces contrôles de code et tests ne remplacent pas une campagne de tests d'intrusion, une analyse de permissions intercomptes exhaustive, ni la validation des politiques réellement déployées.

## Mesures de performance et disponibilité

### Mesures locales de cette intervention

| Contrôle | Résultat observé | Limite |
| --- | --- | --- |
| Liveness HTTP | 200, 147 ms ; recontrôle 200, 153 ms | Deux observations sur le poste local |
| Readiness HTTP | 200, 234 ms ; recontrôle 200, 121 ms | Pas un contrôle de toutes les migrations métier ni de tous les fournisseurs |
| Profil, crédits et organisations sans jeton | 401, environ 60–62 ms | Contrôle de trois routes, pas toute l'autorisation intercomptes |
| Sept lectures authentifiées depuis l'application | Toutes réussies, 483 à 848 ms | Un compte de test, aucun parcours d'écriture |
| Géométrie de navigation, 8 000 points / 500 positions synthétiques | Ancien calcul 1 424 ms ; calcul indexé avec construction 11 ms | Node.js, pas Hermes/appareil, charge du poste non contrôlée |

Lectures forcées contrôlées : catalogue Services, dossier documents, crédits, produits à crédit, dossiers de crédit, affectations de flotte et organisations de flotte. Les réponses métier sont restées dans l'application ; seuls les états, durées et tailles de liste ont servi au diagnostic.

Le benchmark a effectué 18 992 projections de segments avec l'index au lieu de 7 999 000 pour le calcul de comparaison, un seul index construit, sans bénéfice artificiel de positions répétées. Il montre l'intérêt de l'optimisation géométrique existante ; **il ne prouve aucune baisse de chauffe, de batterie, d'ANR ou de latence d'affichage sur téléphone**.

### Risques natifs restant à mesurer

- Carte, bottom sheets et modals : montée en mémoire, pression bitmap, transitions répétées, rotation et très grands caractères sur appareils modestes.
- Alertes : vraie livraison FCM/APNs, délai backend → OS → JS, écran verrouillé, processus absent, batterie restreinte, appel WhatsApp/téléphonique et arrêt du son après réponse.
- Localisation : refus/réactivation, GPS désactivé, révocation en cours de trajet, perte réseau, veille prolongée, redémarrage du processus et absence de double tâche.
- Navigation : trajet complet avec plusieurs passagers, éloignement réel de l'arrivée, passage à 500 m, embarquement/dépose et fin unique ; pas seulement des positions synthétiques.
- Réseau : 2G/latence, coupure après envoi avant réponse, reconnexion socket, changement de compte pendant une requête, quotas et indisponibilité fournisseurs.

La recette Android de localisation déjà consignée le même jour reste disponible dans [le rapport spécialisé](tests-localisation-autorisations-2026-11-18.md). Elle n'a pas été intégralement répétée ici. Ses ANR de démarrage historiques ne sont pas attribués à une cause sans traces natives analysées.

Le relevé ponctuel du buffer Android `am_anr`/`am_crash` pendant cet audit ne contient aucun événement Zwanga. Ce buffer est limité et l'application n'a pas subi de stress natif prolongé : ce résultat ne démontre pas l'absence de crash ou d'ANR.

## Registre des vérifications

| Vérification exécutée | Résultat |
| --- | --- |
| `node scripts/check-release.cjs` | Code 0 ; 4 053 succès, 0 échec, 1 ignoré, durée de la phase tests ~829 s |
| Compatibilité URI/Metro et parité sources natives | Réussies ; parité de fichiers, pas compilation native |
| TypeScript mobile et ESLint global sans correction automatique | Réussis ; ESLint en mode erreurs seulement |
| Frontières réseau et taille des sources | Réussies ; 1 406 sources, aucune au-dessus du seuil de 400 lignes |
| Test Ruby de configuration iOS | Ignoré car Ruby absent ; à exécuter sous macOS/Ruby |
| TypeScript backend, `--noEmit --incremental false -p tsconfig.build.json` | Réussi |
| Jest backend, suites PostgreSQL/Redis réels exclues | Code 0 ; 327 suites réussies, 1 ignorée ; 4 084 tests réussis, 1 ignoré, 0 échec ; ~1 583 s. La suite conditionnelle de migration PawaPay reste ignorée sans binaires PostgreSQL explicitement configurés |
| Intégrations `bookingBackendE2E.test.cjs` et `assetCreditBackendE2E.test.cjs` | Code 0 ; 18 scénarios réussis, aucun échec ni ignoré, ~147 s ; HTTP et PostgreSQL 18 réels, bases jetables |
| Audit npm mobile et backend | Terminés ; code 1 dû aux avis retournés, triage détaillé ci-dessus |
| Benchmark géométrique `scripts/benchmark-driver-route.cjs` | Terminé ; chiffres ci-dessus |
| Lectures API locales anonymes et authentifiées | Résultats ci-dessus ; aucune mutation métier |
| Reproductions des clés React et de la priorité crédit | Défauts confirmés avec données synthétiques sur modules réels |

Les suites PostgreSQL/Redis ont été exclues volontairement du premier passage backend `--testPathIgnorePatterns='postgres|\.redis\.spec'`. Le deuxième passage dédié aux intégrations `.test.cjs` utilise les vrais contrôleurs, DTO, gardes, services et endpoints RTK via HTTP, puis PostgreSQL. Les tables de crédit proviennent des migrations réelles ; la fixture réservation synchronise les entités et applique la migration ciblée de proposition de prix. Cela ne teste pas la chaîne complète de migration depuis une ancienne base de production. Le cache et les fournisseurs externes sont remplacés ; les interfaces natives sont simulées, pas manipulées sur téléphone.

Scénarios d'intégration couverts : prix proposé et consentement exact, trois acceptations concurrentes et réponse perdue sans double consommation des places, refus puis nouvelle réservation, capacité insuffisante et rollback, accès intercomptes interdit, révocation du propriétaire, éligibilité véhicule, commentaires de dossier, formule mensuelle, frais/minimums, anciens contrats d'équipement, taux cumulés, consentement périmé, KYC/rôles et remboursement avec réactualisation du solde. Le scénario de réponse perdue vérifie la reprise d'une opération déjà validée sans doubler la dette ou le débit.

Le premier essai de ces 18 scénarios a échoué au démarrage du PostgreSQL jetable (`pg_ctl`), avant les assertions métier, dans l'exécution restreinte. La relance autorisée hors de cette restriction a réussi. Les helpers ont été vérifiés : environnement réduit, aucun chargement de la configuration applicative, écoute locale sur ports aléatoires, connexions externes bloquées, arrêt du serveur avant suppression avec contrôle du chemin temporaire. Les dossiers et données synthétiques créés par ces essais ont été supprimés automatiquement ; ils ne sont pas conservés. Les anciens dossiers temporaires déjà présents et la base habituelle sont inchangés.

L'environnement exécute **Node 24.11.0**, alors que les deux `package.json` exigent **>=24.22.1 <25**. Les résultats sont réels dans cet environnement, mais la répétition sur la version supportée et le runner de build cible reste nécessaire. Aucun runtime du poste n'a été remplacé.

Les traces brutes locales sont sous `.expo/audit-integral-*2026-11-18*` et ignorées par Git. Elles servent à la vérification locale, pas à être publiées sans revue. Ce rapport ne contient aucun secret, valeur de configuration privée ou donnée personnelle de compte.

## Couverture par domaine

| Domaine | Éléments examinés | Validation restant nécessaire |
| --- | --- | --- |
| Login, inscription, OTP, KYC | Garde mobile, session, champs, throttling, finalité des codes, publication serveur | Livraison réelle SMS, changement de SIM/téléphone, expiration et parcours complet sur nouveau compte |
| Rôles, accueil, recherche, profil | Navigation par catégorie, priorités, clés, textes, QR public | Parcours tactile pour passager, privé, taxi et interurbain sur deux OS |
| Publication, commande directe, négociation | Contrats API, tests métier, descriptif de prix, intégration réelle des réservations et de leur proposition tarifaire | Deux appareils simultanés, marchandage complet de commande, annulation/retrait/changement conducteur, conflits horaires |
| Navigation et localisation | Cycle des subscriptions, fallback REST, suivi de fond, géométrie, clôture | Trajet réel en veille, GPS dégradé et perte réseau, absence de fin prématurée |
| Alertes et voix | Files, arrêts, interruptions, garde foreground, politiques iOS/Android | FCM/APNs réels, plein écran autorisé/refusé, appels concurrents, app tuée |
| Cash, jetons, Mobile Money | États et protections de concurrence/idempotence | Débit unique, callbacks dupliqués/retardés, expiration, refus et réconciliation sur sandbox fournisseur |
| Services, crédits, remboursements, flottes | API locales lues, contrats et modèles, intégrations HTTP/SQL de crédit, priorité d'échéance | Migration complète depuis un schéma ancien, revenus cash/électroniques bout en bout, versements flotte et confirmation partenaire |
| Performance/disponibilité | Contrôles statiques, calcul géométrique, réponses API locales | Profilage natif, longue durée, consommation, charge serveur et reprise après panne |

## Ordre recommandé avant déploiement

1. Corriger A1, A3 et A4 avec tests de non-régression ; préserver l'arrêt des sonneries, les tarifs serveur et la séparation des comptes.
2. Trancher A2 : implémenter et valider le comportement vocal de fond attendu, ou indiquer clairement la limitation au premier plan. Ne pas déclarer le guidage en veille acquis.
3. Intégrer les suites A5 au processus de livraison et étendre la recette aux paiements, au marchandage de commande, aux flottes, aux migrations depuis un ancien schéma et à Redis réel. Les 18 scénarios de réservation/crédit exécutés ici constituent une base, pas la totalité de ces vérifications.
4. Mettre à niveau les dépendances encore concernées de manière ciblée et la version Node de validation. Écarter l'avis retiré du bilan de failles confirmées, sans masquer de nouveaux avis.
5. Sécuriser le repli de configuration A6 et vérifier A7 sur grands caractères et lecteurs d'écran.
6. Construire un Android et un iOS correspondant aux sources auditées. Exécuter la matrice native alertes/localisation/voix/navigation, puis la recette admin/partenaire et les flux fournisseurs en sandbox.
7. Déployer seulement après revue distincte du schéma, de la configuration cible, des versions et du plan de retour arrière. Cet audit n'autorise et n'effectue aucun de ces changements.
