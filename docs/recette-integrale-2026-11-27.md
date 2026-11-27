# Recette étendue et audit détaillé — 27 novembre 2026

## Conclusion

**Pas de validation exhaustive ni de feu vert au déploiement.** Cette extension recense tous les fichiers de routage et approfondit les parcours mobiles et leurs interactions avec le backend. Le blocage des options de paiement R1 a été corrigé sur la base locale et retesté. Après les constats historiques ci-dessous, **R2–R8 ont reçu des correctifs mobiles** : [solutions et vérifications ciblées](correctifs-recette-ecrans-2026-11-27.md), 68 tests réussis. Les limites natives et l'arrêt du backend pendant le nouvel essai d'assistance y sont précisés. La suspicion R9 a été écartée après essai du vrai composant parent et n'est pas comptée comme défaut. Les inventaires et nombres de tests de la recette initiale restent des instantanés antérieurs aux correctifs, pas une mesure de leur couverture exhaustive.

La [matrice écran par écran](recette-ecrans-etendue-2026-11-27.csv) couvre les **68 fichiers d’écrans ou de routage**. Bilan natif cumulé avec la reprise : **50 partiellement testés, 12 redirections seulement, cinq états d’erreur seulement et un bloqué par le KYC du compte**. Les deux fichiers non exécutés dans la passe précédente ont désormais un essai limité : lien Android à chaud non affilié et redirection racine avec session. Aucun de ces nombres ne signifie que tous les boutons ou toutes les branches d’un écran sont validés.

L’inventaire AST recense **1 161 gestionnaires d’événements JSX distincts**, accessibles par les imports locaux de 1 009 modules. Il comprend des saisies, changements de valeur et callbacks, pas seulement des boutons. Les branches conditionnelles, interactions système et render props exigent une recette complémentaire. Les nombres par écran se recouvrent par composants partagés : ne pas les additionner.

Les résultats antérieurs restent dans [le rapport de correctifs](correctifs-audit-2026-11-27.md) et [l’audit transverse](audit-plateforme-2026-11-27.md). Ce document n’annonce pas leur réexécution complète.

## Conditions et limites

- Émulateur Android, JavaScript courant servi par Metro, backend local et comptes autorisés pour les tests. Binaire installé encore en version 1.0.18 / 176 : les dernières modifications natives ne sont pas certifiées.
- Aucun déploiement, intervention AWS, paiement réel, SMS ou push réel. Les simulations financières SQL utilisent des bases temporaires et des fournisseurs simulés.
- Sur la base habituelle, un dossier documentaire synthétique a été créé, modifié puis annulé. Il reste dans l’historique : statut `cancelled`, deux documents, trois événements et aucune écriture financière. La reprise a ajouté un ticket d'assistance synthétique, statut `open`, catégorie `other`, conservé pour le contrôle de suivi ; aucun paiement ni appel externe associé.
- Un favori synthétique a été créé puis supprimé par les boutons de l’application. Aucun favori préexistant supprimé : deux favoris avant et après l’essai. Le lieu choisi réapparaît dans le formulaire ; la précision du GPS et l’égalité métrique des coordonnées ne sont pas mesurées. La suppression du favori de test ne modifie pas le dossier documentaire.
- Une conversation existante a été ouverte, sans message envoyé, modifié ou supprimé. Son ouverture peut la marquer comme lue. L’autorisation Contacts a été refusée sur l’émulateur pour vérifier le repli ; aucun contact n’a été collecté.
- Pas d’iPhone, téléphone Android physique, essai prolongé GPS/voix en veille, test de chauffe/batterie, nouvelle compilation native ou validation de prestataire de paiement.

## Défauts reproduits et ordre de correction

### R1 — Options de paiement indisponibles sur la base locale — P1 corrigé localement

**Preuve connectée :** depuis une navigation passager, puis par GET authentifiés sur trois réservations distinctes, `/driver-finance/bookings/:id/payment-options` répond HTTP 500. Les journaux locaux identifient `driver_cash_exception_trips` comme relation absente, depuis `readCashExceptionPolicy`.

Le contrôle préalable de la migration autorisée par l’utilisateur révèle une divergence :

- `DriverCashExceptions1780000145000` est déjà enregistrée dans `typeorm_migrations` ;
- `driver_cash_exceptions` et `driver_cash_restrictions`, ainsi que les fonctions d’exception, existent ;
- les tables `driver_cash_exception_trips` et `driver_cash_exception_rollout` n’existent pas ;
- le garde cash contient déjà l’appel d’autorisation d’exception.

**Premier contrôle : aucune migration appliquée.** Le script s’est arrêté avec `SCHEMA_HISTORY_MISMATCH` avant toute DDL ou insertion dans l’historique. L’autorisation initiale de lancer la migration manquante ne justifiait pas un effacement ou un rejeu aveugle de sa version actuelle.

**Correction recommandée :** une nouvelle migration de mise à niveau, versionnée et transactionnelle, compatible avec ce schéma déjà partiellement présent. Elle doit préserver les reçus, avertissements et commissions existants, traiter explicitement le passage de l’incident par réservation à l’incident par trajet, vérifier les invariants et laisser le déploiement de la nouvelle politique désactivé jusqu’à validation des clients. Ne pas contourner l’erreur en autorisant silencieusement le cash.

