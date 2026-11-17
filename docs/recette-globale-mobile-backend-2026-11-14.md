# Recette globale mobile / backend — 14 novembre 2026

## Correctifs du 14 novembre — suite de la recette

Cette section décrit les corrections appliquées après les constats historiques ci-dessous. Les passages « non corrigé » des reprises précédentes relatent l'état au moment de ces essais, pas celui après cette intervention.

### Modifications appliquées

- **Détail passager** : `features/request-detail/RequestSearchScreen.tsx` donne aux composants frères `PassengerPriceOffers` et `RequestTargetDriver` des clés distinctes (`offers:` / `target:`), toutes deux liées à la commande. Une nouvelle offre ou un rafraîchissement conserve leur identité et les opérations en cours ; changer de commande remet bien les deux composants à zéro. `tests/requestSearchScreen.test.js` vérifie l'unicité, la stabilité et le changement des clés. Il ne prétend pas reproduire un crash natif.
- **Description de l'estimation de publication** : `hooks/publish/usePublishPriceEstimate.ts` lit `option.pricing` pour le véhicule sélectionné, avec `quote.pricing` en repli pour les anciens serveurs. `tests/publishPriceEstimate.test.js` vérifie les trois types, le repli ancien et l'absence d'explication inventée quand aucun tarif n'est fourni. Le prix manuel reste inchangé ; aucun montant facturé ou calcul par place/commande n'est modifié.
- **Notification de gain, test backend** : `src/driver-settlements/driver-cash-subsidy.spec.ts` fournit le `findOne` manquant au faux dépôt, conforme à la relecture du gain après commit. L'assertion d'un seul envoi est conservée et complétée par le type, le montant et la devise du message. Le service réel n'est pas modifié.
- **Carte de recherche, test backend** : `src/trip-requests/request-search-map.spec.ts` attend le quatrième paramètre `false`, qui maintient la restriction au conducteur ciblé dans la carte normale. Une assertion du filtre SQL complète celle des paramètres ; aucun filtre de visibilité ou d'identité n'est retiré.
- **Récupération de retrait, fixture PostgreSQL** : `src/database/driver-payout-recovery-postgres.spec.ts` inclut désormais `assetRepaymentAmount numeric(12,2) NOT NULL DEFAULT 0`, conformément à l'entité actuelle, et utilise un INSERT avec colonnes explicites. Un scénario avec remboursement matériel non nul vérifie qu'il reste déduit après libération du retrait non payé. Le guide PostgreSQL a orienté le type monétaire exact et la séparation de la base jetable ; aucune migration ou écriture dans la base habituelle.
- **Distribution des alertes, scénario inter-dépôts** : `test/sequential-mobile-flow.ts` crée une commande fictive à 2 500 FC au lieu de 1 000 FC afin de franchir le minimum métier existant. Le parcours utilise toujours les vrais contrôleurs HTTP, les actions JavaScript mobile et PostgreSQL/Redis jetables ; seul le transport FCM est redirigé vers un serveur local. Aucun changement du mécanisme d'alerte, aucune suppression d'assertion de refus, expiration, acceptation ou idempotence.

### Vérifications rejouées

- Les deux nouveaux tests mobile ont effectivement échoué avant les deux correctifs produit, puis passé après. Ensemble ciblé : **28 réussis, aucun échec** (`requestSearchScreen`, `publishPriceEstimate`, `requestVehiclePricingHint`, `publishEstimateHttp`). Les tests HTTP de publication utilisent un serveur de test, pas une application native.
- Deux suites unitaires backend : **23/23**, après reproduction des deux échecs initiaux ; aucune assertion métier supprimée.
- Récupération de retrait sur PostgreSQL jetable : **7/7**, dont les six anciens scénarios et la nouvelle vérification du crédit matériel.
- Suite dispatch PostgreSQL/Redis complète : **94 réussis, aucun échec, un benchmark de charge non sélectionné**. Les deux parcours inter-dépôts précédemment bloqués passent (environ 5 s et 85 s). Première livraison au faux fournisseur local : 209 et 480 ms ; deux relais à expiration réelle : 41 031 et 40 940 ms. Ce sont des mesures locales sans charge, pas une latence push de production ni une validation du bandeau ou de la sonnerie native.
- Préparation des commandes et tarification serveur : **23/23**, incluant le rejet de prix inférieurs au minimum avant stockage/envoi d'alerte.
- Contrôle release mobile complet : **code 0, 3 830 tests réussis, aucun échec, un contrôle Ruby/iOS ignoré sur Windows**. TypeScript, ESLint, compatibilités URI/Metro, parité des sources natives, frontières réseau et taille des sources passent. Ce contrôle n'est pas une compilation Android/iOS.
- TypeScript backend global : `tsc --noEmit --incremental false`, code 0 ; `git diff --check` réussi dans les deux dépôts.
- Suite backend globale (Jest `--runInBand --silent`, environnement minimal, intégrations opt-in non activées) : arrêt à la limite de **600 000 ms**, `ETIMEDOUT` / `SIGTERM`, sans rapport JSON final. Ne pas reprendre les compteurs de la recette précédente comme résultat de ce lancement. Ce dépassement ne démontre pas une panne d'un endpoint métier ; il empêche de certifier la suite globale. Les quatre ensembles ciblés ci-dessus totalisent **147 tests backend réussis**.