**Recette de sortie :** GET 200 conducteur et passager, confidentialité de la pénalité, cash normal/exceptionnel, paiement électronique en vérification bloqué, jetons insuffisants, plusieurs passagers d’un même trajet, double confirmation, recouvrement de dette, restrictions différées jusqu’à la fin des courses. Comparer les soldes et reçus avant/après migration sur copie de test.

Fichiers : backend `src/driver-finance/cash-exception-policy.ts`, `driver-finance.service.ts`, `src/database/migrations/1780000145000-DriverCashExceptions.ts`, `sql/driver-cash-exceptions.ts` ; mobile `store/api/driverFinanceApi.ts`.

#### Correctif autorisé et appliqué le 27 novembre

Après accord explicite, ajout de `UpgradeDriverCashExceptions1780000148000` et de son enregistrement dans `src/database/migrations/index.ts`. L'ancienne table est conservée intégralement sous `driver_cash_exceptions_legacy_1780000148000`, avec ses contraintes et données. Les autorisations sont copiées dans la structure actuelle ; les incidents confirmés sont repris à l'identique seulement si une correspondance non ambiguë par trajet existe. Les montants déjà prélevés, leur origine retirable, les reliquats, les occurrences et les restrictions sont conservés. Aucun crédit/débit, notification ou changement de compte n'est déclenché par cette opération.

La migration exige une transaction, borne les verrous à 5 s et les instructions à 30 s, remplace les six fonctions et vérifie le raccordement des sept déclencheurs. Elle laisse intact le garde d'encaissement. Les historiques avec plusieurs incidents déjà confirmés sur un même trajet, séquences incohérentes, dépendances vers l'ancienne table ou schéma partiel nécessitent une réconciliation examinée séparément : arrêt et rollback, pas de remise de dette ni de double prélèvement automatique. L'ancienne migration ne doit plus être réécrite pour corriger une base déjà migrée.

**Tests isolés :** 180 succès, trois cas historiques explicitement ignorés, zéro échec sur quatre suites : finance PostgreSQL (156), déclaration cash (6), secours jetons/cash (16), sûreté de migration initiale (2). Parmi eux, neuf nouveaux scénarios couvrent ancien schéma vide, autorisation en attente puis reçu, pénalité partiellement réglée, plusieurs passagers sur le même trajet, maintien des restrictions, schéma déjà actuel/réexécution, refus des doublons, schéma incomplet et rollback des DDL. Ce sont des tests SQL/HTTP/JavaScript selon les suites, pas des paiements réels ni une campagne sur appareils physiques. Les trois tests ignorés décrivent d'anciens comportements incompatibles ; ils ne sont pas comptés comme réussis.

**Base locale :** migration appliquée une seule fois, aucune exception historique n'y était présente. Empreintes des soldes, écritures, réservations, restrictions et états de comptes identiques avant/après. Drapeau `driver_cash_exception_rollout.enabled` laissé à `false` : pas d'activation implicite des nouvelles pénalités. Une inspection ultérieure confirme l'enregistrement et les tables attendues sans rejouer les DDL. Pas de déploiement ou modification AWS.

**Reprise connectée :** le backend s'est arrêté pendant la phase de vérification ; aucun verrou SQL bloquant n'était présent. Après relance par l'utilisateur, les trois réservations passager précédemment en 500 répondent toutes 200 (78, 27 et 27 ms sur cette série locale, non représentative d'une charge de production). L'écran `/booking/navigate/:id` a été ouvert sur l'émulateur : lecture `bookingPaymentOptions` réussie, paiement cash prévu visible, pas d'erreur affichée. Aucun encaissement ni action SOS/contact n'a été exécuté. TypeScript de production et ESLint ciblé des nouveaux fichiers réussis.

Trois lectures supplémentaires depuis le compte propriétaire des trajets répondent également 200 (59, 30 et 32 ms) : **six lectures connectées réussies**, trois côté passager et trois côté conducteur. La confidentialité des pénalités et les encaissements concurrents sont couverts par les tests isolés, pas par un règlement sur la base habituelle.

Preuves locales sans secrets ni identifiants dans les rapports JSON : `.expo/isolated-e2e-2026-11-27-cash-upgrade-postgres.json`, `.expo/local-cash-exceptions-migration-2026-11-27.json`, `.expo/cash-upgrade-api-regression-2026-11-27.json` et entrée de navigation passager à 14:09 UTC dans `.expo/native-screen-recette-2026-11-27.json`. La capture native reste un artefact privé de test, non intégrée à cette documentation. Les défauts R2 à R5 ci-dessous demeurent ouverts.

### R2 — Confirmation de création du dossier documentaire remplacée trop tôt — P2

**Reproduction native :** Services → Documents → document → coordonnées synthétiques → consentement → Envoyer. Le backend crée bien le dossier, mais l’écran affiche immédiatement « Vous avez déjà une demande. Modifiez-la au lieu d’en créer une autre. » au lieu d’un succès avec accès au suivi.

La garde de `app/services/new.tsx` remplace `ServiceRequestForm` lorsque la lecture du dossier courant se recharge ou trouve la nouvelle demande. L’invalidation de cache après création peut donc retirer le formulaire et son accusé de succès. L’édition du dossier, elle, affiche bien « Suivre mon dossier » lors de cet essai.

**Proposition :** conserver l’identifiant retourné par la création et naviguer explicitement vers son suivi, ou maintenir un état de succès au-dessus de cette garde. Ajouter un test de composant parent avec invalidation/refetch pendant la résolution de la mutation.