Preuves locales : `.expo/isolated-e2e-2026-11-14-backend-regressions-corrections-baseline.{log,json}` puis rapports suffixés `corrections` pour `backend-regressions`, `postgres-recovery`, `sequential` et `release`, ainsi que `.expo/pricing-guards-corrections-20261114.json`. Ces fichiers de travail ne sont pas destinés à être publiés.

### Limites restantes

Le premier contrôle Android observe `com.zwanga` au premier plan, sans runtime JavaScript connecté au serveur de développement. La capture `corrections-20261114-runtime.png` sous `.expo/global-e2e-ui-20261103/` montre « Reloading… ». Le serveur Metro répond pourtant sur son endpoint de statut. Deux relances manuelles du seul dev client, sans effacement des données, sont ensuite réalisées :

1. Première relance : activité lancée en environ 26 secondes, runtime Metro retrouvé et écran d'accueil non authentifié rendu, mais dialogue **« zwanga isn't responding »** dans `corrections-20261114-reopened.png`. À **11:21:58 UTC**, l'événement Android `am_anr` indique `failed to complete startup`. La trace lue via `dumpsys dropbox --print data_app_anr` concerne la build **1.0.18/176**, Android 16 x86_64 ; le thread principal est `Runnable` dans `androidx.activity.ComponentActivity.<init>`, via `MainActivity.<init>`. Elle ne pointe pas vers les composants passager ni vers le service audio. La trace seule ne distingue pas une lenteur native intrinsèque d'une contention du dispositif ; ne pas en déduire un correctif applicatif précis.
2. Seconde relance, après la fin des grosses suites : lancement en environ 15,6 secondes, runtime connecté au backend local, lecture `getAppUpdate` réussie et accueil de connexion visible sans dialogue d'erreur dans `corrections-20261114-final-launch.png`. Aucun nouvel événement `am_anr` dans l'échantillon de journal contrôlé après ce lancement. Ce rejeu ponctuel ne prouve pas que le premier ANR est résolu, ni que la charge du poste était sa cause.

`lastanr` indiquait pourtant « aucun ANR depuis le démarrage » lors du premier contrôle : ce résultat négatif ne doit pas primer sur l'événement système, la trace DropBox et le dialogue effectivement observés. Le tampon de crash conserve aussi les incidents Bluetooth système précédents. Aucun fichier natif modifié ; aucune garantie de disparition des ANR/crashs, aucun parcours tactile complet des commandes, aucun essai iOS ou sur téléphone physique. L'émulateur reste sur l'accueil de connexion, non authentifié ; aucune session d'un compte réel ou donnée de test supplémentaire créée.

Les interruptions intermittentes du backend local, le repli cartographique en pointillés et le parcours tactile complet du marchandage restent à isoler/rejouer. Ils ne sont pas présentés comme corrigés par les changements ci-dessus. Aucun déploiement, SMS, paiement réel ou livraison push de production effectué.

## Seconde reprise du 14 novembre — marchandage et incidents de recette

### Résultats supplémentaires, réellement rejoués

- **Disponibilité : 14/14 routes authentifiées en HTTP 200** à 06:27 puis à 07:43 UTC. Au second passage, historique des trajets 642 ms, réservations 220 ms ; les autres lectures sont comprises entre 10 et 104 ms. Mesures ponctuelles, sans charge. Une nouvelle interruption du listener 5200 a été constatée entre les deux passages ; sa cause n'est pas établie. Après la dernière relance confirmée par l'utilisateur, la lecture des trajets du conducteur répond encore et ne contient aucun trajet `ongoing`.
- **Mobile : 40/40 tests ciblés réussis**, sur `priceNegotiation`, `priceNegotiationApi`, `requestPickupSummary`, `fleetRegistry`, `fleetPayments` et `assetCredit`. Ils couvrent notamment les tours autorisés, les réponses périmées, les doubles clics, les changements de session, le consentement et la reprise idempotente. Ce sont des tests JavaScript, pas 40 parcours tactiles complets.
- **Marchandage backend : 9/9 scénarios PostgreSQL réussis**, dans `dispatch-postgres.spec.ts` via `test/counter-offer-postgres.ts` ; 143 autres cas non sélectionnés. Un scénario traverse les vrais contrôleurs HTTP, la validation, le service et PostGIS : proposition conducteur, contre-proposition passager, prix ferme, consultation des alternatives puis acceptation du dernier prix. Les autres vérifient l'acceptation du prix passager, le refus et la reprise de file, le retrait conducteur, la concurrence, les droits, l'expiration, la compatibilité ancienne et la migration sur base jetable. L'identité d'authentification et les adaptateurs externes sont synthétiques ; aucun SMS, paiement ou push réel validé.
- **Android connecté : proposition reçue et saisie accessible.** Une commande ciblée vers le seul conducteur de test et un prix initial de 4 000 FC sont préparés par API. Dans l'application passager, le modal de nouveau prix, le détail lié à la commande, le bouton « Proposer mon prix » et le champ de saisie sont observés et ouverts par toucher. L'aller-retour complet jusqu'au prix ferme et à l'accord final n'a pas abouti sur cet émulateur. Ne pas le confondre avec le scénario HTTP/SQL réussi ci-dessus.