**Comportement à conserver :** un seul dossier documentaire par utilisateur, réutilisable même après annulation/refus. Ce choix est explicite dans `document-case.postgres.spec.ts` ; le dossier annulé demeure modifiable. Ce n’est pas une anomalie de duplication ou une demande impossible à renouveler. Afficher son statut et proposer « Reprendre mon dossier » améliorerait cependant la compréhension.

### R3 — Double soumission possible d’un favori — P2

**Reproduction JavaScript :** appeler deux fois `handleSaveLocation` avant la résolution de la première mutation provoque deux appels de création. Le bouton désactivé après rerendu ne protège pas cette fenêtre. Aucun doublon persistant en base n’est démontré : la sonde utilise une mutation différée simulée.

**Proposition :** verrou synchrone partagé avec l’action, contrôle de session/écran actif et libération en `finally` ; conserver le brouillon après erreur. Tester double toucher, réponse perdue et navigation arrière pendant la requête. Pour une garantie réseau complète, prévoir aussi un contrat d’idempotence côté serveur.

Fichier : `hooks/favorites/useFavoriteLocationActions.ts`.

### R4 — Panne réseau des favoris affichée comme liste vide — P2

**Reproduction JavaScript sur le vrai composant :** lecture simulée HTTP 503 sans cache → « Aucun lieu favori », sans action Réessayer. `app/favorite-locations.tsx` transforme l’absence de données en tableau vide sans branche d’erreur distincte.

**Proposition :** séparer chargement initial, erreur sans données, données conservées pendant une panne et liste réellement vide. Ajouter un rafraîchissement explicite, sans effacer les favoris connus ni prétendre qu’ils ont disparu.

### R5 — Un ancien détail de paiement peut remplacer le dernier choisi — P2

**Reproduction JavaScript sur les callbacks du vrai écran :** ouvrir A puis B ; résoudre B puis A. B est affiché, puis la réponse tardive de A remplace la sélection. Ce constat porte sur l’affichage, pas sur un débit ou une altération des comptes.

**Proposition :** identifiant de sélection/request sequence, garde de session et d’écran actif ; ignorer les réponses d’un détail fermé ou remplacé. Vérifier également le lien entrant et le téléchargement du reçu associé à la sélection.

Fichier : `app/payment-history.tsx`, appels `setSelectedPayment` après les lectures asynchrones.

## Reprise des interactions — après-midi du 27 novembre

### R6 — Huit paramètres ne sont pas persistés — P1 pour la confidentialité

Dans `app/settings.tsx`, les interrupteurs notifications de trajet/messages/promotions, partage de position, affichage du téléphone/des évaluations, mode sombre et acceptation automatique ne modifient que des `useState` locaux. Aucun de ces huit changements n'est raccordé à une préférence persistée ni au service correspondant. Le choix des annonces de mise à jour, porté par `UpdateAnnouncementsChoice`, est distinct et n'est **pas** inclus dans ce constat.

**Reproduction JavaScript :** modifier chaque interrupteur, rerendre entre chaque action, démonter puis remonter le vrai composant : les huit valeurs reviennent à leur valeur initiale. **Reproduction Android :** « Partager ma position » passe à désactivé, puis revient activé après remplacement de la route et réouverture. Ce constat ne prouve pas qu'une position a été envoyée pendant l'essai ; il prouve que ce bouton ne permet pas de contrôler durablement ce partage.

**Proposition prioritaire :** raccorder les choix réellement supportés à une source persistée, par compte, avec sauvegarde/erreur/reprise explicites et effet sur les consommateurs concernés. Pour la localisation, distinguer disponibilité conducteur, suivi d'un trajet actif et permission du système. Masquer les options non implémentées plutôt que présenter une fausse commande. Ne pas arrêter arbitrairement le suivi d'un trajet actif en corrigeant ce défaut.

### R7 — Choix « Langue » sans action — P3

Le composant rendu de `app/settings.tsx` présente « Langue / Français » avec chevron mais aucun `onPress`. La structure Android n'expose pas de contrôle cliquable correspondant. Le sélecteur de test qui cherchait un bouton s'est arrêté sans toucher d'autre élément : il ne s'agit pas d'un crash.

**Proposition :** afficher un simple texte « Français » tant qu'aucune autre langue n'est disponible, ou implémenter un vrai sélecteur avec persistance et traductions complètes. Ajouter un nom accessible aux huit interrupteurs : leur texte voisin n'est actuellement pas leur label natif.

### R8 — Double soumission de ticket d'assistance — P2

Deux appels à `handleSubmitTicket` avant la première réponse provoquent deux mutations. Reproduction sur le vrai `hooks/support/useSupportTicketActions.ts`, avec réponse différée simulée ; aucun doublon volontairement créé sur le backend habituel. Le parcours natif à clic unique crée exactement un ticket et montre « Ticket envoyé ».

**Proposition :** verrou synchrone de soumission et idempotence serveur pour la réponse perdue, avec brouillon conservé en cas d'échec. L'état `isLoading` désactivant le bouton après rerendu ne couvre pas seul le double toucher initial.

### R9 — Faux échec après stockage de préférence — suspicion écartée

La première sonde remplaçait `persistFavoriteContact` par une fonction qui rejette sa promesse. Cela produisait bien un faux échec dans le hook isolé, mais **ce n'est pas le comportement de la dépendance réelle** : `app/support.tsx` intercepte déjà l'erreur d'AsyncStorage dans cette fonction.

La sonde étendue rend le vrai écran, passe son vrai callback au hook d'action et fait échouer uniquement `AsyncStorage.setItem`. Résultat : une création réussie, un rafraîchissement et « Ticket envoyé ». **R9 est retiré de la liste des anomalies.** Le test de cette protection reste conservé ; aucune correction métier n'a été appliquée pour un défaut non confirmé. La résistance à la réponse réseau perdue reste un contrôle distinct de cette erreur de préférence.

### Actions natives supplémentaires et interactions connectées

Les preuves sont dans `.expo/native-actions-2026-11-27.json` : **50 contrôles tentés, 46 attentes observées et quatre essais arrêtés**. Les reprises sont comptées séparément, pas comme des boutons supplémentaires. Parmi les attentes observées : 16 touchers, quatre saisies, un changement d'interrupteur et un lien Android à chaud, ainsi que navigations, défilements et inspections. Il s'agit d'actions explicitement sélectionnées sur une hiérarchie Android fraîche, pas d'un robot cliquant aveuglément sur tout.

| Parcours | Résultat observé | Limite |
| --- | --- | --- |
| Assistance : nouveau ticket, catégorie, sujet/message | Champs vides bloquants ; envoi synthétique ; accusé « Ticket envoyé » ; GET local 200 et exactement un ticket correspondant | Pas d'email/appel/SOS ; pas de réponse agent ni clôture |
| Assistance : recherche FAQ sans correspondance | Saisie native, état vide explicite | Pas de validation de toutes les réponses FAQ |
| Paramètres : partage de position | Désactivation affichée, puis réactivation à la réouverture : R6 reproduit | Pas de mesure GPS ni de changement de permission système |
| Paramètres : suppression de compte | Confirmation ouverte, puis « Annuler » ; session conservée | Bouton final « Supprimer » jamais activé ; aucune suppression |
| Recherche : places | Minimum désactivé, ajout, retrait et retour au minimum | Deux valeurs exercées, pas toutes les capacités |
| Recherche : tri des trajets | « Moins cher » puis « Prochains départs », lectures `getTripDiscovery` réussies | L'ordre global/cursor est couvert séparément ; pas certifié par la présence du bouton |
| Recherche : Clients | Changement d'onglet, prix le plus élevé, plus tôt, proximité ; lectures `getRequestDiscovery` réussies | Aucune commande acceptée ni déplacée |
| Notifications : Assistance | Panne affichée « Assistance indisponible », puis après relance le ticket synthétique est visible et la lecture réussit | Première attente de succès échouée pendant l'arrêt backend, rejouée après relance |
| Notifications : Messages | Onglet ouvert par son bouton ; `listConversationPages` réussie | Aucun message envoyé, modifié ou supprimé |
| Lien Android entrant incomplet | `zwanga://incoming-driver` ouvert via intention Android ; route réelle `/incoming-driver`, état explicite ; « Retour à l'accueil » fonctionnel | Application déjà ouverte, identifiant absent ; aucun consentement ou acceptation soumis ; liens à froid/iOS/parrainage non certifiés |
| Route racine | `/` renvoie vers l'accueil avec session existante | Pas de nouvelle inscription ni démarrage après arrêt du processus |

Après la relance, une nouvelle lecture des réservations et trois lectures distinctes des options de paiement répondent toutes HTTP 200. Aucun règlement déclenché (`.expo/cash-options-continuation-2026-11-27.json`). Cela confirme la non-réapparition du 500 R1 sur cet échantillon, pas toutes les branches d'encaissement.

Les essais arrêtés faute de contrôle unique (encodage du libellé de saisie, « Langue » non cliquable), ou par mauvais texte attendu après fermeture de l'accusé, ne sont pas assimilés à des erreurs métier. Les reprises réussies restent séparées des premiers essais dans l'artefact. Un enregistrement « passed » avec l'état de partage revenu à `true` signifie **reproduction du défaut**, pas validation de la fonction.

### Disponibilité et performance : nouvelles observations, pas un certificat

Le backend habituel est devenu injoignable entre 14:34 et 14:38 UTC environ (15:34–15:38 à Kinshasa), après plusieurs lectures réussies. Les erreurs `FETCH_ERROR` côté mobile concordent avec le refus de connexion sur le poste. L'utilisateur l'a relancé et la santé ainsi que les lectures natives ont ensuite répondu. **Cause de l'arrêt non établie** : ni crash applicatif, ni faute SQL, ni manque de mémoire ne sont démontrés par ces seuls contrôles. Les bases temporaires de recette sont indépendantes du port 5200.

Instantané Android cumulatif, non remis à zéro, à 14:43 UTC : 13 660 images rendues, 5 120 images marquées irrégulières par `gfxinfo` (37,48 %), percentiles 50/90/95/99 de 23/42/61/150 ms ; PSS total 728 343 Kio, swap PSS 168 809 Kio. **Contexte défavorable et non représentatif : émulateur, binaire ancien, Metro en développement et suites de tests simultanées sur le poste.** Ces compteurs ne mesurent pas un parcours isolé, ni toute la composition de la carte, ni une fuite mémoire. Ne pas en déduire la fréquence de saccades en production.