Les anciennes offres ont expiré après environ deux minutes pendant les interruptions de recette. La lecture PostgreSQL en transaction `READ ONLY` confirme des offres `driver_initial` annulées, sans contre-proposition passager persistée et sans trajet créé. Une tentative de saisie ne constitue donc pas une validation de l'envoi du prix.

### Défaut applicatif confirmé, non corrigé dans cette intervention de test

**Clés React dupliquées dans le détail passager.** L'avertissement `Encountered two children with the same key` apparaît à plusieurs reprises. Sa pile pointe vers `RequestSearchScreen`. Dans `features/request-detail/RequestSearchScreen.tsx`, `PassengerPriceOffers` et `RequestTargetDriver`, enfants du même `ScrollView`, portent tous deux `key={request.id}`. Il existe un risque de mauvaise réconciliation, de duplication ou d'omission de contenu ; l'avertissement seul ne prouve ni crash natif ni boucle infinie. La correction doit donner des clés distinctes tout en conservant la remise à zéro lors d'un changement de commande.

L'incohérence d'explication du tarif moto documentée à la reprise précédente reste également non corrigée. Aucun changement du produit ou du backend n'a été réalisé pendant cette recette.

### Instabilité du dispositif Android : résultat non certifiable

Une capture ADB a expiré après une longue interruption ; le runtime Metro a ensuite disparu. ADB voyait encore l'appareil, mais `am start` répondait `Can't find service: activity` et le stockage partagé `Transport endpoint is not connected`. Un redémarrage de l'émulateur, sans effacement, a rétabli ces commandes.

Après ce redémarrage, les captures montrent successivement le dialogue **« zwanga isn't responding »** dans le lanceur de développement, puis **« System UI isn't responding »**. Le tampon de crash contient aussi plusieurs `SIGABRT` du processus système `com.google.android.bluetooth` au démarrage. Ces faits indiquent que le dispositif de recette est lui-même instable ; ils ne permettent pas d'attribuer tous les blocages au code Zwanga, ni d'exclure un défaut de l'application.

Au contrôle effectué après redémarrage, `dumpsys activity lastanr` indique aucun ANR depuis ce démarrage et `exit-info com.zwanga` n'ajoute pas d'entrée du 14 novembre aux incidents historiques. Ce manque de trace ne nie pas les dialogues effectivement capturés. Leur cause reste à isoler sur un émulateur sain ou un appareil physique. L'arrêt forcé ultérieur de Zwanga pour rouvrir le dev client est une action manuelle de recette, pas un crash spontané à comptabiliser.

### Outils, données de test et limites

- `scripts/audits/connected-local-session.cjs` : ajout de la préparation d'une proposition initiale et de la lecture expurgée des statuts, avec prix borné et commande synthétique uniquement. La préparation inclut `negotiationVersion: 1`, comme le mobile. Sans ce champ, le premier essai utilisait légitimement le contrat ancien ; ce n'était pas une panne produit. La comparaison d'identité accepte le conducteur imbriqué de la réponse API, sans afficher son identifiant ni ses jetons.
- `scripts/audits/mobile-runtime-probe.cjs` : mode explicite `--screenshot-only` pour les écrans animés qui empêchent l'obtention d'une hiérarchie. Ce mode ne produit pas de XML et n'autorise aucune réutilisation de coordonnées non vérifiées ; les captures sont inspectées avant action. La capture reste dépendante d'ADB et peut échouer.
- `scripts/audits/run-isolated-e2e.cjs` : sélection `bargaining` vers la suite qui enregistre réellement les tests de négociation. Un premier démarrage Redis a échoué avant les tests ; une première sélection erronée n'a exécuté aucun test (95 ignorés). Seul le lancement final avec **9 succès et 143 non sélectionnés** est une preuve de validation. Isolation et absence d'identifiants hérités conservées ; le guide PostgreSQL a orienté l'emploi de bases jetables et de lectures seules sur la base courante.
- ESLint des trois outils et `git diff --check` réussis. Le contrôle release global précédent n'est pas présenté comme relancé pour ces changements d'outillage.
- Les commandes synthétiques créées par cette reprise ont été annulées par l'API et leurs comptes synthétiques désactivés. Une répétition du nettoyage d'un compte déjà désactivé retourne un échec non détaillé par l'outil ; son premier nettoyage avait réussi. Aucun historique financier, trajet antérieur ou compte réel supprimé ; aucune base réinitialisée. La session conducteur a été restaurée entre essais ; une dernière restauration après la perte du runtime n'a pas pu être effectuée à cet instant. Ne pas utiliser le dernier compte synthétique désactivé pour reprendre les essais.

Preuves privées : `.expo/local-api-readonly-20261114-history.json`, `.expo/global-e2e-connected-20261103-reprise-0728.json`, `.expo/global-e2e-connected-20261103-reprise-0740.json`, `.expo/negotiation-persisted-reprise-20261114.json`, `.expo/isolated-e2e-2026-11-14-bargaining-reprise-1000-bargaining.{json,log}`, captures `audit-marchandage-20261114-*`, `audit-reprise-20261114-booted.png` et `audit-reprise-20261114-launch.png` sous `.expo/global-e2e-ui-20261103/`. Les images ne doivent pas être publiées sans anonymisation des comptes de test.

**Bilan : validation toujours partielle.** Les échanges HTTP/SQL du marchandage passent, mais le parcours tactile complet reste à rejouer et la stabilité native ne peut pas être certifiée sur ce dispositif. Aucun test iOS, déploiement ou livraison réelle de notification effectué.

## Reprise du 14 novembre, 05:08–06:03 UTC (06:08–07:03 Kinshasa)

Cette section complète les résultats historiques ci-dessous ; elle ne les présente pas comme tous rejoués. Aucun correctif produit, changement de backend, migration de la base courante ou déploiement effectué pendant cette reprise.

### Résultats fraîchement mesurés

| Contrôle rejoué | Résultat | Portée / limite |
| --- | --- | --- |
| Contrôle mobile complet `check-release.cjs` | Code 0 ; 3 828 réussis, 0 échec, 1 ignoré | TypeScript, ESLint, compatibilité Metro, parité native, frontières réseau et taille des sources passent. Le contrôle Ruby/iOS est ignoré sur Windows. Ce n'est pas une compilation native. |
| Authentification HTTP/SQL/Redis isolée | 6/6 réussis | Inscription et preuve OTP, connexion, ancien client compatible, réinitialisation, révocation/rejeu, numéro inconnu. Aucun SMS envoyé ; pas de saisie tactile de ces formulaires. |
| Réservation HTTP/SQL avec code mobile | 10/10 réussis | Prix proposé et consentement, concurrence/idempotence, capacité, refus et contrôles d'identité. Pas de paiement externe. |
| Deux suites unitaires backend précédemment rouges | 21 réussis / 2 échecs | Faux dépôt sans `findOne` et attente SQL à trois paramètres au lieu de quatre, identiques au premier bilan. |
| Récupération de retrait sur PostgreSQL jetable | 4 réussis / 2 échecs | Colonne `assetRepaymentAmount` absente du schéma écrit à la main par la fixture. Un premier lancement avait échoué entièrement au démarrage de PostgreSQL ; seul le rejeu avec démarrage autorisé mesure ces six cas métier. |
| Deux scénarios dispatch inter-dépôts ciblés | 2 échecs / 93 non sélectionnés | Toujours HTTP 400 `TRIP_PRICE_BELOW_MINIMUM` avec 1 000 FC. Les deux parcours d'alerte ne démarrent pas ; les 93 autres cas ne sont pas revalidés par cette sélection. |
| Disponibilité API authentifiée à 05:08 UTC | 14/14 HTTP 200 | Y compris flottes, crédit matériel, profil, trajets, réservations et commandes. Historique trajets : 435 ms, réservations : 138 ms ; mesures ponctuelles, pas de test de charge. |
| Dernier contrôle à 06:03 UTC | 14 erreurs de transport | Aucun listener trouvé sur le port 5200 ; le contrôle HTTP indépendant échoue aussi. Arrêt local non expliqué, sans preuve d'une panne de production. Relance demandée, sans réinitialisation de base. |

Preuves : `.expo/isolated-e2e-2026-11-14-{release,auth,booking,backend-regressions,sequential-probe}-reprise-0609.log`, `.expo/isolated-e2e-2026-11-14-postgres-recovery-reprise-0609-retry.log` et les JSON associés ; `.expo/local-api-readonly-20261114-history.json`. Le dernier fichier de sonde simple contient maintenant l'indisponibilité finale, pas le succès initial.

### Publication réellement parcourue dans Android

1. Ouverture du formulaire avec le compte conducteur de test existant ; sélection d'une destination via le raccourci cartographique puis confirmation du lieu.
2. Horaire rapide « dans 30 minutes » ; ouverture du modal de répétition puis annulation de cette option, sans créer de récurrence.
3. Passage au prix, estimation affichée puis saisie manuelle. Le montant inférieur au minimum est refusé par le modal de validation. Correction à **3 500 FC**, une place, véhicule de test sélectionné ; publication par le bouton de l'application.
4. Lecture authentifiée du backend : exactement un nouveau trajet par rapport à l'inventaire initial, `upcoming`, prix 3 500, une place, départ futur, adresses/véhicule présents, aucune réservation. Le prix saisi n'a pas été remplacé par l'estimation.
5. Redirection automatique vers « Votre trajet » observée, départ/arrivée et carte visibles. **La carte montre ici le tracé de repli en pointillés entre les deux lieux, pas un itinéraire routier détaillé validé.** La cause de ce repli n'a pas été déterminée ; ne pas annoncer le calcul routier comme certifié.
6. Annulation du seul trajet créé par cette reprise, depuis l'icône puis « Oui, annuler ». Nouvelle lecture API : `cancelled`, toujours aucune réservation. Le trajet annulé reste dans la base locale pour traçabilité ; aucun trajet antérieur supprimé ou modifié. Le compte conducteur initial reste connecté, sans changement de session.

Preuves : `.expo/local-publication-reprise-20261114.json` (inventaire et observations techniques, aucun jeton), captures privées `.expo/global-e2e-ui-20261103/audit-reprise-20261114-{repeat,price-ready,edited-price,price-validation,trip-detail,cancel-confirm,cancelled}.png` et hiérarchies XML. Les captures de compte de test ne sont pas incorporées à ce document.

Le clavier flottant de l'émulateur a recouvert le bouton de publication pendant la saisie : un clic fondé seulement sur la hiérarchie a alors touché une touche du clavier. L'essai a été repris après validation de la saisie avec Entrée et vérification visuelle du prix. Ce clic n'est pas compté comme une soumission produit en échec. Il reste à vérifier l'accessibilité du bouton avec les claviers réels des appareils ciblés.

### Incohérence d'affichage découverte

**Publication avec moto deux roues : explication kilométrique erronée.** L'écran affiche « 1 500 FC/km » alors que le tarif normal deux roues du backend courant est 1 200 FC/km. `hooks/publish/usePublishPriceEstimate.ts` prend la recommandation de l'option du véhicule sélectionné, mais construit sa description depuis `quote.pricing`, le tarif global par défaut voiture, au lieu de celui de cette option. `getVehicleOptions` renvoie pourtant un `options[].pricing` propre à chaque type. Observation visuelle dans `audit-reprise-20261114-price-ready.png`, corroborée par les sources actuelles `trip-requests.service.ts` et `trip-request-pricing.ts` du backend. **Ce constat concerne le texte explicatif, pas une preuve de prélèvement incorrect.** Aucun correctif appliqué pendant les tests.

### Outils de recette ajustés et protections conservées

- `scripts/audits/run-isolated-e2e.cjs` : suffixe de rapports validé pour ne pas écraser les précédents ; modes ciblés `backend-regressions`, `postgres-recovery`, `sequential-probe`. Environnement minimal, PostgreSQL/Redis temporaires et protections réseau conservés. Le guide PostgreSQL a orienté cette isolation ; aucune migration de la base existante.
- `scripts/audits/mobile-runtime-probe.cjs` : XML distant propre à chaque capture ; vérification de fraîcheur ; capture PNG encore réalisée si l'automate ne peut obtenir une hiérarchie ; suppression seulement de son propre fichier XML temporaire/périmé. Une capture sans hiérarchie n'autorise pas de clic aveugle.
- `scripts/audits/tap-local-ui.cjs` : ignore l'icône décorative terminale dans un libellé accessible, en plus de l'icône initiale ; conserve l'exigence d'une cible unique, visible, activée et d'une hiérarchie fraîche. Ce contrôle ne détecte pas à lui seul le recouvrement par un clavier système.
- `scripts/audits/verify-local-publication.cjs` : preuve en lecture seule du seul nouveau trajet, inventaire initial non écrasable, même compte et fenêtre de deux heures imposés, aucune écriture API ni secret enregistré. Refuse zéro ou plusieurs nouveaux trajets.

ESLint des quatre outils et `git diff --check` réussis après ces ajustements. Le contrôle release complet s'est terminé avant les derniers ajustements des outils de recette ; ceux-ci ont été vérifiés séparément. `dumpsys activity exit-info` ne comporte aucune nouvelle entrée crash/ANR du 14 novembre ; les entrées historiques restent présentes. Aucun essai iOS ni validation physique, d'autonomie ou de chauffe effectué.

**Conclusion de reprise : validation partielle.** Publication/annulation tactile et intégrations d'authentification/réservation sont vérifiées ; six tests backend restent rouges, l'explication du tarif moto est à corriger et le backend local est indisponible au dernier contrôle. Le parcours complet de marchandage, les versements de flotte, les contrats/crédits, les formulaires d'authentification tactiles et la livraison réelle des sonneries ne sont pas tous certifiés par cette reprise.

## Verdict et périmètre

La recette est **partiellement validée, pas un feu vert global de déploiement**. Un parcours cash réel a abouti sur l'émulateur connecté au backend local, jusqu'aux notes des deux participants. L'accès connecté aux affectations de flotte, initialement en erreur, fonctionne au dernier contrôle après une mise à jour du schéma effectuée hors de cette intervention. Plusieurs suites serveur restent rouges sur des fixtures désynchronisées. La totalité des fonctionnalités n'a pas été parcourue manuellement sur chaque plateforme.

Autorisation utilisateur obtenue pour le compte conducteur connecté et confirmation que les envois réels SMS, push et paiements sont désactivés sur le backend local. Aucun déploiement, migration de base existante ni changement de logique applicative effectué par cette recette. Les changements ci-dessous portent uniquement sur les outils/tests et la documentation.

Environnement : Windows, Android émulé, application installée 1.0.18/build 176 avec JavaScript de développement servi par Metro ; PostgreSQL 18/PostGIS et Redis isolés pour les intégrations ; API de recette locale sur le port 5200. Ce binaire installé ne constitue pas une compilation complète des sources natives actuelles. Node local 24.11.0, distinct du 24.22.1 attendu pour EAS.

**Sources modifiées en parallèle pendant l'essai :** un composant de prise en charge ajouté dans l'espace de travail a temporairement bloqué Metro, puis a été corrigé hors de cette intervention. Le contrôle release réussi au début ne certifie donc pas intégralement l'instantané final. TypeScript a repassé après cette correction, ainsi que 40 tests ciblés des nouveaux services, du marchandage et de la prise en charge.

## Parcours Android connecté effectivement exécuté

1. Lecture de l'accueil conducteur, du profil, du catalogue Services, des flottes et du crédit matériel avec la session existante confirmée comme compte de test.
2. Inscription par HTTP d'un passager synthétique, puis création par HTTP d'une commande immédiate cash ciblée uniquement vers ce conducteur de test. Ce n'est pas un test de saisie du formulaire d'inscription ou de commande dans l'interface.
3. Affichage du modal « Nouvelle commande » sur l'émulateur, véhicule déjà proposé, acceptation par toucher réel ; contrôle API/SQL de l'affectation et du trajet créé.
4. Action « Aller chercher le passager » dans l'interface ; passage du trajet à `ongoing`, affichage de la navigation et du modal d'arrivée au point de récupération.
5. Déclaration d'embarquement dans l'interface conducteur, puis confirmation dans l'interface passager : `pickedUp` reste faux après la seule déclaration conducteur, puis devient vrai après la réponse du passager.
6. Déclaration d'arrivée conducteur par l'API du seul trajet synthétique, confirmation d'arrivée par l'interface passager. Le déplacement GPS et l'arrivée automatique ne sont pas simulés comme une course réelle parcourue.
7. Ouverture du paiement ; action « J'ai payé en cash ». Au retour à la session conducteur, affichage du modal « Avez-vous reçu le cash ? », confirmation par un toucher, puis modal « Terminer le trajet ? ».
8. Fin du trajet depuis l'interface conducteur ; réservation et trajet `completed`, réception cash persistée. Notation du passager puis du conducteur depuis les interfaces respectives ; une note de chaque côté vérifiée en base.
9. Restauration de la session conducteur initiale. Aucun trajet en cours restant pour ce compte après l'essai. Les anciennes courses n'ont pas été modifiées. Le trajet terminé, ses écritures et le compte passager synthétique restent dans la base de test pour traçabilité ; aucune suppression d'historique financier.

Les changements de rôle sur l'unique émulateur utilisent une préparation de session de test via le mécanisme mobile de sauvegarde des jetons, et non une saisie manuelle de connexion. Aucun jeton n'est enregistré dans les rapports.

Contrôle financier du seul trajet synthétique : montant convenu 3 000 FC, part passager 1 200 FC, aide de bienvenue existante 1 800 FC (`firstTripSubsidyApplied`, taux passager 0,4). Le montant de 1 200 FC affiché au paiement correspond à cette aide, pas à une perte de prix constatée. Une seule écriture de gain de 1 800 FC et une réception cash de 1 200 FC constatées. Ce contrôle ne prouve pas à lui seul toute la réconciliation de commission ou de crédit matériel.

Une tentative d'annulation pendant l'interruption technique a été refusée en HTTP 400 car le trajet avait déjà démarré ; aucune annulation n'a été forcée. Le parcours a ensuite été repris et terminé normalement. La sélection d'une action ambiguë a été refusée par l'outil de test ; aucune action destructive n'a été validée à l'aveugle.

Preuves locales non destinées à une publication publique :

- `.expo/global-e2e-connected-20261103-20261114.json` : transitions techniques, sans identifiants de session.
- `.expo/synthetic-ride-ledger-20261114.json` : statuts, montants du scénario et compteurs de notes, sans identité personnelle.
- `.expo/global-e2e-ui-20261103/audit-20261114-*.png` et XML : captures de recette. Elles peuvent contenir le profil du compte de test ; ne pas les publier sans anonymisation.

## Résultats automatisés

Les lignes ci-dessous ne doivent pas être additionnées comme un nombre de parcours utilisateur uniques : les niveaux de test et certaines couvertures se recoupent.

| Vérification | Résultat | Portée / limite |
| --- | --- | --- |
| Mobile `check-release.cjs` | 3 822 réussis, 0 échec, 1 ignoré ; code 0 | TypeScript, ESLint, compatibilité Metro/URI, parité native, frontières réseau et taille des sources inclus. Instantané initial seulement ; pas une compilation iOS/Android. |
| Backend, suite globale | 3 988 réussis, 2 échecs, 1 007 ignorés | Beaucoup d'intégrations PostgreSQL nécessitent une activation explicite ; exécutées séparément ci-dessous. |
| Backend TypeScript | Réussi, code 0 | Compilation/typecheck de l'instantané examiné, distinct des essais HTTP. |
| PostgreSQL/PostGIS isolé, 48 suites | 910 réussis, 2 échecs, 3 ignorés | Vraies transactions ; dispatch, finance, sessions, profils, comptes, KYC, services, flottes, crédit, réservations et notifications persistantes. |
| Dispatch PostgreSQL + Redis | 90 réussis, 2 échecs, 1 ignoré | Deux scénarios mobile/HTTP bloqués avant leur parcours par un prix de fixture devenu invalide. Benchmark de charge ignoré. |
| Inscription / login / reset, HTTP + SQL + Redis | 6/6 réussis | Contrôleurs et stockage réels ; fournisseur SMS remplacé, aucun SMS réel. |
| Réservation / négociation mobile API → Nest HTTP → PostgreSQL | 10/10 réussis | Consentement, concurrence sur les places, droits, refus, montants et cache ; pas dix parcours tactiles sur appareil. |
| Banc Android natif, audio | 11/11 réussis | Code Java courant compilé dans un APK de test séparé ; lecteur, service et notifications système réels, serveur de validation simulé localement. |
| Banc Android natif, réception/affichage | 19/19 réussis après alignement d'un libellé de test | Plein écran autorisé, veille, reprise, notification concurrente, expiration, refus de validation, repli Notifee. Ce n'est pas une livraison FCM de production. |
| Rejeu ciblé final mobile | 40/40 réussis | Prise en charge, flottes/versements, crédit matériel, marchandage ; réseau externe interdit. |

Le test mobile ignoré dépend de Ruby pour le contrôle iOS et n'est pas exécuté sous ce Windows. Les trois cas PostgreSQL ignorés documentent des limites de compatibilité avec d'anciens comportements de cash/publication. Les tests ignorés ne sont pas comptés comme validés.

Les six scénarios d'authentification couvrent notamment : preuve OTP d'inscription à cinq chiffres liée au numéro ; inscription multipart, mot de passe haché et unicité ; compatibilité ancienne inscription sans preuve ; réinitialisation à six chiffres ; révocation des sessions et refus du rejeu ; réponse générique pour numéro inconnu sans SMS ni repli Keccel.

Les intégrations de services réussies comprennent 15 tests PostgreSQL du registre de flotte, dont déclaration et confirmation HTTP des versements, et 12 tests crédit matériel. Elles utilisent leur propre schéma migré : leur réussite ne rend pas opérationnelle une base de recette non migrée.

Logs : `.expo/isolated-e2e-2026-11-14-{release,postgres,sequential,auth,booking}.log`, rapports JSON PostgreSQL/dispatch, `.expo/global-e2e-backend-20261103-20261114.{json,log}`, `.expo/global-e2e-types-20261103-20261114.log`, `.expo/alert-audio-20261114/results.json`, `.expo/alert-delivery-20261114-replay/native-matrix.json`.

## Problèmes reproduits et actions restant à autoriser

### 1. Flottes initialement indisponibles, rétablies au dernier contrôle

Au début, `GET /partners/fleet-assignments/mine` et `/history` renvoient **500** ; le défaut apparaît aussi dans l'écran Flottes. Sur deux séries de lectures authentifiées, les douze autres routes examinées répondent 200.

Inspection initiale du schéma en transaction `READ ONLY` : la table des affectations existe, mais pas les nouveaux champs `sequence`, `periodicAmountMinor`, `paymentPeriod`, ni `fleet_external_payments`. La migration préparée `1780000126000-FleetExternalPayments` les crée. Le dossier fonctionnel précédent exige déjà son application avant ouverture de ces interfaces. Le catalogue présente néanmoins Flottes comme ouvert : ce constat souligne la nécessité de synchroniser schéma et livraison.

**Recontrôle final, 01:41–01:43 UTC :** les quatorze routes de lecture, y compris les deux routes Flottes, répondent 200. Une nouvelle inspection `READ ONLY` confirme les trois colonnes et la table ; l'écran affiche normalement son état sans affectation. Cette mise à jour du schéma n'a pas été effectuée par cette recette et sa commande d'exécution n'a pas été observée. Ne pas annoncer le 500 comme encore présent. Preuves : `.expo/fleet-schema-20261114.json`, `.expo/local-api-readonly-20261114.json` et capture `audit-20261114-fleet-recovered.png`. Les contrats et versements de flotte restent à parcourir avec des données dédiées dans l'application.

### 2. Six échecs de suites serveur à traiter avant un contrôle global vert

- `src/driver-settlements/driver-cash-subsidy.spec.ts:72` : notification attendue une fois, reçue zéro. Le faux dépôt des gains ne fournit pas le `findOne` désormais utilisé pour relire le gain net après remboursement matériel ; le journal contient l'erreur correspondante. Ce test ne prouve pas une panne de notification en production ; les tests PostgreSQL de cette aide et le modal cash connecté réussissent.
- `src/trip-requests/request-search-map.spec.ts:53` : attend trois paramètres SQL, alors que la politique ajoute le quatrième booléen `false`. Attente de test restée sur l'ancien contrat.
- Deux cas de `src/database/driver-payout-recovery-postgres.spec.ts` : table `driver_earnings` construite manuellement dans la fixture sans `assetRepaymentAmount`, requise par le calcul courant. Cette colonne existe dans la base locale consultée. La récupération de retraits n'est pas certifiée par ces deux cas en échec.
- Deux cas de `test/sequential-mobile-flow.ts:126` : prix 1 000 FC refusé avec `TRIP_PRICE_BELOW_MINIMUM` (minimum actuel 2 500 FC). Échec avant la création, pas une preuve d'échec de distribution d'une commande admissible.

Ces quatre fichiers backend n'ont pas été modifiés dans cette recette. Il faut aligner leurs fixtures puis relancer les suites, sans supprimer les assertions ni assouplir les règles métier.

### 3. Instabilité de l'environnement de développement pendant les essais

Des sondes ont momentanément reçu des erreurs de transport sur toutes les routes locales, puis le parcours a repris. Le serveur et les sources évoluaient en parallèle ; la cause exacte de chaque interruption n'a pas été établie. Ne pas extrapoler ces épisodes à une panne de production.

Un `TransformError` Metro a effectivement interrompu la navigation : attributs JSX non quotés dans `features/request-detail/RequestPickupSummaryCard.tsx`. Le fichier a ensuite été corrigé hors de cette recette ; le typecheck, l'affichage et les tests ciblés passent après correction. Conserver la preuve historique, mais ne pas annoncer ce défaut comme encore présent. Un gel des sources et un dernier contrôle release sont nécessaires pour certifier un candidat précis.

## Performance et stabilité : ce qui a été mesuré

- Lecture initiale de l'historique trajets : environ 3,34 s ; réservations : 1,28 s pendant les grosses suites. Relecture ultérieure : 275 ms et 129 ms. Les autres routes réussies de cette série prennent 12 à 79 ms. Mesures ponctuelles sur ce poste, ni p95 ni test de capacité, sans conclusion causale sur une régression.
- L'historique renvoie encore des listes importantes. Ce constat justifie un examen de pagination, mais aucun changement de contrat ou benchmark de charge n'est fait ici.
- `dumpsys activity exit-info com.zwanga` ne montre pas de nouvelle entrée ANR/crash datée de cette recette ; les entrées ANR visibles datent des 6 et 9 novembre. Cette absence ne garantit pas qu'il n'existe aucun gel, fuite mémoire ou crash sur d'autres appareils.
- Une mesure mémoire de développement élevée, isolée, n'établit pas une fuite. Pas de mesure de chauffe, autonomie, FPS soutenu ou mémoire sur une build release physique.

## Outils/tests ajustés, comportements conservés

- `scripts/audits/run-isolated-e2e.cjs` : orchestration à environnement minimal, PostgreSQL explicite, logs séparés, garde réseau local pour les intégrations SQL. Aucune reprise des secrets applicatifs dans les processus isolés.
- `scripts/audits/probe-local-api-readonly.cjs` : GET bornés en session de développement locale, résultats techniques sans corps personnels ni jetons ; conservation d'un historique des sondes finales.
- `scripts/audits/inspect-synthetic-ride.cjs` : preuve en lecture seule du seul scénario synthétique récent ; refuse un résultat absent ou ambigu ; n'exporte ni identifiants utilisateurs ni coordonnées. Option `--fleet-schema` pour vérifier seulement la présence des colonnes et de la table attendues.
- `scripts/audits/tap-local-ui.cjs` : hiérarchie fraîche, émulateur vérifié, libellé exact et cible unique ; refuse les clics ambigus. Ne sert pas à contourner une validation fonctionnelle.
- `scripts/audits/android-cached-plugin.init.gradle` : résolution du plugin Android déjà présent en cache pour le banc local, sans modifier le Gradle de l'application ni EAS.
- `tests/integration/authOtpLocal.cjs` : applique la migration réelle d'identité téléphonique à sa base jetable ; messages de début de scénario pour localiser un blocage.
- `tests/integration/bookingBackendE2E.test.cjs` : aligne le montant valide sur le minimum actuel ; garde un prix inférieur dans les cas invalides et les contrôles de concurrence/consentement.
- `scripts/audits/test-native-ride-delivery.cjs` : attend « Voir la commande », libellé déjà utilisé par l'application, au lieu de l'ancien texte.

ESLint ciblé de ces scripts/tests réussi, nouveau script de lecture financière exécuté avec succès. Les garde-fous d'isolation, les vraies validations de prix, le KYC, les permissions et le fonctionnement audio ne sont pas relâchés. Le guide PostgreSQL a orienté l'isolation des bases et les inspections en lecture seule. Aucun correctif produit ni backend réalisé dans cette intervention.

## Couverture encore manquante

- Parcours tactiles complets de connexion/inscription/OTP, publication, édition de profil, documents, contrats flotte/crédit et marchandage multi-tours sur les deux rôles. Les suites automatisées couvrent des parties de ces flux, pas leur intégralité sur appareil.
- Parcours portail partenaire + mobile + backend sur une même base migrée. Les tests locaux du portail issus d'une intervention précédente ne sont pas réannoncés comme rejoués ici.
- Paiements Mobile Money réels, prestataires SMS, FCM/APNs, KYC prestataire, appels/SOS et notifications vers d'autres téléphones : non déclenchés.
- iOS réel/simulateur, build Android release actuelle, appareil physique en veille/économie d'énergie et longue durée.
- Charge simultanée, pannes contrôlées de réseau, latence prolongée et reprise après arrêt forcé du backend sur un environnement figé.

La suite recommandée est de corriger les fixtures serveur, figer les sources et le schéma, puis rejouer les parcours encore manquants, notamment les versements de flotte sur la base désormais à jour. Les résultats présents ne justifient pas l'affirmation « toutes les fonctionnalités sont validées ».