**Suite recommandée :** rejouer les parcours carte → recherche → détail → navigation sur un binaire release actuel et deux appareils physiques, avec point de départ propre, trace CPU/rendu, mémoire avant/après plusieurs cycles et latence des actions/API corrélée. Mesurer le démarrage à froid, la reprise réseau, les requêtes en double et le volume téléchargé ; garder les opérations de tracé/géocodage annulables et les listes paginées. Pour le backend, conserver un journal de sortie/redémarrage avec date et identifiant de processus afin d'expliquer les interruptions avant tout test d'endurance.

### Automatisation rejouée lors de cette reprise

| Périmètre | Résultat | Ce que cela ne valide pas |
| --- | --- | --- |
| Mobile, suite JavaScript complète | 4 441 réussis, 0 échec, 1 ignoré ; 842,6 s | Le test Ruby des cibles iOS est ignoré faute de Ruby ; aucun build natif certifié |
| Types mobile | Réussis, sans émission ni cache incrémental ; 94,6 s | Pas une compilation native ou un contrôle des types backend |
| Backend général, deux lots | 394 suites réussies, 0 échec, 63 suites conditionnelles ignorées sur 457 fichiers | Transpilation Jest ; SQL conditionnel non activé dans cette passe ; pas de total de cas cumulé annoncé |
| Intégration réelle HTTP/PostgreSQL/Redis | 33 réussis : réservation 10, crédit matériel 8, commerce 9, authentification 6 | Fournisseurs simulés ; pas de paiement/SMS/push réel ; pas 33 parcours tactiles |
| Admin | 246 réussis, 0 échec ; 43,7 s | Pas une recette exhaustive du navigateur admin |
| Partenaire | 98 réussis dans 15 fichiers ; 14,3 s | Pas une recette tactile/navigateur de chaque rôle |
| Site public | 7 réussis, 0 échec ; 1,9 s | Pas de certification navigateur multi-écran |

Les 33 scénarios chargent notamment les adaptateurs mobiles/admin réels, le formulaire produit admin, les callbacks des écrans produit et remboursement, puis les contrôleurs et la base SQL temporaires. Ils exercent consentement, coûts/échéanciers, paiements partiels, remise anticipée, idempotence, perte de réponse, isolation par propriétaire et KYC. Les frais, remises et versements sont synthétiques. Les suites des autres domaines SQL déjà répertoriées plus bas n'ont pas toutes été rejouées dans cette reprise.

Le premier lot backend a atteint la limite du lanceur après 20 minutes : 153 fichiers explicitement marqués `PASS`, aucun `FAIL` observé. Ce code de sortie lié à `SIGTERM` n'est pas un échec métier ni un crash du backend habituel. La reprise a sélectionné les 304 autres fichiers, vérifié l'absence de modification des sources backend depuis le premier lot, et terminé en 451,8 s : 241 suites réussies, 63 ignorées, 0 échec ; 2 400 cas réussis et 1 196 ignorés **dans ce second lot seulement**. Le rapprochement par chemin confirme 457 fichiers pris en compte, aucun doublon entre lots et aucun fichier manquant. Les 63 suites ignorées restent non validées par cette passe générale ; les recettes SQL explicites sont comptabilisées séparément. Preuve : `.expo/backend-combined-continuation-2026-11-27.json`. Les deux suites qui échouaient dans la précédente passe générale (`dispatch-handoff` et `installation-update-delivery`) sont cette fois réussies.

Les sondes `probe-settings-support.cjs` rapportent les défauts R6–R8 avec `finding: true` ; elles ne constituent pas des tests de régression verts de ces fonctions. R9 est marqué `finding: false`, `discarded: true` après contrôle du vrai parent. La validation directe « sujet/message requis » bloque bien les mutations avant réseau.

Preuves de cette reprise : `.expo/platform-audit-2026-11-27-<périmètre>-continuation-actions.log` et `.json`, `.expo/isolated-e2e-2026-11-27-integration-continuation-actions.log`, `.expo/native-actions-2026-11-27.json`, `.expo/support-action-api-2026-11-27.json`, `.expo/settings-support-edge-cases-2026-11-27.json` et `.expo/native-performance-snapshot-2026-11-27.json`. Les suites JavaScript ne fournissent pas ici de pourcentage de couverture : un grand nombre de tests réussis ne mesure pas la proportion de boutons ni de branches métier exercés.

## Recette par domaine et améliorations proposées

Les détails par fichier figurent dans la matrice CSV. Les propositions ci-dessous ne sont pas toutes des bugs : elles précisent ce qui améliorerait la robustesse ou reste à prouver.

| Domaine | Vérifications de cette extension | Amélioration ou suite nécessaire |
| --- | --- | --- |
| Démarrage/authentification | Liens auth, onboarding, ancien écran de permissions et splash redirigés avec session existante | Rejouer première inscription, OTP expiré/erroné, reset, redémarrage et perte de session sur les binaires actuels ; ne pas confondre ces redirections avec une inscription native complète |
| Accueil/onglets | Accueil restauré ; ancien onglet Messages vers Notifications ; Recherche accessible ; Revenus renvoie aux trajets pour ce conducteur non taxi | Matrice passager, privé, taxi, interurbain ; course prioritaire selon rôle et statut, sans boucle de navigation |
| Recherche/publication | Contrôles antérieurs conservés : tri, points, modal réservation ; nouveaux accès liste/historique | Rejouer sélection carte, repères obligatoires, contrôle serveur 100 m sur vrai tracé, pagination et changements de dates ; éviter toute géométrie de secours utilisée comme preuve d’éligibilité |
| Demandes | Listes et formulaire ouverts ; commande affectée redirigée vers son trajet | Deux appareils pour acceptation, négociation, conducteur absent, changement de conducteur et notifications d’état |
| Navigation passager | Réservation acceptée ouverte ; défaut R1 remonté par une API réellement utilisée | Retester arrivée et paiement après mise à niveau ; conserver un écran de récupération exploitable si options indisponibles |
| Navigation conducteur | État d’un trajet terminé consulté ; aucune action d’embarquement/dépose effectuée ici | Trajet réel simulé GPS, confirmations manuelles, plusieurs réservations, paiement puis clôture ; essai natif de veille indispensable |
| Profils/QR/KYC | Profils consultés ; lecture publique HTTP 200 séparément ; QR non disponible pour KYC en attente | Profil public admissible, scan externe, lien vers le site, contact d’un autre participant ; les restrictions KYC ne doivent pas être contournées pour la recette |
| Favoris/localisation | Ajouter → Ma position → Utiliser ce lieu → enregistrer → supprimer le favori synthétique ; retour à deux favoris | R3/R4 ; labels accessibles des icônes seules ; arrêt GPS, autorisation refusée/révoquée et géocodage lent |
| Documents | Création, édition, consentement, suivi et annulation par boutons natifs ; contrôles API du résultat | R2 ; statut du dossier visible ; devis révisé et acceptation à recetter sans modifier un dossier utilisateur |
| Catalogue/crédits | Catalogue courant vide ; téléphone/véhicule/casque consultés ; états d’identifiant inexistant | Fixtures d’offres et contrats pour choix de formule, coût total, versement quotidien, remboursement anticipé et changement de périodicité ; pas de certification d’achat natif sur catalogue vide |
| Flottes | État sans affectation ; candidatures ; erreur d’affectation inexistante | Créer propriétaire/conducteur et contrat périodique synthétiques, déclarer puis confirmer le versement ; aucune opération propriétaire réelle |
| Portefeuille | Recharge ouverte, numéro absent bloqué ; transfert ouvert, montant vide bloqué ; fermeture des modals | Aucun règlement lancé ; vérifier perte réseau, retour fournisseur, statut inconnu et double toucher uniquement avec preuves/sandbox autorisés |
| Historique financier | Consultation ; inversion des réponses reproduite en JS | R5 ; contrôle reçu sélectionné, filtre, pagination, reprise et téléchargement sur appareil |
| Notifications/messages | Centre consulté ; conversation lue, champ présent ; lien entrant incomplet récupérable | Réception multi-session, son/plein écran réels et messages synthétiques dédiés ; pas de validation push par simple ouverture de l’écran |
| Notation/assistance | Notation sans note bloque l’envoi ; aide et signalement consultés sans envoi | Note et signalement autorisés sur trajet de test uniquement ; retour et suivi de traitement ; aucun SOS/appel de test vers des personnes réelles |
| Invitation/parrainage | Refus natif des contacts ; alternative disponible ; lectures de parrainage | Déclencher la permission après un clic explicite, expliquer brièvement l’usage ; retraits et partage externe non déclenchés |

## Tests automatisés exécutés dans cette extension

Treize suites SQL/HTTP sont activées explicitement, avec vérification de types et bases jetables :

| Suite | Cas validés après reprise |
| --- | ---: |
| Déclaration cash, socket/REST et contrat mobile | 6 |
| Cash de secours après jetons | 16 |
| Cohérence financière des réservations | 20 |
| Changement de conducteur | 39 |
| Autres passagers du trajet | 12 |
| Profil conducteur public | 10 |
| Opérations mobiles | 14 |
| Dossier documentaire | 26 |
| Candidatures de flotte | 11 |
| Registre de flotte | 15 |
| Crédit matériel | 33 |
| Crédit Pro | 39 |
| Encaissements de crédit | 42 |
| **Total distinct** | **283** |

La passe étendue terminée compte **282 réussites et un échec**. L’échec vient du chargement de dépendances natives/Expo dans la fixture cross-repository de déclaration cash, avant les assertions suivantes. Les mocks des lectures d’options de paiement, de visibilité et des icônes ont été ajoutés au chargeur du composant. La suite ciblée a ensuite réussi **6/6**. Déduplication par fichier et nom de test : **283 cas distincts réussis après reprise**, pas une passe monolithique entièrement verte. Le parcours conserve la vraie mutation mobile, HTTP, SQL, le message socket, la récupération REST et le reçu conducteur ; les options financières de cette fixture cash sont simulées, pas lues sur la base habituelle.

La première tentative de cette extension sous sandbox n’avait pas pu démarrer PostgreSQL. Ses échecs d’initialisation ne sont pas des régressions métier. La reprise avec création de processus PostgreSQL autorisée est celle retenue ci-dessus.

Les trois sondes JavaScript R3/R4/R5 retournent `finding: true` : cela signifie **défaut reproduit**, pas test de livraison réussi. Les correctifs de ces défauts ne sont pas intégrés dans cette extension d’audit.

## Performance, disponibilité et maintenabilité

### Mesures connectées

- **35 GET métier distincts : 35 HTTP 200**, dans la première passe de lecture de cette extension. Sans session, `/users/me` répond 401 comme attendu. Cela n’incluait pas les options de paiement par réservation : les trois 500 découverts ensuite interdisent de conclure que toutes les API fonctionnent.
- Les requêtes sont séquentielles sur le poste local, sans charge distribuée. Le plus gros corps décodé mesuré est encore l’activité conducteur compacte : **311 997 octets pour 88 trajets**, lecture à **328 ms** dans cet échantillon. Réservations d’activité : **60 244 octets pour 17 réservations**. Historique de dix trajets : 38 767 octets ; dix réservations : 36 628 octets.
- Le format compact a réduit le volume dans la passe précédente, mais une grande liste de départs futurs reste coûteuse. Recommandation : résumé de priorité séparé, pagination des futurs départs et chargement des détails à la demande. Ne jamais couper une course active, un paiement à terminer ou une réservation en cours pour atteindre artificiellement une taille cible.
- Les durées RTK de l’émulateur incluent d’autres facteurs que le serveur : file d’attente, transport, transformation et charge du poste. Le script utilise désormais l’horloge du runtime mobile pour comparer ses timestamps, pas celle du poste ; les premiers relevés peuvent omettre des lectures très rapides à cause du décalage d’horloge.
- Aucun nombre local ne constitue un p95/p99 de production, une limite de capacité, un SLA ou une preuve d’absence de fuite mémoire.

### Observation courte de stabilité

Une première sonde s’est arrêtée après 39 lectures : 20 réponses 200, 18 erreurs 404 et une réponse 429. Les 404 provenaient du **mauvais préfixe de santé dans le script d’audit** : `/health` est explicitement exclu du préfixe API. Ce n’est pas un défaut de la route de santé. Le 429 signale l’application de la limite de requêtes, pas un arrêt du serveur ; la sonde a cessé ses appels sans contourner ce limiteur.

Le script a été corrigé pour utiliser `/health`, espacer les tours à cinq secondes et borner les lectures. **Reprise : 25 réponses 200 et une réponse 429 en 56,4 secondes**, puis arrêt automatique. Santé : 12/12 réponses 200 (20–65 ms) ; activité : 11 réponses 200 et un 429 ; liste compacte : 2/2 réponses 200 (235–239 ms). Le résultat est enregistré séparément dans `.expo/local-stability-2026-11-27-verified.json`. Le backend répond encore : ce n’est pas une preuve de crash. L’application ouverte émet aussi ses propres lectures ; cet échantillon ne représente pas une activité utilisateur ordinaire isolée, ni une limite de capacité.

**Proposition de fiabilité :** vérifier la coordination des lecteurs d’activité, leur suspension hors écran et le respect de `Retry-After`/backoff. Recetter le rendu après 429, sans boucle de retry ni déconnexion injustifiée. Ne pas simplement augmenter ou désactiver le limiteur pour obtenir un test vert. Le test prolongé de stabilité reste à réaliser sur un banc dédié.

### Maintenabilité

- Les plus grands graphes d’interactions concernent le détail de trajet (162 gestionnaires JSX accessibles), le détail de demande (136), la navigation conducteur (108) et la publication (99). Ce sont des graphes partagés, pas le nombre de boutons visibles. Il faut contractualiser les transitions métier avant de découper davantage les composants.
- L’extension SQL démontre l’intérêt des tests avec vraie base : une suite isolée verte ne détecte pas à elle seule un décalage d’historique de migration de la base utilisée par l’application. Ajouter un contrôle de version **et de structure attendue**, puis un scénario de migration depuis une copie ancienne. Ne plus modifier une migration déjà appliquée : ajouter une migration de progression.
- Les fixtures qui chargent du code mobile dans Jest backend sont sensibles aux nouvelles dépendances Expo. Centraliser les adaptateurs de rendu et les contrats de lecture ; ne pas remplacer les règles financières pour rendre la suite verte.
- Deux fichiers n’ont pas de référence directe détectée par l’inventaire statique : `app/+native-intent.tsx` et `app/booking/payment.tsx`. Ce n’est pas la preuve qu’ils ne sont couverts par aucun test indirect. Ajouter explicitement les liens entrants froid/chaud et la redirection de paiement à la matrice de livraison.
- Ajouter des sélecteurs accessibles aux icônes seules des favoris. Les outils natifs ne doivent pas dépendre du caractère privé d’une police d’icônes ; un comptage automatique de labels non vides ne prouve pas leur qualité.

## Changements techniques appliqués pendant cette extension

- `scripts/audits/native-screen-recette.cjs` : navigation explicite locale, capture de structure native, route réellement montée, garde des dialogues système et métadonnées API sans identifiants. Ne clique pas automatiquement sur tous les contrôles et ne valide pas leur comportement.
- `inventory-screen-actions.cjs` : inventaire AST de tous les fichiers de routage, imports locaux, gestionnaires et références de tests ; JSON/CSV régénérables.
- `probe-screen-reads.cjs` : liste fermée de GET locaux, tailles/durées/statuts, contrôle non authentifié ; aucun corps de réponse conservé.
- `probe-screen-edge-cases.cjs` : reproductions déterministes R3/R4/R5 avec dépendances simulées et aucune écriture backend.
- `probe-local-stability.cjs` : observation courte et bornée, une requête à la fois, arrêt sur limitation/session perdue/erreurs répétées.
- `run-isolated-e2e.cjs` : modes `screen-audit-postgres` et `screen-cash-postgres`, sans activation de migrations habituelles ni accès aux prestataires.
- `migrate-local-cash-exceptions.cjs` : inspection/applicateur limité à une migration explicitement nommée ; garde loopback, transaction, délais de verrouillage, empreintes financières et rollout désactivé. Première inspection arrêtée avant modification ; application ultérieure de la nouvelle migration de progression autorisée et détaillée en R1.
- `native-action-check.cjs` : actions explicites sur l'émulateur local authentifié, contrôle d'unicité et de visibilité avant toucher, assertions de texte/état désactivé/interrupteur, arrêt au premier contrôle manquant. Saisie ASCII synthétique seulement ; aucune exploration ou action de paiement automatique.
- `probe-settings-support.cjs` : reproductions des paramètres éphémères et erreurs de soumission d'assistance sur les composants/hooks réels avec dépendances simulées. Diagnostic des défauts, pas certification de leur résolution.
- `run-platform-audit.cjs` : suffixe de sortie contrôlé pour conserver les preuves des différentes passes sans écraser les précédentes, contrôle des types mobile et reprise backend après limite d'exécution. La reprise exclut uniquement les fichiers explicitement marqués `PASS`, refuse une modification des sources backend depuis le premier lot et rejoue tous les autres, y compris les cas conditionnels. Environnement minimal et garde réseau local conservés.
- Backend `src/bookings/cash-declaration-postgres.spec.ts` : adaptateurs manquants de lecture/visibilité/icônes ajoutés à la fixture ; production inchangée.
- Documentation : présente synthèse, matrice CSV et référence dans le journal technique.

ESLint ciblé des scripts ajouté/modifiés réussi ; vérification de diff ciblée sans erreur d’espacement. Ni compilation native, ni déploiement. Les données personnelles visibles dans les captures locales ne sont pas incluses dans cette documentation.

## Artefacts locaux et reproduction

Les artefacts `.expo` sont locaux, non destinés à être publiés et peuvent être régénérés. Les captures ne doivent pas être jointes à un rapport public sans anonymisation.

- `.expo/native-screen-recette-2026-11-27.json` : observations natives. Écarter les premiers favoris/récurrences bloqués par le dialogue Contacts, et les essais de chemins invalides `/booking/:id`, `/(tabs)/index`, `services/new?code=documents`. Les chemins valides ont été rejoués ; un essai d’URL incorrect ne prouve pas un bug de l’application.
- `.expo/native-documents-lifecycle-2026-11-27.json` et `.expo/native-favorite-lifecycle-2026-11-27.json` : résultats des parcours synthétiques, sans identifiants de compte.
- `.expo/screen-action-inventory-2026-11-27.json` et `.csv` : inventaire des actions et références statiques.
- `.expo/screen-api-reads-2026-11-27.json`, `.expo/booking-payment-options-live-2026-11-27.json` : lectures connectées et défaut 500.
- `.expo/screen-edge-cases-2026-11-27.json` : défauts JS reproduits.
- `.expo/local-cash-exceptions-inspection-2026-11-27.json` : arrêt de sécurité avant migration.
- `.expo/isolated-e2e-2026-11-27-screen-audit-postgres-screens-verified.json` et `.log` : passe 282/283 ; `screen-cash-postgres-screens-fixture-final.json` et `.log` : reprise 6/6.

Commandes sans paiement ni mutation de la base habituelle :

```powershell
node scripts/audits/inventory-screen-actions.cjs
node scripts/audits/probe-screen-edge-cases.cjs
node scripts/audits/probe-screen-reads.cjs
node scripts/audits/probe-local-stability.cjs
node scripts/audits/migrate-local-cash-exceptions.cjs
```

Les scripts connectés exigent le runtime de développement local authentifié. La création de bases SQL temporaires nécessite les binaires PostgreSQL locaux et les permissions de processus ; elle est distincte de l’application d’une migration à la base habituelle.

## Priorités de sortie

1. R1 est corrigé et retesté localement. Préparer la revue de migration et la recette de règlement sur environnement dédié avant déploiement ; la réussite locale ne valide pas la base de production.
2. Corriger R6 en priorité pour ne pas afficher de faux contrôles de confidentialité, puis R2–R5 et R7–R8 avec tests de concurrence, panne, persistance et réponse tardive ; rejouer leurs boutons natifs. Ne pas traiter R9 comme un défaut : sa protection existante est vérifiée.
3. Alimenter un jeu de recette dédié : conducteur KYC approuvé dans chaque catégorie, passagers, flotte avec contrat, offres, crédits en cours/soldés/en retard, documents aux différents statuts. Ne pas convertir un compte réel pour débloquer un test.
4. Compléter les cas non exécutés de chaque ligne de la matrice, avec deux sessions simultanées pour les événements de course et de messagerie. Une ligne « Partiel » ne devient validée qu’après ses branches d’erreur et d’état.
5. Construire les binaires actuels Android/iOS et recetter permissions, carte, grandes polices, veille, voix, notifications et reprise après appel sur appareils physiques.
6. Banc de stabilité distinct : charge progressive, redémarrages backend/Redis, réseau instable, tâches différées, concurrence et intégrité financière, en mesurant latences et ressources sur une durée représentative.
