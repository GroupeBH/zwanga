# Journal des changements techniques

## 2026-10-31 — Déblocage du post-install EAS et accès direct à la commande

- **Constat/périmètre :** le journal EAS fourni s'arrête pendant les tests JavaScript : 3 008 réussites, 12 échecs, deux tests ignorés. TypeScript, ESLint, frontière réseau, taille des sources et contrôles préalables iOS y réussissent ; ce journal ne montre pas un échec de compilation Xcode. Les 12 échecs sont reproduits localement sous Node 24.22.1 avant correction.
- **Navigation appliquée :** `components/home/HomeTripsSheet.tsx` renomme l'action conducteur en « Commander un trajet » avec un sous-titre et une indication d'accessibilité cohérents. Le clic utilise `getTripRequestCreateHref()` (`/request-create`, alias du formulaire existant), sans détour par la recherche ni changement de rôle. Le champ passager « Où allez-vous ? », dont le texte annonce les trajets publiés, retrouve `/search` ; l'accès « Voir tout », la publication, les clients, les gains, le style orange et les dimensions restent inchangés. `tests/homeCompactLayout.test.js` vérifie la nouvelle destination, le titre, l'accessibilité et le contraste sans affaiblir les contrôles du parcours passager.
- **Isolation des tests appliquée :** dans `tests/arrivalTerminology.test.js`, `tests/passengerDriverInterruption.test.js`, `tests/passengerPickupEstimate.test.js` et `tests/requestSummaryViews.test.js`, le nouveau sous-composant de changement de conducteur est simulé comme les autres dépendances hors périmètre. Sans cela, son import amenait le vrai Expo Router et son JSX dans Node, d'où sept erreurs `Unexpected token '<'`. Le composant de production n'est pas supprimé ou désactivé ; ses tests propres (`requestDriverActions.test.js`, `requestDriverChange.test.js`) continuent d'exercer la logique réelle avec des entrées/sorties simulées.
- **Précautions :** aucun test supprimé, aucune désactivation du contrôle EAS, aucun changement de dépendance, fichier natif, configuration de notification ou backend. Les cinq échecs liés aux routes sont traités par la distinction entre recherche passager et commande conducteur, avec mise à jour des attentes correspondant à la demande utilisateur.
- **Vérifications :** campagne ciblée de neuf fichiers, **76 tests JavaScript réussis**, sans échec ni test ignoré. Contrôle complet `scripts/check-release.cjs` terminé avec code zéro sous Node 24.22.1 : **3 021 tests réussis, zéro échec, un test ignoré**. TypeScript, ESLint, compatibilité URI/Metro, parité des sources natives, frontière réseau et taille des sources passent également (1 247 sources, aucune au-dessus de 400 lignes). `git diff --check` réussi ; aucune mesure de performance native déduite de la durée des tests.
- **Limites :** le test de politique Ruby est ignoré car Ruby n'est pas installé sur cette machine ; il reste à exécuter dans un environnement équipé de Ruby/macOS. Aucun nouveau build EAS, compilation native, essai sur appareil physique ou déploiement dans cette intervention. Les tests Node ne prouvent pas l'absence de crash iOS/Android ni la réception effective d'une notification.

## 2026-10-30 — Changer de conducteur et priorité de trois minutes sur la carte

- **Demande/périmètre :** permettre au passager de quitter une prise en charge trop lente, avant embarquement, sans recréer sa demande ; choisir ensuite un véhicule sur la carte. Le choix explicite suspend les autres invitations, reprend immédiatement en cas de refus et après **180 secondes sans réponse**, selon la clarification utilisateur. Complète les modifications backend de changement de conducteur déjà présentes, sans les écraser. Aucun déploiement ni accès à la production.
- **Interface appliquée :** `ChangeRequestDriverButton.tsx`, `MapDriverSelection.tsx`, `requestDriverChangePolicy.ts`, `RequestSearchScreen.tsx`, `RequestSearchMap.tsx`, `RequestTargetDriver.tsx`, `RequestPassengerTicket.tsx` dans `features/request-detail/`, ainsi que `PassengerNavigationInfoCard.tsx`. Bouton « Changer de conducteur » avec confirmation ; un tap sur un véhicule ouvre un panneau compact avec son type, l'âge de sa position et « Envoyer à ce conducteur ». Pas de véhicule inventé, pas de nouvelle modale native dans la carte, ni d'acceptation implicite. L'espace cartographique, les regroupements, les positions connues et les actions modifier/annuler restent conservés. Le skill frontend a guidé ce panneau compact ; aucun nouvel habillage global.
- **Navigation et réseau :** `store/api/requestDriverApi.ts`, les types/mapper de demande et `hooks/passenger-navigation/usePassengerNavigationState.ts` relient les nouvelles routes, mettent le cache à jour depuis la réponse serveur et reviennent à la recherche avec le mécanisme existant de libération de carte. Désactivation hors ligne/inactif, garde de compte, verrou anti-double tap, contrôle de la sélection affichée et messages d'erreur sans suppression de la demande. Les réservations et trajets sont invalidés après la transition, pour éviter un démontage provoqué par la relecture avant navigation. Le serveur reste l'autorité pour l'embarquement et les paiements.
- **Backend appliqué :** `target-map-driver.ts`, `dto/target-map-driver.dto.ts`, `request-search-map.ts`, contrôleur/service/entity de demande, `sequential-dispatch.service.ts`, `request-refusal.ts`, `request-acceptance.ts`, `nearby-request-cooldown.ts`. Le marqueur opaque est résolu côté serveur et la disponibilité est relue sous verrous demande/conducteur. L'invitation et sa notification durable sont enregistrées dans la même transaction, sans réseau sous verrou. Une nouvelle identité d'offre invalide les anciennes actions ; un rejeu HTTP identique ne prolonge pas la priorité. Les autres conducteurs ne peuvent pas accepter pendant ce ciblage. Migration additive **1780000103000-MapDriverPriority** : échéance persistée et index partiel. Le guide PostgreSQL a orienté les transactions courtes, le verrouillage et les tests sur base isolée.
- **Changement d'affectation conservé/complété :** le backend `change-request-driver.ts`, `BookingsService.cancelUnpaidBookingForDriverChange`, les clôtures d'offres et les contrôles de démarrage/publication empêchent de restaurer l'ancien conducteur. Migration **1780000102000-PassengerDriverChangeReason** pour une exclusion limitée à cette demande, sans pénalité globale. Pas de changement de conducteur après embarquement, déclaration contradictoire, paiement engagé ou réservation clôturée ; aucun remboursement ni débit effectué par ce flux. Les autres passagers d'un trajet partagé sont préservés. Une demande dont la plage est dépassée est rouverte trente minutes ; sinon ses horaires sont conservés.
- **Délai et reprise :** les trois minutes démarrent lors de la sélection enregistrée par le serveur, pas à la réception push ; elles sont bornées par la dernière heure de départ. Le worker existant détecte l'échéance persistée, même après perte du calendrier Redis, et libère la cible avant de reprendre la file normale de 40 secondes. La livraison d'une nouvelle invitation dépend encore du fonctionnement de Redis et des fournisseurs. Une réponse en cours de préparation/contre-proposition conserve ses propres protections. Les demandes ciblées dès la création conservent leur ancien contrat ; la reprise automatique nouvelle concerne le choix sur la carte. La durée de sonnerie n'est pas portée artificiellement à trois minutes.
- **Nouvelle alerte au même conducteur :** `features/notifications/mapDriverAlert.ts`, `rideAlert.ts`, `rideSound.ts`, `services/rideAlertSession.ts`, `driverNotifications.ts` distinguent une nouvelle sélection explicite de l'ancienne alerte du même trajet. La décision antérieure n'étouffe pas cette invitation ; doublons, copies anciennes et échéances expirées ne la relancent pas. Les identifiants de cartes Android restent stables pour le transfert audio existant. La génération survit à la conversion des données socket en chaînes Notifee. Les registres sont bornés ; aucun fichier Java/Swift, fichier sonore ou permission native modifié.
- **Vérifications backend réelles locales :** 29 tests PostgreSQL de changement de conducteur réussis ; deux suites PostgreSQL/PostGIS et Redis jetables complètes : **179 réussis, un benchmark optionnel ignoré**. Incluent six nouveaux scénarios de ciblage : 180 secondes/idempotence/exclusivité, refus, récupération SQL après perte du calendrier Redis, nouvelle alerte au conducteur précédent, acceptation concurrente, validation HTTP du propriétaire/DTO/version affichée. L'expiration de trois minutes est simulée en avançant les échéances SQL, sans prétendre à une attente physique de trois minutes ; les scénarios inter-dépôts existants comportent des attentes réelles de 40 s avec transport push et clients mobiles JavaScript simulés. 78 tests unitaires ciblés de demande/changement/carte et 120 tests unitaires de livraison réussis.
- **Vérifications mobiles :** campagne ciblée finale de **154 tests JavaScript réussis** (carte, actions, changements de compte, RTK Query, sonnerie, récupération et cycle de vie). Inclut l'échec de publication d'une carte et une décision avant restauration : la nouvelle invitation peut réessayer sans réactiver l'ancienne ni celle déjà traitée. TypeScript mobile/backend, ESLint mobile ciblé et des nouveaux modules backend, frontière réseau et taille des sources vérifiés ; 1 247 sources, aucune au-delà de 400 lignes. Les contrôles de cycle de vie iOS/Android sont simulés, pas des mesures natives.
- **Mise en service/limites :** appliquer les deux migrations backend puis déployer les nouvelles routes/workers avant la version mobile correspondante. Ces opérations n'ont pas été effectuées ici. Les anciennes versions ne bénéficient pas du nouveau bouton ni du dédoublonnage de priorité. Aucun essai FCM/APNs réel, téléphone physique, rendu natif, paiement réel ou garantie d'absence de crash/chauffe. Les restrictions système de notification restent inchangées.

## 2026-10-30 — Priorité à la fiabilité de livraison des alertes backend (diagnostic)

- **Périmètre :** examen du ciblage, de la file Redis, des invitations/outbox PostgreSQL, des envois push/socket et des accusés mobiles dans `zwanga-backend`. Le comportement Android satisfaisant est un retour utilisateur, pas une nouvelle mesure sur appareil. Aucune modification fonctionnelle mobile/backend, migration, consultation de production ou notification réelle dans cette intervention. Le guide PostgreSQL a orienté la vérification des transactions et des reprises concurrentes.
- **Protections déjà présentes et conservées :** invitation et notification enregistrées dans la même transaction, envoi après commit, verrous et identifiants d'événement contre les doublons, reprise des workers interrompus, revalidation avant envoi, relais après refus/expiration, retrait après acceptation, transports push et socket indépendants. Les refus historiques ne réintroduisent pas de pénalité globale.
- **Limite de disponibilité confirmée dans le code :** `SequentialDispatchService.advance()` retourne sans créer de nouvelle invitation lorsque `RequestDriverQueue.claim()` échoue. PostgreSQL peut retirer les invitations expirées mais ne sélectionne pas leur successeur tant que Redis est indisponible. C'est un choix de sécurité actuel, explicitement testé dans `sequential-dispatch.postgres.spec.ts`, et non une preuve d'une panne Redis en production. Piste à préparer : secours borné sous les mêmes verrous/contraintes SQL, avec tests de panne et de reprise Redis, sans double affectation.
- **Budget de réponse :** les 40 secondes de `sequential-policy.ts` commencent lors de l'insertion SQL dans `sequential-dispatch.service.ts`, avant l'envoi et les accusés. Dans `notifications.service.ts`, une tentative échouée redevient éligible après 15 s et le cron urgent passe toutes les 5 s ; `bounded-firebase-send.ts` borne l'envoi à 8 s. Exemple théorique, pas une latence mesurée : deux tentatives de 8 s séparées de 15 s et d'un passage cron peuvent consommer 31 à 36 s du budget. Une livraison tardive laisse donc peu de temps. Pistes : classer les erreurs permanentes/transitoires et accélérer le relais quand la non-livraison est certaine ; une éventuelle séparation des délais de livraison/réponse exige un protocole compatible avec les échéances déjà reçues par Android, pas une prolongation silencieuse côté serveur.
- **Succès transport distinct de réception :** `deliverSavedNotification()` marque `sent` après succès du fournisseur ; `ride_notification_receipts` conserve séparément `receivedAt`/`displayedAt`. `RideAlertRealtime.publish()` confirme un appel à `emit`, pas une réception par le conducteur ; `ride_realtime_deliveries.completedAt` ne constitue donc pas un accusé mobile. Les accusés n'attestent ni un son audible ni une attention humaine. Piste : vue de diagnostic corrélée demande/invitation/notification, taux et délais par étape, alerte opérationnelle sur absence de progression.
- **Reprise sans accusé :** `recover-unacknowledged-ride.ts` ne relance qu'une fois les notifications Android v6 déjà envoyées sans accusé d'affichage. Les versions iOS/anciennes ne sont volontairement pas rejouées pour éviter une double sonnerie. Les reçus Expo sont contrôlés à partir de 15 minutes, toutes les 5 minutes : ils ne peuvent pas servir de preuve de livraison dans la fenêtre de 40 s. Ne pas ajouter de renvois iOS aveugles ; conserver cette distinction dans les diagnostics et le relais.
- **Vérifications ciblées :** 13 suites Jest, 120 tests réussis, sans échec : protocoles Android/iOS, compatibilité mobile, transport borné, revendication d'envoi, reprise, socket indépendant, expiration et absence de pénalité. Les erreurs synthétiques visibles dans les logs font partie des scénarios. Lanceur isolé ignoré dans `.expo/run-delivery-audit-20261030.cjs`, sans chargement de `.env` ni identifiants réels.
- **Intégration locale :** les deux suites `sequential-dispatch.postgres.spec.ts` et `dispatch-postgres.spec.ts` terminent avec 172 tests réussis, aucun échec et un benchmark optionnel ignoré (556 s pour la campagne, pas une latence de livraison). PostgreSQL/PostGIS et Redis réels jetables ; scénarios inter-dépôts par HTTP avec publication push simulée localement, actions mobiles JavaScript, relais après refus et attente réelle de 40 s. Accusés simulés, pas de carte native ni de son physique testés dans cette campagne. Les tests de panne Redis confirment la conservation SQL et le blocage des nouvelles sélections jusqu'au rétablissement. `git diff --check` réussi ; seul le journal est modifié dans les sources versionnées et le dépôt backend reste inchangé.
- **Limites :** les pistes ci-dessus ne sont pas appliquées. Aucun essai FCM/APNs réel, test iPhone physique, nouvelle compilation native ou garantie d'alerte audible sur chaque téléphone. Les constats de code ne suffisent pas à attribuer les incidents précédents à une cause de production précise.

## 2026-10-29 — Correction du conflit d'horaires lors de la modification d'un trajet

- **Problème/périmètre :** le P2 de l'audit avant déploiement permettait de déplacer un trajet sur une commande acceptée. Correctif uniquement dans `zwanga-backend`, sans migration ni déploiement ; modifications préexistantes préservées.
- **Solution/fichiers :** `TripsService.update()` utilise le nouveau `save-trip-details-update.ts` avec relecture sous verrous conducteur/trajet et écrit uniquement les champs modifiés. `driver-schedule-policy.ts` contrôle le nouvel horaire ou la réactivation d'un trajet, exclut sa propre demande et protège les affectations concurrentes. La durée estimée est conservée lorsque le départ est déplacé. Horaires compatibles, règles de prix/places et politique publique/publique conservés ; cache/notifications après commit seulement.
- **Vérifications :** 73 tests unitaires et 113 tests de la suite PostgreSQL/PostGIS réussis, dont 13 nouveaux scénarios de base réelle ; TypeScript backend, ESLint des modules de production et contrôle des diffs réussis. Pas de test physique ni de validation d'archive native dans cette intervention. Les réserves natives du dernier audit restent ouvertes.
- **Documentation :** [correctif détaillé et limites](CORRECTIF_MODIFICATION_HORAIRES_2026-10-29.md). Le skill PostgreSQL a guidé la transaction courte et l'ordre des verrous. Aucun secret, donnée de compte réel ou valeur de `.env` dans la documentation.

## 2026-10-29 — Dernier audit avant déploiement, sans correctif applicatif

- **Périmètre :** sources mobiles et backend courantes, tests isolés, PostgreSQL/Redis jetables et banc Android séparé. Modifications préexistantes conservées ; aucun accès production, déploiement, SMS/push réel ou paiement opérateur. Le skill PostgreSQL a guidé l'examen des verrous et l'isolation des essais.
- **Constat :** anomalie P2 reproduite dans la méthode backend de modification d'un trajet : changement du départ enregistré sans recontrôle du planning conducteur. Correction proposée mais non appliquée. Les dépendances iOS locales restent à régénérer/valider sur macOS et aucun artefact Android release n'est disponible pour contrôle.
- **Résultats :** mobile 3 006 réussis et 1 ignoré ; backend général 3 066 réussis et 1 ignoré, ce dernier test de migration ensuite réussi séparément ; distribution PostgreSQL/Redis 159 réussis et 1 benchmark ignoré ; cohérence financière PostgreSQL 17 réussis ; OTP Redis 9 réussis. TypeScript des deux projets et contrôles statiques mobiles réussis. Banc Android compilé : 17 scénarios de publication réussis après un premier timeout ADB conservé dans les traces, puis 10 scénarios audio réussis. Ces tests ne constituent pas une validation des archives de production ni des téléphones physiques.
- **Livrable :** [audit avant déploiement](AUDIT_AVANT_DEPLOIEMENT_2026-10-29.md), avec preuves, fichiers, reproduction, résultats, limites et conditions de publication. Diagnostics ignorés sous `.expo/` ; aucune fonctionnalité modifiée dans cette intervention. Pas de certification d'absence de crash ou de chauffe.

## 2026-10-29 — Actions visibles : voyager comme passager et confirmations

- **Périmètre/problème :** demande utilisateur de mettre « Voyager comme passager » en orange et de corriger les boutons blancs des confirmations. Le composant partagé rendait les actions `danger`/`destructive` avec un fond rouge à peine opaque, les actions `ghost` sans fond et les actions sans variante sans couleur dédiée.
- **Solution appliquée :** `features/home/HomeTripsSheet.styles.ts` et `components/home/HomeTripsSheet.tsx` donnent au bouton passager un fond orange `ACTION_COLORS.orange`, un titre, un sous-titre et des icônes blancs. Dans `components/ui/DialogProvider.tsx`, action principale orange (également par défaut), action destructive rouge foncé, actions secondaires/annulation gris clair avec bordure ; indicateurs de chargement assortis au texte, cibles d'au moins 48 px et états d'accessibilité occupé/désactivé. `features/dialogs/dialogTypes.ts` documente la variante par défaut. Les libellés restent adaptables sans troncature imposée.
- **Cohérence des suppressions :** seul le choix de variante passe à `destructive` dans `app/chat/[id].tsx`, `app/notifications.tsx`, `hooks/chat/useChatMessageActions.ts`, `hooks/settings/useSettingsAccountActions.ts` et `hooks/security/useEmergencyContactActions.ts`. Les suppressions déjà classées `danger`/`destructive` bénéficient du style partagé sans modifier leurs appels.
- **Comportements conservés :** mêmes routes, callbacks, messages, ordre des boutons et permissions. Pas de suppression automatique ni d'appel serveur supplémentaire. La confirmation et l'annulation restent distinctes ; fermeture native iOS avant exécution, `autoClose: false`, états de chargement et blocage des autres actions inchangés. Modifications antérieures du dépôt conservées, aucun fichier natif ou backend modifié.
- **Contrôles statiques :** TypeScript mobile, ESLint ciblé sur les composants/hooks/écrans/tests modifiés et `git diff --check` réussis. Aucun déploiement.
- **Vérifications :** 79 tests JavaScript ciblés réussis (nouveau `tests/dialogActions.test.js`, accueil, chat, notifications, suppression de compte et gestion des superpositions). Les tests vérifient les fonds opaques, le contraste du texte ≥ 4,5:1, les icônes blanches de l'action passager, les loaders et le séquencement de fermeture Android/iOS simulé. `homeCompactLayout.test.js` et `releaseAuditFixes.test.js` sont adaptés au nouvel orange sans supprimer les contrôles de contraste. Taille : 1 243 sources contrôlées, aucune au-delà de 400 lignes. Aucun essai visuel sur appareil ou compilation native ; ces tests ne constituent pas une validation UIKit/Fabric réelle.

## 2026-10-29 — Correctifs de stabilité globale : accès au trajet, compte et statut conducteur

- **Périmètre/problèmes :** les trois P2 du dernier audit global sont traités : lien conducteur perdu après une panne réseau, rejet RTK non géré après suppression de compte, statut d'accueil affirmant à tort la réception des demandes. La compilation backend incluait également des diagnostics temporaires.
- **Solutions et fichiers :** lien de trajet confirmé contrôlé par compte/demande/erreur dans `assignedTripNavigation.ts`, `useRequestDetailController.ts` et `app/request/[id].tsx` ; intercepteurs indépendants dans `getProfileSummary.endpoints.ts` ; états incertains et baux historiques dans `homeDriverStatus.ts` ; inclusion limitée à `src/` dans `../zwanga-backend/tsconfig.build.json`. Aucun diagnostic supprimé. Détails, précautions et tests dans [le compte rendu des correctifs](CORRECTIFS_ALERTES_HORAIRES_2026-10-29.md).
- **Vérifications :** 25 tests ciblés du trajet, de la suppression et de l'accueil réussis ; campagne combinée finale de 66 tests mobiles réussie, incluant aussi l'inscription push, les accusés et les contrôles d'extraction. La compilation backend standard réussit désormais sans le filtre temporaire. Aucun compte réel supprimé ni essai natif physique. Les autres changements présents dans les dépôts sont conservés.

## 2026-10-29 — Correctifs du diagnostic sonneries et horaires compatibles

- **Problème/périmètre :** exclusions globales pour une course future, classement de positions anciennes, inscription push mémorisée sans revalidation et accusés JavaScript perdus lors d'une erreur réseau. L'utilisateur autorise les nouvelles demandes dont les horaires sont compatibles.
- **Solution/fichiers/précautions :** contrôles serveur des plages horaires sous verrou conducteur, classement GPS et cache Redis de 30 s ; réparation périodique de l'inscription push et reprise bornée des accusés côté mobile. Description des fichiers, hypothèses de durée, protections et limites dans [le compte rendu spécialisé](CORRECTIFS_ALERTES_HORAIRES_2026-10-29.md). Le skill PostgreSQL a guidé les transactions courtes et les tests sur base jetable. Aucun déploiement, changement natif ou accès à des données de production dans cette intervention.
- **Intégration serveur finale :** deux suites PostgreSQL/PostGIS et Redis réussies, **157 tests passés et trois optionnels ignorés** (benchmark et deux parcours inter-dépôts). Acceptations/publications concurrentes, horaires, relais, refus et partage avec consentement vérifiés localement ; prestataires push simulés, aucun envoi réel.
- **Vérifications :** tests ciblés mobiles initiaux réussis (30 cas), puis **66 cas réussis** avec les correctifs de stabilité. La campagne mobile complète initiale avait deux tests en échec (fixture temporelle et empreinte de callback), corrigés et rejoués dans ce lot ciblé ; la campagne entière n'est pas annoncée comme entièrement rejouée sur le dernier état. TypeScript mobile/backend, ESLint mobile global, taille et frontière réseau réussissent. Détail des résultats et limites dans le compte rendu spécialisé. Aucun essai sonore physique, donc aucune garantie de sonnerie ou d'absence de crash sur appareil.

## 2026-10-29 — Suite autorisée du diagnostic AWS : invitations, critères conducteur et Redis

- **Périmètre/problème :** après accord explicite, lancement d'une seule tâche ECS de diagnostic avec l'image déployée, afin d'expliquer les demandes sans sonnerie entre 21 h 25 et 21 h 57 min 57 s, heure de Kinshasa. Aucun démarrage de l'application ou de ses workers ; transaction PostgreSQL en lecture seule, TLS, délais et résultats bornés, lectures Redis uniquement. Les scripts et sorties minimisées sont sous `.expo/` ; aucun code applicatif modifié.
- **Constats mesurés :** cinq demandes, dix invitations/notifications enregistrées `sent`, une demande acceptée, trois annulées et une encore en attente. Le relais de la dernière demande a contacté quatre destinataires à environ 40 secondes d'intervalle ; leurs positions enregistrées dataient de plusieurs heures à plusieurs jours. Des conducteurs proches sont affectés à une course ou sans jeton push au moment de la lecture. Aucun accusé mobile de réception/affichage pour les dix envois ; cela ne prouve ni une sonnerie ni son absence sur appareil.
- **Vérifications/précautions :** lectures SQL/Redis sans erreur rapportée ; tâche confirmée arrêtée à 21 h 58 min 35 s, codes de sortie 0 ; service de production inchangé, une instance active, révision 32. Aucun compte, demande, configuration ou paiement modifié, aucun push renvoyé et aucun déploiement. Les changements préexistants des deux dépôts sont conservés.
- **Détails/limites :** [rapport du diagnostic](DIAGNOSTIC_SONNERIES_AWS_2026-10-29.md), distinguant historique des invitations, état courant des critères conducteur, indices de divergence avec les sources locales et contrôles sur appareil restant à faire. Aucun test physique ni validation native dans cette intervention ; les pistes sont proposées, pas appliquées.

## 2026-10-29 — Diagnostic AWS des demandes sans sonnerie après 21 h 25

- **Périmètre/intervention :** consultations en lecture seule ECS, ECR, CloudWatch, X-Ray et deux paramètres non secrets de distribution/journalisation. Fenêtre CloudWatch du 29 octobre de 21 h 25 à 21 h 47 min 51 s, Kinshasa (UTC+1), complétée par les traces échantillonnées X-Ray jusqu'à 21 h 50 min 35 s. Aucun changement de configuration, lancement de tâche, déploiement, interrogation de base ou envoi de notification. Les scripts de diagnostic et sorties minimisées restent sous `.expo/aws-ringing-*20261029*`.
- **État constaté :** service ECS actif, une tâche exécutée sur une attendue, aucune en attente ; révision 32 déployée le 28 octobre. Image identifiée par son tag de commit `abe6b0df…` ; ce commit n'est pas disponible dans le dépôt local, donc aucune assimilation automatique au code courant. Distribution activée, journalisation au niveau avertissement.
- **Preuves métier :** une trace de création de demande à 21 h 35 min 29 s répond HTTP 201. D'autres lectures de demandes et mises à jour de position répondent HTTP 200. Des avertissements de position apparaissent à 21 h 28, 21 h 34, 21 h 40 et 21 h 46 ; la trace échantillonnée de 21 h 34 confirme un HTTP 400 avec `BadRequestException` indiquant que l'identité doit être approuvée avant l'activation conducteur. Ce rejet est établi pour cette opération ; aucun lien certain entre son compte et tous les testeurs n'est établi.
- **Limites :** 68 événements CloudWatch et 21 traces X-Ray pertinentes lus. Les traces sont échantillonnées et le niveau avertissement ne journalise pas systématiquement les succès d'envoi. Ni absence de push ni échec Firebase global démontré. Des avertissements de réconciliation de paiement sont également présents, sans preuve de lien avec la sonnerie. Les candidats, invitations, refus, états d'envoi et accusés doivent être corrélés en base avant d'attribuer la cause à chaque demande. ECS Exec est désactivé et aucun accès SSM existant n'est disponible. Un diagnostic temporaire de base en lecture seule nécessiterait un lancement de tâche distinct, non effectué sans nouvel accord. Aucun nom, téléphone, position précise, jeton ou secret conservé dans ce journal.

## 2026-10-29 — Audit global de stabilité et fiabilité, sans correctif applicatif

- **Périmètre :** application mobile courante, backend associé et banc natif Android isolé ; modifications préexistantes conservées, aucun déploiement ni accès à la production.
- **Constats :** trois anomalies P2 reproduites : accès au trajet conducteur confirmé masqué après erreur réseau, promesse de suppression de compte rejetée sans interception, indicateur de réception des demandes trop affirmatif sur données périmées/en erreur. Un problème P3 d'outillage concerne aussi l'inclusion d'un diagnostic `tmp/` dans TypeScript backend local, sans preuve d'impact sur l'image Docker qui l'exclut. Aucune correction fonctionnelle appliquée pendant cet audit.
- **Documentation et vérifications :** preuves, fichiers concernés, campagnes réellement exécutées et limites dans [l'audit détaillé](AUDIT_STABILITE_FIABILITE_2026-10-29.md). Diagnostics locaux sous `.expo/`, PostgreSQL jetable et alertes synthétiques dans le seul banc Android ; pas de compte réel ni de paiement opérateur. Tests JavaScript et essais du banc natif distingués, sans certification d'absence de crash ou de chauffe.
- **Résultats finaux :** mobile 2 990 réussis, 0 échec, 1 ignoré (Ruby absent) ; backend ciblé 891 réussis ; campagnes paiement 74 et notification conducteur 151 réussis, avec PostgreSQL jetable ; banc Android 17 scénarios de publication et 10 audio réussis. TypeScript backend standard bloqué par le diagnostic local, contrôle limité à `src/` avec les types backend réussi. Aucun essai physique iOS/Android, push opérateur réel ou compilation complète de production ; ces campagnes se recoupent et ne sont pas autant de parcours uniques.

## 2026-10-29 — Nouveau design de l'accueil : carte utile, actions recentrées, statut conducteur

- **Périmètre/problème :** l'accueil empilait un message de bienvenue et deux ou trois boutons de même poids (Proposer/Commander, Publier/Commander/Chercher), alors que la carte ne montrait que la position de l'utilisateur. Le conducteur ne voyait pas s'il recevait réellement les demandes, et la pastille « Trajet en cours » n'ouvrait rien. Le design a été validé sur maquette avant toute modification.
- **Solution appliquée — carte :** `features/home/homeMapMarkers.ts` et `hooks/home/useHomeMapMarkers.ts` construisent au plus 10 repères à partir des listes **déjà chargées** par l'accueil, sans nouvelle requête, socket ni lecture GPS. Le passager voit les points de départ des trajets publiés avec les icônes existantes par type de véhicule (voiture, moto, tricycle). Le conducteur voit les demandes proches avec les icônes existantes par genre ; une demande écartée de l'accueil reste masquée. Les coordonnées invalides ou non confirmées sont ignorées. Aucune position en direct de conducteur n'est affichée, conformément à la règle de confidentialité du backend. Les repères sont masqués pendant un trajet en cours. Toucher un repère affiche sa bulle, et toucher la bulle ouvre le détail par la navigation existante (`openTripDetail` / `openTripRequestDetail`). La légende ajoute « N départs/clients près de vous ». Les images natives sont statiques (`tracksViewChanges={false}`).
- **Solution appliquée — en-tête :** `components/home/HomeDriverStatus.tsx` et `features/home/homeDriverStatus.ts` affichent, pour le conducteur, « Vous recevez les demandes », « Position ancienne » (au-delà de 30 min, même seuil que le classement serveur), « Vous ne recevez pas les demandes », « Hors ligne » ou « Statut à vérifier ». Ces textes viennent du cache RTK Query partagé `driverDispatchStatus` (requête suspendue hors écran ou hors ligne, minuterie de 60 s uniquement à l'écran). L'indicateur ne crée ni bail, ni demande de permission, ni requête de position, et un toucher ouvre `/driver-availability`. Les champs `updatedAt` et `discoveryEnabled`, déjà renvoyés par le backend, sont ajoutés au type. La pastille « Trajet en cours » devient un bouton vers les mêmes routes que la bannière globale (`/trip/navigate/{id}` ou `/booking/navigate/{bookingId}`, `ongoingBookingId` ajouté à `useHomeTripSelection`). Elle reste informative si l'identifiant de réservation manque.
- **Solution appliquée — panneau :** la salutation est retirée. Passager : recherche « Où allez-vous ? » avec le sous-titre « Trajets publiés ou véhicule à commander », raccourcis, suggestion, puis le lien secondaire « Vous avez un véhicule ? Proposer un trajet ». Conducteur : « Publier un trajet » pleine largeur, indicateurs, clients, puis l'action secondaire « Voyager comme passager » vers `/search`. Pour ne perdre aucune commande, `app/search.tsx` affiche « Commander un véhicule » au-dessus des résultats de trajets, avec le même `handleCreateTripRequest` et la même route de création que l'état vide.
- **Fichiers :** `components/home/{HomeDashboard,HomeHeader,HomeDriverStatus,HomeMap,HomeTripsSheet}.tsx`, `features/home/{HomeHeader,HomeMap,HomeTripsSheet}.styles.ts`, `features/home/{homeMapMarkers,homeDriverStatus}.ts`, `hooks/home/{useHomeController,useHomeMapMarkers,useHomeTripSelection}.ts`, `store/api/driverDispatchApi.ts`, `app/search.tsx`, `features/screen-styles/app/search/container.styles.ts`.
- **Comportements conservés :** mêmes destinations de publication, recherche, création de demande, profil, notifications, gains et liste complète. Mêmes cartes prioritaires, suppression par glissement, états de chargement et d'erreur, contrastes ≥ 4,5:1 et cibles ≥ 44 px. La carte native n'est ni remplacée ni remontée. Aucun changement de rôle, du backend ou des alertes de sonnerie.
- **Tests :** nouveau `tests/homeMapRedesign.test.js` (repères par type de véhicule et genre, masquage, limite, coordonnées invalides, statut conducteur, routes de la pastille) et un cas ajouté dans `tests/searchScreen.test.js`. Les assertions de disposition de `homeCompactLayout`, `releaseAuditFixes` et `compactSearchCards` sont réorientées vers la nouvelle mise en page, et leurs vérifications de comportement sont conservées. Le nouveau hook est simulé dans `homeForegroundLifecycle` et `homeTripPriority`. L'empreinte de styles de la recherche (`sourceExtractions.json`) passe de 44 à 46 clés. Vérification : `node scripts/check-release.cjs` réussit TypeScript, ESLint, la frontière réseau et la taille des sources (1243 fichiers ≤ 400 lignes). Il exécute **2991 tests : 2990 réussis, 0 échec, 1 ignoré** (politique Ruby, qui exige macOS).
- **Limites :** tests JavaScript uniquement. Aucun essai sur appareil Android ou iOS : rendu des repères, bulles natives (`onCalloutPress`), lisibilité de l'en-tête sur petits écrans et coût de rendu restent à valider en dev build. Pistes différées : deux suggestions dans le panneau passager (une seule conservée, comme le verrouille un test existant) et des repères dédiés plutôt que les bulles natives.

## 2026-10-29 — Correctif backend autorisé : crédit de recharge FlexPay et reprise

- **Périmètre/problème :** suite au diagnostic ci-dessous et à l'autorisation de modifier le dépôt voisin sans déployer, le chemin générique FlexPay est corrigé pour déclencher le crédit du portefeuille après un succès vérifié. Le signalement d'un solde affiché inchangé reste distinct d'une preuve comptable sur la transaction de production, non consultée.
- **Solution effectivement appliquée :** `../zwanga-backend/src/payments/payments.service.ts` attend désormais le gestionnaire idempotent de recharge après le callback générique. Le crédit est hors du bloc d'interception des erreurs prestataire : un échec du portefeuille remonte sans effacer le succès enregistré et peut être repris par une vérification de statut, un nouveau callback ou le traitement différé existant. Une lecture générique de statut confirme aussi le crédit d'une recharge réussie. Preuve complète et appartenance obligatoires ; aucun nouveau débit, aucune modification des quantités de jetons, tarifs, bonus, commissions, cash ou autres prestataires. Les réponses API et les routes mobiles restent compatibles. Aucun changement de schéma ni migration.
- **Fichiers/tests :** nouveau `../zwanga-backend/src/payments/flexpay-topup-settlement.spec.ts` (26 cas), adaptation de deux fixtures dans `payments.service.spec.ts`, détails dans le [journal backend](../../zwanga-backend/docs/CHANGEMENTS_TECHNIQUES.md). Six tests échouaient avant le correctif sur le raccordement manquant. La campagne finale paiements/portefeuille hors PostgreSQL donne **466 tests réussis, 30 suites**. TypeScript backend de production, ESLint du nouveau fichier de tests et contrôle de différences réussissent. Côté mobile, **45 tests ciblés réussissent** (`arrivalTokenComplementFlow`, `arrivalPaymentVerification`, `arrivalPaymentRecoveryUX`, `tokenCashFallback`, `topUpIntent`) ; les corrections mobiles précédentes sont conservées, aucun nouveau code mobile modifié dans cette étape.
- **Précautions/limites :** doublons et chevauchements callback/vérification/reprise, erreur puis reprise du crédit, quantité historique, timeout et preuves invalides testés avec les vrais services/contrôleurs et des dépôts, transactions et prestataire simulés. Les transactions simulées ne prouvent pas le verrouillage PostgreSQL. Aucun paiement réel, accès à une base existante, modification de production, déploiement ou test physique Android/iOS ; lint global backend et compilation native non exécutés. Ce correctif traite un défaut reproduit mais ne certifie pas encore la cause ni la régularisation du paiement signalé. Modifications concurrentes hors paiement préservées.

## 2026-10-29 — Diagnostic du complément Mobile Money sans hausse du solde affiché

- **Signalement/périmètre :** le passager indique que le solde affiché n'a pas augmenté après sa validation Mobile Money. Cela justifie de vérifier le crédit serveur en plus de la reprise mobile ; un solde affiché inchangé ne prouve toutefois pas à lui seul l'absence d'une écriture comptable. Lecture des services et contrôleurs `payments`/`wallet` du dépôt voisin, de la preuve FlexPay, du registre de règlement et du traitement différé, ainsi que des endpoints mobiles de vérification. Aucune transaction réelle, configuration secrète ou base de données consultée.
- **Comportement reproduit :** le callback générique `POST /payments/flexpay/callback` peut enregistrer un succès confirmé par une vérification prestataire sans appeler le gestionnaire qui crédite le portefeuille. Une lecture générique du statut terminal ne l'appelle pas non plus. Le traitement différé `reconcilePayment` appelle bien ce gestionnaire. Les routes spécifiques `POST /wallet/topups/flexpay/callback`, `GET /wallet/topups/:orderNumber/status` et la récupération de recharge appellent aussi `applyTopUpPayment` ; le mobile utilise ces routes spécifiques. Le décalage du callback générique ne suffit donc pas à expliquer, à lui seul, l'échec de vérification de la transaction signalée.
- **Précautions conservées :** un simple succès annoncé par callback ne remplace pas la preuve obtenue auprès du prestataire. Les contrôles d'appartenance, référence, commande prestataire, montant et devise restent inchangés, ainsi que l'idempotence du crédit. Le test de preuve incomplète confirme que ce cas reste en attente et non crédité. Aucun crédit manuel, nouveau débit, modification SQL, relecture d'une transaction de production ni assouplissement de validation.
- **Vérifications réalisées :** quatre suites backend existantes (`wallet-topup-proof.spec.ts`, `wallet-topup-decline.spec.ts`, `wallet.service.spec.ts`, `payment-reconciliation.spec.ts`) donnent **88 tests réussis**. Un banc de caractérisation local `.expo/flexpay-credit-audit.spec.ts`, lancé par `.expo/run-flexpay-credit-audit.cjs`, ajoute **4 tests réussis** sur les véritables méthodes de `PaymentsService` et `PaymentSettlementRegistry`, avec dépôt, prestataire et gestionnaire de crédit simulés. Le premier lancement du banc a échoué avant exécution des tests, à cause du mélange des versions Jest mobile/backend ; la résolution explicite des modules Jest du backend a corrigé le banc. Ce ne sont ni des tests de paiement réel, ni des essais mobiles natifs, ni des mesures de production.
- **Solutions appliquées/limites :** dans cette étape, seul ce compte rendu et les artefacts locaux de diagnostic sont ajoutés ; aucun correctif backend n'est appliqué. Une autorisation est demandée pour préparer le raccordement du callback générique au règlement idempotent avec ses tests, sans déploiement. La cause exacte du paiement signalé nécessite encore de rapprocher la réponse de vérification FlexPay, le statut enregistré, l'écriture de recharge et l'éventuelle erreur du traitement différé. Les correctifs mobiles décrits ci-dessous et les modifications parallèles hors paiement sont conservés.

## 2026-10-29 — Complément jetons + Mobile Money : vérification et reçu du trajet

- **Signalement et constats :** un complément Mobile Money est déclaré validé chez FlexPay, mais le mobile reste sur « Paiement non confirmé » et le bouton de vérification semble sans effet. Un test reproduit le masquage des messages de vérification par `cashFallback.canSwitch` dans `PassengerArrivalPaymentCoordinator`. La même branche masquait l'activité d'une lecture en cours : un bouton paraissait disponible alors que le contrôleur ignorait le second clic. Autres cas constatés dans les sources : une lecture en pause ne reprenait pas au retour au premier plan ; après une réponse de règlement perdue, le backend peut refuser une nouvelle modification d'un paiement déjà confirmé, sans que le mobile relise alors la réservation. La transaction de production n'a pas été consultée : ces défauts vérifiés ne constituent pas une preuve du chemin exact suivi par ce paiement.
- **Vérification/reprise appliquée :** `useArrivalPaymentMonitoring.ts` relit la référence d'origine au retour dans l'application après une pause réseau/opérateur. Les relectures restent séquentielles, espacées de 12 secondes et bornées à une fenêtre de deux minutes ; aucune lecture en arrière-plan. Une confirmation de recharge est conservée dans `walletTopUpConfirmedAt` par les chemins de soumission, récupération et surveillance (`paymentTypes.ts`, `useArrivalPaymentSubmission.ts`, `useArrivalPaymentRecovery.ts`, `useArrivalPaymentMonitoring.ts`, `useArrivalPaymentState.ts`). Ce marqueur sert à l'affichage et à ne pas relancer automatiquement un règlement échoué lors d'un simple retour au premier plan ; il n'autorise aucun débit et ne prouve pas le paiement du trajet. Les références et protections d'idempotence existantes sont conservées.
- **Règlement déjà effectué :** dans `useArrivalPaymentProvider.ts`, après une erreur de règlement en jetons, une lecture authentifiée de la réservation d'origine vérifie si le serveur a néanmoins confirmé le paiement. Le reçu est présenté uniquement pour cette réservation avec paiement réussi ou montant explicitement nul ; une réservation différente, un montant absent ou un simple choix cash non encaissé ne sont pas des succès. Le hook `useLazyGetBookingByIdQuery` est exporté depuis `bookingApi.ts`. `readPaymentResult.ts` borne à 25 secondes l'attente des lectures de récupération et de rapprochement, libère l'abonnement et ignore les résultats tardifs sans annuler une mutation financière ni une requête partagée. Les verrous de règlement par réservation, de double clic et de session restent actifs.
- **UX appliquée :** `ArrivalPaymentRecovery.tsx` et `PassengerArrivalPaymentCoordinator.tsx` affichent les messages même lorsque le cash est disponible, et montrent la vérification en cours. Tant que le résultat reste à vérifier, l'action principale est « Vérifier mon paiement », puis « Finaliser le paiement du trajet » si le complément est confirmé. Le titre « Complément reçu » distingue la recharge du règlement final. Les espèces restent un choix secondaire explicite, soumis aux options et à la confirmation serveur existantes ; l'écran ne demande plus par défaut de repayer en espèces après validation Mobile Money. La fermeture reste disponible. Aucun nouveau modal ni changement de montant, de calcul de jetons, de bonus ou de commission.
- **Vérifications réalisées :** le test de non-masquage a d'abord échoué sur le code initial, puis réussi après correction. Suite dédiée de 152 tests JavaScript : 152 réussis, 0 échec. Elle inclut `arrivalTokenComplementFlow.test.js`, les suites `arrivalPayment*`, `tokenCashFallback`, `mixedCashPayment`, `topUpIntent`, stockage/retenue des paiements, portefeuille, paiement proche de l'arrivée et notifications de paiement conducteur. Les scénarios assemblent les vrais hooks de surveillance, règlement et reçu avec HTTP/stockage/natif simulés : complément confirmé, réponse de règlement perdue (400/409/timeout), véritable règlement encore non confirmé, vérification manuelle, sortie/retour, timeout et réponse tardive, déconnexion, incohérences de réponse, cash et doubles clics. TypeScript, ESLint ciblé, frontières réseau, contrôle de taille (1 243 sources, aucune au-dessus de 400 lignes) et `git diff --check` réussissent. Une propriété d'état non exportée a été détectée par TypeScript pendant l'implémentation, corrigée, puis le contrôle complet TypeScript a réussi.
- **Limites et comportements conservés :** aucune nouvelle recharge depuis « Vérifier », aucune simulation présentée comme une transaction réelle. Backend lu pour comprendre les contrats mais non modifié ; aucune base, transaction de production, configuration native ou variable d'environnement touchée, aucun déploiement. Pas d'essai physique Android/iOS ni de paiement réel FlexPay dans cette intervention. La réception du callback, le crédit du portefeuille et le règlement de la réservation signalée doivent encore être rapprochés dans les journaux serveur. Les changements parallèles de l'accueil/recherche et ceux des alertes iOS ont été préservés ; la suite globale du projet n'a pas été relancée ici.

## 2026-10-29 — Reprise des alertes conducteur iOS sans carte de notification

- **Périmètre/problème :** le conducteur signale un son présent sur l'écran verrouillé, coupé après déverrouillage, sans carte retrouvée. Le diagnostic précédent a caractérisé l'absence de reprise dans Zwanga lorsque ni la carte système ni un événement de clic ne sont disponibles. La cause native exacte de disparition de la carte du build 164 reste inconnue ; ce correctif traite la récupération à l'ouverture de l'application.
- **Solution appliquée :** `components/NotificationHandler.tsx` monte `hooks/notifications/useIosRideAlertRecovery.ts`. Pour un conducteur connecté sur iOS, au premier plan et en ligne, ce hook passe par `services/driverAlertRecovery.ts` et `store/api/driverAlertRecoveryApi.ts`. L'opération lit les 25 dernières notifications du compte puis vérifie au maximum trois invitations par des GET authentifiés existants. Une réservation doit toujours être en attente sur le trajet du conducteur ; une offre séquentielle doit être encore actionnable pour ce destinataire ; une demande classique doit rester disponible et accessible via son endpoint métier. Aucun changement backend, migration, envoi push ou déploiement.
- **Validité et cohérence :** `features/notifications/driverAlertRecovery.ts` reconstruit les champs du protocole absents des lignes de boîte de réception, avec la fenêtre d'origine `createdAt + 60 s`, raccourcie par les échéances existantes. L'ouverture ne redonne jamais une minute à l'offre. Les réponses passager, autres types de notifications, demandes de l'auteur, autres comptes, objets malformés et invitations trop anciennes sont exclus. Le statut « lu » n'est pas confondu avec une acceptation/refus. La validation d'une offre de 40 secondes se fait sur l'offre elle-même, même si sa demande reste visible dans l'application.
- **Lecteur et décisions conservés :** les alertes récupérées rejoignent `rideAlertSession`, donc le lecteur, la synthèse vocale et le coordinateur d'entrée existants, sans lecteur concurrent ni redirection supplémentaire. Dans `services/driverNotifications.ts`, une décision mémorise désormais aussi la clé d'une alerte pas encore chargée : une réponse REST tardive ne peut pas la faire sonner après acceptation/refus. Android ne lance pas cette récupération ; les transports, ressources audio, notifications natives et réponses passager ne sont pas modifiés.
- **Performance et annulation :** aucune attente ajoutée au loader d'accueil, aucune boucle de polling permanent. Au maximum deux tentatives par activation en cas d'erreur, avec départs espacés d'au moins 10 secondes. Une tentative lance au plus quatre lectures métier GET (hors renouvellement de session et reprise d'authentification), avec délais réseau de 3,5 secondes par lecture, vérifications de détails parallèles et attente de résultat bornée à 8 secondes après le chargement des modules, lui-même borné à 3 secondes. Le passage en arrière-plan, la perte de réseau, le démontage et le changement de session empêchent les résultats tardifs d'agir. Le cycle RTK utilisé est privé, ne fait que des GET et réinitialise ses données ; son annulation n'interrompt pas les requêtes partagées par les écrans.
- **Vérifications réalisées :** 26 tests ciblés réussis (`driverAlertRecovery`, `iosRideAlertRecovery`, `iosRingingWake`) et 42 tests de régression réussis (`driverNotifications`, `notificationHandlerRefresh`, `requestAcceptanceSound`), soit 68 cas distincts. Les tests utilisent les modules réels et RTK installé, avec HTTP, événements iOS et lecteur natif simulés : ils ne prouvent pas une sonnerie audible sur iPhone. TypeScript a réussi une première fois ; ESLint ciblé, frontières réseau et contrôle de taille ont réussi. Le contrôle global suivant a été interrompu par une erreur TypeScript dans `components/home/HomeHeader.tsx`, modifié en parallèle hors de ce correctif ; ce fichier a été préservé. La suite JavaScript complète, exécutée séparément, compte 2 975 tests : 2 965 réussis, 9 échoués, 1 ignoré. Les neuf échecs concernent l'accueil/recherche modifiés en parallèle (styles/structure des actions, fixture de carte et empreinte de styles), pas les tests de sonnerie. Journal local : `.expo/ios-recovery-regression-20261029.log`. Ces résultats ne constituent pas une validation globale du projet ; aucun de ces changements parallèles n'a été annulé ni corrigé dans cette intervention.
- **Limites/recette restante :** récupération bornée aux dernières notifications et à trois candidats par tentative, connexion et profil conducteur requis ; pas de reprise des offres déjà expirées pendant le déverrouillage. Les tests physiques sur iPhone restent nécessaires avec une nouvelle version contenant ces sources : carte présente/absente, ouverture directe de Zwanga, clic sur la carte, refus/acceptation, expiration, réseau indisponible, mode silencieux et Concentration. Aucun maintien permanent de l'écran ou de la bannière hors application n'est promis ; les réglages et restrictions iOS restent respectés.

## 2026-10-29 — Échec Gradle EAS : archive source Hermes renommée en `meta-hermes`

- **Constat/périmètre :** le build EAS Android de production échouait dans `gradlew :app:bundleRelease`, sur la tâche `hermes-engine:configureBuildForHermes`, avec `CMake Error: The source directory ".../node_modules/react-native/sdks/hermes" does not appear to contain CMakeLists.txt`. Les builds release compilent React Native et Hermes depuis les sources, via le bloc `ZWANGA_PATCHED_REACT_ANDROID` de `android/settings.gradle` (en place depuis le 2026-09-23).
- **Cause (vérifiée) :** l'URL `https://github.com/facebook/hermes/tarball/<version>` redirige désormais vers `meta/hermes`. L'archive téléchargée contient donc un dossier racine `meta-hermes-e0fc671/` au lieu de `facebook-hermes-…`. La tâche `unzipHermes` de React Native 0.81.5 ne retire que le préfixe `facebook-hermes-`. Les sources se retrouvaient dans `sdks/hermes/meta-hermes-e0fc671/`, sans `CMakeLists.txt` à la racine. Le contenu de l'archive a été vérifié par téléchargement. Ce n'est pas une régression du code Zwanga.
- **Solution appliquée :** un nouveau script idempotent, `scripts/patch-react-native-hermes-tarball.cjs`, ajoute le préfixe `meta-hermes-` à la condition d'aplatissement dans `node_modules/react-native/ReactAndroid/hermes-engine/build.gradle.kts`. Il est ajouté en fin de `postinstall` dans `package.json`. Il échoue explicitement si le code amont change, comme les autres patchs. Les scripts, la configuration Gradle et le code applicatif existants ne sont pas modifiés. Le préfixe `facebook-hermes-` reste accepté.
- **Vérifications/limites :** le patch s'applique et sa réapplication ne change rien. Le nouveau `tests/hermesTarballPatch.test.js` passe (2 tests). `scripts/check-release.cjs` complet en local donne 2 954 tests, 0 échec, 1 ignoré (Ruby absent). Tout cela est vérifié en JavaScript uniquement : la compilation CMake/Gradle de Hermes n'a pas été exécutée localement (Windows), et le build EAS doit être relancé pour confirmer.

## 2026-10-29 — Échec du build EAS : instantané d'endpoints OTP obsolète

- **Constat/périmètre :** `eas-build-post-install` (`scripts/check-release.cjs`) échouait sur un seul test : `tests/sourceExtractions.test.js`, sur l'empreinte de `store/api/userApi.ts` (2 951 réussis, 1 échec). Les empreintes de `sendPhoneVerificationOtp` et `verifyPhoneOtp` ne correspondaient plus à `tests/fixtures/sourceExtractions.json`. L'échec est reproduit localement avec les mêmes valeurs.
- **Cause :** il ne s'agit pas d'une régression. Le commit `80777c1` a volontairement modifié ces deux endpoints dans `store/api/user/getProfileSummary.endpoints.ts`. Les types de réponse ont gagné `codeLength`, `expiresInSeconds` et `verificationToken`, et un `console.log` a été supprimé. L'instantané de référence n'avait pas été mis à jour.
- **Solution appliquée :** seules les deux empreintes concernées sont mises à jour dans `tests/fixtures/sourceExtractions.json`. Aucun code applicatif, aucun test et aucune autre empreinte n'est modifié.
- **Vérifications/limites :** `node --test tests/sourceExtractions.test.js` donne 7 tests réussis sur 7 (tests JavaScript uniquement). Le comportement de ces endpoints reste couvert par `signupPhoneProof.test.js` et `otpDelivery.test.js`, qui passaient déjà dans le build. Le build EAS complet n'a pas été relancé dans cette intervention.

## 2026-10-29 — Test local du SMS OTP Mobishastra à l'inscription

- **Constat/périmètre :** le backend sait générer et valider un code SMS de cinq chiffres via Redis, mais le mobile désactivait cette étape et ignorait la preuve temporaire renvoyée. Les textes évoquaient encore WhatsApp/Didit alors que l'inscription et le PIN oublié passent par SMS.
- **Solution appliquée :** le drapeau local existant permet d'afficher l'OTP d'inscription. Les endpoints existants restent inchangés. Les hooks d'inscription téléphone/Google/Apple transmettent maintenant la preuve sous `phoneVerificationToken`. `features/auth/signupPhoneProof.ts` et `hooks/auth/useSignupPhoneProof.ts` la conservent uniquement en mémoire, avec son numéro et son échéance serveur, puis l'effacent à l'envoi de l'inscription. Elle est invalidée au changement d'identité, renvoi, annulation et démontage. Les réponses tardives et doubles validations sont écartées. Les mutations OTP sont réinitialisées après lecture; aucun résultat OTP n'est ajouté aux brouillons persistants. Une preuve absente/expirée/rejetée ramène à la saisie du numéro en conservant les champs du profil.
- **UI/contrats :** textes courts « Code par SMS », icône de message, sans refonte du style. Le renvoi et la validation se désactivent mutuellement. Le téléphone n'est jamais considéré validé sur le seul HTTP 200. Les réponses Keccel anciennes sans preuve conservent le parcours facultatif; elles ne fabriquent pas de preuve Mobishastra. Le reset du PIN garde six chiffres et ses endpoints Keccel. Les paramètres des builds stores, le KYC, les finances et les changements préexistants sur les demandes de trajets ne sont pas modifiés.
- **Fichiers :** hooks `useAuthController`, `usePhoneAuthActions`, `useSocialAuthActions`, `useSocialPhoneVerification`, `useRegistrationActions`; contrats `authApi` et `getProfileSummary.endpoints`; `otpDelivery`, `OtpDeliveryNotice`, `SmsStep`, `GoogleOtpStep`; tests OTP et inscription associés. Aucune clé Mobishastra/HMAC n'est copiée vers le mobile.
- **Recette locale :** utiliser le dev build Android existant sur l'émulateur. Après changement de configuration locale, arrêter puis relancer Metro avec `npx expo start --dev-client --clear`. Démarrer/recharger le backend local séparément. Dans « Créer un compte », saisir un vrai numéro de test contrôlé et non associé à un compte actif, demander un code, lire le SMS sur le téléphone réel puis saisir ses cinq chiffres dans l'émulateur. Terminer le profil avant l'échéance. L'émulateur ne reçoit pas automatiquement le SMS adressé à une SIM réelle. Chaque appui d'envoi peut être facturé; aucun SMS n'a été demandé automatiquement dans cette intervention.
- **Vérifications/limites :** tests JavaScript sur la preuve (consommation, durée, numéro, erreurs, concurrence, réponses tardives, transmission téléphone/Google/Apple, absence de persistance) et régressions d'authentification. TypeScript, ESLint ciblé et contrôles réseau/taille sont exécutés séparément. La disponibilité locale du backend et de Metro est vérifiée en lecture seule. Pas de preuve de livraison opérateur, de parcours complet avec SMS réel ou d'essai physique iOS à ce stade; aucun déploiement AWS/stores.

## 2026-10-29 — Diagnostic iOS : notification visible sans son et relecture du tri des conducteurs

- **Signalement initial puis précision :** sur iOS 1.0.18 (164), le premier retour évoquait une notification visible sans son. L'utilisateur a ensuite confirmé que le son fonctionne téléphone verrouillé, puis s'arrête au déverrouillage, avec disparition de la carte également rapportée dans le Centre de notifications, sur l'accueil de l'iPhone comme après ouverture de Zwanga. Ce dernier constat oriente le diagnostic vers la transition système/application, et non vers une absence systématique de son dans le push. Le binaire 164, son profil EAS effectif, tous les réglages de présentation et le push réellement reçu n'ont pas été inspectés : les conclusions ci-dessous portent sur les sources locales, pas sur une preuve de la cause en production.
- **Fichier sonore vérifié :** `assets/sounds/driver_ring.wav`, PCM linéaire 16 bits mono à 22 050 Hz, durée mesurée 29 secondes, amplitude non nulle. Référence présente dans les ressources Xcode et le plugin Expo Notifications. Cela respecte les contraintes de format/durée documentées par [Apple](https://developer.apple.com/documentation/usernotifications/unnotificationsound), mais ne prouve ni l'inclusion dans le binaire distribué ni son audibilité physique.
- **Transport :** le chemin Expo demande ce son pour les invitations conducteur ; le chemin Firebase iOS v5 le demande également dans `aps.sound`. Le contrôle isolé du vrai `NotificationService` reproduit toutefois, pour réservation, offre conducteur et demande proche, un repli FCM sans capacité enregistrée qui contient une carte mais aucun `aps.sound`. Ce cas peut concerner un client iOS Firebase dont l'enregistrement interactif n'est pas encore réussi ; il ne démontre pas que le build signalé est dans cet état. L'absence d'activation Firebase iOS ne suffit pas à expliquer une panne : le chemin Expo reste prévu pour les notifications sonores. Au premier plan, `components/NotificationHandler.tsx` supprime volontairement le son système des alertes prises en charge par le lecteur local ; cette reprise dépend donc de son initialisation et de la politique audio iOS.
- **Tests exécutés :** 39 tests mobiles ciblés réussis (inscription push, permissions, transport iOS, reprise après déverrouillage), 64 tests serveur de contrats/compatibilité réussis, puis 9 vérifications isolées supplémentaires avec fournisseurs simulés. Ces dernières constatent aussi l'absence de son dans le repli FCM : leur réussite ne signifie pas que ce défaut est corrigé. Le premier lancement du banc supplémentaire a échoué avant tout test à cause d'un mélange des dépendances Jest des deux dépôts ; sa résolution a été limitée au banc, puis les 9 cas ont été exécutés. Scripts locaux : `.expo/run-ios-transport-audit.cjs` et `.expo/ios-transport-audit.spec.ts`. Aucun correctif fonctionnel, nouvel envoi push, déploiement ou essai iPhone dans ce diagnostic.
- **Complément déverrouillage :** dans les sources actuelles, `useRideRinging.ts` restaure les notifications présentées par iOS et `useDriverNotifications.ts`/`pendingDriverOpen.ts` conservent les événements de clic reçus. L'ouverture d'une fiche conducteur n'acquitte pas à elle seule une invitation. Aucun retrait global de toutes les notifications au simple déverrouillage n'a été trouvé dans les chemins applicatifs inspectés ; les suppressions explicites ciblent notamment une décision, une offre résolue/expirée ou une réponse passager ouverte. Une carte absente et un événement de clic absent laissent cependant une nouvelle alerte inconnue du lecteur local, sans récupération REST de cette alerte dans le mécanisme de sonnerie. La resynchronisation du cache au retour du socket ne recrée pas à elle seule cette session audio.
- **Vérification complémentaire et limites :** `.expo/audit-ios-unlock-20261029.cjs` réutilise les six tests de reprise existants et ajoute deux scénarios diagnostiques, soit 8 tests JavaScript réussis. Ils constatent l'absence de lecteur lorsque Zwanga reste en arrière-plan sur l'accueil iOS, et l'absence de reprise lors de son ouverture sans carte ni événement de clic. L'absence de carte est injectée dans le test : sa disparition sur l'appareil n'est pas reproduite ni expliquée par ce banc. Les tests de reprise réussissent quand la carte ou l'événement de clic est fourni. Aucun correctif fonctionnel appliqué ; piste différée : récupération bornée des alertes serveur encore valides à l'entrée, en conservant destinataire, décisions et échéances, sans recréer d'anciennes sonneries. La durée de réveil et les bannières hors application restent contrôlées par iOS et ses réglages, sans garantie de maintien permanent. Voir les [réglages Apple de présentation des notifications](https://support.apple.com/en-ph/guide/iphone/iph7c3d96bab/ios).
- **Échange fourni par l'utilisateur :** le tri de positions récentes avant les anciennes est bien présent dans les fichiers backend `driver-location-policy.ts` et `sequential-candidates.ts` ; les 5 tests de `sequential-candidates.spec.ts` ont été relancés avec succès. Deux limites à la formulation de l'échange : les trajets en cours reçoivent `stalePosition = false` sans contrôle de l'âge de la position retenue ; une nouvelle position ne réordonne pas immédiatement une file Redis existante, conservée jusqu'à reconstruction/expiration. Les 90 tests PostgreSQL cités dans cet échange sont des résultats rapportés, non une nouvelle exécution dans cette relecture.
- **Acquittements :** `NativeRideDelivery.java` conserve les événements localement, transmis ensuite par `services/rideNotificationReceipt.ts`, notamment lors de `usePushRegistration`. Un rapport absent ou tardif ne prouve donc pas que le téléphone n'a pas sonné. `displayedAt` serveur mesure la réception du rapport et non nécessairement l'instant d'affichage physique. Aucun relais anticipé, élargissement de rayon ou suppression de protocole n'a été appliqué.

## 2026-10-29 — Complément de recette dans le dev build et backend local

- **Périmètre :** suite de l'audit après remise en route du backend local sur le port 5200. Connexion réelle du compte conducteur de test désigné, vérification du rattachement du jeton à l'émulateur, création par HTTP de deux demandes fictives adressées exclusivement à ce conducteur. Contrairement à la première campagne isolée ci-dessous, ces essais utilisent la base locale de recette existante et le dev build ; aucune base de production n'est modifiée. Les diagnostics SQL restent bornés et en lecture seule, selon le skill PostgreSQL ; les changements métier passent par les API.
- **Résultats constatés :** refus depuis la fiche confirmé côté serveur, puis acceptation de la seconde demande depuis l'interface, création du trajet attribué et affichage « Course confirmée ». Le passager fictif n'avait pas de terminal push : l'échec de sa notification ne permet pas de conclure sur un téléphone passager. Une carte de notification a été observée dans le volet Android, sans mesure exploitable du délai de livraison de bout en bout.
- **Anomalie confirmée en interface :** après acceptation, le backend local est devenu injoignable, également depuis le poste sur son endpoint de santé. La mutation était réussie mais les lectures de demande/trajet ont échoué avec `FETCH_ERROR`. La fiche conducteur a alors remplacé la course confirmée par un écran d'erreur avec « Réessayer », sans lien vers le trajet attribué : confirmation en dev build du problème P2 précédemment reproduit en JavaScript. Capture locale : `.expo/audit-connected-confirmed-request-network-error-20261029.png`. La cause de l'arrêt du backend n'est pas établie ; aucun crash natif Zwanga n'est démontré par ce constat.
- **Limites/nettoyage restant :** démarrage/navigation, paiement et fin du parcours dans la vraie interface non terminés. La relance du serveur a été demandée ; il restait indisponible lors de la dernière vérification. La première demande a été annulée ; la seconde a un trajet attribué. Les deux comptes passagers fictifs et le trajet de recette restent à nettoyer via le backend local. Aucun compte préexistant supprimé, aucun paiement réel effectué. Les interruptions de l'émulateur et changements concurrents du projet ne permettent pas d'en déduire des mesures de performance reproductibles. Aucun correctif fonctionnel ni déploiement dans cette suite de recette ; modifications préexistantes conservées.

## 2026-10-29 — Audit final local : performance, fiabilité, stabilité et parcours intégrés

- **Périmètre et intervention :** audit du mobile courant, des parcours locaux du dépôt voisin `zwanga-backend` et des sources Android d'alerte. Les modifications déjà présentes dans les deux dépôts ont été conservées. Aucun correctif fonctionnel appliqué dans cette campagne, aucun déploiement, aucune base existante modifiée, aucun paiement ou push envoyé à un utilisateur. Les nouveaux artefacts de diagnostic sont sous `.expo/audit-final-*` ; seul ce compte rendu est ajouté aux sources suivies. Les essais de base utilisent PostgreSQL/PostGIS et Redis jetables avec des données fictives, sans charger les secrets applicatifs. Le skill PostgreSQL a guidé les contrôles de concurrence, de rollback et de plans SQL réels, plutôt qu'une conclusion tirée uniquement des tests simulés.

### Anomalie reproduite, correction à préparer

- **P2 — Accès au trajet conducteur masqué après une erreur de rafraîchissement.** Dans `app/request/[id].tsx`, le bloc d'erreur remplace la fiche même si une attribution confirmée et son `tripId` existent en cache. Son bouton « Voir mon trajet » est réservé à `passengerTripId` : le conducteur n'en bénéficie pas. Après une acceptation avec maintien sur la fiche, `hooks/request-detail/useRequestDriverActions.ts` lance justement une nouvelle lecture. Si celle-ci échoue, le conducteur peut devoir revenir à l'accueil pour retrouver un trajet déjà confirmé. L'acceptation serveur n'est pas annulée et ce constat ne démontre ni perte de réservation ni double paiement.
- **Preuve :** `.expo/audit-final-request-offline.cjs` charge le vrai composant avec un contrôleur simulant une attribution confirmée, puis `FETCH_ERROR` ou HTTP 503. Les deux cas affichent l'erreur sans lien conducteur ; le cas témoin passager garde son lien. Résultat dans `.expo/audit-final-request-offline-20261029.log`. Il s'agit d'une reproduction JavaScript ciblée, pas d'une panne réseau provoquée sur téléphone. **Piste non appliquée :** préserver un accès à l'attribution confirmée pour les erreurs transitoires, sans relâcher les gardes de compte, d'autorisation, de suppression ou de mutation serveur.

### Vérifications exécutées

| Campagne | Résultat constaté | Nature et couverture |
| --- | --- | --- |
| `scripts/check-release.cjs` | **2 931 tests réussis, 0 échec, 1 ignoré** | TypeScript mobile, lint global, frontières réseau, compatibilité URI/Metro, parité des sources natives, 1 233 sources sous la limite de taille, puis régressions JavaScript. Le test ignoré exige Ruby, absent ici. Phase de tests : environ 478 s. |
| Demandes, réservations et relais | **82 tests réussis** | `sequential-dispatch.postgres.spec.ts` et `shared-trip-postgres.spec.ts` sur PostgreSQL/PostGIS et Redis réels jetables ; endpoints HTTP, écriture des réservations/places, refus, concurrence, expiration, partage/consentement, annulation, reprise Redis et rollback. Le benchmark optionnel initialement ignoré est exécuté séparément ci-dessous. |
| Charge de distribution | **1 benchmark réussi** | Trois instances de distribution, 120 demandes fictives en deux lots de 60, concurrence 1 puis 8, avec 211 000 notifications historiques fictives. Aucune invitation en double dans les assertions. Les 58 autres tests sont exclus par le filtre de cette relance, pas de nouveaux tests en échec. |
| Paiement et portefeuille | **74 tests réussis, 4 suites** | `scripts/audits/test-local-payment-paths.cjs` : paiement mixte, repli espèces, débits, concurrence, retours tardifs et rollback, avec cas PostgreSQL réels et tests unitaires du portefeuille. Prestataire financier simulé. |
| Paiement reçu par le conducteur | **151 tests réussis, 7 suites** | `scripts/audits/test-driver-payment-paths.cjs` : transactions réelles locales, émission Socket.IO, rattrapage HTTP/REST, déduplication, acquittement et absence d'annonce après rollback ; fonctions mobiles de décodage/annonce exercées. Autres cas unitaires inclus dans ce total. |
| Publication native Android | **17 scénarios réussis** | `scripts/audits/test-native-ride-delivery.cjs` : carte/prix/actions, doublon, auteur exclu, offre périmée, reprise différée, repli Notifee, écran verrouillé, accord local et permission système distincts, plein écran autorisé et application extérieure non interrompue lorsque le téléphone est actif. |
| Audio natif Android | **10 scénarios réussis** | `scripts/audits/test-ride-audio-service.cjs` : publication tardive, service audio, carte encore présente après 8 s, autre notification, interruptions audio transitoires, veille/déverrouillage, passage au lecteur de premier plan, décision et expiration. Une perte définitive de priorité audio coupe le lecteur conformément à sa politique, sans supprimer la carte en attente. |
| Gestes et actions Android | **21 scénarios réussis** | `scripts/audit-android-alerts.cjs --fixed --with-lock` : demande/réservation, application active ou extérieure, veille avec/sans plein écran, notifications refusées, toucher la carte ou Refuser/Accepter, actions sur le plein écran verrouillé. Les événements ouvrent le détail du banc de test et conservent le son selon les assertions. |

Le TypeScript backend de production (`tsc --noEmit --incremental false -p tsconfig.build.json`) passe également, ainsi que `git diff --check`. Le lint global backend n'a pas été relancé dans cette campagne ; le journal précédent relève des problèmes historiques dans ce contrôle. Les suites serveur utilisent les vrais services/endpoints et des identités injectées de test ; elles ne valident pas la connexion JWT d'un compte réel. Les parcours croisés font passer les données par les fonctions mobiles réelles, mais la livraison FCM/APNs est remplacée par un transport de test. Les nombres de tests ne constituent donc pas autant de parcours utilisateur complets.

### Mesures locales de performance

- **Relais d'inaction :** premier relais observé à **40 865 ms**, suivant à **40 410 ms**, avec horloge et ordonnanceur réels. Création HTTP vers réception par le faux transport FCM : **375 ms puis 295 ms**. Ce ne sont pas des délais de réception sur téléphone.
- **Distribution concurrente :** 60/60 demandes réussies par lot. Latence de la file Redis jusqu'à l'invitation/outbox SQL durable : médiane **53 ms**, p95 **67 ms** en série ; médiane **91 ms**, p95 **685 ms**, maximum **1 012 ms** avec huit opérations concurrentes. Mesure bornée sur la machine locale, sans réseau fournisseur ni promesse de capacité AWS.
- **Historique SQL :** avec 211 000 notifications fictives, les trois plans d'expiration/annulation utilisent les index attendus ; exécutions `EXPLAIN ANALYZE` de **0,210 / 0,100 / 0,066 ms**. Parcours mesurés séparément : création **115 ms**, refus **1 196 ms**, expiration **42 ms**, annulation **10 ms**. Les temps applicatifs incluent davantage que la requête isolée.
- **Calcul d'itinéraire :** `scripts/benchmark-driver-route.cjs`, 8 000 points et 500 positions GPS synthétiques sous Node : version indexée **38 ms**, construction comprise, contre **3 551 ms** pour le calcul de référence exécuté dans le même banc. Un seul index construit, deux résultats retenus. Ce résultat ne mesure ni les images/seconde de la carte, ni la batterie, ni la chauffe d'un appareil.

### Limites de la validation et précautions natives

- Le banc Android séparé a été recompilé hors ligne depuis les sources natives actuelles et installé sur l'émulateur Android 16/API 36. Compilation Gradle réussie en **1 min 44 s**. Les gestes utilisent réellement SystemUI et les activités/services natifs du banc ; le bridge React et les événements d'arrivée sont simulés. Le rendu logiciel est limité au banc pour éviter les blocages graphiques connus de cet émulateur. Un premier lancement a rencontré un délai ADB dépassé ; après ouverture explicite du banc, la matrice complète a réussi. Ce timeout ne prouve pas un crash de Zwanga.
- Les scénarios Android ne remplacent pas la chaîne unique **push réel → dev build React Native → décision HTTP → navigation → paiement**. Le backend local habituel sur le port 5200 ne répondait pas, y compris à la revérification finale. Le dev build installé n'a donc pas permis de terminer ce parcours complet dans la vraie interface. La relance de ce backend de test a été demandée à l'utilisateur ; aucun backend susceptible d'utiliser des secrets de production n'a été démarré pour contourner ce blocage.
- Les permissions/états temporaires concernent uniquement le package de test ; aucun effacement de données ni changement d'autorisation du compte connecté dans Zwanga. Pas de test physique Samsung/iPhone, d'exécution iOS, de push FCM/APNs réel, de paiement opérateur ou de GPS en arrière-plan sur appareil physique dans cette campagne. Les assertions audio vérifient l'état du lecteur, pas une mesure acoustique. Le build complet de l'application n'a pas été recompilé. **Aucune certification d'absence de crash, de perte de notification, de chauffe ou de conformité production n'est déduite de ces essais.**
- **Conclusion :** les contrôles automatisés et intégrations isolées exécutés passent ; une anomalie de reprise réseau reste à corriger. La validation complète en interface mobile et sur appareils physiques demeure nécessaire avant de déclarer l'ensemble prêt pour la production.
- **Traces :** `.expo/audit-final-release-20261029.log`, `audit-final-relay-20261029.log`, `audit-final-dispatch-load-20261029.log`, `audit-final-payments-20261029.log`, `audit-final-payment-notices-20261029.log`, `audit-final-route-benchmark-20261029.log` et `audit-final-native-build-20261029.log` ; résultats natifs sous `.expo/audit-final-native-retry-20261029/native-matrix.json`, `.expo/audit-final-audio-20261029/results.json` et `.expo/audit-final-native-actions-20261029/`. Ces artefacts locaux ne sont pas destinés à être publiés et peuvent être nettoyés avec les autres fichiers `.expo`.

## 2026-10-29 — Choix du véhicule compact dans la demande à accepter

- **Périmètre/constat :** dans la fiche conducteur, la liste des véhicules s'ouvrait automatiquement tant qu'aucun véhicule n'était sélectionné. Placée avec les actions fixes, elle réduisait la zone de lecture au point de repousser la destination hors de l'écran.
- **Solution appliquée :** `features/request-detail/RequestDecisionVehiclePicker.tsx` affiche désormais une ligne « Choisir mon véhicule » accompagnée de « Pour accepter la demande ». Un toucher ouvre la liste ; un choix la replie immédiatement et affiche le modèle/la plaque avec « Changer ». « Fermer » permet aussi de replier sans sélectionner, sans perdre un choix précédent. Cible tactile d'au moins 48 points, indication d'ouverture et de désactivation pour les lecteurs d'écran, retour visuel à l'appui. Le skill frontend a guidé une sélection à la demande, des textes courts et le maintien de la carte comme repère visuel, sans nouvelle fenêtre modale ni animation de mise en page native.
- **Conservé/précautions :** les véhicules compatibles, leur identité complète, la sélection automatique uniquement lorsqu'il n'y en a qu'un, les contrôles d'identité/éligibilité, les blocages pendant l'acceptation et les actions Refuser/Accepter ne changent pas. Aucun choix arbitraire parmi plusieurs véhicules. Sans sélection valide, Accepter reste indisponible et le sélecteur explique l'étape requise. Le changement de demande/compte ne réutilise pas une liste ouverte. La liste n'est montée qu'à l'ouverture ; sa virtualisation et sa hauteur bornée à 144 points ou 20 % de la fenêtre restent en place. Aucun changement du backend, des alertes, de la carte, des montants, du GPS ou des appels réseau.
- **Tests :** `tests/requestDecisionLayout.test.js` couvre l'état initial replié, l'ouverture/fermeture sans choix, la sélection puis le changement, les véhicules retirés, les états bloqués, le changement de compte/demande et une flotte de 30 véhicules. **102 tests JavaScript ciblés réussis, aucun échec ni test ignoré**, incluant les cartes, adresses, options, contacts, refus, sonneries, disponibilité et délais de réponse. TypeScript sans émission, ESLint ciblé sans avertissement, frontière réseau, contrôle de taille (1 233 sources, aucune au-dessus de 400 lignes) et `git diff --check` validés. La suite globale de release n'a pas été relancée pour ce changement local d'interface.
- **Mesures visuelles/limites :** `scripts/preview-request-decision.cjs` ajoute les états d'une flotte de cinq véhicules repliée, ouverte et sélectionnée. Sept aperçus React Native Web avec données fictives et carte simulée passent les contrôles de dimensions : sur 390 × 844 px, pied de page de **160 px replié/sélectionné contre 310 px ouvert**, soit **150 px libérés**, carte maintenue à 295 px et destination visible initialement lorsque la liste est repliée. Sur 320 × 568 px, y compris à 150 % de texte, les boutons restent visibles, aucun débordement horizontal et la destination reste accessible par défilement ; le petit écran ne montre pas tous les détails simultanément. Aperçus replié, ouvert et grands caractères inspectés visuellement. Le premier navigateur isolé a expiré ; le contrôle a ensuite réussi en exécution locale autorisée avec profil temporaire. Ces rendus Web et tests de callbacks ne remplacent pas un essai natif Android/iOS : aucun appareil physique, compilation native ou déploiement dans cette tâche.

## 2026-10-29 — Demandes disponibles indépendantes de la sonnerie

- **Périmètre/constat :** correction mobile et dépôt voisin `zwanga-backend`, autorisée sans déploiement. Les listes serveur excluaient les demandes immédiates et exigeaient une invitation sonore active pour les demandes séquentielles. Le détail/acceptation répétait ces restrictions ; le mobile masquait aussi les actions immédiates. Un conducteur pouvait donc ne rien voir, ou ne plus pouvoir répondre après les 40 secondes d'attention, bien que la demande soit encore disponible.
- **Lecture appliquée — backend :** `src/trip-requests/request-pages.ts` et `trip-requests.service.ts` dissocient liste/détail et invitation. Les demandes immédiates et planifiées ouvertes sont consultables sans push reçu. Le ciblage d'un conducteur, les refus personnels, la propriété, les statuts/attributions et l'expiration métier restent contrôlés ; la pagination et ses bornes sont conservées. Le contact explicite du passager vérifie également ciblage/refus/éligibilité ; aucune coordonnée de contact n'est ajoutée aux listes. Seules les fenêtres de consentement passager ou de préparation d'acceptation sont exposées par le détail, pas le délai de sonnerie.
- **Acceptation appliquée — backend :** `dispatch/claim-in-app-request.ts`, `dispatch/request-acceptance.ts` et `trips/save-request-trip.ts` permettent la prise en charge depuis la liste avec le véhicule validé, sans invitation préalable ou après son expiration. Sous verrou de la demande, une préparation reçoit un jeton interne non fourni par HTTP ; une seconde préparation ou un consentement en cours reste bloquant. Les anciennes invitations de cette demande sont annulées et leurs notifications désactivées. La création du trajet puis la réservation conservent leurs contrôles, compensations et récupération existants. Le refus personnel est revérifié avant l'insertion finale. Le trigger INSERT historique borne toujours les invitations à 40 secondes ; une mise à jour sous le même verrou conserve les **120 secondes de préparation** existantes, indépendantes du son. `dispatch/dispatch.service.ts` ne présente pas cette préparation comme une nouvelle alerte actionable. Redis reste chargé du relais sonore, pas de l'autorisation de consulter la liste.
- **Migration préparée :** `src/database/migrations/1780000101000-SeparateRequestAttentionLease.ts`, enregistrée dans `migrations/index.ts`, sépare l'unicité d'une invitation d'attention de l'unicité d'une réponse en préparation/consentement par conducteur. Une invitation à une autre demande ne bloque donc plus à elle seule l'acceptation dans l'application. L'unicité d'une réservation séquentielle en préparation par demande reste inchangée. Migration transactionnelle avec budgets de verrouillage/exécution de 3/15 secondes ; le retour arrière échoue sans supprimer de données si des lignes actives ne satisfont plus l'ancien index. Le skill PostgreSQL a guidé les verrous courts, les index et l'absence d'appel réseau sous verrou.
- **Mobile appliqué :** `app/request/[id].tsx`, `hooks/request-detail/useRequestAvailability.ts` et `useRequestDriverActions.ts` ouvrent le même détail avec carte, véhicule et boutons « Refuser »/« Accepter » pour une demande immédiate disponible. `useRequestResponseWindow.ts` ne transforme plus une fenêtre d'attention `driver` en interdiction de répondre ; aucun timer à la seconde n'est installé pour cette seule fenêtre. Les consentements/confirmations, le KYC, les véhicules compatibles, le contrôle des droits, l'expiration réelle, l'anti-double-clic et les erreurs réseau restent gérés. Un refus confirmé masque uniquement la demande chez son auteur ; une attribution confirmée la rend inaccessible aux autres conducteurs. Les cartes déjà en cache se réconcilient au signal/rafraîchissement existant, sans promettre leur disparition instantanée hors ligne.
- **Non-régressions :** durée de sonnerie, séquence de relais de 40 secondes, notifications de réservation, sources/services natifs, GPS, filtres de la carte des véhicules et règles financières inchangés. Les offres alternatives et le partage gardent leur consentement passager et leurs gardes d'invitation existants. La nouvelle voie concerne l'acceptation directe et le refus depuis une demande ouverte ; elle ne permet pas d'accepter une ancienne carte d'alerte périmée comme si son invitation était encore valide.
- **Tests mobile :** **94 tests JavaScript ciblés réussis, aucun échec ni ignoré** ; ajout de `tests/requestInAppAvailability.test.js`, adaptations de `requestResponseWindow.test.js` et `requestDecisionLayout.test.js`. Couverture du détail immédiat, de l'éligibilité, du délai sonore non bloquant, des refus/caches, des lectures hors ligne, du contact, des options et de la carte. TypeScript mobile, lint ciblé, frontière réseau et taille des sources validés (1 233 sources contrôlées, aucune au-dessus de 400 lignes). Trace : `.expo/available-request-mobile-20261029.log`.
- **Tests backend :** **76 tests ciblés réussis** (disponibilité, pagination, contact, service de demandes et verrouillage de création). Suite réelle sur PostgreSQL/PostGIS et Redis jetables locaux : **57 réussis, 1 benchmark de charge optionnel non exécuté** ; ajout de `test/available-request-flow.ts`, intégration dans `dispatch/sequential-dispatch.postgres.spec.ts`, adaptation de `test/sequential-mobile-flow.ts`. Relances ciblées : **10 réussis**, dont les scénarios ajoutés de séparation attention/préparation et rollback, puis **3 réussis** après typage/formatage final du nouveau test ; les autres tests sont exclus par les filtres de ces relances, et leurs résultats ne s'ajoutent pas au total précédent. La réservation et les sièges sont réellement écrits dans la base jetable ; double prise en charge, refus sans livraison, acceptation après relais vers un autre conducteur, ciblage et expiration sont vérifiés. Les parcours HTTP/mobile utilisent les vrais endpoints/actions JS et un fournisseur push simulé : relais observés à **40 948 ms puis 41 129 ms**, mesures locales et non garanties de livraison sur téléphone. TypeScript backend de production validé. Le lint des nouveaux fichiers de production et du nouveau test est validé ; le lint élargi des fichiers historiques reste non vert (formatage et typage non sûr existants), sans reformattage massif hors périmètre. Traces : `.expo/available-request-unit-20261029.log`, `.expo/available-request-postgres-20261029.log`, `.expo/available-request-focused-20261029.log`, `.expo/available-request-final-20261029.log`.
- **Précautions de test et mise en service :** aucun `.env`, compte réel ou service de production utilisé. Le banc `test/run-sequential-dispatch.cjs` et la connexion de sa suite fixent explicitement UTC pour éviter que les colonnes historiques `timestamp` et le curseur ISO divergent selon le fuseau Windows ; cela ne modifie pas les dates de production. Le délai de préparation du schéma jetable est porté à 30 secondes pour les disques Windows lents. Appliquer la migration et livrer le backend avant la version mobile contenant ces changements ; rien n'a été déployé ni appliqué à une base existante. Aucun essai physique iOS/Android, push réel, compilation native ou certification d'absence de crash dans cette tâche.

## 2026-10-29 — Demande à accepter : carte ouverte et itinéraire plus lisible

- **Périmètre/constat :** la fiche de décision conducteur plaçait la carte après les informations, repliée par défaut ; une fois ouverte, sa hauteur de 154 points rendait le départ et l'arrivée difficiles à situer. La nouvelle demande de l'utilisateur remplace ce choix d'affichage replié uniquement pour cette fiche.
- **Solution appliquée :** `features/request-detail/RequestDriverDecision.tsx` présente la carte avant le résumé, sur toute la largeur, avec une hauteur de 35 % de la fenêtre bornée à 200–360 points. Le résumé conserve passager, places, type de véhicule, budget par place, date, adresses complètes/repères et moyen de paiement, avec moins de cadre et d'espacement. `requestSummaryStyles.ts` retire l'espace supérieur de ce contenu. Le sélecteur de véhicule et les actions « Refuser »/« Accepter » restent dans le pied de page existant, hors du défilement des détails. Le skill frontend a guidé une seule zone visuelle dominante, des surfaces sobres et l'absence d'animations décoratives supplémentaires.
- **Tracé et cycle de vie :** `CollapsibleRouteMap.tsx` ajoute un mode `overview` sans bouton d'ouverture, tout en conservant le mode repliable par défaut pour les autres fiches. Les points viennent du départ et de la destination souhaités par le passager, sans utiliser la position GPS du conducteur. Le service de calcul de trajet existant, ses caches/déduplications et ses délais sont réutilisés ; aucun nouvel abonnement GPS/polling. Le tracé routier reçu est continu ; en cas d'indisponibilité, la liaison de repli reste en pointillés et porte la mention « Départ et destination ». Sans coordonnées valides, une courte explication remplace la carte vide. Le montage et les commandes conservent les gardes de disponibilité/activité ; un rafraîchissement des mêmes coordonnées ne recentre plus la liaison de repli. Les redimensionnements continuent à cadrer les deux extrémités.
- **Comportements conservés :** aucun changement des filtres de conducteurs, des dernières positions connues, du backend, des droits, des montants, de la commission, des délais de réponse, de l'éligibilité, des acceptations/refus ou des redirections. Les parcours spécifiques aux invitations immédiates et au partage d'un trajet en cours restent inchangés. Contact, commission, autres options et détails supplémentaires restent accessibles par défilement. Les autres écrans conservent leur carte repliée et leur hauteur antérieure.
- **Tests et contrôles :** **93 tests JavaScript ciblés réussis, aucun échec ni test ignoré** : décision, choix du véhicule, tracé, chargement uniquement sur écran actif, absence de recentrage au polling, dimensions, coordonnées manquantes, conservation des cartes repliées, adresses, écran passager, partage et navigation après acceptation. Tests adaptés/ajoutés dans `tests/requestDecisionLayout.test.js` et `tests/requestDecisionMap.test.js`. TypeScript, lint ciblé, frontière réseau et taille des sources validés (1 233 sources, aucune au-delà de 400 lignes). Traces locales : `.expo/decision-map-regression-20261029.log`, `.expo/decision-map-types-20261029.log`, `.expo/decision-map-lint-20261029.log`.
- **Vérification visuelle et limites :** `scripts/preview-request-decision.cjs` rend les vrais composants de décision, de carte (support cartographique simulé), d'adresses, de sélection et de réponse via React Native Web avec des données fictives et aucun appel API/GPS. Mesures locales : carte de **390 × 295 px** sur fenêtre 390 × 844 ; **320 × 200 px** sur fenêtre 320 × 568, aussi avec texte à 150 % et plusieurs véhicules. Pied de page et boutons de réponse visibles, aucun débordement horizontal dans les trois scénarios. Les détails nécessitent un défilement sur les petits écrans, notamment avec de grands caractères. Aperçus standard et texte agrandi inspectés visuellement. Un premier lancement du navigateur isolé a expiré ; l'exécution locale autorisée avec profil temporaire a réussi. Trace : `.expo/decision-map-preview-20261029.log`. Ces contrôles Web/JavaScript ne sont pas des essais du SDK cartographique natif ; aucun essai physique iOS/Android, compilation native ou déploiement dans cette tâche. La suite globale de release n'a pas été relancée ; aucune garantie de disparition de crash n'est annoncée.

## 2026-10-29 — Recherche d'un conducteur : carte dominante et résumé compact

- **Demande/constat :** dans l'écran d'attente d'une demande, le titre, les paragraphes sur l'absence de positions et les explications occupaient une grande partie de l'écran. Le cadrage fixe couvrait une zone large même lorsque les véhicules étaient très proches du départ.
- **Interface appliquée :** `features/request-detail/RequestSearchScreen.tsx` affiche un état court, les deux adresses, l'horaire, les places et le budget. Les explications détaillées sont repliées derrière « Détails », avec état d'accessibilité et cible tactile d'au moins 44 points. La hauteur maximale du panneau passe de 46 % à 34 % par défaut, et à 48 % lorsqu'il est développé. Les adresses complètes restent accessibles en développant le panneau ; son défilement conserve l'accès au contenu avec de grands caractères. Annuler/modifier restent hors du défilement. Les propositions de partage, le conducteur ciblé et le délai de réponse ne sont pas conditionnés à l'ouverture des détails. Le skill frontend a guidé la priorité donnée à la carte, la réduction des textes répétitifs et le maintien d'actions lisibles, sans ajouter d'animation décorative ou de nouvelle palette.
- **Carte appliquée :** `RequestSearchMap.tsx` et le nouveau `requestSearchViewport.ts` cadrent le quartier lorsqu'aucune position n'est connue, puis le départ et les véhicules à la première réception de positions. Le cadrage ne poursuit pas les rafraîchissements périodiques et ne remplace pas un déplacement manuel. Le bouton de recentrage reste disponible. Le point clignotant est reprojeté lors d'un changement de hauteur du panneau, sans nouvel appel GPS. Les pictogrammes existants voiture/moto/tricycle, les coordonnées non arrondies, l'âge au toucher, l'atténuation des positions anciennes et les regroupements bornés de grandes flottes sont conservés.
- **Précautions :** aucune position n'est inventée si le backend ne renvoie pas de véhicules. Le nombre indique des positions connues, pas des conducteurs garantis disponibles. Aucun changement des permissions, du suivi GPS, des filtres d'éligibilité, du rayon serveur, des délais de réponse, du polling, des acceptations ou de la redirection vers la navigation. Aucun changement backend/natif ou déploiement. Les modifications préexistantes du projet sont conservées.
- **Tests :** **79 tests JavaScript ciblés réussis, aucun échec**, dont carte, types de véhicules, âge des positions, regroupements, panneau compact/détails, cadrage sans recentrage répété, reprojection lors du redimensionnement, actions et partage consenti, expiration, navigation après acceptation et cycle de vie natif simulé. Tests ajoutés dans `requestSearchViewport.test.js` et `requestSearchCamera.test.js`, tests d'écran adaptés dans `requestSearchScreen.test.js`. TypeScript, lint ciblé, frontière réseau et limite des sources validés ; 1 233 sources contrôlées, aucune au-dessus de 400 lignes. Traces : `.expo/search-compact-regression-20261029.log`, `.expo/search-compact-types-20261029.log` et `.expo/search-compact-preview-20261029.log`.
- **Mesures visuelles locales :** `scripts/preview-request-search.cjs` rend le véritable panneau et ses actions avec React Native Web, des données fictives et une carte de démonstration sans SDK/GPS/API. Il réutilise le navigateur isolé exporté par `preview-arrival-payment.cjs`. À 390 × 844 px : carte **531 px**, panneau **147 px**, avec ou sans véhicules. À 320 × 568 px : carte **235 px**, panneau **147 px** ; texte à 150 % : carte **159 px**, panneau **177 px**, contenu du panneau défilable. Les actions sont visibles et aucun débordement horizontal n'est détecté dans ces quatre aperçus, inspectés visuellement pour le format standard et les grands caractères. Deux lancements du navigateur dans le bac à sable ont expiré ; le rendu a ensuite réussi avec un profil temporaire en exécution autorisée. Ces mesures Web ne remplacent pas une mesure Yoga ni une validation physique iOS/Android.
- **Limites/hors périmètre :** pas d'essai de cette interface sur appareil physique et pas de validation d'une flotte réelle en production. Les contrôles de diff ciblé et global finaux sont réussis. Une modification temporaire de `eas.json` a été signalée pendant ce travail ; le fichier est revenu sans différence Git lors du contrôle final, sans intervention de ce correctif. La suite globale de release n'a pas été relancée pour cette modification d'interface.

## 2026-10-29 — Correctifs de performance : accusés de paiement et navigation masquée

- **Constats :** l'audit a reproduit une boucle GET/PUT lorsqu'un accusé de lecture d'un paiement échoue (15 appels en 368 ms dans le banc JavaScript). Les écrans de navigation couverts arrêtaient leur polling mais restaient abonnés au cache : une invalidation pouvait encore déclencher deux lectures côté passager. Ces mesures de banc ne sont pas des mesures de trafic de production.
- **Accusés corrigés :** `store/api/notificationApi.ts` n'invalide plus les notifications après l'échec de `markNotificationsAsRead`. `hooks/notifications/useDriverPaymentInbox.ts` réserve une seule tentative à la fois, avec délais minimaux progressifs de 15, 30, 60, 120, 240 puis 300 secondes. Les nouvelles tentatives utilisent le prochain rafraîchissement existant, uniquement au premier plan/en ligne, sans ajouter de timer. Un succès suivi d'une lecture serveur encore ancienne reste espacé d'au moins 15 secondes. Le verrou est isolé par compte/session et activation ; une réponse tardive ne libère pas celui d'une autre session. Les changements réseau/premier plan ne remettent pas le délai à zéro.
- **Lectures corrigées :** `useDriverNavigationData.ts`, `usePassengerNavigationData.ts` et `components/trip/DriverTripAccessGuard.tsx` suspendent leurs abonnements d'affichage lorsque l'écran est couvert, l'application inactive ou le réseau indisponible. Ils reprennent au retour. Le contrôleur conducteur réutilise pendant cinq secondes le résultat de la même requête que son garde d'accès vient de rafraîchir, pour éviter une lecture immédiate redondante. Les rafraîchissements explicites utilisent le garde existant `useDisplayRefetch` : un ancien callback ne relance pas une requête suspendue et ne restitue pas le résultat d'une autre session.
- **Conservation et accès :** le nouveau `hooks/navigation/useNavigationReadData.ts` conserve uniquement le dernier affichage de la réservation/du trajet du compte et de la session courants. La suspension ne simule pas une fin de trajet. Les refus 401/403/404 restent prioritaires, y compris après masquage ; une ouverture hors ligne permet toujours au mécanisme existant de charger son instantané disque. Un garde conducteur masqué ne redirige pas l'écran visible. Les types des callbacks ont été alignés dans `useDriverBookingActions`, `useDriverPickupActions`, `useDriverCompletionActions`, `useDriverForegroundCompletion`, `useDriverTripActions`, `useDriverTripInterruptionActions`, `usePassengerNavigationTripActions`, `usePassengerNavigationNotices` et `usePassengerNavigationInterruption`, sans changer leurs mutations.
- **Non-régressions :** aucun changement des montants, paiements, acceptations/refus, sonneries, permissions, services natifs, dépendances ou backend. Les coordinateurs globaux de trajet et leur GPS d'arrière-plan restent inchangés : il s'agit de supprimer les lectures supplémentaires des écrans masqués, pas toute activité réseau utile. Un paiement n'est marqué lu qu'après l'action de fermeture du reçu, jamais à sa réception. Les mutations déjà engagées ne sont pas annulées par la suspension d'affichage.
- **Tests ajoutés/adaptés :** `driverPaymentAcknowledgement.test.js` relie les véritables endpoints RTK et le hook d'accusé à un serveur simulé en mémoire (503, rafales d'invalidations, succès avec réponse ancienne, progression des délais, arrière-plan/hors ligne, changement de session). `navigationReadScheduling.test.js` utilise les hooks de production et de vrais abonnements RTK avec rendu React simulé : absence de lecture supplémentaire après masquage, reprise, conservation du trajet, actions toujours disponibles, callbacks tardifs, isolement des comptes et récupération hors ligne avec contrôle d'accès. `driverPaymentInbox.test.js`, `tripParticipation.test.js` et `auditUsabilityFixes.test.js` intègrent les nouveaux cycles de suspension/reprise.
- **Résultats :** `scripts/check-release.cjs` terminé avec code 0 : **2 915 tests réussis, aucun échec, 1 ignoré faute de Ruby** (2 916 tests, environ 347 secondes pour la phase de tests, pas une mesure de performance de l'application). TypeScript, ESLint global, frontières réseau, taille des sources (1 232 sources, aucune au-dessus de 400 lignes), compatibilités URI/Metro et parité des sources natives validés, sans compilation native. Les 10 nouveaux tests de régression sont inclus dans ce compte ; les suites ciblées ne s'y additionnent pas. Le banc RTK vérifie qu'un premier PUT en échec ne déclenche aucun GET supplémentaire, qu'une rafale de dix invalidations ne répète pas cet accusé avant son délai, et qu'une navigation masquée ne produit aucune lecture supplémentaire lors d'une invalidation avant reprise. Lint ciblé sans avertissement et `git diff --check` réussis. Traces locales : `.expo/performance-fixes-release-20261029.log`, `.expo/performance-fixes-integration-20261029.log`, `.expo/performance-fixes-targeted-20261029.log` et `.expo/performance-fixes-types-20261029.log`.
- **Limites :** aucun déploiement, accès aux utilisateurs de production, compilation native ou essai sur appareil physique dans cette correction. Les observations mémoire/fluidité de l'émulateur en build debug pendant l'audit ne prouvent ni fuite mémoire ni amélioration après correction. Le profilage contrôlé d'une build release Android/iOS reste à faire ; aucune disparition de crash ou de chauffe n'est annoncée.

## 2026-10-29 — Paiement reçu conducteur : modal, socket et secours REST

- **Constat :** le modal dépendait de quatre trajets récents et aucun événement socket ne couvrait le paiement seul. Risque d'alerte tardive ou absente et de répétition après une erreur de stockage local.
- **Appliqué :** reçu persisté dans la transaction de paiement, signal socket vers le conducteur, route REST authentifiée et file de modals avec montant/moyen. Secours toutes les 15 secondes sans socket, contrôle toutes les 60 secondes lorsqu'il est connecté, uniquement au premier plan/en ligne ; accusé de lecture après action, déduplication bornée par compte. Paiement partiel jetons distingué du cash à recevoir, cash confirmé uniquement après encaissement explicite. Index additif préparé pour le dispatcher et embarquement prépayé préservé sans réécriture du paiement.
- **Conservé :** règles financières, voix existante, sonnerie des nouvelles demandes, permissions et sources natives. Compatibilité avec ancien backend via repli 404/405 ; aucun déploiement ni changement de base existante. Le skill PostgreSQL a guidé l'outbox dans la transaction et l'index avec budgets de verrouillage/exécution.
- **Vérifications :** 151 tests backend ciblés, 74 tests financiers existants et 33 tests mobile ciblés réussis ; TypeScript mobile et backend de production validés. Gate mobile code 0 : **2 904 réussites, aucun échec, 1 test ignoré faute de Ruby** ; lint, frontières réseau, taille, compatibilités et parité des sources natives validés (sans compilation native). Le test RTK supplémentaire est couvert par la relance ciblée de 33 tests, pas par le compte du gate commencé avant son ajout. Intégration locale réelle PostgreSQL/Socket.IO/HTTP, mais identité de test injectée et rendu/voix natifs simulés : pas de validation physique Android/iPhone ni de paiement/push réel.
- **Détails, fichiers, migration, non-régressions et limites :** [rapport du flux de paiement conducteur](PAIEMENTS_CONDUCTEUR_SOCKET_REST_2026-10-29.md).

## 2026-10-28 — Recette locale transversale des modifications récentes

- **Périmètre :** vérifier les optimisations de lectures/cartes, les lieux partagés, les annonces de paiement et de jetons, ainsi que les non-régressions de demandes, réservations et alertes. Distinction stricte entre intégration JS, PostgreSQL/Redis temporaires, émulation Android et tests physiques non effectués.
- **Appliqué :** ajout de `tests/recentChangesHttpJourney.test.js` (7 parcours), du garde réseau `tests/helpers/localOnlyNetwork.cjs` et du runner `scripts/audits/test-local-payment-paths.cjs`. Aucun changement fonctionnel de production dans cette campagne ; données fictives, services locaux isolés, aucun déploiement ni `.env` lu. Les règles financières, délais de production, permissions de l’application et travaux existants sont conservés.
- **Résultats :** gate mobile réussi avec **2 892 succès, 0 échec, 1 ignoré** (Ruby absent), puis **7 nouveaux parcours réussis** séparément ; backend **75 succès/1 benchmark opt-in ignoré** sur demandes/relais et **74 succès** sur paiements/portefeuille (dont 12 PostgreSQL, le reste unitaire). Relais réels à 40 secondes mesurés à 40 869 et 41 184 ms avec faux fournisseur push. Émulateur Android API 36 : compilation du banc réussie, **17 scénarios de notification et 10 audio réussis**. Lint des ajouts, frontières réseau, taille et diff vérifiés. Les premiers problèmes du nouveau banc (imports natifs sous Node, attente de timer HTTP) ont été corrigés dans les tests uniquement.
- **Limites :** pas de certification E2E physique complète : API simulée pour les nouveaux formulaires, moteur vocal simulé, fournisseur push/paiement factice, identité de test injectée pour Nest, rendu logiciel du banc Android. Aucun parcours tactile complet dans l’application React Native actuelle, test iOS, push réel ou audibilité physique validé. [Rapport détaillé, traces, cas couverts et commandes de reproduction](TESTS_PARCOURS_2026-10-28.md).

## 2026-10-28 — Explication vocale du portefeuille de jetons

- **Constat/périmètre :** l’écran des jetons affiche les soldes, les droits au retrait et les réserves, mais ne les expliquait pas vocalement. Demande : décrire les jetons détenus et distinguer ce qui est retirable de ce qui sert uniquement à payer.
- **Appliqué :** `features/wallet/walletAnnouncement.ts` produit une explication française à partir du résumé serveur déjà affiché : solde disponible après réserve de commission cash, jetons convertibles et équivalent monétaire serveur, jetons non retirables, retrait bloqué/indisponible, minimum éventuel, identité vérifiée requise et réserves de retraits. Les bonus de fidélité ne sont jamais présentés comme de l’argent retirable. Une ventilation absente/incohérente reste « indisponible », sans inventer un solde nul. Les identifiants, numéros de téléphone et opérations de l’historique ne sont pas lus.
- **Intégration :** `app/wallet.tsx`, `hooks/wallet/useWalletAnnouncement.ts` et l’exposition de `isWalletFetching` dans `useWalletController.tsx` attendent la lecture du solde du compte courant. La voix reste limitée à l’écran actif sans formulaire ouvert ; erreur de lecture, sortie de l’écran, arrière-plan ou changement de compte la retirent. Une actualisation inchangée n’interrompt pas la phrase en cours et l’historique ne déclenche pas de relecture. Le même contenu est dédupliqué en mémoire dans la session ; une modification effective du solde ou de ses restrictions permet une nouvelle explication.
- **Audio partagé :** `usePaymentAnnouncement.ts`, `paymentSpeechSource.ts` et `foregroundRideAnnouncement.ts` réutilisent le moteur existant, sans lecteur, requête réseau ou permission supplémentaire. Une interface de paiement affichée garde la priorité sur le portefeuille, même après actualisation. Une opportunité conducteur en attente interrompt l’explication du portefeuille ; les instructions GPS conservent leur priorité. Délai d’attente avant lecture inchangé (30 secondes), garde maximale de lecture du portefeuille à 45 secondes en l’absence de callback natif. Cette garde ne change aucune durée de sonnerie, échéance de demande ou délai de paiement.
- **Cohérence avec le backend local :** l’inspection en lecture seule de `zwanga-backend/src/wallet/wallet.service.ts` et `src/payments/token-withdrawal.policy.ts` révèle la politique explicite `TOKEN_WITHDRAWALS_DISABLED` : les jetons de portefeuille ne sont plus retirables, les gains de trajets et le parrainage suivent leurs circuits distincts. Ce constat local ne prouve pas quelle version est déployée. `types/wallet.ts` expose ce motif optionnel ; `walletPolicy.ts`, la voix, `WalletOverview.tsx` et `WalletWithdrawalSection.tsx` le reconnaissent sans assimiler toute panne à une interdiction définitive. Lorsque le serveur renvoie ce code, une ancienne valeur `withdrawableBalance` ne produit plus de promesse de retrait ni d’indication trompeuse « portefeuille à vérifier ». Le suivi d’un ancien retrait incertain reste accessible. Les réponses d’un backend autorisant encore les retraits conservent leur explication conditionnelle et leur comportement.
- **Conservé :** montants, calculs financiers serveur, réserves, conditions de retrait, clés anti-double paiement, recharge, partage, navigation et interfaces de saisie inchangés. La voix n’exécute ni retrait ni paiement et sa disponibilité ne bloque aucune action. Aucun changement backend, natif ou de dépendance ; aucun déploiement.
- **Vérifications :** `scripts/check-release.cjs` réussi (code 0) : **2 890 tests réussis, aucun échec, 1 ignoré faute de Ruby**, TypeScript, ESLint global, frontières réseau, taille des sources, compatibilités URI/Metro et parité native validés. Cette passe précède le dernier alignement du texte sur `TOKEN_WITHDRAWALS_DISABLED`. Après cet alignement : **79 tests ciblés réussis**, TypeScript complet et lint de tous les fichiers concernés réussis, `git diff --check` réussi. Ces tests ciblés recouvrent la suite globale et ne s’y additionnent pas. Couverture dans `walletAnnouncement.test.js`, `walletCompactOverview.test.js`, `walletWithdrawal.test.js`, `walletSheetKeyboard.test.js`, `rideAnnouncement.test.js` et `paymentAnnouncement.test.js` : ventilation, bonus/solde nul, réserve cash, retrait en cours, minimum/blocage/interdiction serveur, données inconnues, compte différent, déduplication, actualisation, formulaire, arrière-plan, priorité GPS/paiement/opportunité conducteur et délai maximal. Journaux locaux : `.expo/wallet-voice-release-20261028.log`, `.expo/wallet-voice-final-targeted-20261028.log`, `.expo/wallet-voice-final-types-20261028.log`, `.expo/wallet-voice-final-lint-20261028.log`.
- **Limites :** contrôles JavaScript avec moteur vocal, cycle React et composants natifs simulés ; aucun essai audio physique Android/iPhone réalisé pour cette modification. La présence d’une voix française et les réglages audio du téléphone restent nécessaires. Les durées d’audibilité et la compréhension réelle du texte doivent encore être vérifiées sur appareils physiques. Les sommes annoncées correspondent au dernier résumé chargé, pas à une garantie de versement autorisé par le serveur.

## 2026-10-28 — Adresses partagées et annonces vocales du paiement

- **Constat/périmètre :** une sélection GPS peut être confirmée avant la résolution de son adresse ; les formulaires privilégiaient alors « Ma position » et certaines anciennes fiches considéraient « Ma position actuelle » comme un nom de lieu. Le paiement n’avait pas d’explication vocale propre au montant et à l’étape affichés.
- **Lieux appliqués :** `utils/sharedLocationLabel.ts`, `utils/routeLocationLabels.ts`, les modèles `publishModel.ts`/`requestFormModel.ts` et `services/sharedRouteAddresses.ts` écartent les raccourcis personnels, libellés temporaires et coordonnées brutes comme noms de lieux. Une adresse ou un repère réel déjà saisi est conservé. Avant création de demande, publication simple ou récurrente, les adresses manquantes sont recherchées en parallèle via la requête RTK existante et son cache, à partir des coordonnées sélectionnées, jamais du GPS du destinataire. Délai maximal de 3 secondes : en échec, « Point de départ (voir la carte) »/« Destination (voir la carte) » conserve un point utilisable sans inventer de rue. Les fiches historiques utilisant le résolveur partagé peuvent désormais enrichir ces anciens libellés ; aucune migration ni réécriture des données serveur existantes.
- **Soumission préservée :** `useRequestSubmission.ts`, `usePublishSubmission.ts` et `usePublishController.ts` gardent l’attente visible, le verrou anti-double appui et le contrôle de session/montage après la recherche. Les reprises d’envoi ambigu comparent les adresses effectivement envoyées. Coordonnées, références personnelles, places, prix, conducteur ciblé, KYC et publications récurrentes inchangés. Un formulaire fermé ou une session remplacée pendant cette étape ne déclenche pas de création tardive.
- **Voix appliquée :** `paymentAnnouncement.ts`, `usePaymentAnnouncement.ts` et `paymentSpeechSource.ts` alimentent le moteur `foregroundRideAnnouncement.ts`, réveillé par `useRideRinging.ts`. Une source active par interface, identifiée par compte/session/réservation/étape, avec déduplication en mémoire et attente limitée à 30 secondes ; pas de lecteur ni de surveillance réseau supplémentaire. La voix se coupe à la fermeture, à la sortie de l’application ou au changement de session. Une instruction GPS garde la priorité ; les phrases ne sont pas mises en file derrière elle. Les paiements n’exigent pas l’autorisation des notifications ni un canal conducteur, ne demandent aucune permission et ne forcent pas le volume. Les politiques existantes de sonnerie et de voix à l’entrée restent inchangées en dehors de l’interface de paiement.
- **Passager :** `PassengerArrivalPaymentCoordinator.tsx` décrit le montant réellement dû (notamment réduction ou descente anticipée), la vérification encore incertaine, l’échec non confirmé ou le reçu. Un complément jetons/espèces annonce uniquement le cash restant à remettre ; choisir les espèces n’est jamais décrit comme de l’argent déjà reçu. Aucune erreur serveur technique, identité ou référence de transaction n’est lue à voix haute. L’écran de choix après interruption reste prioritaire et masque cette annonce.
- **Conducteur :** `DriverPaymentNoticeCoordinator.tsx` annonce le paiement confirmé affiché et filtre les trajets par compte courant, y compris au changement de compte. `ConfirmCashReceipt.tsx` et `DriverDropoffReceiptsSheet.tsx` expliquent le cash du récapitulatif sélectionné ou de l’action de confirmation, puis sa réception seulement après réponse serveur. Les autres lignes de réservation montées hors de ce contexte ne déclenchent pas toutes une voix. Les montants, écritures financières et mutations restent inchangés.
- **Vérifications :** nouveaux tests sur adresses réelles/génériques, absence de réseau inutile, délai/échec du géocodeur, garde de soumission simple/récurrente, montant réduit, paiement incertain, cash mixte, sélection visible, déduplication, compte remplacé, fermeture/arrière-plan et interruption GPS. `scripts/check-release.cjs` réussi (code 0) : **2 881 tests réussis, aucun échec, 1 ignoré faute de Ruby**, TypeScript, ESLint global, frontières réseau, taille des sources, compatibilités URI/Metro et parité native validés. TypeScript et lint global relancés sur les dernières modifications : code 0. Les tests complémentaires de publication (7) et voix/intégration (41) passent aussi ; ces nombres recouvrent la suite globale et ne s’y additionnent pas. Journaux locaux : `.expo/location-payment-release-20261028.log`, `.expo/location-payment-final-types-20261028.log`, `.expo/location-payment-final-lint-20261028.log`, `.expo/location-payment-final-targeted-20261028.log` et `.expo/shared-route-publication-20261028.log`. `git diff --check` réussi. Les premiers essais avaient révélé des attentes synchrones et des appels directs de hooks dans les anciens tests de soumission ; ils ont été adaptés au cycle React et à la résolution asynchrone, sans supprimer les assertions anti-double envoi ni les contrôles métier.
- **Limites :** tests JavaScript avec GPS, réseau, moteur vocal et interfaces natives simulés ; aucun essai physique Android/iPhone dans cette intervention. Pas de modification backend, native, dépendance, secret ou déploiement. L’adresse exacte dépend du géocodeur et du réseau ; aucun lieu n’est garanti sans données disponibles. La voix dépend du moteur français installé et des réglages audio du téléphone ; sur iPhone, le mode silencieux peut la rendre inaudible ([documentation Expo Speech](https://docs.expo.dev/versions/latest/sdk/speech/)). Vérifier en build sur appareils physiques la lecture à l’ouverture du paiement, cash mixte, confirmation conducteur, appel/interruption, fermeture et retour arrière-plan. Aucun paiement n’attend la disponibilité de la voix.

## 2026-10-28 — Correctifs de performance : recherche, décisions et accueil

- **Constat/périmètre :** l’audit mobile a identifié le cumul des lectures demande/offres/carte (5/15/30 secondes), le blocage des décisions pendant un simple rafraîchissement, les positions passagers encore traitées sans affichage sur l’accueil et jusqu’à 500 marqueurs individuels sur la carte de recherche.
- **Réseau appliqué :** `services/chatSocket.ts` expose l’état de connexion aux observateurs passifs, sans ouvrir ni conserver une connexion supplémentaire. `hooks/notifications/useRideSocketConnected.ts` retire son observation hors écran/hors réseau et isole les changements de compte. `features/request-detail/requestPollingPolicy.ts`, `hooks/request-detail/useRequestDetailData.ts` et `SharedTripPanel.tsx` passent les lectures demande et offres à 30 secondes lorsque le socket est connecté ; les cadences de secours précédentes (5 secondes pour la demande du passager, 15 secondes pour les offres) reviennent à la déconnexion. La carte reste à 30 secondes. Cela représente une cadence théorique d’environ 6 lectures/minute au lieu de 18 pour ces trois ressources, hors latence, invalidations, chargement initial et autres coordinateurs : ce n’est pas une mesure de trafic en production. Une connexion socket ne prouve pas la livraison de chaque événement : le contrôle périodique reste volontairement actif, avec jusqu’à 30 secondes de délai de récupération d’un événement perdu, hors latence réseau.
- **Décisions appliquées :** `useRequestDetailData.ts`, `useRequestDetailController.ts` et `RequestDriverDecision.tsx` séparent la possibilité de répondre de `isFetchingRequest`. Une fiche chargée sans erreur conserve ses actions et le choix du véhicule pendant une actualisation silencieuse ; absence de données, erreur, hors connexion/écran, mutation en cours et échéance de réponse restent protégés. Les mutations serveur, l’exclusion des doubles actions et les règles véhicule/identité ne sont pas remplacées par une décision locale.
- **Accueil appliqué :** `useHomeController.ts` et `useHomeTracking.ts` ne calculent plus les marqueurs passagers, ne conservent plus leur état React et ne demandent plus des positions invisibles sur cette carte. Le hook inutilisé `hooks/home/useHomePassengerMarkers.ts` est supprimé (récupérable dans Git). L’abonnement aux événements de progression, les dialogues métier, les rafraîchissements de réservation et l’émission GPS conducteur restent en place. Aucun changement de la cadence native pendant un trajet ou du suivi conducteur proche.
- **Carte appliquée :** `requestVehicleClusters.ts` regroupe uniquement l’affichage lorsque plus de 80 véhicules sont dans la zone visible, avec au maximum 64 groupes/repères. Un groupe indique un nombre de positions connues, pas une voiture fictive ; le toucher agrandit sa zone. `RequestSearchMap.tsx` conserve les coordonnées/types/âges originaux, calcule les groupes après le geste et mémorise le rendu. `RequestSearchScreen.tsx` explique les nombres. Les positions hors vue restent dans les données et réapparaissent en déplaçant la carte ; les validations d’âge, d’identité de demande et la limite de données à 500 sont inchangées. Pas de dépendance ni de fichier natif ajouté.
- **Conservé/précautions :** invalidations socket immédiates et regroupées, reprise périodique même socket connecté, arrêt des lectures hors écran, passage vers la navigation dès réservation confirmée (secours réservation à 5 secondes conservé), expiration des offres, paiement et partage soumis au consentement, localisation/sonnerie natives et permissions inchangées. Aucun backend, compte utilisateur, environnement de production, déploiement ou fichier de secrets modifié.
- **Vérifications :** tests de politique réseau, observation du socket, perte/reprise réseau, changement de compte, décisions pendant actualisation/erreur/expiration, progression et GPS sur l’accueil, et regroupement/panoramique/zoom de 500 véhicules synthétiques ajoutés ou adaptés. `scripts/check-release.cjs` terminé avec le code 0 : **2 864 tests réussis, aucun échec, 1 test ignoré faute de Ruby** (politique des cibles iOS à vérifier avec macOS/Ruby). TypeScript, ESLint global, frontières réseau, taille des sources, compatibilités URI/Metro et parité des sources natives validés ; cette parité ne compile pas les applications natives. Les 5 tests renforcés de rendu de carte et cycle de vie de l’accueil ont aussi été relancés séparément avec succès. Journaux locaux : `.expo/performance-fixes-release-20261028.log` et `.expo/performance-fixes-map-20261028.log`.
- **Limites :** tests de hooks/composants JavaScript avec entrées natives/réseau simulées ; aucun essai physique Android/iPhone ni mesure de FPS, mémoire ou batterie dans cette intervention. Vérifier en build release sur téléphone modeste la carte dense, le toucher des groupes, le retour arrière-plan et les décisions sur réseau lent. Aucune garantie de disparition des crashs ou de chauffe.

## 2026-10-28 — Ouvrir la page précise de l’autorisation plein écran

- **Constat :** lors de la recette, « Activer » avait enregistré le consentement Zwanga sans passage observé par l’écran Android ; une invitation avait ensuite rencontré un refus système. L’ancien bridge n’ouvrait les réglages que si `canUseFullScreenIntent()` renvoyait faux. Cela explique le chemin sans réglages, mais ne démontre pas la cause exacte de la divergence d’état sur le binaire installé.
- **Correctif appliqué :** action native explicite `requestFullScreenPermission` dans `native/android/notifications/DriverAlertModule.java` et son miroir Android. Sur Android 14+, un appui ouvre `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` avec l’URI du package courant, même si la lecture initiale indiquait déjà une autorisation. Aucun détour par les réglages généraux, aucun octroi programmatique. Exécution sur le thread UI, activité reprise requise, délai de validité de 1,8 s et échec remonté sans enregistrer un nouveau consentement si le lancement échoue.
- **Interface et retour :** `useDriverFullScreenPermission.ts`, `DriverPermissionsCoordinator.tsx`, `DriverFullScreenApproval.tsx` et `DriverFullScreenPreference.tsx` utilisent cette action et annoncent « Ouvrir les réglages ». Le lancement ne valide pas l’autorisation : nouvelle lecture effective au retour au premier plan avant de terminer l’étape. Retrait du consentement sans ouverture des réglages ; compatibilité conservée avec les anciens bridges, Android antérieurs et iOS. **Une nouvelle build Android est nécessaire** pour ce nouveau chemin natif ; le dev build déjà installé ne le reçoit pas par Metro.
- **Localisation :** inspection réelle des permissions de l’émulateur : accès précis et accès en arrière-plan déjà accordés. L’absence de nouvelle demande sur cet appareil est donc attendue. Aucun retrait forcé d’autorisation ni changement de cadence GPS. Les tests conservent l’explication de localisation avant le plein écran lorsqu’elle manque, la demande système après un appui, le rappel différé après refus et le retour sans faux succès. Cela ne démontre pas les autorisations des appareils physiques des utilisateurs.
- **Vérifications et limites :** 82 tests ciblés JS/Java simulé réussis ; compilation hors ligne du banc Android isolé réussie. Après résolution d’un blocage graphique de l’émulateur par relancement logiciel sans effacement, ouverture directe de la page précise réellement vérifiée depuis le bouton du banc Android 16. Désactivation/réactivation du commutateur dans l’interface système puis Retour : le bridge lit respectivement `allowed=false` puis `true`. Régression globale : **2 856 tests réussis, 1 ignoré faute de Ruby, aucun échec**, TypeScript, lint global, frontières réseau, parité et taille validés. Détails et limites dans [le rapport du 28 octobre](CORRECTIFS_ALERTES_2026-10-28.md#autorisation-plein-écran--page-android-précise). Le dev build React connecté n’a pas été recompilé ; pas de validation physique Samsung ou iOS. Aucun déploiement, modification backend ou permission forcée sur le compte connecté. L’autorisation reste un choix Android, pas une garantie universelle d’affichage sur toutes les marques.

## 2026-10-28 — Recette connectée avec un second conducteur local

- Le premier compte étant occupé, utilisation du second compte explicitement autorisé, sans modification applicative ni déploiement. Connexion réussie, demandes fictives adressées exclusivement à ce conducteur, transport FCM réel vers l'émulateur vérifié sans enregistrer de jetons.
- Refus dans la fiche puis acceptation depuis l'alerte hors application confirmés dans l'interface et dans le backend. Après acceptation : écran « Course confirmée », sans démarrer le trajet. Essai en veille : réveil Android observé, mais pas de plein écran ; l'accès spécial est signalé refusé et son écran système n'a pas pu être validé. Le son audible/continu n'est pas certifié par ces observations ; un filtre mêlant les services du banc et du dev build a été exclu des preuves.
- Cinq demandes fictives annulées et leurs passagers désactivés, contrôle SQL local en lecture seule. Aucun trajet préexistant annulé ; aucun changement d'environnement ou de base de production. Identifiants et captures du compte non conservés dans la documentation.
- Matrice des essais, expirations sans action et limites restantes : [reprise de la recette du 28 octobre](CORRECTIFS_ALERTES_2026-10-28.md#reprise-du-28-octobre-avec-le-second-conducteur-local-autorisé). Les résultats précédents du banc natif et des tests automatisés restent distincts de ce parcours connecté.

## 2026-10-28 — Fiabilité du service audio et recette des alertes

- Correction de la finalisation des publications Notifee tardives, du transfert audio au retour dans l'application, des reprises techniques bornées du lecteur et du diagnostic du canal plein écran réellement utilisé.
- Sources natives et copies Android synchronisées ; tests de non-régression enrichis et banc Android recompilé. Contrôle mobile : 2 850 réussites, un ignoré faute de Ruby ; 51 scénarios du banc natif sur émulateur ; suites serveur distinctes : 204 réussites et un test de charge optionnel ignoré, après relance documentée des préparations PostgreSQL trop lentes. Aucun déploiement, aucune alerte vers des utilisateurs réels.
- Connexion au compte conducteur choisi validée dans le dev build, mais création ciblée rejetée car le backend le considère déjà occupé. Aucun trajet existant annulé ; comptes passagers fictifs désactivés. Le parcours réel Accepter/Refuser reste à terminer avec un conducteur disponible, contrairement aux tests simulés réussis.
- Périmètre, fichiers, comportements conservés, résultats mesurés et limites : [rapport de recette et correctifs](CORRECTIFS_ALERTES_2026-10-28.md). Nouvelle build Android nécessaire pour embarquer ces changements Java ; les tests simulés et les essais du banc ne certifient pas le dev build installé.

## 2026-10-28 — Sonnerie Android indépendante des autres notifications

- **Problème/périmètre :** une autre notification sonore peut remplacer le lecteur de notification partagé par Android et interrompre la sonnerie Zwanga hors de l’application. L’utilisateur a autorisé la préparation et les essais locaux d’un service audio natif, sans déploiement. Ce correctif concerne les alertes conducteur Android ; aucun transport serveur, comportement iOS ou durée métier n’est modifié.
- **Solution appliquée :** nouveaux `native/android/notifications/RideAlertAudioService.java`, `RideAlertAudioPlayer.java` et `RideAlertAudioSession.java`. Service privé de type `mediaPlayback`, non redémarré automatiquement, attaché à la carte déjà publiée et à son compte destinataire. Une seule session audio ; limite de 60 secondes et échéances métier originales conservées, sans prolongation sur doublon. Le lecteur, son focus et son délai d’arrêt monotone utilisent leur propre looper, libéré à l’arrêt : ils ne dépendent pas des callbacks d’une activité figée. Le lecteur utilise le son du canal existant, les attributs notification et le volume système, sans forcer le volume ni se présenter comme un appel. Il atténue/reprend après perte temporaire du focus et s’arrête sur perte permanente, appel détecté, mode silencieux, interruption système incompatible, expiration ou compte invalide. Pas de réseau, microphone, service au démarrage du téléphone ou boucle de republication.
- **Carte et relais :** une fois le service autorisé, la même carte et ses actions passent sur le canal de présentation silencieux `ride-audio-visible-v1`, pour éviter deux lecteurs sonores simultanés. Le canal sonore initial continue de gouverner l’autorisation et le son utilisés. Le bridge de réveil reconnaît explicitement ce changement de canal avec ses métadonnées, sans accepter un canal étranger. `RidePresentationExpiry.java` conserve le retrait borné de la bannière et libère aussi le caractère persistant à l’arrêt ; aucune carte supprimée n’est recréée. À l’entrée effective dans Zwanga, la présentation intrusive cesse et le service cède au lecteur de premier plan lorsqu’il est prêt (`ForegroundAlertPlayer.java`). Si Android refuse le démarrage du service, la carte et le son Android initiaux restent le repli ; ce repli reste soumis aux interruptions de notifications de l’OS.
- **Arrêt explicite vérifié :** le premier essai natif a montré qu’un simple `cancelNotification` ne supprime pas une carte encore possédée par un service de premier plan. `services/backgroundRideAudio.ts` arrête donc le service avant la suppression après décision, via `DriverAlertModule.java`. Branchement dans `driverNotifications.ts`, `backgroundRideRinging.ts` et `hooks/notifications/useRideRinging.ts`. Une deuxième course détectée sur émulateur est corrigée : décision/déconnexion utilisent `STOP_FOREGROUND_REMOVE`, sans republier une carte silencieuse, et le nettoyage efface l’identifiant afin que `onDestroy` ne reposte pas la carte après sa suppression. Le relais de premier plan met à jour la carte sans arrêter prématurément le lecteur de service. `NativeRideDelivery.java` arrête également la session et sa carte à la déconnexion. Les anciens binaires sans ce bridge conservent leur fonctionnement ; notifications étrangères et cartes avec tag ne stoppent pas la session audio.
- **Intégration native :** copies `android/app/src/main/java/com/zwanga/notifications/` synchronisées ; `plugins/withDriverAlertSources.js`, `app.config.js` et le manifeste Android déclarent le service et `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. Le plugin reste idempotent. Nouvelle build Android indispensable ; préparer la déclaration du service et sa justification dans Google Play avant publication, sans présumer de son acceptation. L’autorisation plein écran existante reste distincte et obligatoire pour ce mode de présentation ; ce service n’accorde aucune permission à la place du conducteur.
- **Vérifications ciblées acquises :** compilation hors ligne du banc isolé `com.zwanga.audit` réussie ; aucun accès Internet autorisé dans ce banc. Sept tests ciblés JS/Java simulé réussis : ordre arrêt/suppression, bridge optionnel, iOS inchangé, erreurs, prébuild, focus et nettoyage de présentation. `scripts/audits/test-ride-audio-service.cjs` a exécuté huit cas sur émulateur Android 16/API 36 : bannière après huit secondes, notification concurrente audible, perte temporaire/atténuation et reprise, perte permanente, entrée/relais, décision et expiration. Les états du vrai lecteur natif sont observés, pas l’audibilité sur téléphone physique. Le démarrage autorisé du service est obtenu par une activité de test visible ; cela ne teste pas l’exemption FCM haute priorité.
- **Incident de banc conservé :** deux passes de la matrice plein écran ont été interrompues par des timeouts ADB et un ANR de `com.zwanga.audit`, puis un essai verrouillage a aussi bloqué. La pile principale attendait `HardwareRenderer.syncAndDrawFrame` ; le RenderThread était dans `gfxstream::guest::ProgramData::compileAttribValidationInfo`, moteur graphique de l’émulateur. Trace limitée au banc conservée dans `.expo/ride-audio-service-20261028/emulator-render-anr.txt`. L’émulateur Pixel_5 a été redémarré sans effacement des données. Un paramètre facultatif **du banc seulement**, `-PauditSoftwareRendering=true`, isole ensuite le lecteur du problème graphique ; le rendu de production reste inchangé. Cette isolation ne constitue pas un correctif/certificat de stabilité graphique de production.
- **Essais natifs finaux :** compilation hors ligne avec rendu logiciel du banc réussie ; 16 scénarios de `test-native-ride-delivery.cjs` réussis, dont écran éteint avec/sans autorisation plein écran, réservation, demande proche, offre exclusive, repli Notifee et doublon. Après le dernier correctif de destruction, les **neuf scénarios audio** réussissent, incluant verrouillage/déverrouillage hors application, autre notification audible, focus, relais, suppression effective après décision et échéance métier. La passe audio finale utilise `RIDE_AUDIT_AUDIO_ONLY=1` : elle ne mesure pas la bannière SystemUI, dont un dump avait expiré après redémarrage. Rapports distincts `.expo/ride-audio-matrix-software-20261028/native-matrix.json` et `.expo/ride-audio-service-final-software-20261028/results.json`. Aucune de ces simulations ne valide la réception FCM réelle, le rendu matériel Samsung ou l’audibilité physique.
- **Contrôles et fiabilisation du banc JS :** une première vérification globale avait réussi (2 844 tests réussis, 1 ignoré faute de Ruby). Une passe ultérieure est restée bloquée dans `entryRecoverySafety.test.js`, puis interrompue explicitement : son faux fetch pouvait installer son écouteur d’annulation après l’avancement de l’horloge simulée. Ce test attend désormais le démarrage effectif du fetch avant d’avancer l’horloge ; ses huit cas repassent, sans changement du réseau de production. Les cinq contrôles Java ciblés finaux passent également : arrêt idempotent, focus, délai indépendant de l’UI et réveil après changement de canal. **Dernière exécution complète de la régression : 2 846 réussis, 1 ignoré faute de Ruby, aucun échec**, code 0, journal `.expo/ride-audio-regressions-final-20261028.log`. TypeScript, ESLint global, frontières réseau et compatibilités URI/Metro avaient passé les étapes précédentes ; lint des derniers tests/scripts relancé sans avertissement. Après les derniers changements natifs : recompilation du banc réussie, parité des copies validée, 1 218 sources sous la limite de taille et `git diff --check` réussi. Les résultats antérieurs interrompus restent dans leurs journaux, sans être présentés comme des succès.
- **Limites :** aucun build de production, push FCM réel, Samsung physique ou test iOS effectué. La visibilité permanente d’une bannière n’est pas garantie : Android, One UI, les permissions et d’autres notifications gardent la priorité d’affichage. Le service n’est ni un contournement des restrictions Android de démarrage en arrière-plan ni un remplacement de CallKit. Pas de certification d’absence de crashs, de chauffe ou de livraison universelle. Rapports locaux : `.expo/ride-audio-service-20261028/`, `.expo/ride-audio-release-20261028.log`.
- **Références :** [Android — gestion du focus audio](https://developer.android.com/media/optimize/audio-focus), [type de service mediaPlayback](https://developer.android.com/develop/background-work/services/fgs/service-types), [restrictions de démarrage en arrière-plan](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).

## 2026-10-28 — Bannière Android prolongée et présentation plein écran simplifiée

- **Constat/périmètre :** l’utilisateur confirme que la carte reste dans le volet des notifications lorsque sa bannière disparaît pendant la sonnerie. Il s’agit donc du repli de la bannière temporaire, pas d’une suppression de notification démontrée. Le code n’attachait l’intent plein écran que téléphone verrouillé/écran éteint ; sur Android 13+, cela privait les alertes reçues téléphone déverrouillé du comportement renforcé documenté par Android. Cette observation du code ne démontre pas à elle seule la cause sur chaque téléphone signalé.
- **Affichage appliqué :** `native/android/notifications/DriverAlertModule.java` et `RideNotificationBundle.java` autorisent aussi cet intent lorsque l’écran est déverrouillé à partir d’Android 13. Les vérifications de build, consentement du conducteur, accès spécial Android, notifications et priorité du canal sont conservées. L’OS choisit alors une bannière, sans lancement direct de l’activité au-dessus de l’application utilisée. Avant Android 13, la restriction écran verrouillé/éteint reste inchangée. Aucune republication périodique, permission de superposition ou catégorie d’appel téléphonique artificielle ajoutée.
- **Fin de présentation appliquée :** nouveau `RidePresentationExpiry.java`, appelé depuis `RideCardDelivery.java` et le bridge `boundFullScreenPresentation`, plus branchement dans `services/rideAlertFullScreen.ts`, `driverNotifications.ts` et `backgroundRideRinging.ts`. Un timer unique par publication et un travail WorkManager de secours retirent l’intent plein écran à la fin de la fenêtre sonore ou à l’expiration métier, au plus tard au plafond de 60 secondes de cette présentation. Seule la carte encore présente avec le même conducteur, identifiant d’invitation et échéance sonore est modifiée ; ses actions sont conservées, `onlyAlertOnce` est maintenu, aucune carte supprimée n’est recréée. Le nettoyage fonctionne aussi pour une publication JavaScript sans compte déjà lié au récepteur FCM natif. Les offres exclusives gardent leur suppression à expiration ; une réservation en attente reste consultable. La durée sonore existante n’est pas rallongée par ce changement.
- **Interface appliquée :** `IncomingRideActivity.java` utilise le nouveau `IncomingRideView.java`, composé uniquement de vues Android légères. Le guide `frontend-skill` a orienté une hiérarchie sobre : identité Zwanga, type d’événement, résumé du trajet, grandes actions distinctes et accès aux détails. Prix/destination restent issus de la notification existante et masqués avant déverrouillage. Pied d’actions hors du contenu défilant, boutons empilés avec grandes polices, marges système/encoches, contraste marqué, apparition brève respectant la désactivation des animations. Pas de carte, réseau, image générée, montage React ou animation permanente ajoutés ; verrouillage sécurisé et pipeline authentifié des décisions conservés.
- **Intégration :** sources natives canoniques et copies `android/app/src/main/java/com/zwanga/notifications/` synchronisées ; liste de génération `plugins/withDriverAlertSources.js` et compilation du banc `tests/android/ride-alert-harness/build.gradle` mises à jour. `AuditActivity.java` et `NativeCardProbe.java` ajoutent une prévisualisation de la vue exacte avec données synthétiques uniquement ; aucune désactivation de `FLAG_SECURE` en production.
- **Vérifications automatisées :** `scripts/check-release.cjs` réussi, code 0 : TypeScript, ESLint global, frontières réseau, taille des sources, compatibilités URI/Metro, parité native et **2 838 tests réussis, 1 ignoré faute de Ruby**. Tests supplémentaires dans `ridePresentationExpiry.test.js` et `rideFullScreen.test.js` : échéance non atteinte, identité remplacée, suppression préalable, idempotence, actions préservées et bridge optionnel/échec/iOS. Le test Java de nettoyage exécute les méthodes réelles avec services Android simulés ; ce n’est pas un test matériel. `rideScreenWakeNative.test.js` et `rideLockScreenPresentation.test.js` couvrent les branches API et la confidentialité/décision unique. `git diff --check` et parité native relancés avec succès. Journal local : `.expo/ride-banner-release-20261028.log`.
- **Essais natifs réellement exécutés :** compilation hors ligne réussie du seul APK isolé `com.zwanga.audit`. Sur émulateur Android 16/API 36, les 16 scénarios de `scripts/audits/test-native-ride-delivery.cjs` réussissent, dont demandes/réservations/offres exclusives écran éteint avec autorisation et repli sans autorisation. Le nouveau `scripts/audits/test-ride-banner-persistence.cjs` valide trois cas : bannière encore épinglée après 8 secondes sans prise de premier plan, retrait de l’intent à l’échéance avec carte/actions conservées, absence de résurrection après suppression avant l’échéance. Ce dernier test a été relancé après la dernière recompilation. La première assertion UIAutomator ne trouvait que le lanceur malgré une bannière visible : corrigée pour lire la ligne réelle SystemUI, avec capture visuelle conservée. Prévisualisations inspectées en police normale et à 150 %, paramètres de l’émulateur restaurés. Rapports et captures locaux : `.expo/ride-banner-20261028/` et `.expo/ride-banner-matrix-20261028/native-matrix.json`.
- **Limites/précautions :** aucune modification iOS/backend, aucun push réel, compte réel, déploiement ou build de production. Le banc n’exerce pas la livraison FCM ni tout le cycle React de production. Pas de Samsung S23 physique testé ni de mesure de chauffe/audibilité. Android/One UI, le conducteur et les réglages système peuvent toujours masquer, retirer ou limiter une bannière ; une notification ordinaire sans autorisation plein écran reste temporaire. WorkManager est différable sous Doze et ne garantit pas une échéance à la seconde après arrêt du processus. Nouvelle build Android nécessaire ; vérifier sur S23 et autres appareils réels écran éteint, déverrouillage et autre application active, avec autorisation accordée puis refusée. Aucune garantie d’absence de crashs ou d’affichage universel.
- **Référence :** [Android — `setFullScreenIntent`, bannière sur appareil déverrouillé et autorisation](https://developer.android.com/reference/android/app/Notification.Builder#setFullScreenIntent(android.app.PendingIntent,%20boolean)).

## 2026-10-28 — Plein écran Android : état effectif et concurrence au réveil

- **Constat/périmètre :** plein écran absent signalé sur Samsung S23 malgré l’autorisation dans les réglages Android. Sans traces de cet appareil ni numéro de build, la cause exacte du signalement n’est pas démontrée. L’inspection a confirmé deux défauts du code : l’interrupteur du profil reflétait seulement le consentement local, et les publieurs JavaScript réveillaient immédiatement l’écran après publication, contrairement au publieur natif qui laisse Android décider du plein écran avant son réveil de secours. Le contrôle d’autorisation ignorait aussi la priorité du canal réel.
- **Appliqué — état/autorisation :** `native/android/notifications/DriverAlertModule.java` et sa copie Android ajoutent la lecture `channelReady` (canal d’alerte existant, importance élevée et groupe non bloqué), sans modifier les préférences système. `hooks/notifications/useDriverFullScreenPermission.ts`, `components/profile/DriverFullScreenPreference.tsx`, `components/permissions/DriverFullScreenApproval.tsx` et `components/DriverPermissionsCoordinator.tsx` vérifient consentement local, droit plein écran Android, notifications autorisées et canal prêt avant d’afficher l’option activée/de terminer la demande d’autorisation. Un canal bloqué ouvre ses réglages spécifiques sur action volontaire. Le retrait du consentement reste accessible même lorsque l’interrupteur est éteint à cause d’un refus système. Le droit Android reste accordé uniquement par son interface système ; aucune permission n’est simulée par un clic dans Zwanga.
- **Appliqué — affichage :** `services/rideAlertScreenWake.ts`, `driverNotifications.ts` et `backgroundRideRinging.ts` attendent 1,5 seconde avant le réveil manuel de secours lorsqu’un intent plein écran est fourni. La carte est publiée immédiatement ; expiration, décision, session et retour au premier plan sont revérifiés avant ce réveil. `plugins/withIncomingRideAlerts.js`, le manifeste Android livré et celui du banc déclarent `showWhenLocked`, `turnScreenOn` et `singleTop`, en complément des appels de l’activité native. Ce sont des corrections de chemins identifiés, pas une preuve que la panne précise du S23 provenait de ces chemins.
- **Conservé :** aucune modification du backend, du ciblage, de la durée sonore, du transport FCM/APNs, du verrouillage sécurisé ou de la confidentialité des détails. Pas de contournement du mode silencieux/Ne pas déranger ni des choix du conducteur. Pas de lancement direct arbitraire d’activité en arrière-plan : Android conserve la décision via la notification. L’ancien bridge sans `channelReady` demeure compatible ; cette vérification supplémentaire requiert la nouvelle build native.
- **Tests locaux :** contrôle complet `scripts/check-release.cjs` réussi (code 0) : 2 836 tests réussis, 1 ignoré faute de Ruby, aucun échec ; TypeScript, lint global, compatibilité URI/Metro, frontières réseau, parité native et taille des sources validés. Les tests couvrent aussi refus/révocation Android, canal de faible priorité, retrait du consentement et réveil différé annulé après retour dans l’app/expiration. TypeScript et lint ciblé relancés après le dernier ajustement de l’interface, sans erreur ; `git diff --check` réussi. Journal local : `.expo/full-screen-effective-release-20261028.log`. Les tests avec services Android simulés sont distincts des essais natifs ci-dessous.
- **Essais natifs réalisés :** compilation hors ligne réussie du seul banc isolé `com.zwanga.audit`, puis 16 scénarios réussis sur émulateur Android 16/API 36 (`scripts/audits/test-native-ride-delivery.cjs`). `NativeCardProbe.java` expose le droit système effectif, la disponibilité du canal et la présence de l’intent ; le script constate aussi l’activité effectivement au premier plan. Cas inclus : accord local sans droit Android (carte seulement), réservation/demande proche/offre exclusive en veille avec droit Android (activité plein écran réellement ouverte), repli après échec Notifee, téléphone déverrouillé (pas de prise de premier plan), déduplication, expiration, auteur exclu, reprise locale. Rapport : `.expo/full-screen-effective-20261028/native-matrix.json`.
- **Limites :** l’émulateur n’est pas Samsung One UI ; le banc simule les identités et ne transporte aucun push réel. Aucun test physique S23, build de production, essai iOS ou déploiement effectué. Nouvelle build Android nécessaire ; tester ensuite sur le S23 écran éteint avec son numéro de build, version Android/One UI et traces locales. Pas de promesse d’affichage sur tous les appareils ou de suppression de crashs.
- **Références techniques :** [Android — comportement du plein écran selon le verrouillage et le droit système](https://source.android.com/docs/core/permissions/fsi-limits), [Notifee — déclaration de l’activité plein écran](https://notifee.app/react-native/docs/android/behaviour/).

## 2026-10-28 — Correctifs de l’audit global : reprise, recherche et notifications

- **Périmètre/problèmes :** récupération de navigation perdue après arrière-plan, recherche cartographique encore annoncée après arrêt du dispatch, rappel plein écran masqué par une erreur de lecture, contenu différent entre notifications natives/APNs/Expo et contrôle croisé interrompu par son périmètre de modules.
- **Navigation appliquée :** `hooks/useAssignedTripNavigation.ts` réarme le délai de récupération au retour sur l’écran après une transition ignorée ; changer d’instance de routeur ne supprime plus ce délai. Pas de seconde navigation automatique pour la même tentative ; les actions du trajet redeviennent accessibles après deux secondes. Tests supplémentaires dans `tests/assignedTripNavigation.test.js` pour Android/iOS, changement de routeur et retours successifs.
- **Recherche appliquée :** `features/request-detail/requestSearchModel.ts`, `RequestSearchScreen.tsx` et, dans `zwanga-backend`, `src/trip-requests/request-search-map.ts` arrêtent d’annoncer la recherche à `departureDateMax`, comme le dispatch existant. L’écran invite à modifier l’horaire et masque les véhicules de cette recherche terminée. L’horloge serveur est utilisée lorsqu’un instantané récent est disponible. Le délai de conservation/modification de trois heures reste inchangé ; aucun trajet, paiement ou enregistrement n’est annulé. Contrôle propriétaire, filtres géographiques et index existants conservés conformément au guide PostgreSQL ; aucune migration.
- **Autorisation appliquée :** `components/DriverPermissionsCoordinator.tsx` garde le rappel Android éligible en cas d’erreur initiale, même sans permission en cache ; l’action proposée relit l’autorisation, sans l’accorder. `native/android/notifications/DriverAlertModule.java` distingue l’erreur native d’une capacité absente via un rejet de promesse. Sa copie Android est synchronisée. iOS, builds sans cette capacité, consentement volontaire et priorité des trajets restent inchangés.
- **Notifications appliquées :** `RideNotificationBundle.java` (source et copie Android) conserve le prix dans le corps lu par le plein écran déverrouillé, avec places et horaire de Kinshasa ; adresses bornées, actions alignées sur le mobile, notamment « Voir la demande » pour un partage. Backend : `src/notifications/ride-card-content.ts` et `notifications.service.ts` harmonisent APNs, FCM classique et Expo. Aucun prix absent n’est inventé, aucune carte ajoutée, aucune modification de destinataires, TTL, durée de sonnerie, confidentialité avant déverrouillage ou consentement.
- **Contrôles appliqués :** `scripts/check-backend-mobile-ringing.cjs` autorise explicitement le module de présentation manquant, sans élargir arbitrairement son chargeur. `scripts/audits/audit-driver-card-text.cjs` vérifie désormais prix/horaire/places ; `scripts/audits/test-native-ride-delivery.cjs` et le banc Android isolé contrôlent aussi le corps et les libellés des actions. Tests mobiles et backend étendus dans les suites concernées.
- **Vérifications finales :** contrôle mobile complet `scripts/check-release.cjs` réussi : 2 830 tests réussis, 1 ignoré faute de Ruby ; TypeScript, lint global, parité native, frontières réseau et taille des 1 217 sources validés. Backend : TypeScript de production réussi ; 65 tests ciblés carte/expiration/notifications puis 273 tests du périmètre notifications réussis (suites partiellement communes ; tests PostgreSQL non relancés). 20 contrats croisés sur le commit mobile de travail et 54 combinaisons de contenu réussis. Le contrôle de contenu borne les payloads testés à 2 852 octets Android et 2 623 octets iOS ; ce n’est pas une mesure de livraison ou de charge production. `git diff --check` réussi dans les deux dépôts.
- **Validation native locale :** APK du seul banc `com.zwanga.audit` compilé hors ligne avec Gradle 8.14.3, après adaptation de son interface Promise simulée ; 11 scénarios sur émulateur réussis : carte/prix/places/horaire, actions de partage, doublon, repli Notifee, notification tardive silencieuse, auteur exclu, offre expirée, reprise WorkManager, réveil et plein écran avec accord. Les sources natives de production sont copiées dans ce banc, mais React Native/FCM et les comptes réels ne sont pas utilisés. Aucun APK de production ni essai physique exécuté. Les contrats ne prouvent pas la correspondance avec le binaire du store. Aucun déploiement, push réel ou accès à une base de production ; nouvelle build Android nécessaire pour embarquer le correctif Java.
- **Limite iOS maintenue :** pas de macOS/Xcode sur ce poste ; `ios/Podfile.lock` n’est pas modifié artificiellement et le contrôle Crashlytics/Didit reste actif. Exécuter `npm run prepare:ios-native` sur macOS, conserver le lock généré, puis valider l’archive et les appareils physiques. Le succès de tests JavaScript ou d’un banc Android n’est pas une certification d’absence de crashs ou de sonnerie audible sur tous les téléphones.

## 2026-10-28 — Déblocage ESLint du post-install EAS

- **Problème/périmètre :** le hook `eas-build-post-install` s'arrêtait dans le contrôle de publication sur `scripts/relay-fix-work/apply.cjs:9` : ESLint ne reconnaissait pas `__dirname`, fourni par Node aux modules CommonJS.
- **Appliqué :** déclaration ESLint locale `/* global __dirname */` dans ce seul script, conforme aux autres scripts CommonJS du projet. Aucun changement de la configuration globale ESLint ni exclusion de fichiers du contrôle.
- **Conservé/précautions :** toutes les étapes de `scripts/check-release.cjs` et du hook EAS restent actives. Aucun changement du comportement mobile, du backend ou des sources natives. Le script utilitaire n'est pas exécuté pendant la vérification : il contient des écritures dans le dépôt backend voisin.
- **Vérifications :** sous Node 24.22.1, lint ciblé sans avertissement et syntaxe CommonJS validés. `scripts/check-release.cjs` terminé avec code 0 : compatibilité URI/Metro, parité des sources natives, TypeScript, ESLint global, frontières réseau, taille des sources et 2 822 tests de régression réussis ; 1 test ignoré faute de Ruby. `git diff --check` réussi. Aucun build EAS ni essai natif lancé : la réussite de ces contrôles locaux ne certifie pas la compilation Android/iOS ou le comportement sur appareils.

## 2026-10-28 — Autorisations guidées dès la connexion, sans passage par Profil

- **Demande :** proposer localisation et plein écran avec des modales simples et des boutons vers les réglages utiles.
- **Appliqué :** localisation puis notifications/plein écran Android dès la première connexion conducteur, sans délai de 15 secondes ; après succès demande/réservation pour la localisation passager. Textes raccourcis, notifications application traitées avant l’accès spécial Android 14+, relecture au retour et protection contre les actions tardives.
- **Build :** capacité plein écran activée dans le manifeste source et la configuration locale de la prochaine build Android, dont le profil EAS production. Consentement conducteur et accord système restent indispensables. Nouvelle build native et déclaration Play Console nécessaires ; aucun build, envoi GitHub ou déploiement réalisé.
- **Conservé :** style, Plus tard, rappel maximal quotidien par type, priorité aux trajets/alertes en cours, suivi GPS existant et notifications normales en repli. Pas d’équivalent plein écran ajouté sur iOS ni changement backend/AWS.
- **Compatibilité :** préparation EAS et Expo alignées ; ancien refus Android réévalué avant redirection ; contrôle de permission plein écran adapté aux Android antérieurs à 10 sans supprimer le consentement.
- **Vérifications :** 61 tests ciblés puis suite complète séparée : 2 821 réussis, 1 ignoré (Ruby absent), aucun échec. Après le dernier ajustement Android ancien : 15 contrôles plein écran/build réussis, dont méthode Java exécutée avec services système simulés. TypeScript, parité native, frontières réseau/taille et lint ciblé sans erreur validés. Le contrôle global reste bloqué par une erreur de lint préexistante hors périmètre. [Résultats et recette appareil](LOCALISATION_AUTORISATIONS_2026-10-28.md). Aucun essai sur téléphone physique ni APK compilé dans cette intervention.

## 2026-10-28 — Autorisation de localisation après demande/réservation et première connexion conducteur

- **Problème :** le rappel conducteur ignorait la première visite et les créations de demandes/réservations ne proposaient pas ce parcours explicatif.
- **Appliqué :** rappel passager après succès serveur (y compris demande retrouvée après timeout), modal existant adapté au rôle, rappel conducteur dès la première connexion sur un écran sûr. Parcours natif Android/iOS, relecture au retour des réglages, repli Réglages pour le refus silencieux iOS de « Toujours ».
- **Conservé :** style, bouton Plus tard, réservation/demande non bloquée, fréquence et tâches GPS existantes, permissions déjà accordées, opt-out conducteur et délai anti-répétition de 24 heures. Aucun nouveau suivi permanent passager, appel HTTP, changement backend, Terraform, CI/CD ou déploiement.
- **Vérifications :** 306 tests JavaScript ciblés réussis ; TypeScript sans émission, ESLint ciblé sans avertissement, frontières réseau, taille des sources et diff vérifiés. Ce ne sont pas des essais natifs Android/iOS.
- **Détail et recette appareil :** [Localisation arrière-plan : parcours d’autorisation](LOCALISATION_AUTORISATIONS_2026-10-28.md).

## 2026-10-28 — Véhicules individuels à leur dernière position connue

- **Problème/périmètre :** la nouvelle carte d’attente regroupait les conducteurs par zone ; elle ne montrait pas chaque véhicule à sa dernière position enregistrée, comme demandé.
- **Appliqué :** un repère voiture/moto/tricycle par conducteur éligible, aux coordonnées enregistrées non arrondies, avec ancienneté au toucher. Les positions anciennes restent visibles tant que leur utilisation est autorisée ; elles sont atténuées à partir de dix minutes. Contrat backend enrichi et lecture mobile adaptés ; aucun véhicule fictif ajouté pour un ancien serveur.
- **Conservé :** rayon de 5 km autour du départ, compatibilité véhicule/places, audience ciblée, refus, contrôle propriétaire, arrêt de la découverte après attribution, halo du passager et navigation après réservation acceptée. Aucun changement de sonnerie, de dispatch, de collecte GPS ou de base de production.
- **Vérifications :** 109 tests JavaScript mobiles ciblés, 10 tests unitaires backend et 3 scénarios PostgreSQL/PostGIS locaux isolés réussis. TypeScript mobile/backend, ESLint mobile ciblé, frontières réseau et taille des sources validés.
- **Limites :** 500 véhicules les plus proches au maximum, avec indication si la limite est atteinte ; aucune mesure de charge production ni validation native sur appareils. Backend préparé sans déploiement. Fichiers, contrat, compatibilité et précautions dans [la mise à jour du dossier carte](CARTE_RECHERCHE_DEMANDE_2026-10-28.md#précision--véhicules-individuels-et-dernières-positions-connues).

## 2026-10-28 — Carte de recherche après publication d’une demande

- **Problème/périmètre :** le passager voyait le ticket de sa demande plutôt que les conducteurs proches, puis devait passer par le détail du trajet avant sa navigation.
- **Appliqué :** écran de recherche cartographique sur la route existante, positions réelles approximatives regroupées dans un rayon de 5 km, halo du passager, maintien des actions Modifier/Annuler et des propositions partagées. Nouvel endpoint propriétaire dans le backend voisin ; navigation directe dès qu’une réservation acceptée est disponible. Fichiers, protections et précisions dans [le document spécialisé](CARTE_RECHERCHE_DEMANDE_2026-10-28.md).
- **Conservé :** attribution/refus, audience ciblée, consentement au partage, sonnerie, contrôles KYC, paiement et reprise de demande à l’ouverture. Aucune carte dans la notification, aucune migration ni modification de production.
- **Vérifications :** 125 tests JavaScript mobiles ciblés réussis, puis 15 contrôles de navigation/sortie de carte réussis après ajout d’un test de transition ignorée (126 cas distincts). 8 tests backend unitaires et 3 scénarios PostgreSQL/PostGIS isolés réussis. TypeScript mobile/backend, lint ciblé, frontières réseau et limite de 400 lignes validés ; lint de navigation relancé après le dernier ajout.
- **Limites :** backend préparé, non déployé. Nouveau rendu et transitions non validés sur appareils Android/iOS ; aucune garantie de performance ou d’absence de crash natif. Le détail distingue les tests exécutés des vérifications restantes.

## 2026-10-28 — Audit de cohérence des notifications avec prix

- **Périmètre :** dernière présentation texte des demandes/réservations, plein écran Android, Notifee, APNs/Expo et compatibilité avec le mobile de référence.
- **Constats :** prix absent du résumé plein écran, horaire/places absents de la nouvelle présentation serveur, transport Expo non harmonisé et contrôle de compatibilité cassé par un module non autorisé. Un écart préexistant des boutons partagés est également relevé.
- **Travail effectué :** ajout du banc local `scripts/audits/audit-driver-card-text.cjs` et du [rapport d’audit](AUDIT_NOTIFICATIONS_PRIX_2026-10-28.md). Aucun correctif métier appliqué ; comportement de l’application conservé.
- **Vérifications :** 55 tests mobiles, 50 tests backend et 54 combinaisons de contenu réussis ; une injection native sur émulateur confirme titre, corps et boutons. Le contrôle officiel de compatibilité échoue ; ses 20 assertions passent après autorisation du seul module manquant dans une exécution diagnostique en mémoire, sans modification du script.
- **Limites :** pas de push réel, de téléphone physique ou de rendu iOS. Mesures de formatage sur le poste uniquement. Détails, fichiers concernés, reproductions et corrections recommandées dans le rapport ; aucun déploiement.

## 2026-10-27 — Prix visible dans la notification conducteur, sans carte

- **Périmètre et problème :** le montant pouvait être masqué par la destination dans la notification compacte. La demande initiale d’aperçu cartographique a été retirée par l’utilisateur pendant le travail.
- **Appliqué :** montant connu dans le titre (`Budget` pour une demande, tarif pour une réservation), départ et destination en texte, et détail Android dépliable en texte. Fichiers mobiles : `features/notifications/driverNotificationCard.ts`, `native/android/notifications/RideNotificationBundle.java` et sa copie générée Android. Backend : `src/notifications/ride-card-content.ts`, `android-driver-backup.ts`, `ios-driver-push.ts`. Le prix reste par place, conformément aux données existantes ; aucun total n’est inventé. Un montant absent ou invalide ne devient pas « Gratuit ».
- **Conservé :** actions Accepter/Refuser, destinataire, confidentialité sur écran verrouillé, déduplication, durée et transfert de sonnerie, navigation vers la demande. Les limites de taille du push sont conservées et le texte secondaire est raccourci si nécessaire.
- **Carte retirée :** aucun téléchargement d’image, endpoint cartographique, cache d’image ou permission supplémentaire n’est ajouté au résultat final. Aucun changement de base de données ni déploiement.
- **Vérifications :** 55 tests JavaScript mobiles et 47 tests backend réussis ; compilation de l’APK natif de test réussie ; 9 scénarios locaux sur émulateur Android réussis (prix dans le titre, boutons, doublon, secours Android, expiration, récupération du travail persistant, veille et plein écran autorisé). Parité des sources natives et TypeScript backend de production validés. Tests concernés : `tests/driverNotificationActions.test.js`, `scripts/audits/test-native-ride-delivery.cjs`, son `NativeCardProbe.java`, et `src/notifications/ride-card-content.spec.ts` côté backend.
- **Limites :** tests Android dans l’application isolée `com.zwanga.audit`, notifications synthétiques, aucun push réel ni essai sur téléphone physique/iOS. Les tests APNs vérifient le contenu du message, pas son rendu sur un iPhone. Nouveau build Android nécessaire pour la présentation native ; backend préparé, non déployé. Ces résultats ne certifient pas l’absence de crashs en production.

## 2026-10-27 — Tests locaux intégrés du relais et des notifications mobiles

- **Demande :** vérifier ensemble les ajouts backend et mobile sans solliciter les utilisateurs réels.
- **Ajout :** deux parcours croisés exécutant l'API NestJS, PostgreSQL/PostGIS, Redis, le transport de push local, le publieur Android natif et les gestionnaires TypeScript du mobile. Le véritable cron a relayé une demande ignorée après 41,164 secondes mesurées.
- **Banc :** horloge synthétique alignée sur celle de l'émulateur et dossiers de résultats séparés ; aucune modification de la logique de production. Les fichiers et comportements conservés sont détaillés dans le rapport.
- **Vérifications :** 106 tests d'intégration backend, 51 tests de contrats, 129 tests mobiles et 30 scénarios natifs Android réussis ; contrôle TypeScript du build réussi. Le contrôle TypeScript global a relevé 40 erreurs de tests préexistantes.
- **Limites :** fournisseur Firebase simulé, application Android de test séparée, pas de recette complète React Native ni d'essai physique/iOS. Aucun déploiement.
- **Rapport et reproduction :** [tests d'intégration locaux](TESTS_INTEGRATION_RELAIS_2026-10-27.md).

## 2026-10-27 — Réception mobile et préparation du backend pour Android 176

- Audit du push, du relais natif/JavaScript, des actions et de l'expiration ; cible déclarée Play Store 1.0.18 (176).
- Backend : identifiant de secours cohérent avec le mobile, TTL borné par l'invitation, Redis de test préparé dans le pipeline. Aucun changement du code mobile d'exécution.
- 45 tests serveur, 88 tests mobiles et 20 contrôles croisés de contrats réussis ; TypeScript backend et YAML vérifiés. Correspondance exacte du binaire du store et essais physiques restant à vérifier.
- Aucun déploiement, push réel ni migration de production ; l'utilisateur déploiera le backend. [Analyse, fichiers et limites](AUDIT_RECEPTION_SONNERIE_BACKEND_2026-10-27.md).

## 2026-10-27 — Correctifs du relais et des réponses aux demandes

- **Problèmes :** attente Redis non bornée, acceptation interrompue bloquant la
  file et contre-proposition rendue inacceptable après le délai conducteur.
- **Appliqué :** délais Redis, étapes conducteur/passager/confirmation distinctes,
  finalisation transactionnelle et reprise des trajets provisoires ; compte à
  rebours dans la fiche mobile. Migration backend 98 préparée.
- **Conservé :** fenêtre initiale de 40 secondes côté serveur, ciblage privé,
  règles de paiement et réservations sur trajets publiés. Aucun changement natif.
- **Vérifié :** 186 tests distincts réussis, TypeScript et contrôles ciblés ;
  services de test isolés et push simulés, aucun déploiement.
- **Fichiers, détails et limites :** [rapport des correctifs](CORRECTIFS_RELAIS_DEMANDES_2026-10-27.md).

## 2026-10-27 — Audit du relais Redis et du délai de réponse

- **Périmètre :** détection des 40 secondes, refus, acceptation, panne Redis et
  cohérence de la fiche conducteur. Aucun correctif métier ni déploiement dans cet audit.
- **Constats :** commandes Redis sans délai maximal, acceptation provisoire pouvant
  bloquer le relais, contre-proposition encore en attente mais devenue inacceptable ;
  délai consommé avant affichage et peu visible dans la fiche programmée.
- **Vérifications :** 14 cas existants, un délai réellement écoulé et sept assertions
  reproduisant les défauts. Relais local mesuré à 40,578 secondes ; push simulés.
- **Résultats et suites recommandées :** voir
  [l'audit détaillé](AUDIT_FILE_DEMANDES_40_SECONDES_2026-10-27.md).
  Code applicatif conservé ; aucune conclusion nouvelle sur les appareils physiques.

## 2026-10-27 — File Redis et relais des demandes après 40 secondes

- **Demande :** solliciter un seul conducteur, passer au suivant après refus ou
  absence de réponse pendant 40 secondes, retirer la demande après acceptation.
- **Solution préparée :** file Redis, callback authentifié, traitement serveur des
  échéances, historique SQL, contrôles d'acceptation et migration backend.
- **Comportements conservés :** demandes ciblées privées, contrôles de proximité,
  formats de notification et parcours de réservation des trajets publiés.
- **Vérifications et limites :** voir [le dossier technique](FILE_DEMANDES_REDIS_2026-10-27.md).
  Aucun déploiement ni test push sur des utilisateurs de production.

## 2026-10-27 — Vérification AWS des demandes sans sonnerie

- **Signalement :** pendant les essais de 14 h à 15 h, sonnerie constatée sur un
  seul téléphone et absence de reprise après refus ; même build selon l'utilisateur.
- **Travail réalisé :** lecture ECS/ECR/CloudWatch, recoupement intégral d'un
  diagnostic SQL existant, consultation du code déployé et reproduction du repli
  d'enregistrement mobile. Aucun changement de production ni du comportement métier.
- **Constats :** six notifications par demande sur sept commandes, confirmation
  fournisseur distincte de la réception, reprise limitée au protocole natif v6,
  absence de relais spécifique des refus programmés et repli mobile non rehaussé.
- **Résultats, fichiers et limites :** voir
  [l'audit AWS du 27 octobre](AUDIT_AWS_SONNERIE_2026-10-27.md). Aucune promesse de
  sonnerie sur appareil ; correctifs recommandés distingués des modifications appliquées.

## 2026-10-27 — Choisir le destinataire d'une demande de trajet

- **Problème :** impossible de cibler un conducteur proche ou connu depuis la commande.
- **Appliqué :** choix facultatif dans « Heure et prix », recherche par proximité/nom,
  restriction serveur de l'audience, suivi du destinataire et élargissement explicite
  aux conducteurs proches. Fichiers, migration et détails dans le
  [rapport de mise en œuvre](DEMANDE_CONDUCTEUR_CIBLE_2026-10-27.md).
- **Conservé :** diffusion habituelle sans choix, acceptation volontaire, refus
  persistants, prix, horaires et règles d'attribution. Aucun déploiement.
- **Vérifié :** tests mobile/backend et bases PostgreSQL jetables, TypeScript et
  compilation NestJS ; résultats précis et limites dans le rapport. Aucun essai
  physique, aucune garantie nouvelle de réception push ou d'absence de crash natif.

## 2026-10-27 — Masquer les demandes refusées pour le conducteur concerné

- **Problème :** le refus arrêtait l'alerte mais la demande restait visible dans
  les listes, notamment au retour dans l'application.
- **Appliqué :** mémorisation serveur par conducteur/demande, filtrage des listes,
  détails et alertes, retrait des caches après confirmation, retour à l'accueil.
  Migration et fichiers concernés dans le
  [rapport de mise en œuvre](REFUS_DEMANDES_CONDUCTEUR_2026-10-27.md).
- **Conservé :** visibilité pour le passager et les autres conducteurs, trajets
  attribués, réservations ; ignorer une sonnerie ne vaut pas refus.
- **Vérifié :** 56 tests mobile, TypeScript, ESLint ciblé, limites réseau/taille ;
  essais backend sur bases PostgreSQL jetables détaillés dans les journaux.
  Pas de test physique ni déploiement. Migration nécessaire côté serveur.

## 2026-10-27 — Node et dépendances : mises à jour de sécurité

- **Problème/périmètre :** Node non fixé au correctif LTS récent, 25 paquets
  affectés côté mobile et 30 côté backend selon l’audit npm initial.
- **Appliqué :** Node 24.22.1 pour le projet/EAS et le backend/Docker/CI ;
  correctifs compatibles, substitutions ciblées, adaptation de l’import du
  décodeur d’URL ESM pour Expo Router 6 et de la lecture d’images par Metro.
  Versions et fichiers détaillés dans
  [le rapport Node et dépendances](MISE_A_JOUR_NODE_DEPENDANCES_2026-10-27.md).
- **Conservé :** version d’application 1.0.18, SDK Expo 54, React Native 0.81.5,
  SDK natifs de sonnerie/KYC et comportements métier. Aucun déploiement.
- **Vérifications et limites :** voir le rapport pour les audits npm, les essais
  sous Node temporaire vérifié, les résultats et les limites natives. Le Node
  global et les processus existants ne sont pas remplacés automatiquement.

## 2026-10-27 — Version de l’application Android et iOS : 1.0.18

- **Périmètre et problème :** la version actuelle est déjà en production selon
  l’utilisateur ; préparer une nouvelle version pour les prochains builds.
- **Solution appliquée :** passage de `1.0.17` à `1.0.18` dans `app.config.js`,
  `package.json`, les deux métadonnées racine de `package-lock.json`,
  `android/app/build.gradle` (`versionName`) et les deux configurations Xcode de
  `ios/zwanga.xcodeproj/project.pbxproj` (`MARKETING_VERSION`). `Info.plist`
  continue de lire les variables Xcode.
- **Comportements conservés :** SDK Expo, dépendances, identifiants et profils
  de build inchangés. `appVersionSource: remote` et `production.autoIncrement:
  true` restent actifs dans `eas.json`. Les compteurs locaux historiques ne
  réinitialisent pas les compteurs distants ; aucun numéro distant n’a été
  consulté, inventé ou modifié.
- **Vérifications :** les cinq tests existants de `tests/appVersions.test.js`
  passent ; `node scripts/check-native-sources.cjs` et `git diff --check` passent.
  La configuration Expo est évaluée par les tests sans lecture de `.env`.
- **Limites :** aucun build natif, essai sur appareil, envoi EAS ou publication
  déclenché. Les numéros de build définitifs seront attribués lors des prochains
  builds de production EAS ; l’acceptation par les stores reste à vérifier.

## 2026-10-26 ? Correctifs de livraison et tests d?int?gration des sonneries

- **P?rim?tre/probl?me :** suite aux constats F1?F6 de l?audit : diffusion partielle,
  transport bloquant, ?checs d?affichage natif, perte de r?servations tardives,
  rupture de reprise au d?verrouillage et absence de reprise apr?s un push accept?.
- **Appliqu? :** lots urgents corrig?s, HTTP Firebase born?, reprise native
  WorkManager et carte de secours, restauration avec d?lai enregistr?, re?us
  enrichis et une seule reprise serveur Android v6. Migration locale pr?par?e,
  sources Android et plugin synchronis?s. D?tails/fichiers dans
  [le rapport de fiabilisation et d?int?gration](FIABILISATION_SONNERIE_INTEGRATION_2026-10-26.md).
- **Conserv? :** ciblage m?tier et exclusion de l?auteur, premi?re acceptation
  gagnante, dates d?expiration, pr?f?rences syst?me, compatibilit? des anciens
  clients et sonneries existantes. Aucun d?ploiement ni contact de vrais utilisateurs.
- **V?rifi? :** 2 745 tests mobiles (un Ruby ignor?), deux nouveaux tests de re?us,
  136 tests backend dont PostgreSQL et parcours HTTP ? ?mulateur ? HTTP ; neuf
  sc?narios natifs et compilation Java Android r?elle r?ussis. Typage des sources
  backend de production r?ussi ; erreurs anciennes dans le typage global des tests.
- **Limites :** transport Firebase simul?, authentification de test, aucun appareil
  iOS physique. Le plein ?cran est observ? sur une invitation isol?e, pas garanti
  pendant une rafale. Les preuves et limites restantes sont d?taill?es dans le rapport.


## 2026-10-26 — Audit des derniers correctifs de livraison des sonneries

- **Périmètre :** diffusion serveur, réception Android v6, restauration sonore,
  compatibilité iOS, ressources marimba et reçus. Audit demandé pour fiabilité,
  robustesse et cohérence ; aucun changement fonctionnel ni déploiement.
- **Constats :** arrêt du traitement rapide après cinq destinataires, capacité
  bloquée par des envois lents, absence de secours sur erreur native, réservation
  encore valide rejetée après la fenêtre sonore, durées incohérentes et limites
  des reçus. Priorités, fichiers et solutions proposées dans
  [l'audit de fiabilité](AUDIT_FIABILITE_SONNERIE_2026-10-26.md).
- **Appliqué :** rapport et script `scripts/audits/audit-ride-delivery.cjs`, sans
  réseau ni base, exécutant les méthodes existantes avec entrées/sorties simulées.
  Ciblage, préférences système, actions et code applicatif conservés.
- **Validation :** 157 tests mobiles ciblés et 64 tests backend unitaires réussis ;
  trois scénarios problématiques confirmés par les sondes ; ESLint du script
  sans erreur. Les sondes terminées ne certifient pas une livraison fiable.
  Aucun essai physique, nouvelle compilation native ou envoi FCM/APNs réel.

## 2026-10-26 — Livraison des sonneries, diffusion proche et marimba léger

- **Problème :** absence de notifications signalée sur plusieurs comptes ; audit
  montrant des pertes possibles entre sélection, reprise serveur et affichage
  Android dépendant de JavaScript. Son actuel jugé trop agressif.
- **Appliqué :** broadcast immédiat par lots à 5 km, claim push renouvelable et
  protégé, reprise socket sur 60 secondes, récepteur Android/Notifee natif v6,
  reçus authentifiés réception/affichage, repli système des anciens Android et
  motif de marimba original plus doux. Fichiers, compatibilité, mesures et limites :
  [Correctifs de livraison et marimba](CORRECTIFS_LIVRAISON_SONNERIE_2026-10-26.md).
- **Conservé :** exclusion de l'auteur, refus par demande, une seule acceptation
  gagnante, autorisations et silence/DND, échéances d'origine, ancien transport et
  iOS. Aucun déploiement ni envoi à des utilisateurs réels.
- **Validation :** compilation Java de l'application Android réussie ; 148 tests
  backend ciblés couverts sur les derniers passages, dont 71 sur PostgreSQL/PostGIS
  temporaire. Contrôle complet mobile : **2 741 tests réussis**, un test Ruby ignoré
  sous Windows, TypeScript/ESLint/parité/frontières réseau/taille conformes.
  Carte native publiée sur émulateur local avec deux actions, sans FCM ni compte réel.
  Dernière demande intégrée : marimba continu, notes prolongées et superposées sans
  pause. Mesures WAV : 29/60 s, crête 0,7400, RMS 0,2489 ; 12 tests WAV/parité réussis
  après cette régénération. Aucun essai physique ni compilation iOS.

## 2026-10-26 — Audit : absence de notification et de sonnerie en production

- **Signalement :** aucune notification visible sur plusieurs téléphones avec
  des comptes conducteurs distincts. Aucun journal de cet incident disponible.
- **Audit :** reprise de claim push à 120 secondes pour une invitation de
  60 secondes, reprise temps réel encore limitée à 30 secondes, distribution
  immédiate unitaire, secours Android silencieux dépendant du relais JavaScript,
  repli incomplet sans pont audio et reçu serveur non appelé par le mobile.
  Analyse, références, hypothèses de production et chemins des sons dans
  [Audit de l'absence de sonnerie](AUDIT_ABSENCE_SONNERIE_2026-10-26.md).
- **Vérifications :** 111 tests mobiles et 46 tests backend ciblés réussis,
  cinq sondes de caractérisation et parité native réussies. Durée des WAV
  mesurée : 60 secondes Android, 29 secondes iOS ; copies Android identiques.
- **Portée :** documentation et sondes locales uniquement. Aucun changement
  fonctionnel, correctif appliqué, push réel, essai physique ni déploiement.
  Les défauts constatés dans le code ne prouvent pas la cause unique de l'incident.

## 2026-10-26 — Suppression de la suspension des sonneries après demandes ignorées/refusées

- **Constat :** la règle des quatre demandes ignorées/refusées suspendait les
  sonneries pendant 24 heures, y compris pour un conducteur proche. L'utilisateur
  demande désormais de supprimer cette règle.
- **Appliqué :** retrait du filtre de suspension à la sélection et à l'envoi,
  neutralisation des anciennes suspensions au prochain traitement, sans
  modification globale de la base. Détail et fichiers dans
  [Sonneries sans suspension](SONNERIE_SANS_SUSPENSION_2026-10-26.md).
- **Conservé :** refus limité à la demande concernée, déduplication, échéances,
  critères d'éligibilité, exclusion de l'auteur et réservations. Les compteurs
  de compatibilité restent à zéro ; aucune nouvelle migration n'est nécessaire.
- **Vérifications :** 139 tests backend réussis, dont PostgreSQL/PostGIS locaux,
  avec plus de quatre demandes ignorées/refusées et une ancienne suspension
  encore active ; cinq tests mobiles du refus et TypeScript de production valides.
  ESLint ciblé valide ; 13 tests unitaires d'envoi relancés avec succès après
  typage des doubles et résultats de tests.
  Aucun push réel, essai sur téléphone ou déploiement. Cette suppression devient
  effective après déploiement du backend ; aucune réinstallation mobile requise.

## 2026-10-26 — Sonnerie Android de 60 secondes et reprise après erreurs

- **Constat :** fenêtre serveur de 30 secondes consommée par les délais de
  livraison, fichier Android de 29 secondes partagé avec iOS et blocage définitif
  du lecteur d'un événement après trois erreurs natives. Causes possibles du
  signalement, sans journal du téléphone permettant de les confirmer sur place.
- **Appliqué :** fenêtre de 60 secondes, son Android spécifique de 60 secondes,
  relais et plein écran alignés, retry après une pause d'une minute. Fichiers,
  règles préservées et limites dans
  [Durée et reprise de la sonnerie](SONNERIE_DUREE_REPRISE_2026-10-26.md).
- **Conservé :** iOS 29 secondes en notification, permissions, silence/DND,
  décisions, expirations métier et exclusion de l'auteur. La pause de 24 heures,
  initialement conservée, est supprimée par le correctif ci-dessus.
- **Vérifications :** 79 tests ciblés réussis, dont logique Java avec substituts
  et copie des sons au prebuild ; 125 tests backend réussis, dont PostgreSQL/PostGIS
  isolés, et compilation TypeScript de production valide.
  Contrôle global mobile final réussi : 2 734 tests, zéro échec, un test Ruby
  ignoré sous Windows ; parité native, types, lint et frontières réseau valides.
  Aucun essai physique, déploiement ou push réel. Nouveau build Android requis.

## 2026-10-26 — Annonces sans compte et parrainage résistant aux coupures

- **Problème :** visiteurs sans compte non enregistrés pour les annonces ;
  invitation de parrainage consommée trop tôt après inscription et retry
  manquant après certaines réponses réseau perdues.
- **Appliqué :** abonnement facultatif par installation, annonces automatiques
  des versions déclarées disponibles et campagnes manuelles depuis l'admin,
  conservation du parrainage jusqu'à confirmation et reprise au premier plan.
  Périmètre, fichiers et mise en service dans
  [Annonces et parrainage](ANNONCES_INSTALLATIONS_PARRAINAGE_2026-10-26.md).
- **Conservé :** permissions système, refus des notifications, confidentialité
  des comptes, validation serveur des invitations et règles financières.
- **Vérifications :** contrôle global mobile réussi, 2 732 tests et un test Ruby
  ignoré ; 64 tests backend distincts dont PostgreSQL isolé, TypeScript backend
  de production et admin valides, deux tests admin réussis. Aucun push réel,
  déploiement ni essai sur appareil. Migration backend préparée, non appliquée
  hors des bases de test éphémères.

## 2026-10-26 — Paiement en jetons après bonus ou descente anticipée

- **Problème :** une subvention déjà créditée au conducteur en mode espèces
  pouvait faire rejeter le paiement ultérieur en jetons comme gain incohérent.
- **Appliqué :** transition comptable encadrée et transactionnelle dans
  `zwanga-backend`, conservation du même gain et des montants déjà arrêtés,
  message d'erreur compréhensible dans l'application. Fichiers et précautions
  dans [Paiement après subvention](PAIEMENT_JETONS_SUBVENTION_2026-10-26.md).
- **Conservé :** tarif réduit, bonus, commissions historiques, paiement mixte,
  espèces et parrainage. Les incohérences réelles restent bloquantes ; aucun
  double crédit du bonus, aucun changement de schéma ni modification native.
- **Vérifications :** 211 tests backend et 17 tests PostgreSQL isolés réussis ;
  compilation TypeScript de production backend valide. Contrôle global mobile
  réussi : 2 715 tests, zéro échec et un test Ruby ignoré sur Windows.
  Le contrôle TypeScript backend incluant tous les tests reste en échec dans
  des spécifications non modifiées. Aucun déploiement, paiement réel ou essai
  sur téléphone ; le correctif serveur doit encore être déployé.

## 2026-10-26 — Carte de notification avant le son et réveil Android borné

- **Problème :** sonnerie signalée en veille sans réveil et carte tardive. Le
  relais au premier plan pouvait démarrer le lecteur avant publication de la
  carte ; le réveil Notifee utilisait des verrous sans délai maximal.
- **Appliqué :** carte silencieuse publiée avant le lecteur de l'app, ancienne
  carte conservée pendant la préparation du canal, réveil natif après publication
  avec verrou d'écran limité à 1,5 seconde. Sources, tests et limites dans
  [Carte visible et réveil Android](ALERTE_VISIBLE_ANDROID_2026-10-26.md).
- **Conservé :** décisions, expiration, compte, mode silencieux, confidentialité
  et autorisation plein écran. Backend, iOS et profils EAS inchangés.
- **Vérifications :** contrôle global réussi, code 0 : 2 713 tests réussis,
  zéro échec et un test Ruby ignoré sur Windows ; TypeScript, ESLint, frontières
  réseau, taille et parité native valides. Les méthodes de réveil compilent
  contre le SDK Android 36 ; comportement vérifié avec services simulés.
  Nouveau build Android requis ; aucun essai sur appareil ni garantie de réveil
  universel. Résultats et recette détaillés dans la fiche.

## 2026-10-26 — Autorisations contextuelles plein écran et localisation

- **Problème :** proposition plein écran absente et confirmation de localisation
  observée hors application sur iOS. Le profil EAS détermine la présence du plein
  écran Android ; iOS peut différer sa propre confirmation de localisation.
- **Appliqué :** étapes d'autorisation indépendantes, historique enregistré après
  affichage réel, une relance bornée de lecture native, contrôle du premier plan
  juste avant les demandes système et attente sérialisée entre flux de trajet.
  Fichiers, précautions, limites système et recette dans
  [Autorisations contextuelles](AUTORISATIONS_CONTEXTUELLES_2026-10-26.md).
- **Conservé :** consentement explicite, première visite silencieuse, déclencheurs
  publication/retour de 15 secondes, rappels de 24 heures, suivi natif et cadence
  des trajets. Aucun profil EAS, fichier natif ou backend modifié.
- **Vérifications :** contrôle global final `check-release.cjs` réussi, code 0 :
  2 708 tests réussis, zéro échec, un test Ruby ignoré sur Windows. TypeScript,
  ESLint, frontières réseau, taille des sources et parité native valides ;
  `git diff --check` réussi. Les essais exécutent les modules JavaScript avec
  entrées/sorties natives simulées. Aucun essai sur téléphone physique ni nouveau
  build pendant cette intervention.

## 2026-10-26 — Reprise de sonnerie Android au déverrouillage

- **Problème :** sonnerie signalée comme interrompue au déverrouillage ou à
  l'ouverture. Tests reproduisant la perte d'un relais lors d'une transition
  d'état, d'une annulation lente et d'une lecture native défaillante.
- **Appliqué :** relais temporaire en mémoire avant annulation, reprise bornée
  sans nouvelle notification et reprise des alertes connues indépendante des
  lectures natives. Fichiers, protections et recette dans
  [Reprise Android du 26 octobre](SONNERIE_REPRISE_ANDROID_2026-10-26.md).
- **Conservé :** expiration métier, décisions explicites, contrôles de compte,
  permissions et mode silencieux ; aucun backend, fichier natif ou réglage modifié.
- **Vérifications :** 37 tests ciblés réussis avec modules JavaScript réels et
  entrées/sorties Android simulées, plus quatre tests temps réel. Le contrôle
  global final `check-release.cjs` termine avec le code 0 : 2 690 tests réussis,
  zéro échec, un test Ruby ignoré sur Windows ; TypeScript, ESLint, frontières
  réseau, taille et parité des sources natives valides. Le premier passage avait
  révélé dix échecs dus à une simulation de session incomplète dans
  `tests/rideAlertRestoration.test.js` ; cette simulation est adaptée et les dix
  tests passent. Aucun téléphone/émulateur connecté ; la continuité sonore sur
  les appareils concernés reste à valider physiquement.

## 2026-10-24 — Barre de recherche du conducteur en contour vert

- **Demande :** le fond vert plein de « Chercher un trajet » donnait l'apparence
  d'un bouton d'action, au lieu d'une barre de recherche.
- **Appliqué :** fond blanc, bordure verte, texte sombre, loupe et chevron verts
  dans `features/home/HomeTripsSheet.styles.ts` et `components/home/HomeTripsSheet.tsx`.
  Dimensions, position, zone tactile, libellé accessible et ouverture de `/search`
  conservés ; boutons de publication et de commande inchangés.
- **Vérifications :** contrôle existant adapté dans `tests/releaseAuditFixes.test.js`
  pour le contour vert et le contraste du texte. Les 36 tests JavaScript ciblés
  passent, dont les contrôles de navigation et de taille tactile ; ESLint ciblé
  et `git diff --check` réussis. Validation native visuelle non réalisée.

## 2026-10-24 — Déblocage du contrôle EAS de taille du parcours Didit

- **Problème :** le post-install EAS échouait au contrôle de taille :
  `hooks/useDiditKycFlow.ts` comptait 440 lignes pour une limite de 400.
- **Solution appliquée :** extraction de la confirmation des noms légaux dans
  `hooks/identity/useKycLegalIdentityConfirmation.ts` (74 lignes). Le hook
  `hooks/useDiditKycFlow.ts` conserve l'orchestration KYC en 377 lignes ; aucune
  exclusion ni augmentation de la limite du contrôle.
- **Comportements conservés :** confirmation obligatoire des noms, accès à la
  modification du profil, verrou contre les doubles lancements, annulation de
  l'attente à la sortie de l'écran et protections contre les callbacks tardifs.
  La reprise de session Didit, le choix SDK/navigateur et la décision KYC
  faisant autorité côté serveur restent inchangés. Aucun fichier natif,
  paramètre de plein écran, version de SDK ou fichier d'environnement modifié.
- **Vérifications :** 51 tests JavaScript ciblés réussis, dont sept nouveaux cas
  dans `tests/diditNativeFlow.test.js` couvrant confirmation, modification du
  profil, double clic, démontage, perte de focus, changement de compte et arrière-plan.
  Le contrôle de taille passe sur 1 192 sources, sans dépassement.
- **Second blocage détecté :** le premier contrôle global a ensuite signalé une
  référence de test périmée pour `releaseOverdueDriver`. Le changement `searchNow`
  était déjà présent dans le code, mais pas dans `tests/fixtures/sourceExtractions.json`.
  Seule cette référence est actualisée après revue du changement existant ; un
  test dans `tests/overdueRequestRecovery.test.js` vérifie les requêtes avec
  `searchNow: false`, `true` et l'ancien argument chaîne, ainsi que l'invalidation
  de la bonne demande. Les neuf tests concernés passent ; aucun endpoint modifié.
- **Contrôle global final :** `node scripts/check-release.cjs` termine avec le
  code 0 : parité des sources natives, TypeScript, ESLint, frontières réseau et
  taille des sources valides ; 2 676 tests réussis, zéro échec et un test Ruby
  ignoré faute de Ruby installé sur cette machine Windows. Le style de recherche
  demandé pendant cette exécution a aussi été revérifié séparément (entrée ci-dessus).
- **Limites :** SDK, navigation et cycle de vie simulés dans les tests JavaScript ;
  aucune session Didit réelle, compilation native ou exécution EAS distante.

## 2026-10-24 — Reprises de session/KYC et changement de conducteur

- **Session après réponse perdue :** `services/tokenStorage.ts` conserve dans
  SecureStore un identifiant UUID de tentative, repris par `tokenRefresh.ts`
  après coupure ou redémarrage et supprimé à la déconnexion. Le backend vérifie
  un reçu chiffré limité à deux minutes et l'état courant du compte. Les erreurs
  réseau ne sont toujours pas assimilées à une révocation. Aucun contournement
  d'un changement de PIN, d'une suspension ou d'une déconnexion.
- **Didit :** `hooks/useDiditKycFlow.ts` synchronise le dossier serveur avant de
  créer une session. Les parcours interrompus peuvent reprendre la session SDK
  correspondante conservée dans SecureStore par `services/diditSessionRecovery.ts`
  (fenêtre locale de lancement limitée à dix minutes et à l'expiration fournisseur).
  Après soumission SDK, seul le contexte de reprise est conservé, sans token ni
  URL. Une reprise après échec de synchronisation attend la décision existante au
  lieu de recréer une session. Une réponse serveur nulle ne devient jamais une
  approbation à partir du statut SDK. Le rafraîchissement secondaire de l'écran
  ne transforme plus une décision confirmée en échec KYC. Pas de bascule web
  automatique ni de modification de fournisseur.
- **Conducteur en retard :** `useOverdueRequestNotification.ts` propose
  « Relancer pour 30 min » (`searchNow: true`). « Modifier date/heure » envoie
  `searchNow: false` : le conducteur est libéré, sans recherche avant la validation
  des nouveaux horaires. Navigation et style existants conservés.
- **Vérifications :** 441 tests JavaScript ciblés/44 fichiers et TypeScript sans
  émission. Tests ajoutés pour changement d'horaires, réponse perdue, persistance
  après rechargement, session SDK interrompue et dossier soumis avec synchronisation
  indisponible. Simulation couplée aux vrais services backend réussie : deux
  requêtes, une rotation, aucune déconnexion. Stockage et SDK simulés ; aucun test
  natif, prestataire payant ni mesure de chauffe/fluidité sur téléphone.
- **Ordre requis :** déployer d'abord le backend acceptant `requestId` et `searchNow`,
  puis cette version mobile. Les anciens clients restent acceptés par le nouveau
  backend, mais ne bénéficient pas de la reprise de renouvellement. Aucun `.env`,
  dépendance, profil EAS, manifeste, CI/CD, infrastructure ou publication modifié.

## 2026-10-24 — Correction du plein écran et tests du backend local

- **Problème :** l'activité plein écran s'ouvrait sans le Bundle Notifee attendu
  puis se fermait ; essais backend désormais autorisés par l'utilisateur.
- **Solution :** action Notifee utilisant la racine Expo existante `main`,
  remplacement d'invitation via `onNewIntent` et protection des anciens callbacks
  de déverrouillage. Sources, comportement préservé et recette détaillés dans
  [Correction plein écran et tests locaux](PLEIN_ECRAN_CORRECTION_TESTS_2026-10-24.md).
- **Tests :** 197 tests backend réussis, dont suites PostgreSQL/PostGIS jetables,
  aucun push réel. Les 21 scénarios Android passent, dont les boutons du plein
  écran. Contrôle global réussi : 2 659 tests réussis, zéro échec, un test Ruby
  iOS ignoré ; TypeScript, lint et parité native réussis. Détails dans le rapport.
- **Précautions :** aucun backend métier, `.env`, compte réel, manifeste de
  production, profil EAS ou déploiement modifié. Le banc Android n'est pas
  le client React Native complet ; iOS et téléphones physiques non testés.

## 2026-10-24 — Audit local et banc Android des alertes conducteur

- **Périmètre/problème :** vérifier sonnerie, réveil, carte, plein écran et entrée
  dans l'application pour demandes proches/réservations, après les retours terrain.
  L'utilisateur a limité l'audit aux simulations locales.
- **Appliqué :** banc séparé sans Internet `tests/android/ride-alert-harness/`,
  runner `scripts/audit-android-alerts.cjs` et
  [rapport détaillé](AUDIT_ALERTES_EMULATEUR_2026-10-24.md). Aucun correctif
  fonctionnel de l'application dans cette intervention.
- **Résultat :** gate global réussi, 2 655 tests réussis et un test Ruby ignoré.
  Les essais Android natifs reproduisent une activité plein écran recevant un
  intent sans données, puis se fermant. Le réveil et le lecteur natif fonctionnent
  dans le banc ; le relais JS et la fiche y sont des adaptateurs de test.
- **Conservé/limites :** aucune demande ou décision réelle, aucun accès serveur,
  aucune modification de l'APK Zwanga installé ni des travaux précédents. Aucun
  essai iOS ou téléphone physique, aucune certification de disponibilité ni
  de disparition des crashs. Résultats et précautions détaillés dans le rapport.

## 2026-10-24 — Réduire les attentes du relais sonore Android à l'ouverture

- **Problème :** retour terrain avec écran restant éteint, son interrompu au
  déverrouillage et carte aperçue tardivement dans l'application. Le code attendait
  les deux lecteurs de notifications puis la présentation de la carte avant de
  transmettre l'alerte au lecteur sonore applicatif ; cause matérielle non établie.
- **Appliqué :** traitement indépendant des lecteurs, reprise après annulation du
  son système sans attendre la carte, suppression d'une création de canal inutile,
  contrôles de réveil/plein écran parallèles et relais unique lors d'un retour en
  veille. Détails et fichiers dans
  [Relais sonore Android](SONNERIE_ANDROID_RELAIS_2026-10-24.md).
- **Conservé :** comptes, décisions, consentements, canaux personnalisés,
  confidentialité, échéances sonores et priorité serveur avant navigation.
  Aucun changement natif, backend, configuration ou déploiement dans ce complément.
- **Vérifications :** 247 tests ciblés réussis, TypeScript, ESLint ciblé, parité
  native, taille des sources et `git diff --check` réussis. Modules réels avec
  entrées/sorties natives simulées ; tests Java isolés existants également relancés.
  Pas de push réel, de build complet ni d'essai sur téléphone. Le réveil de l'écran
  et la continuité sonore sur le modèle signalé restent à valider.

## 2026-10-24 — Parcours alerte conducteur identifiable, de la veille à la demande

- **Problème :** origine de la sonnerie peu explicite, plein écran générique,
  contexte d'entrée perdu après la fenêtre sonore ou lors d'un toucher tardif.
- **Appliqué :** cartes identifiées Zwanga, candidats de navigation séparés des
  alertes sonores, traitement du toucher après reprise, récapitulatif natif après
  déverrouillage et protection des doubles appuis. Fichiers et recette dans
  [Parcours alerte conducteur](PARCOURS_ALERTE_CONDUCTEUR_2026-10-24.md).
- **Conservé :** contrôle serveur avant redirection, priorité aux trajets en cours,
  décisions explicites, confidentialité sur écran verrouillé, consentement plein
  écran et échéances. Aucun backend, flag de production ou déploiement modifié.
- **Vérifications :** 217 tests ciblés réussis, TypeScript/ESLint/parité native et
  contrôles statiques réussis. Activité Java compilée contre le SDK Android avec
  pont substitué ; méthodes testées avec services simulés, sans build Gradle ni
  téléphone physique. Nouveau build Android requis ; le réveil de tous les modèles
  n'est pas garanti et le cas terrain n'est pas déclaré résolu.

## 2026-10-23 — Relais sonore iOS au déverrouillage et écran éteint Android

- **Problème :** sonnerie signalée comme définitivement coupée à l’ouverture
  d’une notification iOS ; absence de réveil sur certains Android.
- **Appliqué :** conservation du toucher en arrière-plan, reprise immédiate des
  alertes iOS connues, surveillance du lecteur Expo et prise en compte de l’écran
  Android éteint sans verrouillage. Fichiers et précautions dans
  [Reprise après veille](SONNERIE_REPRISE_VEILLE_2026-10-23.md).
- **Conservé :** décisions explicites, délais d’expiration, permissions, consentement,
  silencieux/Ne pas déranger et absence de sonnerie iOS applicative en arrière-plan.
  Aucun backend ni déploiement modifié ; nouveau binaire requis pour le Java Android.
- **Vérifications :** 160 tests ciblés réussis (dont méthode Java compilée avec
  substituts), TypeScript, parité native et contrôles statiques réussis. ESLint sans erreur,
  deux avertissements préexistants. Pas d’essai natif sur les appareils concernés,
  ni garantie de réveil universel ; suite globale non relancée.

## 2026-10-23 — Retrait du bandeau de synchronisation sur l’accueil

- **Problème :** le message « Mise à jour indisponible » était confondu avec une
  mise à jour de l’application et encombrait l’accueil.
- **Solution/fichiers :** `components/home/EntrySyncBanner.tsx` ne rend plus
  les états de synchronisation seuls (chargement, échec, hors connexion), ni leur
  bouton « Réessayer ». Aucun espace vide ne remplace le bandeau.
- **Conservé :** vérifications serveur, diagnostics et redirections automatiques
  inchangés. Les actions vers une activité vérifiée (« Reprendre mon trajet »,
  « Voir la réservation », « Voir la demande ») restent accessibles. Aucun ajout
  de requête, de minuterie ou de relance automatique ; aucun changement natif
  ou backend. Le retrait du message ne corrige pas la cause d’un échec réseau.
- **Vérifications :** 48 tests JavaScript ciblés réussis (`entryViews`,
  `entryPresentation`, `rideEntryCoordinator`, `requestEntryResume`), dont absence
  du bandeau pour les quatre combinaisons échec/hors connexion et maintien des
  trois actions utiles. TypeScript sans émission, ESLint ciblé et contrôle des
  espaces du diff réussis. Pas d’essai sur appareil Android/iOS ; suite globale
  non relancée.

## 2026-10-23 — Passage aux espèces pendant un complément Mobile Money bloqué

- **Problème :** attente du complément d’un paiement en jetons empêchant tout
  choix cash, même quand le passager n’avait pas validé l’opération Mobile Money.
- **Appliqué :** bouton cash explicite avec montant total, commande serveur
  idempotente, choix cash durable et protection contre un débit de jetons tardif.
  Les recharges restent suivies et créditables dans le portefeuille, sans repayer
  le trajet. Fichiers, migration préparée et limites dans
  [Bascule jetons vers espèces](PAIEMENT_BASCULE_JETONS_ESPECES_2026-10-23.md).
- **Conservé :** règles de commission/parrainage cash, confirmation d’encaissement
  par le conducteur, paiement mixte existant, protection des collectes directes
  encore indéterminées. Aucun déploiement ni modification de base existante.
- **Vérifications :** 136 tests JS ciblés et 155 tests backend réussis, dont
  PostgreSQL isolé et commissions réelles ; trois cas de compatibilité ignorés.
  TypeScript, ESLint ciblé et contrôles statiques réussis ; sept aperçus web
  validés. Pas d’essai natif ni paiement opérateur réel, suites globales non relancées.

## 2026-10-23 — Fenêtre de paiement lisible et fermable pendant la vérification

- **Problème :** capture avec accueil assombri, panneau replié et seul bouton
  « Un instant… » ; enfant flexible dans une feuille sans hauteur définie et
  action de changement de paiement qui ne faisait que revérifier le résultat.
- **Solution/fichiers :** hauteur explicite et plafonnée dans
  `components/PassengerArrivalPaymentCoordinator.tsx`, fiche recentrée sur le
  montant/état/action dans `features/arrival-payment/ArrivalPaymentRecovery.tsx`,
  fermeture toujours accessible et actions défilables. Détails et précautions :
  [Récupération des paiements](PAIEMENT_RECUPERATION_MOBILE_MONEY.md#2026-10-23--correction-de-la-fenêtre-repliée-et-des-actions-ambiguës).
- **Conservé :** pas de second paiement si le résultat est inconnu, espèces
  soumises au serveur, références conservées à la fermeture, reçus et interruptions
  inchangés. Aucun changement backend/natif ni déploiement.
- **Vérifications :** 103 tests ciblés réussis, TypeScript/ESLint ciblé et contrôles
  statiques réussis. Cinq aperçus avec composants réels et données fictives,
  moteur React Native Web : fermeture visible et actions accessibles, y compris
  petit écran, grandes polices et paysage. Cela ne valide pas le rendu natif ;
  essais Android/iOS physiques encore nécessaires. Suite globale non relancée.

## 2026-10-23 — Correctifs après audit des modifications natives Android/iOS

- **Périmètre :** arrêt du GPS conducteur malgré échec d'effacement disque,
  surveillance native de la sonnerie, relais plein écran soumis aux autorisations,
  conservation des sources Android et des réglages iOS à la régénération Expo.
- **Solution et fichiers :** voir
  [Correctifs de fiabilité native](CORRECTIFS_FIABILITE_NATIVE_2026-10-23.md),
  incluant les précautions entre trajets et les tests de non-régression.
- **Vérifications :** `node scripts/check-release.cjs` réussi : concordance native,
  TypeScript, ESLint, frontières réseau, taille des sources et 2 615 tests réussis,
  aucun échec, un test Ruby ignoré (outil absent sur cet environnement Windows).
  Le lecteur Java a été compilé/exécuté avec substituts Android/RN, pas sur appareil.
  Contrôle du patch GPS, configuration de toolchain iOS et `git diff --check` réussis.
  La référence de styles du paiement a été actualisée pour le seul style espèces
  ajouté précédemment, après vérification que les 84 anciens styles sont inchangés.
- **Limites :** Pods iOS non résolus sur Windows, lock non fabriqué ; commande
  macOS `npm run prepare:ios-native` renforcée. Nouveau binaire Android nécessaire.
  Le contrôle des Pods reste en échec attendu : Didit/Crashlytics absents du lock local.
  Aucun déploiement ni validation de crash/chauffe sur appareils physiques.

## 2026-10-23 — Cohérence avec le backend : retraits, chat, sockets et notifications

- **Problème :** absence de clé durable sur les retraits de parrainage,
  `server_restart` ignoré, messages HTTP non diffusés par le backend et
  notifications financières/KYC sans rafraîchissement ni destination adaptée.
- **Retraits :** `services/referralWithdrawalIntent.ts`,
  `hooks/referrals/useReferralActions.ts`, `store/api/referralApi.ts` et
  `types/referrals.ts` conservent par compte une intention AsyncStorage avant
  tout POST. Une réponse perdue reprend le même UUID, montant et destinataire,
  même si le solde a déjà été réservé. Après obtention de l'ID, la vérification
  lit le retrait existant. Seul un résultat terminal cohérent ou un premier
  refus de validation explicite libère l'intention. Le bouton de `app/referrals.tsx`
  devient « Vérifier mon retrait » tant qu'elle subsiste, sans changement de style.
  Aucune nouvelle tentative automatique de versement au montage de l'écran.
- **Temps réel :** `services/socketRestartRecovery.ts` est partagé entre chat
  et tracking : reprises temporisées, backoff/jitter, cinq tentatives maximum
  par épisode, nettoyage à la fermeture et arrêt sur révocation de session.
  Les rooms existantes sont rejointes à nouveau. `useChatRealtime` recharge
  les messages sauvegardés après reconnexion et conserve la déduplication.
- **Notifications :** `features/notifications/notificationEffects.ts` centralise
  les tags REST et destinations utilisés par `NotificationHandler` et la boîte
  de notifications. Retraits, ajustements administratifs, commissions, paiements,
  décisions KYC et anciens push de chat sont pris en compte. Les statuts/rôles
  KYC restent issus de REST, jamais d'un rôle annoncé dans une notification.
- **Didit :** `identityContracts`, `diditLaunchPolicy` et `useDiditKycFlow`
  acceptent le champ additif `launchMode` du backend. Le SDK demeure prioritaire
  en mode normal ; seul `hosted` explicite autorise le navigateur natif. L'URL
  HTTPS Didit est contrôlée. Aucun second KYC créé sur erreur/expiration du SDK.
- **Compatibilité :** aucun changement de style, de règle financière, de CI/CD,
  d'infrastructure, ni publication. Les anciens appels mobiles orphelins sont
  conservés ; leur suppression exige une validation séparée pour ne pas casser
  un contrat hérité. Les correctifs de handlers nécessitent une version mobile
  mise à jour ; les versions déjà installées ne changent pas avec le backend seul.
- **Vérifications :** 494 tests JavaScript réussis dans 45 fichiers ciblant reprises après fermeture/coupure,
  clés stables, stockage indisponible, changement de compte, notifications réelles
  des handlers, SDK/repli explicite et nettoyage des sockets ; TypeScript sans
  émission réussi. Deux fixtures de chat ont été complétées pour simuler le
  nouvel abonnement de reconnexion et l'invalidation du cache ; la réexécution
  élargie est entièrement verte. Aucune opération financière réelle ni recette sur appareils
  Android/iOS physiques ; les tests simulés ne prouvent pas les performances natives.

## 2026-10-23 — Paiement bloqué : parcours court et reprise serveur

- **Problème :** le formulaire grisé après une réponse Mobile Money perdue
  n'expliquait pas quoi faire. Une recharge sans référence pouvait rester
  bloquée et un ancien refus empêchait aussi le paiement mixte côté serveur.
- **Solution appliquée :** une fiche courte remplace le formulaire pendant la
  vérification. Après un refus confirmé, elle propose directement « Payer
  [montant] en espèces » si le trajet l'autorise, ou un autre moyen de paiement.
  La reprise utilise un nouvel endpoint authentifié dans `zwanga-backend`,
  sans nouvelle demande de débit. Une tentative jamais envoyée est clôturée
  avec sa clé originale ; un paiement réellement en attente reste protégé.
- **Fichiers, précautions, recette et livraison :**
  [Paiement : récupération après réponse perdue](PAIEMENT_RECUPERATION_MOBILE_MONEY.md).
  La composition courte, sans nouvelle animation, suit `frontend-skill` ;
  l'arbitrage par référence unique et l'absence d'appel fournisseur sous verrou
  suivent `supabase-postgres-best-practices`.
- **Vérifications :** 95 tests JavaScript mobiles ciblés, 158 tests serveur
  unitaires/services et 11 tests PostgreSQL isolés réussis. Les contrôles
  TypeScript mobile et build backend, lint mobile ciblé, frontière réseau,
  taille des sources et diff sont détaillés dans la fiche liée. Les tests
  n'attestent pas d'un paiement réel ni du rendu sur appareil.
- **Livraison :** correctifs locaux uniquement. Livrer le backend avant le
  mobile ; pas de nouvelle migration pour cette reprise. Aucun déploiement,
  paiement prestataire réel, changement de `.env` ou accès à la production.
  La migration mixte antérieure demeure un prérequis si elle n'est pas livrée.

## 2026-10-23 — Proposer les espèces après un échec Mobile Money

- **Constat et périmètre :** dans le règlement d'un trajet, le choix des espèces
  existait mais n'était pas mis en avant après un refus Mobile Money. Le signal
  d'échec en mémoire disparaissait à la réouverture, même si la réservation
  portait encore un statut serveur `failed` ou `cancelled`. Une lecture des
  moyens de paiement échouée invitait à fermer puis rouvrir la fiche.
- **Solution appliquée :** `features/arrival-payment/ArrivalPaymentFields.tsx`
  place le choix « Payer en espèces » en premier après un échec confirmé, avec
  le montant total à remettre au conducteur et l'instruction de valider en bas.
  Pour un complément en jetons, le choix existant devient explicitement
  « Compléter en espèces ». Le choix ne déclenche aucun paiement : la validation
  reste explicite. Les styles sont dans
  `features/screen-styles/components/PassengerArrivalPaymentCoordinator/compact.styles.ts`.
- **Reprise et disponibilité :** `hooks/arrival-payment/useBookingPaymentMode.ts`
  restaure la suggestion à partir d'un échec serveur à la réouverture, sans
  remplacer le choix du passager. La fiche permet de réessayer sa lecture des
  moyens de paiement sur place ; un cache dont la dernière lecture a échoué
  n'autorise pas un nouveau choix, y compris pour le complément en espèces.
- **Précautions conservées :** seuls les moyens acceptés/disponibles renvoyés
  par le backend sont proposés. Les espèces restent indisponibles avant
  l'arrivée. Une référence de paiement, une recharge ou un règlement mixte
  non résolu verrouille toujours le changement ; un timeout ou une erreur HTTP
  n'est pas une preuve de refus. Un paiement confirmé ne peut pas être changé.
  Le choix intégral en espèces ne débite pas les jetons ; le choix mixte utilise
  le circuit existant. La confirmation de réception du cash par le conducteur
  et le calcul du parrainage sur la part espèces sont inchangés.
- **Vérifications :** tests comportementaux dans
  `tests/arrivalPaymentCashFallback.test.js`, `tests/arrivalPaymentModeRecovery.test.js`
  et `tests/arrivalPaymentSubmission.test.js` : ordre/texte des choix, absence
  de débit au simple choix, reprise après refus, complément mixte sans seconde
  recharge, paiement en attente, état déjà payé, absence d'éligibilité,
  lecture échouée puis reprise. **82 tests JavaScript ciblés réussis, zéro échec**
  avec les suites de reprise, de suivi, de stockage et d'idempotence.
  TypeScript sans émission, ESLint ciblé, frontière réseau, limite de taille
  des sources et `git diff --check` vérifiés sans erreur.
- **Limites :** pas de paiement réel, de test visuel sur appareil Android/iOS
  ni de build natif exécuté pour ce changement. Le refus opérateur puis le
  règlement cash restent à valider sur téléphone. Aucun changement backend,
  déploiement, migration ou modification de `.env` dans cette intervention.

## 2026-10-23 — Correctifs après l'audit global : reprises de paiement et contrôles de livraison

- **Constats :** les initiations de recharge (portefeuille et complément d'un
  trajet en jetons) n'envoyaient pas la clé d'idempotence déjà acceptée par le
  backend. Une réponse perdue permettait une seconde initiation indépendante.
  Les lectures/écritures du stockage des paiements n'avaient pas de délai maximal.
  Le contrat de test de `bookingApi` ne recensait pas le nouveau paiement mixte.
- **Protection appliquée :** `features/wallet/topUpIntent.ts` conserve une
  intention par compte et contexte avant tout POST. `store/api/walletApi.ts`
  transmet le même UUID sur reprise ; le champ local `intentScope` n'est pas
  envoyé au serveur. Une intention incertaine n'est ni remplacée par un autre
  montant/téléphone ni supprimée sur timeout. Seul un résultat terminal corrélé
  à la clé ou à la référence permet sa libération. Le contrôle serveur existant
  dans `zwanga-backend/src/payments/topup-payment-claim.ts` reste indispensable ;
  aucun nouveau déploiement serveur, migration ou paiement réel n'est effectué.
- **Parcours mobile :** `useArrivalPaymentSubmission`, `useArrivalPaymentState`,
  `useArrivalPaymentMonitoring`, `useBookingPaymentMode`, `PassengerArrivalPaymentCoordinator` et
  `paymentTypes` retiennent le complément sans référence reçu, verrouillent les
  autres paiements et proposent la reprise explicite du montant original.
  `useWalletTopUpActions`, `useWalletTopUpMonitoring`, `useWalletController`,
  `useWalletTopUpIntentRecovery` et `WalletTopUpModal` protègent les doubles
  appuis, restaurent les paramètres et indiquent « Vérifier la recharge ».
  Aucun débit n'est lancé automatiquement à l'ouverture de ces écrans.
- **Stockage borné :** `paymentStorage.ts`, `paymentRetention.ts`,
  `usePaymentPersistence` et `useWalletTopUpStorage` bornent l'attente à huit
  secondes et conservent les verrous des opérations natives non terminées.
  Une lecture échouée/corrompue ne devient pas un cache vide permettant un
  nouveau paiement. La fiche propose une nouvelle vérification ou la fermeture.
  Les écritures sont regroupées sur le dernier état ; les reprises ne font pas
  concourir une ancienne écriture avec une nouvelle. Un pont natif définitivement
  bloqué peut encore nécessiter un redémarrage : le délai JavaScript ne répare
  pas le stockage natif.
- **Contrats et iOS :** référence `tests/fixtures/sourceExtractions.json`
  complétée pour `payTokensCash`, avec test explicite du corps HTTP, du mapping,
  du délai et des invalidations dans `mixedCashPayment.test.js`.
  `scripts/prepare-ios-native.cjs` / `npm run prepare:ios-native` enchaînent,
  uniquement sur macOS, le contrôle Xcode, `pod install`, puis le contrôle des
  Pods Didit/Crashlytics. Aucun `Podfile.lock` n'est fabriqué à la main, et le
  contrôle EAS n'est pas désactivé. Le lock local reste à régénérer sur macOS.
- **Comportements conservés :** paiement intégral en jetons, carte, espèces,
  complément jetons + espèces, confirmation conducteur séparée et parrainage
  calculé sur la part espèces uniquement. Les changements déjà présents dans
  le dépôt ont été conservés. Aucun changement de `.env`, de secrets ou de base.
- **Vérifications :** nouveaux tests de coupure/réouverture, identité du compte,
  double appui, restauration des paramètres, délais et écritures natives tardives,
  ainsi que tests du contrat RTK Query et du script macOS avec commandes simulées.
  Suite mobile complète : **2 542 réussis, zéro échec, un ignoré** (Ruby absent),
  299 fichiers de tests. Après le dernier ajustement de restauration du mode
  jetons et l'ajout du cas de remontage pendant une écriture native, nouvelle
  exécution ciblée : **114 réussis, zéro échec**. Backend non modifié pendant ce
  correctif : **53 tests réussis** dans `topup-payment-claim`, `wallet-topup-proof`
  et `wallet-topup-decline`, sans base ni fournisseur réels. TypeScript sans
  émission, ESLint mobile (erreurs), frontière réseau, taille des sources et
  `git diff --check` contrôlés. Ces tests JavaScript ne certifient pas un paiement
  prestataire réel ni l'absence de crash/chauffe sur appareil.
- **Limites différées :** le lint global du backend n'a pas été reformatté en
  masse (15 511 erreurs relevées à l'audit, dont beaucoup de formatage). La
  synchronisation CocoaPods et les essais release sur iPhone/Android restent
  nécessaires ; un fournisseur sans référence exploitable demande encore une
  réconciliation serveur avant de libérer une recharge incertaine.

## 2026-10-22 — Complément espèces d'un paiement en jetons

Le paiement mixte est préparé dans l'application et `zwanga-backend` : après
l'arrivée, choix explicite du complément espèces, débit atomique des jetons,
reliquat à remettre au conducteur et confirmation cash séparée. Reprise
idempotente après coupure ; aucun appel Mobile Money dans ce nouveau parcours.
Le parrainage reste calculé uniquement sur les espèces confirmées, selon le
choix de l'utilisateur. Les paiements existants et leurs contrôles sont conservés.

Contrat, fichiers, précautions, résultats de tests, migration additive et limites
détaillés dans [Paiement mixte jetons et espèces](PAIEMENT_MIXTE_JETONS_ESPECES.md).
Aucun déploiement ni modification de base de production ; validation sur
téléphones Android/iOS et environnement de test encore nécessaire.

## 2026-10-22 — Vérification du complément Mobile Money d'un paiement en jetons

- **Signalement / constat :** après sélection du mode jetons avec solde
  insuffisant, la fenêtre présente « Vérification indisponible ». Dans le code,
  la sélection seule ne débite rien ; une validation explicite lance l'achat des
  jetons manquants, puis le règlement du trajet après confirmation. L'inspection
  du backend a identifié un contrôle exigeant une preuve complète de crédit
  même pour une réponse FlexPay non finale correctement corrélée à la recharge.
  L'absence de numéro de commande dans cette réponse pouvait produire une erreur
  HTTP 400 et interrompre la vérification mobile. La capture ne contient pas la
  réponse HTTP réelle : ce défaut est identifié et testé, mais son occurrence
  exacte sur le téléphone signalé n'est pas prouvée.
- **Backend autorisé, sans déploiement :** dans le dépôt voisin,
  `src/payments/wallet-topup-check-evidence.ts` et `payments.service.ts`
  distinguent réussite, refus et attente. Une attente doit toujours correspondre
  à la référence ou au numéro de commande existant et ne peut ni créditer les
  jetons ni devenir un refus. Les montants/devises présents restent contrôlés.
  La preuve complète obligatoire pour réussir et créditer une recharge est
  inchangée. Pas de migration, modification de solde ou appel réel au prestataire.
- **Mobile :** `hooks/arrival-payment/useArrivalPaymentMonitoring.ts` distingue
  « complément Mobile Money en attente » de « recharge confirmée, règlement du
  trajet à vérifier ». Un échec du règlement après recharge confirmée n'est plus
  présenté comme une indisponibilité de vérification de la recharge.
  `features/arrival-payment/ArrivalPaymentFields.tsx` affiche « Jetons à utiliser »
  au lieu de laisser croire que le débit est déjà effectué.
- **Protections conservées :** même référence lors de la reprise, double appui
  bloqué, aucun nouveau débit déclenché par l'ouverture du formulaire,
  vérification bornée à deux minutes avec lectures espacées, conservation de
  l'ordre sur timeout/erreur réseau et interdiction de passer au cash tant que
  le résultat Mobile Money est incertain. Un refus confirmé peut libérer ce
  verrou. Le mode cash actuel porte sur tout le trajet : aucun nouveau paiement
  mixte jetons/espèces ni déduction partielle n'est introduit.
- **Vérifications :** 52 tests mobiles `arrivalPayment*.test.js` et 164 tests
  backend ciblés réussis (9 suites : recharge, preuve, prestataire, rapprochement,
  portefeuille, reçus cash et paiement avant arrivée). Régressions ajoutées dans
  `tests/arrivalPaymentSubmission.test.js`, `tests/arrivalPaymentVerification.test.js`
  et `src/payments/wallet-topup-decline.spec.ts`. TypeScript mobile et compilation
  backend de production sans émission validés ; ESLint mobile ciblé, frontières
  réseau, taille des sources et `git diff --check` validés. Le lint backend n'est
  pas globalement vert : comparaison avec HEAD sur les trois fichiers concernés,
  119 diagnostics préexistants dans `payments.service.ts`, 8 dans l'ancienne
  fixture de test, zéro dans le helper, aucun diagnostic ajouté par ce correctif.
- **Limites / livraison :** tests unitaires avec prestataire, stockage et base
  simulés ; aucun débit réel, essai sur appareil ou déploiement. Le backend
  corrigé doit être déployé pour modifier la réponse serveur, puis l'application
  mise à jour pour les nouveaux libellés. Une véritable panne du prestataire ou
  une réponse incohérente continue volontairement de bloquer une seconde tentative
  de paiement. Ne pas supprimer manuellement une référence pour contourner ce verrou.

## 2026-10-22 — Correctifs de l'audit GPS, temps réel et confirmations de navigation

- **Périmètre / problèmes constatés :** la présence conducteur au premier plan
  ne relisait pas la désactivation locale avant l'envoi GPS. Des appels natifs
  sans échéance pouvaient immobiliser une file de travail ou un abonnement de
  secours. À la restauration Android, le cast `timeInterval as? Long` ne
  conservait pas les valeurs numériques restaurées sous forme d'`Integer`.
  Les événements socket dupliqués invalidaient largement les caches, et le
  contrôle des bibliothèques Android ne couvrait pas le profil `ride-alerts-test`.
  L'utilisateur demande également de remplacer les modals de résultat des
  confirmations manuelles d'embarquement et d'arrivée par des toasts.
- **Consentement GPS :** `components/DriverPresenceCoordinator.tsx`,
  `services/nearbyDriverLocation.ts` et `services/nearbyDriverPositionDelivery.ts`
  vérifient le choix local avant la collecte de présence et avant l'envoi.
  Une lecture disque devenue obsolète ne peut plus écraser une désactivation
  récente, y compris lorsqu'elle se termine dans la même génération de travail.
  La lecture du choix local n'attend plus la file des mutations natives.
- **Appels natifs bornés :** `services/locationNativeDeadline.ts` introduit une
  échéance de 8 secondes par attente, utilisée dans les services ci-dessus,
  `services/background/driverGpsProfile.ts`,
  `services/background/passengerGpsProfile.ts` et `services/rideLocationStream.ts`.
  Un démarrage ou une écriture expirés gardent leur verrou jusqu'à leur véritable
  fin et leur nettoyage compensatoire ; une nouvelle tentative ne lance pas de
  mutation concurrente sur la même ressource. Un abonnement de secours créé
  tardivement est supprimé et ses callbacks obsolètes sont ignorés. L'échéance
  est celle d'une attente, pas une garantie de durée globale du parcours.
- **Cadence Android restaurée :**
  `scripts/patch-expo-location-batches.cjs` corrige la conversion en
  `(map["timeInterval"] as? Number)?.toLong()` dans `LocationArguments.kt` de
  l'Expo Location installé. Le patch est idempotent, appliqué par le postinstall
  existant, et refuse une source amont non reconnue. Le contrôle `--check`
  couvre aussi ce fichier. Le profil de proximité reste à trois minutes et
  les profils plus rapides pendant le trajet restent inchangés.
- **Temps réel :** `hooks/notifications/useRideRealtime.ts` déduplique les
  événements entrants par identifiant pendant 60 secondes, avec 256 entrées au
  maximum. `features/notifications/rideRealtimeRefresh.ts` cible les listes et
  détails concernés ; les invalidations sont regroupées sur une seconde.
  L'affichage de l'invitation et l'arrêt d'une alerte terminée restent immédiats ;
  la reconnexion conserve une relecture plus large. Aucun polling ajouté.
- **Navigation passager et conducteur :**
  `features/ride-recovery/RideActionResult.tsx` affiche désormais
  `RideActionResultToast.tsx`. L'ancien `RideActionResultModal.tsx` et ses styles
  dédiés sont retirés (récupérables dans Git). Le toast se ferme automatiquement
  après 5 secondes, ou 8 secondes pour une erreur, avec fermeture manuelle
  facultative. Il n'occupe pas la file des overlays et ne retarde pas paiement
  ou SOS. Une sauvegarde locale, une réponse reçue et une étape confirmée par
  le serveur restent trois états distincts ; aucun paiement n'est déduit de
  l'embarquement ou de l'arrivée.
- **Garde-fous conservés :** refus des doubles appuis, persistance hors ligne,
  identité du compte et de la réservation, validations des deux participants,
  désaccords, contrôles serveur et permissions système. Les confirmations
  d'annulation, de sécurité et de paiement ne sont pas supprimées. Aucun
  changement des horaires GPS métier, du backend ou des secrets de configuration.
- **Build Android :** `scripts/validate-android-native.cjs` contrôle maintenant
  les artefacts EAS `ride-alerts-test` comme ceux de `production`. Un artefact
  manquant ou incomplet ne peut plus être ignoré par ce profil de test.
- **Vérifications exécutées :** suite complète Node avec concurrence limitée à
  deux : **2 514 tests réussis, zéro échec, un ignoré** (Ruby absent pour le test
  d'exécution de la politique CocoaPods). Après la dernière protection contre
  la lecture GPS obsolète, **48 tests ciblés réussis**, incluant ce nouveau cas,
  les toasts, leurs cycles de vie et les abonnements GPS retardés. Les tests
  dédiés couvrent aussi échéance native, nettoyage tardif, absence de mutation
  concurrente, consentement, rafales socket, patch numérique et profil EAS.
  TypeScript sans émission, ESLint global en mode erreurs, contrôle des frontières
  réseau, contrôle de taille des sources, patch natif installé et
  `git diff --check` validés. Ces résultats sont des contrôles automatisés locaux :
  les tests de hooks simulent les bridges ; le test Java des buffers utilise un
  substitut de Bundle, pas un appareil Android.
- **Limites et reste à faire :** le contrôle iOS échoue encore réellement sur
  le `ios/Podfile.lock` versionné : pods Crashlytics et Didit 4.9.1 absents.
  Ce verrou n'est pas fabriqué manuellement et le contrôle bloquant est conservé.
  Sur macOS, exécuter `pod install` dans `ios`, puis
  `npm run check:ios-crashlytics` à la racine et conserver le lock généré après
  vérification. Un nouveau build Android est nécessaire pour embarquer le patch
  Kotlin ; aucune OTA seule ne le remplace. Aucun build distant, déploiement,
  mesure de batterie ou essai physique Android/iOS effectué dans ce correctif.
  Un bridge natif définitivement bloqué ne peut pas être annulé depuis JavaScript :
  les appels suivants échouent avec délai borné au lieu de se superposer, mais
  la récupération native reste nécessaire. Tester sur appareils le retour de
  veille, les changements de compte, la désactivation GPS, l'embarquement et
  l'arrivée hors ligne puis reconnectés. Aucune disparition des crashs ou de la
  chauffe n'est certifiée par ces tests.

## 2026-10-22 — Autorisations conducteur proposées au bon moment

Remplacement du raccourci de localisation clignotant sur l'accueil par des modals
contextuels : première publication réussie observée sur l'installation, ou visite
suivante après 15 secondes au premier plan. Localisation puis plein écran Android,
sans empilement de fenêtres natives ni requête HTTP supplémentaire. Report par
autorisation de 24 heures et priorité conservée aux trajets/demandes/paiements.
Fichiers, tests exécutés et limites dans
[Autorisations contextuelles](DEMANDES_ENTRANTES_LOOPS_2026-10-22.md#autorisations-contextuelles--22-octobre-2026).

## 2026-10-22 — Activation des alertes natives pour les builds de test

Profil EAS `ride-alerts-test`, application effective du manifeste Android versionné
et consentement plein écran avec relecture de l'autorisation système au retour.
Fichiers, précautions, commandes et résultats dans
[Activation pour les tests](DEMANDES_ENTRANTES_LOOPS_2026-10-22.md#activation-pour-les-tests--22-octobre-2026).
Le profil production reste inchangé ; aucun build distant ni déploiement lancé.

## 2026-10-22 — Demandes entrantes Android/iOS : intégration par boucles

Contrat, modifications, résultats exécutés et limites natives sont suivis dans
[Demandes entrantes — boucles de validation](DEMANDES_ENTRANTES_LOOPS_2026-10-22.md).
Périmètre : mobile et backend voisin autorisé, sans déploiement.

## 2026-10-22 — Pause des alertes de proximité après quatre demandes sans suite

- **Périmètre / demande :** suspendre pendant 24 heures les sollicitations sonores
  de proximité après **quatre demandes distinctes** ignorées ou refusées par un
  conducteur. Un simple compteur local ne couvre ni l'application fermée, ni une
  réinstallation, ni les renvois du serveur. Le dépôt voisin `zwanga-backend` a été
  modifié avec autorisation, sans déploiement ni accès à la base de production.
- **Règle appliquée :** compteur commun aux alertes `trip_request_nearby` et
  `driver_dispatch_offer`. Les refus et absences de réponse se cumulent, sans
  obligation d'être consécutifs ; une acceptation ne remet pas le compteur à zéro.
  À la quatrième demande comptée, pause de 24 heures, non prolongée par un doublon.
  Après expiration, le compteur repart à zéro au prochain contrôle. Les anciennes
  alertes en attente ne réactivent pas une pause terminée. La sélection des
  conducteurs et la livraison/reprise des push vérifient toutes deux la pause.
- **Définition d'une absence de réponse :** notification enregistrée `sent` par
  le backend, délai de réponse dépassé et demande encore disponible, sans réponse
  métier du conducteur. La fenêtre est plafonnée à 60 secondes et aux échéances
  `expiresAt` / `alertExpiresAt` existantes (dispatch généralement plus court).
  Les demandes déjà attribuées, annulées ou auxquelles le conducteur a répondu
  ne sont pas comptées comme ignorées. Les envois encore en attente ou déjà en
  échec ne comptent pas. Un refus explicite est dédupliqué par conducteur/demande.
- **Mobile :** ajout de `services/nearbyRequestRefusal.ts` et de la mutation RTK
  Query dans `store/api/driverDispatchApi.ts`. Les refus de
  `services/nearbyNotificationAction.ts` et
  `hooks/request-detail/useRequestDriverActions.ts` signalent désormais la
  décision au serveur authentifié, sans retarder l'arrêt local de la sonnerie ni
  la navigation. Contrôle du propriétaire de la session, coalescence des appels
  simultanés, délai HTTP de 10 secondes et libération de la mutation. Aucune
  décision hors ligne n'est rejouée ; si la synchronisation échoue, le contrôle
  serveur pourra constater l'absence de réponse à l'échéance.
- **Backend :** `notifications/nearby-request-cooldown.ts` centralise le compteur,
  le refus et la réconciliation. `notifications.service.ts` protège les deux
  transports et ajoute un contrôle toutes les minutes, sans chevauchement local.
  Le travail est borné à 100 conducteurs par passage et 100 événements par
  conducteur ; chaque nouvel envoi refait également le contrôle. La route
  `PUT /driver-dispatch/nearby-requests/:id/decline` utilise l'identité authentifiée
  et ne peut pas annuler la commande du passager. Les refus dispatch existants
  sont reconnus avant tout nouvel envoi, même avant leur échéance. Les anciens
  payloads ne contenant qu'un `offerId` restent pris en charge.
- **Persistance / performance :** migration additive
  `1780000087000-NearbyRequestRingingCooldown.ts`, enregistrée dans le registre
  backend : deux tables, clé unique conducteur/demande, dates `timestamptz`,
  index partiel des événements non traités. Le guide PostgreSQL a orienté les
  transactions courtes, l'ordre de verrouillage état → événements, la mise à jour
  groupée et l'absence d'appel push sous verrou. Pas de nouveau minuteur mobile,
  polling, service natif, changement GPS ou dépendance ajoutée.
- **Comportements conservés :** réservations des trajets publiés, réponses aux
  passagers et événements des trajets en cours inchangés. La pause ne déconnecte
  pas le conducteur, ne désactive pas sa présence et n'empêche pas de consulter
  manuellement les demandes. Les nouveaux push de proximité sont suspendus,
  pas remplacés par un push silencieux. Le rayon et les critères métier existants
  sont conservés.
- **Vérifications réalisées :** 105 tests JavaScript mobiles ciblés réussis,
  TypeScript mobile sans émission, ESLint des quatre fichiers mobiles modifiés,
  frontière réseau RTK Query et limite de taille des sources validés. Côté
  backend : 54 tests ciblés réussis, dont **9 tests sur PostgreSQL 17 réellement
  exécutés dans une base temporaire isolée**, et 119 autres tests unitaires de
  non-régression réussis. Les tests couvrent seuil, mélange refus/absence,
  concurrence, doublons, reprise après 24 heures, comptes distincts, anciennes
  invitations et nouvelles tentatives après échec d'envoi.
  Les suites dispatch/partage PostgreSQL 18/PostGIS ont également réussi
  (**75 tests**, incluant leurs tests de politique purs), avec les vraies entités
  du backend et un scénario d'exclusion/réintégration après pause. Compilation
  TypeScript de production backend sans émission et ESLint des nouveaux fichiers
  de politique/migration validés. La compilation globale
  incluant toutes les anciennes fixtures de tests présente des erreurs de types
  dans des fichiers hors de ce correctif ; ce contrôle global n'est pas annoncé vert.
- **Limites / mise en service :** `sent` confirme l'acceptation du push par le
  transport, pas son affichage ou son audition sur le téléphone. Un échec de reçu
  Expo arrivé après le comptage n'annule pas rétroactivement ce comptage. Un push
  déjà en vol au déclenchement de la pause ne peut pas être rappelé. La
  réconciliation périodique peut être différée sous charge ou en cas de panne ;
  le contrôle avant envoi reste actif. Aucun essai physique Android/iOS, aucune
  mesure de batterie/chauffe ou de charge production : aucune garantie native
  déduite de ces tests. La migration doit être appliquée **avant** le backend qui
  l'utilise, puis la version mobile doit être distribuée. Ces opérations n'ont
  pas été effectuées. Aucun historique antérieur n'est reconstitué et les
  anciennes applications ne signalent pas immédiatement le refus des alertes
  de proximité : elles restent couvertes par le délai serveur.

## 2026-10-21 — Post-install EAS : lecture des pods Didit et test du compte à rebours

- **Périmètre / problèmes constatés :** le log iOS copié confirme Xcode 26.x /
  SDK iOS 26.x, puis échoue dans `validate-ios-crashlytics.cjs` sur Didit. Le
  validateur lisait toutes les lignes à deux espaces de `Podfile.lock` : les
  déclarations `DEPENDENCIES` avec `(from ...)` écrasaient les versions résolues
  de `PODS` dans la même Map. Un lock complet compatible est ainsi refusé ;
  ce faux négatif a été reproduit avec une fixture réaliste. Le lock produit
  sur le worker concerné n'a pas été fourni : ses versions réelles ne sont pas
  certifiées ici. Le fichier de log joint montre un autre échec, plus loin dans
  le contrôle release : 2 455 tests réussis, un échec `passengerCountdown`
  (`69 !== 9`), sans test ignoré. Ne pas confondre ces deux exécutions.
- **Correction appliquée — pods :** `scripts/validate-ios-crashlytics.cjs`
  limite désormais la lecture aux entrées installées de premier niveau de
  `PODS`, avant toute autre section. Les dépendances imbriquées, sources et
  contraintes déclarées ne servent plus de preuve d'installation. Cette lecture
  est partagée par les contrôles Didit et Crashlytics. Les versions du bridge
  React Native et du SDK iOS sont comparées séparément aux métadonnées du paquet,
  avec la variante configurée. Le diagnostic indique les versions attendues et
  installées sans recopier de chemin ou URL arbitraire du lock.
- **Correction appliquée — test uniquement :** l'ancien
  `tests/passengerCountdown.test.js` échoue aussi localement sous Node 20.19.4,
  mais passe sous Node 24.11.0. Un reproducer indépendant, sans code Zwanga,
  montre que les minuteries expérimentales simulées de Node 20 réexécutent un
  intervalle annulé dans son callback : cinq appels au lieu d'un sur cinq secondes
  simulées, contre un sous Node 24. Le test utilise maintenant une horloge
  contrôlée explicitement et vérifie également qu'aucun intervalle ne subsiste
  hors écran, à l'expiration, pour une date invalide ou après démontage. Aucun
  changement du hook de navigation ni affaiblissement des assertions existantes.
- **Précautions / comportements conservés :** `tests/iosCrashlytics.test.js`
  couvre un lock complet avec sources externes, LF/CRLF et BOM, les pods absents,
  les quatre variantes Didit, les deux versions indépendantes, les contraintes
  imbriquées et les diagnostics sans chemins. Les garde-fous Xcode, Didit,
  Crashlytics et release restent actifs. Aucun changement de SDK, Podfile/lock,
  dépendance npm, écran, sonnerie, backend ou `.env`. Aucun pull/merge de master.
- **Vérifications réalisées :** les nouveaux tests pods échouaient avant la
  correction et passent après. Sous Node 20.19.4, les six fichiers de régression
  ciblés comptent 37 réussites, zéro échec, un test Ruby ignoré (Ruby absent sous
  Windows). Sous Node 24.11.0, les deux fichiers modifiés comptent neuf réussites,
  zéro échec. Contrôle release complet sous Node 20.19.4 réussi : TypeScript,
  ESLint global, frontières réseau, taille des sources et 2 459 tests réussis
  sur 2 460, zéro échec, un test Ruby ignoré (Ruby absent). La suite de tests
  a pris environ 426 s sur cette machine ; ce n'est pas une mesure de performance
  de l'application. `git diff --check` et ESLint ciblé sont également valides.
- **Limites :** tests JavaScript et fixtures, pas de compilation Xcode/CocoaPods
  ni d'essai iPhone/iPad/Android physique. Le lock local, non régénéré sur cette
  machine Windows, reste refusé car les pods Didit/Crashlytics y sont absents ;
  ce refus est attendu et n'est pas contourné. Aucun lock fabriqué manuellement.
  Relancer EAS avec ces modifications pour valider le lock réellement généré
  après installation des pods, puis la compilation et le lancement natifs.
  Aucun build distant ou déploiement lancé ; aucune disparition de crash certifiée.

## 2026-10-21 — Refus Apple : stabilisation de la compilation iOS après le crash UIScene

- **Périmètre / problème constaté :** les trois rapports Apple fournis pour
  la version 1.0.17, build 153, montrent un `EXC_BREAKPOINT / SIGTRAP` sur le
  thread principal dans
  `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`,
  sous iPadOS 27.0.1, environ 74 à 356 ms après le lancement. Le projet actuel
  utilise Expo SDK 54 / React Native 0.81.5, une fenêtre créée dans AppDelegate
  et aucun manifeste de scènes. L’image EAS iOS `latest` pouvait changer la
  version de Xcode indépendamment du code. Le log de compilation du build 153
  n’a pas été fourni : son image EAS exacte n’est pas certifiée par ce diagnostic.
  Ces rapports ne démontrent ni une surcharge de Home ni la cause des crashs Android.
- **Solution effectivement appliquée :** `eas.json` fixe l’image iOS
  `macos-sequoia-15.6-xcode-26.0` pour `production` et `dev` ; `dev-device`
  l’hérite de `dev`. Cette image est référencée pour SDK 54 dans
  [l’infrastructure Expo](https://docs.expo.dev/build-reference/infrastructure/).
  Il s’agit d’une mesure de compatibilité de compilation, **pas d’une migration
  UIScene** ni d’un correctif JavaScript OTA. Les exigences Apple publiées à la
  date de ce changement acceptent Xcode 26 / SDK iOS 26 ou ultérieurs ; cette
  politique devra être réévaluée lors d’une prochaine exigence de soumission.
- **Protection contre une récidive :** `scripts/validate-ios-toolchain.cjs`,
  sans dépendance npm, valide tous les profils iOS et leur héritage. Les alias
  mouvants, images différentes, parents absents et cycles d’héritage échouent.
  Sur macOS, il interroge les outils réellement sélectionnés avec
  `xcodebuild -version` et `xcrun --sdk iphoneos --show-sdk-version` et exige
  Xcode 26.x / SDK 26.x. Outils absents, sortie illisible, échec, signal ou timeout
  bloquent le contrôle ; chaque commande est bornée à 15 s et 64 Ko de sortie,
  sans shell. Une clé de manifeste ajoutée isolément n’autorise pas Xcode 27.
- **Intégration :** `package.json` lance ce garde-fou avant installation EAS,
  puis après installation avant les contrôles des pods et de release existants.
  Le contrôle natif précède aussi `npm run ios`. `npm run check:ios-toolchain`
  ne vérifie que la configuration, donc fonctionne sous Windows et le précise
  dans son résultat. Les hooks ignorent explicitement Android sans lancer Xcode.
  Un appel direct à Xcode ou `npx expo run:ios` contourne le wrapper npm : lancer
  aussi `node scripts/validate-ios-toolchain.cjs` sur le Mac dans ce cas.
- **Comportements conservés :** aucun changement de dépendance, d’AppDelegate,
  de Podfile/lock, de cible minimale iOS 15.1, d’authentification, de notification,
  de géolocalisation, de liens profonds, de Home ou du backend. Android reste
  inchangé. L’incrémentation distante automatique EAS est conservée ; aucun
  numéro de build local n’a été inventé. Aucun secret ni fichier `.env` modifié.
- **Vérifications réalisées :** contrôle statique des images valide ; TypeScript,
  ESLint global/ciblé, frontières réseau, taille des sources et `git diff --check`
  valides. Les tests ciblés `iosToolchain`, `iosCrashlytics`, `iosDeploymentTarget`,
  `releaseAuditFixes` et `androidBuildPerformance` comptent 32 réussites,
  zéro échec et un test Ruby ignoré (Ruby absent sous Windows).
  L’ancien test Android exigeait aussi `production.ios.image = latest` : seule
  cette attente a été remplacée par l’image iOS figée ; les vérifications de
  cache, d’image, d’architectures et de tâches Android sont conservées.
  Les versions Xcode/SDK, erreurs des commandes et chemins EAS sont simulés dans
  les tests JavaScript ; aucune exécution de Xcode réelle ici. La passe globale
  lancée avant la mise à jour de l’attente `latest` compte 2 454 réussites sur
  2 456 tests, un ignoré et un échec : précisément cette ancienne attente.
  Cet échec est corrigé et le fichier concerné repasse dans les 32 tests ciblés
  ci-dessus. Pas de seconde passe globale après cette seule correction de test.
- **Limites et suite avant soumission :** le contrôle existant
  `node scripts/validate-ios-crashlytics.cjs` signale toujours les pods
  Crashlytics/Didit absents ou incompatibles dans le lock local. Régénérer avec
  CocoaPods sur macOS et valider, sans fabriquer le lock. Produire un nouveau
  build natif avec l’image figée, vérifier l’image/outillage dans les logs EAS,
  puis tester un démarrage à froid, une mise à jour, la connexion et les retours
  par notification/lien sur iPhone et iPad sous iOS/iPadOS 27, avant resoumission.
  Aucun build, déploiement, essai physique ou disparition de crash certifiée.
  La migration Expo/UIScene complète reste différée et nécessitera notamment
  la validation des événements d’application et des liens profonds.
- **Sources :** [migration UIScene Apple](https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle),
  [exigences Apple](https://developer.apple.com/news/upcoming-requirements/),
  [hooks EAS](https://docs.expo.dev/build-reference/npm-hooks/).

## 2026-10-21 — Correctifs de l’audit global : carte, GPS, activité et builds

- **Périmètre / constats :** le recentrage de la carte repliable pouvait être
  envoyé avant son layout natif, ses marqueurs enfants restaient suivis en continu,
  et une lecture GPS ponctuelle bloquée était réutilisée après chaque timeout.
  L’ouverture chargeait aussi tout l’historique des demandes personnelles. Les
  erreurs d’entrée ne laissaient qu’un log console. Le workflow de production
  avait déjà une étape qualité, mais pas les builds EAS lancés directement.
- **Carte — solution appliquée :** `features/request-detail/CollapsibleRouteMap.tsx`
  réutilise `hooks/navigation/useNavigationMapLifecycle.ts` : montage après les
  interactions, attente du chargement ET d’un layout valide avant recentrage,
  invalidation des callbacks d’une ancienne carte. Suppression du recentrage via
  `requestAnimationFrame`. Les marqueurs utilisent les images locales existantes,
  sans enfants React et avec `tracksViewChanges={false}`. Une route chargée pour
  d’autres coordonnées ne peut plus apparaître pendant la lecture suivante.
  L’ouverture/repli, les dimensions, le trajet fourni et le repli pointillé en cas
  d’échec du service d’itinéraire sont conservés.
- **GPS — solution appliquée :** `services/currentLocationRequest.ts` remplace
  `getCurrentPositionAsync` par une écoute temporaire partagée par précision.
  Elle s’arrête au premier point valide, à l’erreur ou lorsque le dernier appelant
  annule/atteint son délai. Une écoute enregistrée tardivement est supprimée.
  Une inscription native encore bloquée n’en autorise pas une deuxième en parallèle.
  Les lectures de cache restent bornées à 2 s, l’attente GPS à 10 s par appelant,
  avec le repli historique existant sauf `fallback: false`. Aucun changement du
  suivi des trajets en cours, de la présence conducteur toutes les trois minutes
  ni des autorisations. Si l’inscription elle-même ne répond jamais côté natif,
  ce garde-fou évite l’accumulation mais ne répare pas le pont natif ; à vérifier
  sur appareil. L’écoute temporaire ne devient pas un service d’arrière-plan.
- **Activité — solution appliquée :** `store/api/tripRequestApi.ts` ajoute
  `getMyActivityRequests` sur `GET /trip-requests/my-requests?scope=activity`, dans
  un cache distinct de l’historique. Les coordinateurs `AccountActivityCoordinator`
  et `ActiveRideResumeCoordinator`, `NotificationHandler`, `useHomePassengerActivity`
  et le type de `useOverdueRequestNotification` l’utilisent. Export ajouté dans
  `store/api/zwangaApi.ts`. Les tags de mutation, le résultat confirmé d’acceptation
  et `store/middleware/tripRequestExpiration.ts` mettent à jour les deux caches.
  Pas de polling supplémentaire. La récupération après publication ambiguë et
  les compteurs historiques du profil continuent à utiliser l’historique complet.
  Les raccourcis de destinations sur Home restent issus des activités disponibles,
  désormais limitées à cette fenêtre pour les demandes.
- **Backend préparé, non déployé :** dans `../zwanga-backend`,
  `src/common/activity-read-policy.ts` définit `activeRequestWhere` partagé par
  `src/activity/activity.service.ts` et `src/trip-requests/trip-requests.service.ts`.
  Le contrôleur lit le scope facultatif. Toutes les demandes pending,
  offers_received et driver_selected, plus les demandes modifiées depuis 48 h,
  restent incluses, sans limite arbitraire de nombre. Chaque branche OR est
  restreinte au compte authentifié ; contacts/offres gardent leur sérialisation
  existante. Sans scope, le comportement historique est conservé. Un ancien
  serveur ignorant le paramètre reste compatible mais n’apporte pas le gain de
  volume. Les recommandations PostgreSQL ont guidé la restriction au propriétaire
  et le filtre avant hydratation ; aucune migration, connexion à la base,
  modification de données ni mesure EXPLAIN n’a été réalisée.
- **Diagnostic — solution appliquée :** `services/entryRecovery.ts` et
  `services/diagnostics.ts` transmettent à Crashlytics, en release et s’il est
  disponible, des codes statiques, durées bornées et statuts HTTP uniquement.
  Limitation à une remontée par étape/motif/minute. Les erreurs réseau et HTTP 4xx
  laissent une trace, sans créer un rapport non fatal ; les timeouts, erreurs
  serveur ou de navigation sont regroupés par code stable. Les attentes annulées
  ou obsolètes ne remontent pas d’erreur. Un AbortError natif sur une lecture encore
  courante est remonté comme « aborted », sans présumer sa cause. Aucun contenu
  de réponse, jeton, coordonnées ou identifiant utilisateur n’est ajouté.
  Une panne du diagnostic ne bloque jamais l’ouverture.
- **Builds — solution appliquée :** le hook `eas-build-post-install` de
  `package.json` lance aussi `scripts/check-release.cjs` après les contrôles
  natifs, y compris hors workflow. `scripts/validate-ios-crashlytics.cjs` vérifie
  aussi les pods Didit (version du bridge et version/variante du SDK natif).
  Le hook iOS s’exécute après CocoaPods, conformément aux
  [hooks EAS](https://docs.expo.dev/build-reference/npm-hooks/).
  Le lock iOS n’a pas été fabriqué ou modifié manuellement : il reste à régénérer
  avec `pod install` sur macOS puis à vérifier avec le script et une archive iOS.
- **Vérifications :** 22 tests backend ciblés réussis (politiques de filtre,
  contrôleur/service, disponibilité et construction SQL TypeORM sans base), et
  TypeScript backend `--noEmit --incremental false -p tsconfig.build.json` valide.
  Tests JS ajoutés sur GPS concurrent/timeout/reprise/annulation/inscription tardive,
  carte/layout/callbacks anciens, diagnostics sans données privées, cache activité,
  compatibilité ancien serveur, expiration et acceptation. Contrôles Android
  Crashlytics et patch de lots GPS valides. Contrôle mobile global : TypeScript,
  ESLint, frontières réseau et limite de 400 lignes (1 163 sources) valides ;
  2 442 tests réussis sur 2 444, un ignoré et un échec de contraste lié au thème
  modifié en parallèle. Les doubles GPS/carte ont été adaptés aux nouvelles
  interfaces ; seuls les deux contrats intentionnellement modifiés ont été mis
  à jour dans `tests/fixtures/sourceExtractions.json`, après tests comportementaux
  de cache séparé et d’acceptation confirmée. Aucun seuil de test n’a été abaissé.
- **Couleur après retour utilisateur :** l’utilisateur demande un vert plus moderne
  et moins agressif. `features/home/homeDashboardTheme.ts` remplace le texte vert
  clair par un jade `#2F6B4F`, sur le fond pâle existant `#E7F5ED`. Les boutons,
  dimensions et comportements restent identiques. Contraste calculé : 5,60:1.
  Après cet ajustement, les 219 tests ciblés Home et correctifs de release passent,
  dont le test de contraste qui était le seul échec de la passe globale précédente.
  La suite globale complète n’a pas été relancée après cette seule modification
  de couleur. Le test ignoré lors de la passe globale nécessite Ruby, absent de
  cet environnement Windows.
- **Limites / précautions :** pas de build ni test iPhone/Android physique, pas de
  mesure de mémoire, batterie, FPS ou latence réseau. Le contrôle natif iOS échoue
  encore localement sur les pods Crashlytics/Didit manquants dans le lock : il doit
  être résolu sur macOS avant diffusion. Vérifier ouverture/repli rapide de carte,
  rotation, arrière-plan/retour, GPS indisponible puis rétabli, connexion lente,
  demande prioritaire et navigation conducteur/passager sur des builds release.
  Aucune disparition de crash ou de chauffe n’est certifiée. Aucun changement
  de branche, fusion de master ou déploiement ; la couleur a été ajustée seulement
  après le retour utilisateur. Les modifications d’abonnements apparues en
  parallèle ne sont pas écrasées par ces correctifs.

## 2026-10-21 — Correctifs de l’audit : priorité, disponibilité et affichage des réservations

- **Périmètre et problèmes constatés :** l’audit a reproduit en JavaScript une
  réservation prenant la place d’un trajet en cours découvert pendant sa
  vérification, ainsi qu’un faux état « Aucune réservation » pendant le chargement
  ou après une erreur. La destination relisait les détails avant de rendre les
  actions disponibles. Le texte vert clair sur fond vert pâle manquait de contraste.
- **Priorité appliquée :** `hooks/navigation/useActiveRideResume.ts` expose une
  revérification au moment du passage vers un écran secondaire. Elle observe les
  trajets/réservations partagés les plus récents et vérifie auprès du serveur la
  participation en cours (conducteur ou passager). `useRequestEntryResume.ts` et
  `components/ActiveRideResumeCoordinator.tsx` l’appellent avant la redirection.
  Les candidats déjà invalidés sont écartés ; une erreur reste relançable et ne
  déclenche pas une navigation de moindre priorité. Aucun polling supplémentaire
  ni détournement d’un accueil déjà résolu ou d’une navigation volontaire.
- **Réutilisation des données :** `features/navigation/pendingBookingEntry.ts`
  fournit l’instantané vérifié. `store/api/booking/entrySnapshot.ts` initialise
  uniquement un détail de trajet absent du cache, sans écraser une lecture en
  cours ni un détail existant. `hooks/manage-trip/useManageTripState.ts` réutilise
  ce détail récent (fenêtre de 30 secondes avant relecture au montage) et le détail
  de réservation déjà chargé ; aucun appel réseau n’est ajouté pour cet aperçu.
  `features/manage-trip/manageBookingPreview.ts` vérifie propriétaire, identifiants
  et fraîcheur. La liste complète reste chargée séparément. Elle prévaut dès
  qu’elle est plus récente, même vide, et l’aperçu n’est jamais enregistré comme
  une liste complète. Les mutations restent authentifiées et contrôlées côté serveur.
- **États UI :** `features/manage-trip/ManageTripBookingsReadState.tsx` et
  `ManageTripBookings.tsx` distinguent chargement, connexion absente, erreur avec
  Réessayer et résultat vide confirmé. Les réservations connues et leurs actions
  restent affichées si l’actualisation échoue ; une liste partielle est annoncée
  comme telle, sans présenter son compte comme un total. La relance reste liée au
  compte, à l’écran actif et au réseau via `useDisplayRefetch`.
- **Lisibilité :** `features/home/homeDashboardTheme.ts` rétablit le vert foncé
  du texte « Gratuit » sur fond pâle, sans changer les couleurs des boutons.
  Un test calcule le contraste et impose au moins 4,5:1.
- **Précautions conservées :** aucun acquittement automatique de sonnerie, aucune
  acceptation/refus automatique ; verrous de décision, contrôles d’identité et de
  propriété maintenus. Les résultats tardifs après changement de compte/session,
  sortie d’écran, arrière-plan ou ouverture d’un overlay ne naviguent pas et ne
  préchargent pas le mauvais compte. Les alertes sont revérifiées après l’attente
  du contrôle de priorité. La synchronisation existante à 60 secondes est conservée ;
  son effet dépend uniquement du statut du trajet. Aucun changement backend, natif,
  de branche ou déploiement.
- **Vérifications :** 255 tests JavaScript ciblés réussis, notamment les scénarios
  ajoutés dans `activeRideResumeCoordinator.test.js`, `pendingBookingEntry.test.js`,
  `manageBookingEntryReliability.test.js` et `homeCompactLayout.test.js`.
  TypeScript et ESLint ciblé sans erreur ni avertissement ; frontières réseau
  valides ; 1 163 sources contrôlées, aucune au-delà de 400 lignes.
  `git diff --check` sans erreur de contenu (avertissement CRLF préexistant dans
  `ResetPinStep.tsx`, hors périmètre). Les premiers essais ont nécessité d’adapter le
  simulateur aux actions de cache Redux (aucun assouplissement des assertions).
- **Limites :** la réduction de l’attente est étayée par le chemin des données et
  les tests des hooks, pas par une mesure de latence sur appareil. Pas de build,
  test natif, mesure de mémoire/batterie ni essai Android/iOS physique. À vérifier
  avant diffusion : ouverture à froid depuis une réservation, réseau lent/coupé,
  acceptation/refus et apparition d’un trajet en cours pendant la vérification.
  Aucune disparition de crash ou de chauffe n’est certifiée.

## 2026-10-21 — Réservation reçue : ouverture prioritaire du trajet conducteur

- **Périmètre et problème :** à l’ouverture ou au retour dans l’application, la
  reprise automatique traitait les trajets en cours et les demandes de trajet,
  mais ignorait les réservations en attente sur les trajets du conducteur. Il
  fallait retrouver manuellement le trajet pour accepter ou refuser.
- **Solution appliquée :** `features/navigation/pendingBookingEntry.ts` sélectionne
  une réservation depuis les alertes du compte ou les trajets d’activité déjà
  chargés. Sans notification, le trajet en attente au départ le plus proche est
  choisi ; le résumé des réservations est utilisé même sans profil passager
  embarqué. La réservation sélectionnée est revérifiée par une lecture
  authentifiée : statut en attente, identifiants concordants, conducteur
  propriétaire, trajet non terminé/annulé/expiré et passager non arrivé.
- **Navigation :** `hooks/navigation/useRequestEntryResume.ts` et
  `components/ActiveRideResumeCoordinator.tsx` ouvrent `/trip/manage/[id]` avec
  `bookingId` et `section=passengers`. L’écran existant place ainsi la réservation
  à traiter en tête et conserve ses boutons Accepter/Refuser, sans écran
  intermédiaire ni décision automatique. Si la vérification découvre que ce
  trajet a commencé, elle ouvre sa navigation. `useEntryPresentation.ts` permet
  aussi l’ouverture après le budget visuel de deux secondes, sans rallonger le
  loader ni remplacer une navigation volontaire.
- **Priorités et comportements conservés :** la reprise d’un trajet en cours,
  conducteur **ou passager**, est vérifiée avant les réservations. Une réservation
  à traiter précède ensuite les demandes proches, les offres de dispatch et les
  courses acceptées non démarrées. Une seule ouverture réussie par visite ; le
  retour volontaire à l’accueil reste possible. Les formulaires, conversations,
  paiements et liens explicitement ouverts gardent leur parcours. Une alerte
  reçue tardivement peut encore ouvrir un accueil resté intact ; une simple
  actualisation des listes après une visite déjà résolue ne le détourne pas.
  Les réservations refusées/annulées/acceptées/supprimées sont écartées, sans boucle
  de lecture. Aucun acquittement de sonnerie à la simple ouverture : les actions
  explicites de réservation gardent cette responsabilité.
- **Fiabilité et coût :** aucun abonnement, polling ou appel serveur de découverte
  ajouté. Réutilisation des caches et lectures en cours via `readEntryQuery` ; une
  vérification de réservation sélectionnée, plus une lecture du trajet seulement
  s’il n’est pas inclus. Les annulations, changements de compte/session, retours
  en arrière-plan et overlays empêchent une réponse tardive de rediriger.
  Une erreur réseau conserve la relance explicite, sans nouvelle tentative à
  chaque rendu. Pas de modification backend, des thèmes d’accueil ou du code natif.
- **Vérifications :** **179 tests JavaScript ciblés réussis, aucun échec**, couvrant
  la nouvelle sélection (`pendingBookingEntry.test.js`), l’intégration du
  coordinateur, les reprises passager/conducteur, les réponses périmées, les
  notifications et les actions de réservation. `requestEntryResume.test.js` ne
  classe plus les alertes de réservation parmi les types volontairement ignorés.
  TypeScript `--noEmit` et ESLint ciblé sans erreur ; frontières réseau valides ;
  1 160 sources contrôlées, aucune au-delà de 400 lignes ; `git diff --check` sans
  erreur de contenu (avertissement CRLF préexistant sur un fichier hors périmètre).
- **Limites :** pas de build natif, déploiement ni essai sur téléphone physique
  pendant cette intervention. À tester sur Android/iOS : lancement à froid et
  retour d’arrière-plan, avec/sans push, plusieurs réservations, trajet déjà en
  cours, traitement sur un autre appareil et réseau lent. Les tests JavaScript
  ne constituent pas une validation de l’absence de crash natif.

## 2026-10-20 — Correctifs de l’audit : reprise d’activité et autorisation de localisation

- **Périmètre et problèmes reproduits en JavaScript :** une requête `/me/activity`
  commencée avant le retour dans l’application pouvait finir après ce retour et
  être considérée comme récente, masquant un trajet en cours. Une transition iOS
  `active → inactive → active` recréait la visite et le budget du loader. Une
  lecture native ou de stockage sans réponse pouvait bloquer le panneau de
  localisation. Enfin, « Pas maintenant » dans le profil persistait une véritable
  désactivation, contrairement à « Plus tard » sur l’accueil.
- **Reprise corrigée :** `features/navigation/entryFreshness.ts` vérifie le début
  **et** la fin de la requête. `AccountActivityCoordinator.tsx` remplace une réponse
  d’avant-visite une fois terminée, en partageant les requêtes RTK en cours ; elle
  ne sert plus à clôturer la reprise ni à réconcilier les listes. Le bouton de
  relance dans `ActiveRideResumeCoordinator.tsx` attend lui aussi la requête
  partagée avant une nouvelle lecture. Une annulation de l’attente ne détruit pas
  le GET utilisé par un autre écran.
- **Interruptions iOS :** `services/appActivity.ts` et `hooks/useAppIsActive.ts`
  distinguent le vrai retour d’arrière-plan d’un simple état `inactive`. Les
  abonnements de découverte restent en place durant cette interruption ; leur
  polling est suspendu. `useActiveRideResume`, `useRequestEntryResume` et
  `useEntryPresentation` conservent la visite et son budget de deux secondes,
  tout en interrompant une vérification en attente et en permettant sa reprise.
  Le signal strict `active` reste utilisé pour la navigation, le son et le GPS.
  La distinction est documentée par [React Native](https://reactnative.dev/docs/appstate).
- **Permissions corrigées :** `services/locationPermissionWait.ts` borne à huit
  secondes les attentes techniques du hook `useNearbyLocationPermission.ts`.
  Ce délai est un budget applicatif, pas une mesure de rapidité native. La réponse
  humaine à une fenêtre système n’a pas ce délai. Un verrou commun aux parcours
  Accueil/Profil empêche leurs demandes natives simultanées ; quitter le panneau n’annule pas la
  fenêtre Android/iOS elle-même. Les générations, sessions et signaux empêchent
  ses réponses tardives de poursuivre une activation abandonnée. Une lecture
  initiale bloquée propose désormais « Réessayer ».
- **Sortie et préférence :** `BackgroundLocationApproval.tsx` autorise « Plus tard »
  et le retour Android même pendant l’attente ; `HomeBackgroundLocationButton.tsx`
  abandonne alors l’opération. Dans `NearbyDriverLocationPermission.tsx`,
  « Pas maintenant » reporte le choix sans enregistrer de désactivation. L’action
  explicite « Désactiver hors trajet » reste disponible après autorisation.
  `services/nearbyDriverLocation.ts` vérifie la validité d’une activation avant
  l’écriture et le démarrage GPS ; une ancienne préférence de désactivation est
  restaurée si l’écriture native de réactivation se termine après abandon.
- **Précision sur la capture utilisateur :** l’écran « Location permission / Allow
  all the time » est une page Android, pas un composant Zwanga à recréer. La
  validation conserve `requestBackgroundPermissionsAsync()` après le premier plan
  pour demander le parcours système. Les réglages généraux restent un recours
  explicite lorsque la permission n’est plus redemandable. Aucun intent Android
  privé/non documenté n’a été ajouté. La page dédiée et les différences Android
  10/11+ sont décrites dans la [documentation Android](https://developer.android.com/develop/sensors-and-location/location/permissions/background).
- **Tests et précautions :** nouveaux tests `entryFreshnessRace.test.js` avec un
  vrai cache RTK Query, `locationPermissionReliability.test.js`, et régressions
  ajoutées aux tests de reprise, de permissions et de service GPS. Les fixtures
  portent désormais l’heure de début réelle attendue du contrat RTK. Les deux
  échecs préexistants de l’audit sont corrigés : assertion de texte obsolète dans
  `driverAvailability.test.js`, et dépendances natives non simulées dans
  `requestDecisionLayout.test.js`. Aucune logique métier n’est contournée pour les
  faire passer. **Suite complète : 2 396 tests, 2 395 réussis, aucun échec,
  un ignoré**, en environ 206 secondes sur cette machine. Cette durée mesure
  l’exécution des tests, pas les performances de l’application. Une fixture
  supplémentaire de `acceptedRequestEntry.test.js` a été complétée avant cette
  relance globale. Après le dernier renforcement du traitement d’une interruption
  native reçue avant le rendu React, **73 tests ciblés** de reprise/découverte ont
  également réussi. TypeScript `--noEmit`, ESLint global puis ciblé sans erreur ;
  frontières réseau et taille des sources validées (1 159 sources, aucune au-delà
  de 400 lignes). `git diff --check` sans erreur de contenu.
- **Comportements conservés et limites :** priorité des trajets en cours et des
  demandes, sortie volontaire vers l’accueil, protections de compte, consentement
  facultatif, cadence hors trajet d’environ trois minutes et cadence propre au
  trajet actif. Sonnerie en veille bornée inchangée ; aucun déploiement, changement
  de backend, dépendance native ou fusion Git. Les tests simulent les permissions
  et le stockage ; aucun essai sur téléphone physique ni compilation native.
  Une opération native déjà engagée ne peut pas être physiquement annulée par un
  délai JavaScript. Aucun résultat ici ne certifie l’absence de crash, de chauffe
  ou la cadence effective de livraison GPS en veille.

## 2026-10-20 — Icône de localisation et validation directement dans l’application

- **Périmètre et constat :** le bouton d’accueil était trop large et le parcours
  pouvait envoyer le conducteur dans les réglages généraux du téléphone. Le code
  réutilisait un indicateur `settingsRequired` sans relire les permissions ; un
  accès en arrière-plan bloqué pouvait aussi court-circuiter la demande de position
  au premier plan pourtant encore disponible.
- **Interface appliquée :** `components/home/HomeBackgroundLocationButton.tsx`
  affiche seulement l’icône de localisation dans une cible ronde de 44 × 44 points,
  avec libellé accessible et contour pulsant conservés. L’appui ouvre directement
  `components/location/BackgroundLocationApproval.tsx`, un panneau dans
  l’application avec explication de la collecte hors trajet, « Autoriser » et
  « Plus tard », sans case à cocher ni navigation vers le profil. Le panneau peut
  défiler et respecte les zones sûres ; il utilise `RideModal inApp` pour ne pas
  empiler un contrôleur modal UIKit avec les dialogues système. Le guide
  `frontend-skill` a orienté la présentation compacte, une action principale et
  l’arrêt de la pulsation pendant la lecture du panneau.
- **Permissions :** `hooks/profile/useNearbyLocationPermission.ts` relit toujours
  les permissions avant une action, demande d’abord le premier plan s’il est encore
  autorisable et distingue désormais `authorize()` de `openSettings()`. Une demande
  normale n’appelle plus automatiquement `Linking.openSettings()` lorsqu’une
  permission est bloquée : le panneau reste disponible, explique les étapes et
  attend l’action explicite « Ouvrir les autorisations ». Un refus avec
  `canAskAgain: true` conserve la possibilité de demander la fenêtre native.
  Les états affichés suivent les résultats réels, et les anciens messages sont
  effacés lors d’un changement de permission/préférence.
  `components/profile/NearbyDriverLocationPermission.tsx` utilise également la
  nouvelle action explicite pour son bouton de réglages existant.
- **Limite système vérifiée :** Android 11+ exige une page de réglages pour
  « Toujours autoriser » ; une interface Zwanga ne peut pas accorder ce droit ni
  forcer une fenêtre native que le système interdit. Cette contrainte est décrite
  dans la [documentation Android](https://developer.android.com/develop/sensors-and-location/location/permissions/background).
  Les implémentations installées `expo-location/src/Location.ts`,
  `expo-location/android/src/main/java/expo/modules/location/LocationModule.kt` et
  `expo-modules-core/.../permissions/PermissionsService.kt` ont aussi été lues,
  sans modification. Le panneau donne les étapes « Autorisations → Position →
  Toujours autoriser » lorsque les réglages sont nécessaires, ou « Position →
  Toujours » sur iOS. Le libellé exact dépend du téléphone et de sa langue.
- **Comportements conservés :** invitation réservée aux conducteurs, choix
  facultatif, autorisation explicite, protection contre doubles appuis et anciennes
  sessions, relecture au retour des réglages, suivi géré par le coordinateur
  existant. Aucun nouveau polling, suivi GPS, changement de cadence, de sonnerie,
  de dépendance native ou de backend. Le compte et la session bornent aussi
  l’ouverture du panneau ; l’autorisation système ne vaut pas preuve de livraison
  d’une position au serveur.
- **Vérifications :** **148 tests JavaScript ciblés réussis** sur onze fichiers :
  `backgroundLocationApproval`, `homeBackgroundLocation`, `nearbyDriverPermission`,
  `homeCompactLayout`, `homeForegroundLifecycle`, `homeRoleLoader`,
  `nearbyDriverLocation`, `nearbyDriverDelivery`, `nearbyDriverPresence`,
  `requestDetailModules` et `rideOverlays` dans `tests/*.test.js`.
  Nouveaux cas : icône sans texte, panneau défilable, étapes système, premier plan
  autorisable malgré arrière-plan bloqué, état périmé de réglages, refus redemandable,
  absence d’ouverture automatique des réglages et sortie facultative du panneau.
  TypeScript et ESLint ciblé sans erreur ; frontières réseau, taille des sources
  (1 158 sources, aucune au-delà de 400 lignes) et `git diff --check` validés.
- **Limites de validation :** tests avec permissions et composants natifs simulés.
  Aucune compilation, publication ou vérification visuelle sur téléphone physique.
  Restent à vérifier sur Android/iPhone : première demande, refus temporaire ou
  définitif, choix dans les réglages, retour, grande police et réduction des
  animations. Aucune garantie de disparition de crash natif ou d’envoi en veille
  n’est déduite de ces tests JavaScript.

## 2026-10-20 — Bouton de localisation visible sur l’accueil conducteur

- **Périmètre et constat :** l’autorisation de localisation hors trajet était
  peu visible dans `Profil > Alertes conducteur`. L’utilisateur demande une action
  clignotante en haut de l’accueil tant que l’autorisation manque. Aucun problème
  de livraison GPS native n’a été reproduit pendant cette intervention.
- **Solution appliquée :** `components/home/HomeBackgroundLocationButton.tsx`
  ajoute « Activer ma localisation » entre la cloche et l’initiale du profil dans
  `HomeHeader.tsx`. `HomeDashboard.tsx` transmet le compte courant, son rôle vérifié
  et la visibilité réelle de l’accueil. Le bouton est réservé aux conducteurs sur
  Android/iOS ; il ne monte pas pour un passager ou un compte non identifié. Il
  disparaît après lecture d’une autorisation réelle et d’une préférence locale
  activée, puis revient si l’autorisation est révoquée. Un suivi volontairement
  désactivé n’est jamais réactivé sans confirmation.
- **Parcours :** toucher le bouton ouvre une explication de la collecte/envoi au
  serveur hors trajet, environ toutes les trois minutes, même écran éteint ou dans
  une autre application. « Autoriser » confirme ce choix avant le parcours système,
  sans case à cocher supplémentaire et sans navigation vers le profil. « Plus tard »
  ferme l’explication sans accord ni désactivation persistante. Un refus système
  laisse le bouton disponible ; une nouvelle pression explique le résultat et
  permet d’ouvrir les réglages si nécessaire. Le retour des réglages relit les
  permissions ; ouvrir les réglages seul ne vaut jamais autorisation. Une erreur
  de lecture native affiche « Vérifier ma localisation » sans pulsation, avec reprise
  sur appui. Le parcours avancé existant du profil reste disponible.
- **Séparation des responsabilités :**
  `hooks/profile/useNearbyLocationPermission.ts` ajoute l’option
  `deferTrackingToCoordinator`. Sur l’accueil, la demande de permission ne dépend
  pas d’une lecture réseau de disponibilité du service. Elle ne démarre pas non
  plus directement un suivi GPS : le coordinateur conducteur existant conserve
  les contrôles serveur d’éligibilité et l’exclusion des trajets en cours.
  Les gardes de session/compte, les verrous contre les doubles validations et les
  protections au démontage du parcours sont conservés.
- **Animation et lisibilité :** `hooks/home/useLocationPermissionPulse.ts`
  anime uniquement le contour du bouton, en douceur sur un cycle de 2,8 secondes.
  Le texte et le fond restent stables. L’animation utilise le pilote natif,
  `isInteraction: false`, sans minuteur JavaScript, écoute par image ni requête
  réseau périodique. Elle s’arrête hors accueil visible, pendant une autorisation
  et au démontage. La préférence « Réduire les animations » produit un bouton
  statique ; elle est respectée aussi si sa lecture échoue ou répond tardivement.
  Le guide `frontend-skill` a conduit à ce seul accent animé, sans nouvelle carte
  ni déplacement de la carte géographique ou du panneau inférieur. Références :
  [Animated](https://reactnative.dev/docs/animated),
  [AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo) et
  [autorisation Android en arrière-plan](https://developer.android.com/develop/sensors-and-location/location/permissions/background).
- **Comportements conservés :** ni nouvelle permission demandée automatiquement
  à l’ouverture, ni alerte bloquant l’accès à l’accueil. Les boutons profil et
  notifications, le suivi rapide en trajet, la cadence hors trajet, les sonneries,
  le backend et les dépendances natives ne sont pas modifiés. Une autorisation
  accordée ne signifie pas qu’une position a été livrée au serveur.
- **Vérifications :** **121 tests JavaScript ciblés réussis**, sur
  `homeBackgroundLocation`, `nearbyDriverPermission`, `homeCompactLayout`,
  `homeForegroundLifecycle`, `homeRoleLoader`, `nearbyDriverLocation`,
  `nearbyDriverDelivery`, `nearbyDriverPresence` et `requestDetailModules`
  dans `tests/*.test.js`. Cas ajoutés : visibilité par rôle, accord/refus/réglages,
  révocation, préférence désactivée, changements de compte, doubles validations,
  absence de polling lors de cinquante rendus, web exclu et cycle de l’animation.
  TypeScript et ESLint ciblé sans erreur. Contrôles des frontières réseau,
  tailles de sources (1 157 sources, aucune au-delà de 400 lignes) et
  `git diff --check` réussis.
- **Limites :** permissions, animations et GPS natifs simulés dans ces tests.
  Aucune compilation, publication ni validation visuelle/native sur appareil
  physique pour ce changement. À vérifier sur Android/iPhone : premier accord,
  refus puis réglages, retour sans autorisation, révocation, grande police,
  réduction des animations et envoi réel d’une position après autorisation.
  Le bouton améliore la découverte du parcours ; il ne garantit ni un envoi
  exactement toutes les trois minutes, ni l’absence de crash natif.

## 2026-10-20 — Connexion à quatre chiffres et initiale sur l’accueil

- **Périmètre et problème constaté :** le clavier ne revenait plus chez
  l’utilisateur après un mot de passe incorrect. L’inspection du parcours révèle
  une tentative de remise au point du champ pendant l’affichage du modal d’erreur,
  ainsi qu’un simple `focus()` sur un champ transparent de très petite taille.
  Android peut conserver le focus après la fermeture du clavier : la
  [documentation React Native](https://reactnative.dev/docs/textinput#known-issues)
  mentionne cette limite de réouverture. Il s’agit ici d’un diagnostic de code,
  pas d’une reproduction native sur téléphone pendant cette intervention.
- **Saisie et reprise appliquées :**
  `components/auth/PasswordCodeInput.tsx` conserve un seul champ natif sécurisé
  derrière quatre cases, avec toute la ligne comme cible tactile. Si Android
  conserve le focus sans clavier visible, le champ est défocalisé puis refocalisé
  à l’image suivante. La reprise est annulée si le champ change, si l’écran est
  masqué/démonté ou si une connexion est déjà en cours. La reprise après erreur
  attend que le champ soit de nouveau éditable. Aucun chiffre secret n’est ajouté
  aux libellés d’accessibilité, journaux ou stockages.
- **Connexion plus directe :** `hooks/auth/usePinLogin.ts`,
  `hooks/auth/usePhoneAuthActions.ts`, `components/auth/steps/PinStep.tsx`,
  `features/auth/passwordLoginError.ts`, `features/auth/authCode.styles.ts` et
  `app/auth.tsx` affichent l’erreur sous les cases, sans modal bloquant. Les quatre
  chiffres sont effacés après un échec ; le numéro utilisé et « Changer de numéro »
  sont visibles. Les erreurs réseau, identifiants, limitation des tentatives et
  indisponibilité serveur ont des messages distincts. Le verrou de soumission
  reste actif pendant la requête et l’enregistrement sécurisé. La génération de
  session créée synchroniquement par cet enregistrement est capturée avant son
  attente : son propre échec reste visible, mais une réponse après une véritable
  déconnexion/changement de session est ignorée.
- **Vocabulaire harmonisé :** « mot de passe à quatre chiffres » remplace
  « code PIN » dans la connexion, la création, la récupération et la modification
  du mot de passe. Fichiers complémentaires : `components/auth/types.ts`,
  `components/auth/steps/ResetPinStep.tsx`, `features/auth/otpDelivery.ts`,
  `components/profile/ProfilePinModal.tsx`, `hooks/profile/useProfileController.ts`,
  `hooks/profile/useProfilePin.ts` et `utils/errorHelpers.ts`. Les codes de
  vérification WhatsApp/SMS restent nommés comme tels. Le guide `frontend-skill`
  a orienté une hiérarchie simple, des consignes courtes et une erreur locale,
  sans ajouter de nouvel écran ni d’animation décorative.
- **Accueil :** `hooks/home/useHomeSheet.ts`,
  `components/home/HomeDashboard.tsx` et `components/home/HomeHeader.tsx` utilisent
  uniquement la première lettre du nom du compte connecté, en haut à droite ;
  la cloche passe à gauche. Le modèle utilisateur actuel ne fournit pas de champ
  `username` distinct : la source est `name`, puis `firstName` en repli, et « ? »
  si les deux sont absents. Les accents sont normalisés ; une seule lettre est
  rendue. Aucun chargement de photo n’est ajouté à cet en-tête. La salutation
  conserve le prénom, les photos du profil/des cartes restent inchangées, et les
  actions profil/notifications ainsi que l’indication de trajet actif sont conservées.
- **Précautions contre les régressions :** mêmes API et champs internes `pin` /
  `newPin`, même limite de quatre chiffres et même connexion automatique au
  quatrième chiffre ; pas de nouvelle tentative réseau automatique. Le bouton
  de connexion reste protégé contre les doubles appuis. Aucun changement des
  mots de passe Mobile Money, permissions, notifications, GPS, dépendances natives,
  backend ou fichier `.env`. Les modifications préexistantes du dépôt sont préservées.
- **Vérifications réalisées :** **192 tests JavaScript réussis, aucun échec**,
  sur seize fichiers : `passwordCodeInput`, `pinAutoLogin`, `authKeyboardLayout`,
  `otpDelivery`, `homeCompactLayout`, `pinReset`, `authSubmissionLoading`,
  `authNavigationSession`, `authThunkLifecycle`, `authFlowDraft`,
  `authInternationalPhone`, `profileModules`, `homeForegroundLifecycle`,
  `homeCompactCards`, `authWelcome` et `googleAuthFlow` dans `tests/*.test.js`.
  Couverture ajoutée : focus Android répété, annulation de reprise, chargement,
  erreur en ligne, changement de numéro, échecs de stockage/changement de session,
  messages et initiale. TypeScript sans erreur ; ESLint ciblé sans erreur, avec
  quatre avertissements préexistants (types de tableaux dans `components/auth/types.ts`
  et ordre d’import dans `utils/errorHelpers.ts`). Contrôles des frontières réseau,
  tailles de sources (1 155 sources, aucune au-delà de 400 lignes) et
  `git diff --check` réussis.
- **Limites restantes :** événements clavier et composants natifs simulés dans
  les tests ; aucune compilation, publication ou validation visuelle/native sur
  appareil physique réalisée. À vérifier sur Android et iPhone : deux saisies
  incorrectes successives, appui sur chaque case, clavier fermé avec Retour puis
  réouvert, connexion réussie, changement de numéro, récupération, réseau coupé,
  grande police et lecteur d’écran. Ces résultats ne certifient pas la disparition
  d’un crash natif ni la réouverture du clavier sur tous les appareils.

## 2026-10-20 — Autorisation de localisation en veille plus explicite

- **Périmètre et constat :** écran `Profil > Alertes conducteur` et demande
  d’autorisation au démarrage de la navigation conducteur. Le précédent parcours
  expliquait la localisation en arrière-plan avec un bouton unique et des messages
  techniques. Après un refus, il indiquait les réglages à modifier sans bouton
  pour y accéder. L’autorisation système et l’envoi effectif de position pouvaient
  être confondus.
- **Interface appliquée :** `components/profile/NearbyDriverLocationPermission.tsx`
  présente le bénéfice « Recevoir les demandes près de vous », la collecte et
  l’envoi au serveur environ toutes les trois minutes, y compris en veille ou dans
  une autre application. `components/location/BackgroundLocationConsent.tsx`
  ajoute une case accessible, non précochée pour un nouvel accord, avec une grande
  zone tactile. Elle active « Autoriser et continuer » mais ne remplace jamais
  l’autorisation du téléphone. « Pas maintenant » enregistre le refus du suivi
  hors trajet ; une réactivation volontaire reste possible. Les autorisations
  déjà accordées et le comportement automatique existant sont conservés.
- **Parcours système :** `hooks/profile/useNearbyLocationPermission.ts` sépare ce
  choix des permissions réelles, demande d’abord la localisation au premier plan,
  puis celle en arrière-plan. Un refus non redemandable propose « Ouvrir les
  réglages ». Le retour sur l’écran relit les deux permissions ; l’activation
  après les réglages exige toujours l’accord explicite du compte courant.
  Désélectionner la case, refuser, changer de compte/session/rôle ou démonter
  l’écran ne transmet pas cet accord à un autre utilisateur. Les doubles appuis,
  réponses de lectures anciennes et retours pendant une opération native sont
  protégés. Aucun envoi GPS ne démarre du seul fait de cocher la case.
- **Navigation et présentation :**
  `features/driver-navigation/NavigationLocationDisclosure.tsx` explique simplement
  le partage avec les passagers pendant le trajet et utilise la même case.
  « Pas maintenant » et le retour Android restent possibles ; le contenu peut
  défiler sur petit écran. `app/driver-availability.tsx` retire une introduction
  redondante. Le guide `frontend-skill` a orienté la hiérarchie sobre, les actions
  lisibles et l’absence d’animation lourde ; les nouvelles actions utilisent
  l’orange contrasté partagé dans `constants/actionColors.ts`.
- **Comportements conservés :** aucun changement des tâches natives, du backend,
  des cadences GPS, de la sonnerie ou des routes prioritaires. Le suivi de proximité
  reste distinct du suivi d’un trajet en cours. « Autorisé sur ce téléphone »
  indique uniquement les permissions lues ; le dernier envoi confirmé est affiché
  séparément. Son rafraîchissement local toutes les trente secondes n’est actif
  que sur cet écran visible, avec suivi autorisé ; aucun nouveau polling réseau.
- **Vérifications :** **103 tests JavaScript ciblés réussis**, dont
  `tests/nearbyDriverPermission.test.js` (accord, refus, réglages, révocation,
  ordre des permissions, concurrence et isolation des sessions) et
  `tests/requestDetailModules.test.js` (case accessible et modal optionnel).
  Les huit autres fichiers exécutés couvrent les tâches de proximité, les
  livraisons, la présence, la fiabilité GPS, les sessions conducteur et les
  en-têtes de navigation. TypeScript, ESLint sur les fichiers touchés, frontières
  réseau, limites de taille des sources et `git diff --check` réussis.
- **Limites :** autorisations et événements natifs simulés dans ces tests.
  Aucune installation, compilation, publication ou validation visuelle/native sur
  téléphone réalisée pour ce changement. Vérifier sur Android et iPhone : premier
  accord, refus, ouverture des réglages, retour avec/sans autorisation, grande
  police et démarrage d’un trajet. Le système peut retarder les envois ; la case
  ne garantit ni trois minutes exactes, ni la réception d’une notification.
  Le passage par les réglages sur Android 11+ suit la
  [documentation Android](https://developer.android.com/develop/sensors-and-location/location/permissions/background)
  et le contrat de `requestBackgroundPermissionsAsync` dans la version installée
  de `expo-location` (`node_modules/expo-location/src/Location.ts`).

## 2026-10-20 — Rétablissement de l’écran prioritaire à l’entrée

- **Périmètre et problèmes constatés dans le code :** reprise mobile au démarrage,
  au retour au premier plan et à l’ouverture d’une notification. Une navigation de
  trajet vérifiée après le budget visuel de deux secondes devenait une proposition
  à toucher, au lieu de s’ouvrir. Un résumé « aucune activité » et des détails
  vieux de moins de trente secondes pouvaient masquer un trajet démarré pendant
  l’absence. Les clics natifs sur une commande proche avant le chargement du profil
  n’étaient pas conservés ; une seconde ouverture volontaire d’une même invitation
  pouvait être supprimée par la déduplication.
- **Solution appliquée — entrée :** `hooks/navigation/useEntryPresentation.ts`
  ouvre automatiquement une navigation conducteur/passager vérifiée, même après
  l’expiration du loader, si l’utilisateur n’a pas quitté l’écran d’entrée.
  `useActiveRideResume.ts` et `useRequestEntryResume.ts` ne concluent plus à
  l’absence de trajet/demande avec un résumé d’une précédente visite.
  `services/appActivity.ts` fournit une date de retour au premier plan commune,
  transmise par `components/ActiveRideResumeCoordinator.tsx`. Un résumé terminé
  avant le montage de ce composant, mais pendant cette même visite, reste valable.
  `features/navigation/entryFreshness.ts` interdit la réutilisation des détails
  antérieurs à ce retour pour décider de la destination.
- **Solution appliquée — lectures :**
  `components/AccountActivityCoordinator.tsx` réactualise le petit résumé partagé
  à chaque réabonnement au premier plan, même après une absence courte. Les listes
  dont les révisions sont déjà réconciliées restent réutilisées ; aucun nouveau
  polling parallèle, stockage de route, GPS ou appel HTTP direct n’est ajouté.
  Le repli existant sur les listes fraîches reste utilisable si le résumé échoue,
  notamment sur un ancien backend.
- **Solution appliquée — notifications :**
  `features/notifications/pendingDriverOpen.ts` conserve aussi les clics sur les
  commandes proches avant le chargement du profil.
  `hooks/notifications/useDriverNotifications.ts` ouvre leur détail pour les
  notifications distantes iOS et les cartes Android, distingue une répétition
  automatique d’un nouveau clic volontaire, et ne rejoue aucune acceptation ou
  aucun refus au démarrage. `components/NotificationHandler.tsx` laisse ce flux
  au gestionnaire spécialisé pour éviter une seconde redirection différée.
- **Comportements conservés :** navigation d’un trajet en cours prioritaire sur
  une demande en attente ; rôle déterminé par la participation réelle au trajet,
  et non uniquement par le rôle du compte. La demande en attente de son auteur
  s’ouvre aussi pour un compte conducteur. La règle existante des demandes déjà
  acceptées mais non démarrées est conservée. Les écrans explicitement ouverts,
  les paiements, conversations, formulaires, superpositions et retours volontaires
  à l’accueil ne sont pas remplacés par une réponse tardive. Les demandes expirées,
  annulées ou étrangères, les déconnexions et changements de compte restent
  contrôlés. Ouvrir le détail ne constitue ni une réponse ni un acquittement
  automatique de la sonnerie. Le loader garde son budget visuel de deux secondes ;
  un échec réseau ne devient pas un écran bloquant illimité.
- **Vérifications :** tests JavaScript de reprise conducteur/passager, demande
  personnelle d’un conducteur, cache vide lors d’un retour rapide, détail ancien
  encore « à venir », résultat après deux secondes, résumé obtenu avant montage,
  alertes restaurées et clics avant profil/renouvelés. Les groupes de tests couvrent
  aussi les actions natives simulées, la sonnerie, la synthèse vocale et les
  protections de session. **310 tests ciblés réussis, aucun échec**, exécutés
  ensemble avec deux fichiers de test simultanés. `tsc --noEmit`, ESLint sur les
  fichiers source modifiés, contrôle des frontières réseau, contrôle de taille
  des sources et `git diff --check` réussis. La suite globale de publication n’a
  pas été relancée dans cette intervention ; ces résultats concernent les tests
  ciblés, pas une certification de toute l’application.
- **Limites :** pas de compilation, déploiement, modification du backend ni essai
  sur téléphone physique dans cette intervention. Les ponts natifs et événements
  de notification sont simulés dans les tests JavaScript. La reprise réelle à
  froid, après veille et sur clic de notification reste à essayer sur Android et
  iPhone avec un compte conducteur puis passager. Une vérification réseau qui
  échoue ne permet pas de garantir une redirection automatique ; aucune disparition
  des crashs, amélioration chronométrée native ou livraison de push n’est annoncée.

## 2026-10-20 — Fiabilité des alertes de trajet, réponses persistantes et réveil de l’écran

- **Périmètre et constats :** correctifs de l’audit du flux commandes/réservations,
  dans le mobile et le dépôt voisin `zwanga-backend`, sans déploiement ni exécution
  de migration. Une promesse native sans réponse pouvait bloquer les affichages
  suivants ; une deuxième action volontaire sur une commande proche était ignorée.
  Les réponses passager n’utilisaient pas toutes la file transactionnelle, et une
  réponse différée pouvait décrire une décision devenue obsolète. La durée de vie
  des propositions était plus courte que le délai de reprise d’un worker interrompu.
- **Affichage et actions mobiles :** `services/driverNotifications.ts` borne la
  préparation et l’affichage natifs, libère les tentatives interrompues et contrôle
  les résolutions tardives sans annuler une tentative plus récente. Le passage en
  veille avant l’affichage ne laisse plus un enregistrement empêchant la reprise.
  `services/nearbyNotificationAction.ts` déduplique uniquement les actions en cours :
  un deuxième clic volontaire peut rouvrir la commande. Les commandes programmées
  conservent le choix du véhicule et l’accord du passager pour le partage ; aucun
  véhicule n’est choisi automatiquement par une action de notification.
- **Carte durable, son borné :** en réception Android en arrière-plan, la carte
  d’une réservation/commande proche reste présente après une seule lecture de la
  sonnerie embarquée (environ 29 secondes). `loopSound` est désactivé sur cette
  carte et `timeoutAfter` réservé aux offres immédiates exclusives, dont la date
  limite métier reste obligatoire. Une carte encore présente ne signifie pas que
  la demande est toujours disponible : la fiche et le serveur relisent son état.
  Le relais temporaire premier plan/arrière-plan et le lecteur au premier plan
  ne changent pas. Il ne s’agit pas d’une sonnerie illimitée en veille.
- **Réveil de l’écran demandé par l’utilisateur :** les cartes sonores fraîches
  conservent `lightUpScreen: true` après validation de
  `services/rideAlertScreenWake.ts` et du pont Android `DriverAlertModule.java`.
  Tests ajoutés pour réservation, commande proche, seconde alerte distincte et
  mise en veille pendant l’initialisation. Aucun `fullScreenAction`, lancement
  forcé d’activité, déverrouillage, hausse du volume ou contournement du mode
  silencieux/« Ne pas déranger ». Une alerte arrivée hors de sa fenêtre sonore
  reste silencieuse et ne demande pas de réveil. Le code de réveil natif existait
  déjà ; sa présence et ses protections ont été vérifiées, pas son comportement
  sur un téléphone physique. iOS conserve ses notifications APNs et les choix de
  l’utilisateur pour l’écran verrouillé. L’option correspond à
  [Notifee `lightUpScreen`](https://notifee.app/react-native/reference/notificationandroid/#lightupscreen) ;
  la permission `WAKE_LOCK` est présente dans le manifeste debug fusionné local
  inspecté, sans compilation ni validation d’un nouvel artefact release.
- **Secours Android v4 :** `services/driverAlertFallback.ts`,
  `hooks/auth/usePushRegistration.ts` et `store/api/driverDispatchApi.ts` créent
  un canal privé silencieux avant d’annoncer la capacité v4. Le serveur ajoute
  alors les champs `title`/`message` et le `body` JSON interprétés nativement par
  Expo SDK 54, avec un identifiant stable. La carte Notifee enrichie reste seule
  responsable de la sonnerie et des actions, et retire le secours après affichage
  réussi ou décision correspondante. En cas de tâche JS indisponible, le secours
  propose d’ouvrir l’application, sans boutons de décision ni sonnerie garantie.
  Durée de transport : cinq minutes pour réservation/commande proche, échéance
  métier pour offre exclusive. Les textes optionnels sont bornés et les métadonnées
  limitées aux champs nécessaires pour ne pas dépasser la taille FCM.
  Le contrat a été vérifié dans les sources natives Expo installées, pas avec un
  push réel. Une course entre les deux présentations natives reste à vérifier sur
  appareil ; un doublon visuel transitoire ne peut pas être exclu.
- **Compatibilité :** Android v1–v3 garde son protocole de transport, iOS reste
  en capacité v2. Un rejet de validation HTTP 400 autorise le repli v4 → v3 → v2,
  mais pas une panne réseau, un 401 ou un 5xx. Un canal de secours non créé empêche
  d’annoncer v4 et laisse la prochaine tentative le préparer. L’enregistrement du
  push ordinaire reste indépendant. Les permissions refusées restent respectées.
- **Backend — réponses persistantes :** `src/bookings/bookings.service.ts` place
  les acceptations/refus des écrans et des actions natives dans la même file,
  avec une clé d’événement unique, dans la transaction de décision. Les anciennes
  notifications directes de ces méthodes sont retirées. Les réservations privées
  liées à une commande ne produisent pas un second retour passager.
  `src/trip-requests/trip-requests.service.ts` enregistre la sélection finale et
  sa notification ensemble, sous verrou de commande ; la création préalable du
  trajet et de sa réservation reste un parcours en plusieurs transactions, pas
  une atomicité complète nouvellement garantie. Le push n’est pas envoyé sous
  verrou SQL et l’absence temporaire de jeton n’empêche pas de mémoriser l’événement.
- **Backend — livraison et reprise :** `src/notifications/notifications.service.ts`
  traite aussi `booking_response` et `trip_request_accepted` dans la file urgente.
  `ride-response-delivery.ts` relit destinataire, décision, conducteur sélectionné,
  trajet et, pour les nouveaux événements, date de sélection avant livraison.
  `recover-driver-offer.ts` peut renouveler une fenêtre interrompue/échouée au plus
  deux fois, pendant cinq minutes, jamais un événement déjà marqué envoyé ni une
  offre acceptée/refusée/annulée. L’offre immédiate garde son identifiant et sa
  durée configurée ; la reprise revérifie commande, conducteur éligible, véhicule,
  places, position utilisable à 5 km et absence d’autre offre en attente.
  Les commandes programmées renouvellent seulement leur fraîcheur de transport,
  puis repassent la validation métier et le consentement de partage existants.
  Le nombre de workers et le bail de reprise de 120 secondes ne sont pas augmentés.
- **Autres fichiers backend :** `android-driver-backup.ts` prépare le secours
  FCM ; `src/trip-requests/dispatch/dispatch.dto.ts` et `dispatch.service.ts`
  acceptent la capacité v4 et ajoutent la date de sélection aux retours concernés.
  `src/notifications/entities/notification.entity.ts`,
  `src/database/migrations/1780000084000-RideResponseOutbox.ts` et l’index des
  migrations préparent un index partiel urgent v3 **additif**, sans supprimer
  l’index v2, rejouer l’historique ou modifier une décision existante.
  Migration non exécutée : vérifier taille de table et fenêtre de maintenance
  avant application ; délais locaux de verrou de 3 s et de requête de 30 s.
- **Comportements conservés :** exclusion de l’auteur de sa propre alerte,
  contrôles de session et de destinataire, consentement de partage, GPS conducteur
  toutes les trois minutes hors trajet et cadence active existante. Aucune
  modification du rayon de 5 km, de la politique de dernière position connue,
  de l’authentification, des paiements, de l’interface ou des réglages système.
- **Vérifications :** 90 tests mobiles ciblés réussis et 224 tests backend ciblés
  réussis dans 11 suites (notifications,
  réponses de réservation, commande acceptée, diffusion programmée et données
  vocales) ; compilation TypeScript backend sans émission réussie. Côté mobile,
  compilation TypeScript sans émission, ESLint, frontières réseau et taille des
  sources réussis. Contrôle global mobile : **2 328 tests, 2 326 réussis, un échec
  et un test non exécuté**. L’échec de
  `tests/requestDecisionLayout.test.js:162` (`Unexpected token 'typeof'` dans le
  chargement Node de React Native) était déjà observé lors de l’audit ; confirmé
  séparément après ces changements (huit tests réussis, le même échec). Ce test
  et l’écran concerné n’ont pas été modifiés ici. Le contrôle global de release
  n’est donc **pas vert**, malgré la réussite des tests ciblés de notification.
  Les 29 tests des trois nouvelles suites backend ont aussi été relancés après
  ajustement du contrôle de date de sélection, avec succès.
  Régressions ajoutées/modifiées dans `tests/driverNotifications.test.js`,
  `driverNotificationActions.test.js`, `driverAlertFallback.test.js` et
  `pushRegistration.test.js`. Côté backend :
  `src/notifications/ride-delivery-reliability.spec.ts`,
  `src/bookings/booking-response-outbox.spec.ts`,
  `src/bookings/bookings.service.spec.ts`,
  `src/trip-requests/accepted-request-outbox.spec.ts` et assertions de file urgente
  de `src/notifications/notifications.service.spec.ts`.
  Les tests d’affichage utilisent des doubles JS des ponts natifs ;
  les tests backend utilisent des repositories/transactions simulés. Ils ne
  prouvent ni livraison FCM/APNs, ni plan SQL, ni absence de crash natif.
- **Limites de disponibilité :** aucun test sur appareil physique, téléphone
  réellement verrouillé, économie d’énergie constructeur, arrêt forcé ou réseau
  réel n’a été effectué. Un accusé FCM/Expo reste une acceptation du fournisseur,
  pas une preuve d’affichage ou de sonnerie. Les notifications déjà marquées
  envoyées ne sont pas rejouées automatiquement. Backend, migration et application
  restent à livrer puis à vérifier ensemble, sur Android et iPhone.

## 2026-10-20 — Parrainage rémunéré uniquement sur les transactions éligibles

- Demande : supprimer le gain fixe à l’inscription ou au rattachement du filleul ; conserver les pourcentages sur ses abonnements et trajets éligibles payés.
- `app/referrals.tsx` précise l’absence de bonus d’inscription, la nécessité d’un trajet terminé et payé et l’exclusion du Pro payé avec le bonus Zwanga. Pas de changement de navigation ni de requête supplémentaire.
- Le backend associé renvoie toujours `attributionBonusTokens`, désormais à zéro, sans supprimer les anciens crédits. Les contrats du mobile, le retrait du disponible, le taux de 10 FC et les seuils restent inchangés. Le crédit est bloqué côté serveur indépendamment d’une livraison mobile.
- Vérifications : assertion de rendu ajoutée dans `tests/referralScreenPerformance.test.js` ; **77 tests JavaScript de parrainage réussis**, contrôle TypeScript sans émission réussi et contrôle des diffs validé. Aucun paiement réel, essai sur téléphone, déploiement ou modification AWS/CI/CD.

## 2026-10-20 — Retrait du parrainage disponible et jeton à 10 FC

- Demande : afficher clairement les refus de retrait et harmoniser la valeur d’un jeton à 10 FC. Le réseau à trois niveaux du tableur est abandonné sur instruction explicite ; aucune nouvelle rémunération réseau n’est activée.
- `features/referrals/referralWithdrawalValidation.ts`, `hooks/referrals/useReferralActions.ts` et `app/referrals.tsx` : contrôle du minimum serveur, des deux décimales, du seul solde disponible, du KYC et du blocage serveur ; erreur sous la saisie et dialogue. Le solde est actualisé avant le POST et un verrou local empêche le double clic. Les erreurs serveur restent visibles. Pas de nouvelle tentative automatique d’un retrait incertain.
- Le texte annonçant que les jetons achetés sont retirables est retiré. Un échec de rafraîchissement après transmission ne présente plus le retrait comme échoué ; les réponses contenant un versement `failed`/`cancelled` affichent un refus.
- `constants/paymentFeatures.ts`, `features/arrival-payment/tokenQuote.ts`, `types/trips.ts` et `hooks/arrival-payment/useArrivalPaymentState.ts` : taux CDF de secours fixé à 10 ; taux serveur et devis historique de réservation prioritaires. Les jetons manquants se rechargent au tarif actuel, sans modifier le prix en jetons d’une ancienne réservation.
  `app/wallet.tsx` transmet aussi le taux serveur à `WalletTopUpModal.tsx` : le texte de recharge n’annonce plus un taux fixe obsolète de 100 FC.
  `store/api/booking/serverTypes.ts` et `bookingMapper.ts` conservent le devis reçu de l’API au lieu de le perdre lors du mapping ; un test traverse ce mapping et le vrai hook de paiement pour les anciens taux 25/100 et le nouveau taux 10.
- Backend associé : futurs bonus de bienvenue de 500 jetons (5 000 FC), minimum de retrait de 1 000 jetons (10 000 FC), aucune commission de parrainage sur l’abonnement offert/payé en jetons. Les anciens crédits ne sont pas complétés.
- Vérifications : **203 tests JavaScript ciblés réussis** (retraits, portefeuille, parrainage, paiements à l’arrivée et interruptions), dont 20 dans `tests/referralWithdrawals.test.js` ; compilation TypeScript sans émission et `git diff --check` réussis. Le test de recharge vérifie le taux courant et la priorité du serveur ; le test du mapping vérifie les devis 10/25/100 jusqu’au hook réel. Validation sur téléphone et parcours Mobile Money réel non effectués. Aucun déploiement ni changement CI/CD/AWS. Une livraison mobile sera nécessaire pour les nouveaux messages et calculs locaux ; les anciennes apps ne sont pas modifiées par le seul déploiement backend.

## 2026-10-20 — Actions Notifee et fiche de notification avec tarif et destination

- **Demande et constat :** le conducteur doit pouvoir répondre depuis la
  notification puis arriver dans la fiche concernée, sans la chercher dans
  l’application. Les invitations disposaient déjà d’actions natives et d’un
  traitement serveur, mais leur résultat ne déclenchait pas toujours cette
  navigation. Les commandes programmées n’exposaient qu’« Ignorer ». Le relais
  de sonnerie en arrière-plan perdait aussi les détails du trajet.
- **Présentation appliquée :** `features/notifications/driverNotificationCard.ts`
  centralise titre, prix/budget **par place**, destination, départ, places et
  horaire à Kinshasa. `services/driverNotifications.ts` et
  `services/backgroundRideRinging.ts` utilisent cette présentation et le texte
  Android développé `BIGTEXT`. Le prix absent ou invalide n’est jamais transformé
  en gratuit ; les anciens messages conservent leur texte disponible. Aucun
  téléchargement d’image, requête HTTP supplémentaire ou nouveau minuteur.
- **Actions :** « Refuser » et « Accepter » ouvrent l’activité Android via
  `launchActivity: 'default'`, au premier plan comme en veille. Les réservations
  et offres immédiates utilisent leurs endpoints authentifiés existants. Les
  commandes sans offre exclusive ouvrent le choix de véhicule existant via
  `services/nearbyNotificationAction.ts` ; leur refus retire seulement l’alerte
  de ce conducteur, sans annuler la commande du passager. Une proposition de
  partage conserve « Voir la demande » et l’accord explicite du passager.
- **Navigation et fiabilité :** `driverNotificationResponse.ts`,
  `pendingDriverOpen.ts`, `driverInvitation.ts`, `useDriverNotifications.ts` et
  `notifeeBackgroundHandler.ts` transmettent une destination en lecture seule
  après la réponse, immédiatement si l’interface est prête ou à son retour au
  premier plan. Les routes existantes contrôlent l’accès et relisent l’état.
  Une copie d’action récupérée au démarrage ouvre la fiche mais ne rejoue
  jamais la mutation. Le service déduplique les événements natifs concurrents ;
  un échec réseau reste « Réponse à vérifier » et un nouveau clic volontaire
  peut réessayer. Changement de session et mauvais destinataire empêchent la
  réponse. Les lectures de stockage et opérations natives de retour sont
  bornées ; la navigation n’attend pas la notification de résultat.
- **Backend préparé sans déploiement :** dans `zwanga-backend`,
  `ride-speech-data.ts`, le subscriber des réservations et les producteurs
  `dispatch.service.ts`, `scheduled-request-alert.ts`, `shared-trip-alert.ts`
  ajoutent `ridePricePerSeat` et `ridePriceKind` aux métadonnées existantes.
  Aucun changement SQL, migration, sélection des conducteurs, consentement
  de partage ou calcul du tarif. Les ajouts du partage en cours sont conservés.
- **Comportements conservés :** visibilité privée sur écran verrouillé,
  permissions et réglages sonores système, limites de sonnerie, exclusion de
  l’auteur, validation serveur des délais et de la disponibilité, catégories
  iOS des invitations existantes. Un appui sur le corps de la notification
  reste une consultation, jamais une acceptation. Pas d’écran plein appel ni
  de déverrouillage forcé.
- **Vérifications :** 61 tests JavaScript ciblés réussis (carte, actions,
  double événement, démarrage à froid, retour de veille, expiration, réseau,
  compte, absence d’acceptation implicite). Le contrôle complet
  `node scripts/check-release.cjs` passe TypeScript, ESLint, frontières réseau
  et taille des sources. Sur 2 297 tests : **2 295 réussis, un échec et un
  ignoré**, en environ 210 secondes pour la phase de tests. L’échec déjà présent
  dans `tests/requestDecisionLayout.test.js:162` est `Unexpected token 'typeof'`
  au chargement de la fiche de commande avec les nouveaux imports du partage ;
  aucun correctif de cet écran ou de ce test hors périmètre n’a été appliqué.
  Les quatre suites Jest backend (`ride-speech-data`, subscriber transactionnel,
  `scheduled-request-alert`, `dispatch-speech`) passent leurs **40 tests**.
  Ces résultats utilisent des doublures natives et ne prouvent pas la livraison
  FCM/APNs ni le comportement sur appareil verrouillé.
- **Limites :** pas de test physique Android/iPhone, de build natif ou de
  déploiement dans cette intervention. Le backend préparé doit être publié
  pour que les nouvelles notifications contiennent systématiquement le prix.
  Les notifications déjà envoyées ne sont pas enrichies rétroactivement.
  Android peut masquer le contenu privé ou replier les boutons selon les
  réglages. Les limites de livraison des push data-only en veille restent
  celles documentées dans l’entrée précédente.
- **Références officielles consultées :** [actions Android Notifee](https://notifee.app/react-native/docs/android/interaction/)
  et [événements premier/arrière-plan](https://notifee.app/react-native/docs/events/).

## 2026-10-20 — Reprise des sonneries successives et réveil de l’écran verrouillé

- **Périmètre et constats :** l’audit a reproduit, avec des doublures natives,
  deux blocages au premier plan : un lecteur Android libéré sur erreur restait
  considéré comme actif par JavaScript ; trois échecs temporaires pouvaient
  ensuite empêcher une nouvelle demande de sonner tant qu’une ancienne alerte
  restait en attente. Cela ne prouve pas que ces scénarios expliquent le retour
  du testeur, dont le téléphone et les circonstances ne sont pas connus.
- **Reprise appliquée :** `services/foregroundRideSound.ts` vérifie l’état réel
  du lecteur Android au maximum toutes les cinq secondes, seulement lorsqu’une
  alerte existe au premier plan, avec une seule lecture en vol et un délai
  maximal de trois secondes. `ForegroundAlertPlayer.java` et
  `DriverAlertModule.java` exposent une lecture sur le thread principal,
  liée au propriétaire du lecteur et respectant les réglages système. Une
  réponse tardive ne peut pas arrêter un lecteur plus récent. Une pause pour
  la voix n’est pas traitée comme une panne. Pas de nouveau minuteur en veille.
- **Budget de reprise :** `hooks/notifications/useRideRinging.ts` transmet
  l’identité de la dernière alerte. Une nouvelle identité réarme les tentatives
  après les erreurs de l’alerte précédente, sans supprimer le recul de cinq
  puis quinze secondes. Trois échecs restent la limite pour un épisode ; un
  démarrage brièvement réussi n’efface plus ce budget. Les doublons et le
  changement d’ordre de la file ne réarment pas les essais. La mémoire des
  épisodes est limitée à cent identités et vidée lors de l’arrêt explicite.
- **Écran verrouillé :** les invitations initiales demandaient déjà
  `lightUpScreen`. `services/backgroundRideRinging.ts` le demande désormais
  aussi lors du passage premier plan → veille. Les deux chemins utilisent
  `rideAlertScreenWake.ts` et la nouvelle méthode native `canLightUpAlertScreen`
  pour vérifier les permissions, le mode silencieux, le volume, « Ne pas
  déranger », le son et l’importance du canal et le blocage de son groupe.
  Cette vérification est bornée à deux secondes ; un échec désactive seulement
  le réveil, pas l’affichage de la notification. Aucun lancement automatique
  d’activité, déverrouillage, changement du volume, permission d’appel plein
  écran ou service permanent ajouté. Sur un ancien binaire sans la méthode,
  le réveil explicite n’est pas demandé : reconstruire Android est nécessaire.
- **Chemin en veille et diagnostics :** `services/driverNotifications.ts`
  ne configure plus les deux catégories APNs sur Android ; les actions Android
  restent gérées par Notifee. Les lectures de session sont strictes et bornées,
  comme la création de canal, pour distinguer stockage indisponible et
  déconnexion. `useDriverNotifications.ts` et `backgroundNotificationTask.ts`
  ne masquent plus les erreurs d’affichage/traitement. `rideAudioDiagnostics.ts`
  conserve des codes statiques, limite chaque code à une occurrence par minute
  et transmet paresseusement les échecs inattendus au rapporteur Crashlytics
  existant en release. Aucun contenu de notification, identifiant de compte,
  coordonnée ou jeton joint. Les permissions refusées, le canal muet et les
  alertes tardives ne deviennent pas des erreurs Crashlytics.
- **Comportements conservés et limites :** filtrage de l’auteur de sa propre
  demande, arrêt après la décision correspondante, priorité de la voix GPS,
  protection des autres comptes et anti-doublon conservés. La sonnerie native
  en veille reste plafonnée à trente secondes et à l’échéance serveur ; aucun
  ancien événement n’est ressuscité. Aucun ciblage serveur, backend,
  infrastructure, `.env`, dépendance ou schéma de base modifié par ce correctif.
  Le risque de non-livraison du push Android « data-only » en veille reste
  présent : les contrôles locaux ne garantissent pas le réveil JavaScript.
  Un transport avec accusé de réception et repli système dédupliqué reste une
  piste distincte, non appliquée ici ; aucun allongement aveugle des invitations
  expirées. iOS garde son transport APNs et les réglages de notifications du
  téléphone ; aucune interface de faux appel ni contournement de Focus ajouté.
- **Vérifications réalisées :** nouveaux scénarios de régression dans
  `rideSoundRecovery.test.js`, assertions complémentaires dans
  `rideAlertSession.test.js`, `rideAudioReliability.test.js` et
  `driverNotifications.test.js`. Les deux fichiers Java modifiés compilent
  avec `javac`, Android API 36 et React Native 0.81.5 locaux ; avertissements
  d’annotation facultative absente et d’API déjà dépréciée, sans erreur.
  Ce contrôle Java isolé n’est ni un APK release construit, ni un essai physique.
  Dernière suite ciblée : **114 tests réussis**, zéro échec. TypeScript sans
  émission, ESLint ciblé et `git diff --check` réussis après les modifications.
  Le contrôle global a validé TypeScript, ESLint, frontière réseau et taille
  des sources, puis exécuté **2 286 tests : 2 284 réussis, un échec, un ignoré**.
  L’échec est `requestDecisionLayout.test.js:162` : les nouveaux imports du
  parcours de partage de trajet ajouté en parallèle ne sont pas doublés par
  ce test (`Unexpected token 'typeof'` au chargement natif sous Node). Une
  vérification en mémoire, avec ces quatre imports doublés et sans édition
  du test, passe les neuf cas du fichier. Ce problème de banc de test n’est
  pas corrigé par la présente modification de sonnerie ; le contrôle global
  ne doit donc pas être annoncé entièrement vert. L’ignoré concerne le
  contrôle Ruby iOS. Aucun essai natif sur appareil ni livraison Crashlytics
  réelle vérifiés.
- **Recette physique restante :** Android puis iPhone : trois demandes
  distinctes successives, refus/acceptation, sonnerie ignorée, application
  ouverte puis téléphone verrouillé, canal muet, mode silencieux/Focus,
  économie d’énergie, coupure réseau, changement de compte et retour après
  expiration. Vérifier le réveil réel et les codes de diagnostic sans données
  personnelles. Ne pas annoncer que les pertes de push ou les crashs ont
  disparu avant ces essais. Aucun build publié ni déploiement effectué.
- **Références officielles consultées :**
  [Notifee — allumage de l’écran](https://notifee.app/react-native/reference/notificationandroid/#lightupscreen),
  [Android 14 — restrictions plein écran](https://developer.android.com/about/versions/14/behavior-changes-14#secure-fsi),
  [Expo — limites des notifications de fond](https://docs.expo.dev/push-notifications/what-you-need-to-know/).

## 2026-10-20 — Proposition de partage pendant un trajet

- Périmètre : écran de détail de commande, `store/api/sharedTripApi.ts` et
  `features/request-detail/SharedTripPanel.tsx`. Un conducteur déjà en trajet
  propose désormais un partage lorsque le backend confirme la disponibilité.
  Les boutons de prise en charge indépendante sont masqués dans ce cas.
- Le passager voit le prix par place et le total, le trajet déjà commencé et la
  possibilité d’autres passagers et arrêts. Seul le bouton de confirmation
  envoie `consent: true`. Refuser ne supprime pas sa commande. Après accord,
  le lien de trajet existant réutilise la navigation et les réservations habituelles.
- Aucun second suivi GPS : le backend utilise la position du trajet en cours,
  puis la dernière position connue en repli. La réception d’un push ne remplace
  pas automatiquement l’écran de navigation. Les modifications GPS préexistantes
  restent intactes.
- Dépendance : migration backend `SharedTripOffers1780000079000` et endpoints
  `/trip-requests/:id/shared-offers`. Le backend exige un consentement explicite,
  même si une ancienne application tente d’accepter via l’ancien endpoint.
- Vérification : tests JavaScript de consentement dans `sharedTripConsent.test.js`.
  Les 24 tests ciblés (consentement, détail, présentation et navigation vers le
  trajet attribué) passent, ainsi que `tsc --noEmit`. La sonnerie de proximité
  est acquittée seulement après confirmation serveur de la proposition.
  Les essais sur appareils Android/iOS, la livraison FCM/APNs et le parcours
  routier réel restent à effectuer avant publication. Aucun déploiement.

## 2026-10-20 — Fiabilisation du GPS en veille et envoi conducteur à trois minutes

- **Périmètre et constats :** suite à l’audit de localisation, corriger les fins
  automatiques calculées sur des points anciens/imprécis, l’arrêt du GPS sur une
  erreur temporaire de stockage et les sessions passager laissées après un
  démarrage natif échoué. Hors trajet, une tâche enregistrée était considérée
  comme suffisante même sans envoi confirmé ; le besoin reste une position
  conducteur actualisée environ toutes les trois minutes pour les commandes
  proches, sans modifier la cadence du trajet en cours.
- **Arrivée automatique :** `services/background/driverTripCompletion.ts`
  exige des observations de moins de trente secondes, datées dans le passé,
  de précision connue et acceptable, non simulées. Une date invalide n’est plus
  remplacée par l’heure actuelle. Le passage devant la destination utilise
  deux observations récentes de la même session, jamais un ancien point sauvé
  sans date fiable. La session et la fraîcheur sont revérifiées avant la
  finalisation, ainsi qu’après un renouvellement de jeton. Les distances
  d’arrivée et la validation des passagers côté serveur restent inchangées.
- **Erreurs temporaires :** `services/tokenRefresh.ts` propose une lecture stricte
  utilisée par `driverBackgroundLocationTask.ts`,
  `passengerBackgroundLocationTask.ts` et la finalisation automatique :
  une indisponibilité de SecureStore remonte comme erreur transitoire plutôt
  que comme déconnexion. `driverBackgroundLocationSession.ts` distingue aussi
  une lecture impossible d’une session absente. Aucun envoi sans session valide ;
  la prochaine tentative peut reprendre sans supprimer le trajet enregistré.
- **Démarrage et reprise :** `services/background/passengerGpsProfile.ts` nettoie
  la session en cas d’échec du démarrage natif et conserve l’état d’attente si
  le passage au profil précis échoue. Les profils conducteur/passager ne
  masquent plus une erreur d’arrêt du service de proximité. Le nouveau
  `retryGpsStart.ts`, utilisé dans `ActiveRideLocationCoordinator.tsx`, permet
  trois reprises après l’essai initial (30, 60, 120 secondes), sans redemander
  les permissions. Le retour en arrière-plan, le changement de trajet et le
  démontage annulent les reprises ; ils n’arrêtent pas un service de trajet
  fonctionnel.
- **Présence conducteur hors trajet :** `nearbyDriverLocation.ts` conserve
  `timeInterval` et `deferredUpdatesInterval` à 180 000 ms, la précision
  équilibrée, les relevés à l’arrêt et la notification Android visible.
  `killServiceOnDestroy` passe à `false` ; les anciennes options sont migrées
  une seule fois au premier plan. Une tâche silencieuse pendant deux
  intervalles peut être relancée au premier plan, sans redémarrage en boucle
  en arrière-plan. Le lot natif choisit le point utilisable le plus récent :
  un point plus récent mais invalide ne masque plus les autres.
- **Envois confirmés et secours :** `nearbyDriverPositionDelivery.ts` expose
  l’échéance d’envoi et garde le verrou anti-doublon, le recul réseau et les
  contrôles de compte/trajet. `DriverPresenceCoordinator.tsx` cherche une
  position récente immédiatement puis lorsque l’envoi est dû, même si une
  tâche native est enregistrée. Une vérification légère en mémoire toutes
  les quinze secondes au premier plan évite de manquer l’échéance à cause
  du délai d’acquittement HTTP ; elle ne lance pas le GPS toutes les quinze
  secondes. Les contrôles natifs restent espacés de trois minutes, hors
  changement explicite de préférence. Le service partagé évite le doublon
  avec un callback natif ayant déjà envoyé la position.
- **Information et sobriété :** `nearbyDriverLocationHealth.ts` mémorise seulement
  des horodatages, par session/compte, sans historique de coordonnées.
  `components/profile/NearbyDriverLocationPermission.tsx` distingue permission
  accordée, envoi confirmé et position ancienne. Pour le passager dont le
  départ est à plus de quinze minutes, `passengerWaitingPolicy.ts`,
  `passengerTrackingTypes.ts`, `passengerTaskLifecycle.ts` et le profil GPS
  espacent les vérifications d’attente à trois minutes. À proximité du départ,
  trente secondes restent utilisées ; une seule lecture de statut peut être
  en vol pour une même réservation et un même état. Le trajet en cours garde
  huit secondes et son profil précis après détection du démarrage. Si le
  conducteur démarre très en avance pendant que le passager reste en veille,
  cette détection peut attendre le prochain relevé d’attente (cible trois
  minutes, soumise au système) : compromis à vérifier sur appareil. La
  réduction des appels attendue est théorique, sans mesure de consommation.
- **Comportements conservés :** permissions du système obligatoires, possibilité
  de désactiver le suivi en veille, arrêt à la déconnexion, priorité au GPS
  du trajet en cours, absence de file d’historique hors ligne et dates natives
  conservées. La politique de dernière position connue sans limite d’âge,
  explicitement demandée le 18 octobre, n’est pas supprimée : une ancienne
  position n’est jamais présentée comme un point GPS actuel. Le ciblage serveur
  à cinq kilomètres et le rappel après six heures ne sont pas modifiés.
- **Vérifications :** nouveaux cas dans `backgroundLocationReliability.test.js`,
  `nearbyDriverPresence.test.js`, `nearbyDriverLocation.test.js`,
  `nearbyDriverDelivery.test.js` et `passengerGpsProfile.test.js`, inclus dans
  le contrôle global ; `test:nearby-drivers` inclut aussi les nouveaux tests de
  fiabilité. Les doublures de `driverAvailability.test.js` ont été adaptées au
  contrôle d’envoi confirmé, au lieu de la seule présence d’une tâche native.
  Contrôle final `node scripts/check-release.cjs` réussi : TypeScript, ESLint
  sans erreur, frontière HTTP RTK Query, 1 143 sources sans dépassement de
  400 lignes, puis 2 266 tests dont 2 265 réussis et un ignoré (Ruby absent
  pour la vérification iOS). `patch-expo-location-batches.cjs --check` confirme
  les protections locales Android à 64 échantillons ; `git diff --check`
  ne signale aucune erreur d’espacement.
- **Limites et recette native restante :** simulations JavaScript uniquement,
  pas de mesure de batterie, de délai réel en veille ni de validation des
  constructeurs Android. Trois minutes est une cadence cible, pas une garantie
  face aux restrictions du système, à une permission retirée ou à un arrêt
  forcé. Vérifier sur Android et iPhone physiques : conducteur immobile/en
  déplacement, écran verrouillé trente minutes, retrait des applications
  récentes, coupure réseau puis retour, début/fin de trajet, changement de
  compte et retrait des permissions. Comparer la date du relevé et sa réception
  serveur, sans journaliser coordonnées ou données personnelles. Aucun
  déploiement, modification de backend/base, fusion Git, changement de `.env`
  ni nouvelle dépendance.

## 2026-10-20 — Ne pas faire sonner l’auteur de sa propre commande

- **Constat et périmètre :** des testeurs signalent qu’un conducteur qui commande
  comme passager entend lui-même la sonnerie de cette demande. La lecture locale
  confirme une protection mobile manquante : le destinataire et le rôle étaient
  contrôlés, mais pas l’égalité entre auteur et destinataire. Le code serveur
  local excluait déjà l’auteur lors de la sélection des conducteurs ; les alertes
  de demande ne transmettaient cependant pas systématiquement `passengerId` et
  la livraison ne contrôlait pas cette propriété. Sans trace du push reçu ni
  comparaison avec le serveur déployé, la cause exacte du cas terrain reste
  non confirmée ; ces défauts de défense sont corrigés, pas présentés comme
  une reproduction native.
- **Mobile appliqué :** nouvelle politique pure
  `features/notifications/requestOwnership.ts`, utilisée par `requestVisibility`,
  `driverInvitation`, `rideSound`, `services/rideAlertSession.ts` et
  `features/navigation/priorityRequestEntry.ts`. Les invitations de demande
  dont l’auteur est le destinataire ne peuvent plus lancer la sonnerie, entrer
  dans la file d’annonces vocales ou devenir la fiche conducteur prioritaire.
  La même protection couvre une réservation adressée à son propre passager.
  `services/backgroundNotificationTask.ts` rejette ces alertes avant les
  branches spécialisées, pour éviter leur conversion en notification générique.
  `hooks/notifications/useRideRinging.ts` retire les notifications Android/Expo
  déjà présentes quand leur auteur est identifiable, sans les restaurer.
- **Backend préparé avec autorisation, sans déploiement :**
  dans le dépôt voisin, les envois immédiats, programmés et historiques ajoutent
  l’auteur. `notifications.service.ts` bloque une livraison vers cet auteur,
  quel que soit le transport Expo/APNs/FCM. `driver-request-owner.ts` résout les
  anciens messages sans auteur par leur demande ou leur offre ; demande absente
  ou supprimée : suppression de l’alerte ; panne de lecture : échec temporaire,
  sans envoi, conservant le mécanisme de reprise. Les requêtes existantes de
  validation avant renvoi excluent l’auteur réel et récupèrent son identifiant,
  évitant une deuxième lecture pour ces alertes. Le guide PostgreSQL a orienté
  ce choix : conditions paramétrées et lectures ponctuelles par clé, aucune
  nouvelle requête par destinataire pour les messages nouvellement produits.
  Détail également dans `zwanga-backend/docs/CHANGEMENTS_TECHNIQUES.md`.
- **Comportements conservés :** les réponses à sa propre commande
  (`trip_request_accepted`, `booking_response`, offres de conducteurs) restent
  disponibles même pour un compte conducteur utilisé comme passager. Les
  demandes des autres passagers, les contrôles de rôle, les délais, les décisions
  authentifiées et le contrôle existant d’unicité du jeton push restent actifs.
  Aucun nouveau polling, accès réseau mobile, abonnement GPS, son natif,
  permission, migration ou changement de volume.
- **Vérifications réalisées :** tests de filtrage, parsing, livraison simulée
  Android/iOS au premier plan et en fond, restauration, file son/voix et entrée
  sur sa commande. `node scripts/check-release.cjs` réussit : TypeScript, ESLint
  (erreurs), frontières réseau, 1 140 sources sous le plafond de 400 lignes et
  **2 241 tests, 2 240 réussis, 1 ignoré** (Ruby indisponible). Le nouveau fichier
  `ownRequestBackgroundNotification.test.js`, ajouté après le lancement de ce
  contrôle, passe ses **2 tests** séparément ; les 22 tests `requestEntryResume`
  sont également repassés. Backend : **226 réussis, 27 ignorés**
  (suite PostgreSQL non configurée), TypeScript `tsconfig.build.json --noEmit
  --incremental false` réussi. Les simulateurs de transport ne contactent ni
  FCM/APNs ni la base de production. Modifications préexistantes du backend
  conservées, notamment les filtres de disponibilité et la gestion boutique.
- **Limites et recette restante :** déployer le correctif serveur et distribuer
  le code mobile avant validation terrain. Un ancien push sans auteur, déjà
  livré par le système, ne permet pas au mobile seul de deviner la propriété ;
  le contrôle serveur est donc indispensable. Aucun rappel rétroactif d’un son
  déjà émis par APNs/Android n’est garanti. Tester avec deux comptes conducteur :
  l’un commande, ne sonne pas lui-même, l’autre reçoit la demande et y accède
  directement ; sa réponse doit notifier le premier dans son rôle de passager.
  Répéter au premier plan, téléphone verrouillé et après relance, sur Android
  et iOS. Aucun essai sur appareil physique, déploiement ou correction de crash
  natif n’est revendiqué dans ce lot.

## 2026-10-20 — Ouvrir directement la demande prioritaire à l’entrée

- **Périmètre et problème constaté :** le passager devait retrouver sa demande
  depuis Home, et le conducteur pouvait entendre une demande sans arriver sur
  sa fiche. La vérification existante trouvait bien la destination, mais
  `useEntryPresentation` transformait tout résultat arrivé après le budget
  visuel de deux secondes en bouton « Voir la demande ». Une course acceptée
  mais non démarrée passait aussi avant une nouvelle demande qui sonnait.
- **Solution appliquée :** `hooks/navigation/useEntryPresentation.ts` ajoute
  une voie de redirection réservée aux fiches de demande vérifiées et aux offres
  immédiates attribuées au conducteur. Branchée dans
  `components/ActiveRideResumeCoordinator.tsx`, elle ouvre la demande sans clic
  supplémentaire même après la fin du court chargement, tant que l’utilisateur
  reste sur l’écran d’entrée sans avoir navigué ailleurs. Le navigateur et la
  carte ne sont pas démontés pour ce contrôle.
- **Sélection :** `hooks/navigation/useRequestEntryResume.ts` donne priorité à
  la demande entrante qui sonne, après la vérification d’un trajet déjà en cours,
  avant une course acceptée mais non démarrée. Elle n’attend plus les publications
  conducteur sans rapport une fois l’absence de navigation en cours établie.
  Si une nouvelle alerte arrive pendant une lecture de détail moins prioritaire,
  cette attente est abandonnée et son résultat tardif ne peut plus rediriger.
  Une perte du rôle conducteur ou du profil chargé pour ce compte pendant la lecture interdit
  aussi l’ouverture automatique de la fiche conducteur.
  Chaque nouvelle lecture prioritaire a sa propre échéance : elle n’hérite pas
  du délai presque écoulé de la lecture interrompue ; les rendus intermédiaires
  ne repoussent pas cette échéance.
- **Parcours conservés :** la demande personnelle en attente ou avec des offres
  est sélectionnée depuis les lectures partagées, contrôlée par son propriétaire,
  son état et son expiration ; la plus récente gagne s’il y en a plusieurs.
  Une demande attribuée à un autre conducteur, annulée, expirée ou inaccessible
  n’est pas présentée comme une nouvelle demande à accepter. Les conditions
  existantes de reprise d’une course acceptée le jour même restent appliquées
  en l’absence de demande entrante. Le conducteur arrive sur la fiche compacte
  existante, avec choix du véhicule et « Accepter / Refuser » hors défilement ;
  les offres immédiates conservent leur écran et leur endpoint de réponse dédiés.
- **Précautions :** trajet en cours, paiement, conversation, formulaire, lien
  explicite et fenêtre d’action ouverte ne sont pas remplacés par une nouvelle
  demande. Le retour volontaire à Home reste possible sans boucle. Changement
  de compte, session, arrière-plan et résultat obsolète restent protégés.
  L’ouverture ne prend aucune décision et n’acquitte pas la sonnerie conducteur.
  Aucun nouveau polling, abonnement aux listes, endpoint, stockage persistant,
  changement de son ou de synthèse vocale n’est ajouté.
- **Vérifications :** tests enrichis dans `entryPresentation`,
  `requestEntryResume`, `acceptedRequestEntry`, `activeRideResumeCoordinator` et
  `entryActivityRecovery` : demande lente, notification restaurée après Home,
  priorité, annulation de l’ancienne lecture, rôle perdu, compte changé,
  retour volontaire et absence d’acquittement à l’ouverture. Les assertions
  anciennes imposant un deuxième clic ou la priorité d’une course non démarrée
  sont adaptées à la nouvelle demande utilisateur. Les suites ciblées et les
  contrôles TypeScript passent ; contrôle qualité global réussi (résultats et
  limites détaillés dans l’entrée du 20 octobre sur les alertes personnelles).
- **Limites :** le chargement visuel reste borné à deux secondes : si le réseau
  est lent, Home peut apparaître brièvement avant l’ouverture automatique de la
  demande vérifiée. Hors ligne ou en erreur, l’accueil reste utilisable avec la
  reprise existante ; aucune donnée périmée n’est déclarée valide pour forcer une
  redirection. Les tests utilisent des modules natifs simulés : réception réelle
  en veille et transitions Android/iOS restent à vérifier sur appareils. Aucun
  déploiement ni changement backend ou natif effectué dans ce lot.

## 2026-10-19 — Correctifs audit mobile, notifications et actions conducteur

Corrections appliquées aux rotations de jeton push et attentes natives bloquées,
aux erreurs des actions de notification en arrière-plan, au bandeau Home,
aux contrastes et à la mesure de disponibilité des écrans. Les trois actions
conducteur utilisent bleu (publier), vert (chercher), orange (commander).
Un contrôle qualité conditionne les deux builds du workflow de production.
Périmètre, fichiers, comportements conservés, résultats et limites natives :
[Correctifs de l’audit mobile du 19 octobre](AUDIT_CORRECTIFS_FIABILITE_2026_10_19.md).
La résolution CocoaPods iOS et les validations sur appareils restent à effectuer ;
aucune disparition de crash n’est annoncée.

## 2026-10-19 — Mise à jour du SDK Didit vers 4.9.1

- **Périmètre et demande :** mettre à jour le SDK KYC Didit sans changer le
  fournisseur, le parcours de vérification ou les autres dépendances. Version
  précédente du wrapper React Native : `4.7.6`, avec SDK natifs `4.7.5`.
  Consultation directe du [registre npm officiel](https://registry.npmjs.org/@didit-protocol/sdk-react-native/latest)
  le 19 octobre 2026 : tag `latest` à `4.9.1`, versions natives iOS et Android
  déclarées à `4.9.1`. Le registre est utilisé pour la version courante, les
  pages web indexées pouvant afficher une version plus ancienne.
- **Solution effectivement appliquée :** version exacte `4.9.1` dans
  `package.json`, archive et intégrité correspondantes dans `package-lock.json`,
  installation locale effectuée. Le diff du verrou npm ne change que Didit.
  `ios/Podfile` pointe maintenant vers le podspec natif `4.9.1` pour éviter
  un conflit avec l'exigence du wrapper. Android utilise la version exacte
  déclarée par le paquet installé ; aucun changement du projet Gradle requis.
  Les métadonnées publiques du
  [podspec iOS](https://raw.githubusercontent.com/didit-protocol/sdk-ios/4.9.1/DiditSDK.podspec)
  et du [module Android AutoDetection](https://raw.githubusercontent.com/didit-protocol/sdk-android/main/repository/me/didit/didit-sdk-autodetection/4.9.1/didit-sdk-autodetection-4.9.1.pom)
  ont été récupérées et confirment la version publiée.
- **Comportements conservés :** variante `autodetection` sans NFC sur les deux
  plateformes, langue française, caméra arrière pour les documents et avant
  pour le visage, confirmation de fermeture, import différé du SDK, session
  créée par le backend, annulation et erreurs existantes. Le parcours mobile
  reste natif, sans repli navigateur ; le parcours web reste inchangé. Expo,
  React Native, les permissions et les versions de l'application ne sont pas
  modifiés. Les protections inter-comptes et contre les lancements KYC tardifs
  restent en place. Aucun appel réel de création de session KYC effectué.
- **Vérifications :** `tests/diditSdkVersion.test.js` ajoute cinq contrôles :
  cohérence manifeste/verrou/installation, alignement des versions natives et
  variantes, application du plugin Expo en mémoire sans duplication ni perte
  des réglages existants, analyse du TurboModule par le codegen React Native
  installé, transmission des options Zwanga au vrai pont JS Didit avec module
  natif simulé. Avec les suites `diditNativeFlow`, `identityQueryLifecycle`,
  `accountIdentityRefresh`, `authSubmissionLoading`, `iosDeploymentTarget` et
  `iosCrashlytics` : 57 tests JavaScript réussis, aucun échec, un test Ruby
  ignoré car Ruby est absent sur cette machine. TypeScript `--noEmit`, ESLint
  ciblé, `npm ls` et contrôle d'espacement passent. Le contrôle du correctif
  de bornage GPS existant passe également après l'installation npm.
- **Limites et mise en service :** aucune compilation Gradle/Xcode complète,
  résolution CocoaPods ni vérification sur appareil physique effectuée dans
  ce lot. `ios/Podfile.lock` n'a pas été réécrit manuellement ; il sera résolu
  par CocoaPods sur macOS/EAS. Des builds natifs Android et iOS, y compris un
  nouveau client de développement si utilisé, sont nécessaires pour embarquer
  Didit 4.9.1 ; une OTA seule ne met pas à jour les modules natifs. Tester
  autorisation caméra, capture document/visage, annulation, perte de réseau
  et retour dans l'app sur les nouveaux binaires. Aucune amélioration de
  performance ni disparition de crash n'est annoncée sans ces essais.
  Aucun prebuild destructif, déploiement, soumission store ou modification
  du backend n'a été réalisé.

## 2026-10-19 — Initiale du compte connecté en haut de Home

- **Périmètre et demande :** afficher uniquement la première lettre du prénom
  du compte connecté dans le bouton de profil de l'accueil, pour les conducteurs
  comme pour les passagers, même si une photo est disponible. L'en-tête local
  utilisait déjà un texte ; une URL de photo inutilisée et un prénom de secours
  correspondant à une ville subsistaient dans son alimentation.
- **Solution appliquée :** `hooks/home/useHomeSheet.ts` retire l'URL d'avatar,
  nettoie les espaces du prénom et conserve la compatibilité avec le premier
  mot du champ historique `name`. Sans nom connu, aucune initiale n'est inventée.
  `components/home/HomeHeader.tsx` affiche l'initiale en majuscule, ou `?` si elle
  est absente. Le style de photo inutilisé est retiré de
  `features/home/HomeHeader.styles.ts`. Aucun composant image ni chargement de
  photo n'est ajouté à l'en-tête.
- **Comportements conservés :** le profil provient toujours du compte identifié
  par la session via `useHomeContext` ; l'appui ouvre toujours le profil. Position,
  couleurs, notifications, tab bar et photos dans les autres écrans/cartes restent
  inchangés. Aucun changement backend, natif ou de dépendance.
- **Vérifications :** deux tests ajoutés dans `tests/homeCompactLayout.test.js`
  couvrent les deux rôles, photo présente, espaces, accent, champ historique,
  prénom absent et mise à jour du compte. Les suites Home compact, rôle, cycle de
  vie et cartes compactes totalisent 45 tests JavaScript réussis. TypeScript
  `--noEmit`, ESLint ciblé et contrôle d'espacement passent. Aucun essai visuel
  sur appareil physique effectué dans ce lot.

## 2026-10-19 — Entrée Home non bloquante et réutilisation des lectures récentes

- **Périmètre et problème constaté :** le chargement plein écran dépendait de
  deux phases successives de découverte et de vérification des trajets/demandes.
  Une lecture lente ou en erreur pouvait donc rendre tout l'accueil inaccessible,
  même avec un profil déjà connu. Les budgets réseau ne sont pas une durée
  d'attente acceptable pour cette présentation. Ce lot concerne le mobile ;
  il ne modifie ni le contrat backend ni l'infrastructure.
- **Solution appliquée — présentation :**
  `hooks/navigation/useEntryPresentation.ts` définit un budget visuel commun
  de 2 secondes pour les deux phases, depuis la disponibilité du navigateur
  après Auth/démarrage. `components/ActiveRideResumeCoordinator.tsx` libère
  ensuite l'accueil et poursuit les contrôles en arrière-plan. Un profil
  valide et un résumé récent sans activité permettent une ouverture immédiate.
  Une erreur ou l'absence de réseau libère également la couverture. Le budget
  de vérification de 25 secondes par phase et les délais HTTP restent inchangés :
  la limite de 2 secondes est un timer JavaScript, pas une mesure native ni une
  garantie de rendu en cas de blocage du thread JS.
- **Résultats tardifs et rôle inconnu :** dès que l'accueil est révélé, une
  destination trouvée tardivement devient une action volontaire dans
  `components/home/EntrySyncBanner.tsx` (« Reprendre mon trajet » ou « Voir la
  demande »), jamais une nouvelle redirection automatique. Une tentative
  supplémentaire reste non bloquante. Le bandeau est limité à Home et masqué
  pendant les dialogues prioritaires. `components/home/HomeEntryPlaceholder.tsx`
  et `app/(tabs)/index.tsx` proposent un accueil neutre et défilable lorsque
  le rôle est inconnu, avec accès aux trajets, au profil et au support, sans
  supposer un rôle passager ni charger la carte. Le contexte
  `features/navigation/appEntryContext.ts` représente désormais uniquement
  l'attente visuelle, pas toute la durée des contrôles.
- **Lectures réduites :** `features/navigation/entryFreshness.ts` fixe une
  fenêtre de réutilisation de 30 secondes. `services/entryRecovery.ts` peut
  reprendre un détail trajet/réservation/demande réussi, récent et non en
  rafraîchissement, ou attendre un GET partagé déjà lancé et réutiliser son
  résultat sans lancer un second GET. Une offre de dispatch reste vérifiée
  par une lecture fraîche. `useActiveRideResume.ts` et
  `useRequestEntryResume.ts` acceptent cette même fenêtre pour la découverte.
  `AccountActivityCoordinator.tsx` évite le refetch systématique du résumé
  à chaque remontage. Les réconciliations achevées sont conservées en mémoire
  dans `services/activityReadiness.ts`, pour le même compte et la même session
  uniquement ; `features/activity/activityReconciliation.ts` ne les réutilise
  que si la révision et l'horodatage exact de la liste réussie correspondent.
  Une révision modifiée ou une lecture en erreur entraîne une nouvelle lecture.
  Aucun cache disque, abonnement supplémentaire ni polling plus fréquent.
- **Comportements conservés et protections :** priorité au trajet en cours,
  y compris lorsqu'il est proposé après le délai ; vérifications d'appartenance,
  de rôle pendant le trajet, de statut et d'expiration ; règles des commandes
  acceptées le jour même et des publications antérieures ; gardes des routes
  privées et validations serveur lors des actions métier. Changement de compte,
  de session, de route, suspension et démontage invalident les callbacks concernés.
  Une navigation volontaire efface la proposition précédente. La réutilisation
  peut présenter un état vieux de moins de 30 secondes ; elle ne constitue jamais
  une autorisation d'accepter, d'annuler ou de démarrer. L'annulation de l'attente
  n'interrompt toujours pas le GET RTK partagé. Le comportement de reprise
  automatique hors connexion n'est pas étendu par ce lot.
- **Vérifications :** suites JavaScript ciblées de reprise, réconciliation,
  authentification, alertes et vues d'entrée ; nouveaux cas dans
  `tests/entryPresentation.test.js` et `tests/entryViews.test.js`, compléments
  dans `activityReadiness`, `entryRecoverySafety`, `activeRideResumeCoordinator`,
  `entryActivityRecovery` et `homeRoleLoader`, avec adaptation du harnais
  `tests/helpers/entryRecoveryHarness.cjs`. Les tests simulent notamment une
  réponse dépassant 2 secondes, l'ouverture explicite ensuite, la priorité du
  trajet en cours, les erreurs, la perte de réseau et les changements de session.
  Validation finale : 321 tests JavaScript réussis, aucun échec ; TypeScript
  `--noEmit` et ESLint ciblé réussis ; `git diff --check` sans erreur d'espacement
  (un avertissement CRLF/LF sur un fichier préexistant non modifié par ce lot).
  Contrôle de taille : 1 133 sources, aucune au-dessus de 400 lignes.
- **Limites et suite différée :** pas d'essai sur appareil physique ni de
  mesure comparative de mémoire, CPU ou temps réseau dans ce lot ; aucune
  disparition de crash ou de chauffe annoncée. Vérifier avec réseau lent,
  reprise après veille, compte conducteur/passager et grandes polices. À froid,
  les lectures métier restent nécessaires. L'enrichissement de `/me/activity`
  pour fournir directement l'activité prioritaire reste une piste backend
  distincte, non appliquée ici. Aucun déploiement ni modification AWS.

## 2026-10-19 — Réouverture Android et annulations des lectures d’entrée

- **Signalement et périmètre :** avertissement `AppEntry activity:read` après
  environ 20 secondes, `FETCH_ERROR / AbortError` dans le détail d’une commande,
  puis navigation ignorée à la réouverture depuis le client de développement.
  Ces messages ne constituent pas une trace de crash natif. Deux défauts ont
  été reproduits en JavaScript avec les routeurs et RTK Query installés ; ils
  ne prouvent pas à eux seuls la cause de chaque échec réseau observé.
- **Route d’entrée conservée :** `components/ProtectedAppStack.tsx` déclare
  désormais `index` hors du garde de fin de démarrage. Un lien racine peut donc
  encore l’atteindre après le premier passage sur Home ou Auth. Cette route
  reste le `StartupRedirect` existant, sans donnée privée : il choisit Home
  ou Auth selon la session. Les autres routes de démarrage, les gardes des
  écrans privés, le nettoyage de l’historique et le retour vers `auth-entry`
  après déconnexion restent inchangés. Aucun contournement global des liens
  profonds ni modification de dépendance. Le retrait d’une route par un garde
  est également décrit dans la
  [documentation Expo des routes protégées](https://docs.expo.dev/router/advanced/protected/).
- **Annulation corrigée :** `services/entryRecovery.ts` invalide maintenant
  l’attente du coordinateur sans appeler `abort()` sur le GET RTK partagé.
  Même si le coordinateur lance la requête, un écran peut s’y abonner ensuite :
  l’ancien comportement faisait échouer aussi cet écran lors d’une suspension
  ou d’un dépassement du budget d’entrée. Cette correction remplace donc la
  règle d’annulation des GET décrite dans l’entrée précédente du journal.
  Le budget d’attente de 25 secondes, les délais HTTP existants, la protection
  inter-comptes et l’interdiction de rediriger à partir d’un résultat invalidé
  sont conservés. Le transport peut finir dans son propre délai et alimenter
  son cache ; aucun GET supplémentaire ni mutation rejouée n’est ajouté.
- **Diagnostic des échecs :** `entryRecovery.ts` distingue timeout explicite,
  annulation, réseau, statut HTTP, réponse invalide et cause inconnue. Il ne
  déduit pas un timeout de la seule durée. `AccountActivityCoordinator`,
  `ActiveRideResumeCoordinator`, `activityReconciliation`, `useActiveRideResume`,
  `useRequestEntryResume` et `useRequestDetailData` transmettent l’erreur au
  classificateur, jamais au journal brut. Les observations des requêtes ignorent
  l’ancienne erreur pendant un nouveau chargement. Les logs gardent uniquement
  un code statique, la durée bornée, la catégorie et éventuellement le statut
  HTTP ; limitation à une occurrence par étape/raison et par minute.
- **Vérifications :** nouveaux tests dans `tests/homeBackNavigation.test.js`
  et `tests/entryRecoverySafety.test.js`. Avant correction, le routeur refusait
  le lien `index` à chaud et l’annulation du coordinateur interrompait le GET
  rejoint par un écran. Après correction, les deux scénarios passent. Un test
  avec le vrai `fetchBaseQuery` et un transport natif simulé confirme qu’un
  timeout peut remonter sous `FETCH_ERROR / AbortError`, sans annulation du
  coordinateur. 304 tests JavaScript ciblés passent, ainsi que TypeScript
  `--noEmit`, ESLint ciblé et `git diff --check`. Contrôle de taille : 1 129
  sources, aucune au-dessus de 400 lignes. Ce ne sont pas des essais physiques.
- **Contrôles réseau ponctuels et limites :** depuis l’ordinateur, l’API locale
  configurée a répondu HTTP 200 à sa liveness en 31 ms et à sa santé en 200 ms ;
  l’activité sans authentification a répondu HTTP 401 en 35 ms, sans lecture de
  compte. Ce sont des sondes ponctuelles, pas une mesure des lectures métier.
  Une sonde HTTP brute via le shell de l’émulateur a retourné 400 : elle ne
  valide pas le parcours réseau React Native. Aucun jeton n’a été extrait,
  aucun état métier modifié et aucun déploiement effectué. La cause exacte des
  20 secondes sur les requêtes authentifiées demeure à établir avec les
  nouveaux diagnostics. Recharger Metro puis vérifier réouverture, veille et
  retour, ouverture de commande et coupure/reprise réseau. Aucune disparition
  de crash ou de chauffe n’est annoncée sans validation native.

## 2026-10-19 — Fiabilité du chargement Home, reprises et restauration des alertes

- **Périmètre et problèmes reproduits :** l’audit local a mis en évidence un
  bouton Réessayer inopérant après une redirection de demande qui échoue ou
  n’aboutit pas, des vérifications suspendues non invalidées par une nouvelle
  tentative, une navigation concurrente depuis la présence conducteur et
  l’abandon silencieux des notifications suivantes après un échec natif simulé.
  Les 8 secondes du loader étaient également inférieures aux 20 secondes
  accordées aux lectures HTTP. Ce sont des reproductions JavaScript, pas une
  identification certaine de la cause observée sur un appareil physique.
- **Reprise et navigation :** `hooks/navigation/useRequestEntryResume.ts` et
  `hooks/navigation/useActiveRideResume.ts` ne consomment plus la reprise avant
  l’appel au routeur. Une exception expose la récupération immédiatement ; une
  redirection sans changement de route reste récupérable. Chaque vérification
  possède une génération et un signal d’annulation. Délai dépassé, Réessayer,
  sortie volontaire et démontage invalident l’ancienne tentative ; sa réponse
  ou sa finalisation tardive ne peut plus modifier la nouvelle tentative.
- **Délais et lectures :** `services/entryRecovery.ts` définit un budget de
  25 secondes (20 secondes HTTP + marge) par phase d’entrée. Les lectures
  successives de détail partagent le budget de leur hook ; la découverte du
  trajet en cours et l’entrée secondaire sur une demande restent deux phases.
  `components/ActiveRideResumeCoordinator.tsx` borne aussi les attentes des
  lectures existantes et les GET de détail/profil/activité qu’il déclenche.
  `components/AccountActivityCoordinator.tsx` utilise le même mécanisme pour
  les listes et annule ses propres travaux lors de sa suspension. Une attente
  annulée ne lance plus un GET tardif. Les lectures préexistantes appartenant à
  un autre consommateur ne sont pas annulées ; aucun paiement, démarrage ou
  autre mutation métier n’est rejoué par ce mécanisme.
- **Arbitrage unique :** suppression de la redirection autonome dans
  `components/DriverPresenceCoordinator.tsx`. Le coordinateur d’entrée observe
  le statut dispatch déjà chargé, sans nouvel abonnement ni polling. Une offre
  en cache n’est qu’un indice : son détail serveur doit confirmer le destinataire,
  la validité et la possibilité d’agir. Trajet en cours, routeur prêt, rôle,
  dialogue ouvert, réseau et navigation volontaire sont vérifiés par les mêmes
  règles que les autres entrées. Aucun événement sonore artificiel n’est créé
  à partir de ce statut. Les appuis explicites sur les notifications restent
  distincts ; le GPS et ses cadences existantes sont conservés.
- **Notifications :** `hooks/notifications/useRideRinging.ts` isole les erreurs
  par source et par notification, borne les attentes natives avec le mécanisme
  audio existant et journalise des codes statiques. Un élément défectueux
  n’empêche plus les suivants d’être traités. Les restaurations sont sérialisées
  avec au plus une reprise en attente ; une ancienne génération de premier
  plan ne restaure pas ses résultats après veille, changement de session ou
  démontage. La notification dont l’arrêt natif échoue n’est pas transférée
  aveuglément au lecteur local, afin de ne pas superposer deux sonneries.
- **Diagnostic et précautions :** `features/activity/activityReconciliation.ts`
  conserve les données précédentes mais n’ignore plus l’échec sans diagnostic.
  Les étapes profil, activité, listes, détails et navigation produisent un code
  et une durée bornée via `entryRecovery.ts`, limités à un message par code et
  par minute. Aucun identifiant de compte, trajet, coordonnées, texte de
  notification, jeton, valeur de configuration ou erreur brute n’est ajouté
  aux diagnostics. La carte différée, la protection inter-comptes, les priorités
  de reprise et les écrans de paiement/conversation sont conservés.
- **Vérifications :** tests de non-régression ajoutés dans
  `tests/entryRecoverySafety.test.js`, `tests/rideAlertRestoration.test.js` et
  les suites de reprise conducteur/demande, d’intégration du coordinateur et de
  présence conducteur. L’horloge de `tests/requestEntryResume.test.js` est
  désormais simulée, pour supprimer sa dépendance à la vitesse de compilation
  de la machine. 237 tests JavaScript ciblés passent, avec réseau, routeur et
  modules natifs simulés. TypeScript `--noEmit`, ESLint ciblé et
  `git diff --check` passent ; aucun fichier source ne dépasse 400 lignes.
- **Limites et recette restante :** pas de mesure de latence ou de mémoire sur
  téléphone, pas de validation native de disparition d’un crash ou d’une chauffe.
  Un appel natif non annulable peut encore se terminer après son délai ; ses
  résultats périmés sont ignorés, ce qui ne constitue pas une annulation native.
  Une lecture partagée suspendue reste soumise à son propriétaire. Vérifier sur
  Android/iOS : entrée normale, retour après veille, réseau lent/coupé, Réessayer,
  trajet en cours avec offre simultanée, notification invalide parmi plusieurs.
  Aucun changement backend/AWS, dépendance, build, publication OTA ou déploiement.

## 2026-10-19 — Reprise au premier plan : synchronisation de l’écran d’entrée

- **Signalement et diagnostic vérifié :** au retour dans l’application, le
  loader affiche « Impossible d’ouvrir votre espace » et invite à vérifier la
  connexion. Deux scénarios JavaScript reproduits avant correction montrent une
  attente injustifiée avec des réponses réseau simulées réussies : une liste
  d’activité est réconciliée avant un nouveau résumé de même révision, ou juste
  avant le montage du consommateur d’entrée. Le routage exigeait alors une date
  de lecture plus récente, tandis que le coordinateur évitait volontairement de
  relire une révision déjà appliquée. Aucune redirection ne se produisait ; le
  délai de secours existant pouvait afficher l’erreur générique. Cette
  reproduction établit un défaut du code, pas une preuve de la cause unique
  rencontrée sur le téléphone : aucune trace réseau/native de cet essai n’a été
  recueillie, et la capture seule ne démontre pas une panne de connexion.
- **Correction appliquée :** `features/activity/activityReconciliation.ts`
  annonce une révision seulement après réconciliation réussie.
  `components/AccountActivityCoordinator.tsx` enregistre alors le compte, la
  catégorie, la révision et la date exacte du cache effectivement rempli dans
  `services/activityReadiness.ts`. Ces confirmations restent en mémoire, au
  maximum une par catégorie, et sont effacées à l’arrêt du coordinateur
  (arrière-plan, déconnexion, changement de compte ou de mode). Un ancien
  propriétaire ne peut ni publier ni effacer les confirmations du nouveau.
- **Consommation :** `components/ActiveRideResumeCoordinator.tsx` observe ce
  petit état partagé et le transmet à `hooks/navigation/useActiveRideResume.ts`
  et `hooks/navigation/useRequestEntryResume.ts`. La règle commune de
  `features/navigation/entryActivityReadiness.ts` accepte une liste antérieure
  au résumé uniquement si le résumé frais du même compte confirme sa révision
  et si la date du cache correspond exactement à la confirmation enregistrée.
  Une révision différente, un cache en erreur/en cours de lecture ou un autre
  compte ne passent pas ce contrôle. Les listes réellement plus récentes et le
  repli existant pour les anciens backends restent utilisables. Le contrôle
  couvre trajets, réservations et demandes passager ; il remplace aussi la
  mémorisation locale partielle des trajets du correctif précédent.
- **Comportements conservés et disponibilité :** aucune mutation métier,
  aucun nouvel abonnement HTTP ni sondage périodique. Priorité du trajet en
  cours, conditions de reprise d’une demande acceptée du jour, rôle réel dans
  le trajet, vérification des détails serveur, démarrage manuel, protections
  contre les résultats tardifs et retour volontaire à l’accueil conservés.
  Le délai de secours reste borné, avec Réessayer et accès à l’accueil quand le
  profil le permet. En ligne, le texte devient « Votre espace n’est pas encore
  prêt » / « Réessayez pour charger vos trajets » ; l’instruction réseau est
  réservée à l’état hors ligne connu. Aucun contournement d’authentification.
- **Vérifications :** les deux reproductions échouaient avant correction et
  passent après. `tests/entryActivityRecovery.test.js` et son support
  `tests/helpers/entryRecoveryHarness.cjs` font fonctionner le producteur et les
  deux consommateurs sur les mêmes caches : ordre des réponses, vraie séquence
  arrière-plan/premier plan simulée, nouvelle révision, échec de lecture, reprise
  manuelle, demande passager et absence de relecture redondante.
  `tests/activityReadiness.test.js` contrôle l’isolation, le nettoyage, les
  notifications bornées et les confirmations exactes ; les tests de reprise
  acceptée utilisent désormais la confirmation partagée. 200 tests JavaScript
  ciblés passent, ainsi que TypeScript `--noEmit`, ESLint ciblé et
  `git diff --check`. 1 128 sources contrôlées, aucune au-dessus de 400 lignes.
- **Limites et recette restante :** tests avec horloge, réseau, cache et rendu
  natif simulés ; pas d’essai physique, de mesure de latence native ou de preuve
  de disparition de crash. Vérifier sur Android/iOS avec ce code : revenir sur
  l’accueil après veille, avec/sans demande acceptée, puis avec coupure réseau
  et Réessayer. Aucun changement AWS/backend, build ou déploiement effectué.

## 2026-10-19 — Entrée conducteur sur la demande acceptée du jour

- **Problème et périmètre :** une demande acceptée mais pas encore démarrée
  ne devenait pas l’écran d’entrée du conducteur. Celui-ci souhaite retrouver
  directement cette course le jour prévu, sauf si une publication part plus tôt.
  Modification locale du routage mobile, sans changement du backend, du schéma,
  des dépendances, de la configuration native ou de l’interface de la fiche.
- **Règle appliquée :** `features/navigation/acceptedRequestEntry.ts` recherche
  les trajets personnels à venir liés à une demande, non démarrés et non expirés,
  prévus aujourd’hui selon le calendrier de Kinshasa. La demande relue doit
  confirmer le conducteur sélectionné, les deux liens demande/trajet, son état
  accepté et un départ souhaité aujourd’hui ; elle ne doit pas être expirée ou
  annulée. Une publication personnelle non démarrée du même jour dont le départ
  est strictement antérieur au départ souhaité (`departureDateMin`) bloque cette
  priorité. Un départ égal ou plus tardif, une ancienne journée et un trajet
  terminé, annulé ou expiré ne la bloquent pas. La comparaison utilise l’horaire
  souhaité, pas l’heure éventuellement ajustée du trajet créé après acceptation.
  Les candidats sont examinés par heure de départ, sans modifier les listes.
- **Intégration :** `components/ActiveRideResumeCoordinator.tsx` transmet sa
  liste partagée de trajets et sa lecture authentifiée au hook
  `hooks/navigation/useRequestEntryResume.ts`. La recherche ne dépend pas de
  `getMyTripRequests`, réservé aux demandes créées en tant que passager. Avant
  d’ouvrir `/request-details/:id`, le hook attend les publications réconciliées,
  relit le trajet puis sa demande et recontrôle la liste la plus récente. Il
  mémorise seulement, pendant cette entrée, la révision des trajets déjà
  réconciliée : un résumé périodique inchangé ne réclame pas une lecture de liste
  que le coordinateur partagé évite volontairement. Une révision différente
  exige sa réconciliation. Aucun nouveau sondage périodique ni abonnement de
  liste ; uniquement les lectures de détail nécessaires à la vérification.
- **Comportements conservés :** un trajet déjà en cours reste prioritaire,
  avec navigation selon le rôle dans ce trajet. Si le trajet accepté est devenu
  en cours lors de sa relecture, la navigation conducteur s’ouvre. Sinon, la
  fiche confirmée conserve « Aller chercher le passager » : aucune mutation de
  démarrage automatique. Une course acceptée éligible passe avant une nouvelle
  sollicitation. Une seule redirection réussie par entrée/compte ; le retour
  volontaire à l’accueil reste possible. Paiement, conversation, formulaire et
  navigation explicite ne sont pas remplacés. Les résultats tardifs sont
  invalidés à la sortie, au changement de session/compte ou devant un dialogue.
  Le loader existant couvre la décision ; erreur réseau et chargement lent
  gardent Réessayer et l’accès explicite à l’accueil, sans boucle de requêtes.
- **Vérifications :** 190 tests JavaScript ciblés passent : politiques et hook
  (`tests/acceptedRequestEntryPolicy.test.js`, `tests/acceptedRequestEntry.test.js`),
  entrée existante (`tests/requestEntryResume.test.js`), intégration du
  coordinateur (`tests/activeRideResumeCoordinator.test.js`), activité partagée,
  trajets en cours, accueil, synthèse vocale d’entrée, expiration, fiche et
  démarrage. Couverture des limites de journée de Kinshasa, départs antérieurs/
  égaux/postérieurs, changement d’attribution/annulation, mises à jour pendant
  la vérification, cache ancien, révisions identiques/différentes, erreur/reprise
  et absence de démarrage implicite. Les 23 tests des deux nouvelles suites ont
  aussi été relancés après renforcement du scénario de reprise réseau.
  TypeScript `--noEmit`, ESLint ciblé et `git diff --check` passent ; 1 126 sources
  contrôlées, aucune au-dessus de 400 lignes.
- **Limites :** tests de logique et de composition avec réseau et composants
  natifs simulés, pas d’essai sur téléphone Android/iOS ni de mesure de
  performance native. Recette restante : fermer/rouvrir après acceptation pour
  aujourd’hui, avec puis sans publication plus tôt, puis démarrer explicitement
  la course et vérifier la navigation. Aucun build ou déploiement effectué.

## 2026-10-19 — Fiche conducteur allégée : carte repliée à la demande

- **Problème et choix utilisateur :** l’aperçu cartographique ouvert par défaut
  rendait le détail de la demande moins compact et moins agréable à parcourir.
  L’utilisateur a explicitement choisi « Carte repliée, fiche plus compacte ».
  Cette entrée remplace donc le choix d’ouverture automatique décrit dans
  l’entrée précédente, sans supprimer la possibilité de consulter l’itinéraire.
- **Solution appliquée :** `features/request-detail/RequestDriverDecision.tsx`
  conserve la synthèse passager/prix/horaire/adresses et remplace la carte ouverte
  et sa légende redondante par une ligne « Voir le trajet sur la carte ».
  `CollapsibleRouteMap.tsx` reçoit un libellé et une apparence texte optionnels :
  fond transparent, séparation discrète, chevron, zone tactile de 44 points
  minimum et texte pouvant revenir à la ligne. L’ouverture/fermeture reste dans
  la fiche, sans modal ni animation déplaçant les actions principales. Sans
  coordonnées utilisables, « Carte indisponible » est lisible sur fond clair.
- **Comportements conservés :** véhicule et boutons Accepter/Refuser hors du
  défilement, options intégrées, contrôles d’éligibilité, montants et appels
  d’acceptation/refus inchangés. Après ouverture, points de départ/arrivée,
  tracé routier, repli honnête en pointillés et cache existant sont conservés.
  La carte native n’est pas montée et aucune lecture d’itinéraire n’est lancée
  avant l’ouverture explicite. Les autres écrans conservent leur bouton de carte
  habituel ; la course déjà confirmée garde son aperçu ouvert. Aucun changement
  du backend, des dépendances, de la configuration ou de la tab bar.
- **Vérifications :** 176 tests JavaScript ciblés passent ; les 24 tests des
  suites de disposition/carte/synthèses ont aussi été relancés après l’ajustement
  du fond de l’état indisponible. `tests/requestDecisionLayout.test.js` et
  `tests/requestDecisionMap.test.js` couvrent le repli initial, le libellé, le
  chargement seulement après appui, la fermeture, le style sans coordonnées et
  les comportements par défaut des autres usages. TypeScript `--noEmit`, ESLint
  ciblé et `git diff --check` passent ; 1 125 sources contrôlées, aucune au-dessus
  de 400 lignes.
- **Limites :** contrôles de structure et de logique avec composants natifs
  simulés, sans validation visuelle sur appareil physique ni mesure de mémoire,
  chauffe ou fluidité. À vérifier sur Android/iOS : premier écran compact,
  ouverture/repli du trajet, texte agrandi et accès aux actions. Aucun build ou
  déploiement effectué.

## 2026-10-19 — Demande conducteur : réponse accessible, options intégrées et carte du trajet

- **Problème et périmètre :** dans le détail d’une demande ouverte, le conducteur
  devait défiler pour choisir son véhicule avant de répondre. « Autres options »
  ouvrait encore l’ancien modal d’acceptation. L’utilisateur souhaite également
  voir le trajet demandé sur la carte. Changements mobiles locaux uniquement,
  sans backend, dépendance, configuration native, secret, build ou déploiement.
- **Réponse compacte :** `features/request-detail/RequestDriverDecision.tsx`,
  `RequestDecisionVehiclePicker.tsx`, `requestSummaryStyles.ts` et
  `app/request/[id].tsx` regroupent le véhicule et les actions « Refuser » /
  « Accepter » dans une zone non rétrécissable, hors du défilement des détails.
  La synthèse conserve passager, places, horaire, lieux/repères, budget par place,
  paiement, commission cash et accès au contact autorisé. Un seul véhicule reste
  sélectionné par la logique existante ; plusieurs véhicules exigent un choix
  explicite, avec liste immédiatement visible puis repliée après sélection et
  action « Changer ». Pour une flotte longue, seule la liste des véhicules
  défile, dans une hauteur limitée à 144 points ou 20 % de l’écran. Aucun véhicule
  n’est retiré des choix et les noms/plaques ne sont pas tronqués.
- **Options sans seconde acceptation :** `RequestDecisionOptions.tsx` déplie les
  réglages dans la fiche : identité vérifiée du passager, points de rendez-vous
  et repères. Même état de formulaire et même bouton principal d’acceptation,
  contrôles bloqués pendant l’envoi. `useRequestDetailController.ts` délègue les
  transitions de carte au nouveau `useRequestRouteOverridePicker.ts` : fermer ou
  choisir un lieu depuis les options intégrées ne rouvre jamais le modal
  d’acceptation. Seul le parcours historique parti d’un modal réellement ouvert
  le restaure, avec les délais natifs existants et protection contre les doubles
  fermetures. Les transitions en attente sont annulées à la sortie ou au
  changement de compte/demande. `app/request/[id].tsx` ne monte plus
  `RequestAcceptModal` dans le parcours de décision simplifié.
- **Carte :** la fiche de décision réutilise `CollapsibleRouteMap`, ouverte par
  défaut en aperçu compact et repliable. Elle présente le trajet demandé par le
  passager, du départ vert à l’arrivée orange, avec libellé « Départ → Arrivée »,
  noms des points et tracé routier obtenu par le service/cache existant.
  Pas de nouvelle permission ni de suivi GPS. La carte reste dans les détails
  défilants, indépendamment des boutons de réponse. Sans tracé routier, la ligne
  reste en pointillés et porte « Départ et destination » ; aucun itinéraire
  routier fictif n’est annoncé. Un changement de demande ou de coordonnées
  réinitialise cet aperçu. `requestPresentation.ts` exclut désormais les points
  absents, non numériques, non finis ou hors des bornes géographiques avant de
  fournir une région à la carte native. La carte montre la demande d’origine ;
  les ajustements facultatifs restent indiqués dans les champs des options.
- **Comportements conservés :** validation d’identité conducteur, compatibilité
  du véhicule, fenêtre d’acceptation, protection contre les doubles envois,
  refus limité au conducteur concerné, montants et coordonnées transmis au
  serveur. Accepter ne démarre pas automatiquement la course. Parcours passager,
  modification de commande, course confirmée et tab bar inchangés. La carte
  n’est montée et sa lecture n’est lancée que lorsque l’aperçu est déplié et
  l’écran actif ; les réponses tardives après repli ne modifient pas son état.
- **Vérifications :** 173 tests JavaScript passent dans les suites ciblées de
  détail, choix de véhicule, options, carte, contact, prix, horaires, expiration,
  création de commande et démarrage. Nouveaux tests :
  `tests/requestDecisionLayout.test.js`, `requestDecisionOptions.test.js` et
  `requestDecisionMap.test.js`. Ils exercent les composants/hooks réels avec
  rendu et entrées/sorties natives simulés : petits écrans/flottes longues,
  mutations bloquées pendant l’envoi, paramètres du tracé, panne du service,
  coordonnées invalides, retour du sélecteur iOS/Android et suppression du modal
  historique dans l’arbre de décision. TypeScript `--noEmit`, ESLint ciblé et
  `git diff --check` passent ; 1 125 sources contrôlées, aucune au-dessus de
  400 lignes. Un avertissement de durée du middleware Redux de développement a
  été émis pendant les tests ; ce n’est pas une mesure de performance mobile.
- **Limites et recette native restante :** aucun essai physique ou visuel
  Android/iOS, aucune mesure de mémoire, chauffe ou fluidité. Vérifier sur petit
  écran et avec texte agrandi : véhicules/actions accessibles, défilement de la
  flotte, carte routière et points, sélection puis fermeture d’un lieu sans
  retour à l’ancien modal, ouverture du clavier dans les repères, acceptation
  et refus. Les tests JavaScript ne prouvent pas l’absence de crash natif.

## 2026-10-19 — Retour direct à l’accueil après la notation d’un trajet

- **Problème et périmètre :** après une notation réussie, le retour différé
  utilisait `router.back()` lorsque l’historique existait. Le passager ou le
  conducteur pouvait donc retrouver le détail ou la navigation du trajet terminé
  au lieu de l’accueil. Correction mobile du parcours commun de notation.
- **Solution appliquée :** `hooks/rating/useRatingData.ts` expose
  `goHomeAfterRating`, qui remplace l’écran par `/(tabs)` avec une protection
  contre les sorties multiples. `useRatingActions.ts` l’appelle immédiatement
  après l’enregistrement serveur de l’avis et la fermeture du clavier, sans
  temporisation ni confirmation supplémentaire. `app/rate/[id].tsx` transmet
  cette action dédiée ; `useRatingLifecycle.ts` ne conserve plus le timer de
  retour devenu inutile. La fermeture d’un avis déjà enregistré en arrière-plan
  mène également à l’accueil lorsque l’utilisateur revient et ferme cet écran.
- **Comportements conservés :** un échec d’envoi laisse l’utilisateur sur la
  notation avec possibilité de réessayer. Pas de double POST, ni de redirection
  tardive après départ de l’écran, arrière-plan ou changement de compte/trajet.
  Fermer sans avoir enregistré d’avis conserve le retour précédent. Confirmation
  d’arrivée, paiement, choix de la personne notée, signalement et étapes de fin
  de trajet ne sont pas modifiés. Un passager arrivé peut revenir à l’accueil
  après sa note sans attendre la fin du trajet pour les autres passagers.
- **Vérifications :** 172 tests JavaScript passent dans les suites ciblées de
  notation, historique d’accueil, reprise des trajets, navigation, paiement à
  l’arrivée et overlays. `tests/ratingLifecycle.test.js` couvre les deux rôles
  avec plateformes iOS/Android simulées, réussite immédiate, erreur/réessai,
  double appui, lien direct et réponses tardives. Les deux nouveaux cas de
  `tests/homeBackNavigation.test.js` utilisent le routeur installé et la politique
  d’historique existante : après remplacement par l’accueil, Retour ne rouvre ni
  la navigation passager/conducteur ni la notation. TypeScript `--noEmit`, ESLint
  ciblé et `git diff --check` passent ; 1 122 sources contrôlées, aucune au-dessus
  de 400 lignes.
- **Limites :** pas d’essai sur appareil physique ni de build/déploiement.
  À valider sur Android/iOS : arrivée passager puis notation, fin du trajet
  conducteur puis notation, accueil obtenu directement et bouton Retour système.
  Les tests ne démontrent aucune amélioration native de performance ou de crash.

## 2026-10-19 — Commande prioritaire et détails passager « ticket » / conducteur

- **Problème et périmètre :** après une commande, le passager devait retrouver
  son suivi ; à l’entrée dans l’application, une alerte conducteur pouvait ouvrir
  une interface avant la résolution du trajet en cours. Les détails de commande
  ne correspondaient pas aux maquettes fournies. Modification mobile locale,
  sans changement du backend, des dépendances, des secrets ou de la tab bar.
- **Entrée dans l’application :** `features/navigation/priorityRequestEntry.ts`,
  `hooks/navigation/useRequestEntryResume.ts` et
  `components/ActiveRideResumeCoordinator.tsx` réutilisent les données d’activité
  et les alertes existantes. Une commande personnelle encore en attente et non
  attribuée est proposée comme écran d’entrée ; sinon, une alerte conducteur
  valide peut ouvrir la demande concernée. Vérification authentifiée de son état
  avant navigation, compte et destinataire contrôlés, offres expirées exclues.
  Le trajet réellement en cours conserve la priorité, y compris pour un compte
  conducteur voyageant comme passager. Un lien explicite, un formulaire, une
  conversation ou une sortie volontaire ne sont pas écrasés. Une seule reprise
  réussie par entrée au premier plan ; chargement borné à huit secondes avec
  réessai ou accès à l’accueil. Aucun nouveau polling en arrière-plan.
- **Création et notifications :** `hooks/trip-request/useRequestSubmission.ts`
  ouvre directement le détail après confirmation serveur, y compris après la
  réconciliation d’un envoi ambigu. Aucun rejeu automatique du POST ni écran de
  succès supplémentaire. `services/rideAlertSession.ts` expose une révision
  observable ; `hooks/notifications/useDriverNotifications.ts` laisse le
  coordinateur choisir l’écran lors d’une simple réception, tout en conservant
  les actions explicites sur notification. Les réponses tardives après sortie,
  arrière-plan ou changement de compte ne déclenchent pas une redirection.
- **Passager — variante C choisie :** `RequestPassengerTicket.tsx` et
  `requestSummaryStyles.ts` dans `features/request-detail/`, intégrés dans
  `app/request/[id].tsx`, présentent le ticket clair avec découpe visuelle,
  horaires, adresses et repères, véhicule, places, budget **par place** et suivi
  vertical. Dates et expiration viennent des données métier, pas des exemples
  de la maquette. Le conducteur confirmé ne signifie pas que le départ a eu lieu.
  Modifier, annuler, reprogrammer et consulter le trajet utilisent les actions
  existantes et leurs confirmations/protections. Les commandes fermées affichent
  leur état, sans recherche fictive toujours en cours.
- **Conducteur :** `RequestDriverDecision.tsx` affiche les informations utiles,
  le véhicule compatible et directement « Refuser » / « Accepter » pour une
  demande ouverte. `RequestDriverCourse.tsx` présente la course confirmée, l’heure
  de prise en charge, le contact autorisé, le parcours et « Aller chercher le
  passager ». Dans `hooks/request-detail/useRequestDriverActions.ts`, accepter
  depuis cette fiche ne démarre pas automatiquement le trajet ; le départ reste
  explicite et protégé contre les doubles appuis. Refuser une alerte de proximité
  acquitte uniquement cette alerte pour ce conducteur, sans annuler la commande
  du passager. La course attribuée propose « Gérer ou annuler la course » via
  l’écran existant, sans inventer une mutation de désistement. Autorisations KYC,
  véhicule, paiement, contact et validations serveur conservées.
- **Dispatch et voix :** `app/incoming-driver.tsx` conserve la réponse serveur
  pour les offres de dispatch ; leur sonnerie n’est plus acquittée avant la
  réussite de l’action. Présentation compacte et annonce d’entrée indiquant
  l’action attendue via `services/rideEntryAnnouncement.ts` et
  `features/notifications/detailEntryAnnouncement.ts`. Le parcours réservation
  existant est conservé. Le résumé passager historique ne prétend plus que les
  conducteurs sont contactés « un à la fois ».
- **Carte et charge de travail :** `CollapsibleRouteMap.tsx`,
  `useRequestAvailability.ts` et `useRequestDetailController.ts` n’effectuent plus
  de lecture d’itinéraire pour une carte repliée. La carte du ticket est ouverte
  à la demande ; celle de la course confirmée est initialement visible. Pas de
  vue native de carte lorsque l’écran est inactif, réponses tardives ignorées,
  cache d’itinéraire existant réutilisé. Le tracé de secours est distingué d’un
  itinéraire routier. Pas d’animation d’insertion/retrait sur cet aperçu.
- **Vérifications :** 387 tests JavaScript passent sur les suites ciblées de
  commandes, reprise/navigation, identité et notifications/audio. Nouveaux tests
  dans `tests/requestEntryResume.test.js` (12 cas) et
  `tests/requestSummaryViews.test.js` (6 cas), extensions de
  `activeRideResumeCoordinator.test.js`, `tripRequestForm.test.js` et
  `tripStartNavigation.test.js`, adaptation du contrat vocal dans
  `rideAudioReliability.test.js`. Les six tests de présentation ont été rejoués
  après la finition visuelle du ticket. TypeScript `--noEmit`, ESLint ciblé,
  contrôle de taille des sources et `git diff --check` vérifiés.
- **Limites :** les tests simulent les interfaces natives et le serveur ; ils ne
  constituent ni une recette visuelle, ni un essai audio/GPS sur appareil réel.
  Aucun build, déploiement ou test physique Android/iOS effectué ici. À vérifier
  sur appareil : petits écrans et grandes polices, nouvelle commande/réouverture,
  arrivée d’alerte avec un trajet actif, acceptation/refus concurrent, navigation
  et contact après attribution, retour réseau et expiration. Pas de mesure de
  gain de performance, de chauffe ou de disparition de crashs revendiquée.

## 2026-10-19 — Actualiser la validation administrateur à l’entrée dans l’application

- **Problème et périmètre :** le contrôle global d’identité conservait son propre
  cache `/users/kyc/status` sans reprise au premier plan, tandis que le profil
  consultait `/users/me`. Une approbation manuelle pouvait donc apparaître dans
  le profil sans lever l’invitation KYC du formulaire de publication. Ce formulaire
  conservait aussi un booléen « approuvé » local sans prise en compte d’une
  décision négative ultérieure. Lecture du backend local : la validation admin
  approuve le dossier courant ; la validation au bureau crée un dossier approuvé.
  Aucune vérification de l’état de production ou modification du backend effectuée.
- **Synchronisation appliquée :** `hooks/identity/useAccountIdentityStatus.ts`
  mutualise les deux endpoints existants pour le compte authentifié. Lectures à
  l’entrée/au retour au premier plan, reprise lors du rétablissement du réseau,
  aucun polling ni lecture périodique en arrière-plan. Les retours rapprochés
  réutilisent au maximum 30 s de cache ; RTK Query partage les requêtes déjà en
  vol avec les écrans. L’actualisation manuelle recharge les deux sources sans
  abonnement impératif supplémentaire. Les callbacks périmés après changement
  de compte, arrière-plan ou démontage sont neutralisés par `useDisplayRefetch`.
- **Source de vérité :** `features/identity/accountIdentitySnapshot.ts` choisit le
  résultat serveur connu le plus récemment reçu pour ce compte, avec priorité au
  profil en cas d’égalité. Il utilise le contrat `profileState` existant et conserve
  le support des anciens profils/documents. Le rôle conducteur, le JWT et les
  anciens indicateurs locaux ne valent pas approbation KYC. Un statut négatif
  plus récent remplace un ancien « approuvé » ; les données d’un autre compte
  sont ignorées. Les contrôles d’autorisation du backend restent décisifs.
- **Publication et information utilisateur :** `contexts/IdentityContext.tsx`
  utilise ce statut commun. `hooks/publish/usePublishIdentity.ts` n’ajoute plus de
  lecture KYC indépendante ni d’approbation locale persistante. L’invitation se
  ferme dès qu’une approbation est connue ; ni ouverture du modal ni lancement
  du SDK pendant un chargement ou une erreur de lecture. Adaptations dans
  `usePublishController.ts`, `features/publish/PublishRouteStep.tsx` et
  `app/publish.tsx` : « Mise à jour de votre profil… » pendant la vérification,
  puis actualisation proposée si le statut est indisponible, sans demander de
  refaire le KYC à cause d’une panne réseau. Les données du formulaire, les
  obligations véhicule/rôle, la publication simple/récurrente et le parcours KYC
  d’un compte réellement non validé sont conservés.
- **Vérifications :** 121 tests JavaScript passent sur les suites identité,
  profil, publication, session et reprise réseau. Les huit cas dédiés de
  `tests/accountIdentityRefresh.test.js` couvrent approbation manuelle, cache
  périmé, révocation, compte différent, chargement/erreur, regroupement des
  lectures, reprise réseau et absence de doublons d’abonnements. Les endpoints
  réels sont exercés avec Redux/RTK Query et un backend simulé ; les interactions
  de composants sont simulées. TypeScript `--noEmit`, ESLint ciblé et
  `git diff --check` passent ; 1 116 sources contrôlées, aucune au-dessus de
  400 lignes.
- **Limites :** aucun déploiement ni essai sur téléphone physique. La synchronisation
  exige que le serveur renvoie effectivement l’approbation ; elle ne transforme
  pas un simple changement de rôle en validation d’identité. Une reprise très
  rapprochée peut réutiliser le cache pendant 30 s. Un dernier statut approuvé
  déjà reçu reste affichable lors d’une panne réseau ; le serveur vérifie encore
  l’autorisation au moment de publier. À valider en recette : décision admin
  pendant que l’application est fermée/en veille, réouverture puis publication,
  compte partagé, réseau lent et échec réseau. Aucune affirmation de disparition
  des crashs ou de réduction mesurée de la chauffe.

## 2026-10-19 — Correctifs de l’audit sonnerie et synthèse vocale

- **Périmètre et constats :** corrections locales de sept défauts du parcours
  audio : absence de relais après une mise en arrière-plan, volume multimédia
  utilisé au premier plan Android, expiration de l’annonce d’entrée bloquant les
  événements futurs, échec d’initialisation mémorisé définitivement, phrase coupée
  par un simple rechargement des mêmes données, reprise de la sonnerie pendant le
  guidage GPS et absence d’annonce sur deux écrans ouverts depuis les notifications.
  Les constats JavaScript sont reproductibles avec des entrées/sorties natives
  simulées ; ils ne constituent pas une mesure audio sur téléphone.
- **Lecteur Android :** `ForegroundAlertPlayer.java`, exposé par
  `DriverAlertModule.java`, charge uniquement à la demande le son du canal existant
  (son Zwanga par défaut). Il utilise `USAGE_NOTIFICATION`, et non le volume
  multimédia, respecte les notifications désactivées, le mode silencieux/DND et les
  réglages du canal/groupe, y compris sa vibration. Préparation asynchrone limitée
  à 5 s, libération à la sortie du premier plan/destruction, arrêt identifié par
  tentative pour qu’un retour tardif ne coupe pas un nouveau lecteur. Aucun volume
  système forcé, appel téléphonique simulé, service permanent ni verrou de veille.
  `services/foregroundRideSound.ts` choisit ce pont uniquement s’il existe ; les
  anciens binaires Android et iOS conservent leur lecteur compatible. Le volume
  des anciens binaires Android n’est donc pas corrigé par une simple OTA.
- **Relais arrière-plan Android :** `services/backgroundRideRinging.ts` et
  `hooks/notifications/useRideRinging.ts` transmettent une alerte encore en attente
  à une notification native, uniquement pendant le temps restant de son `ringUntil`
  d’origine, au plus 30 s et sans dépasser son expiration métier. Une seule alerte
  relayée, pas de minuterie JavaScript permanente en arrière-plan, nettoyage au
  retour/à la réponse/déconnexion et invalidation des opérations tardives. Les
  transitions concurrentes sont regroupées et les attentes natives bornées.
  `services/driverNotifications.ts` retire aussi l’identifiant du relais lors d’une
  décision. Les boutons accepter/refuser restent réservés aux événements qui les
  autorisaient déjà ; une réponse destinée au passager n’en reçoit pas.
- **Reprise après erreur et disponibilité :** `services/foregroundRideAnnouncement.ts`
  ne conserve plus une promesse vocale rejetée ; sonnerie et initialisation vocale
  ont des reprises limitées à trois tentatives, espacées de 5 puis 15 s. Les appels
  audio potentiellement bloquants sont bornés par `services/rideAudioDiagnostics.ts`
  (8 s par défaut, 3 s pour les arrêts ciblés), sans bloquer les actions de trajet.
  Les diagnostics utilisent des codes statiques, sans charge utile ni donnée
  personnelle, limités à une émission par minute/code et à 20 codes en mémoire.
  Une absence persistante de moteur/voix française reste possible ; aucun
  téléchargement de voix automatique ni remplacement par une voix non française.
- **Priorité vocale :** `services/rideEntryAnnouncement.ts` distingue un changement
  d’événement d’un simple changement `isFetching/ready`. Un rechargement de la même
  priorité ne coupe plus la phrase ; un véritable changement de trajet, compte,
  écran ou événement l’invalide toujours. La fenêtre d’entrée reste bornée à 30 s,
  sans empêcher les nouvelles alertes ultérieures et sans lire l’ancien stock de
  notifications. `services/rideAudioFocus.ts` et `utils/navigationSpeech.ts` gèrent
  des suspensions indépendantes : le GPS prend la priorité avant d’interrompre
  l’annonce, puis libère la sonnerie à la fin/arrêt de sa propre phrase.
- **Écrans couverts :** `features/notifications/detailEntryAnnouncement.ts`,
  `hooks/manage-trip/useManageTripController.ts`,
  `hooks/request-detail/useRequestDetailController.ts` et `useRequestDetailData.ts`
  décrivent aussi la réservation/commande et l’action permise dans la gestion du
  trajet ou le détail de commande. Ils réutilisent les données déjà chargées et
  vérifiées, sans nouvelle lecture réseau ni changement des autorisations métier.
- **Comportements conservés :** au premier plan, le conducteur arrête l’alerte par
  sa réponse métier ; le passager l’arrête en ouvrant le trajet concerné. Finir une
  phrase ne vaut pas accepter/refuser. Pas d’annonce de commande en arrière-plan :
  seules les consignes du trajet en cours y restent autorisées. Les limites sonores
  natives iOS, la politique push, le backend et les fichiers d’environnement ne
  sont pas modifiés. Les sons/permissions de l’utilisateur restent prioritaires.
- **Vérifications :** 424 tests JavaScript passent sur les suites audio, notifications,
  accueil, reprise et navigation. `tests/rideAudioReliability.test.js` couvre le
  relais, ses courses asynchrones, les délais et diagnostics ; les suites
  `rideAnnouncement.test.js`, `rideAlertSession.test.js` et
  `driverNotifications.test.js` couvrent les reprises, l’arbitrage GPS et les décisions.
  `tests/helpers/loadTypeScript.cjs` accepte une console de test facultative pour
  mesurer la limitation des diagnostics. TypeScript `--noEmit` passe. ESLint ciblé :
  aucune erreur, cinq avertissements préexistants (quatre dans le contrôleur de
  gestion, un dans le helper de test). Contrôle de taille : 1 114 sources, aucun
  fichier au-dessus de 400 lignes ; `git diff --check` passe. Compilation isolée
  `javac` des deux classes Android réussie contre Android 36 / React Native 0.81.5,
  avec avertissements d’annotations absentes du classpath minimal et API dépréciée.
- **Limites et mise en service :** aucun APK/AAB/IPA complet produit, aucun déploiement
  ni essai audio physique réalisé. Un nouveau build Android est nécessaire pour le
  lecteur natif. Le relais reste soumis à l’exécution accordée par Android au
  changement d’état ; une application tuée ou les restrictions constructeur ne
  permettent pas de garantir une sonnerie continue. Recette requise Android/iPhone :
  commande et réservation, réponse du passager, écran verrouillé, retour rapide,
  plusieurs alertes, décision pendant l’initialisation, voix GPS, compte changé,
  volume multimédia nul avec notifications audibles, notifications/silencieux/DND,
  moteur vocal indisponible et retour réseau. Les tests simulés et la compilation
  isolée ne prouvent ni le volume réellement entendu, ni l’absence de crash/chauffe.

## 2026-10-19 — Une consigne vocale prioritaire à l’arrivée dans l’application

- **Problème et périmètre :** les annonces lisaient les alertes dans leur ordre
  d’arrivée et dépendaient de la présence d’une sonnerie. Elles ne décrivaient pas
  nécessairement la priorité de l’accueil ou le rôle réel dans le trajet repris.
- **Solution appliquée :** `features/notifications/homeEntryAnnouncement.ts` reprend
  les événements déjà sélectionnés pour les cartes de l’accueil, dans le même ordre,
  avec une description et une action simple. Réservation reçue : ouvrir puis accepter
  ou refuser ; réservation personnelle : distinguer attente et acceptation ; commande
  personnelle : attendre, examiner une proposition ou contacter le conducteur.
  `navigationEntryAnnouncement.ts` décrit la situation du trajet effectivement ouvert :
  réponse à une descente, réservation en attente, prochain passager, reprise ou attente
  du départ. Aucun ordre d’embarquement avant d’être dans le véhicule, ni paiement
  annoncé comme dû sans vérification du règlement.
- **Intégration :** `hooks/home/useHomeController.ts`, `useHomeDriverActivity.ts` et
  `useHomePassengerActivity.ts` exposent l’état des lectures existantes ; les contrôleurs
  et hooks de données dans `hooks/driver-navigation/` et `hooks/passenger-navigation/`
  publient leur priorité via `hooks/notifications/useNavigationEntryAnnouncement.ts`
  et `useRideEntryAnnouncement.ts`. Aucun nouveau chargement réseau ni changement
  des sélections de cartes, des autorisations métier ou des actions de trajet.
- **Cycle de vie :** `services/rideEntryAnnouncement.ts` conserve uniquement en mémoire
  la source de l’écran actif, son compte et sa révision. Le coordinateur
  `components/ActiveRideResumeCoordinator.tsx` bloque l’annonce pendant le démarrage,
  l’authentification, la résolution du rôle/trajet ou un overlay prioritaire.
  Une seule annonce à l’arrivée initiale ou après un véritable arrière-plan ; un bref
  passage `inactive` n’ouvre pas une nouvelle annonce. Stabilisation de 500 ms,
  attente/reprises bornées à 30 s, arrêt des reprises une fois la priorité traitée.
  Les formulaires, messages et autres écrans sans source dédiée ne provoquent pas
  la lecture automatique d’un ancien push. Une priorité absente ou non vérifiée
  reste silencieuse, sans bloquer l’interface.
- **Audio et protections :** `services/foregroundRideAnnouncement.ts` et
  `hooks/notifications/useRideRinging.ts` réutilisent le moteur vocal existant,
  même sans push, sans démarrer une sonnerie pour cette seule annonce. Les cartes
  de notifications restaurées ne sont pas lues ensuite en file. Les nouveaux événements
  au premier plan restent pris en charge, hors navigation où le guidage prime.
  `foregroundRideSound.ts` mutualise les contrôles audio existants et suspend aussi
  un lecteur de sonnerie encore en initialisation pendant la phrase ; aucun volume
  système forcé. La sonnerie reste en attente d’une réponse métier, indépendamment
  de la fin de la phrase. Les retours asynchrones périmés sont invalidés ; le passage
  en arrière-plan arrête cette annonce seulement, pas les instructions GPS.
  Sur iOS, une annonce sans lecteur utilise une session vocale séparée ;
  `utils/navigationSpeech.ts` rétablit explicitement le réglage normal du guidage,
  car le SDK installé conserve ce paramètre sur son synthétiseur partagé.
  Les libellés sont bornés/nettoyés par `rideAnnouncement.ts`, sans lecture des noms,
  téléphones ou corps libres des notifications.
- **Vérifications réalisées :** 394 tests JavaScript passent sur les suites voix,
  sonnerie, notifications, reprise du trajet, accueil, navigation et confirmations.
  Couverture dédiée dans `tests/rideEntryAnnouncement.test.js`,
  `rideEntryCoordinator.test.js`, `rideAnnouncement.test.js`, `rideAlertSession.test.js` et
  `activeRideResumeCoordinator.test.js` : priorité unique, absence de push, rôle
  conducteur/passager, données incomplètes, compte différent, démarrage, overlays,
  initialisation vocale tardive, retour au premier plan et interruption par le GPS.
  Les fixtures ciblées de `driverManualReroute.test.js`, `homeForegroundLifecycle.test.js`
  et `homeTripPriority.test.js` ont été adaptées sans supprimer leurs assertions.
  TypeScript `--noEmit` et ESLint ciblé passent ; contrôle de taille : 1 110 sources,
  aucun fichier au-dessus de 400 lignes ; `git diff --check` passe.
- **Limites et recette restante :** aucun essai audio sur téléphone physique ni
  nouveau build/déploiement effectué. Vérifier sur Android/iPhone : ouverture avec
  plusieurs alertes, reprise comme passager d’un compte conducteur, voix GPS active,
  retour après verrouillage, mode silencieux/DND et absence de voix française.
  Ces réglages/permissions restent respectés et peuvent rendre l’annonce inaudible.
  Le backend, les canaux natifs et la politique de sonnerie en arrière-plan ne sont
  pas modifiés par ce changement. Aucune amélioration de crash/chauffe n’est revendiquée.

## 2026-10-19 — Annonces vocales des commandes et réservations au premier plan

- **Demande et périmètre :** décrire oralement les nouvelles commandes proches
  et les réservations reçues par le conducteur, uniquement lorsque Zwanga est
  ouverte au premier plan. La voix en arrière-plan reste réservée au parcours
  de trajet en cours ; cette modification n'active aucune tâche vocale headless.
- **Solution appliquée :** `features/notifications/rideAnnouncement.ts` construit
  une phrase française courte : type d'alerte, départ, arrivée, places et date/heure
  prévue si présentes (heure de Kinshasa). Seules les métadonnées structurées
  versionnées sont lues, pas le corps libre du push, les noms ou les téléphones.
  Les anciennes notifications ont une phrase générique, sans détails inventés.
  Le libellé « Ma position actuelle » devient « point indiqué par le passager ».
- **Cycle de vie :** `services/foregroundRideAnnouncement.ts` et
  `hooks/notifications/useRideRinging.ts` n'annoncent que les alertes encore
  présentes et destinées au compte courant. Une seule voix à la fois, une lecture
  par alerte dans la session, historique limité à 100 clés, délai de 2 s entre
  lectures, garde de 25 s contre une initialisation ou une fin de lecture bloquée.
  Aucune lecture des réponses destinées au passager n'est ajoutée. L'arrière-plan,
  la réponse, l'expiration ou la déconnexion interrompent uniquement la voix de
  l'alerte possédée par ce service. Les reprises tardives après changement de
  compte ou d'état de l'application sont invalidées.
  `hooks/notifications/useDriverNotifications.ts` restaure aussi une alerte
  fraîche lors du toucher du push, même si iOS a déjà retiré sa carte. Sur Android,
  ce toucher passe d'abord par le transfert sonore idempotent existant ; il ne
  crée pas une seconde sonnerie. Les anciens clics d'acceptation/refus ne sont
  jamais rejoués au démarrage.
- **Audio et priorité :** `services/foregroundRideSound.ts` suspend son propre
  lecteur pendant la phrase et ne reprend que ce même lecteur toujours actif.
  `services/navigationSpeechPriority.ts` et `utils/navigationSpeech.ts` donnent
  la priorité aux instructions de navigation et empêchent un arrêt d'alerte
  tardif de couper une instruction GPS. La politique existante de guidage au
  premier plan/arrière-plan est conservée. La déconnexion passe aussi par
  `store/middleware/rideAlertAcknowledgement.ts`.
- **Performance et compatibilité :** réutilisation d'`expo-speech` déjà installé,
  sans nouvelle dépendance, nouveau service distant ou permission microphone.
  Initialisation à la demande, recherche de voix française mise en cache, sans
  nouvelle lecture réseau de trajet ni polling supplémentaire. Sur Android,
  l'initialisation TTS est attendue avant de soumettre une phrase : la file native
  différée de la version installée ne serait pas vidée par `stop()` avant init.
  Voix absente, erreur moteur, permissions/canal muets : repli sans modal ni boucle
  de relance. La protection existante excluant les simulateurs est également
  appliquée aux annonces. Aucun volume système n'est forcé ; le mode silencieux
  iOS reste une limite documentée par [Expo Speech](https://docs.expo.dev/versions/latest/sdk/speech/).
- **Backend préparé :** `src/notifications/ride-speech-data.ts`,
  `transactional-notifications.subscriber.ts`,
  `src/trip-requests/dispatch/dispatch.service.ts` et `scheduled-request-alert.ts`
  dans le dépôt voisin ajoutent des champs scalaires bornés aux pushes existants.
  `src/notifications/notifications.service.ts` transmet également la limite
  `ringUntil` existante aux commandes programmées APNs/FCM v2, afin de distinguer
  une ouverture fraîche d'un ancien push sans prolonger sa durée.
  Les réservations utilisent les points du passager, sinon ceux du trajet.
  Rayon, destinataires, transports, délais, acceptation et transactions inchangés.
  Aucun changement de SQL, de schéma, de configuration AWS ou de données réelles.
- **Vérifications réalisées :** 135 tests mobiles passent, dont les nouveaux
  `tests/rideAnnouncement.test.js` et les tests de cycle de vie audio dans
  `tests/rideAlertSession.test.js`, plus régressions sonnerie, push, navigation,
  proximité et compte à rebours passager. 141 tests backend passent dans sept
  suites (métadonnées, producteur immédiat, commandes programmées, subscriber,
  transports, réponses sonores passager et réservations). TypeScript mobile et
  backend sans émission réussis ; ESLint ciblé sans erreur ni avertissement ;
  1 105 sources mobiles contrôlées, aucune au-dessus de 400 lignes.
- **Limites et livraison :** tests JavaScript/TypeScript avec moteurs audio,
  notifications et base simulés, pas de validation de voix/volume ni de stabilité
  native sur téléphone. Aucun build, déploiement, migration ou push réel lancé.
  Déployer le backend pour les détails vocaux et livrer le mobile ; le nouveau
  build Android reste requis pour le correctif de sonnerie précédent. Recette
  physique : réception téléphone verrouillé (sonnerie seule), ouverture pendant
  une alerte fraîche (phrase unique), retour en veille (voix de l'alerte arrêtée),
  réponse/expiration, plusieurs alertes, guidage en cours, compte différent,
  mode silencieux et moteur français absent. Les délais de restauration des
  alertes/sonnerie précédents ne sont pas prolongés pour faire parler un ancien push.

## 2026-10-19 — Sonnerie Zwanga Android et arrêt après réponse

- **Constat et périmètre :** sonnerie Android signalée comme absente alors que
  celle d’iOS fonctionne. L’inspection confirme un canal utilisant la sonnerie
  système, une extinction volontaire à chaque ouverture de l’application et
  des alertes silencieuses au premier plan. Ce sont des comportements constatés
  dans le code ; la cause exacte sur les téléphones du test interne n’a pas été
  reproduite sur appareil.
- **Android natif :** `DriverAlertModule.java` et `services/driverAlertChannel.ts`
  ajoutent `zwanga-ride-ring-v4`, qui utilise le fichier embarqué `driver_ring`
  (identique au PCM iOS de 29 secondes), avec vibration et usage notification.
  Les anciens canaux explicitement personnalisés, abaissés ou coupés sont
  conservés. Un ancien binaire revient au canal embarqué v2. La capacité de
  transport v3 reste compatible avec le serveur actuel ; pas de migration SQL.
  `hooks/auth/usePushRegistration.ts` reconnaît le nouveau canal.
- **Application ouverte :** `services/foregroundRideSound.ts` charge à la demande
  un seul lecteur `expo-audio` pour toutes les alertes, avec vibration. Aucun
  lecteur n’est initialisé lors de la connexion. Permissions, canal désactivé,
  mode silencieux Android et filtre Ne pas déranger sont contrôlés ; le volume
  système n’est pas modifié. Une autorisation refusée n’est pas interrogée toutes
  les secondes. Le lecteur est libéré à l’arrêt et en arrière-plan.
- **Décisions :** `features/notifications/rideAlert.ts`, `services/rideAlertSession.ts`,
  `hooks/notifications/useRideRinging.ts` et le middleware
  `store/middleware/rideAlertAcknowledgement.ts` conservent l’alerte quand le
  conducteur ouvre l’accueil ou consulte la réservation. Une réponse confirmée
  depuis accueil, gestion ou navigation éteint seulement l’alerte concernée.
  Les actions directes de notification arrêtent à l’appui comme auparavant,
  ouvrent l’application et signalent un éventuel échec serveur sans rejouer la
  décision. Une commande de proximité non exclusive peut être ignorée localement
  depuis sa notification, sans refuser la commande pour les autres conducteurs.
  Les listes de réservations résolues sont rapprochées des notifications en un
  seul lot, sans une lecture native par réservation.
- **Passager :** après acceptation d’une commande, ou acceptation/refus d’une
  réservation publiée, l’arrêt au premier plan correspond à l’ouverture du
  trajet, de sa navigation passager ou de la commande concernée. Ouvrir l’accueil
  ne suffit pas. `services/passengerRideAlerts.ts` retire uniquement les
  notifications du bon destinataire et du bon trajet. Le rôle est celui dans le
  trajet, pas uniquement le rôle conducteur/passager du compte.
- **Intégration et protections :** `services/driverNotifications.ts`,
  `hooks/notifications/useDriverNotifications.ts`, `services/notifeeBackgroundHandler.ts`,
  `components/NotificationHandler.tsx`, `app/incoming-driver.tsx` et
  `features/notifications/IncomingBookingRedirect.tsx` assurent le relais depuis
  la notification système sans second son simultané intentionnel. Fermer l’écran
  ne vaut plus réponse. Identifiants stables, anti-doublons, expiration des
  propositions, destinataire et génération de session restent contrôlés ; la
  mémoire des alertes/accusés est plafonnée. Le minuteur de contrôle ne tourne
  que pendant une alerte au premier plan. Texte de `app/driver-availability.tsx`
  et déclaration `types/notifee.d.ts` adaptés. Aucun changement GPS, rayon de
  recherche, attribution des courses ou montant des paiements.
- **Backend préparé :** les réponses de réservation sont désormais typées
  `booking_response` avec leur statut. Le transport ajoute destinataire passager,
  échéance sonore et fichier audio pour les clients compatibles ; les anciens
  clients gardent une notification visible. Voir le
  [journal backend](../../zwanga-backend/docs/CHANGEMENTS_TECHNIQUES.md).
- **Vérifications :** 98 tests mobiles ciblés passent (transport, inscription
  push, session sonore, navigation, actions et assets) ; 101 tests backend de
  notifications et réservations passent. TypeScript mobile et backend réussis,
  lint sans erreur (deux avertissements préexistants dans le handler Notifee),
  `git diff --check` réussi dans les deux dépôts ; 1102 sources mobiles contrôlées,
  aucune au-dessus de 400 lignes.
  Compilation Java isolée du module réussie avec les jars Android 36 / React
  Native 0.81.5 ; trois avertissements d’annotations Kotlin/Infer absentes du
  classpath réduit. Ce contrôle n’est ni une compilation Gradle complète, ni un
  test audio natif. Aucun gain de volume réel ni disparition de crash mesuré.
- **Limites et livraison :** en arrière-plan l’alerte reste bornée à 29–30 s,
  ou à l’expiration plus courte de la proposition ; aucune sonnerie iOS infinie
  n’est promise ([documentation Apple](https://developer.apple.com/documentation/usernotifications/unnotificationsound)).
  À l’ouverture pendant cette fenêtre, le relais au premier plan continue jusqu’à
  la réponse/consultation ou expiration. Un ancien push expiré ne recommence pas
  à sonner au prochain lancement. Retour en arrière-plan : le lecteur applicatif
  est arrêté, sans prolongation artificielle des notifications système.
  Les réglages de volume et restrictions du téléphone restent déterminants.
  Nouveau build Android et livraison du code mobile iOS nécessaires, avec backend
  à déployer. Aucun build, déploiement, envoi de push réel ni publication effectué.
  Recette physique restante : Android/iPhone, écran verrouillé, premier plan,
  retour à l’accueil, accepter/refuser, réponse passager, mute/DND, déconnexion,
  plusieurs alertes et expiration pendant la lecture.

## 2026-10-18 — Connexion Apple : finalisation du profil et API de production

- **Périmètre et constat :** le refus App Review du 12 octobre, build 138,
  comporte une capture `property email should not exist` sur le formulaire de
  profil. Cela établit un rejet du contrat HTTP lors de cet essai, pas une panne
  démontrée de la feuille native Apple. Le code actuel possède déjà une liste
  explicite de champs pour `/auth/apple/mobile` et le backend ignore l’ancien
  champ `email` sans l’utiliser comme preuve d’identité.
- **Vérification distante effectuée :** sur l’API AWS actuelle, deux requêtes
  synthétiques avec un jeton volontairement invalide ont donné : `401` avec
  l’ancien champ `email`, sans l’erreur de whitelist ; `400` avec un autre champ
  inconnu, rejeté par la validation. Aucun compte créé, aucun identifiant Apple
  réel utilisé, aucun paramètre serveur modifié. Cela vérifie la compatibilité
  de cette API, pas l’adresse réellement embarquée dans le build refusé ni une
  connexion Apple complète sur appareil.
- **Correction de destination :** `config/env.ts` utilisait encore l’ancienne API
  Render quand aucune URL explicite n’était fournie. Le secours pointe désormais
  vers l’API AWS vérifiée, également fixée dans `eas.json` pour le profil de
  production. Les URL explicites de développement restent prioritaires et les
  autres profils restent inchangés. L’IPA refusé n’a pas été inspecté : son
  utilisation de l’ancienne API reste une hypothèse, pas une mesure.
- **Correction du formulaire :** `app/auth.tsx` conserve maintenant les champs
  de nom préremplis et modifiables aussi pour Apple, et l’accès à leur correction
  depuis l’étape KYC conducteur. Auparavant ces champs étaient cachés pour Apple
  alors que la validation les exigeait, ce qui bloquait une inscription si le
  nom n’était plus fourni après réinstallation. `useSignupProfileActions.ts`
  et `useRegistrationActions.ts` indiquent de compléter le formulaire ; ils
  n’exigent plus de retirer l’autorisation Apple ou de changer de connexion.
  Le nom fourni par Apple ou son cache continue de préremplir les champs.
- **Contrat d’inscription :** `hooks/auth/useRegistrationActions.ts` ne transmet
  plus non plus l’ancien champ `email` dans le formulaire téléphonique, y compris
  s’il reste dans un brouillon social. Le paramètre devenu inutile est retiré
  de `hooks/auth/useAuthController.ts`. Le corps Apple existant reste limité aux
  champs attendus ; l’adresse d’identité vient du jeton vérifié par le backend.
- **Précautions :** vérification du jeton/nonce Apple, validation stricte du
  backend, cache natif limité au même identifiant Apple, sauvegarde de session,
  verrou anti-double-envoi, reprise de finalisation sans recréer de compte,
  inscription Google/téléphone, rôle conducteur, véhicule et KYC conservés.
  Pas de changement de SDK, capacité Apple, identifiant d’application ou base.
- **Tests réalisés :** **75 tests JavaScript réussis** avec `node --test`
  sur `appleRegistration`, `authSubmissionLoading`, `authFlowDraft`,
  `googleAuthFlow`, `authInternationalPhone`, `vehiclePlate`,
  `profilePhotoSelection` et `appVersions` (fichiers `tests/<nom>.test.js`).
  Le nouveau test contrôle l’URL de production et son secours, le filtrage des
  champs HTTP Apple, l’absence de nom après réinstallation et le cache par
  compte. Les tests de finalisation couvrent la saisie du nom manquant et
  l’absence de `email` résiduel. Backend : **58 tests réussis**, détaillés dans
  son journal. `tsc --noEmit`, ESLint ciblé et `git diff --check` validés ;
  contrôle de taille : 1 096 sources, aucun dépassement des 400 lignes.
- **Livraison et limites :** aucun build EAS, envoi TestFlight, réponse App Store
  Connect ou déploiement déclenché. Fournir un nouveau build iOS, puis essayer
  sur iPhone et iPad : première autorisation, connexion existante, masquage
  d’adresse, réinstallation avec nom absent, création du profil et arrivée dans
  l’application, ainsi que mise à jour depuis la version précédente. Les tests
  JavaScript et les requêtes avec jeton invalide ne remplacent pas ces essais
  natifs et ne garantissent pas l’acceptation d’Apple.
- **Références :** [comportement des informations Apple](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple),
  [journal technique backend](../../zwanga-backend/docs/CHANGEMENTS_TECHNIQUES.md#18-octobre-2026--vérification-du-contrat-apple-email-app-review).

## 2026-10-18 — Positions anciennes autorisées pour les commandes hors trajet

- **Demande et problème :** accepter la dernière position du conducteur même
  lorsqu’elle date de plus de 30 secondes, uniquement pour les commandes de
  proximité hors trajet. Le filtre partagé mobile rejetait auparavant ces
  relevés avant leur envoi au backend, notamment les lots natifs retardés.
- **Solution appliquée :** `services/nearbyDriverLocationPolicy.ts` supprime la
  limite d’âge pour la découverte des conducteurs. La date doit rester valide,
  ne pas dépasser le futur de plus de cinq secondes ; coordonnées, précision
  maximale de 250 m et refus des positions simulées restent contrôlés.
  `services/nearbyDriverPositionDelivery.ts` conserve le `recordedAt` original,
  refuse les doublons/retours en arrière, maintient la cadence de trois minutes,
  l’authentification, le contrôle de session et le recul progressif après erreur
  réseau. Aucune file d’historique ni réécriture de date n’est ajoutée.
- **Séparation des trajets :** juste avant l’envoi, le service vérifie à nouveau
  les sessions conducteur et passager, notamment si un trajet a démarré pendant
  la lecture des identifiants. `services/nearbyDriverLocation.ts` conserve
  l’arrêt de la collecte de proximité pendant un trajet et sélectionne toujours
  le relevé le plus récent du lot natif. Les profils GPS en trajet, permissions,
  désactivation explicite et déconnexion ne sont pas assouplis. Les contrôles
  de fraîcheur du flux cartographique en direct restent inchangés.
- **Information utilisateur :** `app/driver-availability.tsx` explique que la
  dernière position connue peut être ancienne et ne pas refléter l’emplacement
  actuel. Les champs facultatifs `locationPolicy` et `positionExpires` de
  `store/api/driverDispatchApi.ts` conditionnent ce texte : un ancien serveur ou
  une ancienne présence encore soumise à expiration conserve le texte précédent.
- **Vérifications réalisées :** `npm run test:nearby-drivers` : 108 tests
  réussis ; `node --test tests/rideLocationStream.test.js
  tests/sharedScreenLocation.test.js tests/performanceGpsPlaces.test.js` :
  21 tests réussis ; `node node_modules/typescript/bin/tsc --noEmit
  --incremental false` : réussi. Les nouveaux cas dans
  `tests/nearbyDriverLocation.test.js`, `tests/nearbyDriverDelivery.test.js`,
  `tests/driverAvailability.test.js` et `tests/rideLocationStream.test.js`
  couvrent les relevés de plus de 30 secondes jusqu’à 90 jours, leur date réelle,
  l’ordre d’envoi, les lots retardés, la reprise réseau, les sessions de trajet
  et l’absence d’affichage d’un ancien relevé comme position en direct.
- **Déploiement et limites :** déployer d’abord la migration et le correctif de
  dernière position connue du dépôt `zwanga-backend`, préparés séparément :
  l’ancien backend peut encore refuser les dates anciennes. Aucun déploiement,
  changement AWS/Terraform/CI/CD ou modification de `.env` dans cette étape.
  Les tests sont JavaScript avec services natifs simulés, pas des essais sur
  téléphone. Le lecteur GPS de secours au premier plan continue de chercher
  une position récente ; aucun parcours illimité du cache ni nouvelle tâche
  native n’a été ajouté. Un système qui ne livre aucun relevé, une permission
  refusée ou un arrêt forcé ne sont pas réparés par cette suppression du filtre.
  À valider sur Android et iPhone : réception de lots retardés hors trajet,
  passage en arrière-plan, début/fin de trajet et retrait des permissions.

## 2026-10-18 — Nouvelle commande : diffusion serveur et notification de secours

- **Périmètre :** absence de push simple signalée, avec diffusion souhaitée à
  tous les conducteurs éligibles à 5 km. Le backend possédait déjà les lots de
  diffusion ; son filtre d’inscription à la sonnerie pouvait néanmoins exclure
  des destinataires ayant un jeton push valide.
- **Solution :** correctif préparé dans le dépôt voisin `zwanga-backend` :
  séparation de la sélection géographique et de la capacité sonore, push
  ordinaire visible en secours pour les clients non enregistrés/anciens,
  conservation des alertes sonores pour les clients compatibles. Aucun fichier
  fonctionnel mobile, statut du conducteur ou choix de son n’est changé par
  cette intervention complémentaire. Le mécanisme Android de sonnerie du
  téléphone reste celui de `DriverAlertModule.java` et de son canal v3.
- **Vérifications et limites :** 99 tests unitaires serveur et 39 tests sur
  PostgreSQL/PostGIS local jetable réussis ; compilation serveur validée,
  contrôles AWS en lecture seule, essais SQL isolés documentés côté backend.
  Aucun envoi push réel ou déploiement. La réception et le volume sur téléphone
  ne sont pas déduits des tests serveur. Les filtres de rôle, KYC, véhicule,
  disponibilité réelle et fraîcheur de position sont conservés.
- **Détail des fichiers, tests et précautions :**
  [journal technique backend](../../zwanga-backend/docs/CHANGEMENTS_TECHNIQUES.md#18-octobre-2026--diffusion-à-tous-les-conducteurs-proches-et-push-de-secours).

## 2026-10-18 — Alertes conducteur automatiques et retrait du badge de disponibilité

- **Demande et périmètre :** absence de notification/sonnerie signalée dans le
  test interne Android, sans passage souhaité par un écran de configuration.
  Retirer aussi le badge « Indisponible » de l’accueil conducteur, qui peut être
  interprété à tort comme une déconnexion. Travail limité au dépôt mobile sur
  `rollback/production-155-20261015`, sans reprendre de code de `master`.
- **Constats dans le code, distincts du signalement sur téléphone :**
  l’enregistrement automatique existait déjà dans `AuthGuard` via
  `usePushRegistration`. Le canal Android était préparé après la demande de
  permission. Le hook considérait cette demande comme effectuée même après
  une erreur native temporaire. Le décodeur Expo privilégiait `actionProtocol`
  mais pas `ringAlert` devant `dataString` : un corps textuel non JSON pouvait
  masquer une alerte de proximité pourtant valide. Les commandes Android v3
  reçues au premier plan étaient acquittées sans notification locale visible.
  Ces cas sont reproduits par tests JavaScript ; ils ne prouvent pas la cause
  du défaut signalé sur le build interne. L’émulateur inspecté en lecture seule
  utilise un ancien build 146 / 1.0.16, pas le binaire concerné. Aucun envoi FCM
  réel ni mesure acoustique n’a été réalisé.
- **Préparation automatique :** `services/pushNotifications.ts` prépare le
  canal Android avant la permission et la récupération du jeton. Une seule
  demande système peut être en cours ; une réponse terminée n’est pas répétée
  dans la même exécution de l’application. Une erreur native reste réessayable.
  Aucun prompt en arrière-plan ou quand `canAskAgain` vaut faux. Un accord donné
  ensuite dans les réglages est reconnu. La rotation du jeton ne déclenche
  jamais de demande de permission. `hooks/auth/usePushRegistration.ts` conserve
  sa reprise à 60 secondes, au premier plan/en ligne, sans visite d’un écran
  spécial ; le service de permissions décide désormais si le prompt est permis.
- **Réception et visibilité :** `features/notifications/driverInvitation.ts`
  reconnaît les champs directs `ringAlert` avant `dataString` sans assouplir la
  validation des identifiants ni du protocole. `services/driverNotifications.ts`
  affiche aussi les commandes v3 au premier plan sur le canal silencieux déjà
  utilisé pour les réservations. Une commande diffusée à plusieurs conducteurs
  n’obtient pas les actions d’une offre exclusive. Le tap ouvre les détails,
  jamais une acceptation automatique. `hooks/notifications/useDriverNotifications.ts`
  transmet ces messages au gestionnaire ; `components/NotificationHandler.tsx`
  évite une seconde présentation Expo sur Android. iOS et les notifications
  distantes v2 conservent leur présentation existante.
- **Interface :** `components/home/HomeTripsSheet.tsx` ne monte plus
  `HomeDriverStatus`. Aucun statut « En ligne » artificiel ne le remplace ;
  disponibilité serveur, GPS, rôle, boutons et barre d’onglets sont inchangés.
  `app/driver-availability.tsx` reste une aide facultative depuis le profil,
  explicite la préparation automatique et propose de personnaliser le canal
  réellement utilisé via `openDriverAlertSettings`, plutôt que les réglages
  génériques de l’application. Le consentement à la localisation est conservé.
- **Précautions :** délai maximal de sonnerie de 30 secondes, vibration/canal
  sonnerie du téléphone déjà natifs, arrêt à l’ouverture de Zwanga, contrôle du
  destinataire et de la session, déduplication et expiration conservés. Aucun
  volume forcé, contournement du mode silencieux ou de « Ne pas déranger »,
  suppression de canal ni modification des préférences système. Aucune
  dépendance, configuration native, variable d’environnement, règle de sélection
  des conducteurs, base ou infrastructure modifiée.
- **Vérifications réalisées :**
  - **117 tests JavaScript réussis** : `pushPermissions`, `pushRegistration`,
    `driverNotifications`, `driverAlertChannel`, `driverNotificationNativeAssets`,
    `driverNotificationResponse`, `requestAcceptanceSound`, `incomingBookingRedirect`,
    `driverAvailability`, `requestNotificationVisibility`, `notificationNavigation`
    et `homeCompactLayout` (`node --test tests/<nom>.test.js`). Le nouveau fichier
    `tests/pushPermissions.test.js` simule permission initiale, refus, fermeture
    du prompt, panne temporaire, concurrence, reprise, rotation et transport iOS.
  - **253 tests JavaScript de non-régression réussis** avec
    `node --test --test-concurrency=2 tests/home*.test.js tests/startupSession.test.js
    tests/nearbyDriver*.test.js tests/driverGpsLifecycle.test.js
    tests/driverBackgroundSession.test.js tests/passengerGpsProfile.test.js`.
    Certains tests Home sont communs aux deux exécutions : les compteurs ne
    représentent pas des tests distincts à additionner.
  - `npx.cmd --no-install tsc --noEmit` réussi. ESLint des fichiers modifiés :
    aucune erreur, un avertissement préexistant sur le chargement différé par
    `require` de Notifee. Contrôle de taille : 1 096 sources, aucun dépassement
    des 400 lignes. `git diff --check` validé.
- **Livraison et limites :** aucun build/push/déploiement déclenché ; les versions
  installées restent inchangées. À vérifier après livraison sur un vrai Android :
  installation neuve et mise à jour, autorisation système, réception d’une
  réservation et d’une commande éligible à proximité, application ouverte puis
  en arrière-plan/écran verrouillé, vibration et sonnerie, arrêt au retour dans
  Zwanga, refus de permission et réglages silencieux conservés. L’envoi serveur
  (éligibilité, position récente, jeton enregistré, résultat FCM) n’a pas été
  vérifié en production. Ne pas conclure à une réception garantie ni à un gain
  de volume mesuré à partir de ces seuls tests.
- **Références et contrôle local :** [préparation des notifications Expo](https://docs.expo.dev/versions/latest/sdk/notifications/),
  [autorisation Android des notifications](https://developer.android.com/develop/ui/compose/notifications/notification-permission).
  Le comportement Android « denied + canAskAgain » à la première demande a aussi
  été vérifié dans le code installé du SDK Expo 54, `NotificationPermissionsModule.kt`.

## 2026-10-18 — Version de l’application Android et iOS : 1.0.17

- **Demande et périmètre :** incrémenter la version Expo pour les prochaines
  livraisons Android et iOS. La branche actuelle utilisait encore 1.0.16.
- **Solution appliquée :** passage à **1.0.17** dans `app.config.js`,
  `package.json`, les deux métadonnées racine de `package-lock.json`,
  `android/app/build.gradle` (`versionName`) et les deux configurations Xcode
  de `ios/zwanga.xcodeproj/project.pbxproj` (`MARKETING_VERSION`). Le plist
  continue de lire les variables de build Xcode, sans valeur dupliquée.
- **Comportements conservés :** SDK Expo 54 et versions de toutes les
  dépendances inchangés, correctif CocoaPods précédent conservé, identifiants
  des applications et profils EAS inchangés. `appVersionSource: remote` et
  `production.autoIncrement: true` restent actifs : les prochains builds de
  production incrémenteront leurs compteurs Android/iOS côté EAS. Les anciens
  compteurs locaux ne sont pas utilisés pour réinitialiser les compteurs
  distants ; leur prochaine valeur n’a pas été inventée ni modifiée à distance.
- **Vérifications :** `node --test tests/appVersions.test.js
  tests/iosDeploymentTarget.test.js tests/iosCrashlytics.test.js
  tests/androidBuildPerformance.test.js` : **18 tests réussis, 1 test Ruby
  ignoré** (Ruby absent sous Windows), dont les 5 contrôles de cohérence des
  versions. `git diff --check` validé. Aucun build natif ni test sur appareil.
- **Livraison :** modifications locales sur `rollback/production-155-20261015`,
  sans fusion de `master`, sans commit/push, build ou publication déclenchés.
  Les versions déjà installées restent inchangées jusqu’à une nouvelle livraison.
  Le prochain numéro de build et l’acceptation par les stores restent à vérifier
  lors de cette livraison. [Gestion des versions EAS](https://docs.expo.dev/build-reference/app-versions/).

## 2026-10-18 — Build iOS : minimum de déploiement des bundles CocoaPods

- **Périmètre et constat réel :** le journal Xcode du build `46bce993` contient
  15 erreurs `IPHONEOS_DEPLOYMENT_TARGET` dans le projet Pods. Des bundles de
  ressources/confidentialité ciblent iOS 9 à 14 alors que ce SDK iPhoneOS 27.1
  refuse les cibles inférieures à 15.0. Le projet de l’application cible déjà
  **15.1** en Debug et Release. Les messages `MODULEMAP_FILE` et les phases
  Crashlytics sans sorties sont des avertissements, pas les erreurs bloquantes
  identifiées dans ce journal.
- **Solution appliquée :** après `react_native_post_install`, `ios/Podfile`
  parcourt toutes les cibles du projet Pods et toutes leurs configurations,
  y compris les bundles oubliés par le relèvement des seules bibliothèques.
  Les versions numériques inférieures et les valeurs absentes sont relevées
  au minimum de l’application. `Gem::Version` évite les comparaisons erronées
  par flottant ; les versions supérieures et les expressions de build sont
  conservées. `ios/Podfile.properties.json` et `app.config.js` rendent explicite
  le minimum existant de 15.1, sans augmenter le minimum de l’application.
- **Régénération :** `plugins/withIosDeploymentTargetFloor.js`, enregistré dans
  `app.plugin.js`, reproduit le même bloc au prochain prebuild, sans doublon.
  Il échoue explicitement si le point d’insertion est absent ou ambigu ou si
  un marqueur manque. Le Podfile déjà versionné est corrigé directement : le
  prochain build n’a pas besoin d’un prebuild destructif sur le poste local.
- **Précautions :** aucune fusion, récupération ou reprise de code de `master` ;
  travail sur `rollback/production-155-20261015`. Versions des dépendances,
  `Podfile.lock`, règles des modules Maps/Firebase, intégration Didit/Crashlytics,
  signature, Android et code métier inchangés. Ni `.env` modifié, ni déploiement,
  ni build EAS lancé. L’image iOS `latest` n’a pas été changée.
- **Vérifications :** `node --test tests/iosDeploymentTarget.test.js
  tests/iosCrashlytics.test.js tests/androidBuildPerformance.test.js
  tests/storeReview.test.js` : **23 tests JavaScript réussis, 1 test Ruby ignoré**
  car Ruby est absent du poste Windows. Deux tests de configuration échouaient
  avant le correctif et passent après ; contrôle du bloc natif/prébuild,
  idempotence, branchement du plugin et configurations existantes. Aucun test
  Node ne prouve l’exécution du bloc Ruby dans CocoaPods ni une archive Xcode.
  Lint des fichiers JavaScript concernés : aucune erreur, un avertissement
  préexistant de variable inutilisée dans `app.config.js`. Contrôle de taille
  (1 096 sources) et `git diff --check` validés.
- **Livraison et limites :** relancer un build iOS depuis cette branche avec
  `npx.cmd eas-cli build --platform ios --profile production`. Pour un workflow
  GitHub/EAS, enregistrer et pousser ces changements sur cette même branche,
  puis la sélectionner explicitement. À vérifier sur macOS/EAS : `pod install`,
  cibles Pods à 15.1 minimum (sans abaisser celles plus récentes), archive et
  acceptation App Store Connect. La réussite du prochain build reste à confirmer.
- **Références :** [hook CocoaPods post_install](https://guides.cocoapods.org/syntax/podfile.html#post_install),
  [étapes du build iOS EAS](https://docs.expo.dev/build-reference/ios-builds/).
  Le code local de React Native 0.81.5 (`scripts/cocoapods/utils.rb`) ne relève
  que les `native_target` des résultats d’installation, d’où la protection
  complémentaire des cibles de ressources.

## 2026-10-18 — Annulation passager : stabilisation des vues natives des dialogues

- **Périmètre et constat :** fermeture Android signalée dans la navigation
  passager après « Oui, annuler ». Le journal natif de l’émulateur, à 9 h 21,
  contient réellement `addViewAt` / `View already has a parent` : un lot Fabric
  retire un conteneur puis tente de rattacher ses enfants à
  `RNSScreenContentWrapper`. Il s’agit d’un échec de montage de vues, pas d’une
  preuve de refus de l’annulation par le backend. Le statut final de la
  réservation n’a pas été vérifié sur le serveur.
- **Analyse :** le conteneur qui neutralise les clics derrière les dialogues
  change de propriétés à leur fermeture. Son aplatissement natif correspond au
  déplacement observé dans le journal ; l’interaction avec une transition
  d’écran est l’explication retenue, sans nouvelle reproduction contrôlée.
  La [documentation React Native 0.81](https://reactnative.dev/docs/0.81/view#collapsable)
  précise comment empêcher cet aplatissement. Un
  [signalement amont similaire](https://github.com/software-mansion/react-native-screens/issues/4677)
  décrit ce mécanisme sur d’autres versions ; il ne constitue pas une validation
  de notre correctif sur appareil.
- **Solution appliquée :** `features/navigation/RideOverlayProvider.tsx` fixe
  `collapsable={false}` sur les deux conteneurs de `RideOverlayScope`. Leur
  présence native ne dépend plus de l’ouverture ou fermeture d’un dialogue.
  Cette protection est limitée à ces conteneurs, sans désactiver Fabric ni
  modifier les dépendances, les animations globales ou les sources natives.
- **Comportements conservés :** confirmation explicite, appel d’annulation,
  résultat/erreur, ordre de priorité des dialogues, blocage des clics et de
  l’accessibilité derrière le dialogue puis restitution à la fermeture.
  Aucun changement du backend, des tarifs, du GPS ou des règles métier.
- **Vérifications :** `tests/rideOverlays.test.js` ajoute deux tests qui échouent
  avant le correctif puis passent après. Ils vérifient les propriétés et la
  structure React de 100 cycles confirmation/résultat par plateforme simulée,
  ainsi que la restitution des interactions et le nettoyage. Suite élargie
  navigation, dialogues, notation, partage et récupération : **137 tests
  JavaScript réussis**. Typage TypeScript et lint ciblé validés ; contrôle de
  taille : 1 096 sources, aucun dépassement. Ces tests ne rendent pas les vues
  natives Android.
- **Limites et livraison :** aucun gain de performance mesuré, aucune annulation
  réelle déclenchée pour tester, aucun déploiement effectué. Le correctif est
  JavaScript/TSX : recharger complètement le build de développement depuis Metro
  avant l’essai. Sur une version distribuée, il faut livrer le nouveau code.
  À vérifier sur Android et iOS : garder la réservation, confirmer une annulation
  autorisée, retour à la liste et gestion d’une erreur réseau. La disparition du
  crash reste à confirmer par ces essais natifs et leurs journaux.

## 2026-10-18 — Correctifs de fiabilité de l’audit mobile et préparation backend

Signalements réellement envoyés, transferts protégés contre les doubles appuis et
reprises ambiguës, délai de restauration de session, lancement KYC lié au cycle de
vie de l’écran, reconnexions socket bornées, avis et listes de commandes paginés,
modales intégrées et erreurs des trajets réguliers prises en charge.
Le backend voisin comprend les pages authentifiées et l’idempotence transactionnelle
des transferts, avec une migration d’index préparée mais non exécutée.

Suite mobile complète : 1 959 tests réussis ; 44 tests ciblés repassés après les
derniers garde-fous de reprise de transfert/KYC. Backend : 64 tests ciblés réussis.
Typage mobile/backend et contrôles réseau/taille validés. Aucun déploiement ni
essai physique : pas de promesse de suppression des crashs natifs. Certaines
lectures de commandes de l’accueil/recherche globale et les compteurs du profil
restent à convertir sans perdre les actions prioritaires.

Solutions, fichiers, compatibilité, ordre de livraison, tests et limites dans
[Correctifs de l’audit de fiabilité](AUDIT_CORRECTIFS_FIABILITE_2026_10_18.md).

## 2026-10-18 — Accueil clients et commandes conducteur directement accessibles

À la demande de l’utilisateur, l’accueil conducteur montre uniquement les clients
dans les suggestions, sans onglet Trajets ni remplacement par des trajets publics
lorsqu’il n’y a pas de client. Ses activités personnelles restent prioritaires.
Ajout de Chercher un trajet pour voyager comme passager via la recherche existante ;
Publier et Commander restent disponibles. Les deux lectures de découverte de
trajets publics sont suspendues sur cet accueil, sans modifier la recherche.

Dans la navigation, Arrêter le trajet **et** Partager le trajet sont directement
visibles, avec Ma position et Plus. Cette demande remplace le rangement précédent
de l’arrêt et du partage dans Plus ; le réglage du son y reste accessible. Les
confirmations d’arrêt, les règles de pause et l’accord des passagers ne changent pas.

206 tests JavaScript ciblés réussis, typage validé, lint ciblé sans erreur ni
avertissement ; aperçus Web 320/390 px inspectés. Aucun essai natif ni déploiement,
aucune mesure de gain de performance. Fichiers, contrôles et limites dans
[Accueil conducteur centré sur les clients](ACCUEIL_CONDUCTEUR_CLIENTS.md) et
[Navigation conducteur simple](NAVIGATION_CONDUCTEUR_SIMPLE.md).

## 2026-10-18 — KYC Didit natif sur Android et iOS

- **Demande :** conserver Didit et utiliser son SDK, sans redirection web sur mobile.
- **Solution appliquée :** `hooks/useDiditKycFlow.ts` exige un `sessionToken` sur
  Android/iOS et ne bascule plus vers `WebBrowser` après une erreur native. Un
  module absent demande une installation complète ; un jeton absent signale
  une session indisponible. Un verrou synchrone empêche deux créations de session
  sur double appui et se libère aussi après erreur/annulation.
- **Compatibilité :** endpoints, confirmation des noms, annulation, synchronisation
  backend et gestion du résultat conservés. Le navigateur reste disponible pour
  la cible Web. Aucun changement des clés ni bascule vers AWS.
- **Configuration backend attendue :** fournisseur Didit et mode de lancement
  natif. Un backend encore forcé en mode hébergé ne fournit pas de jeton SDK :
  cette nouvelle application affiche alors une erreur au lieu d'ouvrir le web.
- **Vérifications :** `node --test tests/diditNativeFlow.test.js
  tests/identityQueryLifecycle.test.js` : 14 tests réussis ; compilation
  TypeScript mobile sans émission réussie. Modules natifs simulés dans ces tests,
  pas de session Didit payante, ni essai caméra/selfie sur appareil.
- **Avant livraison :** tester une build native complète sur Android et iOS
  (pas Expo Go), avec le backend prévu. Une application déjà distribuée garde
  son ancien comportement tant que son code n'a pas été mis à jour.

## 2026-10-18 — Navigation conducteur : une prochaine action lisible

Réorganisation de la navigation autour du prochain passager, de son adresse et
du bouton « Le passager est à bord » ou « Le passager est descendu ». Contacter
et SOS restent visibles ; Ma position, Son et Plus remplacent la rangée ambiguë
incluant « Arrêter ». Pause, arrêt avant l’arrivée, partage et autres options
restent accessibles. Les nouvelles réservations gardent Accepter/Refuser sans
mélanger leur identité avec la confirmation d’un passager déjà pris en charge.

158 tests JavaScript ciblés réussis, typage et contrôles réseau/taille réussis,
lint sans erreur avec trois avertissements préexistants. Aperçus Web à données
fictives inspectés aux formats 390 × 760 et 320 × 568 ; pas de validation native
ou de test avec des chauffeurs pour cette modification. Aucune intervention
backend, aucun build ou déploiement. Détails, fichiers et limites dans
[Navigation conducteur simple](NAVIGATION_CONDUCTEUR_SIMPLE.md).

## 2026-10-18 — Reprise du trajet et chargement illustré de la navigation

Correction d'un démarrage refusé après pause avant embarquement : le backend
conservait `startedAt`, puis exigeait sa valeur vide. Reprise sans réinitialiser
le suivi, démarrages répétés sans double notification, lecture fraîche des
conflits côté mobile et loader voiture/itinéraire partagé conducteur/passager.
Contrôles de participation et workflow d'interruption conservés, aucune
réactivation de trajet terminé ou annulé. Fichiers, précautions et recette dans
[Démarrage et chargement de navigation](DEMARRAGE_TRAJET_ET_CHARGEMENT_NAVIGATION.md).

121 tests JavaScript mobiles et 61 tests backend réussis ; typage mobile/backend
réussi, lint ciblé sans erreur (quatre avertissements préexistants). Aperçus Web
standard/petit écran/carte inspectés ; pas d'essai sur téléphone ou PostgreSQL
réel pour ce correctif. Backend à déployer, code mobile à livrer ; aucun build,
déploiement, migration ou changement de configuration effectué ici.

## 11 octobre 2026 — Correctifs de fiabilité : GPS Android, fenêtres iOS et récupération

Périmètre : application mobile, suivi natif Expo Android, affichage des formulaires,
itinéraires et intégration Crashlytics iOS. Aucun changement backend, de base de
données ou d’infrastructure de production ; aucune installation sur l’émulateur.

### Problèmes constatés et solutions appliquées

- **Accumulation GPS Android** : l’audit précédent a trouvé des rapports
  `OutOfMemoryError` dans le build de développement de l’émulateur, dont plusieurs
  dans les traitements natifs Expo Location/TaskManager. Cela ne constitue pas
  une reproduction en production ni une preuve exclusive de la cause mémoire.
  `scripts/patch-expo-location-batches.cjs` applique un correctif natif reproductible
  au postinstall : tampon différé Location limité à 64 positions ; lots des tâches
  GPS Zwanga limités à 64 positions lors de leur création, fusion et extraction ;
  reconstruction des extras sans recopier tout l’ancien lot. Les derniers
  échantillons et leur ordre de livraison sont conservés. Le dédoublonnage devient
  propre à chaque consommateur et les lots de doublons sont libérés.
  Les autres tâches TaskManager, notamment les notifications, ne sont pas tronquées.
- **Le correctif doit entrer dans le binaire** : `package.json` impose la compilation
  des sources de `expo-location`, `expo-task-manager` et de la dépendance nécessaire
  `unimodules-app-loader`. Sans cela, les AAR précompilés Expo ignorent les modifications.
  Aucun nouveau package installé. Les autres modules conservent leur mode de build.
  Le postinstall applique le patch ; le contrôle EAS post-install vérifie sa présence.
  Un changement incompatible des sources attendues fait échouer le patch explicitement.
  `.gitignore` exclut le cache local `android/.kotlin/` produit par la compilation.
- **Sélection GPS JavaScript** : `services/background/latestLocation.ts` remplace
  les copies/tris pour sélectionner la dernière position en un parcours, sans
  mutation du lot, dans `services/driverBackgroundLocationTask.ts` et
  `services/passengerBackgroundLocationTask.ts`. Les horodatages non finis sont ignorés.
- **Reprise du suivi conducteur** : `components/ActiveRideLocationCoordinator.tsx`
  revérifie le démarrage natif au retour au premier plan, même sans changement du
  trajet. Une tentative par retour, sans nouvelle boucle ni répétition des demandes
  de permission pour le même trajet. Le passage en arrière-plan n’arrête pas le
  suivi actif ; déconnexion et fin de trajet gardent leur arrêt explicite.
- **Fenêtres iOS** : `app/(tabs)/profile.tsx` et `app/(tabs)/trips.tsx` hébergent leurs
  formulaires dans des `RideOverlayScope` liés au focus. La suppression d’un trajet
  et `components/TutorialOverlay.tsx` utilisent aussi `RideModal`. Le formulaire
  et le dialogue de résultat passent par la même gestion d’affichage, sans empiler
  deux contrôleurs UIKit. Dans `hooks/trips/useTripEditorNavigation.ts`, les deux
  délais arbitraires de 320 ms sont supprimés : le remplacement formulaire/carte
  est synchrone dans ce périmètre, sans réouverture différée après fermeture.
- **Itinéraires** : `hooks/driver-navigation/useDriverRouteFormatting.ts` et
  `features/passenger-navigation/navigationModel.ts` réutilisent
  `utils/routes/safePolyline.ts`. Rejet des encodages tronqués, caractères invalides,
  données dépassant 100 000 caractères ou 10 000 points décodés ; plafonds d’affichage
  de 200 points conducteur et 180/250 points passager iOS/Android. Conservation
  des extrémités, de la validation régionale et de la correction des axes inversés.
  La validation porte sur tous les points avant réduction, pas seulement les points affichés.
- **Récupération après erreur** : `components/AppErrorBoundary.tsx` n’appelle plus
  `DevSettings.reload()` en release, où cette méthode ne faisait rien. Le bouton
  « Relancer l’interface » remonte l’arbre React ; le rechargement développeur reste
  réservé au développement. Ce n’est pas un redémarrage du processus natif et aucune
  donnée persistée n’est effacée.
- **Crashlytics iOS** : ajout de la phase `[RNFB] Crashlytics Configuration` au projet
  `ios/zwanga.xcodeproj/project.pbxproj`, avec script officiel et entrées dSYM/plist.
  `plugins/withIosCrashlytics.js`, référencé dans `app.plugin.js`, la conserve lors
  d’un prebuild et évite une duplication avec l’autolinking CocoaPods. `ios/Podfile`
  inclut RNFBCrashlytics dans les réglages des bridges Firebase existants. Le lock
  CocoaPods n’est pas fabriqué manuellement : son installation reste à faire sur macOS.

### Comportements conservés et précautions

- Fréquence GPS, précision, détection d’embarquement/arrivée, permissions et session
  serveur inchangées. Les lots de plus de 64 positions abandonnent les plus anciens
  échantillons : ce suivi n’est pas un archivage exhaustif de parcours. Vérifier en
  essai prolongé les reprises après veille et les fins de trajet automatiques.
- Paiements, soldes, commissions, réservations et accès conducteur/passager non modifiés.
  Les formulaires suspendus conservent leur contenu ; les écrans hors focus ne gardent
  pas de couche interactive au-dessus du nouvel écran.
- Ancien test de l’accueil corrigé dans `tests/auditCorrections.test.js` avec un vrai
  trajet éligible simulé, sans affaiblir les filtres ; ajout du cas de données incomplètes.
  `tests/profileServerStatusUI.test.js` traverse le nouveau périmètre d’affichage tout
  en conservant ses assertions sur la source de vérité serveur.

### Vérifications réalisées

- Suite complète Node : **1 821 tests réussis, zéro échec, zéro test ignoré**
  (environ 201 secondes lors du dernier passage).
- Ajouts ciblés dans `tests/auditNativeReliability20261011.test.js`,
  `tests/nativeLocationBatchPatch.test.js`, `tests/activeRideCoordinatorReliability.test.js`,
  `tests/rideOverlays.test.js` et `tests/iosCrashlytics.test.js`.
- Le test Java compile les helpers réellement patchés avec un substitut de Bundle :
  10 000 fusions successives, lot massif, conservation des identifiants, plafond et
  absence de mutation de l’ancien lot. Ce n’est pas un essai Android Parcel/JobScheduler.
- Compilation native réelle réussie : Gradle `:expo-location:compileDebugKotlin`
  et `:expo-task-manager:compileDebugJavaWithJavac`, avec leur dépendance app-loader.
  Cela vérifie Java/Kotlin Android, pas un APK release complet ni son comportement en veille.
- TypeScript `--noEmit` : réussi. ESLint : **zéro erreur, 243 avertissements** déjà
  présents, non corrigés automatiquement pour éviter des changements de hooks non évalués.
- Frontières réseau : réussi. Taille des sources : 1 069 contrôlées, aucune au-dessus
  de 400 lignes. `git diff --check` : réussi. Configuration Crashlytics Android : valide.
- Projet Xcode analysé par le parseur, phase attachée à la cible et génération idempotente
  testées. Le validateur iOS signale encore les **Pods absents du lock local** ; la phase
  de symboles n’est plus signalée manquante. Aucun build iOS exécuté sous Windows.

### Installation et limites restantes

- **Nouveau build natif requis** pour les protections GPS et Crashlytics. Un simple
  rechargement Metro ou une mise à jour JavaScript ne les applique pas aux binaires installés.
- Sur macOS, depuis la racine : `npx pod-install`, puis `npm run check:ios-crashlytics`.
  Conserver le `ios/Podfile.lock` réellement résolu, puis reconstruire iOS.
- Refaire des essais physiques Android/iOS : trajet prolongé, verrouillage, réseau
  intermittent, reprises répétées, arrêt du suivi après déconnexion/fin de trajet ;
  formulaire PIN avec erreur/succès et modification de trajet avec carte, clavier et retour.
  Vérifier la réception d’un crash symboliqué sur une archive de test dédiée.
- Aucun gel iOS, aucune baisse de chauffe ni disparition des crashs en production
  ne sont déclarés validés. La cause exhaustive de la mémoire élevée nécessite
  toujours un profilage release et une comparaison avant/après sur appareils physiques.

## 11 octobre 2026 — Accueil : autres trajets disponibles même sans départ proche

Périmètre : découverte des trajets sur l’accueil. Le précédent repli restait
limité à 25 km et sept jours, et aucune découverte ne partait sans position
exploitable. Des trajets publiés pouvaient donc être exclus malgré une liste
vide. Cette entrée remplace ces limites décrites dans l’entrée suivante.

### Solution effectivement appliquée

- `hooks/home/useHomeTripFeed.ts` conserve la recherche proche en premier. Si
  elle échoue ou ne contient aucune nouvelle suggestion éligible à moins de
  5 km dans les prochaines 24 h, le flux général existant est interrogé sans
  coordonnées, rayon ni limite de date future, avec des places disponibles et
  un tri par date. Sans GPS exploitable, ce flux général est utilisé directement.
  Une nouvelle suggestion proche suspend de nouveau cette lecture générale.
- `features/home/homeTripPriority.ts` conserve les préférences 5 km / 24 h,
  10 km / 48 h, puis 25 km / sept jours. Un dernier palier accepte maintenant
  les autres départs futurs disponibles, y compris sans coordonnées de départ,
  et les classe d’abord par date. Une date invalide, un départ passé, un trajet
  complet ou un statut non disponible ne devient pas une suggestion de repli.
- `hooks/home/useHomeTripSelection.ts` affiche « Autres trajets disponibles »
  pour ce dernier palier, sans annoncer une proximité non vérifiée.
  `components/home/HomeTripsSheet.tsx` et `app/(tabs)/index.tsx` retirent la
  dépendance du message vide au GPS : activer la localisation n’est plus requis
  pour consulter ces suggestions. Le message réellement vide renvoie vers
  « Voir tout ».

### Comportements conservés et précautions

- Premier palier non vide uniquement, dix cartes maximum, réservations
  personnelles prioritaires et navigation en cours inchangée. Les trajets
  propres et participations terminées restent exclus des nouvelles suggestions.
  Les permissions de visibilité des commandes des autres passagers ne changent pas.
- Chaque requête demande au plus 50 candidats ; le snapshot reste borné à 100.
  Pas de nouveau timer, dépendance, service GPS ou changement backend. Les
  lectures gardent leur cadence existante et les garde-fous écran actif / réseau.
  Les données en cache restent utilisables en cas d’échec ; les réponses les plus
  récentes arbitrent les doublons et le cache RTK Query n’est pas modifié par le tri.

### Vérifications réalisées et limites

- 156 tests JavaScript ciblés réussis, zéro échec : suites `home*.test.js`,
  `compactCardsLifecycle.test.js` et `performanceReadScheduling.test.js`.
  `tests/homeTripPriority.test.js` couvre notamment les départs au-delà de 25 km
  ou de sept jours, sans GPS, les dates invalides, le retour des départs proches,
  la priorité des réservations et la limite de dix cartes.
  `tests/homeModules.test.js` vérifie la requête générale sans filtre géographique,
  son activation sans GPS, les chargements/erreurs, la fusion et le rafraîchissement.
- TypeScript `--noEmit`, ESLint sur les cinq sources modifiées, frontière réseau
  et contrôle de taille réussis : 1 068 sources contrôlées, aucune au-delà de
  400 lignes. Contrôle des espaces du diff réussi.
- Vérifications locales JavaScript et statiques, pas d’essai natif Android/iOS
  ni de validation des données de production. Un serveur sans départ disponible,
  ou une panne sans cache exploitable, peut toujours produire un état vide/erreur.
  La lecture bornée des 50 premiers candidats du flux général ne garantit pas
  une exploration exhaustive de toutes les pages du catalogue.

## 11 octobre 2026 — Suggestions de repli et parcours de recherche, publication et commande simplifiés

Périmètre : accueil, recherche de trajets/clients, liste des commandes, publication
et création de commande dans l’application. Le filtre strict 5 km / 24 h pouvait
laisser l’accueil vide malgré des départs un peu plus loin ou plus tard. Certains
écrans répétaient les explications et réservaient beaucoup de hauteur au suivi
d’étapes ou à une carte non indispensable pour remplir le formulaire.

### Solutions effectivement appliquées

- `features/home/homeTripPriority.ts` conserve la priorité **moins de 5 km dans
  les prochaines 24 h**, puis sélectionne le premier palier non vide : **moins
  de 10 km / 48 h**, sinon **moins de 25 km / 7 jours**. Il ne complète pas une
  liste proche avec des départs lointains. Ces deux paliers de repli sont un
  choix d’implémentation communiqué à l’utilisateur. Les distances restent à
  vol d’oiseau depuis la position disponible, pas des distances routières.
- `hooks/home/useHomeTripFeed.ts` et `useHomeController.ts` déclenchent une seule
  lecture élargie conditionnelle, via l’endpoint existant, après la réponse
  proche sans suggestion éligible ou son échec. Chaque requête demande au plus
  50 candidats ; le snapshot fusionné est borné à 100. La sélection locale
  applique les paliers temporels et conserve au plus dix cartes. Les trajets
  propres, complets, expirés et participations terminées ne bloquent pas
  l’élargissement ; les réservations personnelles non plus. Les doublons sont
  arbitrés selon le timestamp de la réponse réussie la plus récente. Une nouvelle
  suggestion proche suspend de nouveau la lecture large.
- Pas de nouveau timer, service GPS ou dépendance. Les calculs de flux sont
  mémorisés ; l’élargissement réutilise la cadence existante, uniquement à
  l’écran et en ligne. Sans position exploitable, aucune découverte géographique
  n’est lancée. `useHomeTripSelection.ts`, `useHomeSheet.ts`,
  `components/home/HomeTripsSheet.tsx`, `features/home/HomeTripsSheet.styles.ts`
  et `app/(tabs)/index.tsx` signalent le périmètre élargi sans répéter l’information
  dans chaque carte. Un échec réseau ne vaut pas une réponse vide ; les
  réservations disponibles ne disparaissent pas pendant la recherche de repli.
- `app/search.tsx`, `app/requests.tsx`,
  `components/search/SearchResultsToolbar.tsx`,
  `hooks/search/useSearchController.ts` et
  `features/screen-styles/app/search/container.styles.ts` : titres explicites
  « Trouver un trajet » / « Trouver un client », onglets « Trajets / Clients »
  réservés aux conducteurs, « place(s) » au lieu de « PERS. », compteurs et
  explications raccourcis. Le tri des commandes « Prix le plus élevé » décrit
  le classement décroissant existant du prix maximum par place. Suppression
  des phrases de chargement redondantes, hauteur minimale de cet état réduite
  de 220 à 96 points, boutons d’effacement agrandis à 44 points et sélection des
  onglets annoncée aux lecteurs d’écran.
- `app/publish.tsx`, `features/publish/PublishStepIndicator.tsx`,
  `PublishRouteStep.tsx`, `PublishVehicleStep.tsx`,
  `hooks/publish/usePublishController.ts` et les styles `container.styles.ts` /
  `vehicleCardActive.styles.ts` de publication : « Proposer un trajet », un seul
  indicateur compact « n sur 5 » et cinq segments remplaçant les grosses pastilles
  et leurs cinq légendes. Les anciens styles de cet indicateur sont supprimés.
  Libellés « Départ et arrivée », « Avec quel véhicule ? », action finale
  « Publier mon trajet » ou « Publier mes trajets ». Retrait des indications
  redondantes de sélection, sans modifier la sélection effective du véhicule.
- `app/request/index.tsx`, `components/trip-request/RequestRouteStep.tsx`,
  `RequestRoutePreview.tsx`, `RequestBudgetFields.tsx`,
  `hooks/trip-request/useRequestTripController.ts`,
  `features/trip-request/requestFormModel.ts` et `requestStyles.ts` : deux étapes
  explicites, « Où allez-vous ? », bouton « Continuer », résumé départ/arrivée
  avec « Modifier ». La carte est désormais montée uniquement à l’action
  « Voir la carte » et démontée en la masquant ; ses marqueurs, son tracé et ses
  réglages restent disponibles. Les adresses et références restent visibles
  sans ouvrir la carte. Suppression du dégagement inférieur de 116 points
  devenu superflu avec le pied d’action dans le flux, réduction des espacements
  et des choix de paiement, suppression de leurs phrases répétitives (les aides
  d’accessibilité restent fournies). Le total peut revenir à la ligne plutôt
  qu’être tronqué ; compteurs et paiements ont des libellés/états accessibles.
  Les styles d’anciens éléments superposés de l’aperçu ont été retirés.
- Le skill frontend a guidé une hiérarchie sobre, des actions explicites et
  l’affichage des détails à la demande, en conservant la charte existante.

### Comportements conservés et prévention des régressions

- Les réservations personnelles et la navigation en cours gardent leur priorité
  indépendamment des limites des suggestions. « Voir tout » garde la recherche
  large. Les passagers n’accèdent toujours pas aux commandes d’autres passagers.
- Cinq étapes de publication et deux étapes de commande conservées ; aucune
  validation contournée. Dates choisies explicitement, références, lieux favoris,
  géocodage, places/capacité/identité, prix confirmé par place, total, commissions,
  choix de paiement, récurrence, brouillons et protection des doubles soumissions
  restent dans les flux existants. Aucun contrat HTTP ni code backend modifié.
- Les listes restent virtualisées et les recherches gardent leurs temporisations.
  Les champs peuvent défiler si la taille d’écran ou de police le nécessite ;
  il ne s’agit pas de supprimer le défilement à tout prix.

### Vérifications et limites

- 326 tests JavaScript ciblés réussis (accueil, recherche, commandes, publication,
  formulaires, compteurs, cycle de vie, lectures réseau, références et extractions
  de sources). Nouveaux cas : trois paliers, bornes horaires/distances, réservations
  n’empêchant pas le repli, contrôles de déclenchement/suspension, données stables,
  erreurs/chargements sans faux état vide, données élargies plus récentes,
  indicateur cinq étapes, carte facultative et contrôles de formulaire.
- Les attentes textuelles existantes ont été adaptées aux nouveaux libellés,
  sans supprimer les tests de permissions ou de navigation. Le baseline de styles
  `tests/fixtures/sourceExtractions.json` est actualisé uniquement pour recherche
  et publication, dont les modifications sont intentionnelles.
- TypeScript sans émission et ESLint des sources modifiées : réussis.
  Contrôles de frontière réseau, taille des sources (1 068 fichiers, aucun au-delà
  de 400 lignes) et `git diff --check` : réussis.
- Pas d’essai sur appareil physique iOS/Android, pas de mesure native de mémoire,
  fluidité ou chauffe. Le non-montage initial de la carte est vérifié en JavaScript,
  pas par un profilage natif. À vérifier sur appareil : petits écrans et grandes
  polices, clavier, ouverture/fermeture de la carte, publication récurrente,
  commande avec plusieurs places, retour hors ligne et reprise réseau.
- La découverte reste limitée aux candidats renvoyés par les endpoints existants ;
  les fenêtres horaires sont filtrées localement. Aucun catalogue exhaustif n’est
  garanti au-delà de ces pages. S’il n’existe aucun départ dans le dernier palier,
  un état vide honnête avec « Voir tout » subsiste. Aucun déploiement effectué.

## 10 octobre 2026 — Accueil conducteur et liste de départs proches

Périmètre : accueil mobile. Le conducteur voyait la même invitation à chercher
un trajet que le passager ; la liste inférieure était fermée au départ et
répétait titre, compteur, description et sélecteur. Le tri par proximité existait,
mais ne limitait ni la distance ni l’échéance des suggestions. L’utilisateur a
choisi explicitement **moins de 5 km et les prochaines 24 heures**.

### Solutions appliquées

- `components/home/HomeHeader.tsx` et `app/(tabs)/index.tsx` utilisent le rôle
  déjà issu du profil serveur : « Je cherche un client » ouvre `/requests`,
  onglet des commandes disponibles. Un passager, ou un rôle non encore connu,
  conserve « Je cherche un trajet » vers `/search`. Publication et commande
  personnelle restent accessibles par les mêmes actions.
- `hooks/home/useHomeSheet.ts` ouvre la liste par défaut. Le choix manuel de
  la masquer reste valable pendant l’utilisation. Un trajet en cours la replie
  temporairement ; sa fin restaure le choix précédent sans bloquer l’accueil.
- `components/home/HomeTripsSheet.tsx` et
  `features/home/HomeTripsSheet.styles.ts` remplacent le titre et les onglets
  superposés du conducteur par une seule barre « Trajets / Clients », avec
  « Voir tout » et le bouton de réduction. Un passager conserve seulement
  « Trajets », sans accès aux commandes des autres. Suppression des sous-titres
  et badges de compteur redondants, raccourcissement des états vides/erreurs,
  boutons d’au moins 44 points. La barre peut passer à la ligne ; même replié,
  le panneau utilise une hauteur minimale plutôt qu’une hauteur bloquée.
- `components/home/HomeSheetLoadingState.tsx` et son fichier de styles gardent
  l’aperçu de chargement mais remplacent les deux phrases et l’icône décorative
  par « Chargement… ». La boucle native reste arrêtée hors premier plan.
- Le skill frontend a guidé cette hiérarchie plus sobre. Les cartes conservent
  parcours, horaire, prix par place, places, véhicule et identité ; aucune donnée
  essentielle n’a été supprimée du détail. La liste horizontale reste virtualisée.
- `features/home/homeTripPriority.ts` et
  `hooks/home/useHomeTripSelection.ts` filtrent les nouvelles suggestions avant
  de retenir au maximum dix cartes : trajet non démarré, place libre, horaire
  entre maintenant et +24 h, départ à moins de 5 km de la position disponible.
  La distance est géographique à vol d’oiseau, pas une durée routière. Le tri
  conserve les zones de proximité de 500 m ; dans une même zone, le départ le
  plus tôt passe en premier, puis la distance exacte départage les horaires égaux.
- Les réservations personnelles échappent au plafond distance/+24 h, mais les
  trajets terminés/annulés et les participations terminées restent exclus. La
  navigation en cours ne dépend pas du classement des dix suggestions. Sans
  position exploitable, seules les réservations peuvent subsister dans la liste :
  le message invite à activer la localisation, et « Voir tout » garde la recherche
  élargie accessible. La carte de suggestions utilise la même sélection.
- `hooks/home/useHomeTripFeed.ts` borne aussi la requête proche à 5 km et
  50 candidats. Une réponse vide ne déclenche plus de téléchargement général.
  Si cette requête échoue, le repli existant conserve les coordonnées et le rayon
  de 5 km. Sans position valide, ces lectures restent suspendues. Le cache passe
  lui aussi par le filtre local ; des résultats lointains déjà stockés ne
  contournent donc pas les limites.
- Les timestamps des rafraîchissements existants et le retour au premier plan
  réévaluent la fenêtre horaire, même si les données sont identiques. Aucun
  nouveau timer, abonnement réseau, dépendance, migration ou changement backend.
  Le filtrage temporel de 24 h est local ; aucune garantie de catalogue exhaustif
  au-delà des candidats renvoyés par le serveur n’est ajoutée.

### Vérifications et limites

- **223 tests JavaScript réussis**, aucun échec ni test ignoré : accueil complet,
  recherche compacte, cycle de vie des cartes, onglets, listes de commandes,
  recherche et reprise de navigation conducteur/passager. Les fixtures du test
  de fin de trajet ont été complétées avec une position et des places disponibles
  pour correspondre à la nouvelle règle ; les assertions de sortie du trajet
  restent conservées. Après l’ajustement final des coordonnées normalisées et du
  périmètre de rafraîchissement de secours, les **41 tests concernés** ont été
  relancés avec succès, ainsi que TypeScript et le lint du fichier concerné.
- Tests adaptés/ajoutés dans `tests/homeCompactLayout.test.js`,
  `homeCompactCards.test.js`, `compactCardsLifecycle.test.js`,
  `homeModules.test.js`, `homeTripPriority.test.js`, `homeRideCompletion.test.js`
  et `homeForegroundLifecycle.test.js` : rôles/destinations, ouverture initiale,
  repli volontaire, sortie d’un trajet, seuils temps/distance, absence de GPS,
  cache hors ligne, réservations, absence de recherche générale après résultat
  vide et invalidation temporelle sans boucle réseau supplémentaire.
- TypeScript sans émission : réussite. ESLint ciblé : réussite sans
  erreur ni avertissement. Contrôles réseau et taille : réussite, **1 068 sources**,
  aucune au-dessus de 400 lignes. `git diff --check` ciblé : réussite.
- Pas de mesure de performance ni de rendu sur appareil physique iOS/Android.
  Le renouvellement de la sélection suit les actualisations existantes, pas un
  décompte à la seconde. À vérifier sur petits écrans/grandes polices, avec GPS
  refusé puis autorisé, connexion lente, réservations éloignées et trajet en cours.
  Aucun déploiement effectué ; la recherche générale et les notifications de
  commandes ne reçoivent pas les nouveaux plafonds propres à l’accueil.

## 10 octobre 2026 — Actions de l’accueil formulées comme des intentions

Périmètre : en-tête de l’accueil mobile. Les verbes isolés « Publier »,
« Commander » et « Chercher » ne précisaient pas suffisamment leur objet pour
un nouvel utilisateur.

### Solution appliquée et comportements conservés

- `components/home/HomeHeader.tsx` affiche « Que voulez-vous faire ? », puis
  deux choix principaux : « Je cherche un trajet » (recherche existante) et
  « Je propose un trajet » (publication existante). « Je commande un trajet »
  reste accessible juste en dessous et ouvre le même formulaire de commande.
  Aucun parcours n’a été supprimé ni remplacé par un modal intermédiaire.
- `features/home/HomeHeader.styles.ts` organise les deux choix côte à côte,
  avec retour à la ligne si nécessaire, et un accès secondaire à la commande.
  Les textes ne sont plus limités à une ligne et conservent le grossissement
  système ; les zones tactiles restent d’au moins 44 points. La surface claire
  et les icônes existantes distinguent les actions de la carte en arrière-plan.
- Le skill frontend a guidé la hiérarchie : deux intentions principales, une
  option secondaire et des formulations courtes, sans animation décorative.
  Ce bloc est plus haut que l’ancienne rangée de trois mots ; aucun gain de
  surface visible de la carte n’est revendiqué.
- Profil, notifications, priorités de trajets/réservations et commandes,
  autorisations de publication, carte et logique réseau sont inchangés. Le
  composant reste mémoïsé ; aucun état, requête, minuteur ou dépendance ajouté.
- `tests/homeCompactLayout.test.js` vérifie les textes, leur ordre, les trois
  destinations, les indications aux lecteurs d’écran, la hauteur minimale des
  boutons et l’absence de troncature ou réduction forcée des libellés.

### Vérifications et limites

- Contrôle de taille : **1 068 sources**, aucune au-dessus de 400 lignes.
- Tests JavaScript de l’accueil, de la recherche compacte et des onglets :
  **144 réussis**, aucun échec ni test ignoré. TypeScript sans émission et
  ESLint sur les deux sources modifiées : réussite sans erreur ni avertissement.
  `git diff --check` sur les quatre fichiers de ce changement : réussite.
- Aucun essai visuel sur appareil physique ni test utilisateur à Kinshasa.
  Le retour à la ligne est testé comme propriété de rendu React, pas comme
  mesure native de texte. À vérifier sur petits écrans et grandes polices,
  notamment lorsque les cartes prioritaires et la liste basse sont visibles.
  Aucun déploiement, changement backend ou configuration native.

## 10 octobre 2026 — Reprise prioritaire de la navigation d’un trajet en cours

Périmètre : application mobile, ouverture après fermeture et retour au premier
plan. La reprise automatique existait, mais le passage par le lancement ou
l’authentification pouvait la désactiver avant l’arrivée sur l’accueil. Une
redirection concurrente vers l’accueil pouvait aussi remplacer celle vers la
navigation. Certains écrans de retour, dont la recherche, n’étaient pas éligibles.

### Solutions effectivement appliquées

- `features/navigation/activeRideResume.ts` distingue les transitions de lancement
  et d’authentification des écrans où une redirection interromprait une action.
  La recherche, les notifications, les paramètres et les adresses favorites
  permettent désormais aussi la reprise du trajet à l’entrée dans l’application.
- `components/ActiveRideResumeCoordinator.tsx` attend la sortie des routes de
  lancement avant de reprendre la navigation et observe le résumé d’activité
  partagé, sans ajouter d’abonnement aux listes ni de boucle réseau.
- `hooks/navigation/useActiveRideResume.ts` conserve la reprise pendant les
  transitions d’authentification. Un résumé serveur récent sans activité en cours
  clôt la recherche pour cette entrée. Des listes vides plus anciennes qu’un
  résumé signalant une activité ne la clôturent plus prématurément. Une erreur
  réseau de vérification peut être retentée au prochain rafraîchissement partagé,
  sans nouvelle requête à chaque rendu.
- La réservation passager signalée par le serveur a priorité sur un ancien
  trajet conducteur encore marqué en cours, même si les listes arrivent dans un
  ordre différent. La participation et le statut sont revérifiés avant la
  redirection, y compris lorsqu’ils changent pendant une requête.
- `tests/activeRideResume.test.js` complète les scénarios du hook ; le nouveau
  `tests/activeRideResumeCoordinator.test.js` teste le coordinateur et son hook
  ensemble, avec les dépendances natives et réseau simulées.

### Comportements conservés et précautions

- La destination dépend de la participation réelle : navigation conducteur pour
  son trajet en cours, navigation passager pour sa réservation acceptée sur un
  trajet en cours, même si ce passager possède aussi un compte conducteur.
- Une lecture serveur authentifiée confirme toujours l’accès et le statut ;
  le cache ne suffit pas à autoriser la navigation. Les trajets terminés ou
  annulés et les réservations terminées, annulées ou non acceptées sont exclus.
- Une seule reprise réussie par compte et passage au premier plan : quitter
  volontairement la navigation reste possible sans être immédiatement renvoyé.
  Les paiements, conversations, SOS, formulaires et actions explicites de
  notification gardent la priorité. Un modal en cours diffère la reprise.
- Une réponse arrivée après une déconnexion, un changement de compte, une sortie
  de l’application ou une navigation volontaire ne déclenche pas de redirection.
  Hors ligne, la reprise attend de pouvoir vérifier le trajet auprès du serveur.
- Aucun changement backend, migration, dépendance, minuteur de polling ou
  configuration native. Aucun déploiement réalisé.

### Vérifications et limites

- Tests JavaScript ciblés : **70 réussis, aucun échec ni test ignoré** dans
  `activeRideResumeCoordinator`, `activeRideResume`, `accountActivity`,
  `startupSession`, `homeBackNavigation` et `acceptedRequestContact`.
- TypeScript sans émission et ESLint sur les trois sources modifiées : réussite,
  sans erreur ni avertissement ESLint. Frontières réseau et taille des sources :
  réussite, **1 068 sources**, aucune au-dessus de 400 lignes. `git diff --check` :
  réussite, avec seulement les avertissements de conversion de fins de ligne de
  fichiers déjà modifiés hors de ce périmètre. La suite complète du projet n’a
  pas été relancée pour ce changement.
- Pas d’essai sur appareil physique iOS/Android ni de mesure de latence. L’accueil
  peut apparaître brièvement pendant la vérification serveur ; cette modification
  ne garantit pas une navigation instantanée hors ligne.
- À valider sur appareils : fermeture/réouverture et retour du verrouillage avec
  un trajet conducteur puis une réservation passager en cours ; entrée depuis
  la recherche/les notifications ; retour volontaire à l’accueil ; trajet terminé
  ou annulé ; reconnexion réseau ; paiement ou modal déjà ouvert.

## 10 octobre 2026 — Commandes visibles et notifiées selon le rôle

Périmètre : mobile et backend voisin `zwanga-backend`. Un passager doit découvrir
les trajets publiés et consulter seulement ses propres commandes. Il ne doit pas
recevoir d’alerte proposant les commandes des autres passagers. Les notifications
de suivi de ses propres commandes restent actives. Aucun déploiement ni push réel
n’a été effectué pour cette modification.

### Problèmes constatés et solutions appliquées

- Le serveur restreignait déjà l’accès aux commandes des autres utilisateurs aux
  conducteurs, mais l’interface proposait encore le mode « Demandes » aux passagers.
  `app/search.tsx`, `hooks/search/useSearchController.ts` et `useSearchResults.ts`
  affichent uniquement les trajets pour un passager. Le mode conducteur exige un
  profil serveur ; l’identité stockée reste utilisable pour exclure ses propres
  trajets, pas pour autoriser la découverte des commandes. Les résultats conducteur
  en cache sont masqués dès le changement de rôle, même si l’écran est hors focus.
- `app/requests.tsx` et `hooks/requests/useRequestsData.ts` ramènent les passagers
  sur « Mes commandes », sans onglet disponible, sans lecture de la liste publique
  ni suivi GPS pour son tri. `app/my-requests.tsx`,
  `hooks/home/useHomePassengerActivity.ts` et
  `hooks/request-detail/useRequestDetailData.ts` contrôlent aussi le propriétaire
  avant d’afficher des données déjà en cache.
- Les nouveaux libellés utilisent « commande(s) » : accueil/carte/aperçus
  (`components/home/*`, `features/home/homeModel.ts`, `hooks/home/useHomeSheet.ts`),
  recherche (`app/search.tsx`, `components/search/SearchRequestResultCard.tsx`,
  `hooks/search/*`), listes (`app/requests.tsx`, `app/my-requests.tsx`,
  `features/requests/*`), détail/édition/acceptation (`app/request/[id].tsx`,
  `features/request-detail/*`, `hooks/request-detail/*`), soumission
  (`hooks/trip-request/useRequestSubmission.ts`), profil/disponibilité
  (`hooks/profile/useProfileController.ts`, `app/driver-availability.tsx`,
  `components/profile/ProfileDriverAvailabilityEntry.tsx`,
  `components/profile/NearbyDriverLocationPermission.tsx`), vérification
  (`app/verification.tsx`), contact après acceptation
  (`components/AcceptedRequestContactCoordinator.tsx`) et suivi/alertes
  (`hooks/notifications/useOverdueRequestNotification.ts`,
  `services/nearbyDriverLocation.ts`, `driverNotifications.ts`,
  `driverNotificationResponse.ts`). Les réservations de trajets publiés restent
  nommées « réservations » dans `app/bookings.tsx` et
  `features/trip-detail/TripBookingSteps.tsx` / `TripBookingSuccessModal.tsx`.
- Le backend filtre aussi au moment de l’envoi :
  `src/notifications/driver-request-policy.ts` et `notifications.service.ts`
  réutilisent la lecture du destinataire pour vérifier son rôle et son activité.
  Les alertes `trip_request`, `new_trip_request` (ancien format),
  `trip_request_nearby` et `driver_dispatch_offer` sont supprimées de l’envoi si
  le destinataire n’est plus un conducteur actif, y compris lors d’une reprise
  d’envoi. Un envoi de ces alertes par tokens sans destinataires identifiés est
  refusé. Le filtrage est aussi appliqué en SQL avant pagination et comptage de
  la boîte de réception : pas de pages ou badges gonflés par ces anciennes alertes.
  Aucune nouvelle migration, table, dépendance ou variable de configuration.
- Côté mobile, `features/notifications/requestVisibility.ts`,
  `app/notifications.tsx`, `components/NotificationHandler.tsx`,
  `hooks/notifications/useDriverNotifications.ts` et
  `utils/notificationNavigation.ts` masquent les alertes conducteur à un passager
  et empêchent leur ouverture automatique en premier plan. Le mécanisme qui
  arrête la sonnerie à l’ouverture reste actif pour les deux rôles.
  `store/api/notificationApi.ts` traduit aussi les anciens libellés de commandes
  dans l’historique, sans toucher aux demandes de retrait ou d’assistance.
- Les nouveaux textes serveur sont adaptés dans
  `src/trip-requests/trip-requests.service.ts`, `trip-request-recovery.service.ts`,
  `request-edit-policy.ts`, `trip-requests.controller.ts`,
  `dispatch/dispatch.service.ts` et
  `src/notifications/daily-engagement-notification.service.ts`.

### Comportements conservés et vérifications

- Types de notification, routes, identifiants, DTO, autorisations de contact,
  acceptation/refus, paiement et logique de sonnerie sont conservés. Les événements
  d’acceptation, remise en disponibilité, expiration et retard d’une commande
  personnelle ne sont pas bloqués. Un conducteur conserve la découverte des
  commandes et peut aussi consulter ses propres commandes comme passager.
- Tests ciblés mobiles : **126 réussis** après adaptation des anciennes assertions
  de libellés et des fixtures de rôle/propriétaire. Scénarios supplémentaires :
  compte passager avec ancien indicateur conducteur, cache hors ligne, changement
  de rôle sur un écran masqué, recherche et accès direct à la liste personnelle.
- Premiers tests backend : **58 réussis**, notamment blocage à l’envoi/reprise,
  destinataire absent/inactif, conservation des notifications personnelles et
  règles d’accès serveur existantes.
- PostgreSQL 18/PostGIS réel : **17 tests réussis** dans un cluster temporaire
  local isolé. Le nouveau test valide la boîte de réception, son total, ses non-lus
  et les changements de rôle/statut. Aucune base applicative n’a été consultée.
- Validation mobile finale : **1 776 tests réussis dans 220 fichiers**, sans
  échec ni test ignoré. Les premières exécutions ont permis d’adapter les
  assertions de libellés et les fixtures à la vérification du propriétaire/rôle,
  sans retirer ces contrôles du code.
- TypeScript mobile et backend : réussite. Contrôles de frontières réseau et
  taille : réussite, **1 068 sources**, aucune au-dessus de 400 lignes. ESLint
  sur les sources mobiles modifiées : **0 erreur, 14 avertissements** dans les
  imports/hooks existants, non corrigés dans ce changement de périmètre.
- Suite backend étendue `src/notifications` et `src/trip-requests` : **18 suites
  réussies, 266 tests réussis**. Les 16 tests PostgreSQL sont ignorés dans ce
  lancement sans cluster ; ils ont bien été exécutés séparément dans les 17 tests
  PostgreSQL/politique mentionnés plus haut. Les quatre échecs de la première
  exécution étendue concernaient les anciens messages attendus ; les assertions
  ont été adaptées à « commande » puis la suite entière a été relancée.
  `git diff --check` mobile et backend : réussite.
- Limites : pas d’essai sur appareil physique iOS/Android ni de mesure de latence
  ou de consommation. Le skill Postgres a guidé la réutilisation de la lecture du
  profil à l’envoi et le filtrage indexable en amont de la pagination ; ce n’est
  pas une mesure de gain de performance. Les notifications déjà livrées par l’OS
  avant déploiement ne peuvent pas être rappelées par ce filtrage. Il faudra
  déployer le backend et distribuer le code mobile pour appliquer ces règles.
- Essai natif restant : créer une commande depuis un compte passager A ; vérifier
  qu’un autre passager B ne la voit ni sur l’accueil, ni sur la recherche/liste,
  ni dans ses notifications, app ouverte puis fermée. Vérifier l’alerte chez un
  conducteur éligible, son acceptation et la notification de suivi chez A. Tester
  aussi le retour réseau et un ancien lien de notification après changement de
  rôle. Aucun résultat natif n’est déduit des tests JavaScript ou PostgreSQL.

## 10 octobre 2026 — Sonnerie ciblée pour les commandes immédiates et programmées

Périmètre : application mobile et backend voisin `zwanga-backend`. L’utilisateur
a confirmé que l’alerte prolongée concerne **les deux** types de départ. Il s’agit
d’une notification particulière, pas d’un appel téléphonique. La préférence
« arrêter à l’ouverture de Zwanga » est conservée. Aucun déploiement, vrai push,
changement de configuration ou d’infrastructure de production dans ce tour.

### Problèmes constatés dans le code

- L’intention de départ immédiat dépendait de la réponse asynchrone au statut du
  dispatch. Une réponse absente ou périmée pouvait omettre `immediateDispatch` et
  envoyer la commande sur le parcours d’annonce générale au son standard.
- Une commande programmée utilisait cette annonce générale, sans alerte sonore
  ciblée au conducteur proche. Réutiliser l’acceptation exclusive immédiate aurait
  changé son fonctionnement et aurait pu bloquer un conducteur jusqu’au départ.
- Le transport Expo des invitations conducteur v2 ne précisait pas le canal
  Android, contrairement au transport FCM natif et aux confirmations passager.
  Ce repli pouvait donc sélectionner le canal par défaut.

### Solutions appliquées et fichiers

- `hooks/trip-request/useRequestSubmission.ts` transmet toujours le choix de
  départ immédiat, sans requête de statut préalable. Le backend reste responsable
  de l’activation dans `src/trip-requests/trip-requests.service.ts` ; lorsque la
  répartition de proximité est désactivée, la création et son repli historique
  restent possibles. Les dates immédiates hors fenêtre restent refusées. Le DTO
  `src/trip-requests/dto/trip-request.dto.ts` précise cette responsabilité.
- Avec la répartition activée, les commandes programmées déclenchent
  `notifyScheduledRequest` dans `src/trip-requests/dispatch/dispatch.service.ts`.
  Le nouveau `src/trip-requests/dispatch/scheduled-request-alert.ts` recherche
  jusqu’à vingt candidats par distance dans le rayon configuré, sur position
  récente, avec véhicule actif compatible et assez de places. Il écarte le
  passager, les conducteurs occupés, les propositions exclusives en attente,
  les comptes non autorisés et les installations sans capacité sonore v2 liée
  à leur token actuel. Une notification est enregistrée pour le premier candidat
  admissible, avec une clé unique par commande. Aucun conducteur, véhicule ou
  trajet n’est attribué automatiquement ; aucun état de disponibilité n’est changé.
- `src/notifications/notifications.service.ts` traite `trip_request_nearby` comme
  une alerte prioritaire : canal Android existant `booking-ring-v2`, son embarqué
  `driver_ring`/`driver_ring.wav`, priorité haute et niveau iOS `time-sensitive`
  pour les clients compatibles. Le repli Expo des invitations v2 précise aussi
  le canal Android. Les alertes programmées sont des notifications distantes
  ordinaires à son dédié, pas des invitations exclusives data-only. Un appui ouvre
  le détail de la commande ; elles n’ajoutent pas de boutons système Accepter/Refuser.
- La file urgente existante prend aussi les alertes programmées, sans attendre
  la file ordinaire. Avant l’envoi, la commande doit être encore disponible,
  sans conducteur sélectionné ni trajet associé. L’alerte a une échéance de
  soixante secondes ; le TTL transport est plafonné à trente secondes et à son
  échéance restante. Les réessais existants de la file urgente respectent ce
  contrôle. Ces délais ne font pas expirer la commande elle-même et ne garantissent
  ni livraison à temps ni arrêt système du son à une milliseconde précise.
- Migration additive `src/database/migrations/1780000066000-IndexNearbyRequestAlerts.ts`,
  enregistrée dans `src/database/migrations/index.ts` et alignée avec
  `src/notifications/entities/notification.entity.ts` : remplacement de l’index
  partiel de la file urgente pour inclure ce type. Construction du nouvel index
  avant retrait de l’ancien, dans une transaction avec attente de verrou bornée
  à cinq secondes et requêtes à trente secondes ; retour arrière disponible.
  Une grosse base peut nécessiter une fenêtre de maintenance ou une stratégie
  concurrente à préparer séparément. Aucun index de production n’a été modifié.
- `features/notifications/rideSound.ts`, `services/backgroundNotificationTask.ts`
  et `components/NotificationHandler.tsx` reconnaissent le nouveau type sans
  le transformer en décision : pas de deuxième notification locale au son par
  défaut ; bannière sans son quand le conducteur est déjà dans l’application.
  `services/driverNotifications.ts` retire aussi les alertes programmées de ce
  compte à l’ouverture, avec identifiant et tag Android lorsqu’ils sont disponibles,
  sans accepter/refuser et sans retirer les messages ou alertes d’un autre compte.

Le skill `supabase-postgres-best-practices` a guidé les recherches bornées utilisant
l’index géographique existant, l’index partiel de notification et les transactions
sans HTTP sous verrou. Aucun benchmark de charge ni gain chiffré n’est revendiqué.
Aucun service Supabase, nouvelle dépendance, fichier sonore ou permission native
n’a été ajouté. Le son existant dure vingt-neuf secondes, sous la limite Apple
de trente secondes ([documentation Apple](https://developer.apple.com/documentation/usernotifications/unnotificationsound)).

### Comportements conservés et limites

- Invitations immédiates et réservations publiées : acceptation/refus sécurisés,
  vérification du destinataire, idempotence, échéances et réattribution existantes
  conservées. Ouvrir l’app ou toucher la notification ne vaut pas acceptation.
  Paiements, commissions, tarifs, KYC, GPS et consentements ne sont pas modifiés.
- Les notifications de messagerie et la confirmation au passager après acceptation
  gardent leurs comportements. Pas de CallKit, PushKit, plein écran imposé ou
  contournement du volume, du silencieux ou des préférences système.
- La sélection utilise la **position actuelle récente**, pas une prédiction de
  localisation au jour du départ. La recherche est bornée à vingt candidats ;
  une installation compatible, un token valide, les autorisations système et la
  fonction de proximité activée restent nécessaires. Sans candidat admissible,
  la commande programmée reste consultable mais aucune sonnerie n’est envoyée.
  Aucun nouveau mécanisme de réattribution différée n’est ajouté pour ces commandes.
- La création est enregistrée avant la préparation de l’alerte programmée : si
  cette préparation échoue, elle est journalisée sans annoncer un faux échec de
  création. La file réessaie les notifications déjà enregistrées, mais ne recrée
  pas automatiquement une alerte qui n’a pas pu être mise en file.

### Vérifications réalisées

- **Mobile : 219 fichiers, 1 768 tests JavaScript réussis**, avec
  `node --test --test-force-exit --test-concurrency=4`. Les nouveaux tests couvrent
  le choix immédiat indépendant du statut, le décodage, l’absence de double son,
  la navigation sans décision, la mise en sourdine au premier plan et à l’ouverture.
  Fichiers : `tests/tripRequestForm.test.js`, `tests/requestAcceptanceSound.test.js`,
  `tests/driverNotifications.test.js` ; suites existantes des actions et ressources
  natives également exécutées. `--test-force-exit` évite l’attente des timers des
  caches de test ; il ne prouve pas l’absence de ressources actives sur appareil.
- **Backend : sept suites, 138 tests réussis**, dont sélection et déduplication
  sur PostgreSQL 18/PostGIS réel dans un cluster temporaire isolé, ainsi que
  migration/retour arrière de l’index. Aucune connexion à la base de l’application.
  Suites concernées : `src/notifications/*spec.ts`,
  `src/trip-requests/trip-request-alert-routing.spec.ts`,
  `src/trip-requests/dispatch/scheduled-request-alert.spec.ts` et
  `src/trip-requests/dispatch/dispatch-postgres.spec.ts`. Une première exécution
  simultanée avec les autres vérifications a dépassé les cinq secondes de
  préparation d’un ancien test (`TRUNCATE` du cluster jetable) : 137 réussis,
  un échec de délai. Relance isolée avec `--runInBand --no-cache --testTimeout=15000` :
  138 réussis. Ce résultat ne constitue pas une mesure des latences de production.
- TypeScript `--noEmit` réussi dans les deux dépôts. ESLint ciblé : zéro erreur,
  trois avertissements préexistants. Contrôles réseau et taille : valides,
  1 067 sources mobiles, aucune au-dessus de 400 lignes. `git diff --check` valide
  dans les deux dépôts (avertissements de normalisation LF/CRLF uniquement).
- Aucun build natif, push réel, mesure acoustique ou essai sur appareil physique.
  La sonnerie effective, sa durée et son interruption restent à vérifier sur iOS
  et Android verrouillés ; les tests JavaScript ne peuvent pas les garantir.

### Déploiement et recette restant à effectuer

Déployer le backend corrigé avant le nouveau client, appliquer ses migrations
sur l’environnement choisi et vérifier l’activation de la proximité sans publier
les valeurs de configuration. Commandes proposées, **non exécutées** :

```powershell
# Depuis zwanga-backend, sur l’environnement explicitement choisi
npm.cmd run build
npm.cmd run migration:run:prod

# Depuis zwanga : builds destinés à de vrais téléphones
npx.cmd eas-cli build --profile dev-device --platform android
npx.cmd eas-cli build --profile dev-device --platform ios
npx.cmd expo start --dev-client
# Distribution ultérieure dans les stores
npx.cmd eas-cli build --profile production --platform all
```

Le fichier sonore et les permissions natives sont inchangés dans ce tour ; un
binaire contenant déjà ces ressources n’a pas besoin de les recréer. Il faut
toutefois distribuer les changements JavaScript et backend ensemble. Un ancien
binaire sans le son embarqué nécessite un nouveau build natif ; Expo Go ne suffit pas.

Recette avec des comptes de test : enregistrer une position récente et les
notifications de deux conducteurs vérifiés ; verrouiller leurs téléphones ;
commander à proximité, d’abord maintenant puis pour demain. Vérifier que seul le
conducteur admissible le plus proche reçoit l’alerte prévue, que le tap ouvre le
bon parcours et que l’ouverture par l’icône coupe l’alerte sans accepter. Tester
un véhicule incompatible, une position périmée et une commande déjà traitée ;
vérifier aussi une réservation publiée et un message normal. Répéter en arrière-plan,
au premier plan et après fermeture ordinaire sur iOS et Android, avec notifications
et sons autorisés. Un arrêt forcé Android et les restrictions constructeur/système
peuvent empêcher les tâches en arrière-plan ; ils ne sont pas contournés.

## 10 octobre 2026 — Correctifs de l’audit performance, fiabilité et UX/UI

Périmètre : application Expo/React Native et pagination des avis dans le backend
NestJS du dépôt voisin `zwanga-backend`. Aucun déploiement ni changement
d’environnement ou d’infrastructure n’a été effectué. Les modifications déjà
présentes, notamment le retour sécurisé des réservations et les travaux
d’infrastructure du backend, sont conservées.

### Solutions effectivement appliquées

1. **Envoi d’une commande avec réponse incertaine.** Un timeout ne signifie plus
   « commande envoyée ». `hooks/trip-request/useRequestSubmission.ts` et le nouveau
   `features/trip-request/recoverRequest.ts` relisent les commandes avec tentatives
   bornées. Une seule correspondance récente, avec les mêmes adresses, fenêtre de
   départ, places, prix et véhicule, permet de confirmer l’enregistrement. En cas
   d’incertitude, « Vérifier à nouveau » ne rejoue pas le POST ; l’utilisateur peut
   aussi consulter ses commandes. Les doubles appuis et réponses après démontage,
   sortie ou changement de session sont ignorés. Le composant
   `components/trip-request/RequestSuccessModal.tsx` et `app/request/index.tsx`
   distinguent explicitement vérification, absence de confirmation et succès.
   Les validations de date, places, identité et prix sont conservées.
2. **Solde non chargé distinct d’un solde nul.**
   `features/wallet/WalletOverview.tsx` affiche « Solde indisponible » et une
   possibilité de réessayer quand aucune donnée n’est disponible. Un solde déjà
   chargé reste visible avec un avertissement en cas d’échec d’actualisation ; un
   zéro confirmé reste un zéro. `hooks/wallet/useWalletController.tsx` suspend les
   lectures d’affichage hors ligne/hors écran, utilise les protections partagées
   pour les rafraîchissements et reprend à la reconnexion. Les règles de solde,
   dette, commission, retrait, abonnement et suivi de recharge sont inchangées.
3. **Reprise d’un trajet après rejet d’un cache périmé.**
   `hooks/navigation/useActiveRideResume.ts` ne consomme plus la reprise lorsqu’un
   candidat en cache est refusé par la vérification serveur. Il peut vérifier un
   autre candidat, y compris lorsque la découverte termine pendant la première
   vérification. Les candidats refusés sont écartés pour cette entrée dans l’app.
   Au plus une redirection réussie par entrée/compte ; les contrôles de participant,
   session, parcours courant, priorité des modals et réseau sont conservés, sans
   ajouter de polling.
4. **Présentation coordonnée des modals.** Le résultat de commande, les avis du
   profil et le détail d’historique de paiement utilisent `RideModal` en mode
   `inApp` au lieu d’une présentation native indépendante
   (`components/trip-request/RequestSuccessModal.tsx`,
   `components/profile/ProfileReviewsModal.tsx`, `app/payment-history.tsx`).
   Le contact des réservations utilise le composant partagé. Les avis et le contact
   ne restent pas affichés lorsque leur écran perd le focus. Cette réduction des
   présentations UIKit concurrentes traite un risque identifié dans le code ; elle
   ne constitue pas une preuve de disparition des blocages sur iPhone.
5. **Lectures réseau redondantes.** `hooks/bookings/useBookingsFeed.ts` supprime le
   polling supplémentaire de la liste active : sa fraîcheur repose sur la découverte
   d’activité et les invalidations déjà partagées. Les pages d’historique chargées
   restent consultables hors ligne ; pagination et rafraîchissement manuel sont
   suspendus lorsque les lectures sont désactivées. Les polls périodiques des
   réservations/trajets et le repli HTTP de position conducteur sont suspendus hors
   ligne dans `hooks/driver-navigation/useDriverNavigationData.ts` et
   `hooks/passenger-navigation/usePassengerNavigationData.ts`. La reconnexion ne
   relance ces lectures que sur l’écran actif. Les lectures initiales nécessaires
   au repli existant `useOfflineRideData`, les mutations, sockets, GPS et files de
   confirmation sont conservés : il ne s’agit pas d’interdire tout HTTP hors ligne.
6. **Avis réellement paginés.** `store/api/reviewApi.ts`,
   `hooks/profile/useProfileData.ts`, `components/profile/ProfileReviewsSection.tsx`,
   `components/profile/ProfileReviewsModal.tsx` et `app/(tabs)/profile.tsx` chargent
   trois avis pour l’aperçu, puis vingt par page dans une `FlatList` virtualisée.
   Le total et la moyenne restent ceux du serveur, jamais ceux d’une page partielle.
   Les pages sont isolées par compte/curseur ; erreurs, chargement et absence réelle
   d’avis sont distingués, avec navigation précédente/suivante et réessai.
   Dans le backend : nouvel endpoint additif `GET /ratings/user/:userId/page`,
   validation UUID/curseur/taille (maximum 50), limitation de fréquence, projection
   explicite des seuls champs de présentation de l’auteur, et réutilisation de la
   pagination par curseur `(createdAt, id)` avec précision microseconde.
   Fichiers : `src/ratings/ratings.controller.ts`, `src/ratings/ratings.service.ts`,
   `src/ratings/entities/rating.entity.ts`,
   `src/database/migrations/1780000065000-IndexRatingPages.ts` et registre
   `src/database/migrations/index.ts`. L’index composé et le curseur suivent les
   recommandations du skill `supabase-postgres-best-practices` ; aucun service
   Supabase ni nouvelle dépendance n’est ajouté. L’ancien endpoint non paginé est
   conservé pour les anciennes applications et les autres consommateurs existants.
7. **Contact complet depuis les réservations.** `app/bookings.tsx`,
   `features/bookings/BookingListCard.tsx`, `hooks/bookings/useBookingCards.tsx` et
   `features/navigation/NavigationContactModal.tsx` proposent « Contacter », avec
   appel, WhatsApp et messagerie Zwanga. Un téléphone absent n’interdit plus la
   messagerie. Les coordonnées proviennent de la réservation autorisée, avec
   vérification de participation ; aucune communication n’est automatique.
   Annulation, notation, suivi, restrictions d’expiration/synchronisation et retour
   sécurisé restent conservés. Un échec de chargement n’affiche plus une fausse
   liste vide invitant à réserver de nouveau.
8. **Thème cohérent avec les écrans clairs existants.** `app/_layout.tsx` utilise
   `DefaultTheme` et une barre de statut sombre. Le choix automatique d’un thème
   de navigation sombre alors que les écrans restent clairs est supprimé. Aucun
   thème sombre complet ni changement de configuration native n’est introduit.
9. **Tests et garde-fous remis en cohérence.** Les deux attentes d’expiration
   obsolètes suivent désormais la règle existante de trois heures, sans modifier
   cette règle (`tests/homeModules.test.js`, `tests/homePriorityDismissals.test.js`).
   Sept entrées de `tests/fixtures/sourceExtractions.json` sont actualisées après
   lecture des changements antérieurs et exécution des tests comportementaux
   associés : disposition navigation/authentification, reprogrammation, statut de
   réservation, contact et acceptation/modification de commande. Les assertions
   d’intégrité ne sont pas supprimées. Les mocks des tests concernés sont adaptés
   aux nouveaux contrats de pagination/contact/réseau. `eslint.config.js` déclare
   `Buffer` et `__dirname` en lecture seule uniquement pour les tests Node ; une
   exception localisée et commentée concerne la fixture à hooks injectés de
   `tests/tripDeletionReconciliation.test.js`, sans désactiver les règles React de
   l’application.

### Vérifications et limites

- Nouveaux scénarios dans `tests/auditReliabilityFixes.test.js` ; scénarios renforcés
  dans `tests/activeRideResume.test.js`, `tests/tripRequestForm.test.js`,
  `tests/walletCompactOverview.test.js` et `tests/personalListCards.test.js`.
  Ils exécutent les modules TypeScript avec I/O et rendu natif simulés : cela ne
  remplace pas des essais sur appareil réel.
- Suite mobile complète : **219 fichiers, 1 765 tests réussis, 0 échec, aucun
  ignoré**. Exécution Node avec `--test --test-force-exit --test-concurrency=4`
  sur tous les `tests/*.test.js`. `--test-force-exit` termine les workers après les
  assertions, sans attendre les temporisations résiduelles des fixtures RTK : ce
  résultat n’est donc pas une validation d’absence de handles/timers résiduels.
  Les deux fixtures réseau incompatibles révélées par la première passe ont été
  adaptées, puis la suite entière réexécutée avec succès.
  ESLint sur les sources applicatives, tests et configuration : **0 erreur,
  242 avertissements sur 1 291 fichiers**. Les avertissements restent à traiter ;
  aucune suppression globale des règles applicatives n’a été faite.
- TypeScript mobile `tsc --noEmit` et backend
  `tsc --noEmit --incremental false -p tsconfig.build.json` : réussis.
  Tests backend ciblés `ratings-page.spec.ts` et `history-page.spec.ts` :
  **2 suites, 9 tests réussis**, avec repository simulé, sans base PostgreSQL.
  Contrôles de taille : **1 067 sources, aucune au-dessus de 400 lignes**.
  Frontière HTTP/RTK Query et `git diff --check` : réussis.
- **Migration préparée, non exécutée.** Déployer le backend paginé avant le mobile.
  Dans l’environnement backend voulu, examiner `npm run migration:show`, puis
  exécuter `npm run migration:run` selon la procédure de déploiement. Ce dernier
  applique toutes les migrations en attente, pas seulement cet index. La création
  transactionnelle de l’index est bornée par des timeouts de verrouillage (5 s) et
  d’exécution (30 s) ; elle peut bloquer brièvement les écritures et doit être
  planifiée. Pour une table volumineuse, prévoir une migration concurrente dédiée.
  Pas d’application de migration, d’EXPLAIN ou de mesure de latence PostgreSQL ici.
- La vérification d’un envoi incertain reste en mémoire pendant la vie du formulaire.
  Elle ne fournit pas d’idempotence durable après fermeture forcée ; une clé
  d’idempotence serveur avec persistance client reste une amélioration distincte.
  Aucun renvoi automatique du POST n’est ajouté.
- Pas de build natif ni d’essai sur iPhone/Android physique. À tester : ouverture et
  fermeture des modals puis navigation, contact sans téléphone, mode avion avec et
  sans cache, reprise réseau, commande avec timeout, retour dans l’app avec ancien
  trajet en cache, pagination de nombreux avis et lisibilité en mode système sombre.
  Aucun gain mesuré de chauffe, mémoire native ou absence de crash n’est annoncé.

## 10 octobre 2026 — Retour sécurisé depuis « Mes réservations »

- Problème : le bouton de retour dans `app/bookings.tsx` appelait directement
  `router.back()`. Sans écran précédent, l’action `GO_BACK` est refusée par le
  navigateur. Plusieurs appuis rapides pouvaient également mettre plusieurs
  retours en attente avant la première transition.
- Appliqué : vérification de `router.canGoBack()` au moment de l’appui ; retour
  normal si un historique existe, sinon remplacement de l’écran par l’accueil
  `/(tabs)`. Verrou synchrone contre les doubles appuis, conservé lors des
  re-rendus et réinitialisé lorsqu’on revient réellement sur cet écran.
  Un ancien gestionnaire ne peut plus quitter un autre écran après perte de
  focus/démontage. Ajout du libellé d’accessibilité « Retour ».
- Conservé : onglets Actives/Historique, pagination, rafraîchissement,
  consultation et annulation des réservations, contact du conducteur et
  politique globale de retour à l’accueil. Aucune nouvelle requête réseau,
  temporisation, dépendance ou modification backend.
- Vérifications : **35 tests JavaScript réussis** avec
  `node --test tests/bookingsBackNavigation.test.js tests/homeBackNavigation.test.js
  tests/activeRideResume.test.js`, dont huit nouveaux tests exécutant l’écran
  avec navigation simulée (historique présent/absent, évolution avant l’appui,
  appuis répétés, nouvelle visite et callbacks après sortie).
  ESLint ciblé, `tsc --noEmit` et `git diff --check` réussis.
- Limites : pas d’essai natif physique réalisé. Vérifier sur iPhone et Android
  le retour depuis un accès normal et une ouverture directe, ainsi qu’un double
  appui rapide. Le message fourni suffit à identifier l’action sans destination,
  mais ne permet pas de distinguer à lui seul une entrée directe d’un double appui.

## 10 octobre 2026 — Contact après acceptation et reprise d’un trajet en cours

- Périmètre : application mobile, acceptation d’une commande de trajet par le
  conducteur, puis ouverture/retour au premier plan. L’acceptation ne proposait
  pas systématiquement de contacter le passager et une session restaurée
  revenait à l’accueil même lorsqu’un trajet était démarré.
- Contact appliqué : après confirmation serveur, affichage de « Contactez votre
  passager », avec appel, WhatsApp, messagerie Zwanga et « Plus tard ». Aucune
  communication n’est déclenchée automatiquement. Les coordonnées sont relues
  auprès du serveur et ne sont utilisables que pour la demande attribuée au
  conducteur connecté. Un numéro absent laisse la messagerie disponible ; une
  erreur réseau offre « Réessayer ». Une demande réattribuée/annulée ou un
  trajet terminé ne donne pas accès au contact via cette invitation.
  Fichiers : `components/AcceptedRequestContactCoordinator.tsx`,
  `features/request-detail/acceptedRequestContact.ts`,
  `features/navigation/NavigationContactModal.tsx`,
  `hooks/navigation/useTripContactMessaging.ts`, `types/tripRequests.ts`,
  `store/api/trip-request/requestMapper.ts`.
- Déclenchement : `store/api/tripRequestApi.ts` et
  `store/api/driverDispatchApi.ts` enregistrent uniquement les acceptations
  confirmées dans `store/slices/rideEntrySlice.ts`, réinitialisé à la déconnexion
  et au changement de compte par `store/index.ts`. Les intentions sont bornées,
  dédupliquées et ne contiennent pas de téléphone. Les actions de notification
  sont couvertes par `services/driverNotificationResponse.ts` ; ouvrir une
  notification déjà acceptée permet de reconstruire l’invitation après lecture
  serveur dans `app/incoming-driver.tsx`. Ce dernier quitte son écran natif
  avant le contact et déduplique les redirections.
- Transitions : accepter sans démarrer ouvre la gestion du trajet après
  fermeture du formulaire, sans l’ancien dialogue de succès supplémentaire.
  Accepter et démarrer conserve l’ouverture de la navigation après confirmation
  serveur. `hooks/request-detail/useRequestDriverActions.ts` et
  `hooks/navigation/useTripStartTransition.ts` conservent l’attente du véritable
  `onDismiss` iOS et les protections contre les doubles appuis/réponses tardives.
  Le contact réutilise le système de superposition interne, sans ajouter de
  présentation UIKit concurrente ; les paiements et SOS gardent leur priorité.
- Reprise appliquée : `components/ActiveRideResumeCoordinator.tsx`,
  `hooks/navigation/useActiveRideResume.ts` et
  `features/navigation/activeRideResume.ts` observent les caches d’activité déjà
  alimentés par les coordinateurs existants. Une lecture authentifiée du détail
  confirme ensuite le statut `ongoing` et la participation : navigation du
  conducteur propriétaire, ou navigation de la réservation du passager accepté
  qui n’est pas encore arrivé. Le rôle global « conducteur » ne transforme pas
  une réservation passager en trajet conducteur. Montage des deux coordinateurs
  dans `components/ReduxProvider.tsx`.
- Prévention des régressions : aucune nouvelle boucle de polling ni collecte
  GPS, aucun nouveau module natif, aucune modification de paiement, commission,
  acceptation/démarrage serveur ou permission de contact backend. Les réponses
  tardives après déconnexion, changement de compte, arrière-plan ou navigation
  volontaire sont ignorées. Une reprise au maximum par entrée au premier plan :
  quitter volontairement la navigation ne provoque pas de retour en boucle.
  Les formulaires, conversations, paiements, notation, sécurité et actions de
  notification explicites ne sont pas interrompus. Sans vérification réseau
  réussie, l’écran actuel est conservé plutôt que de rouvrir un ancien trajet.
- Vérifications : **139 tests JavaScript ciblés réussis** avec
  `node --test tests/activeRideResume.test.js tests/acceptedRequestContact.test.js
  tests/tripStartNavigation.test.js tests/tripContactMessaging.test.js
  tests/requestPassengerContact.test.js tests/accountActivity.test.js
  tests/rideOverlays.test.js tests/driverNotificationResponse.test.js
  tests/navigationAssistance.test.js tests/requestDetailModules.test.js` ;
  `tsc --noEmit` et ESLint ciblé réussis, sans avertissement. Tests ajoutés pour
  les deux rôles, lecture serveur, absence de boucle, double acceptation,
  annulation/réattribution, réseau dégradé, choix du canal et transitions iOS
  simulées. Les tests de contact existants sont adaptés à la séparation entre
  formulaire partagé et contexte de navigation local/global.
- Limites : la suite complète n’est pas annoncée comme verte. Le passage global
  (`node --test --test-concurrency=4 tests/*.test.js`) a exécuté 1 742 tests :
  1 730 réussis et 12 échecs. Six de ces échecs portaient sur les mocks du
  formulaire de contact et l’ancien dialogue de succès ; ils sont corrigés et
  repassent dans les 139 tests ciblés ci-dessus. La suite entière n’a pas été
  relancée après cette adaptation. Les six autres concernent
  notamment des attentes d’expiration anciennes dans `tests/homeModules.test.js`
  et `tests/homePriorityDismissals.test.js` (30 secondes/1 heure attendues,
  règle actuelle de 3 heures) et quatre tests d’empreintes dans
  `tests/sourceExtractions.test.js`. L’empreinte `acceptTripRequest` du snapshot
  divergeait déjà de `HEAD` avant ce lot ; l’invitation de contact ajoute aussi
  maintenant une modification intentionnelle, couverte par les tests de
  comportement ciblés. Ces règles et fixtures hors
  périmètre n’ont pas été réécrites pour masquer les échecs. Les intentions de
  contact sont transitoires, non une file de décisions hors ligne : après arrêt
  complet du processus, la reconstruction passe par la notification acceptée.
  La reprise de trajet, elle, se reconstruit depuis l’activité serveur sans
  dépendre d’une intention locale conservée.
- Validation native restante : sur iPhone et Android, essayer acceptation seule,
  acceptation + démarrage, retour après appel/WhatsApp, ouverture à froid et
  retour du passager après démarrage distant, retour du conducteur, sortie
  volontaire vers l’accueil, course terminée entre deux ouvertures et réseau
  coupé. Aucun essai physique ni déploiement réalisé pour ce lot ; les mocks
  JavaScript ne prouvent pas l’absence de gel/crash natif. Le dev build existant
  peut charger ces changements avec `npx expo start --dev-client`.

## 9 octobre 2026 — « Commander un trajet » dans les actions passager

- Demande : remplacer « Demander un trajet » par une formulation plus directe
  dans l’application mobile.
- Appliqué : « Commander » sur l’accueil, « Commander un trajet » dans le titre
  du formulaire et les accès depuis les listes, « Commander ce trajet » après
  une recherche sans résultat, « Commander le trajet » pour envoyer le formulaire
  une fois l’horaire choisi. Texte d’aide de recherche/état vide et libellés
  d’accessibilité alignés. Fichiers : `components/home/HomeHeader.tsx`,
  `app/request/index.tsx`, `app/search.tsx`, `app/my-requests.tsx`,
  `app/requests.tsx`, `hooks/trip-request/useRequestTripController.ts`.
- Conservé : routes et préremplissage, sélection explicite de l’horaire,
  différence entre départ immédiat et planifié, véhicules, prix, envoi et
  protection contre les doubles appuis. Les statuts et confirmations restent
  « demande envoyée/en attente » : commander ne signifie pas qu’un conducteur
  a déjà accepté. Aucun changement backend, API, paiement, notification ou natif.
- Vérifications : 45 tests ciblés accueil/recherche/listes/horaire réussis ;
  `npm run test:trip-request`, 74 tests réussis (avec recouvrement de la suite
  précédente) ; TypeScript sans émission réussi. Tests mis à jour dans
  `tests/homeCompactLayout.test.js`, `tests/searchScreen.test.js`,
  `tests/requestsScreen.test.js`, `tests/requestScheduleChoice.test.js`.
  ESLint ciblé et `git diff --check` réussis. La déclaration ESLint de la variable
  Node `__dirname` du test de listes a aussi été explicitée, sans effet à l’exécution.
- Limites : tests JavaScript avec composants natifs simulés ; aucun essai visuel
  sur téléphone. Mise en page conservée, rendu du libellé plus long à contrôler
  sur petits écrans et avec les polices système agrandies.

## 9 octobre 2026 — Réutilisation des compilations Android EAS

- Constat : le journal de build fourni montre une annulation à 45 min, dont
  43 min 01 s dans Gradle. Les sources React Native/Hermes sont compilées pour
  quatre ABI afin d’inclure le correctif de dessin Android. Le dépassement de
  délai est probable, mais le motif final n’est pas explicitement fourni.
- Appliqué : cache C/C++ EAS et persistance du cache de tâches Gradle pour
  `production.android`, image de build adaptée au SDK 54, activation du cache
  Gradle et suppression de la recompression PNG facultative. Le plugin maintient
  les mêmes réglages après prebuild. Fichiers : `eas.json`,
  `android/gradle.properties`, `plugins/withPatchedReactAndroid.js`,
  `tests/androidBuildPerformance.test.js` et `package.json`.
- Conservé : quatre ABI, Hermes, correctif natif issu des sources, validations
  des bibliothèques/16 Ko, signatures, parcours applicatifs, profils iOS et
  développement. Aucun changement d’offre ou de classe de machine, aucune
  nouvelle dépendance et aucun build cloud lancé.
- Vérifications : **9 tests JavaScript réussis**, ESLint ciblé sans avertissement,
  schéma EAS des trois profils valide, `git diff --check` réussi. Le dry-run
  Gradle n’a pas abouti : téléchargement du wrapper bloqué par le réseau de
  l’environnement, avant toute exécution du graphe natif.
- Limites : aucun gain chronométré ni essai sur appareil physique ; le premier
  build sans cache peut encore dépasser la limite. La taille des ressources PNG
  peut augmenter. Les caches ne garantissent pas la réussite d’un build annulé.
  Procédure de mesure, précautions et pistes différées dans
  [Compilation Android : optimisations](BUILD_ANDROID_PERFORMANCE.md).

## 8 octobre 2026 — Navigation conducteur plus compacte

- Constat : en navigation, partage, confirmations, statistiques des passagers,
  prochain arrêt, gains et sélection d’itinéraire s’empilaient au-dessus de la
  carte. Les commandes verticales et les instructions à hauteur non bornée
  pouvaient occuper la même zone. Il s’agit d’un constat de structure du code,
  pas d’une mesure de surface visible sur appareil.
- Solution appliquée, guidée par `frontend-skill` : conserver la carte comme
  espace principal et donner la priorité à l’arrêt en cours. En-tête resserré,
  partage/contact/SOS sur une ligne quand la largeur le permet, nom et adresse du
  prochain passager regroupés avec l’accès à la liste complète. Le badge redondant
  « Suivi actif » est retiré. Toucher l’arrêt ouvre son détail, sans le valider.
- Les confirmations restent directement accessibles sous les détails bornés,
  avec une explication plus courte. Leur composant garde la même position React
  lorsqu’une nouvelle réservation arrive, afin de ne pas perdre son état local.
  Une réservation unique garde son action directe ; plusieurs réservations
  gardent la sélection du titulaire dans le panneau existant. Le conducteur ne
  confirme jamais à la place du passager.
- Gains et sélection de section d’itinéraire sont accessibles dans « Options »
  pendant la navigation ; le récapitulatif de gains reste affichable à la fin.
  Le partage reste direct. Interruption, son, options et recalcul sont alignés
  horizontalement et restent au même emplacement lors du traitement d’une
  réservation. Le menu conserve ses limites tactiles et se ferme au changement
  de trajet ou d’activité de l’écran.
- Nouveau composant `DriverNavigationGuidance.tsx` : instruction actuelle et
  suivante plus compactes, texte intégral défilable en cas de besoin. Le calcul
  partagé `driverNavigationLayout.ts` réserve séparément instructions, commandes
  et panneau supérieur, en tenant compte des marges système. Les demandes urgentes
  et les nouvelles réservations restent prioritaires, avec leurs boutons hors du
  texte défilable. Les anciens styles d’instructions inutilisés sont supprimés.
- Fichiers : `app/trip/navigate/[id].tsx`, `features/driver-navigation/`
  (`DriverNavigationTopPanel.tsx`, `DriverNavigationPassengersBar.tsx`,
  `DriverNavigationControls.tsx`, les deux nouveaux fichiers précités et
  `driverPendingBookingLayout.ts`), `features/ride-recovery/RideRecoveryControl.tsx`,
  `features/screen-styles/app/trip/navigate/detail/container.styles.ts`,
  `tests/driverNavigationCompact.test.js`, `tests/navigationHeaders.test.js`,
  `tests/driverPendingBookingLayout.test.js`, `tests/rideRecoveryUI.test.js`, `package.json`.
- Conservé : double validation, file hors connexion, protections contre les doubles
  appuis, priorités d’interruption, paiement et confirmation du cash, contacts,
  SOS, sortie directe, GPS, sockets et calcul d’itinéraire. Aucun endpoint,
  minuteur, dépendance, migration ou changement natif ajouté. Les gains ne sont
  plus montés automatiquement au-dessus de la carte en cours de route ; aucun
  gain de mémoire, de fluidité ou de batterie n’a été mesuré.
- Vérifications : `npm run test:driver-navigation-ui` **83 tests réussis**,
  `npm run test:navigation` **63 tests réussis**, TypeScript `tsc --noEmit` réussi,
  ESLint ciblé sans avertissement, `git diff --check` réussi. Les nouveaux tests
  couvrent les bornes de mise en page, les gestes distincts détail/liste, le menu,
  les confirmations stables, les contenus longs et l’absence de réservation.
- Limites : tests JavaScript avec composants natifs simulés, pas de validation
  visuelle/native sur iOS ou Android. Les petits écrans et polices agrandies
  peuvent nécessiter un défilement des détails. À contrôler sur appareils :
  lisibilité du prochain arrêt, visibilité du véhicule, instructions longues,
  un et plusieurs passagers, nouvelle réservation pendant une confirmation,
  interruption, gains et retour d’arrière-plan. Aucun crash ou échauffement
  n’est annoncé corrigé par cette refonte.

## 8 octobre 2026 — « Référence » dans les adresses

- Demande : remplacer le mot « repère » par « référence » dans la publication
  et la création de demandes de trajet.
- Appliqué : libellés de départ/arrivée, boutons « Ajouter une référence »,
  « Références rapides », récapitulatif de demande et libellés d’accessibilité.
  Les composants partagés de recherche d’adresse et de détail de trajet adoptent
  également ce vocabulaire pour ne pas le changer au cours du parcours.
- Fichiers : `features/publish/PublishRouteFields.tsx`,
  `features/publish/PublishRouteStep.tsx`, `components/trip-request/RequestRouteStep.tsx`,
  `components/trip-request/RequestRoutePreview.tsx`, `components/LocationPickerModal.tsx`,
  `components/AddressEntryModeSelector.tsx`, `components/trip/RouteLocationDetails.tsx`,
  `tests/requestAddressReferences.test.js`, `tests/tripDetailCompact.test.js`.
  L’import de type situé en fin de `PublishRouteFields.tsx` est replacé en tête.
- Conservé : champs facultatifs, contenu saisi, brouillons, inversion des adresses,
  coordonnées, propriétés `departureReference`/`arrivalReference` et payloads.
  Aucun changement de contrat API ou de base de données ; les données historiques
  ne sont pas réécrites.
- Vérifications : `npm run test:trip-request` **74 tests réussis**, dont un test
  ajouté pour les champs de publication et leurs callbacks. Les suites
  `tripDetailCompact`, `routeLocationDetails`, `locationPicker` et
  `locationPickerMapPress` totalisent **45 tests réussis**. TypeScript réussi ;
  recherche des anciens libellés dans les composants et formulaires sans résultat.
  Tests de composants simulés, pas d’essai VoiceOver/TalkBack sur appareil.

## 8 octobre 2026 — Repères de départ et d’arrivée dans la création d’une demande

- Problème : le brouillon et le payload comportaient déjà `departureReference` et
  `arrivalReference`, mais le contrôleur ne les exposait pas et le formulaire de
  création ne proposait aucun champ pour les saisir.
- Solution appliquée : deux champs facultatifs sous les adresses, « Repère au
  départ » et « Repère à l’arrivée », en mode carte comme en saisie manuelle.
  Exemples courts, libellés persistants, hauteur tactile minimale de 44 unités et
  saisie limitée à 200 caractères par champ. Le guide `frontend-skill` a orienté
  cette présentation compacte, sans nouvelle carte décorative ni étape/modal.
  Le récapitulatif affiche les repères non vides sous leurs adresses, sur une ligne
  pour ne pas envahir la carte. Le détail de la demande utilise déjà le bloc
  partagé affichant les repères avec retour à la ligne.
- Fichiers : `components/trip-request/RequestRouteStep.tsx`,
  `components/trip-request/RequestRoutePreview.tsx`,
  `hooks/trip-request/useRequestTripController.ts`, `app/request/index.tsx`,
  `features/trip-request/requestStyles.ts`, `tests/requestAddressReferences.test.js`,
  `tests/tripRequestForm.test.js`, `package.json`.
- Comportements conservés : les valeurs restent dans le brouillon pendant les
  changements d’étape ; l’inversion départ/arrivée inverse aussi les repères.
  Ils ne remplacent ni les adresses ni les coordonnées GPS. Le traitement existant
  supprime les espaces périphériques et n’envoie pas de repère vide. Leur absence
  ne bloque pas la création. Les conditions d’envoi, horaires, prix, places,
  consentements et protection contre double envoi restent inchangés.
- Backend inspecté en lecture seule : DTO, entité et service de demandes prennent
  déjà en charge ces chaînes facultatives. Aucun changement serveur, migration,
  nouvelle dépendance ou nouvel endpoint. La recommandation tarifaire existante
  continue à recevoir les repères, avec son délai de regroupement de saisie de
  250 ms ; pas de nouveau traitement GPS ni de calcul sur la carte ajouté.
- Vérifications : `npm run test:trip-request` **73 tests réussis**, incluant les
  trois nouveaux tests d’interface/contrôleur et les deux tests du payload ;
  `node --test tests/requestAddressReferences.test.js tests/tripRequestForm.test.js
  tests/routeLocationDetails.test.js tests/requestDetailModules.test.js`
  **47 tests réussis** (recouvrement avec la première suite, pas 120 tests distincts).
  TypeScript `tsc --noEmit` réussi, ESLint ciblé sans avertissement et
  `git diff --check` sans erreur. Contrôle de taille : 1 058 sources, aucune
  au-dessus de 400 lignes.
- Limites : tests JavaScript avec composants natifs simulés, pas d’essai physique
  iOS/Android ni de mesure de performance native. À vérifier sur appareil : clavier,
  longues indications, sélection sur carte, inversion et retour à l’étape précédente.
  Pas de build natif supplémentaire requis pour ce changement seul.

## 8 octobre 2026 — Allègement du choix de départ

- Demande : retirer la rangée encerclée « Maintenant / Dans 30 min » dans l'écran
  « Demander un trajet ». Suppression de cette rangée et de son espace dans
  `components/trip-request/RequestScheduleFields.tsx`, ainsi que de la prop
  `applyPreset` devenue inutile dans `app/request/index.tsx`.
- Les champs Date/Heure, le résumé du créneau, la validation explicite de l'heure,
  « Je peux attendre », le budget et la soumission restent inchangés. Les anciens
  états de brouillon et leurs règles horaires restent pris en charge.
- Le test du composant dans `tests/requestScheduleChoice.test.js` vérifie l'absence
  des deux raccourcis et conserve les contrôles des sélecteurs et de la marge.
  Vérifications : 40 tests Node du planning/formulaire réussis, TypeScript sans
  émission réussi et diff sans erreur d'espacement. Pas d'essai visuel sur appareil,
  de backend ou de déploiement concerné.


## 8 octobre 2026 — Consultation d’un trajet expiré selon son propriétaire

- Problème constaté dans le code : le détail affichait « Trajet introuvable » pour
  toute absence de données, y compris une erreur réseau. Une expiration n’avait
  pas d’écran dédié. Le serveur archive les départs jamais démarrés sous le statut
  `completed`, également utilisé pour les courses réellement terminées : ce seul
  statut ne permettait donc pas de les distinguer. Pas de reproduction du compte
  utilisateur ni de diagnostic d’un HTTP 404 en production pendant cette intervention.
- Mobile : `tripDetailAvailability.ts` distingue expiration, suppression confirmée
  (404), refus d’accès, chargement et indisponibilité temporaire. Le détail réseau
  prime sur la liste locale et doit correspondre à l’identifiant demandé. Un refus
  serveur ne permet pas de continuer à afficher un ancien détail en cache.
  `useTripDetailData.ts`, `TripUnavailableState.tsx` et `app/trip/[id].tsx` affichent
  « Ce trajet a expiré » au non-propriétaire ; aucun formulaire de réservation ni
  lecture des réservations n’est ouvert dans cet état. Une panne propose Réessayer
  sans annoncer une suppression. Les trajets réellement supprimés restent introuvables.
- Propriétaire : les détails restent visibles, avec le libellé Expiré et le bouton
  Modifier. La reprogrammation déjà présente est conservée : pour un trajet éligible,
  elle publie un nouveau départ sans rouvrir les anciennes réservations. L’éditeur
  propose une date future pour un départ expiré et refuse une nouvelle date passée
  ou invalide avant l’envoi. Les contrôles serveur d’éligibilité restent inchangés,
  notamment l’interdiction de reprogrammer un trajet avec des réservations actives.
- Fichiers de présentation/parcours : `TripDetailActionsFooter.tsx`,
  `TripDetailContentSheet.tsx`, `useTripDetailController.ts`,
  `useTripDetailEditorLifecycle.ts`, `useTripDetailEditSubmission.ts`,
  `TripListCards.tsx`, `app/trip/manage/[id].tsx`, `DriverTripAccessGuard.tsx`.
  Un non-propriétaire ouvrant un lien de gestion expiré est dirigé vers le message
  d’expiration ; il ne monte pas le contrôleur conducteur.
- Backend local, dans le dépôt voisin `zwanga-backend` : `trip-read-policy.ts`
  expose `isExpired` sans exposer les coordonnées en direct, numéros ou réservations
  d’autres personnes. `trips.service.ts` complète la lecture d’autorisation existante
  avec `departureDate` et `startedAt`. Ces valeurs et le statut courant priment sur
  le cache : une course réellement démarrée puis terminée n’est pas présentée comme
  expirée. `types/trips.ts`, `store/api/trip/serverTypes.ts` et `tripMapper.ts`
  transmettent l’indicateur sans transformer tous les statuts completed en expirés.
- Performance/précautions : suivant le guide PostgreSQL, ajout de deux colonnes à
  une lecture existante par identifiant, sans nouvelle requête, index ni migration.
  Pas de minuterie ajoutée ; rafraîchissements périodiques suspendus pour les départs
  expirés reconnus. Conservés : droits conducteur/passager, trajets privés, navigation
  active, paiements, modifications des trajets en cours et historique. Les travaux
  déjà présents sur les créneaux et la reprogrammation n’ont pas été remplacés.
- Vérifications JavaScript : **65 tests réussis** avec `node --test
  tests/tripExpiryAccess.test.js tests/tripParticipation.test.js
  tests/auditUsabilityFixes.test.js tests/tripDetailReadPolicy.test.js
  tests/tripDetailCompact.test.js tests/tripDetailPerformance.test.js
  tests/tripListCards.test.js tests/driverBookingReadAccess.test.js
  tests/manageTripSummary.test.js tests/manageTripCancellation.test.js
  tests/assignedTripNavigation.test.js`. Ces tests couvrent aussi les dates invalides,
  le changement d’identifiant, l’édition par le propriétaire et la conservation des
  anciennes réservations lors de la reprogrammation.
- Vérification complémentaire de `tests/tripReprogram.test.js`, ajouté en parallèle :
  **4 tests réussis** (publication, modification ordinaire, double clic et échec réseau).
- Backend : **32 tests réussis** avec Jest sur `trip-read-policy.spec.ts` et
  `trip-reprogram.spec.ts` ; compilation `tsc --noEmit --incremental false
  --project tsconfig.build.json` réussie. Aucun test n’a modifié une base de données.
- Contrôles mobile : `tsc --noEmit` réussi ; ESLint sans avertissement sur les
  fichiers TypeScript touchés ; `check:source-size` contrôle 1 058 sources, aucune
  au-dessus de 400 lignes ; `git diff --check` sans erreur de whitespace. Les
  deux références stables manquantes dans les dépendances de l’effet d’ouverture
  de l’éditeur ont été ajoutées lors de ce contrôle. Suites globales non exécutées.
- Livraison/limites : backend corrigé à livrer avant l’app pour identifier les
  expirations déjà archivées. Aucune migration, dépendance ou configuration native
  ajoutée ; aucun déploiement réalisé. Pas d’essai iOS/Android physique ni de mesure
  de latence native. À tester : clic sur un même trajet expiré depuis les comptes
  propriétaire/non-propriétaire, modification avec une date future, consultation
  d’une course réellement terminée, coupure réseau puis Réessayer.

## 8 octobre 2026 — Modifier et reprogrammer demandes et trajets expirés

- Périmètre : détail demande, édition, cache d'expiration, détail/gestion trajet et API.
  Les demandes sans conducteur confirmé expirent trois heures après la fin du
  créneau (au lieu de trente secondes). Deux heures conservées pour les demandes
  acceptées ; les invitations dispatch et la fin de recherche GPS sont inchangées.
- Le propriétaire peut modifier une demande non assignée, même immédiate, ou
  reprogrammer une demande expirée avec un créneau futur. Les offres en attente
  sont invalidées par le backend. Une demande annulée, liée à un trajet ou à un
  conducteur/offre accepté n'est pas réouverte. Une recherche immédiate expirée
  ou reportée hors de son horizon devient classique ; explication dans le formulaire.
- `requestExpiration.ts`, `useRequestAvailability`, `useRequestEditInitialization`,
  `useRequestPassengerActions` et le formulaire partagé portent ces règles.
  `expectedUpdatedAt` est figé à l'ouverture du formulaire et transmis à l'API :
  un rafraîchissement en arrière-plan ne permet pas d'écraser une modification
  concurrente. Les références et descriptions vidées sont bien transmises.
- Le serveur expose `canReprogram` pour un trajet public expiré jamais démarré,
  sans réservation active ni embarquement. Le mapper/types et les boutons du
  détail/gestion suivent ce champ (absent sur un ancien backend = action masquée).
  Le formulaire prérempli utilise une date future et le nombre total de places.
  `POST /trips/:id/reprogram` crée un **nouveau trajet** et la navigation ouvre son
  nouvel ID ; aucune réservation ni paiement de l'ancien n'est transféré.
  L'édition ordinaire conserve `PUT /trips/:id`. Protection des doubles clics et
  indicateur d'enregistrement commun aux deux opérations.
- Tests réellement exécutés : TypeScript `tsc --noEmit --incremental false`,
  tests Node du cache/politique d'expiration (12). Tests de reprogrammation avec
  API/navigation simulées dans `tests/tripReprogram.test.js`. Aucun essai Android/iOS
  physique, push réel, paiement, publication store ou appel à AWS. Le détail des
  garanties backend et les validations figurent dans
  `zwanga-backend/docs/finance/trip-request-response-expiration.md`.
- Livraison : backend d'abord, puis app. Les anciennes versions des stores qui
  expirent localement après trente secondes ne bénéficient pas du nouvel affichage
  ni des nouveaux boutons avant leur mise à jour. Après une réponse réseau incertaine
  à la publication, vérifier « Mes trajets » avant de réessayer (pas d'idempotence
  persistante sur cet endpoint de création).


## 8 octobre 2026 — Choix explicite du départ dans une demande de trajet

- Périmètre : création d'une demande, horaires et sélecteurs Android/iOS. Le
  formulaire sélectionnait « Maintenant » automatiquement et cachait Date/Heure
  derrière « Choisir ». Ces deux champs sont désormais directement visibles sous
  « Départ souhaité ». La date initiale est affichée ; l'heure doit être validée
  explicitement. « Maintenant » et « Dans 30 min » restent des raccourcis volontaires.
- Le bouton principal ouvre le choix de l'heure tant qu'elle n'est pas choisie,
  puis propose l'envoi de la demande. Date et heure personnalisées sont conservées
  à l'envoi, sans conversion silencieuse en départ immédiat. Le brouillon stocke
  un indicateur sérialisable `hasChosenDepartureTime`, effacé avec le formulaire
  ou la session selon le fonctionnement existant.
- Le guide `frontend-skill` a orienté la présentation vers deux champs lisibles,
  des zones tactiles d'au moins 44 unités, des textes courts et une marge repliée
  sous « Je peux attendre ». Pas de nouvelle étape. La marge vaut 30 minutes par
  défaut et propose 15/30/60/120 minutes ; « Exact » est retiré car il produisait
  une fenêtre vide déjà refusée par le backend. Le résumé indique aussi le jour
  de fin lorsque la plage franchit minuit.
- iOS : réutilisation du modal `inApp`, boutons Annuler/Valider, modifications
  temporaires avant validation. Android : annulation native ignorée même si elle
  renvoie une date, protection contre les doubles ouvertures et reprise après
  erreur. Les callbacks périmés après fermeture/sortie ne modifient plus le choix.
  `types/external.d.ts` est complété avec `dismiss`/`onError`, vérifiés dans la
  bibliothèque déjà installée ; aucune nouvelle dépendance.
- Validation avant requête : heure non choisie, dates non finies, fenêtre vide
  et départ déjà passé refusés. La tolérance client d'une minute dans le passé
  est supprimée pour suivre la validation serveur existante. Aucun minuteur de
  recalage pour un horaire personnalisé ; ceux des raccourcis restent suspendus
  hors écran. Aucun appel réseau ajouté pour choisir la date ou l'heure.
- Conservés : adresses/carte, prix, places, vérification d'identité, paiements,
  protection contre double envoi, récupération après réponse réseau ambiguë,
  notifications et activation serveur de proximité pour « Maintenant » explicite.
  Backend examiné en lecture seule ; pas de migration ni de déploiement.
- Fichiers : `app/request/index.tsx`,
  `components/trip-request/RequestScheduleFields.tsx`, `RequestDatePickerModal.tsx`,
  `hooks/trip-request/useRequestDraft.ts`, `useRequestSchedule.ts`,
  `useRequestSubmission.ts`, `useRequestTripController.ts`,
  `features/trip-request/requestFormModel.ts`, `store/slices/requestDraftsSlice.ts`,
  `types/external.d.ts`, `package.json`, `tests/requestScheduleChoice.test.js`
  et `tests/tripRequestForm.test.js`.
- Vérifications : **79 tests JavaScript ciblés réussis** avec
  `node --test tests/requestScheduleChoice.test.js tests/requestScheduleIdle.test.js tests/tripRequestForm.test.js tests/tripRequestEditPricing.test.js tests/passengerSeats.test.js tests/formSafeArea.test.js tests/rideOverlays.test.js`.
  TypeScript (`npx tsc --noEmit`), ESLint ciblé et `git diff --check` réussis.
  Contrôle de taille : 1 056 sources, aucune au-dessus de 400 lignes.
- Limite distincte : `npm run test:trip-request` inclut aussi les tests
  d'expiration ; neuf échouent parce qu'une modification parallèle, non réalisée
  ici, passe `UNACCEPTED_TRIP_REQUEST_EXPIRATION_MS` de 30 secondes à 3 heures.
  `features/trip-request/requestExpiration.ts` et ses tests ont été laissés
  intacts par cette intervention. La suite globale n'a pas été relancée.
- À vérifier sur iPhone et Android physiques : date future, heure du jour,
  passage à minuit, annulation/validation sans déplacer la roue, grande taille
  de texte, fermeture et retour dans l'app. Aucun essai natif ni gain mesuré de
  performance n'est annoncé. Le correctif est JS/TS uniquement : un dev build
  compatible peut le charger avec `npx expo start --dev-client`, sans nouveau
  build natif requis pour ce changement seul.

## 8 octobre 2026 — Modal de contact avant acceptation d'une demande

- Problème : « Discuter du prix » ouvrait directement la messagerie, sans choix
  d'appel ou de WhatsApp. Le bouton « Contacter le passager » ouvre maintenant
  le modal de contact existant dans la demande et la proposition de proximité.
- Après accord explicite sur le partage du numéro, ajout d'un accès backend
  dédié, authentifié, limité en fréquence et réservé aux conducteurs éligibles
  vérifiés. Demande ouverte uniquement ; proposition immédiate réservée à son
  destinataire actif. Les numéros restent absents des listes et aperçus.
- Lecture seulement au clic, données de contact éphémères, fermeture à
  l'expiration/sortie/changement de compte. Pas d'acceptation, de message envoyé,
  de modification du prix ni de prolongation automatique du délai.
- Vérifications : 63 tests mobiles de contact/régression, 85 tests audit/UX et
  42 tests backend ciblés réussis. TypeScript mobile, ESLint mobile ciblé,
  TypeScript backend de production et contrôle de taille des sources réussis.
  Le TypeScript backend incluant tous les tests signale des erreurs dans des
  fichiers de test préexistants non modifiés. Aucun essai physique ni déploiement.
  Suite mobile complète : 1 657 tests, 1 654 réussis ; seuls les trois écarts de
  références déjà documentés de `sourceExtractions.test.js` persistent.
- Fichiers, résultats complets, limites et commandes :
  [Contact passager avant acceptation](CONTACT_PASSAGER_AVANT_ACCEPTATION_2026_10_08.md).

## 8 octobre 2026 — Correctifs de l'audit et discussion avant acceptation

- Périmètre : six points de l'audit performance/ergonomie et contact du passager
  avant acceptation d'une demande. GPS de proximité partagé avec l'accueil,
  contrôles natifs espacés, suppression des polls de listes redondants,
  suspension hors ligne, reprise après erreur de permission, messages d'accès
  précis, réglages allégés et bouton d'ajout de véhicule agrandi.
- Ajout de « Discuter du prix » dans la demande et la proposition de proximité,
  via la messagerie existante, après relecture autorisée de la demande. Aucun
  numéro exposé, message automatique, acceptation ou changement de montant.
  Expiration des propositions, contrôle serveur, sonneries, GPS des trajets et
  possibilité de refuser la localisation conservés.
- Fichiers, contrôles anti-régression, limites et essais physiques nécessaires :
  [Correctifs performance, ergonomie et contact](AUDIT_PERFORMANCE_UX_CONTACT_2026_10_08.md).
- Vérifications ciblées : `npm run test:audit-ux`, 69 tests JavaScript réussis.
  Suite complète finale : 1 641 tests, 1 638 réussis et trois écarts de références
  préexistants dans `sourceExtractions.test.js` (styles auth, `updateBookingStatus`,
  `acceptTripRequest`), revérifiés identiques sur `HEAD`. Aucun autre échec.
  `npx tsc --noEmit`, ESLint ciblé, `git diff --check` et contrôle de taille des
  sources réussis. Aucun essai physique iOS/Android ou mesure de batterie.
  Aucune nouvelle dépendance, migration ou intervention sur la production.

## 8 octobre 2026 — Suivi conducteur en veille activé par défaut

- Demande : éviter une activation supplémentaire dans le profil après l'ajout
  du suivi de proximité. `services/nearbyDriverLocation.ts` applique désormais
  le mode automatique en l'absence de préférence, uniquement avec autorisation
  système d'arrière-plan et compte authentifié concordant. La permission du
  téléphone n'est ni contournée ni demandée silencieusement.
- Désactivation explicite conservée par compte après déconnexion/redémarrage ;
  `store/index.ts` arrête la tâche et efface son propriétaire sans supprimer ce
  choix. Protection des relances tardives pendant un logout ; le nouveau compte
  peut reprendre automatiquement sans hériter du réglage d'un autre utilisateur.
- `components/profile/NearbyDriverLocationPermission.tsx` et
  `app/driver-availability.tsx` distinguent mode automatique, permission manquante
  et désactivation volontaire. `components/DriverPresenceCoordinator.tsx`
  suspend les lectures/navigation d'invitation pendant une déconnexion.
- Conservés : cadence GPS économe, attente réseau progressive, précision/fraîcheur,
  suspension pendant les trajets, sonneries/actions et contrôle serveur. Aucun
  changement de backend, dépendance ou infrastructure de production.
- Vérifications : `npm run test:nearby-drivers`, **87 tests JavaScript réussis**,
  dont démarrage par défaut, refus de permission, persistance du refus, changement
  de compte et courses entre arrêt/démarrage. TypeScript, ESLint ciblé et
  `git diff --check` réussis. Pas d'essai physique ni de mesure de batterie ;
  ne pas en déduire une garantie en veille. La suite globale n'a pas été relancée
  pour cet ajustement ; ses trois références préexistantes en échec restent
  signalées dans la section précédente de l'intervention.
- Documentation courante et procédure appareils actualisées :
  [Localisation des conducteurs pour les demandes proches](LOCALISATION_CONDUCTEURS_PROXIMITE_2026_10_08.md).

## 8 octobre 2026 — Localisation économe des conducteurs pour les demandes proches

- Ajout du suivi de proximité en veille, sur consentement explicite dans
  Profil → Alertes conducteur, connecté à l'allocation/sonnerie longue existante.
  Suppression du GET de statut avant chaque position ; envois espacés et
  sérialisés, positions anciennes rejetées, attente progressive après erreur,
  suspension pendant les trajets et arrêt à la déconnexion/changement de compte.
- Backend, sélection des destinataires, actions Accepter/Refuser, réservations
  publiées et arrêt du son à l'ouverture conservés. Aucune nouvelle dépendance,
  migration ou modification de production.
- Détails des fichiers, limites système, données, tests et procédure appareils :
  [Localisation des conducteurs pour les demandes proches](LOCALISATION_CONDUCTEURS_PROXIMITE_2026_10_08.md).
- Vérifications : 79 tests JavaScript ciblés, TypeScript et ESLint ciblé réussis.
  Suite complète : trois comparaisons de références échouent dans
  `sourceExtractions.test.js` ; mêmes écarts vérifiés sur le dernier commit,
  donc antérieurs à cette intervention (détails dans le document lié).
  Aucune validation physique ni mesure de batterie ; ne pas interpréter ces
  résultats comme une garantie de sonnerie ou de fonctionnement en veille.

## 8 octobre 2026 — Blocage tactile iOS pendant la notation de fin de trajet

- Signalement : l'application reste affichée mais aucun appui ne répond, jusqu'à
  fermeture forcée. Ce n'est pas un crash natif démontré. L'inspection a constaté
  une présentation `modal` iOS de l'écran de notation et des dialogues globaux
  susceptibles de s'afficher pendant la transition depuis la fin de trajet.
  Une reproduction JavaScript a également confirmé qu'une réponse de notation
  reçue après perte du focus déclenchait encore la fermeture du clavier et un
  retour automatique après 650 ms. Le lien exact entre ces risques et le gel
  observé sur l'iPhone reste à valider sur appareil.
- Appliqué : `components/ProtectedAppStack.tsx` présente désormais `rate/[id]`
  en `card` sur iOS comme sur Android. `app/rate/[id].tsx` utilise un
  `RideOverlayScope` lié au compte/trajet et au premier plan ; ses dialogues
  passent par l'hôte existant dans l'app, sans nouvelle présentation modale
  UIKit. Le défilement conserve les appuis sur les boutons avec le clavier ouvert.
  [Référence des modes de présentation](https://reactnavigation.org/docs/native-stack-navigator/#presentation)
  : ce choix réduit les présentations imbriquées, sans prouver à lui seul la
  résolution du blocage natif signalé.
- Transition conducteur : `hooks/driver-navigation/useDriverRatingTransition.ts`,
  appelé par `useDriverNavigationController.ts`, réutilise le nettoyage des
  panneaux, des animations de marqueur et des requêtes de navigation avant la
  libération de la carte et le changement d'écran. Verrou contre les doubles
  appuis, refus hors écran, et réutilisation de la récupération existante si le
  changement d'écran n'aboutit pas. Aucune mutation d'état métier du trajet.
- Cycle de notation : `hooks/rating/useRatingLifecycle.ts`, `useRatingData.ts`
  et `useRatingActions.ts` distinguent une réponse enregistrable pour le même
  compte/trajet d'une réponse autorisée à agir sur l'interface. Perte de focus,
  arrière-plan, fermeture explicite, changement de contexte ou démontage
  invalident les anciens retours différés et dialogues. Une réussite reçue en
  arrière-plan reste affichable au retour, sans nouvel envoi de la note.
- Préservés : cibles conducteur/passager, étoiles, commentaire et tags,
  validation serveur via le même endpoint, retour après réussite si l'écran
  est resté actif, retour manuel, liens profonds, contrôles de propriété et
  paiements. Les mécanismes globaux de paiement et de notation App Store ne sont
  pas modifiés. Aucune dépendance, modification backend ou publication effectuée.
- Vérifications : **67 tests JavaScript réussis** sur notation, droits de
  lecture, navigation, superpositions, retour accueil et coordination de la
  notation App Store. Ajouts : `tests/ratingLifecycle.test.js`,
  `tests/ratingPresentation.test.js` et cas de transition/100 ouvertures-fermetures
  dans `tests/rideOverlays.test.js`. TypeScript sans émission et ESLint ciblé
  réussis ; contrôle de taille : 1 048 sources, aucune au-dessus de 400 lignes ;
  `git diff --check` sans erreur. Ces tests simulent les API natives ; ils ne
  constituent pas un essai iPhone ni une preuve d'absence de blocage en production.
- Commande de régression ajoutée dans `package.json` : `npm run test:rating`
  (**44 tests réussis**, sous-ensemble rejoué après ajout de la commande).
  Recette physique restante : terminer un trajet avec passager, ouvrir « Noter »,
  choisir le passager et les étoiles, envoyer avec/sans commentaire puis revenir
  à l'accueil. Refaire avec clavier, double appui, réseau lent/erreur API, passage
  en arrière-plan avant réponse et paiement reçu au même moment. Vérifier aussi
  Android et l'ouverture depuis la gestion du trajet. Le code est JavaScript :
  il faut qu'il soit inclus dans la version installée ou une mise à jour compatible ;
  le TestFlight déjà installé n'est pas modifié par ces fichiers locaux.
  Pour produire un nouveau binaire iOS avec le profil existant :
  `npx eas-cli build --platform ios --profile production`. Cette commande n'a
  pas été exécutée ; la soumission à TestFlight reste une étape séparée.

## 8 octobre 2026 — Priorité aux trajets conducteur avec réservations sur l'accueil

- Problème : la carte prioritaire concernait surtout les réservations en attente.
  Après acceptation, un trajet publié pouvait disparaître de cette zone si son
  départ était à plus de trois heures, malgré la présence de passagers confirmés.
- Appliqué : classement commun dans `features/home/homeDriverTripPriority.ts`,
  utilisé par `hooks/home/useHomeDriverActivity.ts` et
  `hooks/home/useHomeTripSelection.ts`. Après l'éventuel trajet en cours, les
  réservations à traiter passent avant les trajets avec réservations acceptées,
  puis les départs sans réservation dans les trois heures. Dans chaque groupe,
  le départ le plus proche passe en premier ; les égalités sont déterministes.
  Un trajet réservé reste éligible tant que le serveur le déclare à venir et
  non démarré, même si son horaire prévu est dépassé.
- Source des comptes : `store/api/trip/activityTripMapper.ts` dérive un résumé
  des réservations déjà renvoyées par l'API authentifiée, déclaré dans
  `types/trips.ts`. Une réservation compte une fois, indépendamment des places
  demandées ou de l'absence du profil passager. Les réservations annulées,
  refusées, terminées, en absence signalée et les arrivées déjà confirmées
  n'ajoutent aucune priorité. Aucun appel supplémentaire par trajet ni nouveau
  minuteur. `store/api/booking/createBooking.endpoints.ts` invalide aussi le
  cache des trajets personnels après une modification du statut de réservation,
  afin de relire le nouvel état sans attendre le contrôle périodique.
- Interface : `components/home/HomeActivityCards.tsx` réutilise la carte compacte
  avec « 1 réservation » / « N réservations » pour le trajet réservé, avant les
  demandes proches. Son appui ouvre toujours la gestion du trajet ; les
  réservations à traiter conservent leur carte et leur action existantes.
- Préservés : priorité absolue du trajet en cours (conducteur ou passager), carte
  et suggestions publiques, GPS, arrêt des lectures hors écran, gestes de
  masquage et isolation du compte. Masquer un trajet ne masque pas une nouvelle
  réservation à traiter. Aucun changement backend, migration, dépendance ou
  déploiement en production.
- Vérifications : `npm run test:home` **127 tests JavaScript réussis** ;
  `node --test tests/activityTrips.test.js tests/accountActivity.test.js tests/storeReview.test.js`
  **21 tests réussis**. Tests ajoutés dans `tests/homeDriverReservations.test.js`,
  `tests/homeActivityCards.test.js` et `tests/activityTrips.test.js` : passage
  attente/acceptation, plusieurs trajets, annulation, démarrage, masquage,
  propriété, données incomplètes, invalidation du cache et navigation inchangée.
  TypeScript (`npx tsc --noEmit --incremental false`), ESLint ciblé et
  `git diff --check` réussis ; contrôle de taille : 1 046 sources, aucune au-dessus
  de 400 lignes. Ce sont des tests JavaScript avec entrées natives simulées,
  pas une validation sur appareil physique ni un benchmark de performance.
- Recette restante : sur iOS et Android, publier un trajet à plus de trois heures,
  recevoir puis accepter une réservation et revenir à l'accueil ; vérifier la
  carte, son compteur et son accès à la gestion. Refaire avec plusieurs trajets,
  une annulation et un démarrage. Aucun essai sur téléphone dans ce tour ; ce
  changement JavaScript seul ne nécessite pas de nouvelle dépendance native.

## 8 octobre 2026 — Sonnerie de demande plus audible, périmètre de diffusion à confirmer

- Demande : une alerte de nouvelle demande proche d'une sonnerie téléphonique,
  plus longue et plus audible qu'un bip push. Inspection : la sonnerie embarquée
  durait déjà 29 s ; les propositions ciblées/réservations utilisent le canal long,
  mais les annonces générales `trip_request`, diffusées à tous les conducteurs
  actifs éligibles au push, gardent le son standard. Le dernier push effectivement
  reçu par l'utilisateur n'a pas été identifié dans ce tour.
- Appliqué : gain du générateur `scripts/generate-driver-ring.cjs` relevé sans
  saturation et régénération de `assets/sounds/driver_ring.wav` et
  `android/app/src/main/res/raw/driver_ring.wav`. Niveau du signal augmenté de
  **3,38 dB** ; crête mesurée de **−4,51 à −1,13 dBFS**, RMS de **−13,56 à
  −10,18 dBFS**. Durée 29 s et taille 1 278 944 octets inchangées. Ce ne sont pas
  des mesures de volume acoustique sur téléphone.
- Préservés : ciblage, expiration serveur, bouclage/limite Android 30 s, actions,
  mécanisme d'arrêt à l'ouverture, canal versionné existant, réglages utilisateur
  et autres notifications. Aucun contournement du silencieux, CallKit/PushKit,
  service supplémentaire, nouvelle dépendance ou changement backend/production.
- Vérifications : **26 tests JavaScript réussis** (notifications conducteur,
  réponses, assets natifs). Nouveau test de niveau sans saturation et répétition
  sonore dans chaque cycle jusqu'à la fin ; copies WAV identiques. Aucun essai
  acoustique natif ni build exécuté. Un nouveau build est requis pour le nouveau
  son embarqué ; changer seulement le JavaScript ne suffit pas.
- Différé : extension éventuelle du son long aux annonces générales. Une question
  a été posée, car cela ferait sonner tous leurs destinataires et pas uniquement
  le conducteur proche. Aucun changement de ce périmètre sans confirmation.
- [Détails, limites système et commandes de build](SONNERIES_DEMANDES_2026_10_08.md#renforcement-du-signal-sonore-et-distinction-des-flux).

## 8 octobre 2026 — Inscription avec un numéro étranger

- Problème : l'interface suggérait uniquement un numéro congolais et exigeait
  dix caractères. Côté OTP, certains numéros internationaux courts saisis avec
  `+` ou `00` recevaient à tort un préfixe congolais supplémentaire.
- Application : validation et messages partagés dans `features/auth/authPhone.ts`,
  utilisés par `PhoneStep.tsx`, `GooglePhoneStep.tsx`, `usePhoneAuthActions.ts` et
  `useSocialPhoneVerification.ts`. Aide compacte sur l'indicatif, saisie/collage
  international et connexion des comptes étrangers courts ; style dans
  `features/screen-styles/components/auth/styles/inputLabelSmall.styles.ts`.
- Backend associé : `src/otp/otp-phone.util.ts` respecte désormais tout indicatif
  explicite. `src/keccel-otp/keccel-otp.service.ts` réutilise ce traitement au lieu
  d'une copie divergente. Envoi et validation gardent la même destination OTP.
- Préservés : formats des comptes existants, stockage des identifiants, parcours
  PIN/Google/Apple, drapeau d'activation OTP, expiration/consommation du code,
  persistance du formulaire et règles des paiements Mobile Money. Aucune
  dépendance, migration, configuration d'environnement ou production modifiée.
- Vérifications : **100 tests JavaScript mobile réussis**, puis les 9 tests
  internationaux rejoués après le dernier ajustement ; **120 tests backend
  réussis**. TypeScript des deux projets et ESLint mobile ciblé réussis. Formatage
  des tests backend, contrôle de taille des sources et diff ciblé sans erreur.
  La suite `test:otp` inclut désormais `tests/authInternationalPhone.test.js`.
- Limites et recette : contrôles syntaxiques, pas de garantie de couverture
  opérateur ; aucun vrai OTP envoyé ni essai iOS/Android physique dans ce tour.
  [Détails, fichiers de tests et procédure](INSCRIPTION_NUMEROS_INTERNATIONAUX.md).

## 8 octobre 2026 — Activation effective des propositions de proximité en production

- Après accord utilisateur, ajout du paramètre SSM `DRIVER_DISPATCH_ENABLED` et
  de sa référence dans la nouvelle révision ECS **14**, déployée à partir de la
  **13**. Seule cette référence change ; mêmes images API/sidecar, ressources,
  accès IAM, réseau, pipeline et autres paramètres. Pas de nouveau build mobile.
- Contrôle préalable dans l'image de production : tables/index requis présents,
  migrations connues déjà appliquées, code de présence automatique et payload
  sonore ciblé corrects. Session PostgreSQL en lecture seule, TLS vérifié et
  délais bornés ; aucun push réel, migration ou changement de données métier.
- Déploiement terminé : service stable, tâche et cible ALB saines, santé HTTPS
  200. Second contrôle runtime positif avec activation chargée ; deux tâches
  temporaires de contrôle arrêtées. Aucun résultat acoustique iPhone revendiqué.
- Scripts ajoutés côté backend sous `infra-aws/scripts/` :
  `check-driver-dispatch.cjs`, `invoke-driver-dispatch-preflight.ps1`,
  `enable-driver-dispatch.ps1`. Procédure, coûts ponctuels, contrôles, limites et
  retour arrière documentés dans `infra-aws/docs/CHANGELOG.md`, entrée 005.
- Préservés : annonces générales standard, réservations publiées, paiements,
  critères de proximité/éligibilité et demandes existantes. Recette physique à
  réaliser avec une **nouvelle demande immédiate** et une position conducteur
  récente. [Détails et limites](SONNERIES_DEMANDES_2026_10_08.md#activation-effectuée-en-production).
- Syntaxes des scripts, contrôle documentaire infrastructure et contrôle des
  différences réussis. Des erreurs du bonus de bienvenue, déjà présentes avant
  déploiement, restent hors de ce correctif ; la santé du service ne garantit pas
  l'absence de tout autre problème applicatif.

## 8 octobre 2026 — Diagnostic de production : propositions de proximité désactivées

- Signalement persistant après reconstruction TestFlight et redéploiement du
  backend, avec un essai annoncé dans l'heure précédente. Diagnostic effectué en
  lecture seule sur le backend AWS de production ; aucune activation distante.
- Constat : la définition ECS active, révision 13, ne référence pas le paramètre
  `DRIVER_DISPATCH_ENABLED`, ni en environnement explicite ni via SSM. La tâche
  en cours utilise cette révision, sans surcharge de ce paramètre ni fichier
  d'environnement externe. Le code conserve alors les propositions ciblées
  désactivées. Les annonces générales utilisent volontairement le son standard.
- Ce blocage explique l'indisponibilité du flux de proximité sur ce backend,
  indépendamment de la présence du son dans le build. Il ne prouve pas le contenu
  exact de la notification reçue sur l'iPhone et n'explique pas, à lui seul, un
  éventuel défaut sonore des réservations publiées.
- Documentation complétée dans le [dossier des sonneries](SONNERIES_DEMANDES_2026_10_08.md#diagnostic-de-production--activation-du-flux-de-proximité).
  Activation, nouvelle définition ECS et recette réelle différées jusqu'à
  autorisation utilisateur ; aucun changement applicatif, SQL, SSM ou ECS ici.

## 8 octobre 2026 — Son iOS : contrôle du build TestFlight et sélection serveur

- Signalement précisé : le son reste standard sur iPhone malgré un nouveau build
  TestFlight utilisant le code actuel. L'hypothèse d'un ancien binaire ne suffit
  donc pas à expliquer le problème.
- Contrôle réel, en lecture seule : l'archive EAS de production **1.0.16 (134)**
  contient `Payload/zwanga.app/driver_ring.wav`, identique à la source, en PCM
  mono 16 bits / 22 050 Hz, durée **29 secondes**. Son profil embarqué indique
  APNs production et Time Sensitive autorisé. Pas d'essai acoustique sur iPhone ;
  le numéro effectivement installé et le déploiement backend restent à confirmer.
- Correctif backend : `src/notifications/notifications.service.ts` demande le son
  dédié pour une réservation ou une invitation de proximité activée même si la
  capacité interactive v2 manque. Avant cette correction, ce cas demandait
  explicitement le son standard malgré la présence du fichier dans le binaire.
  Les actions et Time Sensitive restent conditionnés à la compatibilité client.
- Préservés : annonces générales, messages, chemin Android, notification au
  passager après acceptation, autorisations et décisions métier. Aucun build,
  déploiement, certificat ou paramètre de production modifié pendant le diagnostic.
- Vérifications : **95 tests backend de notifications réussis**, dont 15 tests de
  transport/actions, TypeScript backend de production réussi et **9 tests mobiles**
  de configuration/assets réussis. Documentation détaillée et limites :
  [dossier des sonneries](SONNERIES_DEMANDES_2026_10_08.md#contrôle-du-build-testflight-et-correctif-de-sélection-du-son-ios).

## 8 octobre 2026 — Cash : tolérance cumulée de 25 jetons et choix contrôlé à la publication

- Demande : conserver les 25 jetons de tolérance et empêcher un nouveau choix cash qui dépasse le plafond. L'ancien flux bloquait dès la première dette, et un choix déjà coché pouvait rester affiché après un changement de prix/places.
- `utils/cashCommission.ts` calcule la marge restante avec la dette totale, même si un ancien résumé surestime encore le crédit. `PublishPaymentModes.tsx` désactive et retire un cash devenu invalide sur données fraîches ; aucun paiement alternatif n'est activé silencieusement. Les données en erreur/en rafraîchissement ne permettent pas une nouvelle sélection.
- `driverFinanceApi.ts`, `usePublishController.ts` et `usePublishSubmission.ts` : lecture fraîche avant publication simple ou récurrente, refus explicite si le plafond est dépassé ou si le contrôle réseau échoue, sans déclencher de publication ni de récupération ambiguë d'une écriture inexistante. Prix et places sont contrôlés ; le serveur revérifie à l'acceptation.
- `CashCommissionNotice.tsx` et `WalletOverview.tsx` expliquent la tolérance cumulée au lieu de prétendre que toute dette bloque. Commission 5 %, paiements électroniques/jetons, origines des fonds, abonnement et poursuite des courses confirmées inchangés. Dette 20 + manque 5 : autorisé ; 20 + 5,01 : refusé ; dette 25 : commission nouvelle entièrement financée ; dette > 25 : nouveau cash refusé.
- Backend associé : migration additive 60 et calculs API, sans activation du drapeau financier, sans changement CI/CD/Terraform ni accès AWS. Les anciens mobiles peuvent garder leur contrôle local plus strict ; les nouvelles explications nécessitent une mise à jour mobile.
- Tests : **49 tests JavaScript ciblés réussis**, dont seuils, désélection, publication simple/récurrente, données fraîches, réseau indisponible et portefeuille. TypeScript mobile et compilation backend réussis. Pas d'essai sur appareil, build natif, paiement, push ou déploiement réel. Documentation métier actualisée : [commission cash](CASH_COMMISSION_CREDIT.md).
- Backend final : **345 tests ciblés réussis** (8 ignorés) et **104 tests PostgreSQL isolés réussis** (3 ignorés), incluant acceptations concurrentes, annulation, remboursement partiel, idempotence et conservation des historiques. Limite de taille des 1 044 sources mobile respectée. Le contrôle à la publication reste une estimation, pas une réservation de fonds pour toutes les occurrences futures.
- ESLint ciblé : aucune erreur, deux avertissements d'import dupliqué de `@/types` dans `usePublishSubmission.ts`. Diff sans erreur d'espacement ; les changements concurrents de notifications/sonneries et leur historique Git sont conservés.

## 8 octobre 2026 — Profil de développement pour téléphones physiques

- Demande : tester les notifications sonores avant une nouvelle bêta store. Le
  profil `dev` existant cible le simulateur iOS et déclare un AAB Android.
- Solution : ajout de `dev-device` dans `eas.json`, héritant du client de
  développement et de la distribution interne de `dev`, avec APK Android,
  iOS physique et environnement EAS de développement explicite. Aucun nouveau
  module : `expo-dev-client` est déjà installé.
- Conservé : profils `dev` et `production`, identifiants d'application, signatures,
  numérotation et incréments automatiques de production. Pas de modification de
  `.env`, de création de certificat ni de lancement de build distant.
- Vérification : test de configuration ajouté à `tests/appVersions.test.js` ;
  **9 tests de versions/configuration/assets natifs réussis**, ainsi que le
  contrôle des différences. La recette figure dans le
  [dossier des sonneries](SONNERIES_DEMANDES_2026_10_08.md#tester-en-développement-sur-téléphone).
  La préparation du profil ne constitue pas un test natif.

## 8 octobre 2026 — Sonnerie des invitations et arrêt à l'ouverture

- Signalement : invitations de proximité reçues avec un son bref ou standard sur
  les bêtas Android et iOS. Précision utilisateur : arrêter la sonnerie dès
  l'ouverture de Zwanga, pas seulement après Accepter/Refuser.
- Corrections mobiles : boucle Android avec arrêt natif sous 30 secondes et avant
  l'expiration de l'offre, déduplication, arrêt à la reprise depuis l'icône ou la
  notification, invitations silencieuses au premier plan. Sur iOS,
  l'enregistrement de la capacité son/actions ne dépend plus du succès de la
  tâche de fond Expo ; APNs conserve le son embarqué de 29 secondes.
- Backend : échéance sonore `ringUntil` et validité de transport bornée pour les
  invitations v2. L'arrêt sonore ne modifie pas le statut de la réservation.
- Fichiers, précautions, limites et recette :
  [complément au dossier des sonneries](SONNERIES_DEMANDES_2026_10_08.md#complément--sonnerie-en-arrière-plan-et-arrêt-à-louverture).
- Vérifications : **67 tests JavaScript mobiles** ciblés et **94 tests backend**
  du dossier notifications réussis, avec interfaces natives/transports simulés.
  TypeScript mobile et backend de production réussis sans émission ; lint mobile
  ciblé et contrôle des différences réussis. Pas de
  déploiement, nouveau build, essai acoustique ni test d'arrêt sonore sur appareil
  physique. La cause exacte sur les binaires bêta installés reste non confirmée.

## 8 octobre 2026 — Sortie directe par l'icône de navigation conducteur

- Problème : l'icône de fermeture en haut de la navigation conducteur ouvrait
  encore une confirmation avant de quitter le guidage, ajoutant un clic inutile.
- Solution : `hooks/driver-navigation/useDriverNavigationController.ts` expose
  directement `navigateBackSafely` pour cette icône (et le retour de l'écran de
  repli). Aucun changement de statut du trajet ni appel d'interruption ajouté.
  La sortie existante conserve son nettoyage de l'interface, sa libération de
  carte native et sa protection contre les clics répétés.
- Précautions : le bouton Retour matériel Android conserve son comportement
  précédent ; les confirmations d'interruption réelle du trajet restent intactes.
  Aucun changement du parcours passager, du backend ou des dépendances natives.
- Vérifications : test du contrôleur ajouté dans `tests/driverManualReroute.test.js`
  (sortie directe pour les différents statuts, aucun modal, gestion Retour distincte).
  Suites recalcul/navigation, interruptions, en-têtes et cycle de vie : **38 tests
  JavaScript réussis**. TypeScript sans émission et contrôle des différences
  réussis ; lint ciblé sans erreur ni avertissement. Pas d'essai sur
  appareil physique iOS/Android, donc aucune conclusion nouvelle sur les crashs.
  Recette : appuyer sur l'icône de fermeture pendant un trajet en cours, vérifier
  le retour sans confirmation et la conservation du trajet en cours ; vérifier
  séparément qu'une interruption réelle demande toujours confirmation.

## 8 octobre 2026 — Demande disponible après tentative d'acceptation et accueil périmé

- Constat réel sur le backend local : après la première réparation UUID de
  publication, les dernières acceptations échouaient plus loin, à l'insertion
  de la réservation. Trois trajets privés `upcoming`, sans réservation, étaient
  associés à une demande encore `pending`, sans lien retour. Cela ne prouve pas
  une acceptation ou un démarrage réussi : la carte doublée reflétait ici une
  opération serveur incomplète, en plus du risque d'affichage périmé du cache.
- Backend : migration additive `1780000058000-FixBookingRequestUuid.ts`,
  enregistrée dans `src/database/migrations/index.ts`. Elle corrige les deux
  comparaisons UUID/varchar de `zwanga_booking_cash_guard` : lecture de la demande
  et transfert de la réserve dispatch vers la réservation. La fonction déployée
  est conservée à ces deux conversions près ; transaction obligatoire, délais
  bornés, corps inattendu refusé, réapplication sûre, pas de retour au SQL cassé.
  Aucun changement de commission (5 %), plafond de dette (25 jetons), origine des
  jetons débitables, montant ou solde.
- L'outil local `src/database/repair-local-publication-uuid.ts` reconnaît maintenant
  les deux réparations 57/58, vérifie chaque définition et refuse toute autre
  migration en attente. **Migration 58 effectivement appliquée au backend local**,
  puis relecture : aucune migration restante, trois conversions UUID présentes
  dans les deux fonctions. Aucune donnée métier modifiée et aucune opération
  en production ; les anciens trajets incomplets attendent l'accord de l'utilisateur.
- Protection des nouvelles tentatives : `src/trips/cancel-empty-request-trip.ts`,
  `src/trips/trips.service.ts` et `src/trip-requests/trip-requests.service.ts`.
  En cas d'échec de création de réservation, annulation compensatoire limitée au
  trajet privé provisoire de la demande et du conducteur concernés, encore
  `upcoming` et sans aucune réservation. Verrou de ligne et nouvelle lecture
  READ COMMITTED avant décision ; une réservation déjà enregistrée est préservée,
  y compris après réponse HTTP ambiguë. Erreur initiale conservée si le nettoyage
  échoue ; invalidation des caches serveur après compensation réussie.
  Les trajets publics, d'autres conducteurs/demandes, démarrés ou réservés ne sont
  pas annulés par ce mécanisme. Ce n'est pas une transaction globale couvrant tout
  le parcours : les erreurs ultérieures à la création de réservation et les
  indisponibilités empêchant la compensation nécessitent toujours réconciliation.
- Mobile : `store/api/tripRequestApi.ts` retire la demande des disponibilités et
  actualise les caches personnel/détail uniquement après confirmation serveur.
  `store/api/tripApi.ts` actualise les trois caches du trajet après démarrage
  confirmé, en conservant les informations financières de l'activité. Les
  invalidations/refetch existants restent actifs ; aucun polling supplémentaire,
  aucune disparition optimiste sur simple clic, aucune écriture d'une ancienne
  session dans la nouvelle. `hooks/home/useHomeRequestHighlight.ts` cherche la
  première demande réellement disponible, sans rester bloqué sur une entrée
  acceptée, liée, expirée ou appartenant au conducteur en tête de liste.
- Vérifications : **158 tests mobiles ciblés réussis**, dont six tests des vrais
  endpoints RTK Query avec transport simulé (succès, échec, changement de session,
  refetch lent) et un test supplémentaire du filtre Home. **43 tests unitaires
  serveur réussis**, dont migration 58 et compensation sur les deux parcours.
  **PostgreSQL 18 temporaire : 94 réussis, 3 ignorés** ; reproduction de 42883,
  création/acceptation/fin de réservation cash après réparation, transfert sans
  double réserve, compensation ciblée et réservation concurrente conservée.
  Le premier essai a révélé un ancien plan PL/pgSQL dans la fixture après son
  changement de type : recompilation de la fonction de test, sans modifier les
  colonnes applicatives. Les clusters jetables ont été nettoyés par le harness.
- Typage mobile et serveur de production sans émission vérifié ; lint des fichiers
  mobiles touchés sans erreur ni avertissement et contrôle des différences réussi.
  Les essais
  JavaScript et PostgreSQL ne constituent pas un essai natif : aucun trajet réel
  accepté/démarré à la place de l'utilisateur, aucun test physique iOS/Android.
  Recharger le client et relancer le backend s'il ne surveille pas les sources ;
  pas de nouvelle dépendance ni de modification native exigeant un nouveau build.
  Vérifier ensuite : acceptation réussie → disparition de la demande disponible ;
  démarrage réussi → trajet en cours ; échec réseau → aucune fausse confirmation.
  Voir aussi `../zwanga-backend/docs/finance/CHANGELOG.md`.

## 8 octobre 2026 — Acceptation d'une demande : comparaison UUID corrigée

- Problème confirmé : `POST /trip-requests/:id/accept` échouait avec HTTP 500
  pendant la création du trajet privé. Le trigger `zwanga_publication_cash_guard`
  comparait `trip_requests.id` (UUID) à `trips.tripRequestId` (varchar), provoquant
  l'erreur PostgreSQL 42883. Le trajet ne pouvait pas atteindre l'étape de démarrage.
- Backend : nouvelle migration `1780000057000-FixPublicationRequestUuid.ts`,
  référencée dans `src/database/migrations/index.ts`. Elle lit la fonction installée
  et ajoute seulement `::uuid` à l'identifiant reçu ; elle conserve sa définition
  restante et refuse une forme inattendue. Les anciennes migrations ne sont pas
  réécrites ; une base neuve reçoit le correctif en fin de chaîne.
- Précautions PostgreSQL : migration transactionnelle, délais bornés, conversion
  du paramètre plutôt que de la colonne indexée ; aucun changement de type de
  colonne, de taux (5 %), de plafond de dette (25 jetons), de réserve ou de solde.
  Le rollback refuse de réintroduire la comparaison défectueuse.
- Outil `src/database/repair-local-publication-uuid.ts` : diagnostic en lecture
  seule par défaut ; application explicite uniquement en développement sur une
  adresse locale. Refus de migrations supplémentaires en attente, verrou sur le
  journal des migrations, vérification que la fonction ne change que par ce cast,
  puis enregistrement atomique de la migration.
- **Application effective :** après confirmation du backend local par l'utilisateur,
  configuration locale/non-production vérifiée sans exposer ses valeurs. La migration
  a été appliquée et enregistrée sur cette base. Relecture : aucune migration en
  attente, ancienne comparaison absente, conversion UUID présente. Aucun trajet,
  réservation, portefeuille ni compte modifié ; aucune opération en production.
- Tests : `src/database/publication-request-uuid.spec.ts` — 3 tests unitaires
  réussis. `test/publication-request-uuid-postgres.ts`, intégré à
  `src/database/driver-finance-postgres.spec.ts` — reproduction réelle de 42883
  puis création réussie après migration, invariance des soldes, réapplication,
  plafond cash, paiement électronique, politique inactive et réserve dispatch
  existante. Suite PostgreSQL 18 isolée : **88 réussis, 3 ignorés** ; compilation
  TypeScript serveur de production sans émission réussie.
- Limites distinguées : le premier lancement du cluster temporaire était bloqué
  dans le bac à sable ; relance autorisée hors bac à sable, sans utiliser la base
  applicative. La fixture a dû invalider son ancien plan PL/pgSQL après changement
  de type de test. La base applicative ne subit aucun changement de type. Les
  clusters temporaires de test ont été nettoyés par leur harness (données jetables).
  Aucun trajet réel accepté/démarré à la place de l'utilisateur, ni test physique
  iOS/Android ; l'utilisateur peut maintenant réessayer sur le backend local.
- Aucun changement mobile ni nouveau build requis pour cette correction SQL.
  Pour la production : livraison du backend contenant la migration et application
  via la procédure habituelle, non exécutées ici. Voir aussi le journal backend
  `../zwanga-backend/docs/finance/CHANGELOG.md`.

## 8 octobre 2026 — Sonnerie longue après acceptation d'une demande

- Problème : la confirmation reçue par le passager utilisait le son standard,
  contrairement aux invitations ciblées au conducteur ; compatibilité sonore et
  réservations étaient liées au drapeau d'allocation de proximité.
- Backend : son dédié de 29 secondes pour `trip_request_accepted` sur installations
  compatibles, canal Android prioritaire et interruption iOS `time-sensitive`.
  Enregistrement de compatibilité indépendant du rôle/drapeau ; actions conducteur
  réservées aux invitations. Les annonces générales gardent le son standard.
- Mobile : évite qu'une confirmation distante soit rejouée en notification locale
  standard. Conserve les actions conducteur, la navigation, le canal et les réglages
  utilisateur existants. Aucune dépendance ni mutation métier ajoutée.
- Vérifications : 41 tests mobiles ciblés, 86 tests backend notifications et
  typage mobile/serveur de production réussis. Typage global des tests backend en
  échec dans des fichiers non modifiés ; détails et deux avertissements lint
  préexistants consignés dans le rapport. Aucun push réel ni test sonore physique.
- Fichiers, précautions, compatibilité, commandes de build et recette :
  [Sonneries des demandes](SONNERIES_DEMANDES_2026_10_08.md).
  Aucun déploiement ni migration exécuté ; mise en service du backend et du client
  nécessaire. Nouveau build natif indispensable si le binaire n'embarque pas le son.

## 7 octobre 2026 — Correctifs après audit de stabilité production

- Périmètre : parcours de réservation, aperçus d'itinéraires, événements socket
  et contrôles de compilation natifs. Solution, fichiers et recette détaillés dans
  [les correctifs de stabilité](CORRECTIFS_STABILITE_PRODUCTION_2026_10_07.md).
- Appliqué : arbitrage commun des modaux de fiche trajet, suppression des délais
  d'ouverture du sélecteur de réservation, protection de la navigation contre
  les doubles appuis et hors focus, conservation de `onShow` pour activer la carte.
  Validation/bornage des polylines et calcul des bornes sans grands tableaux
  d'arguments ; filtrage des positions/messages socket et isolation des abonnés.
- Compilation : contrôle de toutes les bibliothèques ELF et de leur alignement,
  contrôle ZIP des APK ; ajout d'un contrôle des Pods/phase Crashlytics iOS après
  installation dans EAS. Aucun nouveau paquet. Aucun fichier généré iOS inventé.
- Conservé : fonctionnement métier de réservation, tarification/paiements,
  cache réseau et abonnements partagés. Aucun backend, compte, déploiement,
  migration ni opération financière modifié ; travaux préexistants conservés.
- Vérifications finales : **1 520 tests JavaScript réussis** avec
  `node --test --test-concurrency=4 tests/*.test.js` ; TypeScript sans émission et
  ESLint sur les sources TypeScript touchées réussis. Frontière réseau, contrôle
  des 1 042 sources (aucune au-dessus de 400 lignes), configuration Gradle
  Crashlytics et `git diff --check` réussis.
- Incidents de vérification distingués : un ancien message simulé incomplet a
  été remis au format réel dans `performancePolicy.test.js`. Une exécution très
  parallèle a aussi fait échouer l'assertion temporelle existante de
  `displayReadRecovery.test.js` (polling à 20 ms) ; ce test, non modifié, réussit
  isolément et dans la suite à concurrence limitée. Cela n'établit pas la cause
  d'un incident réseau en production et sa sensibilité à la charge reste à noter.
- Contrôles natifs statiques : l'APK debug local existant passe ELF/ZIP avec
  `--abis=x86_64`. Le contrôle iOS détecte les Pods et la phase absents dans les
  fichiers locaux non synchronisés ; `pod install` sur macOS/EAS puis contrôle
  d'une archive release restent nécessaires. Aucun nouveau build ni essai physique
  réalisé ; aucune disparition des crashs, chauffe ou lenteurs natives annoncée.

## 7 octobre 2026 — Audit final performance et stabilité iOS/Android

- Périmètre : revue des parcours mobiles et des risques de crash en production,
  sans modification du fonctionnement ni déploiement.
- Rapport ajouté : [Audit de stabilité production](AUDIT_STABILITE_PRODUCTION_2026_10_07.md).
  Il distingue transitions de modaux à sécuriser, limites des itinéraires,
  validation des événements socket et contrôles natifs release à compléter.
- Vérifications : 1 507 tests JavaScript réussis, TypeScript et contrôleurs réseau,
  taille des sources et configuration Gradle Crashlytics réussis. Probes synthétiques
  sur les vrais modules et benchmarks géométriques Node détaillés dans le rapport.
- Précautions : changements préexistants conservés ; aucun compte, backend ou
  binaire store modifié. Les propositions ne sont pas des correctifs appliqués.
  Aucun crash natif reproduit ni gain de chauffe/batterie revendiqué ; essais
  physiques release et analyse de rapports de production restent nécessaires.

## 7 octobre 2026 — Contrat financier compatible avec les versions stores

- Problème : le build Android 145 / code iOS correspondant ignore les réserves cash, tandis que le code mobile actuel les déduit déjà du solde affiché. Projeter un solde disponible pour tous les clients ferait déduire les réserves deux fois dans la nouvelle app.
- `store/api/baseApi.ts` annonce désormais `X-Zwanga-Finance-Contract: 2` sur ses requêtes, y compris après renouvellement de session. Le backend conserve alors le contrat moderne (soldes totaux et réserves explicites). Sans cet en-tête, il projette un solde disponible pour les anciennes applications, sans modifier les soldes enregistrés.
- Aucun écran, endpoint, montant, mode de paiement ou mécanisme d'authentification supprimé. La nouvelle app fonctionne aussi avec l'ancien serveur, qui ignore cet en-tête. Aucune publication store/OTA effectuée.
- Tests : `financeContractHeader.test.js` exécute le vrai module avec transport simulé et vérifie l'en-tête, l'authentification et la conservation des autres en-têtes ; 24 tests ciblés contrat/session réussis. Contrôle TypeScript mobile réussi. Aucun test de binaire store sur téléphone, aucune connexion réelle à un fournisseur financier.
- Procédure de transition et limites : `../zwanga-backend/infra-aws/docs/CHANGELOG.md` et `../zwanga-backend/docs/finance/CHANGELOG.md` dans le dépôt backend. L'activation des règles est contrôlée par le serveur, jamais par cet en-tête client.

## 7 octobre 2026 — Diagnostic de dette cash depuis l'émulateur

**Demande :** vérifier pourquoi une dette cash reste affichée malgré un solde de
jetons positif sur le compte déjà connecté. Aucun changement fonctionnel appliqué
pendant ce diagnostic.

**Contrôles réellement réalisés :** lecture de l'écran de publication Android
par ADB, puis actualisation authentifiée des lectures existantes `getMyWallet` et
`driverFinanceSummary` depuis le runtime de développement, sans extraire les tokens.
Seuls des champs financiers ciblés ont été consultés ; aucune identité ni valeur
de compte n'est consignée ici. Les deux réponses sont réussies, mais le serveur
conserve `purchasedTokensOnly: true` et calcule la capacité cash sur les jetons
retirables uniquement. Le rafraîchissement ne change pas cette réponse.

**Constat :** l'émulateur utilise un backend du réseau local qui expose encore
l'ancienne règle. Le code source local de `driver-finance.service.ts` contient
la nouvelle règle, alors que sa version dans `dist` conserve l'ancien calcul et
`purchasedTokensOnly: true`. L'écart ne provient donc pas uniquement du cache mobile.

**Limites et suite :** le contenu de la table des migrations de la base utilisée
n'a pas été inspecté. Il reste à identifier/vérifier cette base, compiler et
redémarrer le backend correspondant, et vérifier l'application de la migration
financière 1780000055000 avant une nouvelle recette. Ne pas présumer qu'un backend
local utilise une base de test. Aucun débit, recharge, régularisation manuelle,
migration, redémarrage serveur ou déploiement effectué. Le script de diagnostic
temporaire et le dump UI temporaire de l'émulateur ont été supprimés.

## 7 octobre 2026 — Portefeuille : suppression de la carte « Réserve cash »

**Problème :** après ouverture du paiement des commissions à tous les jetons,
la carte séparée répétait le solde et le bouton « Recharger », donnant l'impression
d'un second portefeuille. Son état de lecture indisponible pouvait être confondu
avec un manque de jetons.

**Solution appliquée :**

- `app/wallet.tsx` ne monte plus cette carte. Le composant devenu inutilisé
  `features/driver-payments/DriverCommissionPanel.tsx` est supprimé.
- `features/wallet/WalletOverview.tsx` et `WalletOverview.styles.ts` regroupent
  l'information dans le bloc du solde : les jetons réservés restent dans « Détails »,
  même si l'API ne propose pas les retraits. Une alerte sans carte ni bouton
  supplémentaire indique une commission due, en jetons et FC si le serveur fournit
  le montant ou la conversion. Aucun message d'alerte pour une dette nulle/inconnue.
- `hooks/wallet/useWalletCashDebt.ts` remplace la lecture de l'ancien panneau,
  uniquement pour le conducteur actif et connecté au réseau. Il utilise `currentData`
  et ne présente pas de dette périmée pendant un chargement, une erreur ou un changement
  de compte. L'absence d'alerte n'est pas présentée comme une autorisation de cash.
- `hooks/wallet/useWalletController.tsx` intègre cette lecture à l'actualisation
  existante du portefeuille. Le rafraîchissement financier est protégé contre les
  callbacks tardifs après changement de compte ou sortie d'écran. Aucun polling ajouté.

Le skill d'interface a guidé la suppression de la carte redondante et le maintien
d'un seul ensemble d'actions, avec détails dépliables et sans nouveau modal,
dépendance ou animation décorative.

**Conservé :** recharge, partage, retrait, paiement Pro, liens vers les revenus et
historique, protections des modaux et idempotence des paiements. Aucun changement
backend : réserves réelles, prélèvement, taux de 5 %, dette et blocages restent
contrôlés par le serveur. Les messages d'erreur ne déclenchent ni dette fictive ni
invitation supplémentaire à recharger.

**Vérifications :** 43 tests JavaScript ciblés réussis (`walletCashDebt`,
`walletCompactOverview`, `walletSheetKeyboard`, `walletQueryReliability`,
`walletWithdrawal`). Les anciens tests du panneau retiré sont remplacés par ceux
de la lecture de dette et du solde compact. TypeScript, ESLint ciblé, contrôle de
taille des sources et `git diff --check` validés.
Suite JavaScript complète : **1 506/1 506 tests réussis**, aucun test ignoré
(`node --test --test-reporter=tap --test-concurrency=4 tests/*.test.js`).

**Limites :** pas d'essai sur appareil physique, de paiement réel ou de déploiement.
Recette iOS/Android à réaliser : solde sans dette, dette puis régularisation,
réseau indisponible, actualisation, détails avec réserve et saisie des trois modaux.
Les migrations financières préparées précédemment restent à déployer séparément
avec les précautions déjà documentées ; cette simplification ne les active pas.

## 7 octobre 2026 — Commission cash payable avec tous les jetons

La réserve et le prélèvement cash excluaient les bonus. Le backend prend désormais
toutes les origines de jetons en compte, bonus d'abord, sans les rendre retirables.
Commission **5 %**, plafond de dette **25 jetons**, blocage du nouveau cash en cas de
dette et exception de fin de course déjà embarquée conservés. Les nouveaux crédits
peuvent aussi régulariser le dû, sans exiger une recharge achetée.

Migration en avant `1780000055000-CashCommissionAllTokenOrigins`, traçage de la part
retirable débitée/remboursée, protection des réserves contre les autres débits,
projections serveur et affichages/formulaire de retrait mobile adaptés. La démarche
PostgreSQL a guidé le verrouillage cohérent et la préservation de l'historique.

Fichiers, règles, tests, limites et précautions de déploiement dans
[Commission cash et dette — toutes origines](CASH_COMMISSION_CREDIT.md#extension-à-toutes-les-origines--7-octobre-2026).
Vérifications ciblées : **34 tests mobile**, **134 tests unitaires backend** et
**73 tests PostgreSQL isolés** réussis (3 diagnostics historiques opt-in ignorés).
Suite mobile complète : **1 504/1 504 réussis**, puis tests ciblés relancés après
harmonisation finale des messages de régularisation.
TypeScript mobile/backend applicatif, ESLint ciblé et contrôles de diff réussis.
Aucune activation en production, paiement réel ou validation sur téléphone.

## 7 octobre 2026 — Suivi passager compact et carte dégagée

**Problème et périmètre :** sur le suivi d'une réservation passager, l'en-tête et
le panneau inférieur superposés occupaient presque toute la carte. L'attente de
position et le suivi étaient répétés dans plusieurs blocs ; la distance du trajet
pouvait être interprétée comme la distance du conducteur avant embarquement.

**Solution appliquée :**

- `app/booking/navigate/[id].tsx`, `PassengerNavigationMap.tsx` et
  `usePassengerNavigationCamera.ts` : en-tête, carte et panneau disposés dans le
  flux normal, avec cadrage adapté à la surface de carte réellement disponible.
  En-tête plafonné à 40 % de la hauteur de fenêtre, panneau à 36 % replié et 50 %
  déplié ; défilement interne de secours pour les petits écrans et grandes polices.
  Ces proportions sont des contraintes de mise en page, pas des mesures sur appareil.
- `features/passenger-navigation/PassengerNavigationHeader.tsx` et
  `PassengerPickupEstimateBanner.tsx` : intitulés courts, estimation compacte et
  explication complète accessible au lecteur d'écran. « Connecté » distingue la
  connexion socket de la fraîcheur GPS. Contact, SOS et partage restent accessibles.
- `components/trip/TripShareAction.tsx` et
  `features/navigation/NavigationAssistanceButtons.tsx` : variante en ligne,
  optionnelle, sans modifier la présentation par défaut des autres écrans.
- `features/passenger-navigation/PassengerNavigationInfoCard.tsx` : confirmation
  principale conservée ; destination synthétique puis « Détails » pour afficher
  l'itinéraire complet, l'heure de position et l'annulation. Suppression des blocs
  redondants de suivi/attente/détection et de la distance du trajet avant embarquement.
  Les statistiques restent disponibles pendant le trajet.
- Nouveau `features/passenger-navigation/PassengerMapControls.tsx` : trois commandes
  principales (agrandir, cadrer l'itinéraire, outils), puis position passager,
  conducteur et actualisation dans les outils dépliables. Cibles principales de
  44 points minimum et états d'accessibilité explicites.
- `features/ride-recovery/RideRecoveryControl.tsx` : variante `condensed` réduisant
  les espacements et l'aide générique, sans raccourcir les messages importants de
  confirmation en attente, de désaccord ou de synchronisation.

Le skill d'interface a guidé la priorité donnée à la carte, la réduction du texte
répétitif et l'affichage des informations secondaires à la demande, sans nouvelle
dépendance ni animation décorative.

**Comportements conservés et précautions :** double confirmation conducteur/passager,
détection automatique, reprise hors connexion, contrôles serveur, modaux de résultat,
contact, SOS, partage, blocages pendant les requêtes et confirmation d'annulation.
Les demandes d'interruption et l'avis de trajet en pause ne dépendent pas de
l'ouverture des détails. Aucune requête, souscription GPS ou boucle réseau ajoutée ;
aucune modification backend ou native.

**Vérifications :** 56/56 tests JavaScript ciblés réussis (`passengerNavigationCompact`,
`passengerPickupEstimate`, `passengerDriverInterruption`, `arrivalTerminology`,
`navigationCamera`, `navigationHeaders`, `navigationAssistance`, `tripShareAction`).
Les tests couvrent le dépliage, les actions préservées, les états occupés, les outils
de carte et l'absence de distance trompeuse avant embarquement. Les 24 tests de
`rideRecoveryUI` passent également, dont une nouvelle régression vérifiant les deux
étapes en mode compact et le reçu local hors connexion. TypeScript (`tsc --noEmit`),
ESLint ciblé, contrôle des tailles de sources et `git diff --check` réussis.
Suite JavaScript complète : **1 502/1 502 réussis**, aucun échec ni test ignoré
(`node --test --test-reporter=tap --test-concurrency=4 tests/*.test.js`).

**Limites :** aucun essai visuel natif ou sur appareil physique effectué. À vérifier
sur iOS et Android : petit écran, grandes polices, paysage, détails et carte agrandie,
position absente, confirmations en attente, interruption et hors connexion. Les tests
JavaScript ne mesurent ni les performances natives ni la surface de carte affichée.

Ce journal commence le 22 septembre 2026. Chaque nouvelle modification doit
décrire le problème, la solution appliquée, les fichiers concernés et la validation.
Il ne prétend pas reconstituer les interventions antérieures non documentées.

Documents complémentaires déjà présents :

- [Caméra de navigation et consommation GPS](NAVIGATION_CAMERA_AND_GPS.md)
- [Réduction du travail des écrans inactifs](SCREEN_IDLE_PERFORMANCE.md)
- [Contrat backend du profil et du parcours conducteur](../../zwanga-backend/docs/auth/profile-state.md)

## 7 octobre 2026 — Notifications des transferts de jetons

- Problème : les confirmations backend de transfert existaient, mais leur clic n'ouvrait pas le portefeuille et ne rafraîchissait pas son cache.
- `utils/notificationNavigation.ts` : `wallet_transfer_in` et `wallet_transfer_out` ouvrent `/wallet`, y compris pour les payloads imbriquées. `components/NotificationHandler.tsx` invalide le cache `Wallet` à la réception au premier plan et à l'ouverture du push.
- `tests/notificationNavigation.test.js` couvre les deux destinataires et la priorité du portefeuille sur un éventuel identifiant de trajet. Les autres routes, le bonus de bienvenue et les règles de transfert sont conservés.
- Backend : messages corrélés par `transferId`, confirmation expéditeur/destinataire après commit, cron existant de bienvenue donnant priorité aux conducteurs déjà inscrits et éligibles, sans second bonus. [Détails et activation](../../zwanga-backend/docs/finance/CHANGELOG.md).
- Vérification : **17 tests JavaScript de navigation réussis**, contrôle TypeScript mobile réussi ; aucun push réel, essai sur appareil ou déploiement store effectué. Les 117 tests backend ciblés, incluant les clusters PostgreSQL temporaires, valident les crédits et leur outbox avec transport push simulé.

## 7 octobre 2026 — Commission cash à 5 % et tolérance de dette

**Problème et périmètre :** la réserve devait couvrir entièrement la commission
avant acceptation ; la publication ne prévisualisait qu’une place. Le taux reste
bien **5 %**, conformément à la correction de l’utilisateur, et non 15 %.

**Solution appliquée :** calcul pour toutes les places proposées, tolérance de
25 jetons (2 500 FC), refus de tout nouveau cash dès qu’une dette existe,
régularisation par les crédits de jetons achetés. Contrôles PostgreSQL sérialisés,
réservation dès la sélection d’un conducteur par dispatch, transfert sans double
réservation vers le booking, estimation et avertissement dans le mobile.
La démarche PostgreSQL a guidé les verrous portefeuille/commission et l’absence
d’appels réseau dans ces transactions.

Fichiers, règles conservées, tests, limites et procédure de déploiement détaillés
dans [Commission cash et dette](CASH_COMMISSION_CREDIT.md). Migration préparée
dans le backend local ; aucune migration appliquée à une base applicative.

## 7 octobre 2026 — Accès au paiement Pro depuis les jetons

**Périmètre et problème :** l’écran « Jetons Zwanga » ne proposait pas d’accès
direct au paiement de l’abonnement conducteur Pro.

**Solution appliquée :** ajout du bouton « Payer l’abonnement Pro » sous les trois
actions du solde, visible pour les comptes conducteurs. Il ouvre directement
`/subscriptions/payment` avec `router.navigate`, sans détour par le profil et sans
déclencher de mutation de paiement. Fichiers : `app/wallet.tsx`,
`features/wallet/WalletOverview.tsx` et `WalletOverview.styles.ts`.
Le skill d’interface a guidé un accès compact, une seule ligne de texte et une
cible tactile d’au moins 48 points, sans ajouter de carte explicative ou de requête.

**Comportements conservés :** recharge, partage et retrait inchangés ; aucun accès
Pro ajouté au portefeuille passager. Le parcours de paiement existant conserve le
choix du moyen de paiement, la confirmation explicite, les vérifications du solde
et de l’abonnement, ainsi que la reprise d’une référence en cours. Aucun prix ou
statut d’abonnement n’est inventé sur cet écran. Une lecture du portefeuille
indisponible ne masque pas le raccourci : les contrôles restent dans le paiement.
Aucune modification backend, dépendance ou configuration native.

**Vérifications :** 25/25 tests JavaScript ciblés réussis
(`walletCompactOverview`, `walletSheetKeyboard`, `walletQueryReliability`), dont
deux nouveaux tests du raccourci, de sa visibilité et de l’absence de paiement au
montage. TypeScript (`tsc --noEmit`), ESLint sur les fichiers applicatifs modifiés,
contrôle des tailles de sources et `git diff --check` réussis. Pas de paiement réel ni d’essai
sur appareil physique ; vérifier sur iOS/Android l’ouverture depuis les jetons,
le retour au portefeuille et le comportement avec abonnement déjà actif.

## 7 octobre 2026 — Confirmation du bonus de bienvenue

Périmètre : notification du nouveau bonus backend de 50 jetons, réservé aux comptes actifs dont le dernier KYC est approuvé. Le crédit ne dépend pas d'une mise à jour mobile.

- `utils/notificationNavigation.ts` : le message `wallet_loyalty_reward` portant `relatedEntityType=welcome_bonus` ouvre le portefeuille, pour une payload directe ou imbriquée. Les autres notifications de fidélité conservent leur navigation existante.
- `components/NotificationHandler.tsx` : la réception au premier plan et l'ouverture du push invalident le cache `Wallet` pour recharger le solde et l'historique. Aucun rafraîchissement supplémentaire pour les autres événements.
- L'historique portefeuille affiche déjà la description backend « Bonus de bienvenue : KYC et compte validés » et le montant crédité. Le type d'écriture existant est conservé pour les versions publiées. Les jetons offerts ne deviennent pas retirables ni utilisables comme réserve de commission cash achetée.
- `tests/notificationNavigation.test.js` : test de la nouvelle destination et de la conservation du routage fidélité ordinaire. Documentation du crédit unique, du rattrapage des comptes existants et du déploiement : [journal financier backend](../../zwanga-backend/docs/finance/CHANGELOG.md).
- Validation : **16 tests JavaScript de navigation réussis**, contrôle TypeScript mobile réussi. Aucun test sur appareil physique, aucun push réel, aucune publication store. Le raccourci au clic nécessite cette version mobile ; le crédit et le texte push restent utilisables par les anciennes versions.

## 7 octobre 2026 — Correctifs de l’audit : sessions, parrainage, réseau et push

**Périmètre et problème :** mise en œuvre des corrections du
[rapport d’audit du 7 octobre](AUDIT_PERFORMANCE_SECURITE_FIABILITE_2026_10_07.md)
dans le mobile et le backend local `zwanga-backend`. Les modifications backend
préexistantes ont été conservées. Aucun déploiement ni accès à la base applicative.
Les recommandations de sécurité ont guidé l’isolation entre comptes ; celles de
PostgreSQL ont guidé les transactions courtes, les verrous et les index partiels.

### Solutions effectivement appliquées

- **A01 — Propriétaire du push :** `src/users/users.service.ts` du backend détache
  les anciens propriétaires et leurs capacités conducteur/mises à jour avant de
  rattacher le jeton au compte courant, dans une transaction sérialisée entre
  instances par verrou consultatif PostgreSQL. Les identifiants push vides,
  non textuels, non ASCII imprimables ou dépassant 1 024 caractères sont refusés.
  `src/auth/auth.service.ts` efface aussi le push lors de la déconnexion serveur.
  `src/notifications/notifications.service.ts` relit le destinataire juste avant
  l’envoi, y compris pour les lots adressés à des comptes, avec concurrence limitée
  à cinq et transport Expo/FCM adapté. Les lots génériques sans identifiant de
  compte conservent leur ancien transport multicast.
  `services/driverNotifications.ts` ignore sur Android une invitation appartenant
  à un autre compte, une session terminée ou un refresh expiré ; un changement de
  session pendant la préparation empêche l’affichage. Ce filtre JavaScript ne peut
  pas retirer un push déjà livré nativement par APNs sur iOS.
- **A02 — Erreurs de session :** ajout de `src/auth/session-error.ts`, utilisé par
  le refresh et `src/auth/strategies/jwt.strategy.ts`. Les erreurs JWT restent des
  refus 401 ; les erreurs HTTP métier restent inchangées ; une panne technique
  devient une erreur temporaire 503, sans détail interne exposé au client.
- **A03 — Activation des actions push :** extraction de l’effet d’`AuthGuard.tsx`
  vers `hooks/auth/usePushRegistration.ts`. L’enregistrement du jeton et celui des
  capacités interactives ont des états de réussite séparés. Un échec natif,
  réseau ou une réponse `registered: false` reste réessayable. Les reprises sont
  espacées d’une minute, uniquement au premier plan avec connexion ; retour au
  premier plan/reconnexion et rotation de jeton sont pris en compte. Les mutations
  de capacité sont libérées et les résultats d’une ancienne session ignorés.
  `services/pushNotifications.ts` permet de vérifier les permissions sans les
  redemander lors de chaque reprise. Ni connexion ni push ordinaire ne sont bloqués
  par une capacité indisponible sur un ancien backend.
- **A04 — Déconnexion durable :** `services/logoutIntent.ts` conserve une intention
  locale sans jeton ni donnée personnelle avant le nettoyage SecureStore.
  `services/tokenStorage.ts` refuse de restaurer l’ancien compte au redémarrage
  tant que le nettoyage reste incomplet. Un refresh ne peut pas annuler cette
  intention ; une nouvelle connexion complète le peut. Si ni l’intention ni les
  suppressions ne peuvent être écrites, la fonction signale explicitement l’échec
  au lieu de prétendre avoir réalisé une déconnexion durable.
- **A05 — Parrainage :** `utils/referralAttribution.ts` sépare les invitations
  anonymes et celles de chaque compte. `components/ReferralAttributionHandler.tsx`
  capture le compte lors de l’ouverture du lien et ne rattache pas à B un lien
  reçu par A hors ligne ou dont la résolution était encore en cours. Une invitation
  anonyme peut être adoptée une fois après connexion. La date de capture, la
  première invitation, la reprise réseau et la décision finale du serveur sont
  conservées. Une consommation tardive ne supprime plus une invitation différente.
  `hooks/auth/useRegistrationActions.ts` ne consomme rien en l’absence de jeton de
  parrainage effectivement utilisé.
- **A06 — Réservations :** le subscriber
  `src/notifications/transactional-notifications.subscriber.ts` enregistre l’alerte
  d’une nouvelle réservation en attente dans la même transaction que l’insertion,
  avec clé d’événement unique. L’absence de jeton push ne fait plus perdre cette
  alerte. Suppression de l’ancien envoi HTTP synchrone et de sa méthode dans
  `src/bookings/bookings.service.ts`. Une réservation déjà acceptée et un trajet
  issu d’une demande assignée ne créent pas une seconde invitation. Le message
  push de réservation devient générique ; les détails restent dans le parcours
  authentifié. Avant toute livraison/reprise, le serveur contrôle que la réservation
  attend toujours une réponse et que le trajet appartient au destinataire et n’est
  pas terminé/annulé.
- **A07 — Lectures réseau :** `components/DriverPresenceCoordinator.tsx` suspend
  les lectures profil/statut et le timer de présence hors ligne ou en arrière-plan.
  L’effet dépend de l’identité/rôle stables, pas de tout l’objet profil.
  `features/publish/PublishPaymentModes.tsx` ne garde plus sa lecture financière
  active derrière le portefeuille ou hors ligne. Une vérification impossible
  n’est pas présentée comme un manque de réserve. Les choix déjà cochés restent
  retirables et la règle d’au moins un mode de paiement est conservée.
- **A08 — Priorité :** le dispatcher réserve une voie indépendante aux invitations
  conducteur, avec lot de dix, contrôle toutes les cinq secondes et priorité aux
  propositions de proximité. La voie ordinaire conserve ses lots de 25 ; les deux
  voies ne se réclament pas les mêmes lignes. Les envois ont lieu après libération
  des verrous `SKIP LOCKED`. Les échecs urgents attendent au moins 15 secondes avant
  reprise ; une prise en charge interrompue est récupérable après deux minutes.
  Une offre expirée/traitée est désactivée au lieu d’être sonnée tardivement. Le
  retry financier périodique exclut cette voie urgente. Ce mécanisme reste de type
  « au moins une fois », pas une garantie de réception ou d’unicité APNs/FCM.
- **Dépendance :** seul `shell-quote` passe de 1.10.0 à 1.12.0 dans
  `package-lock.json`, par mise à jour compatible, sans script d’installation ni
  nouvelle dépendance. Cette version inclut la correction décrite dans
  [l’avis du mainteneur](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv).
  Aucun `npm audit fix --force` ni changement majeur Expo/React Native.

### Migration ajoutée, non appliquée à la base applicative

Backend : `src/database/migrations/1780000051000-HardenPushOwnershipAndPriority.ts`,
enregistrée dans `src/database/migrations/index.ts`, avec les index correspondants
sur les entités `User` et `Notification`.

La migration retire les associations push historiquement ambiguës pour **tous**
leurs détenteurs, sans choisir arbitrairement un compte, nettoie les capacités
devenues inactives et crée un index unique partiel sur les jetons push non nuls.
Elle ajoute aussi un index partiel de file urgente. Les comptes, réservations et
transactions financières ne sont pas supprimés. Les appareils concernés doivent
réenregistrer leur jeton en relançant l’app ; un rollback des index ne restaure pas
les associations ambiguës. La durée des verrous sur les volumes de production n’a
pas été mesurée : prévoir sauvegarde, essai en préproduction et fenêtre adaptée.

### Vérifications et résultats

- Mobile : **1 490/1 490 tests JavaScript réussis**, concurrence quatre, environ
  138 secondes lors du dernier passage complet. Ajouts : persistance de déconnexion,
  changement de compte pendant un parrainage, pauses réseau/écran, reprise des
  capacités push et filtrage d’invitations Android. Les mocks existants ont été
  adaptés aux nouveaux hooks, sans supprimer leurs assertions fonctionnelles.
- Backend : **99/99 tests ciblés réussis** dans `session-error.spec.ts`,
  `push-ownership.spec.ts`, `notifications.service.spec.ts`,
  `transactional-notifications.subscriber.spec.ts` et `bookings.service.spec.ts`.
- PostgreSQL 18 : **19/19 tests d’intégration réussis** dans
  `transactional-notifications-postgres.spec.ts`, sur cluster neuf temporaire,
  loopback, données fictives, sans configuration applicative. Ils couvrent aussi
  transferts concurrents de jeton, contrainte unique, migration des doublons,
  priorité devant une file ordinaire et suppression d’une invitation annulée.
  Le cluster a été arrêté et ses seules données temporaires nettoyées par le test.
  Les transports push sont simulés ; aucun push utilisateur envoyé.
- TypeScript mobile et `tsc -p tsconfig.build.json --noEmit --incremental false`
  backend : réussis. Le typage backend global incluant tous les anciens tests
  reste en échec dans des fichiers hors correction (activity, keccel-otp, paiements,
  confidentialité des demandes, identité et fidélité). Ce n’est pas un build
  natif ni une validation exhaustive de tous les tests backend.
- ESLint des sources mobiles modifiées : aucune erreur ; avertissement préexistant
  sur l’import dynamique `require()` du repli Notifee conservé.
- Frontière réseau valide ; **1 037 sources**, aucune au-dessus de 400 lignes.
  `git diff --check` valide dans les deux dépôts.
- Nouvel audit npm mobile : **62 signalements** (23 modérés, 39 élevés, zéro critique),
  contre 63 auparavant ; ce total inclut des dépendances transitives d’outillage.
  Les 62 restants ne sont ni corrigés ni déclarés inoffensifs par cette intervention.

### Limites et suites différées

**A01 reste partiellement ouvert :** une déconnexion hors ligne ne peut pas notifier
le serveur immédiatement. Le nettoyage serveur et le transfert au prochain compte
sont corrigés, mais aucune file de révocation différée indépendante de la session
n’a été ajoutée. Il faudrait un justificatif limité à la révocation d’installation,
lié à une génération d’enregistrement, plutôt que conserver un ancien bearer après
déconnexion ou créer un endpoint public acceptant un simple jeton push. Une
notification déjà remise au système peut encore être visible ; les données iOS
affichées nativement ne sont pas filtrables par le contrôle Android ajouté ici.

Les anciennes invitations de parrainage non scindées par compte ne permettent pas
de reconstruire leur propriétaire historique ; elles restent traitées comme
anonymes pour préserver les inscriptions existantes. Une panne simultanée de tous
les stockages empêche toute garantie de persistance au-delà de la mort du processus.
Les mises à niveau majeures restantes nécessitent leur propre lot de compatibilité.

Pas d’essai physique iOS/Android, de mesure FPS/mémoire/chauffe ni de test APNs/FCM
en veille. Les temps de file, les quotas provider et la réception réelle en moins
de 30 secondes restent à mesurer. Le rollback réservation/outbox repose sur le
subscriber transactionnel et est testé en unité ; les nouveaux essais PostgreSQL
de file utilisent des événements insérés explicitement, pas un parcours HTTP de
réservation complet.

### Reproduction et mise en service

Mobile : `node --test --test-concurrency=4 tests/*.test.js`,
`node node_modules/typescript/bin/tsc --noEmit`, `npm.cmd run check:network` et
`npm.cmd run check:source-size`. Aucune dépendance native ni capability n’est ajoutée
ici. Recharger le JS d’un dev build existant compatible suffit pour ces essais ;
Expo Go ne valide pas les alertes natives. Pour la livraison store, faire les builds
habituels Android/iOS. Vérifier sur appareils réels les changements de compte,
la déconnexion hors ligne, le redémarrage, les invitations en veille et le retour
de réseau ; vérifier aussi que les demandes de permission ne se répètent pas.

Backend, après validation en préproduction et sauvegarde : `npm.cmd run build`,
puis `npm.cmd run migration:run:prod` sur **l’environnement explicitement choisi**,
et déployer les instances corrigées. Ces commandes de déploiement n’ont pas été
exécutées ici. Vérifier la migration 1780000051000, les métriques de file urgente
et le réenregistrement des appareils dont les associations étaient ambiguës.

## 7 octobre 2026 — Audit performance, sécurité et fiabilité

**Périmètre et problème :** nouvelle revue de l’application mobile et lecture ciblée
du backend local, notamment sessions, reprise réseau, parrainage et alertes conducteur.
Les changements préexistants et les corrections des audits antérieurs sont conservés.

**Travail effectué :** ajout du
[rapport d’audit](AUDIT_PERFORMANCE_SECURITE_FIABILITE_2026_10_07.md), avec huit
constats priorisés, fichiers et preuves, corrections proposées et limites. La revue
sécurité a guidé la vérification des frontières entre comptes et de l’invalidation
de session. Les règles de rédaction ont servi à séparer constats, reproductions et
recommandations. Aucun correctif fonctionnel, backend, dépendance ou migration
appliqué : seuls ce rapport et cette entrée sont ajoutés.

**Vérifications :** 1 478/1 478 tests JavaScript réussis avec concurrence limitée à
quatre ; TypeScript et contrôles de frontière réseau/taille des sources réussis.
Six scénarios supplémentaires reproduits en mémoire avec entrées fictives et
transports/dépôts simulés. L’audit npm retourne 63 signalements de paquets à trier,
dont de l’outillage transitif : ce n’est pas un décompte de failles exploitables
dans l’app. Aucune mise à niveau automatique. Pas de test physique iOS/Android,
de mesure de chauffe/FPS/mémoire native ni d’accès aux données de production.
Pas de lecture de `.env`, de secrets ou de données personnelles.

## 7 octobre 2026 — Réserve cash, modes de paiement et abonnement Pro

**Périmètre :** accompagner la nouvelle règle backend de commission de 5 %, Pro à
5 000 FC pour trente jours et essai de trente jours calendaires. Il faut distinguer
une recharge de commissions de l’achat Pro et ne pas proposer de dépenser des jetons
déjà réservés à une course cash.

**Solution appliquée :**

- `store/api/driverFinanceApi.ts` ajoute les lectures RTK Query des finances du
  conducteur et des modes disponibles par trajet/réservation. Le cache du résumé est
  séparé par compte ; les soldes du conducteur ne sont pas exposés au passager.
- `features/publish/PublishPaymentModes.tsx`, les hooks de publication et les étapes
  tarif/confirmation transmettent les modes acceptés, y compris pour les trajets
  récurrents. Un choix non vide est conservé. Le cash est proposé après vérification
  de la réserve ; les deux modes non cash sont proposés par défaut. L’affichage
  précise les 5 %, la réservation à l’acceptation et le besoin de recharge.
- Les détails du trajet montrent les modes déclarés. `TripBookingSteps` filtre les
  choix et `useTripBookingSubmission` revérifie la disponibilité avant envoi, avec
  verrou synchrone contre les doubles appuis. La vérification serveur à l’acceptation
  reste déterminante : un devis n’est pas une réservation de jetons.
- `ArrivalPaymentFields` utilise les modes autorisés par le backend, garde le choix
  accepté et désactive le cash non finançable. Aucun changement silencieux de mode,
  aucune relance de paiement prestataire et aucun nouveau modal natif.
- `DriverCommissionPanel` dans le portefeuille distingue jetons achetés disponibles,
  jetons réservés, capacité cash et dette éventuelle. L’historique nomme les débits et
  régularisations de commission. Les soldes utilisables pour payer Pro, un trajet ou
  effectuer un retrait excluent la réserve cash ; le mapping portefeuille conserve
  le nouveau champ, même lorsqu’il arrive comme chaîne décimale.
- Les écrans Pro précisent trente jours et l’absence d’exonération de commission.
  Les bonus d’abonnement existants restent des jetons non utilisables pour le cash.
  Les notifications de commission, recharge nécessaire et essai ouvrent le portefeuille.

**Préservé et limites :** montants/dates des paiements déjà initiés, reprise des
paiements, retraits existants, contrôles KYC, fidélité et gestes des formulaires.
Pas de désactivation globale du compte faute de réserve. Le plafond indépendant de
100 000 FC reste à arbitrer et n’est pas présenté comme une règle active. Le choix
des modes est ajouté à la publication ; l’éditeur mobile d’un trajet existant n’a
pas de nouveau sélecteur (l’API de modification l’accepte). La disponibilité d’une
simple proposition de dispatch n’immobilise pas de jetons. Pas de déploiement ni
de nouvelle dépendance native.

**Validation réelle :** 1 468/1 468 tests JavaScript réussis, dont les nouveaux tests
de choix cash, arrivée, mapping de réserve, cache des comptes et navigation des
notifications. Les fixtures des écrans existants simulent les nouveaux appels API.
TypeScript mobile réussi ; contrôle de 1 034 sources, aucune au-delà de 400 lignes ;
frontière réseau valide. Aucun test sur appareil physique ou paiement réel.

**Déploiement :** backend et migration financière obligatoires avant cette version
mobile ; une simple modification des variables AWS ne suffit pas. Contrat, calculs,
compatibilité et recette : [journal financier backend](../../zwanga-backend/docs/finance/CHANGELOG.md).

## 7 octobre 2026 — Publication et réserve cash : moins de texte, essentiels visibles

**Périmètre et problème :** l’étape « Détails » de publication plaçait un long bloc
de paiement avant les places et le prix ; le portefeuille affichait toutes les
explications cash/Pro avant l’historique. Deux captures utilisateur montraient une
forte occupation verticale et trop de défilement.

**Solutions appliquées :**

- `features/publish/PublishPricingStep.tsx` : places, prix par place et gratuité
  regroupés en tête. Suppression du titre redondant, des grandes cartes séparées,
  de la phrase d’information générique et de la navigation interne déjà masquée
  par les styles. `app/publish.tsx` conserve seul les boutons fixes Retour/Continuer.
- `PublishSeatSelector.tsx` : aide courte pour la capacité des motos, moins
  d’espace, boutons +/− conservés. Le champ prix rétrécit dans son conteneur sans
  déborder horizontalement, défaut identifié puis corrigé au rendu web.
- `PublishPaymentModes.tsx` : trois choix compacts, commission visible, conditions
  détaillées dépliables, recharge/actualisation conservées. Distinction entre
  réserve insuffisante, chargement et erreur réseau ; aucun message de recharge
  ne présente une panne de vérification comme une insuffisance de solde.
- `PublishPassengerOptions.tsx` : contrôle d’identité toujours accessible ; note
  facultative dépliable sans perte du texte. Une note existante s’ouvre au montage.
- `features/driver-payments/DriverCommissionPanel.tsx` : réserve cash, état serveur
  et recharge visibles ; couverture et informations Pro dans « Détails ». Jetons
  réservés non nuls et dette éventuelle restent visibles même repliés. Les conditions
  détaillées utilisent les valeurs de commission/prix/durée déjà retournées par
  l’API ; une date Pro absente n’est plus présentée comme une date invalide.
  `app/wallet.tsx` réinitialise le dépliage lors d’un changement de compte.

**Préservé et précautions :** aucun nouveau modal, paquet, endpoint, changement
de commission ou de calcul de réserve. Au moins un paiement reste sélectionné,
le cash non financé reste désactivé (mais retirable de la sélection), les limites
de places, la gratuité, l’identité et les payloads de publication ne changent pas.
Une erreur de réserve masque les anciens montants ; reprise réseau et pause des
lectures hors écran conservées. Le défilement reste disponible pour petits écrans,
clavier, textes agrandis et panneaux dépliés ; aucune promesse de « zéro scroll »
sur toutes les tailles.

**Vérifications :** 32 tests ciblés réussis, dont dix nouveaux cas dans
`tests/publishPricingLayout.test.js` et `tests/driverCommissionPanel.test.js`.
TypeScript et ESLint ciblés sans erreur ; frontière réseau et limite de taille
validées (1 035 sources, aucune au-delà de 400 lignes).
La première suite complète après les deux retouches donne 1 477/1 478 : échec
du test préexistant « display policy pauses offline/covered reads… » dans
`displayReadRecovery.test.js`. Sa relance isolée donne 3/3 réussis. Une sensibilité
aux temporisations sous charge est une hypothèse, pas une cause démontrée ; ni ce
test ni sa logique de réseau n’ont été modifiés dans cette intervention.
La relance complète avec `node --test --test-concurrency=4` termine ensuite à
**1 478/1 478 tests réussis** (101,8 s). `git diff --check` ciblé est également valide.

**Rendu visuel réel des composants via React Native Web, pas essais natifs :**
`scripts/preview-publish-pricing.cjs` et `scripts/preview-driver-commission.cjs`
génèrent des aperçus locaux avec données fictives sous `.expo/`. Captures Chrome
inspectées à 320, 360 et 411 pixels : aucun débordement horizontal après correction.
Publication repliée : aucun défilement vertical dans les scénarios 360×800 (cash
disponible) et 411×884 (réserve vide), 253 px restants sur 320×568. Réserve cash
seule, marges comprises : 230/255/299 px selon les états vide/disponible/dette.
Ces mesures ne valent ni comparaison chiffrée à l’ancienne UI ni validation native.
Recette iOS/Android restante : petites tailles et grandes polices, clavier numérique,
note multiligne, ouvrir/replier les détails, recharge et retour au formulaire.

## 7 octobre 2026 — Persistance des invitations de parrainage avant validation réseau

**Problème reproduit en JavaScript :** une erreur réseau lors de la première
résolution du jeton empêchait toute sauvegarde ; le retour en ligne ne reprenait
pas cette invitation. Cela concerne conducteurs et passagers. Le lien avec le
signalement précis en production n'est pas confirmé par des traces de production.

**Solution appliquée :** `utils/referralAttribution.ts` ajoute une attente durable
séparée des invitations déjà validées. `components/ReferralAttributionHandler.tsx`
enregistre avant l'appel réseau, promeut uniquement après validation serveur et
reprend au retour d'Internet, au premier plan, au démarrage et après authentification.
La file sérialise les traitements concurrents ; un échec d'analytics n'interrompt
plus l'attribution. Les erreurs de stockage ne sont pas présentées comme une
sauvegarde réussie. Aucun polling, nouvelle dépendance ou changement backend.

**Préservé :** jeton/date de capture d'origine, durée locale de trente jours,
priorité à la première invitation, protection des attributions différées déjà
consommées, session active et formulaire d'inscription en cours, validation
serveur et règles de gains. Les refus métier restent définitifs. Aucune donnée
de production modifiée ; les invitations anciennement perdues ne sont pas réparées.

**Tests et documentation :** `tests/referralPersistence.test.js` couvre la panne
initiale, la reconnexion, le redémarrage simulé, les deux rôles, le passage invité
→ connecté, les doublons, la concurrence, l'expiration et les erreurs serveur/
stockage/analytics. Il est ajouté à `test:referrals` dans `package.json`.
Vérifications : suite mobile complète **1 463/1 463 tests JavaScript réussis**,
dont **23 nouveaux tests de persistance** ; TypeScript sans erreur ; ESLint ciblé
sans erreur ni avertissement ; contrôle de taille (1 031 sources, aucune au-delà
de 400 lignes) et contrôle de frontière réseau réussis. Tests avec entrées
synthétiques, stockage et réseau simulés ; aucune mesure sur appareil physique.
Recette et limites : [Attribution mobile du parrainage](finance/REFERRAL_ATTRIBUTION_MOBILE.md).
Pas de test sur téléphone physique ni déploiement effectué : ne pas déduire des
tests JavaScript une validation native de ChottuLink ou une correction déjà en production.

## 7 octobre 2026 — Annulation conducteur et formulaire de motif sur iOS

**Signalement :** plantage sur iPhone lorsque le conducteur appuie sur l’annulation
d’une réservation ou d’un trajet, associé au modal de motif. Dans le code inspecté,
les annulations ouvrent une confirmation et le refus d’une réservation ouvre un
formulaire de motif. Les trois parcours ont été couverts sans modifier leur rôle.

**Constat vérifié dans le code :** « Gestion du trajet » n’avait pas de scope
d’affichage partagé. Ses formulaires `FormModal` et confirmations `DialogProvider`
pouvaient donc demander des présentations natives distinctes, contrairement à
la navigation déjà protégée. Le formulaire de motif n’avait pas de callback
`onRequestClose`. Les mutations d’annulation/refus n’avaient pas de verrou
synchrone contre deux appuis avant le prochain rendu.
Le conflit de présentation iOS est un **risque identifié**, pas une cause native
confirmée : aucun rapport de crash ni reproduction sur iPhone n’a été obtenu.

**Correctifs appliqués :**

- Scope `RideOverlayScope` propre à l’écran de gestion et lié à son activité :
  le motif, les confirmations et les autres panneaux de cette page utilisent le
  système de superposition React Native existant. Un seul panneau est interactif ;
  le changement d’écran désactive les panneaux de ce scope. Pas de nouvelle
  présentation UIKit pour ces modals lorsque le scope est actif.
- Fermeture explicite du formulaire via Retour/échappement, fermeture du clavier
  et nettoyage du motif après fermeture ou succès confirmé par le serveur.
- Verrous synchrones sur refus, annulation de réservation et annulation de trajet.
  Le passager ciblé et le motif ne sont pas réinitialisés pendant l’envoi du refus.
  Une erreur réseau conserve le motif, affiche l’erreur et autorise une nouvelle
  tentative ; un succès ferme le formulaire même si l’état de chargement change.
- Suppression d’un import inutilisé et regroupement des imports de types dans les
  fichiers concernés, sans changement de dépendance.

**Fichiers :** `app/trip/manage/[id].tsx`,
`hooks/manage-trip/useManageTripBookingActions.ts`,
`hooks/manage-trip/useManageTripActions.ts`,
`tests/manageTripCancellation.test.js`, `tests/rideOverlays.test.js`.

**Comportements conservés :** aucune annulation sans confirmation ; motif toujours
obligatoire pour un refus ; protection contre l’annulation d’un passager embarqué ;
appels API, contrôles serveur et notifications existants inchangés. Réconciliation
des refus/réservations déjà traités par le serveur sur connexion lente conservée.
Le retour à l’accueil après annulation de trajet n’intervient qu’après succès.
Les modals natifs des autres écrans, le démarrage et la navigation restent inchangés.
Pas de migration backend, de nouveau paquet ni de modification de configuration native.

**Vérifications :** suite JavaScript complète **1 440 tests réussis, 0 échec**,
dont 33 tests ciblés (annulation/refus, superpositions et transition de démarrage).
TypeScript sans émission réussi ; ESLint ciblé sans erreur ni avertissement ;
frontière réseau valide ; 1 031 sources contrôlées, aucune au-dessus de 400 lignes.
`git diff --check` sans erreur d’espacement sur les fichiers concernés.

**Recette native restante :** sur iPhone physique, ouvrir/fermer plusieurs fois
l’annulation d’une réservation et d’un trajet, vérifier Retour sans envoi, saisir
un motif puis confirmer, tester un double appui et une connexion coupée pendant
l’envoi. Tester aussi une alerte concurrente, le passage arrière-plan/premier plan
et le retour à l’accueil sans surface invisible bloquante. Refaire les scénarios
sur Android. Utiliser des comptes/trajets de test ; vérifier les résultats serveur.
Distribuer le JavaScript corrigé par le circuit habituel compatible ou un nouveau
build/TestFlight. Aucun test physique n’a été effectué ici et la disparition du
crash iOS ne peut pas encore être affirmée.

## 7 octobre 2026 — Modal utilisateur pour les mises à jour

**Problème :** confusion entre le back-office web de publication et l’application
mobile. Le besoin utilisateur est une alerte et une action simple vers la mise à jour.

**Appliqué :** remplacement du bandeau `AppUpdateBanner` par
`components/AppUpdatePrompt.tsx`, modal « Mise à jour disponible » avec nouveautés,
« Mettre à jour » et « Plus tard ». Ouverture directe du store du téléphone,
report 24 h, protection anti-double appui, erreur inline et nouvelle tentative.
Utilisation du système de superposition JS existant à priorité information :
pas de nouveau modal natif iOS, de nouveau paquet ou de suppression de la carte.
Le guide d’interface a orienté la présentation sobre et les actions séparées du
contenu défilable. L’ancienne prop `updateNotice` de `HomeHeader` est retirée.

**Préservé :** push et ciblage backend inchangés ; aucun écran administrateur mobile ;
back-office web séparé conservé. Report et protections trajet/alertes prioritaires
conservés. Le bouton ouvre le store, il ne promet pas une installation terminée.
Google Play In-App Updates (installation native intégrée Android) reste différé.

**Fichiers et recette :** `app/(tabs)/index.tsx`,
`components/home/HomeHeader.tsx`, `tests/appUpdates.test.js`,
`tests/homeForegroundLifecycle.test.js` et
[guide actualisé](APP_UPDATE_ANNOUNCEMENTS.md).

**Vérifications :** suite mobile complète **1 431 tests réussis, 0 échec**,
dont 19 tests ciblés et 10 tests du système de superposition ; TypeScript sans émission, ESLint ciblé,
frontière réseau et contrôle de taille des sources réussis. Essais physiques et
livraison réelle des push non effectués ; aucune affirmation de disparition des
crashs natifs.

## 7 octobre 2026 — Partage sécurité, SOS et annonces de mises à jour

**Problème :** formulation de sécurité trop technique et absence de parcours dédié
pour informer les utilisateurs d’une nouvelle version disponible.

**Appliqué :** texte simple de partage aux proches, SOS police inline avec choix
explicite du numéro et verrou anti-double appui. Bandeau de mise à jour reportable,
écran vers le store, comparaison de la version native installée et ciblage push
iOS/Android. Backend avec migration, endpoints administrateur, file d’envoi bornée,
déduplication et revalidation des annonces. Administration avec formulaire de
confirmation de disponibilité, historique et retrait.

**Préservé :** garde des écrans privés, SOS/partage existants, alertes prioritaires
conducteur et transports push existants. Aucun nouveau paquet, aucun push réel,
aucune migration sur la base applicative ni déploiement.

**Limites :** disponibilité confirmée manuellement dans l’administration, pas de
détection automatique des stores. Les anciens binaires sans métadonnées ne sont
pas ciblés à l’aveugle. Validation native iOS/Android et recette visuelle admin
restent à faire ; aucune affirmation de disparition des crashs.

**Fichiers, tests, activation et recette :**
[Sécurité et annonces de mise à jour](APP_UPDATE_ANNOUNCEMENTS.md).
**Vérifications :** suite mobile complète **1 429 tests réussis, 0 échec** ;
backend ciblé **33 tests réussis**, dont 6 sur PostgreSQL temporaire isolé.
TypeScript mobile/backend/admin réussi ; ESLint mobile ciblé sans erreur ;
1 031 sources sous la limite de 400 lignes et frontière réseau valide.
Deux fixtures de navigation ont été adaptées à la nouvelle route publique ;
les tests des gardes de session restent actifs.

## 6 octobre 2026 — Reprise OTP/WhatsApp et photo de profil

**Problème constaté :** l’état local de l’inscription/OTP n’était pas restauré après
recréation de l’application. L’inscription utilisait une caméra externe, différente
du parcours du profil. Le retour au lancement a été signalé ; aucune cause de crash
natif n’a été reproduite sur appareil pendant cette intervention.

**Appliqué :** brouillon temporaire SecureStore (30 min), chargé avant la navigation
pour reprendre l’OTP/le numéro ; priorité conservée à la session connectée. Aucun
OTP, PIN ou jeton de réinitialisation sauvegardé. Après destruction du processus,
les champs du profil sont conservés mais le PIN doit être ressaisi. Contexte social
temporaire chiffré et soumis à son expiration ; pas de session créée par le brouillon.
Caméra intégrée et sélection/aperçu/confirmation partagés entre inscription et profil,
verrous anti-double action, garde des réponses tardives et préservation des champs
édités lors d’un rafraîchissement de photo. Retrait de la caméra externe/du recadrage
natif de ces parcours ; galerie et contrôles serveur existants conservés.

**Fichiers, comportements, précautions, commandes et recette :**
[Reprise de l’authentification et photo de profil](AUTH_FLOW_RECOVERY.md).
Ce document distingue les correctifs appliqués des pistes socket/webhook non ajoutées.
Aucune nouvelle dépendance, modification backend, migration ou déploiement.

**Vérifications réalisées :** suite JavaScript complète **1 420 tests réussis, 0 échec** ;
TypeScript `--noEmit` réussi ; ESLint ciblé sur les fichiers modifiés de cette correction,
**0 erreur, 0 avertissement** ; frontière réseau valide ; **1 023 sources contrôlées,
aucune au-dessus de 400 lignes** ; `git diff --check` sans erreur d’espacement.
Les fixtures des tests de formulaire ont été adaptées au nouveau retour du contrôleur.
Tests natifs Android/iOS, reprise après destruction réelle du processus, présentation
des modals et permissions caméra **restent à réaliser sur appareils physiques**.
Pas de mesure native de mémoire/chauffe ni d’affirmation de disparition des crashs.

## 6 octobre 2026 — Alertes conducteur automatiques, sonnerie dédiée et partage sans proches

**Problème :** la disponibilité manuelle ajoutait une étape avant de recevoir les demandes.
Les notifications n’avaient pas la sonnerie souhaitée et leurs boutons ouvraient encore
l’app pour répondre. Le parcours de sécurité/ajout des proches est signalé comme provoquant
un crash iOS ; la cause native n’a pas été reproduite ni établie ici.

**Solution appliquée :**

- Recherche du conducteur éligible le plus proche des demandes immédiates « Maintenant »,
  automatiquement à partir d’un GPS déjà autorisé. Suppression du choix préalable de
  disponibilité/véhicule ; l’entrée du profil devient « Alertes conducteur », informative.
  Le serveur choisit un véhicule actif compatible, affiché dans l’alerte et le détail.
- Position envoyée au premier plan toutes les 45 s, précision ≤250 m, âge ≤30 s.
  Validité serveur de 300 s par défaut, avec marge suffisante pour répondre et rejet
  des mises à jour obsolètes. **Pas de nouveau suivi GPS permanent hors trajet** : au-delà
  de cette fenêtre sans mise à jour, pas de proposition de proximité. Les réservations
  des trajets publiés sont indépendantes de cette fraîcheur.
- Sonnerie originale WAV de 29 s, nouveau canal Android haute importance/vibration,
  catégorie iOS v2/time-sensitive ; capacités versionnées liées au token push existant.
  Actions natives Accepter/Refuser exécutées via endpoints authentifiés, sans écran
  supplémentaire, verrou anti-double réponse, résultat silencieux et absence de file
  d’acceptations différées en cas d’erreur réseau. L’iPhone peut demander le déverrouillage.
- Enregistrement des handlers avant Expo Router. Pont Notifee/Expo iOS ciblé et idempotent
  au postinstall, sans nouvelle dépendance ; conservation en mémoire d’une destination
  de lecture uniquement si l’app n’a pas encore restauré le profil au moment du tap.
  Son embarqué Android et déclaré dans le projet Xcode versionné ; entitlement natif
  iOS ajouté aussi, car une configuration Expo seule ne régénère pas ces projets.
- Retrait des modals de sécurité/ajout des proches des routes détail/gestion/navigation.
  Bouton libellé « Partager mon trajet » réutilisant le lien public et le partage natif,
  protégé des doubles appuis. Route historique de sécurité devenue informative.
- Désactivation centrale des quatre chemins backend d’envoi automatique aux proches,
  y compris si des préférences avaient été enregistrées. Contacts conservés, non supprimés.

**Fichiers, contrats, paramètres, commandes et recette détaillée :**
[Alertes conducteur automatiques et partage](DRIVER_DISPATCH_NOTIFICATIONS.md).
Ce guide remplace les consignes manuelles du 5 octobre ; l’historique ci-dessous est conservé.
Les correctifs backend concernent le dépôt voisin `zwanga-backend`, modifié avec autorisation.
Les deux modules mobiles de configuration manuelle devenus inutiles ont été supprimés ;
ils sont remplaçables par l’écran informatif actuel. Aucun contact ni donnée utilisateur effacé.

**Conservé / précautions :** contrôles serveur de rôle/identité, véhicule, places, propriété,
expiration, attribution exclusive et réponses idempotentes. Les demandes planifiées gardent
leur parcours. Les réservations publiées ne sont ni réattribuées ni annulées après 30 s.
Paiements/jetons, messages internes, OTP, embarquement/arrivée et SOS restent distincts.
Transactions PostgreSQL courtes sans réseau sous verrou ; aucune nouvelle migration pour
cette révision (la migration de dispatch du 5 octobre reste un prérequis). Aucun déploiement,
modification de base applicative, permission de localisation supplémentaire ou nouvelle dépendance.
Le skill frontend a guidé le partage libellé et la suppression de la configuration superflue ;
le skill PostgreSQL a guidé les transactions et la sélection bornée des candidats.

**Vérifications réalisées :**

- Suite mobile complète : **1 402 tests JavaScript réussis**, puis **19 tests ciblés réussis**
  incluant le dernier ajout de navigation à froid (natif simulé). Commandes :
  `node --test tests/*.test.js` ; `node --test tests/driverNotificationResponse.test.js tests/ongoingTripBanner.test.js tests/driverNotificationNativeAssets.test.js`.
- Backend : **111 tests réussis** sur réservations, demandes, notifications/transports,
  refus tardifs et désactivation des messages proches ; **9 tests dispatch réussis**,
  dont **8 sur un vrai PostgreSQL 18/PostGIS jetable**. Nouvelle position automatique,
  multi-véhicules compatibles, coordonnées périmées, concurrence, destinataire et échéances.
  Première tentative bloquée au lancement dans l’environnement restreint ; une relance
  parallèle a dépassé le délai `initdb`. La relance isolée autorisée a réussi.
  Le cluster de test réussi a été arrêté/supprimé ; aucune base de l’application touchée.
  Le répertoire jetable laissé par `initdb` interrompu a également été vérifié sans serveur
  actif puis supprimé ; il ne contenait que des données de test régénérables.
- TypeScript mobile/backend sans émission : succès. ESLint ciblé des modules ajoutés,
  contrôles de frontières RTK Query et de taille source (aucun module >400 lignes) : succès.
  Deux avertissements ESLint préexistants restent dans le handler Notifee dynamique
  (`require` conditionnel et variable de `catch` inutilisée), sans erreur bloquante.
- PCM WAV lu : 29 s ; asset Android identique. Projet Xcode parsé avec succès, présence
  de la ressource et de l’entitlement vérifiée. Patch iOS idempotent rejoué ; ceci n’est
  **pas** une compilation Objective-C ni une validation du son sur appareil.
- Les premières suites ont détecté des fixtures qui attendaient l’ancien bouton proches
  et des mocks natifs absents ; adaptées aux nouveaux points d’entrée, assertions de
  navigation/SOS/partage conservées. `git diff --check` : succès.

**À valider / limites :** nouveau build natif iOS/Android obligatoire et déploiement backend
avant essai. Aucune compilation native, livraison aux stores ni recette physique faite ici.
OS, permissions, silencieux, mode économie et arrêt forcé peuvent limiter son/livraison.
Arrêt d’une sonnerie iOS déjà commencée à tester. Aucune garantie de disparition du crash,
de chauffe réduite ou de gain batterie. Ni VoIP/CallKit, ni plein écran forcé Android.

## 5 octobre 2026 — Réglage des demandes proches déplacé dans le profil

**Problème :** le bandeau « Demandes proches · Ma disponibilité » sur la carte et le
titre « À vous de choisir » n’expliquaient pas le rôle de ce parcours. Ils ajoutaient
une action de configuration à l’accueil et pouvaient être confondus avec les réservations.

**Solution appliquée :**

- Retrait du bandeau de l’accueil. Entrée **Profil → Demandes près de moi**, dans le
  menu du profil, réservée aux conducteurs confirmés par le profil serveur et au service activé.
  Sous-titre explicite : « Choisir quand recevoir les demandes de passagers ».
- Écran de réglage compact : statut de réception, véhicules en lignes sélectionnables,
  places ajustables, bouton « Recevoir les demandes » / « Arrêter de recevoir » maintenu
  hors du contenu défilant, dans la zone sûre. Pas de grand titre promotionnel.
- Explications du ciblage de proximité, du délai fourni par le serveur, de la nécessité
  d’une position récente et de la réactivation après acceptation. Mention explicite :
  ce réglage ne change pas les notifications des réservations des trajets publiés.
- Présélection du seul véhicule actif ou du dernier véhicule encore actif renvoyé par
  le serveur ; aucun premier véhicule arbitraire lorsqu’un choix reste nécessaire.
  Ouvrir cet écran n’active ni la disponibilité ni une demande GPS.
- Chargement, erreur réseau, service désactivé et absence de véhicule distingués,
  avec reprise adaptée ; aucune disponibilité affirmée après une erreur de lecture.
  Verrou synchrone contre deux activations simultanées et abandon après fermeture
  pendant la demande de permission. Lecture et actualisation d’échéance arrêtées hors écran.
- L’expiration visuelle suit toujours l’échéance serveur ; une minuterie unique remplace
  le rafraîchissement du composant chaque seconde. Ce n’est pas une mesure de gain batterie.

**Fichiers :** `components/home/HomeHeader.tsx`, déplacement de
`components/home/DriverAvailabilityEntry.tsx` vers
`components/profile/ProfileDriverAvailabilityEntry.tsx`, `components/profile/ProfileMenu.tsx`,
`app/(tabs)/profile.tsx`, `app/driver-availability.tsx`, nouveaux
`hooks/driver-dispatch/useDriverAvailability.ts` et
`features/driver-dispatch/DriverAvailability.styles.ts`, `tests/driverAvailability.test.js`,
`tests/homeCompactLayout.test.js`. Guide [mis à jour](DRIVER_DISPATCH_NOTIFICATIONS.md).

**Conservé :** route `/driver-availability` et accès à la proposition en attente,
activation volontaire, limites de places, refus GPS, source de vérité serveur,
actions Accepter/Refuser, attribution, échéances et GPS existants. Aucun changement
backend, contrat réseau, permission native ou dépendance. Le skill frontend a guidé
le retrait du bandeau, la hiérarchie compacte et les libellés utilitaires.

**Vérifications :** TypeScript sans émission, ESLint des modules modifiés et des tests,
contrôle de frontière réseau RTK Query, `git diff --check` : succès. Première suite
ciblée : 54 tests réussis ; suite élargie finale : 195 tests JavaScript réussis
(profil, accueil, disponibilité, notifications et navigation), avec doublures natives.
Commande finale : `node --test tests/driverAvailability.test.js tests/home*.test.js tests/profile*.test.js tests/driverNotifications.test.js tests/notificationNavigation.test.js tests/assignedTripNavigation.test.js`.
Pas de validation visuelle sur téléphone
physique, de mesure batterie ni de nouveau build. La sonnerie dédiée de 30 secondes
reste hors de cette correction d’interface et n’est toujours pas implémentée.

## 5 octobre 2026 — Réponses Notifee et propositions conducteur de proximité

**Problème :** les notifications ne distinguaient pas les actions Accepter/Refuser et
les demandes étaient diffusées sans présence conducteur fraîche ni attribution exclusive.

**Solution appliquée :** première étape mobile + backend, avec disponibilité volontaire,
véhicule/places, bail GPS, sélection géographique séquentielle, délai serveur configurable
(30 secondes par défaut), réponses transactionnelles et écran de résultat. Les réservations
publiées gardent leur conducteur et leur échéance habituelle. Activation serveur désactivée
par défaut ; anciennes installations et autres notifications conservent leur parcours.

Le guide PostgreSQL a conduit à utiliser des transactions courtes sans appels réseau,
des unicités partielles, des index géographiques et des traitements bornés.

**Détails, fichiers, précautions, résultats et commandes :**
[Réponses conducteur et propositions de proximité](DRIVER_DISPATCH_NOTIFICATIONS.md).
TypeScript, contrôles réseau et tests ciblés passés, dont 5 essais sur PostgreSQL/PostGIS
jetable. Aucune migration sur la base applicative ni validation sur téléphone physique.
Son dédié/boucle audio et mode appel verrouillé non livrés dans cette étape.

## 5 octobre 2026 — Estimation d'arrivée du conducteur avant embarquement

**Problème :** avant la prise en charge, le délai calculé vers le passager était
présenté sous le libellé générique « Projection », sans distinguer explicitement
l'arrivée du conducteur de l'arrivée à destination. Le passager devait également
attendre le démarrage pour accéder au suivi depuis le détail du trajet accepté.

**Solution appliquée :**

- Bouton « Voir l’arrivée » sur le trajet accepté, à venir ou en cours, ouvrant
  le suivi de sa réservation. Les demandes acceptées qui ont créé un trajet
  et une réservation utilisent le même parcours, sans nouvelle résolution réseau.
- Bandeau « Arrivée estimée du conducteur » dans l'en-tête du suivi, visible
  aussi lorsque la carte est agrandie : par exemple « Environ 5 min » ou
  « Moins d’une minute ». Il vise le point de prise en charge convenu, pas la
  destination finale ou la position personnelle du passager en déplacement.
- Estimation à partir de la durée routière retournée par l'API existante et
  de la proportion de distance restant sur cet itinéraire. Ce n'est pas un
  décompte diminuant indépendamment du mouvement du véhicule. Aucun « 0 min »
  ni confirmation d'arrivée/embarquement n'est produit par ce calcul.
- Affichage explicite lorsque le départ est en attente, le trajet en pause,
  la connexion absente, la position manquante/périmée ou l'itinéraire indisponible.
  Aucun délai numérique sans position récente et itinéraire routier exploitable.
- Actualisation automatique des directions au maximum une fois par minute
  via ce nouveau mécanisme, seulement sur écran actif, connecté, en attente de
  prise en charge d'un trajet démarré et avec une position récente. Réutilisation
  de la requête existante, de sa protection contre les appels concurrents et de
  sa limite ordinaire de 30 secondes. L'actualisation manuelle existante reste
  disponible ; aucun nouveau flux GPS, socket ou polling de position ajouté.
- Expiration locale après deux minutes sans nouvelle position ou trois minutes
  sans nouvelle route. Ce sont des seuils de prudence choisis, pas des mesures
  de latence. Arrêt des minuteries hors écran, hors connexion ou après embarquement.
- Routes identifiées par réservation, trajet, statut et étape ; réponses tardives
  ignorées si le contexte change. Démarrer le trajet invalide aussi le contexte
  précédent. Une route sans durée valable conserve un tracé de secours sans délai.

**Fichiers :** nouveaux `features/passenger-navigation/pickupArrivalEstimate.ts`,
`PassengerPickupEstimateBanner.tsx` et
`hooks/passenger-navigation/usePassengerPickupEstimate.ts`.
Dans `features/passenger-navigation/` : `PassengerNavigationHeader.tsx`,
`PassengerNavigationInfoCard.tsx`, `navigationModel.ts` ; dans
`hooks/passenger-navigation/` : `usePassengerNavigationController.ts`,
`usePassengerNavigationData.ts`, `usePassengerNavigationPresentation.ts`,
`usePassengerNavigationRoute.ts`, `usePassengerRouteContext.ts` ;
`features/trip-detail/TripDetailActionsFooter.tsx`.
Nouveaux tests `tests/passengerPickupEstimate.test.js` et
`tests/passengerPickupRoute.test.js`.

**Conservé :** accès conditionné à une réservation acceptée, confirmation serveur
de l'embarquement et de l'arrivée à destination, carte, distance restante,
contact/SOS, partage, annulation, reprise et paiements. Seule la durée générique
redondante est retirée du panneau inférieur avant embarquement ; sa distance
est nommée « Avant prise en charge ». Après embarquement, la présentation de
l'itinéraire vers la destination est conservée. Aucun changement backend,
de contrat API public, de migration, de permission native ou de dépendance.

**Vérifications :** suite mobile complète exécutée avec 1 376 tests JavaScript
réussis ; dernière vérification des deux nouvelles suites après ajustements :
15 tests réussis, dont un test ajouté ensuite pour le panneau inférieur.
Les tests couvrent les états d'attente, les réservations/demandes, l'identité de
la route, les données périmées, le hors-ligne, les requêtes tardives, les limites
de fréquence, la fin des minuteries et les composants rendus avec natives simulées.
TypeScript mobile et ESLint ciblé validés, sans erreur ni avertissement après
complétion de la dépendance d'effet `setActiveRouteSegment`. Frontière réseau
et contrôle de taille validés : 1 008 sources, aucune au-dessus de 400 lignes.
`git diff --check` validé.

**Limites :** pas d'essai sur téléphone ou de requête Google Maps/serveur réel.
Le délai devient disponible après démarrage et partage d'une position récente,
pas dès l'acceptation si le conducteur n'est pas encore parti. C'est une
approximation routière, pas une promesse d'heure d'arrivée : la durée transmise
actuellement ne fournit pas un trafic temps réel garanti et ce calcul n'ajoute
pas les temps d'attente ou les détours des autres passagers. Le bandeau rappelle
la variabilité liée à la circulation et aux arrêts. Vérifier sur Android/iOS
la lisibilité avec grandes polices, l'en-tête/carte, le retour réseau et les
transitions départ → approche → embarquement avant livraison.

## 5 octobre 2026 — Champ immatriculation sans exemple ni texte de format

**Problème :** l'exemple « MOTO123 » suggérait un champ réservé aux motos alors
que le formulaire accepte aussi les voitures ; le message sous le champ sur
l'absence de contrainte était superflu.

**Solution appliquée :** retrait du placeholder et du texte sous le champ dans
`components/VehicleFormModal.tsx` (profil et publication) et
`components/auth/VehicleModal.tsx` (inscription). Le libellé visible
« Immatriculation » est conservé dans le formulaire partagé et ajouté au-dessus
du champ d'inscription pour ne pas laisser un champ vide sans indication.
Suppression du composant devenu inutilisé `components/forms/VehiclePlateHint.tsx`
et de la constante d'exemple dans `utils/vehiclePlate.ts` ; leur version suivie
reste récupérable dans l'historique Git.

**Conservé :** libellé d'accessibilité, plaque obligatoire, formats variables,
normalisation, erreurs métier et contrôles serveur. Aucun changement backend,
de dépendance, des autres champs ou du comportement des boutons.

**Vérifications :** 65 tests JavaScript ciblés réussis dans les suites plaques,
formulaires/clavier et profil. `tests/vehiclePlate.test.js` vérifie désormais
l'absence d'exemple et de texte de format ainsi que la présence du libellé, tout
en conservant les tests de validation et d'envoi. TypeScript mobile, ESLint des
trois sources modifiées et `git diff --check` réussis. Aucune référence applicative restante
au composant ou à la constante supprimés. Pas d'essai visuel sur téléphone.

## 5 octobre 2026 — Plaques de motos : retrait du format imposé

**Problème :** la validation commune du client imposait quatre chiffres, deux
lettres puis deux chiffres, et bloquait notamment la création de motos dont
la plaque suivait un autre format. Le backend local n'impose pas ce motif :
son DTO exige une chaîne non vide et son service contrôle notamment la présence
et l'unicité de la plaque après normalisation.

**Solution appliquée :** `utils/vehiclePlate.ts` accepte désormais toute plaque
non vide après la normalisation existante, sans motif ni longueur fixes.
`components/forms/VehiclePlateHint.tsx` indique qu'aucun format n'est imposé ;
l'exemple est adapté. La correction commune s'applique à la création/modification
depuis le profil, à la publication et à l'inscription conducteur, y compris
par téléphone, Google et Apple, pour les motos à deux/trois roues et les voitures.

**Conservé :** champ obligatoire, majuscules ASCII, retrait des espaces/tirets,
absence de troncature et contrôles serveur, dont les doublons. Aucune modification
du backend véhicules, de la base ou des autres champs du formulaire. Les contrôles
serveur ont été vérifiés dans `src/vehicles/dto/vehicle.dto.ts` et
`src/vehicles/vehicles.service.ts` du backend voisin.

**Vérifications :** 11 tests de `tests/vehiclePlate.test.js` adaptés et réussis
(formats variables, champs vides, normalisation, profil, publication,
inscriptions et rendu des formulaires) ; 15 tests existants du service véhicules
backend réussis, dont les motos à deux/trois roues. TypeScript mobile/backend
et ESLint des deux sources modifiées validés. Tests automatisés avec dépendances
simulées : pas d'essai sur téléphone ou de création de véhicule en production.

## 5 octobre 2026 — Correctifs de l'audit performance et réseau

Les [corrections détaillées](CORRECTIONS_PERFORMANCE_RESEAU_2026_10_05.md)
documentent les cinq solutions appliquées, fichiers concernés, comportements
conservés et limites : renouvellement après reconnexion contrôlé, acquittement
GPS corrélé malgré une horloge corrigée, lectures d'affichage suspendues hors
ligne et hors écran, carnet d'adresses paginé avec recherche différée et sans
images inutilisées. Les mutations, règles financières et autorisations sont
préservées. Aucun ajout de dépendance ni migration.

**Vérifications :** 1 362 tests mobiles dans la suite complète réussis ;
82 tests backend ciblés réussis. TypeScript mobile/backend,
frontières réseau, taille des sources et contrôle de diff validés ; ESLint sans
erreur, avec 15 avertissements existants dans les hooks audités. Ces résultats
ne constituent pas une validation native ou une mesure de performances réelles.
**Le backend doit être déployé pour activer le nouvel acquittement GPS.**
Aucun déploiement effectué ; essais physiques Android/iOS restant à réaliser.

## 4 octobre 2026 — Audit performance, réseau et lourdeurs

Le [rapport d'audit](AUDIT_PERFORMANCE_RESEAU_2026_10_04.md) décrit cinq constats
encore ouverts : attente de renouvellement après retour réseau, confirmation GPS
avec horloge corrigée côté serveur, polling de lectures hors ligne, abonnements
de certains écrans masqués et chargement intégral des contacts avec images inutilisées.
Les corrections des audits précédents ne sont pas présentées comme encore manquantes.

**Appliqué :** documentation uniquement, dans ce rapport et le présent journal.
Les solutions proposées sont différées, pas implémentées par cet audit. Code
applicatif/backend, configuration, flux métier, données et modifications
préexistantes conservés. Aucun secret, `.env` ou donnée utilisateur réelle consulté.

**Vérifications :** 1 343 tests JavaScript mobiles réussis, TypeScript mobile,
contrôles réseau/taille et `git diff --check` validés ; 1 002 sources, aucune
au-dessus de 400 lignes. Cinq simulations ciblées supplémentaires confirment les
mécanismes, sans être ajoutées à la suite permanente. Le rapport distingue les
délais du code des mesures et les propositions des corrections appliquées.
Pas d'essai sur téléphone, mesure native, charge SQL/serveur ou déploiement.

## 4 octobre 2026 — « Arrivée à destination » dans les trajets en cours

**Problème :** boutons, statuts, récapitulatifs et messages de résultat utilisaient
encore « dépose / déposé », tandis que d'autres écrans parlaient déjà d'arrivée.

**Solution appliquée :** harmonisation en « arrivée à destination », avec
« Confirmer l’arrivée à destination » côté conducteur et « Je suis arrivé à
destination » côté passager. Les statuts et modaux de succès/échec, les libellés
d'accessibilité, la liste des passagers et les récapitulatifs de gains utilisent
ce vocabulaire. Les lieux sont nommés « Destination du passager ». Le suivi
passager distingue « En route vers votre destination », « Confirmation de
l’arrivée à destination en cours » et « Arrivée à destination confirmée », sans
annoncer la fin du trajet global. Le titre du récapitulatif accepte deux lignes
et les titres d'étape peuvent se replier pour accueillir les libellés plus longs.

**Fichiers application :** dans `features/driver-navigation/`,
`DriverDropoffReceipts.tsx`, `DriverDropoffReceiptsSheet.tsx`,
`NavigationPassengersModal.tsx`, `NavigationWaypointModal.tsx`,
`passengerPanelModel.ts` ; `features/driver-payments/DriverBookingRevenue.tsx` ;
`features/passenger-navigation/PassengerNavigationInfoCard.tsx` ; dans
`features/ride-recovery/`, `RideRecoveryControl.tsx`, `rideActionResultModel.ts`
et `rideRecoveryPresentation.ts`. Tests existants adaptés et nouveau
`tests/arrivalTerminology.test.js`.

**Backend local :** seuls les textes de la notification GPS de fin de réservation,
du refus de terminer un trajet avec arrivées non confirmées et du refus de
confirmer le cash trop tôt sont harmonisés, dans `src/bookings/bookings.service.ts`,
`src/trips/trips.service.ts` et `src/bookings/cash-receipts.service.ts`.
Nouveau test `src/bookings/arrival-terminology.spec.ts`. Les modifications
préexistantes du backend, notamment celles des notifications transactionnelles
dans le service cash, sont préservées et ne font pas partie de cette intervention.

**Conservé :** noms techniques `dropoff` / `droppedOff`, événements et contrats
API, conditions serveur, deux validations, détection GPS, reprise hors connexion,
actions de désaccord/interruption et règles de paiement. Aucun nouveau modal,
appel réseau, migration ou dépendance. Les notifications déjà enregistrées ne
sont pas réécrites ; les nouveaux messages serveur nécessitent leur déploiement.

**Vérifications :** 93 tests JavaScript ciblés réussis dans les suites arrivée,
reprise, résultats, panneau passagers, gains/cash, véhicule et interruption ;
56 tests backend réussis (`arrival-terminology`, `cash-receipts`, `trips.service`).
TypeScript mobile/backend, ESLint des sources mobiles modifiées, frontière réseau
et `git diff --check` des fichiers concernés validés ; 1 002 sources mobiles,
aucune au-dessus de 400 lignes. Recherche des anciens termes sans résultat dans
les sources applicatives. Tests avec dépendances natives/réseau simulées : pas
d'essai physique Android/iOS, de mesure native ou de déploiement effectué.

## 3 octobre 2026 — Correction des cinq constats du scan de performance

Les [corrections détaillées](CORRECTIONS_PERFORMANCE_2026_10_03.md) recensent les
ajouts, suppressions de travail redondant, fichiers, comportements conservés et
limites : résolution ciblée des conversations, réservations par trajet et agrégat
public passager, parrainage paginé/virtualisé et suspendu hors écran,
réconciliation des commissions mutualisée par lots, analyse géométrique passager
réutilisée. Les écritures financières, droits d'accès, QR, GPS et validations
d'embarquement/dépose sont conservés.

**1 341 tests JavaScript mobiles et 52 tests backend ciblés réussis**, TypeScript
mobile/backend et contrôles réseau/taille/diff validés. ESLint : aucune erreur,
neuf avertissements préexistants. Les fixtures obsolètes repérées dans la suite
complète sont réconciliées avec les contrats vérifiés, sans suppression de test.
Micro-benchmark Node : 1 630 ms contre 380 ms sur données fictives, pas une mesure
sur téléphone ni une promesse de réduction de chauffe/crashs. Aucun déploiement,
migration ou dépendance ajoutée. **Backend à livrer avant le nouveau client** ;
concurrence PostgreSQL réelle et essais physiques restent à réaliser.

## 3 octobre 2026 — Nouveau scan de performance, sans correction fonctionnelle

Le [rapport d'audit](AUDIT_PERFORMANCE_2026_10_03.md) relève quatre priorités
réseau/serveur : recherche séquentielle d'une conversation, relecture complète
des réservations pour des écrans ciblés, volume et activité de l'écran parrainage,
réconciliation répétée des commissions. Une piste secondaire concerne les
calculs géométriques du suivi passager sur les longues routes.

**132 tests JavaScript réussis**, TypeScript et contrôles réseau/taille de sources
validés. Une simulation de 1 000 conversations confirme 20 lectures successives
avant création ; les mesures de géométrie sont des micro-benchmarks Node, pas des
mesures sur téléphone. Seuls ce journal et le rapport sont modifiés : aucune
fonctionnalité, migration, dépendance ou configuration changée. Les solutions
restent proposées ; aucun essai physique, accès production ou gain natif affirmé.

## 3 octobre 2026 — Vérification des retraits conducteur bloqués

Un retrait `pending` ou `initiated` pouvait rester réservé sans action de résolution.
L'historique des gains permet maintenant de **demander une vérification** et de
rafraîchir un retrait par son ID interne, même sans numéro FlexPay. Les états
« vérification demandée », délai anormal et incident de succès tardif sont
expliqués distinctement. Aucun bouton ne prétend annuler lui-même un virement.

Fichiers : `types/earnings.ts`, `store/api/driverSettlementsApi.ts`,
`hooks/driver-earnings/useDriverPayout.ts`, `features/driver-earnings/PayoutHistory.tsx`,
`features/driver-earnings/payoutModel.ts`, `app/driver-earnings.tsx` et tests associés.
Les nouveaux boutons dépendent des capacités renvoyées par le backend ; le
contrôle par ancien numéro de commande reste compatible avec l'ancien serveur.
Idempotence, solde serveur, KYC, choix du destinataire et intention de retrait
persistée sont conservés. Un signalement ne remet jamais les gains à disposition
localement et ne lance aucun nouveau versement.

Le [contrat backend et la procédure support](../../zwanga-backend/docs/finance/driver-payout-corrections.md)
décrivent la migration et la résolution administrateur après confirmation FlexPay.
**43 tests JavaScript réussis**, contrôle TypeScript mobile réussi. Aucun essai
sur appareil physique ni déploiement ; l'incident de production reste à rapprocher.

## 3 octobre 2026 — Retour à l’accueil connecté et onboarding raccourci

Le démarrage privilégie maintenant la session restaurée pour ouvrir l’accueil,
sans dépendre des anciens indicateurs de présentation. Une erreur temporaire du
stockage sécurisé propose un réessai au lieu d’afficher une fausse déconnexion.
La première utilisation regroupe introduction, information de localisation et
choix connexion/inscription sur un seul écran, sans supprimer OTP/PIN ni KYC.

Le [rapport détaillé](DEMARRAGE_SESSION_ONBOARDING_2026_10_03.md) décrit les causes,
les fichiers, les précautions et les limites. **129 tests JavaScript réussis**,
TypeScript et contrôles techniques validés ; ESLint sans erreur avec un avertissement
préexistant. Aperçu navigateur inspecté à 320/360 px, essais physiques encore requis.
Aucun backend, dépendance native ou déploiement modifié.

## 2 octobre 2026 — Places ajustables et messagerie dans les contacts du trajet

Les valeurs par défaut de publication restent 2/3/4 selon le véhicule, mais les
boutons −/+ permettent désormais de les ajuster dès 1 place, dans les limites
serveur des motos. Le modal de contact du trajet ajoute « Message dans Zwanga »,
même sans téléphone, avec chargement, protection des doubles appuis et erreurs
en français. WhatsApp et les appels déjà disponibles sont conservés.

Le [rapport détaillé](PUBLICATION_PLACES_CONTACT_2026_10_02.md) décrit le contrat
serveur consulté, les fichiers, les protections et les limites. **99 tests
JavaScript réussis**, TypeScript, ESLint ciblé et contrôles techniques validés.
Aperçu navigateur inspecté à 320/360 px ; essais natifs Android/iOS encore requis.
Aucun changement du backend, de dépendance ou déploiement pour cette intervention.

## 2 octobre 2026 — QR code du lien personnel de parrainage

Ajout de « Mon QR code » dans l’espace Parrainage : génération locale depuis le
`shareLink` fourni par le serveur, aperçu adaptatif, partage PNG et copie du lien.
Aucun changement des règles d’attribution, commissions, retraits ou du backend.
L’interface sobre et le QR noir sur fond blanc privilégient la lecture et le scan.

Le [rapport de modification](PARRAINAGE_QR_2026_10_02.md) précise les fichiers,
les protections contre les réponses tardives, les dépendances et les limites.
**58 tests ciblés réussis**, TypeScript et ESLint ciblé validés ; QR générés puis
décodés avec un lecteur indépendant, aperçu navigateur contrôlé à 320 et 360 px.
Ces vérifications ne remplacent pas les essais de scan et de partage sur appareils.

**Un nouveau build iOS/Android est nécessaire** pour intégrer les modules natifs SVG
et de partage. Aucun build, envoi aux stores, changement de `.env` ou déploiement
n’a été effectué. Détails et précautions dans le rapport lié.

## 2 octobre 2026 — Corrections des neuf constats de sécurité et performance

À la demande de l’utilisateur, les correctifs F01–F09 de l’audit sont maintenant
appliqués dans l’application et le backend local : projections publiques sûres,
protection des jetons, quotas Redis, cycle de vie des WebSockets, uploads vérifiés,
isolation du chatbot, pagination et réduction des lectures serveur répétées.

Le [rapport de corrections](CORRECTIONS_AUDIT_2026_10_02.md) précise les fichiers,
les comportements conservés, les changements de contrat et les prérequis de livraison.
Vérifications : **397 tests frontend et 289 tests backend réussis**, TypeScript
application et production backend validés, ESLint frontend ciblé et contrôles
réseau/taille validés. Des vérifications supplémentaires ciblées sont détaillées
dans le rapport, sans additionner les tests rejoués.

Aucun déploiement, changement de `.env`, accès aux données réelles ou révocation
de sessions en production. Les proxys de confiance et Redis doivent être vérifiés
avant livraison. Aucune mesure de chauffe, de batterie ou de latence native.
Les travaux précédents sur embarquement, dépose et paiement sont conservés.

## 2 octobre 2026 — Audit des performances et de la sécurité

Audit ciblé de l’application et du backend local, sans modification fonctionnelle.
Le [rapport d’audit](AUDIT_PERFORMANCE_SECURITE_2026_10_02.md) documente neuf constats
priorisés, dont une fuite critique de champs d’authentification dans les réponses
de messagerie, la confidentialité des trajets, les quotas et les coûts des lectures
serveur. Les corrections sont proposées, **pas appliquées**.

Seuls ce journal et le rapport sont modifiés pour cette intervention ; les travaux
préexistants sont conservés. Vérifications : reproductions sur données fictives,
98 tests frontend et 66 tests backend réussis, TypeScript frontend et contrôles
réseau/taille validés. Aucun accès aux données réelles, à `.env` ou à la production,
aucun test natif ou de charge ; pas de conclusion sur les crashs ou la chauffe.

## 2 octobre 2026 — Modales de résultat pour l’embarquement et la dépose

À la demande de l’utilisateur, chaque action manuelle peut désormais afficher
une modale de résultat soignée et animée : succès serveur en vert, échec en rouge,
enregistrement local ou attente de l’autre personne en orange. Elle apparaît
**après l’action**, sans nouvelle validation préalable, et peut évoluer avec le
statut serveur déjà disponible. Double accord, détection automatique et paiement
restent inchangés ; le SOS conserve la priorité.

Le [rapport de modification](RIDE_ACTION_RESULTS_2026_10_02.md) détaille les fichiers,
les protections de compte/écran et les limites : **212 tests frontend réussis**,
TypeScript et ESLint ciblé validés, aperçu navigateur inspecté, pas de validation
sur téléphone physique ni de changement backend dans cette intervention.

## 2 octobre 2026 — Double validation rétablie, actions directes et paiement unifié

**Décision finale :** conducteur et titulaire confirment chacun l’embarquement
et la dépose manuels, avec un appui par personne sans modale intermédiaire.
Les états d’attente précisent qui doit encore confirmer ; détection automatique,
file hors connexion, désaccords et protections serveur sont conservés.
Le paiement utilise une feuille unique plus compacte, du choix du mode au reçu,
sans demander de régler de nouveau un trajet payé ni assimiler cash à encaissement.

Le [rapport final](RIDE_CONFIRMATION_PAYMENT_2026_10_02.md) documente les fichiers
application/backend, la révision de la règle antérieure, les protections,
**189 tests application et 139 tests backend réussis**, l’aperçu navigateur et
les limites restantes. Aucun déploiement ni test sur appareil physique réalisé.

## 2 octobre 2026 — Embarquement manuel du passager en un appui (règle remplacée)

**Historique :** la règle « passager seul » de cette entrée a été remplacée à la
demande de l’utilisateur par la double validation documentée ci-dessus. Les
résultats suivants concernent uniquement cette intervention antérieure.

Le bouton « Je suis à bord » enregistre directement la confirmation, sans feuille
intermédiaire ni modale de succès. Le serveur accepte désormais la confirmation
du seul titulaire de la réservation ; le conducteur ne peut plus la remplacer.
La détection automatique, la confirmation d'arrivée et les règles de paiement
restent conservées. Les états hors connexion distinguent enregistrement local
et validation serveur.

Le [rapport de modification](PASSENGER_PICKUP_2026_10_02.md) décrit les fichiers
frontend/backend, les protections, la reprise des déclarations antérieures,
les **132 tests frontend et 113 tests backend réussis**, et les limites de
validation native. Le backend et l'application doivent être livrés ensemble ;
aucun déploiement n'a été effectué.

## 1er octobre 2026 — Version applicative 1.0.16 et préparation iOS

**Périmètre et problème.** Préparation d'une nouvelle version, notamment iOS :
Expo et les projets natifs versionnés doivent annoncer les mêmes versions.

**Solution appliquée.** Version applicative `1.0.15` → `1.0.16` dans
`app.config.js`, `package.json`, les deux métadonnées racines de `package-lock.json`,
les configurations Debug/Release de `ios/zwanga.xcodeproj/project.pbxproj` et
`android/app/build.gradle`. Build iOS local `121` → `122` et code Android
`136` → `137`, synchronisés avec Expo. `ios/zwanga/Info.plist` conserve ses
références `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` ; aucune duplication.

**Comportements conservés.** Aucun changement fonctionnel, de dépendance ou de SDK
Expo. Identifiants d'application et signature inchangés. `eas.json` conserve
`appVersionSource: remote` et `production.autoIncrement: true` : le compteur
distant reste autoritaire pour un build EAS et peut différer des valeurs locales.

**Vérifications et limites.** `tests/appVersions.test.js` vérifie la cohérence
Expo/package/lockfile, Xcode Debug/Release et plist, Android et la politique EAS,
sans charger de fichier `.env` : **4 tests réussis** ; `git diff --check` réussi.
Contrôles locaux uniquement : aucun build natif,
changement de compteur distant ni envoi TestFlight/App Store réalisé.

## 30 septembre 2026 — Corrections de l'audit de performance : GPS, Places et historiques

Les quatre points de l'audit sont traités : abonnement GPS passager immédiat,
acquisitions ponctuelles partagées dans le picker, annulation des lectures Places
obsolètes sans couper les autres consommateurs, et caches de listes limités à six
pages avec navigation dans les deux directions et relecture serveur bornée.
Les non-lus déjà connus sont préservés lors de l'éviction des résumés.

Le [rapport de corrections](PERFORMANCE_FIXES_2026_09_30.md) détaille les problèmes,
fichiers, comportements conservés, tests JavaScript, mesures simulées et limites
restantes. Il ne revendique pas de mesure de batterie, fluidité ou chauffe sur appareil.

## 30 septembre 2026 — Connexion PIN et récupération lisibles au-dessus du clavier

**Périmètre et problème.** La capture de récupération du PIN montre des actions
basses masquées : illustration volumineuse, titre long, marges cumulées et boutons
empilés consomment la hauteur disponible. L’étape PIN de connexion présentait le
même risque. Le constat vient de la capture et du code, pas d’une reproduction native.

**Solution appliquée.** La compétence frontend a guidé une présentation utilitaire,
sans grande illustration, centrée sur les champs et les actions :

- `components/auth/AuthCodeHeading.tsx` et `features/auth/authCode.styles.ts`
  partagent un titre court, une petite icône masquée avec le clavier, des marges
  réduites et des contrôles de hauteur minimale 44–52 points, extensibles en hauteur.
- `components/auth/steps/PinStep.tsx` compacte uniquement la connexion : quatre
  cases rapprochées, connexion et « PIN oublié ? » sur une rangée, aide de
  récupération conservée. La présentation de création du PIN reste conservée.
- `components/auth/steps/ResetPinStep.tsx` compacte la vérification OTP et le choix
  du nouveau PIN. Vérifier/renvoyer partagent une rangée ; nouveau PIN/confirmation
  sont côte à côte avec retour à la ligne si nécessaire et libellés accessibles.
  Les champs restent masqués et sont bloqués pendant la réinitialisation.
- `components/auth/OtpDeliveryNotice.tsx` propose une variante courte gardant
  WhatsApp via Didit et le secours SMS. `components/auth/OtpCodeInput.tsx` place
  « Coller le code » à côté du libellé dans cette variante ; les autres écrans
  gardent leur présentation existante.
- `hooks/auth/useAuthKeyboardLayout.ts`, `app/auth.tsx` et
  `components/auth/AuthHeader.tsx` resserrent l’en-tête au clavier, suppriment
  l’inset inférieur alors couvert par celui-ci et remettent le défilement en haut
  au changement d’étape/visibilité du clavier, sans modifier le focus ni le remettre
  en haut à chaque frappe. Les écouteurs sont retirés hors de ces étapes et au
  démontage. Android utilise son `adjustResize` existant sans second évitement ;
  iOS conserve un seul `KeyboardAvoidingView`. La récupération affiche un retour
  à la connexion à la place des onglets connexion/inscription ; ce retour est
  bloqué pendant les requêtes de récupération.

**Précautions.** Aucun texte important tronqué, aucune désactivation du grossissement
des caractères. Le défilement demeure possible pour une très faible hauteur, les
grands caractères ou un message supplémentaire. Connexion automatique à quatre
chiffres, chargement jusqu’à redirection, validations serveur, preuve OTP,
collage/autoremplissage et renvoi conservés. Pas de vérification OTP automatique,
de changement backend, de dépendance ajoutée ou de modification de configuration native.

**Vérifications.** `tests/authKeyboardLayout.test.js` ajoute 17 tests JavaScript
sur les transitions clavier, les insets Android/iOS, la navigation et les états
occupés. `tests/otpCodeInput.test.js` et `tests/otpDelivery.test.js` couvrent aussi
les variantes compactes ; les tests PIN/Google/chargement simulent le nouveau hook.
`package.json` inclut ces contrôles de disposition dans `test:form-layout`.

- 130 tests JavaScript réussis : disposition/auth clavier, zones sûres, OTP,
  récupération PIN, profil, connexion automatique, Google et chargement.
- TypeScript `tsc --noEmit --incremental false` et ESLint ciblé : réussis.
- Frontière réseau valide ; 974 sources contrôlées, aucune au-dessus de 400 lignes ;
  `git diff --check` réussi.
- `scripts/preview-auth-keyboard.cjs` rend les vrais composants via React Native
  Web avec données fictives, sous `.expo/auth-keyboard-preview` (ignoré par Git).
  Mesures Chrome avec clavier **simulé** : aucun débordement vertical/horizontal
  pour OTP, connexion PIN et nouveau PIN à 320×568, 360×640 et 390×844 pixels CSS,
  avec respectivement 240, 320 et 346 pixels réservés au clavier, texte normal.
  Le contrôle a révélé puis permis de corriger la largeur minimale intrinsèque
  des champs du nouveau PIN. À 320 pixels avec texte simulé à 150 %, pas de
  débordement horizontal ; le défilement de secours est nécessaire pour OTP/login.

**Limites.** Tests JavaScript à I/O natives simulées et aperçu navigateur, sans
essai Android/iOS physique ni déploiement. Vérifier sur les appareils concernés :
claviers Gboard/Samsung/iOS, suggestions et collage, retour de WhatsApp, ouverture/
fermeture du clavier, grands caractères et paysage. Les hauteurs et événements du
clavier natif dépendent de l’OS ; l’absence de défilement ne peut être garantie
sur toute combinaison d’écran, clavier et taille de caractères.

## 30 septembre 2026 — Collage et répartition du code OTP dans les cases

**Périmètre et problème.** L’utilisateur signale un code mal réparti, parfois
réduit au dernier chiffre, après collage sur certains téléphones. L’inspection
montre plusieurs gestionnaires différents : celui du profil insérait même un code
complet à partir de la case active ; les champs déclaraient tous être des cibles
d’autoremplissage ; les callbacks recopiaient l’état du dernier rendu et pouvaient
déplacer le focus pendant un collage. La limite native de 5/6 caractères pouvait
aussi tronquer les codes espacés avant leur nettoyage JavaScript. Ces risques
sont constatés dans le code ; le symptôme natif exact n’a pas été reproduit ici
sur les téléphones concernés.

**Solution appliquée.** `components/auth/OtpCodeInput.tsx` et
`features/auth/otpInput.ts` centralisent désormais l’entrée OTP : un code complet
remplit toutes les cases depuis la première, quel que soit le champ utilisé ;
les espaces/tirets sont retirés avant la répartition et les zéros initiaux restent
présents. Un collage partiel commence à la case active. La saisie manuelle avance
case par case, mais le collage/autoremplissage ne déplace plus le focus. Une
référence synchronisée conserve les derniers chiffres entre deux rendus, afin
que plusieurs événements natifs rapprochés ne réécrivent pas un ancien tableau.
Une seule case annonce l’autoremplissage OTP ; le menu de collage natif reste
disponible dans toutes les cases. La limite native passe à 64 caractères pour
recevoir les séparateurs, tandis que la valeur affichée reste d’un chiffre par
case et que la longueur du code reste limitée à celle du parcours.

Le bouton « Coller le code » lit le presse-papiers uniquement après un appui
explicite, via `expo-clipboard` déjà présent dans le projet. Il exige exactement
le nombre de chiffres attendu après nettoyage, remplit les cases en une seule
mise à jour et affiche une aide française si le contenu est incomplet ou si la
lecture échoue. Aucune lecture automatique, aucun journal contenant le code ou
le presse-papiers. Les doubles lectures sont bloquées ; une réponse tardive est
ignorée après saisie, remise à zéro, renvoi du code ou démontage du composant.

**Intégration et comportements conservés.** Le composant est utilisé dans
`components/auth/steps/SmsStep.tsx`, `GoogleOtpStep.tsx`, `ResetPinStep.tsx` et
`components/profile/ProfilePinModal.tsx`. `hooks/profile/useProfilePin.ts` expose
le setter du code à `app/(tabs)/profile.tsx` ; les anciens handlers OTP du profil
et les handlers inutilisés de `hooks/auth/usePhoneAuthActions.ts` sont retirés.
Les présentations à 5 ou 6 cases, le collage natif, la saisie manuelle, la
correction d’une case, les refs de focus initial et l’effacement restent disponibles.
Les champs sont désactivés pendant la vérification ou le renvoi du code. Les
instructions WhatsApp/Didit, les validations et renvois serveur, les preuves de
réinitialisation et le PIN personnel à 4 chiffres restent inchangés. Aucun
nouveau déclenchement automatique de vérification OTP ni changement backend.

**Vérifications.** `tests/otpCodeInput.test.js` ajoute 12 tests couvrant toutes
les cases pour les deux longueurs, saisies rapprochées, collage explicite,
autoremplissage configuré pour Android/iOS, erreurs et réponses tardives.
`tests/otpDelivery.test.js` exerce le composant partagé dans les écrans et
`tests/profileModules.test.js` conserve le contrôle du parcours de récupération.
`package.json` ajoute la commande `test:otp`.

- `npm.cmd run test:otp` : **64 tests JavaScript réussis**.
- Régression connexion automatique, Google et chargement jusqu’à redirection :
  **38 tests réussis**, soit **102 tests réussis** au total sur ces deux suites.
- TypeScript `tsc --noEmit --incremental false` : réussi.
- ESLint des neuf sources touchées : réussi, sans erreur ni avertissement.
- Frontière réseau valide ; 971 sources contrôlées, aucune au-dessus de 400 lignes ;
  `git diff --check` réussi.

**Limites.** Presse-papiers, clavier, SDK et rendu natif simulés en JavaScript ;
aucun déploiement ni essai Android/iOS physique. À vérifier sur les téléphones
concernés : collage depuis WhatsApp, suggestion OTP du clavier, collage dans une
case déjà remplie, lecture du presse-papiers autorisée/refusée et correction
manuelle. La prise en charge des suggestions dépend toujours du clavier et de l’OS.

## 30 septembre 2026 — Choix d’un lieu en touchant la carte

**Périmètre et demande.** Dans `LocationPickerModal`, choisir une position par
un toucher sur la carte, en complément du glissement sous le repère central.
Le toucher simple disposait déjà d’un callback, mais le toucher des lieux nommés
Google Maps (`onPoiClick`) n’était pas relié et les indications ne présentaient
que le glissement. Un arrêt de glissement encore en attente pouvait aussi entrer
en concurrence avec le point touché.

**Solution appliquée.** `components/location-picker/LocationPickerMap.tsx`
centralise `onPress` et `onPoiClick` dans le même traitement : vérification de
la disponibilité de la carte et de son instance, annulation de l’ancien arrêt
de glissement, remise du repère au repos, puis transmission du point au sélecteur.
Les callbacks intermédiaires de caméra sont ignorés pendant le recentrage ; un
nouveau geste reste prioritaire. Le centre courant est suivi pendant le mouvement,
pour permettre de toucher à nouveau l’ancien point sélectionné avant la fin du
glissement. Les indications de la carte et de `components/LocationPickerModal.tsx`
mentionnent désormais explicitement le toucher.

**Comportements conservés.** Le traitement existant `choose(pointSelection(...),
true)` reste responsable de la sélection immédiate, du recentrage et de la
recherche différée de l’adresse. Glissement, recherche textuelle, favoris, GPS,
limites géographiques RDC, projection sur le trajet et validation explicite
« Utiliser ce lieu » sont conservés. Une adresse en attente ou indisponible ne
bloque pas la confirmation des coordonnées. Aucun nouvel appel réseau direct.

**Vérifications.** `tests/locationPickerMapPress.test.js` couvre les touches
successives, le recentrage, la concurrence glissement/toucher, le retour au
glissement, les lieux Google Maps et les événements tardifs après fermeture ou
rechargement. `tests/locationPicker.test.js` vérifie aussi le câblage du modal,
le GPS lent, les adresses obsolètes, la validation hors ligne et les restrictions.
`package.json` inclut le nouveau fichier dans `test:location-picker`.

- `npm.cmd run test:location-picker` : **26 tests JavaScript réussis**.
- TypeScript sans émission et ESLint des deux composants : réussis, sans erreur.
- Frontière réseau valide ; 969 sources contrôlées, aucune au-dessus de 400 lignes ;
  `git diff --check` réussi.

**Limites.** Événements natifs, animations et réseau simulés : aucun essai physique
Android/iOS ni déploiement. Le callback distinct des lieux nommés est fourni par
Google Maps (Android et fournisseur Google sur iOS), pas par Apple Maps ; le
fournisseur iOS actuel reste inchangé. Le toucher standard est câblé sur les deux
plateformes et son comportement natif reste à vérifier sur appareil.

## 30 septembre 2026 — Chargement continu jusqu’à la sortie du formulaire d’authentification

**Périmètre et problème.** Après une connexion ou une inscription acceptée, le
chargement réseau pouvait s’arrêter avant la confirmation locale de session et
la redirection. Le bouton redevenait disponible ; l’inscription passager sur
l’étape profil ne disposait pas non plus de son propre indicateur de finalisation.

**Solution appliquée.** `hooks/auth/usePinLogin.ts`, `useGoogleAuthActions.ts`
et `useSocialAuthActions.ts` conservent leur chargement et leur verrou synchrone
après une connexion réussie, jusqu’au démontage du formulaire. Les connexions
Google/Apple attendent explicitement la confirmation de sauvegarde de session,
via `useAuthController.ts`, afin de libérer le bouton avec une erreur si cette
confirmation échoue. L’analytics Apple devient non bloquant, comme pour Google
et le PIN. Aucun délai artificiel ne réactive le bouton après un succès.

`hooks/auth/useRegistrationActions.ts` couvre maintenant toute la finalisation :
lecture du parrainage, requête, sauvegarde de session, Didit pour les conducteurs,
notification et demande de navigation. Un double appui est ignoré même avant le
prochain rendu React. Le formulaire social n’est plus effacé avant son démontage,
ce qui évite le retour visuel à une étape inactive pendant la transition.
Après une création confirmée par l’API, une éventuelle nouvelle tentative reprend
uniquement la finalisation locale, sans renvoyer la création de compte ; les
champs d’identité restent figés et le bouton indique « Finaliser la connexion ».
Une erreur de notification, d’analytics ou de consommation locale du parrainage
ne transforme pas la création en échec. Si Didit lève une erreur, un message
invite à reprendre la vérification depuis le profil, sans recréer le compte.

`app/auth.tsx` relie cet état aux étapes profil/KYC et bloque le changement de
mode et le retour de l’en-tête. `components/auth/steps/ProfileStep.tsx` et
`KycStep.tsx` affichent un indicateur avec « Finalisation en cours… » et exposent
l’état occupé aux outils d’accessibilité. `components/GenderSelector.tsx` accepte
un état désactivé facultatif pour figer ce champ pendant la finalisation.

**Comportements conservés.** Une erreur avant création laisse corriger et
réessayer. La sélection Google/Apple au début d’une inscription et la transition
vers une inscription demandée par le backend restent des étapes intermédiaires
déverrouillées. PIN automatique, validation des noms/plaques, OTP, attribution
transmise au serveur, parcours conducteur et règles de session restent conservés.
Aucun contrat backend ni droit conducteur n’est modifié. Le comportement par
défaut du sélecteur de sexe reste inchangé sur les autres écrans.

**Vérifications.** `tests/authSubmissionLoading.test.js` ajoute 15 scénarios
JavaScript de lenteur, double appui, succès en attente de navigation, échec local
après création, Didit et services facultatifs, ainsi que le câblage des boutons.
`pinAutoLogin.test.js` et `googleAuthFlow.test.js` vérifient le verrou conservé
après succès. `vehiclePlate.test.js` utilise désormais un cycle de hooks et une
instance distincte par inscription. Le contrôle élargi a révélé une ancienne
fixture invalide dans `accountRole.test.js` : ses refresh tokens opaques étaient
refusés par la politique de session existante. La fixture utilise maintenant des
JWT synthétiques valides, sans modifier les assertions ni le code de production.

- Suite ciblée/élargie : **97 tests réussis** (chargement, Google, PIN automatique,
  réinitialisation PIN, OTP, gardes de navigation, cycle de session, rôles, plaques).
- TypeScript `tsc --noEmit --incremental false` : réussi.
- ESLint des neuf sources concernées : aucune erreur ; un avertissement
  préexistant sur les dépendances de l’effet de disponibilité Apple du contrôleur.
- Frontière réseau : valide ; taille des sources : 969 fichiers contrôlés,
  aucun au-dessus de 400 lignes ; `git diff --check` : réussi.

**Limites.** Tests JavaScript avec SDK natifs, stockage, réseau et navigation
simulés ; aucun essai Android/iOS physique ni déploiement réalisé. La reprise
locale reste en mémoire pour le formulaire courant : ce n’est pas une garantie
d’idempotence serveur après fermeture de l’app ou perte d’une réponse réseau.
À vérifier sur appareil : réseau lent, sortie effective du formulaire, demandes
de permission et retour du SDK Didit.

## 30 septembre 2026 — Connexion automatique à la saisie du PIN complet

**Périmètre et demande.** Au login par téléphone, les quatre cases du PIN
devaient être remplies puis validées avec un bouton. La connexion doit partir
dès le quatrième chiffre, sans changer la création ou la réinitialisation du PIN.

**Solution appliquée.** `hooks/auth/usePhoneAuthActions.ts` transmet directement
le nouveau PIN nettoyé à la connexion quand l'utilisateur remplit quatre chiffres,
uniquement en mode `login` et à l'étape `pin`. Cela couvre également le
copier-coller et évite d'envoyer la valeur React précédente à trois chiffres.
Le déclenchement dépend d'une saisie, pas d'un effet : aucun envoi simplement
en affichant l'écran, en revenant dessus ou lors d'un rendu supplémentaire.

Le nouveau `hooks/auth/usePinLogin.ts` centralise l'envoi automatique et le
bouton manuel conservé. Un verrou synchrone empêche les appels concurrents
jusqu'à la fin de la requête et de la confirmation locale de session ; un succès
ne permet pas de renvoyer le login pendant la redirection. Sur erreur, le PIN
est vidé et le champ est refocalisé via le mécanisme existant, sans boucle de
réessai. Une nouvelle saisie complète permet une nouvelle tentative. Les retours
tardifs sont contrôlés par montage, compte téléphonique, étape et génération de
session avant les actions locales du hook. Une erreur d'analytics ne transforme
pas une connexion confirmée en échec.

`components/auth/steps/PinStep.tsx` explique le déclenchement automatique,
affiche « Connexion en cours… » et bloque le champ, le bouton et la récupération
du PIN pendant l'attente. `app/auth.tsx` conserve cet état pendant la sauvegarde
de session et protège aussi le retour/changement de mode, y compris avant le
prochain rendu. Le serveur demeure l'autorité pour accepter ou refuser le PIN.

**Comportements conservés et précautions.** Le bouton manuel reste disponible.
Le PIN reste numérique, masqué et limité à quatre chiffres. Aucun envoi automatique
à l'inscription, lors de la confirmation d'un nouveau PIN ou de sa réinitialisation.
Aucune relance automatique après PIN erroné ou panne réseau. Les endpoints et
le mécanisme existant d'établissement de session ne sont pas modifiés ; quitter
un écran n'est pas présenté comme une annulation d'une requête déjà envoyée.
Les changements Google de l'intervention précédente sont conservés.

**Vérifications réalisées.** 73 tests JavaScript réussis dans `pinAutoLogin`,
`pinReset`, `otpDelivery`, `googleAuth`, `googleAuthFlow`,
`authNavigationSession` et `vehiclePlate`. Les 11 nouveaux tests vérifient
notamment la valeur réellement envoyée au quatrième chiffre, le collage,
auto-envoi plus appui manuel, attente de sauvegarde, erreurs sans réessai,
nouvelle saisie après refus, absence d'envoi sur simple rendu, inscription
inchangée, réponses tardives et branchement du chargement dans l'écran.
Les bancs de tests `otpDelivery.test.js` et `googleAuthFlow.test.js` sont adaptés
au hook et au verrou supplémentaires. TypeScript sans émission réussi ; lint
ciblé sans erreur, avec quatre avertissements préexistants sur des handlers
OTP inutilisés dans `usePhoneAuthActions.ts`. Frontières réseau,
limite des 400 lignes (969 sources) et `git diff --check` validés.

**Limites.** SDK, backend et persistance simulés dans les tests JavaScript.
Aucun déploiement ni essai physique : vérifier sur Android/iOS la frappe,
le collage, le clavier après refus, la latence réseau et la redirection après
une connexion réelle. Aucun PIN, jeton ou renseignement personnel réel ajouté
à la documentation ou aux journaux par ce changement.

## 30 septembre 2026 — Connexion Google : concurrence et erreurs natives en français

**Périmètre et problème signalé.** Sur certains téléphones en production,
le premier appui visible sur Google affiche une erreur « in progress » en
anglais. Inspection réelle du code : le chargement du bouton commençait à
la requête backend, pas à l'ouverture du SDK ; les handlers n'avaient pas de
verrou synchrone ; le service réaffichait les messages natifs inconnus.
Le SDK installé distingue la concurrence de son pont natif et les erreurs
remontées par Google Play services. L'origine précise du premier appui sur
les appareils concernés n'est pas reproduite : un état natif résiduel reste
une hypothèse, pas un diagnostic confirmé d'un double appui utilisateur.

**Solution effectivement appliquée.**

- `services/googleAuth.ts` configure Google à la demande, une seule fois
  par instance JavaScript. Les appels concurrents partagent la même promesse
  d'ouverture/vérification native. Le verrou est libéré au règlement réel de
  la promesse, jamais par un délai susceptible de lancer deux fenêtres. La
  configuration avant `signIn`/`signInSilently` est garantie dans le service,
  et l'effet répété au montage est retiré de `useAuthController.ts`.
- `features/auth/googleAuthErrors.ts` traduit les erreurs natives en catégories
  et messages français : concurrence, annulation, services indisponibles,
  configuration, réseau et confirmation Google absente. Compatibilité avec
  `IN_PROGRESS`, `ASYNC_OP_IN_PROGRESS`, `SIGN_IN_CURRENTLY_IN_PROGRESS`,
  `12502` numérique/texte et variantes de message. Un message natif inconnu
  n'est plus présenté tel quel. Les annulations Android/iOS restent distinctes.
- Nouveau `hooks/auth/useGoogleAuthActions.ts`, intégré dans
  `useSocialAuthActions.ts` : verrou dès l'appui jusqu'à la fin du SDK et de
  la requête Zwanga, chargement immédiatement visible, contrôle de montage
  et de génération de session avant l'envoi au backend. La connexion et
  l'inscription Google, ainsi qu'Apple, partagent le verrou du contrôleur.
  Une annulation ne montre pas d'alerte d'échec ; une concurrence native
  affiche une information française avec consigne de réessai et alternative
  par téléphone. Le journal ne contient que la catégorie, pas le texte natif,
  le profil ou les jetons. Une erreur d'analytics n'annule plus un login réussi.
- `app/auth.tsx`, `components/auth/steps/PhoneStep.tsx` et `AuthHeader.tsx`
  relient l'attente native à « Connexion en cours… », désactivent les actions
  concurrentes et exposent l'état occupé à l'accessibilité. Les callbacks
  téléphone/changement de mode/retour consultent aussi le verrou avant même
  le prochain rendu React.

**Comportements conservés et précautions.** Pas de déconnexion Google forcée,
de révocation, de purge des identifiants ou de relance automatique du SDK sur
une erreur ambiguë. La connexion Zwanga n'est tentée qu'après un résultat
Google valide. Le serveur reste l'autorité pour établir la session et décider
si une première inscription doit être complétée. Le parcours téléphone/OTP,
la finalisation d'inscription et Apple sont conservés. Aucun changement de
version du SDK, d'identifiant OAuth, de backend ou de configuration native.

**Vérifications réalisées.** 62 tests JavaScript réussis : `googleAuth.test.js`,
`googleAuthFlow.test.js`, `otpDelivery.test.js`, `pinReset.test.js`,
`authNavigationSession.test.js` et `vehiclePlate.test.js`. SDK/services simulés :
première ouverture lente, appels concurrents avant rendu, attente backend,
partage Google/Apple, refus natif dès le premier appel, annulation, code absent
ou numérique, absence de token, reprise après échec, fermeture de l'écran,
changement de session, passage à l'inscription et erreur d'analytics.
TypeScript sans émission réussi ; ESLint ciblé sans erreur, avec un avertissement
préexistant de dépendance de l'effet de disponibilité Apple dans
`useAuthController.ts`. Frontières réseau validées, 968 sources sous la limite
de 400 lignes et `git diff --check` réussi.

**Sources et limites.** Vérification du code de la version installée du SDK et
de sa [gestion officielle des erreurs](https://react-native-google-signin.github.io/docs/errors)
ainsi que du [contrat de configuration](https://react-native-google-signin.github.io/docs/original).
Aucun essai de connexion réelle, aucune validation native sur un téléphone
affecté, aucun déploiement. À vérifier avec une build de production : premier
appui à froid, reprise après arrière-plan, annulation, services Google Play
anciens et réseau lent. Si le SDK reste occupé indépendamment de l'app, le
message est traité mais sa disparition ne peut pas être annoncée. Le modèle
du téléphone et le message original ont été demandés pour affiner ce cas.

## 29–30 septembre 2026 — Parcours conducteur piloté par le serveur

**Périmètre et problème constaté.** Cette intervention complète et remplace
l'approche de présentation décrite dans l'entrée suivante. Les informations
étaient désormais cohérentes dans un même instantané, mais le mobile devait
encore déduire l'étape conducteur. Le serveur ne renvoyait pas la prochaine
action et `stats.vehicles` comptait aussi les véhicules inactifs. Le cumul des
boutons de vérification, d'activation et de réessai restait ambigu ; un rôle
conducteur existant n'indiquait pas nécessairement le droit actuel de publier.

**Solution appliquée — backend local `zwanga-backend`.**

- Nouveau `src/users/profile-state.ts` : `GET /users/me` ajoute `profileState`
  version 1, lié au compte, avec identité, étape conducteur, prochaine action,
  véhicules actifs appartenant au compte et éligibilité à publier. `user` et
  `stats` restent compatibles. Les réponses sont calculées, sans écriture
  d'activation à la consultation du profil.
- `src/users/users.service.ts` et `users.controller.ts` exposent ce contrat.
  L'ordre d'identité `createdAt DESC, id DESC` est partagé avec
  `driver-activation.ts`, la lecture KYC et `didit-kyc.service.ts`. Un ancien
  document mis à jour tardivement ne remplace plus le dernier document créé
  dans ces lectures. Une session Didit non commencée reste à commencer.
- Un passager doit demander explicitement le parcours. Une identité en cours
  permet déjà d'ajouter un véhicule ; avec véhicule actif, l'action devient
  une actualisation du statut, sans renvoyer de documents. Une identité
  approuvée et un véhicule actif permettent de finaliser l'activation.
  Les comptes restreints sont orientés vers le support. Les autorisations
  effectives restent contrôlées par le backend à chaque opération.

**Solution appliquée — app.**

- `types/identity.ts`, `features/profile/profileStateContract.ts`,
  `store/api/user/profileMapper.ts` et `getProfileSummary.endpoints.ts`
  transportent et valident le contrat. Un contrat partiel, inconnu ou d'un
  autre compte ne permet pas de démarrer le parcours. Le décodage des anciennes
  réponses reste disponible pour l'affichage, pas pour inventer une étape.
- `features/profile/profileStatusModel.ts`,
  `hooks/profile/useProfileData.ts` et `useProfileController.ts` utilisent
  l'étape du serveur. Un conducteur incomplet voit « Profil conducteur à
  compléter », et non un badge laissant croire que tout est prêt à publier.
  Une lecture de véhicules en retard ne bloque plus l'affichage du profil.
- `features/profile/driverJourneyPresentation.ts` et
  `components/profile/ProfileDriverJourney.tsx` affichent les prérequis et
  une seule action principale. `ProfileDashboard.tsx` remplace les actions
  concurrentes pendant le parcours. La vérification facultative du passager
  reste indépendante et explique son utilité pour réserver 3 places ou plus.
- `hooks/profile/useProfileOnboarding.ts` relit le profil avant chaque action
  et après une demande/activation. L'action choisie est celle de la réponse
  fraîche, pas du cache. Une erreur conservant des données en cache ne lance
  ni Didit ni mutation. Verrou commun contre les doubles appuis ; contrôles
  du compte, de la session et de la visibilité après les attentes. Une
  activation déjà effectuée par la demande de parcours n'est pas rejouée.
- `ProfileStatusNotice.tsx`, `ProfileHeader.tsx`,
  `features/profile/ProfileHeader.styles.ts` et `app/(tabs)/profile.tsx`
  conservent l'écran en réseau dégradé avec une indication discrète du dernier
  statut connu. Les libellés longs peuvent revenir à la ligne ; la section
  vide de véhicules n'ajoute plus un second bouton concurrent au parcours.

**Comportements conservés et précautions.** Pas de promotion/démotion
automatique lors d'un GET, pas de rôle déduit d'un véhicule ou d'un booléen
local, pas de nouvelle vérification si l'identité est déjà approuvée/en cours.
Les activations existantes après Didit ou ajout de véhicule restent en place.
PIN/OTP, paiements, accès aux services et pause des neuf lectures d'affichage
sur écran inactif sont conservés. Aucune migration, aucun polling ajouté,
aucune modification massive de comptes. Le skill frontend a guidé la
présentation « statut, prérequis, action unique » sans nouveau décor ni
animation. Les consignes PostgreSQL ont guidé la lecture KYC ordonnée :
aucun nouvel index ni gain SQL revendiqué sans mesure sur base réelle.

**Vérifications réalisées.** 103 tests JavaScript réussis dans
`profileServerStatus`, `profileServerStatusUI`, `profileModules`,
`screenIdlePolicy`, `passengerSeats`, `identityQueryLifecycle`, `accountTabs`,
`otpDelivery`, `pinReset` et `vehiclePlate`. Ils couvrent notamment les étapes
serveur, le cache après une erreur 503 avec RTK Query réel, la reprise réseau,
les contrats incomplets, les doubles appuis, le changement de compte, les
réponses après fermeture et l'absence de boutons concurrents. Backend :
63 tests Jest réussis dans `profile-state.spec.ts`, `driver-activation.spec.ts`,
`didit-kyc.service.spec.ts` et `users.service.otp.spec.ts`, avec dépendances
simulées. TypeScript mobile sans émission et TypeScript backend de production
(`tsconfig.build.json`) réussis. Frontières réseau et limite des 400 lignes
validées. ESLint ciblé mobile et sur les deux nouveaux fichiers TypeScript
backend : aucune erreur ni avertissement. `git diff --check` réussi dans les
deux dépôts. Le contrôle TypeScript global backend, incluant toutes les specs,
signale 14 erreurs dans des tests non modifiés : activity/booking, keccel-otp,
payments/pawapay, trip-request-privacy, legal-identity, user-gender et
wallet/trip-loyalty. Ces erreurs hors périmètre ne sont pas corrigées par cette
intervention ; le contrôle de production exclut les fichiers de tests.

**Livraison et limites.** Déployer le backend **avant** le client utilisant
`profileState`. Sans ce contrat, le mobile propose l'actualisation mais ne
déduit pas une action conducteur. Aucun déploiement réalisé. Tests sur
dépendances simulées : pas de requête de vérification ou d'OTP réelle, pas
d'essai sur appareil physique ni de validation de rendu natif. À valider sur
téléphone : petits écrans/grandes polices, première ouverture en réseau lent,
coupure puis reprise, retour Didit approuvé/en cours/rejeté, ajout de véhicule
pendant l'examen et activation effective. Le dernier statut connu hors ligne
ne garantit pas l'absence de changement distant ; les actions relisent le
serveur et restent soumises aux contrôles de l'API.

## 29 septembre 2026 — Profil : cohérence du rôle et de l'identité en réseau dégradé

**Périmètre et problème constaté.** Le profil mélangeait le rôle issu de
`/users/me` (ou de l'utilisateur d'authentification local en repli), le
statut d'identité d'une requête indépendante et le résultat de la liste
des véhicules. Une réponse d'identité absente après un échec réseau était
interprétée comme non approuvée. `needsDriverOnboarding` devenait alors vrai,
et le contrôleur proposait « Devenir conducteur » même à un compte dont le
badge conducteur était affiché. Le badge d'identité utilisait encore un
autre booléen que la section de vérification.

**Contrat serveur vérifié en lecture seule.** Dans le backend local,
`UsersService.getProfileSummary` charge déjà le rôle, les documents d'identité
et les statistiques de véhicules dans sa réponse `/users/me`.
`driverRequirements` sélectionne le document d'identité le plus récent par
`createdAt` puis `id` décroissants. L'activation reste décidée par le serveur,
et le rôle conducteur d'anciens comptes peut être conservé même lorsqu'un
prérequis manque : un rôle conducteur ne prouve donc pas à lui seul une
identité approuvée. Aucune modification backend effectuée.

**Solution appliquée.**

- `store/api/user/profileIdentityMapper.ts` et
  `store/api/user/profileMapper.ts` extraient le dernier statut d'identité
  fourni par le serveur, selon l'ordre utilisé pour l'activation. Seuls
  statut, fournisseur, état Didit et motif de rejet sont ajoutés au résumé,
  sans copier les fichiers ou métadonnées du prestataire.
  `types/identity.ts` distingue une identité absente confirmée (`null`) d'une
  information manquante/invalide (`undefined`). Le booléen d'identité de
  l'utilisateur mappé suit également ce dernier document, et non un ancien
  document approuvé qui pourrait encore figurer dans l'historique.
- `features/profile/profileStatusModel.ts` centralise les décisions à partir
  d'une seule réponse `/users/me`, dont l'identifiant doit correspondre au
  compte connecté. Ni un véhicule ni un ancien indicateur `isDriver` ne
  remplacent le rôle serveur. Les données manquantes ne deviennent pas
  automatiquement un statut passager, une identité refusée ou zéro véhicule.
- `hooks/profile/useProfileData.ts` utilise ce modèle pour les badges,
  prérequis et actions. La lecture indépendante de l'identité est supprimée
  de l'affichage du profil. La liste détaillée des véhicules garde sa propre
  requête et son état d'erreur, sans déterminer le rôle ni les prérequis.
  Les lectures explicites de rafraîchissement de l'identité restent disponibles
  pour les parcours existants. Le profil n'utilise plus l'utilisateur local
  comme preuve d'un statut en l'absence de réponse serveur.
- `components/profile/ProfileHeader.tsx`, `ProfileDashboard.tsx` et
  `ProfileIdentitySection.tsx` partagent les mêmes indicateurs d'identité.
  Un statut inconnu propose une actualisation, pas une nouvelle vérification.
  `ProfileStatusNotice.tsx` et `app/(tabs)/profile.tsx` signalent l'échec de
  l'actualisation. Sans profil serveur correspondant au compte, aucun badge
  ni tableau de bord n'est affiché : réessai et déconnexion restent proposés.
  Avec une réponse précédemment reçue, les dernières informations confirmées
  sont conservées et explicitement signalées comme non actualisées.
- `hooks/profile/useProfileController.ts` ne propose « Devenir conducteur »
  qu'à un compte non conducteur dont le statut est disponible. Un conducteur
  dont un prérequis manque réellement côté serveur voit l'action adaptée
  (« Voir mon identité » ou « Ajouter un véhicule »), sans réactivation.
  Les informations indisponibles orientent vers « Actualiser le profil ».
- `hooks/profile/useProfileOnboarding.ts` protège également les callbacks
  et liens directs : aucun lancement Didit, demande d'activation ou choix de
  prérequis fondé sur une information inconnue/en erreur. Un conducteur
  confirmé n'envoie pas une nouvelle demande de rôle. Si la demande de
  parcours active déjà le compte côté serveur, une lecture du profil remplace
  une seconde activation inutile.

**Comportements conservés et précautions.** L'identité des passagers reste
indépendante du statut conducteur. Les états approuvé, en cours, rejeté et
session Didit non commencée restent distingués ; un refus réellement confirmé
par le serveur n'est pas masqué. Le cache utilisé est la dernière réponse
serveur du même compte, pas une déduction optimiste. Une panne ne révoque ni
n'accorde un rôle et ne déconnecte pas automatiquement. Aucun polling ajouté.
Les lectures d'affichage en pause passent de dix à neuf avec la suppression
de la requête KYC du profil ; les dépendances de paiement restent actives
selon leur politique existante. Ce comptage de requêtes n'est pas une mesure
de consommation ou de performance sur appareil.

**Vérifications réalisées.** 95 tests JavaScript ciblés réussis :
`profileServerStatus.test.js`, `profileServerStatusUI.test.js`,
`profileModules.test.js`, `screenIdlePolicy.test.js`, `passengerSeats.test.js`,
`identityQueryLifecycle.test.js`, `accountTabs.test.js`, `otpDelivery.test.js`,
`pinReset.test.js` et `vehiclePlate.test.js`. Les nouveaux tests couvrent le
chargement lent, l'échec initial, la conservation du cache après erreur 503
avec RTK Query réel, la reprise du réseau, le changement de compte, l'ordre
des documents serveur, les états d'affichage et l'absence de mutations à
partir d'un statut indisponible. TypeScript sans émission, frontières réseau,
limite des 400 lignes et `git diff --check` réussis. ESLint ciblé : aucune
erreur ; un avertissement préexistant (`showDialog` inutilisé dans le contrôleur).

**Limites restantes.** Aucun essai physique ni rendu natif validé pour cette
correction, aucun déploiement. Les erreurs réseau sont simulées en JavaScript.
À vérifier sur téléphone : ouverture du profil en réseau lent, coupure après
un premier chargement, reprise puis « Réessayer », et retour après Didit ou
ajout de véhicule. Hors connexion, le dernier statut confirmé ne garantit
pas qu'aucun changement distant plus récent n'a eu lieu ; le message de
non-actualisation le précise et le serveur reste l'autorité des opérations.

## 29 septembre 2026 — OTP : guider vers WhatsApp via Didit

**Périmètre et problème constaté.** Analyse en lecture seule du commit backend
`fe15208`, des services OTP, des parcours téléphone/PIN et de
`docs/auth/otp-providers.md`. Le fournisseur Didit privilégie WhatsApp, avec
possibilité de secours SMS documentée côté backend. L'application indiquait
encore « chiffres reçus par SMS », y compris dans la récupération de PIN,
les confirmations de renvoi et l'aide. Le convertisseur d'erreurs traitait
tout message contenant « OTP » comme un code invalide : les limitations
d'envoi et les indisponibilités du fournisseur devenaient trompeuses.

**Contrat backend constaté.** Les endpoints téléphone et récupération PIN
restent inchangés. Le téléphone utilise cinq chiffres, le PIN oublié six.
La vérification Didit est liée au numéro, à la requête et à sa référence
interne ; le fournisseur est conservé avec le challenge. Un renvoi Didit
peut réutiliser le challenge sans prolonger sa validité initiale. Aucun
repli automatique vers l'ancien fournisseur après un échec d'envoi.
L'OTP d'inscription reste facultatif ; les réponses de demande de
réinitialisation restent identiques pour les comptes inconnus ou inéligibles.
L'API ne fournit pas à l'app le canal de livraison réellement utilisé.
Cette lecture ne vérifie ni la configuration ni la livraison en production.

**Solution appliquée dans l'application.**

- `features/auth/otpDelivery.ts` centralise les textes WhatsApp/Didit, le
  secours SMS et les confirmations conditionnelles de récupération du PIN.
- `components/auth/OtpDeliveryNotice.tsx` affiche un repère compact
  « WhatsApp via Didit », l'instruction de consulter WhatsApp puis revenir
  saisir le code, et le secours SMS. Pas de carte supplémentaire, de texte
  tronqué ou de hauteur fixe ; agrandissement de police conservé. Le skill
  frontend a guidé cette hiérarchie courte, sans animation additionnelle.
- `components/auth/steps/PhoneStep.tsx` et `GooglePhoneStep.tsx` présentent
  le canal avant l'envoi uniquement si l'OTP d'inscription est activé.
  `SmsStep.tsx`, `GoogleOtpStep.tsx` et `ResetPinStep.tsx` réutilisent le
  repère lors de la saisie. `app/auth.tsx` transmet également le numéro à
  vérifier à l'étape de récupération du PIN.
- `components/auth/steps/PinStep.tsx` et
  `components/profile/ProfilePinModal.tsx` expliquent le canal de récupération
  près de « J'ai oublié mon PIN ». La modale réutilise le repère lors de
  la saisie, sans annoncer une livraison réussie avant la réponse serveur.
- `hooks/auth/usePhoneAuthActions.ts`, `useSocialPhoneVerification.ts`,
  `usePinResetFlow.ts` et `hooks/profile/useProfilePin.ts` harmonisent les
  confirmations d'envoi/renvoi et les instructions après expiration ou
  réinitialisation non confirmée. Aucun nouveau code ni renouvellement de
  validité n'est promis lors d'un renvoi.
- `components/support/supportData.ts` corrige l'aide à l'inscription.
  `utils/errorHelpers.ts` distingue les refus temporaires 429 et incidents
  serveur 5xx des codes invalides/expirés, et conserve les messages métier
  tels qu'une autre vérification déjà en cours.

**Comportements conservés et précautions.** Aucun OTP nouvellement imposé à
l'inscription, aucune modification backend, aucun appel réseau additionnel.
Les contrats cinq/six chiffres, le PIN à quatre chiffres, le collage,
les suggestions système `sms-otp`/`oneTimeCode` compatibles avec le secours
SMS, les états occupés et les étapes de navigation restent inchangés.
Le jeton de réinitialisation reste à usage unique et non persisté ; une
réinitialisation ne connecte pas automatiquement l'utilisateur. La réponse
conditionnelle ne divulgue pas l'existence d'un compte. Pas d'ouverture
automatique de WhatsApp, de permission supplémentaire ou de supposition
sur le nom exact de l'expéditeur WhatsApp.

**Vérifications réalisées.** 74 tests JavaScript ciblés réussis dans
`otpDelivery.test.js` (nouveau), `pinReset.test.js`, `profileModules.test.js`,
`authNavigationSession.test.js`, `passengerSeats.test.js`,
`tripRequestEditPricing.test.js` et `vehiclePlate.test.js`. Couverture des
textes, du masquage lorsque l'OTP est désactivé, des cinq/six champs,
du collage, du renvoi, des erreurs Didit et de la preuve de récupération.
29 tests unitaires backend réussis dans `otp.service.spec.ts`,
`didit-otp.service.spec.ts`, `users.service.otp.spec.ts` et `pin-reset.spec.ts`.
TypeScript sans émission, contrôle des frontières réseau, limite des
400 lignes et `git diff --check` réussis. ESLint ciblé : aucune erreur,
neuf avertissements préexistants (types de tableaux, fonctions inutilisées,
ordre des imports), non modifiés dans cette intervention.

**Limites et pistes différées.** Les variantes Android/iOS sont simulées
dans les tests JavaScript : aucun rendu natif de cette modification ni
livraison réelle WhatsApp/SMS validés. Aucun OTP réel demandé, aucun
déploiement réalisé. À essayer sur téléphone : petits écrans, grande police,
aller-retour WhatsApp/app, collage du code, renvoi et récupération du PIN.
Une information de canal effective renvoyée par l'API permettrait d'adapter
plus finement les textes en cas de changement de fournisseur/configuration ;
cette évolution de contrat n'est pas appliquée ici.

## 29 septembre 2026 — Retour natif : accueil avant sortie, démarrage hors historique

**Périmètre et problème constaté.** Le bouton Retour du téléphone pouvait
remonter à l'écran de chargement. `app/_layout.tsx` déclarait `splash` comme
route initiale statique, utilisée comme ancre des liens directs. Les écrans
de démarrage restaient accessibles dans la pile et un simple `router.replace`
ne supprimait pas leurs éventuelles entrées précédentes. Un détail ouvert
directement ou remplaçant l'accueil pouvait aussi se retrouver sans accueil
derrière lui. Le comportement des onglets au retour n'était pas explicite.

**Solution appliquée.**

- `app/_layout.tsx` ne définit plus `splash` comme ancre permanente.
  `app/index.tsx` conserve son entrée de démarrage existante vers `/splash`.
- `features/navigation/homeBackPolicy.ts` définit une correction idempotente
  de l'historique racine natif pour une session authentifiée. Elle retire
  les routes publiques antérieures lorsqu'un écran privé est actif, conserve
  l'accueil au bas de la pile ou l'ajoute lorsqu'il manque. Une nouvelle
  entrée dans les onglets établit une nouvelle base de retour ; les anciens
  détails/formulaires situés avant cette entrée ne sont pas rejoués.
  Les clés, paramètres et états imbriqués des écrans conservés restent intacts.
- `hooks/navigation/useHomeRootNavigation.ts` applique cette correction via
  `resetRoot` seulement si nécessaire et après disponibilité du navigateur.
  Il relit l'état courant pour ne pas écraser une ouverture récente provenant
  d'une notification. Le listener d'attente de disponibilité est nettoyé.
- `components/ProtectedAppStack.tsx` sépare le groupe des écrans de démarrage
  (`index`, splash, présentation initiale et information de localisation) du
  groupe protégé par session. Après avoir quitté le démarrage, ces routes ne
  sont plus accessibles pendant la durée de vie de cette pile native. La
  connexion reste publique ; la déconnexion ne donne pas accès à l'accueil.
- `app/(tabs)/_layout.tsx` fixe `initialRouteName="index"` et
  `backBehavior="initialRoute"` : Retour depuis un autre onglet sélectionne
  l'accueil, puis le Retour suivant est laissé au comportement système
  lorsqu'aucun écran ou dialogue ne le consomme.

**Comportements conservés et précautions.** Aucun gestionnaire global
`BackHandler` et aucun appel à `exitApp` ajouté. Les retours des détails,
confirmations de sortie des trajets actifs, protections des formulaires,
clavier, dialogues et nettoyage de la conversation conservent leurs handlers.
Les parcours de connexion/PIN ne sont pas redirigés par cette correction tant
qu'ils sont actifs. Les routes privées restent derrière le contrôle de session.
La correction par `resetRoot` et la fermeture du groupe de démarrage sont
limitées au natif, sans réécriture de l'historique du navigateur web. Aucun
timer d'inactivité ni affichage forcé du splash au retour du premier plan.
Un démarrage à froid peut toujours présenter le chargement et vérifier les
indicateurs de première ouverture. Aucun changement backend ou de jetons.

**Vérifications réalisées et limites.** **58 tests JavaScript ciblés réussis**
dans `homeBackNavigation.test.js`, `authNavigationSession.test.js`,
`accountTabs.test.js`, `chatLifecycle.test.js`, `driverInterruptionExit.test.js`
et `navigationLifecycle.test.js`. Les tests utilisent les implémentations
`StackRouter`/`TabRouter` installées ainsi que des hooks simulés : ancre accueil,
chaîne de retours, absence de réinitialisations répétées, conservation de l'écran
actif, liens directs, préparation du navigateur, démarrage/déconnexion et
gestionnaires métier. TypeScript (`--noEmit --incremental false`), ESLint ciblé,
frontières réseau, limite des 400 lignes et `git diff --check` réussis.
Les tests ne constituent pas un essai du bouton ou du geste natif.
À vérifier sur Android : connexion, changement d'onglet, plusieurs détails,
notification ouvrant un trajet, retour accueil puis sortie, réouverture et
trajet actif avec confirmation. Vérifier aussi le geste de retour iOS.
Aucun essai physique, déploiement ou mesure de performance effectué.

**Références vérifiées.** Le comportement d'ancre a été confronté au code
Expo Router installé et à la [documentation des paramètres du routeur](https://docs.expo.dev/router/advanced/router-settings/).
La suppression des entrées d'un groupe devenu inaccessible s'appuie sur les
[routes protégées Expo](https://docs.expo.dev/router/advanced/protected/).
La correction cible uniquement la pile racine via
[`resetRoot`](https://reactnavigation.org/docs/navigation-container/#resetroot),
sans substituer un nouveau gestionnaire aux retours métier.

## 29 septembre 2026 — Liste des demandes de trajet plus compacte et intuitive

**Périmètre et problème constaté.** L'écran `app/requests.tsx` consacrait une
grande partie de son espace à une carte explicative et répétait la création
d'une demande dans l'en-tête, cette carte et l'état vide. Les compteurs des
onglets pouvaient afficher zéro avant leur premier chargement. Il n'y avait
pas de recherche locale ni d'état d'erreur distinct ; une liste vide ne gardait
pas le geste de rafraîchissement. Cette intervention concerne la liste intitulée
« Demandes de trajet », pas le formulaire de création ou l'écran de détail.

**Solution appliquée.**

- `app/requests.tsx` affiche un en-tête court, deux onglets compacts avec état
  sélectionné accessible, une phrase d'orientation et une recherche par départ,
  arrivée ou nom. Le nombre de résultats et l'ordre de tri apparaissent dans
  la liste uniquement après chargement des données. L'onglet « Mes demandes »
  possède une seule action « Nouvelle demande », hors de la zone défilante.
- `features/requests/requestsListModel.ts` prépare un index textuel normalisé
  lors des changements de données. La recherche ignore accents, casse et ordre
  des mots sans géocodage ni appel réseau. Le changement d'onglet efface la
  recherche et remet la liste en haut. Les demandes personnelles avec réponse
  ou prise en charge non démarrée sont prioritaires, sans retirer l'historique.
- `hooks/requests/useRequestsData.ts` isole les lectures de l'onglet actif,
  suspend les abonnements et sondages lorsque l'écran est masqué et ne lit
  les coordonnées que pour les demandes disponibles visibles. L'identité doit
  être connue avant d'afficher cette liste afin d'en exclure les demandes du
  propriétaire. Un profil absent ou incomplet propose une nouvelle tentative.
- `features/requests/RequestsListState.tsx` distingue chargement, première
  demande, liste disponible vide, recherche sans résultat et erreur réseau.
  La `FlatList` reste montée pour permettre le rafraîchissement à vide. En cas
  d'échec d'actualisation, les données déjà chargées restent consultables avec
  un avertissement et une action « Réessayer ».
- Les styles de `features/screen-styles/app/requests/container.styles.ts` et
  `detailText.styles.ts` remplacent les anciennes grandes cartes explicatives
  et leurs styles inutilisés. La compétence `frontend-skill` a guidé la
  hiérarchie sobre, la réduction du texte et le maintien d'une action principale.
  Les commandes ont une hauteur minimale de 44 points et peuvent grandir avec
  leur texte. Aucun effet animé décoratif, image ou dépendance supplémentaire.
- `features/requests/RequestListCard.tsx` précise « En attente de conducteur »
  et « Voir et accepter ». Ce dernier bouton ouvre toujours le détail avant
  confirmation et n'est pas proposé pour une demande attribuée, annulée ou
  expirée selon les règles existantes. Ces libellés sont aussi visibles dans
  les autres listes utilisant ce composant, dont `app/my-requests.tsx`.

**Comportements conservés et précautions.** Les deux onglets restent accessibles
et « Disponibles » reste l'onglet initial. Le classement par proximité utilise
uniquement les coordonnées déjà connues ; sans position valide, il repose sur
les heures de départ. Les photos, budgets par place, horaires, offres, historique,
routes de navigation, contrôles de rôle et validations du détail sont conservés.
Aucune modification du backend, des paiements, du formulaire de demande ou des
délais d'expiration. Aucun tableau provenant du cache RTK Query n'est trié en
place. La liste reste virtualisée, avec six éléments au rendu initial et par lot.

**Vérifications réalisées et limites.**

- **46 tests JavaScript ciblés réussis** : `requestsListData.test.js`,
  `requestsScreen.test.js`, `personalListCards.test.js`,
  `homeRequestPriority.test.js` et `tripRequestExpiration.test.js`.
  Couverture : recherche/indexation, classement immuable, filtres propriétaire,
  onglets, création unique, navigation, réception d'erreur avec cache, reprise
  hors écran, actions de l'état vide, expiration et propriétés des styles.
- TypeScript (`--noEmit --incremental false`), ESLint ciblé, frontières réseau,
  limite des 400 lignes et `git diff --check` réussis.
- La suite globale `sourceExtractions.test.js` donne cinq réussites et deux
  échecs préexistants : empreintes des styles et de `confirmCashReceipt`.
  Une comparaison en lecture seule des fichiers et références de `HEAD`
  confirme les écarts antérieurs pour revenus conducteur, publication, onglet
  des trajets et réception cash. Seule l'empreinte de l'écran demandes est
  actualisée dans `tests/fixtures/sourceExtractions.json` ; elle est également
  vérifiée séparément dans le test ciblé de cet écran.
- Les tests utilisent des rendus et transports simulés, pas des appareils
  physiques. Aucun gain CPU, mémoire ou batterie mesuré. Vérifier sur Android
  et iOS le petit écran, la grande taille de police, le clavier ouvert, le
  balayage de rafraîchissement à vide, le réseau coupé et le retour du détail.
  Aucun déploiement réalisé.

## 29 septembre 2026 — Revenus conducteur : cash informatif et états de retrait

**Périmètre et problème constaté.** L'écran des revenus ne présentait pas le
cash confirmé reçu des passagers séparément du solde retirable. Les termes
« disponible au versement » et « déjà versé » ne rendaient pas suffisamment
explicite la distinction entre gains retirables, retraits en cours et retraits
effectués. Les écritures de gains portant le mode `cash` dans le backend local
correspondent à une participation financée par Zwanga, et non aux espèces
remises par le passager. À la demande explicite de l'utilisateur, cette
participation reste retirable ; seul le cash passager est informatif.

**Solution appliquée dans le mobile.**

- `app/driver-earnings.tsx` conserve le solde retirable comme montant principal,
  affiche « Retrait en cours » et « Déjà retiré », et explicite les sources
  admissibles : paiements électroniques, jetons et participations Zwanga
  créditées. Ces trois montants proviennent toujours du résumé serveur, jamais
  des lignes de la page d'historique. Le bouton devient « Retirer mes gains ».
- `features/driver-earnings/CashRevenueSummary.tsx` affiche le total des
  réceptions cash confirmées dans une zone neutre, sans commande de retrait,
  avec la mention « Non retirable ». Un champ absent sur un ancien serveur ou
  invalide affiche une indisponibilité, pas un zéro supposé.
- `features/driver-earnings/DriverEarningRow.tsx` identifie la participation
  Zwanga comme un crédit financé hors espèces reçues. Les écritures annulées
  ne portent plus le signe positif d'un gain crédité. Une écriture disponible
  est appelée « Crédit net », sans prétendre qu'elle reste individuellement
  retirable après un retrait du solde mutualisé.
- `features/driver-earnings/PayoutHistory.tsx` distingue les retraits effectués
  des opérations en cours ou échouées. Les styles sont dans
  `features/screen-styles/app/driver-earnings/container.styles.ts` ; le champ
  facultatif `cashReceivedAmount` est déclaré dans `types/earnings.ts`.
- `store/api/booking/cashReceipt.endpoints.ts` invalide aussi le résumé des
  revenus après confirmation réussie d'une réception cash.

**Solution appliquée dans le backend local `zwanga-backend`.**
`src/driver-settlements/driver-cash-summary.ts` calcule `cashReceivedAmount`
par une seule agrégation sur les réservations, jointe à leurs trajets et
filtrée par conducteur propriétaire, conducteur ayant confirmé la réception,
mode cash, devise du résumé et date de réception renseignée. Seul
`cashReceivedAmount` est additionné : ni le tarif brut, ni la subvention, ni le
cash simplement attendu. `src/driver-settlements/driver-settlements.service.ts`
expose ce total sur `GET /driver-settlements/me`, indépendamment des soldes.
Aucun changement de schéma, de formule de retrait ou d'écriture comptable.
Les modifications OTP déjà présentes dans ce dépôt n'ont pas été touchées.

**Comportements conservés et précautions.** Les paiements électroniques et en
jetons, la participation Zwanga, les commissions, le KYC, les réservations des
montants en cours, l'idempotence et la reprise après réponse réseau incertaine
gardent leur logique existante. La confirmation cash ne crée aucun crédit
retirable ni transfert. La pagination, la liste virtualisée, la suspension des
lectures hors écran et le choix du destinataire Mobile Money restent en place.
La compétence d'interface a guidé la hiérarchie visuelle et les libellés ; les
règles Postgres ont guidé l'agrégation côté serveur sans lecture par réservation.

**Vérifications réalisées et limites.**

- **47 tests JavaScript mobiles réussis** : `driverPayout.test.js`,
  `driverPayoutDestination.test.js`, `driverEarningsPresentation.test.js`,
  `cashReceipt.test.js`, `financeHistory.test.js`. Ils couvrent notamment le
  cash seul avec solde retirable nul, le montant effectivement demandé sans
  ajout du cash, les trois soldes sur une page vide, les libellés, les données
  absentes, l'invalidation du cache et la reprise des retraits incertains.
- **44 tests Jest backend réussis** : `driver-cash-summary.spec.ts`,
  `driver-cash-subsidy.spec.ts`, `driver-settlements.service.spec.ts`,
  `driver-payout-recovery.spec.ts` et `bookings/cash-receipts.spec.ts`.
  Les dépôts sont simulés : ces tests contrôlent les filtres de la requête et
  l'indépendance des soldes, pas une exécution PostgreSQL réelle.
- TypeScript mobile et backend (`--noEmit --incremental false`), ESLint mobile
  ciblé, contrôle des frontières réseau et limite des 400 lignes réussis.
- Aucun essai physique Android/iOS, mesure SQL/EXPLAIN, virement réel ou
  déploiement effectué. Déployer le backend pour disposer du total cash ;
  l'application reste compatible avec l'ancien serveur, mais affiche ce total
  comme indisponible. Les anciennes réceptions non confirmées ne sont pas
  inventées ni rétrospectivement créditées. Valider sur appareil les comptes
  cash seul, électroniques/jetons, participation Zwanga et retraits en cours.

## 28 septembre 2026 — Réduction des lectures et timers hors écran

**Périmètre et problème constaté.** Le détail d'un trajet lisait et sondait
l'ensemble des réservations du passager, même pour un trajet actif, et gardait
plusieurs abonnements de lecture lorsque l'écran était recouvert. La navigation
conducteur redemandait les positions passager absentes toutes les 10 secondes
sans ralentissement. Le créneau prédéfini du formulaire de demande se recalculait
toutes les 30 secondes même lorsque ce formulaire restait monté hors écran.

**Solution appliquée.** `hooks/trip-detail/useTripDetailData.ts` utilise
`getMyActivityBookings` pour un trajet passager à venir/en cours, garde la liste
historique pour un trajet terminé/annulé et ne lit pas les réservations passager
sur le détail conducteur. Le flux d'activité ne crée plus de sondage propre :
`AccountActivityCoordinator` rafraîchit déjà ce cache sur changement de révision.
Les requêtes du trajet et des réservations se désabonnent hors écran, puis sont
relues au retour. `hooks/trip-detail/useTripDetailBookingState.ts` suspend aussi
les lectures d'identité et d'avis masquées ; les signatures du contrôleur et des
actions de sécurité sont ajustées dans `useTripDetailController.ts` et
`useTripDetailSafetyActions.ts`. Dans
`hooks/driver-navigation/useDriverTrackingSocket.ts`, les demandes de positions
manquantes suivent un délai de 10, 20, 40 puis 60 secondes maximum, réinitialisé
après un nouveau point de passage, une déconnexion ou le retour de positions
fraîches. `hooks/trip-request/useRequestTripController.ts` transmet l'état réel
de visibilité à `useRequestSchedule.ts`, qui arrête son intervalle hors écran et
recalcule immédiatement le créneau au retour.

**Comportements conservés et précautions.** Les trajets terminés gardent accès
aux anciennes réservations ; la lecture d'activité couvre les réservations
inachevées et les changements récents selon le contrat backend local inspecté,
sans modification de ce backend. Les rafraîchissements explicites, le suivi des
réservations conducteur, les mutations, la position GPS métier et les événements
WebSocket ne sont pas ralentis. Une position passager fraîche supprime toujours
la demande de secours ; un nouveau passager rétablit la cadence courte. Le choix
manuel d'une heure reste inchangé. Le gel natif des écrans n'est pas modifié.

**Vérifications et limites.** `tests/tripDetailReadPolicy.test.js`,
`tests/requestScheduleIdle.test.js` et `tests/driverTrackingPolling.test.js`
contrôlent les lectures selon le rôle et l'état du trajet, la suspension hors
écran, le retour du formulaire et dix minutes simulées sans GPS passager.
Les 10 tests ciblés, les 19 tests de performance et les 43 tests de demande de
trajet ont réussi, ainsi que 61 tests de navigation et 26 tests de coordination
d'activité/récupération (dont un test ciblé répété). TypeScript, contrôle des
frontières réseau, limite des
400 lignes et `git diff --check` ont réussi ; ESLint ciblé : zéro erreur,
8 avertissements préexistants dans `useTripDetailBookingState.ts`.
Les tests JavaScript simulent les hooks et transports ; ils ne mesurent ni la
charge SQL réelle, ni le nombre de requêtes en production, ni CPU, mémoire ou
batterie sur téléphone. Vérifier en release Android/iOS un trajet long avec
passager sans partage de position, veille/reprise, détail recouvert, et un
historique de réservations important. Aucun essai physique ni déploiement n'a
été effectué dans cette intervention.

## 28 septembre 2026 — Places proposées selon le véhicule lors de la publication

**Périmètre et problème constaté.** Dans le formulaire de publication, le nombre
de places était initialisé à 4 indépendamment du véhicule. Après avoir choisi une
moto à deux ou trois roues, un conducteur pouvait conserver ce nombre et devoir
revenir à l'étape précédente pour le corriger.

**Solution appliquée.** `features/publish/publishSeatPolicy.ts` définit 2 places
pour une moto à deux roues, 3 pour une moto à trois roues et au moins 4 pour une
voiture. `hooks/publish/usePublishController.ts` transmet le type du véhicule
sélectionné à `hooks/publish/usePublishFormState.ts`, qui calcule aussitôt le
nombre affiché, confirmé et envoyé à la publication. `app/publish.tsx` transmet
également ce type à `features/publish/PublishPricingStep.tsx` : les boutons de
réglage disparaissent pour les motos et la voiture ne peut pas descendre sous
4 places. Les styles associés sont dans
`features/screen-styles/app/publish/publishMapPreviewShade.styles.ts`.

**Comportements conservés et précautions.** Une voiture peut toujours proposer
plus de 4 places ; son choix supérieur est conservé si le conducteur change
temporairement de type de véhicule puis revient à la voiture. Le prix, le trajet
gratuit, la description et les autres étapes de publication restent inchangés.
La même valeur calculée sert à l'écran de confirmation et aux publications
simples ou récurrentes, sans attendre une mise à jour asynchrone du formulaire.

**Vérifications et limites.** `tests/publishSeatSelection.test.js` couvre les
capacités, les changements de véhicule et les commandes de l'étape tarifaire.
Avec les tests voisins de places passager et de véhicules : **21 tests JavaScript
réussis, zéro échec**. TypeScript (`tsc --noEmit --incremental false`), ESLint
ciblé, limite des 400 lignes et `git diff --check` ont réussi. Ces contrôles
sont simulés ou statiques ; aucun essai sur appareil physique ni publication
réelle avec le backend n'a été effectué.

## 28 septembre 2026 — Barre d'onglets et en-tête « Mes trajets »

**Périmètre et problème constaté.** Sur les captures Android fournies, les
angles supérieurs arrondis de la barre d'onglets laissent apparaître l'arrière-plan
aux deux extrémités, surtout sous la feuille de l'accueil. Dans « Mes trajets »,
le titre, deux rangées de filtres, la recherche toujours visible et deux boutons
de publication occupent beaucoup d'espace avant la liste ; le bouton flottant
recouvre aussi des cartes.

**Solution appliquée.** `app/(tabs)/_layout.tsx` donne à la barre d'onglets un
fond blanc continu sans arrondi supérieur, sur Android et iOS, tout en conservant
son placement iOS et ses marges de zone sûre. `features/trips/TripsHeader.tsx`
regroupe l'en-tête : publication nommée dans la ligne du titre, choix
« Publiés/Réservations » compact, filtre « À venir/Historique » et recherche
ouvrable à la demande. Fermer la recherche efface aussi le filtre pour éviter une
liste filtrée sans champ visible. `app/(tabs)/trips.tsx` utilise cet en-tête et
retire le bouton flottant en double ; les styles sont ajustés dans
`features/screen-styles/app/tabs/trips/container.styles.ts` et `index.ts`, et
l'ancien `fab.styles.ts` devenu inutilisé est supprimé.

**Comportements conservés et précautions.** La publication passe toujours par
`/publish`, les catégories et filtres gardent leurs mêmes données et le changement
de catégorie revient à « À venir ». Recherche, effacement, gestion des trajets
réguliers, cartes, actions modifier/supprimer, pagination et rafraîchissement ne
sont pas modifiés. Les cibles de l'en-tête restent d'au moins 44 points ; la
recherche n'ajoute une rangée que lorsqu'elle est utilisée.

**Vérifications et limites.** `tests/tripsHeaderLayout.test.js` couvre l'ouverture
et la fermeture de la recherche, l'effacement du filtre caché, les actions et
les tailles de cible. `tests/accountTabs.test.js` vérifie la barre continue sur
Android et iOS et suit le nouvel emplacement des routes protégées. Avec les
tests voisins d'accueil et de cartes : **23 tests JavaScript réussis, zéro échec**.
TypeScript, limite des 400 lignes et `git diff --check` réussis. Ces vérifications
sont statiques ou simulées en JavaScript ; aucune capture après correction ni
vérification visuelle sur les téléphones concernés n'a été réalisée.

## 28 septembre 2026 — Accès aux écrans privés après interruption de l'authentification

**Périmètre et problème constaté.** Application mobile, restauration de session et
navigation après connexion/inscription interrompue. L'état d'authentification
pouvait être déclaré actif dès que deux chaînes de jetons existaient, même sans
identifiant de compte exploitable. Le garde de navigation redirigeait après le
rendu, ce qui pouvait laisser le profil, la publication ou la demande de trajet
accessibles sans session utilisable.

**Solution appliquée.** `features/auth/sessionPolicy.ts` définit une session
récupérable par une identité lisible dans le jeton d'accès et un jeton de
rafraîchissement daté et non expiré. `store/slices/authSlice.ts` rejette les
nouveaux jetons invalides avant leur stockage, écarte les jetons stockés
inutilisables au démarrage et accepte `userId` si le jeton n'utilise pas `sub`.
`services/tokenRefresh.ts` refuse également une réponse de renouvellement
inutilisable. `store/selectors/index.ts` expose la même règle aux écrans.
`components/ProtectedAppStack.tsx` protège toutes les routes privées au niveau
du navigateur ; `app/_layout.tsx` l'intègre. `components/AuthGuard.tsx`,
`app/splash.tsx` et `app/background-location-disclosure.tsx` orientent vers
l'entrée d'authentification lorsque cette session n'existe pas.

**Comportements conservés et précautions.** Une session avec jeton d'accès
expiré reste récupérable si son jeton de rafraîchissement est encore valide ;
le renouvellement avant requête HTTP et la conservation du contexte hors ligne
restent en place. Les écrans publics de bienvenue et d'authentification restent
accessibles. Le nettoyage au démarrage utilise la version de session initiale
pour ne pas effacer une connexion plus récente. Le test de couverture des routes
signale tout nouvel écran privé oublié dans la protection.

**Vérifications et limites.** `tests/authNavigationSession.test.js` couvre les
jetons sans identité, expirés ou mal formés, le refus de les enregistrer, leur
nettoyage au redémarrage et la présence des routes privées dans le garde.
Avec les tests existants de cycle d'authentification et de requêtes : **12 tests
JavaScript réussis, zéro échec**. TypeScript (`tsc --noEmit --incremental false`),
ESLint ciblé, `check:network`, `check:source-size` (950 sources, aucune au-dessus
de 400 lignes) et `git diff --check` réussis. Ces contrôles sont des tests
JavaScript et des analyses statiques ; aucun essai sur appareil physique ni
validation avec le backend réel n'a été effectué. La validation des jetons par
signature et les autorisations des opérations restent du ressort du backend.

## 25 septembre 2026 — Correctifs du contre-audit de performance

**Problèmes.** Attente GPS ponctuelle non bornée, lectures répétées de session et
vérifications natives pendant le trajet, abonnements d'identité non libérés,
polling des retraits même sans opération à suivre.

**Solutions appliquées.** Acquisition GPS bornée (10 s pour la position fraîche,
2 s par lecture en cache), déduplication des opérations natives encore en cours
et abandon des consommateurs périmés. Cache de session passager de 30 s avec
écritures/suppressions sérialisées, contrôle natif espacé et forcé à la reprise.
Lectures RTK d'identité non abonnées et invalidations de succès centralisées.
Polling des retraits conditionné à une opération non terminale ou une intention
incertaine. Détail des fichiers, précautions et tests dans
[PERFORMANCE_FOLLOWUP_FIXES_2026_09_25.md](PERFORMANCE_FOLLOWUP_FIXES_2026_09_25.md).

**Préservation.** Suivi continu, précision GPS, automatisations du trajet,
permissions, reprise après veille, réservation de plusieurs places, montants et
idempotence des retraits inchangés. Une erreur temporaire du stockage n'est pas
confondue avec une fin de trajet. Les attentes expirées ne retiennent pas leurs
listeners et ne relancent pas plusieurs acquisitions natives simultanées.

**Vérifications.** Suite JavaScript finale : **1 036 tests réussis, zéro échec**.
`tsc --noEmit --incremental false` et ESLint ciblé sur les huit fichiers applicatifs
modifiés réussis, sans erreur ni avertissement.
Le mock de contact et les empreintes historiques devenus obsolètes sont actualisés
sans retirer les assertions comportementales correspondantes. Frontière réseau,
limite des 400 lignes (948 sources) et `git diff --check` réussis.

**Limites.** Tests natifs simulés, aucun essai physique ni profilage de chauffe.
Le timeout GPS libère l'interface ; Expo n'expose pas d'annulation de son appel
ponctuel natif, qui reste partagé jusqu'à sa résolution. Aucun déploiement.

## 25 septembre 2026 — Contre-audit de performance après les derniers changements

**Demande.** Vérifier les risques résiduels après les correctifs de fiabilité et
la simplification du portefeuille, sans modifier les fonctionnalités.

**Intervention.** Audit statique, suite JavaScript complète et reproductions en
mémoire. Documentation uniquement : aucun correctif applicatif ni déploiement.
Trois points P2 (attente GPS ponctuelle, lectures GPS répétées, abonnements
d'identité non libérés) et une optimisation P3 (polling des retraits) sont proposés
dans [le contre-audit détaillé](PERFORMANCE_FOLLOWUP_2026_09_25.md).

**Validation.** TypeScript, frontière réseau et limite de 400 lignes réussis
(947 sources). Suite : 1 016 tests réussis sur 1 019 ; deux empreintes historiques
et un mock de contact à revoir. Reproductions décrites avec leurs limites dans le
rapport. Aucune mesure native de chauffe, mémoire ou crash ; aucun résultat de
simulation ne garantit la stabilité sur appareil. Code applicatif conservé.

## 25 septembre 2026 — Écran des jetons plus concis

**Problème.** Le solde et le retrait répétaient les mêmes explications ; les
bannières et deux grandes cartes d'action repoussaient l'historique. Les règles
sur la fidélité occupaient l'écran même sans opération à effectuer.

**Solution appliquée.** Le guide frontend a orienté une hiérarchie sobre :
solde, montant retirable et raccourcis « Recharger », « Partager », « Retirer ».
Le détail du solde se déplie avec « Détails ». Les retraits sont repliés par
défaut, avec le nombre de demandes à suivre ; leur consultation conserve les
dix entrées déjà accessibles. Parrainage et revenus conducteur deviennent des
liens compacts. Les erreurs, restrictions de retrait, demandes incertaines et
suivi de recharge restent visibles. En-tête/espacements resserrés, actions
nommées et cibles tactiles d'au moins 44 points, sans hauteur fixe des textes.

**Formulaires.** Suppression de l'exemple redondant de conversion lors de la
recharge, aide au partage raccourcie. Le retrait conserve avant confirmation le
solde retirable, minimum, taux, numéro Mobile Money et condition d'identité
vérifiée. « KYC » est remplacé par « identité vérifiée » dans ce parcours.
Les montants et règles d'éligibilité n'ont pas été modifiés.

**Fichiers.** `app/wallet.tsx`, nouveaux `features/wallet/WalletOverview.tsx`
et `WalletOverview.styles.ts`, `WalletWithdrawalSection.tsx`,
`WalletTopUpModal.tsx`, `WalletTransferModal.tsx`,
`hooks/wallet/useWalletWithdrawal.ts` (texte de confirmation uniquement) et
`features/screen-styles/app/wallet/container.styles.ts`.

**Précautions.** Pas de nouvel appel réseau, timer, animation ni modal natif.
Liste principale virtualisée et pagination conservées. Les détails locaux ont
des clés distinctes par compte. Les overlays restent à la racine de l'écran,
hors de la liste et du fond rendu inactif. Reprise d'un retrait incertain avec
la même clé d'idempotence, blocages, destinataire et double confirmation inchangés.

**Vérifications.** 40 tests JavaScript ciblés réussis (présentation compacte,
formulaires/clavier, suivi des recharges, cache et retraits), TypeScript valide,
contrôles réseau/taille valides : 947 sources, aucune au-delà de 400 lignes.
`git diff --check` valide. Tests : `walletCompactOverview.test.js`,
`walletSheetKeyboard.test.js`, `walletWithdrawal.test.js`,
`walletTopUpLifecycle.test.js` et `walletQueryReliability.test.js`.
Les deux échecs initiaux du banc de test clavier provenaient du nouveau module
de présentation non simulé ; son mock a été ajouté, sans changer les assertions
de protection du clavier. Pas de paiement réel ni de mesure de performance
native. Rendu sur appareils iOS/Android et grandes polices restant à vérifier.

## 25 septembre 2026 — Contacter le titulaire avant d'accepter sa réservation

**Problème.** Dans la gestion d'un trajet, le contact était réservé aux
réservations acceptées. En navigation, la liste de contacts excluait les
réservations en attente : le conducteur ne pouvait pas joindre leur titulaire
pour préciser la prise en charge avant de se décider.

**Solution appliquée.** Ajout de « Contacter » sur les réservations en attente
dans la gestion, et de « Contacter avant d’accepter » sur la carte prioritaire
en navigation. Ces actions ouvrent la fiche de la personne choisie, avec
« Appeler » et « WhatsApp », sans acceptation implicite. Le bouton général de
contact en navigation inclut également les réservations en attente, avec un
libellé explicite. La gestion réutilise le modal de contact existant et ses
protections contre les doubles clics, erreurs natives et démontages.

**Fichiers.** `features/manage-trip/ManageTripBookings.tsx`, nouveau
`features/manage-trip/ManageTripContactModal.tsx`, `hooks/manage-trip/useManageTripState.ts`,
`app/trip/manage/[id].tsx`, `features/navigation/navigationContacts.ts`,
`hooks/navigation/useNavigationAssistance.ts`, ainsi que
`features/driver-navigation/DriverPendingBookingPrompt.tsx`,
`DriverNavigationPassengersBar.tsx` et `DriverNavigationTopPanel.tsx`.

**Comportements conservés et précautions.** Accepter/refuser restent deux
actions distinctes. Un seul titulaire est contacté pour une réservation de
plusieurs places ; aucune sélection automatique d'un autre passager si la
réservation disparaît ou est refusée. Seul le propriétaire du trajet peut
consulter ces contacts, à partir des données déjà autorisées. La lecture backend
`BookingsService.findAllByTrip` vérifie déjà le conducteur propriétaire et
retourne le passager des réservations en attente : aucune modification backend
ni nouvelle requête nécessaire. Un numéro manquant rend les actions indisponibles
avec une explication. La fiche de gestion suit les données actuelles plutôt
qu'une copie du numéro ; sa sélection est effacée au changement de compte,
de trajet ou d'activité de l'écran. Aucun polling ni abonnement supplémentaire.
Les actions de la carte de navigation restent hors du contenu défilant.

**Vérifications.** 54 tests JavaScript ciblés réussis : contacts, droits,
multi-places, sélection d'une réservation parmi plusieurs, numéro absent,
réservation annulée/refusée, ouverture/fermeture du modal, câblage et dispositions
des boutons, gestion de trajet et navigation. TypeScript sans émission valide,
ESLint ciblé sans erreur, contrôles réseau/taille valides
(945 sources, aucune au-delà de 400 lignes) et
`git diff --check` valide. Tests principaux : `pendingBookingContact.test.js`,
`navigationAssistance.test.js` et `driverPendingBookingLayout.test.js`.
Appels et WhatsApp simulés dans les tests ; aucun contact réel effectué.
Essais natifs iOS/Android, petits écrans/grandes polices et retour depuis
l'application Téléphone/WhatsApp restant à valider sur appareil.

## 25 septembre 2026 — Correctifs des six points de l'audit de fiabilité

**Problèmes.** Boucle de vérification de recharge, double rôle GPS, arrêt natif
concurrent d'un nouveau trajet, dépose reconnue de façon inégale, attente GPS
initiale et historique des jetons non borné.

**Solutions appliquées.** Tags RTK séparés du suivi de statut et abonnements de
lecture libérés ; sélection commune du rôle et de la fin du transport ; file
native conducteur avec générations ; abonnement GPS immédiat et cache initial
borné ; pagination serveur/mobile et liste virtualisée dans le portefeuille.
Le backend local est modifié sans changer l'ancien endpoint d'historique.

**Conservé.** Suivi arrière-plan, multi-places, paiements dus après dépose,
actualisation du solde et fonctionnement des modals. Aucun paiement réel,
déploiement ni migration de base effectué. Déployer le backend avant la nouvelle
app pour consulter tout l'historique ; repli récent borné pendant la transition.

**Vérifications.** 56 tests mobile ciblés et 11 tests backend réussis, TypeScript
des deux projets valide, ESLint ciblé et contrôles réseau/taille valides. Suite
mobile complète : 1 007/1 009 réussis, avec deux échecs de références préexistants.
Pas d'essai natif ni de garantie de disparition des crashs ou de la chauffe.
Fichiers, scénarios testés et limites dans les
[correctifs de l'audit](PERFORMANCE_RELIABILITY_FIXES_2026_09_25.md).

## 25 septembre 2026 — Audit transversal de performance et de fiabilité

**Périmètre.** Relecture des cycles GPS, requêtes/cache, paiements, écrans,
modals, sockets et protections de build mobile ; contrôle ciblé du contrat de
l'historique des jetons dans le backend local.

**Résultat.** Trois priorités P1 : auto-invalidation des vérifications de recharge,
double participation GPS et concurrence arrêt/démarrage du GPS conducteur.
Trois P2 : dépose reconnue différemment par le suivi global, amorçage GPS non
borné et historique des jetons non paginé. Les corrections sont proposées,
**pas appliquées** dans cette intervention : seuls ce journal et le
[rapport d'audit](PERFORMANCE_RELIABILITY_AUDIT_2026_09_25.md) sont ajoutés/modifiés.
Les comportements applicatifs et modifications préexistantes sont conservés.

**Vérification.** TypeScript, frontières réseau et contrôle de taille valides ;
982/984 tests réussis, deux échecs préexistants de références d'extraction.
Quatre simulations JavaScript documentées, sans paiement réel ni essai natif.
Aucune conclusion de disparition des gels, crashs ou de la chauffe.

## 25 septembre 2026 — Libération de l'accueil après la dépose

**Problème.** Une ancienne information de suivi pouvait conserver l'accueil
verrouillé et afficher un rôle conducteur erroné après la dépose. La liste
d'activité pouvait aussi rester en retard sur le détail de la réservation.

**Solution.** Statut, carte et panneau fondés sur la participation réelle,
horodatages de dépose reconnus et propagation immédiate de la fin du transport
confirmée vers les caches passager. Retour au profil GPS de proximité lorsque
la participation se termine. Pas de nouvelle requête ni de polling ajouté.

**Conservé.** Paiements restant à régler, montants, réservations de plusieurs
places, autres passagers et trajets réellement actifs. Les réponses réseau
tardives ne réactivent pas une réservation déjà déposée dans les caches.

**Vérification.** 68 tests ciblés passent, TypeScript et `git diff --check`
valides ; 941 sources mobiles restent sous la limite de 400 lignes. Suite
complète : 982/984, avec les deux échecs déjà connus de `sourceExtractions.test.js`
(styles de réservation et références API PIN). Aucun essai natif réalisé.
Périmètre, fichiers, tests et limites dans
[Accueil après la dépose](HOME_AFTER_DROPOFF.md).

## 25 septembre 2026 — Panneau des passagers plus compréhensible

**Problème.** Le panneau mélangeait récupération et dépose dans deux lignes par
réservation, avec noms barrés, compteurs sans légendes et actions peu explicites.

**Solution.** Une fiche par réservation, statuts écrits, prochaine étape mise en
avant, compteurs légendés et actions nommées. Hauteur adaptée au contenu et liste
toujours virtualisée. Le détail d'un point ne déclare plus une arrivée fictive.
Le skill frontend a guidé la simplification visuelle et la hiérarchie du contenu.

**Conservé.** Ciblage des réservations et groupes de places, suivi automatique,
itinéraire, confirmations, priorités des modals et signalement existant. Aucun
changement backend, nouveau polling ou nouvelle fenêtre native.

**Vérification.** 24 tests ciblés passent, TypeScript et `git diff --check`
valides ; 940 sources mobiles respectent la limite de 400 lignes. Pas d'essai
sur appareil physique. Fichiers concernés et protocole natif dans
[Panneau des passagers](NAVIGATION_PASSENGERS_UX.md).
Suite complète : 970/972 ; les deux échecs préexistants de
`sourceExtractions.test.js` (styles de réservation et API PIN) restent présents.

## 25 septembre 2026 — Photo du conducteur et publications multiples

**Problème.** Plusieurs publications étaient possibles sans photo de profil,
et les alertes d'arrivée du conducteur n'affichaient pas son visage.

**Solution.** Photo requise dès la deuxième publication publique, trace durable
et contrôle transactionnel backend, protection des publications récurrentes,
raccourci mobile vers l'ajout de photo sans effacer le formulaire. Bloc photo/nom
du conducteur ajouté aux alertes de prise en charge, avec les détails du véhicule
et sans nouvelle requête de profil ni polling.

**Conservation et limites.** Première publication ponctuelle et acceptation
privée des demandes conservées, ainsi que les contrôles d'identité, de propriété,
de véhicule et de quota. Migration backend préparée mais non exécutée.
Vérifications ciblées : 22/22 tests mobiles et 53/53 tests backend passent.
TypeScript mobile/backend valide ; contrôle des 937 sources mobiles conforme
à la limite de 400 lignes, et `git diff --check` valide. Aucun essai natif réalisé.
Suite mobile complète : 964/966 ; les deux échecs préexistants de
`sourceExtractions.test.js` (styles et références API PIN) restent inchangés.
Fichiers, périmètre précis, migration et protocole de validation dans
[Photo conducteur : publication et rendez-vous](DRIVER_PROFILE_PHOTO.md).

## 25 septembre 2026 — Conducteur de compte, passager dans une réservation

**Problème.** Une activité conducteur encore en cours prenait systématiquement
le dessus sur une réservation active dans la bannière. L'écran de navigation
conducteur ne vérifiait pas la propriété avant de monter ses contrôleurs.

**Solution.** Rôle déterminé par la participation au trajet, priorité à la
réservation active, garde d'accès avant montage des interfaces conducteur,
redirection vers la navigation passager et cohérence du suivi de l'accueil.
Le statut conducteur du compte et les contrôles de propriété backend sont conservés.

**Vérifications.** TypeScript valide, 81 tests JavaScript ciblés passent. Suite
complète : 958/960, avec deux échecs préexistants de références styles/PIN,
non modifiées par ce correctif. Limites et protocole natif
dans [Rôles de participation au trajet](TRIP_PARTICIPATION_ROLES.md).
Aucune mutation de données de production ni validation sur appareil physique.

## 24 septembre 2026 — Vérification et durcissement de PawaPay

**Problèmes.** Compilation bloquée, arrondis CDF silencieux, bascule risquée après
erreur réseau ambiguë, callbacks mal liés à leur transaction et réponses tardives
pouvant écraser un état final.

**Solutions.** Contrats HTTP contrôlés, montants exacts selon l’opérateur,
vérification serveur obligatoire pour tous les paiements, mises à jour sous
verrou court et reprise de finalisation métier. Remboursements PawaPay non activés.
Libellés Mobile Money neutres, parcours carte FlexPay et règles cash/jetons conservés.

**Vérifications et limites.** [Revue PawaPay](PAWAPAY_REVIEW.md) détaille fichiers,
tests et conditions de déploiement. TypeScript backend et mobile valide : les
erreurs PawaPay mentionnées ci-dessous sont corrigées. 278 tests backend et 61
tests mobiles ciblés passent. Tests simulés ; pas
de transaction réelle, migration appliquée, déploiement ou essai natif.

## 24 septembre 2026 — Inscription passager et activation conducteur explicite

**Problème confirmé.** Le booléen multipart `"false"` était converti en `true`.
Plusieurs chemins serveur et mobile déduisaient aussi le rôle conducteur du
drapeau ou d'un véhicule, sans parcours complet ni intention explicite.

**Solution appliquée.** Conversion stricte, rôle serveur canonique, intention
conducteur distincte et activation uniquement après identité approuvée et véhicule
actif du propriétaire. Inscription, profil, callbacks d'identité, véhicules,
publication et offres utilisent cette règle. Le mobile ne transmet plus deux
choix contradictoires et synchronise les réponses confirmées dans Redux avec
isolation des comptes. Migration additive préparée, non appliquée ; aucun compte
historique n'est rétrogradé automatiquement, aucune donnée financière modifiée.

**Documentation et validation.** Voir [Statut passager et activation conducteur](DRIVER_ACCOUNT_ROLES.md)
pour les fichiers, garde-fous PostgreSQL, compatibilité, résultats des tests et
ordre de déploiement. TypeScript mobile valide ; 948/950 tests mobile passent
(deux empreintes historiques restent divergentes). Les tests backend ciblés
passent, mais le build global reste bloqué par les erreurs de typage PawaPay hors
périmètre. Aucune validation sur appareil physique ni déploiement n'est annoncé.

## 24 septembre 2026 — Accès Services dans les onglets des conducteurs

**Problème.** Services pro était accessible uniquement depuis le profil.
Remplacer Recherche pour tout le monde aurait pénalisé les passagers ; réutiliser
la route d’onglet `search` pour les services aurait rendu les liens `/search`
ambigus avec l’écran de recherche autonome.

**Solution appliquée.** Cinq onglets conservés : le deuxième affiche Services
pour les comptes conducteurs/mixtes, Recherche pour les passagers. Le nom interne
devient `discover`, tandis que `/search` reste exclusivement la recherche.
Le catalogue est partagé avec `/services`, les formulaires et détails restent
dans la pile principale. Le profil ouvre l’onglet pour un conducteur, l’écran
autonome pour un passager. Les racines d’onglet n’affichent pas de flèche retour ;
l’espace de la barre superposée iOS est réservé sans doubler celui d’Android.
Après activation conducteur confirmée, le rôle Redux est synchronisé uniquement
pour le même compte, sans changement optimiste ni écrasement du reste du profil.

**Préservation.** Bouton Chercher de l’accueil, filtres de recherche, bannière
de trajet en cours, demandes/devis et validation contractuelle inchangés.
Les réglages natifs de gel/détachement sont conservés. Aucun nouveau polling,
GPS, modal, dépendance ou appel réseau ; montage différé de l’onglet et lectures
suspendues lorsqu’il est inactif. Le changement de rôle ne remonte pas toute la
barre d’onglets. Les brouillons restent dans leurs écrans de formulaire.

**Vérifications.** TypeScript mobile valide. 92 tests JavaScript ciblés réussis,
dont 13 nouveaux cas concernant les accès, layouts et activation du compte. Garde-fous réseau et
taille valides : 931 sources, aucune au-dessus de 400 lignes. La recette native
iOS/Android, notamment retours, clavier et changement de compte, reste à faire ;
aucune mesure de mémoire/CPU ou garantie d’absence de crash n’est annoncée.

Fichiers, règles d’accès et recette : [Onglet Services selon le compte](ZWANGA_SERVICES.md#onglet-services-selon-le-compte--24-septembre-2026).

## 24 septembre 2026 — Services pro mobile : catalogue et formulaire guidé

**Problème.** Le catalogue donnait autant de place aux services futurs qu’aux
demandes utilisables. Le formulaire affichait tous les champs et documents en
une seule fois, sans récapitulatif ni validation précise par étape.

**Solution appliquée.** Service ouvert mis en avant, dossiers remontés avant les
services futurs, statuts lisibles et aperçu des réponses de l’équipe. Formulaire
en trois étapes : besoin, coordonnées, vérification ; champs facultatifs repliés,
sélection multiple accessible, récapitulatif modifiable et confirmation d’envoi.
Action principale en pied d’écran, dans la zone sûre et le conteneur de gestion
du clavier. Retour entre étapes sans effacer les champs. Aucun nouveau modal.

**Conservation et précautions.** Transport RTK Query et contrat API inchangés,
aucune modification backend, aucun financement activé. Clé et contenu identiques
pour réessayer un envoi incertain, garde synchrone contre le double appui, pas
de publication de résultat dans un formulaire démonté. Aucun nouveau polling,
paquet, suivi GPS ou animation continue. Brouillon conservé uniquement tant que
le formulaire reste monté, pas après fermeture complète de l’application.

**Vérifications.** TypeScript mobile valide ; 15 nouveaux tests JavaScript
réussis (parcours, validation, réponses tardives, non-duplication et interactions
UI simulées). Avec les tests Services existants et profil : 36/36 ; tests des
layouts de formulaires existants : 9/9. Garde-fous
réseau et taille valides : 929 sources, aucune au-dessus de 400 lignes.
Pas de test visuel natif ou sur appareil physique : zones sûres, clavier et
grandes polices à recetter sur iOS/Android, sans garantie d’absence de crash.

Fichiers concernés, parcours et recette : [Services pro — refonte UX mobile](ZWANGA_SERVICES.md#refonte-ux-mobile--24-septembre-2026).

## 24 septembre 2026 — Zwanga Services : demandes, devis et validation obligatoire

**Problème.** Demandes de documents web/mobile dispersées, confusion avec
l’abonnement Pro, absence de suivi partagé des devis, avances et originaux.

**Solution appliquée.** Catalogue extensible et parcours Services pro dans le
profil ; nouvelles demandes web reliées au même backend ; back-office dédié ;
dossiers, consentements, devis versionnés, écritures vérifiées et registre de
garde/restitution séparés. Contrat validé obligatoire côté serveur : aucune
condition activée par défaut. Les futurs services ouvrent seulement la
collecte des besoins tant que leur métier n’est pas implémenté.

**Conservation et validation.** Aucun changement aux paiements des trajets ou
aux gains ; aucune retenue automatique. Anciens dossiers conservés. TypeScript
valide sur les trois projets ; 31 tests backend, 3 tests mobile et 5 tests site
ajoutés et réussis. Suite mobile globale : 914/916, deux échecs d’empreintes
préexistants. Pas de migration exécutée ni de test sur appareil physique.

Fichiers, règles, limites et déploiement : [Zwanga Services](ZWANGA_SERVICES.md).

## 24 septembre 2026 — Véhicule identifiable hors navigation et rappel compact

**Problème constaté.** Le modal de prise en charge sur l'accueil affichait un
long paragraphe avec des informations véhicule absentes, alors que la navigation
connaissait le véhicule. `BookingsService.findAllByPassenger` ne chargeait pas
`trip.vehicle`. L'accueil utilisait uniquement le trajet imbriqué dans la
réservation, sans réutiliser son détail déjà chargé. Enfin, `vehicleInfo` contient
une description du trajet ou un texte générique : ce n'est pas une marque/modèle.

**Solution effectivement appliquée.**

- Backend, `zwanga-backend/src/bookings/bookings.service.ts` : ajout de la relation
  `trip.vehicle` à la lecture existante des réservations du passager, avec ou sans
  `scope=activity`. Aucun nouvel endpoint ni migration. Le filtrage par passager,
  le traitement des interruptions et les aperçus d'itinéraire restent inchangés.
- `hooks/home/useHomeTracking.ts`, `features/home/homeTrackingDialogs.ts` et
  `features/navigation/pickupAwareness.ts` : réutilisation du détail actif déjà
  chargé, puis du trajet de la réservation si nécessaire, avec contrôle de l'ID
  du trajet et du véhicule pour ne pas reprendre un véhicule remplacé. Les données
  fraîches sont accessibles au callback socket sans réabonnement. Aucun appel
  supplémentaire pour ouvrir le modal et aucun recours au véhicule par défaut
  du conducteur ou à la description du trajet pour inventer une identité.
- `features/navigation/PickupVehicleDetails.tsx` et `pickupPassengerDialog.ts` :
  bloc partagé avec marque/modèle, couleur et plaque contrastée, sans troncature
  volontaire de la plaque. Une consigne courte remplace le paragraphe ; en absence
  totale de données, une seule phrase invite à vérifier avec le conducteur.
  La composition sobre choisie pour l'interface supprime les répétitions et,
  grâce au fonctionnement existant de `DialogProvider`, le grand pictogramme
  des alertes hors navigation. Aucun téléchargement de photo ni animation ajoutée.
- `hooks/trip-detail/useTripDetailProgressNotices.ts`,
  `hooks/passenger-navigation/usePassengerNavigationPresentation.ts` et
  `app/booking/navigate/[id].tsx` : même présentation dans le détail et la
  navigation passager. La voix et la notification locale conservent un rappel
  textuel adapté, tandis que les modals séparent consigne et identité du véhicule.

**Comportements conservés.** Seuils de proximité, actions de fermeture,
compte à rebours de navigation, messages conducteur, confirmations d'embarquement,
dépose et paiements inchangés. Déduplication par réservation, pas par place ;
les événements d'un autre passager et ceux reçus après sortie de l'accueil
restent ignorés. Réutilisation des modals et de leur coordination existante,
sans nouveau modal natif, polling, abonnement GPS ou minuteur.

**Vérifications réalisées.** Tests enrichis dans `tests/pickupVehicleNotices.test.js`,
`tests/pickupProximity.test.js` et `tests/homeModules.test.js` : trajet incomplet,
détail chargé ensuite sans reconnexion socket, véhicule manquant/remplacé,
plaque lisible, bon rôle et réservation de plusieurs places. Suite ciblée avec
multi-passagers et cycle de vie de navigation : **60/60**. Backend : **2/2** dans
`src/bookings/pickup-vehicle-read.spec.ts` (dépôt/cache simulés, relations et
filtres contrôlés, pas de base réelle). Suite mobile complète : **911/913**, avec
les deux échecs préexistants de `tests/sourceExtractions.test.js` sur les
empreintes des styles de réservation et de l'API utilisateur/PIN. TypeScript
mobile et backend production validés. ESLint sans erreur : aucun avertissement
dans le nouveau bloc et le branchement accueil ; 19 avertissements dans l'ensemble
des sources modifiées du worktree, déjà présents avant cette intervention.
Frontière réseau et `git diff --check` validés ; **915 sources mobiles**, aucune
au-dessus de 400 lignes.

**Limites et déploiement.** Modifications locales, non déployées. Déployer aussi
le backend pour enrichir les réponses de réservations ; les listes non actives
déjà en cache restent soumises à leur expiration habituelle, sans purge forcée.
L'accueil actif contourne déjà ce cache. Les tests UI sont JavaScript avec les
dépendances natives simulées ; aucun essai sur iPhone ou Android physique.
Vérifier visuellement l'accueil et la navigation, notamment sur petit écran et
en grande police. Aucune mesure nouvelle de chauffe, de mémoire ou de crashs.

## 24 septembre 2026 — Rappel du véhicule dans les modals au point de récupération

**Problème.** Le rappel du véhicule était déjà affiché pendant la navigation
passager, mais les messages « Vous êtes au point » et « Le conducteur est là »
de l'accueil et du détail du trajet ne le reprenaient pas encore.

**Solution appliquée.** `features/home/homeTrackingDialogs.ts` et
`hooks/trip-detail/useTripDetailProgressNotices.ts` ajoutent le rappel partagé
`pickupVehicleReminder` aux messages passager `parties_nearby` et
`driver_arrived_pickup` : marque/modèle, couleur, plaque et invitation à vérifier
le véhicule avant de monter. L'accueil invite le passager à se signaler, sans
affirmer que les deux personnes sont forcément présentes ensemble. Le rappel
de la navigation passager, déjà fourni par `usePassengerNavigationPresentation`,
est conservé et couvert par les nouveaux tests.

**Comportements conservés.** Données du véhicule associé au trajet déjà chargées ;
aucune substitution par le véhicule par défaut du conducteur. Les informations
absentes restent explicitement non renseignées. Aucun nouvel appel réseau,
polling, minuteur, modal supplémentaire ni changement des seuils de proximité.
Les messages conducteur, l'embarquement, les paiements, la déduplication et
l'identification par réservation plutôt que par place sont conservés.

**Vérifications.** Six nouveaux tests dans `tests/pickupVehicleNotices.test.js` :
accueil, navigation et détail, variantes iOS/Android simulées, informations absentes,
bon véhicule, message conducteur inchangé, doublons et autre réservation.
Suite ciblée avec proximité, accueil et multi-passagers : **44/44 tests réussis**.
TypeScript sans émission validé. ESLint ciblé sans erreur (trois avertissements
préexistants dans le hook du détail).
Contrôles de frontière réseau, taille des sources et `git diff --check` validés :
913 sources mobiles, aucune au-dessus de 400 lignes.

**Limites.** Tests JavaScript avec dépendances natives simulées, pas d'essai sur
téléphone physique. Vérifier la lisibilité des textes sur petit écran et avec
une grande taille de police. Aucun changement backend ni déploiement dans cette
intervention ; aucune garantie nouvelle contre les crashs ou la chauffe.

## 24 septembre 2026 — Alerte de prise en charge dès 300 mètres

**Problème.** Le seuil d'approche était de 200 mètres côté mobile et backend.
La navigation conducteur ignorait l'événement d'approche et attendait l'arrivée
au point de prise en charge. Le rappel passager ne précisait pas le véhicule.

**Solution appliquée et fichiers.**

- `constants/rideProgress.ts` et `zwanga-backend/src/bookings/bookings.service.ts` :
  seuil d'approche porté à **300 mètres inclus**. Les positions et événements
  existants sont réutilisés. Le serveur et le conducteur comparent la position
  du conducteur au point de prise en charge ; le repli local passager utilise
  sa position si disponible, sinon le point de rendez-vous. Ce sont des distances
  géographiques approximatives, pas une distance routière restante.
- `useDriverRouteProgressTracking.ts`, `useDriverTrackingSocket.ts` et
  `useDriverPickupNoticeQueue.ts` dans `hooks/driver-navigation/`, avec les types,
  priorités et `NavigationPickupNoticeModal.tsx` dans `features/driver-navigation/` :
  prise en compte de l'approche, nom du passager, distance, modal existant et voix.
- `features/navigation/pickupAwareness.ts` centralise le rappel de la marque,
  du modèle, de la couleur et de la plaque du **véhicule associé au trajet**.
  Une information manquante est indiquée comme telle ; aucun véhicule par défaut
  du conducteur n'est substitué. Les hooks `usePassengerDriverCameraTracking`,
  `usePassengerNavigationController`, `usePassengerNavigationNotices` et
  `usePassengerNavigationPresentation` réutilisent ce texte dans le modal,
  la notification locale existante et la voix.
- `hooks/home/useHomeTracking.ts`, `features/home/homeTrackingDialogs.ts`,
  `hooks/manage-trip/useManageTripTracking.ts` et
  `hooks/trip-detail/useTripDetailProgressNotices.ts` relaient aussi l'approche
  avec un texte adapté au rôle. Le passager signalé à l'avance ne consomme plus
  l'alerte d'approche. Les priorités plus avancées restent mémorisées.

**Précautions et comportements conservés.** Déduplication par réservation et
type d'événement pendant la session d'écran ; file conducteur existante, sans
multiplier les alertes par le nombre de places. Une arrivée déjà présentée bloque
l'alerte d'approche tardive. La navigation passager ignore les autres réservations,
les événements hors écran et les réservations embarquées/déposées ; une annonce
vocale asynchrone devenue obsolète est ignorée. Aucun nouveau polling, abonnement
GPS, appel de profil/véhicule, stockage persistant ou modal natif indépendant.
Le seuil d'arrivée à la prise en charge (80 m), celui de présence (5 m), les règles
d'embarquement serveur, de dépose et de paiement restent inchangés.

**Vérifications.** Tests de comportement ajoutés dans `tests/pickupProximity.test.js`,
`tests/multiPassengerNavigation.test.js` et `tests/homeModules.test.js` : limite
300/301 m, distinction avec l'arrivée, véhicule associé/informations absentes,
groupes de plusieurs places, déduplication, file multi-réservations, préparation
avant approche et événements obsolètes. Dernière suite ciblée : **38/38** ; autre
passage élargi navigation/reprise/accueil : **88/88**. Suite mobile complète exécutée :
**900/902**, avec les deux échecs préexistants d'empreintes de
`tests/sourceExtractions.test.js` (styles des réservations et API utilisateur/PIN).
Backend : **57/57** dans `bookings.service.spec.ts`, notamment 250/300/301 m ;
deux attentes existantes adaptées car leurs positions à environ 223 m génèrent
désormais aussi l'événement d'approche, sans modifier leurs validations
d'embarquement. TypeScript mobile et backend production validés. ESLint ciblé :
aucune erreur, 19 avertissements dans les zones déjà concernées sur HEAD
(20 avertissements sur ces fichiers avant modification). Frontière réseau et
`git diff --check` validés ; 913 sources mobiles, aucune au-dessus de 400 lignes.

**Limites et déploiement.** Changements locaux non déployés : mettre à jour aussi
le backend pour aligner les événements serveur. Tests JavaScript avec dépendances
natives simulées ; aucun essai sur iPhone/Android physique. Vérifier un passage
350 → 300 → 80 m avec deux réservations, la lecture du véhicule et le retour de
veille. Le déclenchement dépend des positions reçues et de leur précision ; il
n'est pas garanti exactement au franchissement du seuil, ni lorsque l'application
est fermée. La notification locale dépend des autorisations du téléphone.
Aucune garantie nouvelle d'absence de crash ou de chauffe.

## 24 septembre 2026 — Photo du demandeur sur l'accueil

**Problème.** Les cartes de demandes dans la liste de l'accueil et la demande
mise en avant n'affichaient pas la photo du passager, pourtant disponible dans
`TripRequest.passengerAvatar` après le mapping de la réponse API.

**Solution appliquée.** `components/home/TripRequestPreviewCard.tsx` et
`components/home/HomeRequestHighlightCard.tsx` transmettent désormais la photo et
le nom du demandeur au composant existant `CompactTripCard`. La demande mise en
avant affiche aussi son nom. Réutilisation de `CompactCardAvatar` : image ronde
de 32 × 32, initiales sous l'image pendant son chargement, avatar à initiales si
l'URL est absente/vide. Un nom vide utilise « Passager Zwanga ».

**Comportements conservés.** Largeur des cartes, composants mémorisés, liste
virtualisée, budget par place, horaires, places et actions d'ouverture/swipe
inchangés. Aucune requête de profil, aucun polling, timer ou état ajouté ; seule
l'image référencée est chargée par le composant natif existant. Pas de modification
des cartes de recherche, des priorités de classement ou du backend.

**Vérifications.** Nouveau cas dans `tests/homeCompactCards.test.js` : photo,
initiales, URL vide, nom manquant, changement de photo, dimensions, nom accessible
et ouverture de la bonne demande. Suite ciblée accueil/cartes compactes : 109/109
tests réussis. TypeScript sans émission et ESLint ciblé validés ; `git diff --check`
validé ; 912 sources contrôlées, aucune au-dessus de 400 lignes. Tests JavaScript
avec composants natifs simulés : aucun essai visuel sur appareil physique ni
mesure de performance native effectué pour cette modification.

## 23 septembre 2026 — Correctifs de résilience après la dernière revue

Les renouvellements de session sur réseau instable, réponses tardives après changement
de compte/écran, blocages des actions conducteur par des relectures et accumulation
des états locaux de paiement ont été corrigés côté mobile. Le suivi GPS conserve son
contexte récupérable sans autoriser d'envoi HTTP avec un jeton d'accès expiré.

Le [compte rendu détaillé](CORRECTIFS_RESILIENCE_2026_09_23.md) précise, pour chaque
point, le problème, les fichiers et solutions appliquées, les comportements conservés,
les tests, les limites et les validations natives restant nécessaires. Aucun backend,
paiement réel, build natif ou déploiement modifié/exécuté pour cette intervention.

## 22 septembre 2026 — Charge JavaScript de la navigation conducteur

### 1. Recherche répétée sur toute la géométrie du trajet

**Problème.** À chaque mise à jour visuelle acceptée, le listener cherchait le
segment donnant le cap via `getRouteAlignedPosition`, puis parcourait encore
la route via `distanceFromCoordinateToPolyline` pour détecter une déviation.
La recherche de progression utilisée par l'alerte de prise en charge parcourait
aussi la route et recalculait sa longueur. Ce coût croissait avec le nombre de points.

**Solution appliquée.** Une analyse géométrique commune, locale à l'écran :

- `utils/navigation/routeSegmentIndex.ts` construit un arbre équilibré de boîtes
  englobant les segments, une seule fois par géométrie/contexte. Pas de tri ni
  de copie des sous-tableaux ; construction en O(N).
- `utils/navigation/routeAnalysis.ts` normalise la route et précalcule ses
  distances cumulées. La progression devient une lecture du préfixe plus la
  distance partielle sur le segment, sans reconstruire toute la portion parcourue.
- La recherche commence autour du dernier segment trouvé, puis examine toutes
  les branches pouvant contenir un meilleur candidat. Elle n'est PAS limitée
  à une fenêtre en avant : demi-tours, croisements, routes parallèles et sauts
  de position ne sont pas exclus de la recherche globale.
- Une branche n'est éliminée que si sa boîte est en dehors du rayon englobant
  les deux meilleures distances connues. Une marge de 1 cm protège les arrondis.
- Les deux formules antérieures sont conservées : projection du cap et projection
  métrique pour progression/déviation. Les remplacer l'une par l'autre aurait
  pu déplacer les seuils de décision. En cas d'égalité, le premier segment gagne,
  comme dans les anciennes boucles. La règle existante des 2 m pour le point de
  progression est également conservée.

**Cache et cycle de vie.** `useDriverNavigationRefs` possède un seul cache par
écran : une route, un index, des distances cumulées et au maximum deux résultats
de positions (conducteur et point fixe de prise en charge). Ce cache ne contient
aucun historique de trajets et ne déclenche ni rendu React, ni action Redux,
ni requête réseau. Remplacer le tableau de route ou changer le contexte
`tripId:destinationId` invalide le cache. Après plus de 10 secondes sans analyse,
les résultats et l'indice de proximité sont réinitialisés ; l'index reste réutilisable.
À l'avenir, les routes doivent continuer à être remplacées, pas mutées sur place.

**Intégration.** `features/driver-navigation/driverLocationListener.ts` consomme
le résultat commun pour le cap et la déviation. `utils/navigation/routeProgress.ts`
exporte sa projection existante sans modifier son calcul. Les anciennes fonctions
restent disponibles pour les autres consommateurs et servent de références aux tests.

**Limites.** Une géométrie très imbriquée peut encore nécessiter O(N) examens.
Le nombre de résultats retenus est borné à deux, mais l'index lui-même est O(N).
Les coordonnées restent limitées à la RDC par la normalisation existante : cet
index n'est pas une nouvelle implémentation mondiale traversant l'antiméridien.

### 2. Calcul prématuré lors de la détection d'une prise en charge dépassée

**Problème.** `useDriverNavigationDestination` calculait la progression avant
même de vérifier si une prise en charge était concernée ou si le conducteur
s'était suffisamment approché puis éloigné. Le même point fixe était reprojeté.

**Solution appliquée.** Dans
`hooks/driver-navigation/useDriverNavigationDestination.ts`, les vérifications
rapides précèdent maintenant la géométrie : arrêt actif, passager non encore
embarqué/déposé, alerte non présentée, proximité observée et éloignement suffisant.
L'analyse de la position du conducteur et du point de prise en charge utilise
ensuite le cache commun. Le point fixe est réutilisé tant qu'il reste dans ce cache.

**Comportements conservés.** Chaque position validée continue de passer par les
vérifications métier, même si la carte n'est pas redessinée. Les seuils existants
(approche à 90 m, éloignement à 160 m, progression de 120 m), le recours au cap
en l'absence de route, l'alerte et son action restent inchangés. Aucun ralentissement
du flux d'embarquement ou de dépose n'a été ajouté.

### 3. Animation du marqueur trop longue sur le thread JavaScript

**Problème.** L'animation de 750 ms utilisait `useNativeDriver: false` et fournissait
aussi `latitudeDelta` et `longitudeDelta`, inutiles pour déplacer le marqueur.
Cette animation partage le thread avec le suivi et les interactions utilisateur.

**Solution appliquée.** Dans `driverLocationListener.ts`, sur iOS et Android :

- durée réduite à 250 ms, uniquement sur latitude et longitude ;
- `isInteraction: false` pour ne pas maintenir un verrou d'interaction pendant
  cette animation ; cela ne la déplace PAS sur le thread natif ;
- placement immédiat lors du premier point et après une interruption prolongée
  des mises à jour, au lieu d'animer depuis une ancienne position ;
- annulation de l'animation précédente conservée ; callback de fin protégé pour
  qu'une ancienne animation ne puisse pas effacer la référence d'une plus récente ;
- cadence visuelle de 2 secondes, seuil de mouvement de 2 m et arrêt des
  animations en arrière-plan conservés.

La déclaration TypeScript de `AnimatedRegion.timing` dans la version installée
de react-native-maps (1.20.1) exige une région complète, alors que son implémentation
n'anime que les propriétés fournies. Une assertion locale commentée permet
d'omettre les deux deltas, sans élargir les types du reste du projet.

**Piste différée.** Le passage Android à `animateMarkerToCoordinate` n'a PAS
été activé : l'implémentation installée démarre un `ObjectAnimator` sans exposer
sa poignée d'annulation. Remplacer directement le chemin actuel ferait perdre
la maîtrise des animations au changement d'écran ou de course. Ce changement
natif nécessite un travail séparé et des essais sur Android physique.

### 4. Vérification et mesure reproductibles

**Problème.** Un index plus rapide n'est utile que s'il conserve les décisions
et si son gain peut être mesuré sans confondre CPU JavaScript et rendu natif.

**Solution appliquée.** Ajout de tests différentiels et d'un benchmark :

- `tests/routeAnalysis.test.js` compare les résultats aux anciennes fonctions
  exhaustives : longues routes, marche arrière, points éloignés, croisements,
  routes parallèles, égalités, doublons, segments courts, coordonnées invalides,
  seuils de recalcul et invalidation du cache. Inclut 500 comparaisons sur des
  routes pseudo-aléatoires reproductibles.
- `tests/driverPickupAnalysis.test.js` vérifie que les cas non éligibles ne
  déclenchent aucun calcul de géométrie, que le point fixe est réutilisé et que
  les alertes existantes sont conservées, y compris sans route.
- `tests/driverLocationListener.test.js` vérifie l'animation, les callbacks
  tardifs, la reprise, les fréquences métier, ainsi que le recalcul après deux
  positions hors route et son délai minimal de 12 secondes.
- `scripts/benchmark-driver-route.cjs` et `npm run benchmark:driver-route`
  comparent l'ancien double parcours au nouvel index, construction comprise.
  `npm run test:navigation` inclut désormais les nouveaux tests de géométrie
  et de prise en charge.

Mesure locale Node.js sur une trace synthétique de **8 000 points / 500 positions
distinctes**, le 22 septembre 2026 :

| Mesure | Ancien double parcours | Analyse indexée |
| --- | ---: | ---: |
| Temps total | 2 570 ms | 33 ms, construction comprise |
| Projections de segments | 7 999 000 | 18 992 |

Ce scénario n'est ni un trajet enregistré, ni une garantie de gain identique
sur toutes les routes. Il ne mesure pas la mémoire native, les FPS de la carte,
la batterie ou la température d'un iPhone/Android. Aucun test chronométrique
fragile n'est imposé dans la suite : le test de coût vérifie le nombre de segments.

### 5. Documentation systématique des prochains changements

**Problème.** Les corrections successives doivent rester explicables et traçables.
**Solution appliquée.** Création de ce journal et d'un `AGENTS.md` à la racine
qui demande, pour chaque future intervention, le problème, la solution réellement
appliquée, les fichiers, les vérifications et les limites. Cette règle ne modifie
aucun comportement de l'application.

### Invariants et périmètre

- Pas de modification du backend, des requêtes RTK Query, des sockets ou des
  données persistées ; aucun nouveau timer ni abonnement GPS.
- Validations GPS, cadence d'envoi au serveur, suivi métier, instructions,
  détection de déviation et recalcul automatique restent en place.
- Pas de modification des paiements, des modals, de la navigation passager,
  des réglages de gel/détachement Android ou des permissions.
- Aucun secret ou fichier `.env` n'est utilisé dans les tests ou la documentation.

### Validation native restante

Avant généralisation, comparer deux builds release sur le même téléphone et le
même parcours, dont un Android modeste et un iPhone. Faire une navigation de
30–60 minutes avec plusieurs prises en charge/déposes, recalcul hors route,
demi-tour, réseau lent, modals, passage en veille/reprise et sortie de navigation.
Relever fluidité, CPU, mémoire et chauffe. Vérifier que l'animation raccourcie reste
lisible. Les tests JavaScript ne permettent pas d'annoncer l'absence de freeze/crash.

### Résultats des contrôles

- TypeScript : réussi (`node node_modules/typescript/bin/tsc --noEmit`).
- ESLint ciblé : réussi, sans erreur ni avertissement.
- Navigation ciblée : 55 tests réussis sur 55 (`npm run test:navigation`).
- Frontières réseau : réussi, aucun HTTP direct hors RTK Query.
- Taille : les fichiers applicatifs de cette intervention sont sous 400 lignes ;
  le contrôle global signale toujours `app/wallet.tsx` à 414 lignes, hors périmètre.
- Suite complète : **682 tests réussis sur 684**
  (`node --test --test-concurrency=2 tests/*.test.js`). Les deux échecs sont
  les snapshots déjà en défaut dans `tests/sourceExtractions.test.js` : styles
  de `features/screen-styles/app/bookings/index.ts` et endpoints PIN de
  `store/api/userApi.ts`. Ces fichiers et leurs snapshots ne sont pas modifiés
  par cette intervention ; ils restent à traiter séparément.
- `git diff --check` : réussi.

## 22 septembre 2026 — Surveillance globale de l'activité personnelle

**Problème.** Plusieurs coordinateurs et hooks d'accueil relisaient périodiquement
les listes personnelles, y compris sans trajet actif. La déduplication RTK
ne supprimait pas le coût des listes ni tous les rendus liés au chargement.

**Solution appliquée.** Endpoint authentifié `/api/v1/me/activity` dans le backend,
un coordinateur RTK mobile (60 s au repos / 30 s en activité), empreintes par
catégorie et relecture uniquement des catégories modifiées ou en échec.
Sélecteurs minimaux pour les abonnés globaux ; suppression de la double relance
AppState du coordinateur GPS ; signal de préarmement passager ; cohérence de la
lecture d'activité des réservations en contournant son ancien cache de liste.

**Précautions.** Lectures initiales, reprise du paiement, tâches GPS natives,
mutations, sockets, annonces visibles et pollings des détails/listes dédiés
conservés. Erreurs réessayées sans vider l'état connu, changement de compte
protégé, lectures concurrentes regroupées. Repli sur les anciens pollings si
le nouveau backend n'est pas encore déployé (404/405 uniquement).

**Documentation détaillée.** [Coordination de l'activité personnelle](ACCOUNT_ACTIVITY_COORDINATION.md)
décrit les problèmes et solutions par fichier, le contrat, les cadences, les
limites SQL, la compatibilité, les tests et l'ordre de déploiement backend/mobile.

**Validation.**

- Neuf tests mobiles ciblés et onze tests backend ciblés réussis (quatre suites).
- TypeScript mobile/backend et ESLint ciblé : réussis.
- Suite mobile complète : **691 tests réussis sur 693**. Les deux échecs restent
  ceux constatés avant cette intervention dans `tests/sourceExtractions.test.js`
  (styles de réservations et empreintes des endpoints PIN). Aucun snapshot
  n'a été remplacé pour masquer ces écarts.
- Frontières réseau et `git diff --check` : réussis.
- Taille : nouveaux fichiers applicatifs sous 400 lignes ; seule alerte mobile
  globale préexistante, `app/wallet.tsx` à 414 lignes (880 sources contrôlées).

Aucune mesure de température/FPS sur appareil physique ni déploiement n'a été
réalisé : cette intervention ne garantit pas à elle seule l'absence de plantage.

## 22 septembre 2026 — Noter l'application sur les stores

**Problème.** Les évaluations des conducteurs/passagers ne sont pas des avis
App Store ou Google Play ; le profil n'offrait pas d'accès dédié à ces derniers.

**Solution appliquée.** Bouton « Noter l’application » dans le menu du profil,
avec le nom du store et ouverture de la fiche officielle pour noter et commenter.
Liens iOS/Android configurés dans `app.config.js`, fallback HTTPS si l'ouverture
native échoue, message français en cas d'échec. Pas d'API native à quota sur ce
bouton explicite, pas de nouvelle dépendance ni de modification backend.

**Précautions.** Doubles appuis verrouillés, chargement local, réponses tardives
neutralisées au démontage/à la perte de focus, aucune sollicitation automatique
ou activité périodique. Pas de filtrage selon la satisfaction, pas de faux accusé
de publication. Les avis sur les trajets et l'aide/support restent inchangés.

**Détail par fichier et limites.** [Notes et avis sur l'application](APP_STORE_REVIEWS.md).
La publication dépend de l'utilisateur et du store ; aucun test physique,
build, déploiement ou avis réel n'a été effectué pendant l'implémentation.

**Contrôles.** Neuf tests dédiés réussis ; 31/31 tests ciblés avec le profil et
les écrans inactifs ; TypeScript réussi ; lint sans erreur (un avertissement
préexistant dans `app.config.js`). Frontières réseau et `git diff --check` réussis.
Suite mobile complète : **700/702 réussis**, avec les deux mêmes échecs
préexistants de `tests/sourceExtractions.test.js` (styles des réservations et
endpoints PIN), sans changement de leurs snapshots.

## 22 septembre 2026 — Notation native après trajet et confirmation du cash

**Problème.** Le profil ouvrait le store sans sollicitation native après un trajet
réussi. Il fallait respecter les seuils choisis (1er, 10e, 20e, puis dizaines),
limiter les sollicitations et éviter une fenêtre supplémentaire pendant les
paiements/navigation. Le statut cash `not_required` ne prouvait pas un encaissement.

**Solution mobile.** Ajout de `expo-store-review ~9.0.9`. Modules séparés
`features/store-review/` pour l'éligibilité, le quota, la persistance et l'adaptateur
natif ; `StoreReviewCoordinator` observe les caches RTK existants sans polling.
Compteurs par rôle, quota commun de trois tentatives sur 365 jours, trace AsyncStorage
par compte, dédoublonnage borné, écriture avant appel natif. Fenêtre demandée sur
l'accueil après trois secondes calmes, une activité serveur fraîche depuis la
reprise et la fermeture des modals. Le reçu conducteur participe désormais au
registre `RideModal`. Aucun fallback automatique vers un navigateur/store.

**Solution cash autorisée par l'utilisateur.** Contrôle réutilisable de confirmation
dans les réservations conducteur et les reçus de dépose. Mutation RTK dédiée et
nouvelle commande backend authentifiée `PUT /bookings/:id/cash-receipt` : conducteur,
dépose, montant et devise revérifiés. Migration nullable pour les trois champs
du reçu ; écriture conditionnelle idempotente, protection contre les saves obsolètes
et changements concurrents du mode/montant. Projection d'activité et contrats
mobiles enrichis. Aucun transfert, crédit de revenus ou calcul de subvention ajouté.

**Conservé et limites.** Aucun critère de satisfaction, changement de prix ou
confirmation automatique du cash. Les liens explicites du profil restent disponibles.
Compteurs locaux à cette installation, sans reprise exhaustive de l'historique :
la fenêtre d'activité existante de 48 h peut manquer des réussites pendant une
longue absence. Les stores décident de l'affichage ; une tentative ne prouve pas
un avis publié. Nouveaux builds natifs et migration backend nécessaires, non exécutés.

**Vérifications.** 31/31 tests ciblés avis/cash mobile et 20/20 tests backend cash/
activité réussis. Suite mobile complète : **723/725 réussis** ; les deux échecs
préexistants concernent toujours l'extraction des styles réservations et les
endpoints PIN de `userApi`. Seule l'empreinte du NOUVEL endpoint `confirmCashReceipt`
a été ajoutée au snapshot ; les empreintes préexistantes défaillantes sont inchangées.
TypeScript mobile/backend sans émission, lint mobile ciblé, frontières réseau et
`git diff --check` réussis. 890 sources mobiles contrôlées ; seule l'exception
préexistante `app/wallet.tsx` (414 lignes) reste au-dessus de 400 lignes.
Pas d'essai physique, de migration PostgreSQL réelle, de mesure de chauffe ou
de garantie d'absence de freeze natif. Repositories/SDK/stockage simulés dans les tests.

**Détails et fichiers.** [Notation native, cash et procédure de déploiement](NATIVE_STORE_REVIEW.md).
Le backend possède aussi `docs/CASH_RECEIPTS_AND_APP_REVIEWS.md`.
Le guide `supabase-postgres-best-practices` a orienté les types des colonnes,
l'écriture atomique et l'absence d'appels externes sous verrou.

## 23 septembre 2026 — Bouton du profil : notation native sans redirection

**Problème.** Le bouton « Noter l’application » ouvrait encore une fiche externe,
contrairement au parcours souhaité sans quitter Zwanga.

**Solution appliquée.** `hooks/useStoreReview.ts` utilise désormais l'adaptateur
natif `features/store-review/nativeReview.ts`, vérifie sa disponibilité puis
appelle `expo-store-review`. Aucun fallback vers le store/navigateur. Message
français en cas d'indisponibilité détectée ou d'erreur. Sous-titre et accessibilité
du `ProfileStoreReviewButton` adaptés, icône de lien externe remplacée par un
chevron. Ancien utilitaire de redirection `utils/storeReview.ts` supprimé.

**Précautions et conservé.** Verrou des doubles appuis, contrôles de focus,
montage, génération, premier plan natif et registre des overlays après les
attentes. Promesse native partagée pour éviter les appels simultanés entre
consommateurs/remontages ; aucune hypothèse sur la fermeture réelle du dialogue
iOS. Aucun polling ni appel réseau supplémentaire. Compteurs, quota AsyncStorage
et déclenchement automatique après trajet inchangés ; le bouton volontaire
reste distinct de ce quota de sollicitations automatiques. Aucun paiement,
calcul de prix, reçu cash ou backend modifié dans cette intervention.

**Vérifications.** 51/51 tests ciblés profil/notation/cash réussis. TypeScript
sans émission et ESLint ciblé réussis. Frontières réseau et `git diff --check`
réussis. 889 sources contrôlées ; seule l'exception préexistante `app/wallet.tsx`
(414 lignes) dépasse 400. La suite complète n'a pas été relancée pour ce correctif.
SDK et cycles de vie simulés : aucun essai physique, build ou déploiement réalisé.

**Limites.** Le store peut ne pas afficher sa fenêtre malgré un appel réussi ;
aucun avis publié ne peut être déduit de ce retour. Les binaires doivent inclure
`ExpoStoreReview` ; un ancien binaire sans ce module affiche une information,
sans crash de chargement attendu ni redirection. Cela ne constitue pas une
garantie générale d'absence de freeze/crash natif.

**Détails et recette.** [Notation depuis le profil](APP_STORE_REVIEWS.md).
La documentation [Notation après trajet](NATIVE_STORE_REVIEW.md) renvoie maintenant
vers ce comportement actualisé du bouton volontaire.

## 23 septembre 2026 — Sortie du paiement à l'arrivée après erreur FlexPay

**Problème.** Une erreur 502 de vérification conservait un bouton « Vérification… »
et des lectures périodiques sans limite. Le message était peu visible et fermer
la fenêtre n'arrêtait pas la surveillance ; un résultat tardif pouvait la rouvrir.
Un 404 distinct révélait aussi des appels passagers à la liste des réservations
réservée au propriétaire conducteur, contrat confirmé dans le backend local.

**Solution appliquée.** Monitoring borné : arrêt sur erreur, garde de lecture
25 s, délai de 12 s après réponse, pause après deux minutes sans confirmation.
Action « Vérifier à nouveau » sur la référence existante, état d'attente sans
spinner permanent, message visible au-dessus des actions et sortie toujours
utilisable. Fermeture/veille annulent uniquement la lecture en cours ; les
références et mutations financières sont conservées. Le récapitulatif tardif
respecte le choix de fermeture. Lectures conducteur limitées au propriétaire
dans l'accueil, le détail et la notation ; côté passager, réservations personnelles.

**Fichiers et précautions.** Hooks `arrival-payment/useArrivalPaymentMonitoring`
et `useArrivalPaymentState`, constantes `paymentPolicy`, composant extrait
`ArrivalPaymentActions`, `PassengerArrivalPaymentCoordinator`, `ArrivalPaymentFields` ;
hooks `useHomeDriverActivity`, `useTripDetailData`, `useTripDetailSafetyActions`,
`useRatingData` et contrat `RatingParticipantSelector`. Aucun élargissement de
droits, nouveau paiement automatique, changement de montant ou interprétation
d'une erreur réseau comme un paiement échoué. Toutes les requêtes restent RTK.

**Vérifications.** 42/42 tests ciblés réussis, dont treize nouveaux scénarios.
Suite complète : **738/740 réussis** ; les deux défauts préexistants de
`sourceExtractions.test.js` (styles réservations et endpoints PIN) sont inchangés.
TypeScript, lint ciblé, frontières réseau et `git diff --check` réussis.
890 sources contrôlées ; seule `app/wallet.tsx` reste à 414 lignes, hors périmètre.
Aucun paiement réel, build, déploiement ou test physique réalisé. La connexion
backend–FlexPay reste un sujet distinct : l'UI ne rétablit pas le service tiers.

**Détails, limites et recette.** [Vérification des paiements à l'arrivée](ARRIVAL_PAYMENT_VERIFICATION.md).

## 23 septembre 2026 — Changer de moyen de paiement après un échec confirmé

**Problème.** Après un paiement refusé ou annulé, les options redevenaient
sélectionnables mais aucune action visible ne guidait le passager vers un autre
moyen. Une recharge de complément refusée dès sa création pouvait également
être enregistrée comme une transaction encore à surveiller.

**Solution appliquée.** Action « Changer de mode de paiement » dans le pied du
formulaire après un statut serveur `failed` ou `cancelled`, pour le règlement
électronique ou la recharge complémentaire des jetons. Cette action retire la
sélection courante et ramène aux options dans la même fenêtre. Le passager
choisit puis valide explicitement ; sélectionner n'envoie aucune requête.
Les réponses de création déjà refusées ne déclenchent ni ouverture de page
de paiement ni enregistrement d'une nouvelle référence en attente.

**Fichiers et précautions.** Hooks `useBookingPaymentMode`, `useArrivalPaymentState`,
`useArrivalPaymentSubmission`, `useArrivalPaymentCompletion`, `useArrivalPaymentMonitoring` ;
`ArrivalPaymentActions`, `ArrivalPaymentFields`, `PassengerArrivalPaymentCoordinator`.
Verrouillage conservé tant qu'une référence reste incertaine, pendant une opération
et après un paiement confirmé. Une erreur HTTP 502 ne vaut pas refus du paiement.
Cash seulement après arrivée/dépose ; mêmes APIs RTK Query, règles tarifaires et
confirmation d'encaissement. Backend local consulté, mais non modifié.

**Vérifications.** 34/34 tests paiement ciblés réussis, dont neuf nouveaux tests.
Suite complète : 747/749 réussis, avec les deux mêmes échecs préexistants de
`sourceExtractions.test.js` (styles réservations, endpoints PIN), hors périmètre.
TypeScript, ESLint ciblé, frontières réseau et contrôle du diff réussis.
Tous les fichiers applicatifs modifiés restent sous 400 lignes ; seule l'exception
préexistante `app/wallet.tsx` reste à 414 lignes. Aucun paiement réel, déploiement
ou essai natif iOS/Android : la recette sur appareils reste nécessaire.

**Détails.** [Changement de mode et protections](ARRIVAL_PAYMENT_VERIFICATION.md#changement-de-mode-apres-echec-confirme).

## 23 septembre 2026 — Action de changement de paiement toujours visible

**Problème constaté.** L'action précédente remplaçait le bouton principal
uniquement après réception d'un refus financier et selon un indicateur en mémoire.
Après une erreur de vérification 502, ou une réouverture sans cet indicateur,
le passager ne voyait donc pas où changer de moyen de paiement.

**Solution appliquée.** « Changer de mode de paiement » est une action distincte,
toujours affichée pour un paiement non réglé, sous le bouton de paiement/vérification
et au-dessus de la fermeture. Elle est utilisable sans attendre un indicateur
d'échec local, lorsque le changement est autorisé. Une transaction non résolue
ou une opération en cours la grise ; un texte explique le verrouillage en attente.
Un compteur local de demandes de sélection ramène aux options même si aucun mode
n'est sélectionné au moment d'un nouvel appui. Aucun appel réseau au clic.

**Fichiers et précautions.** `ArrivalPaymentActions`, `ArrivalPaymentFields`,
`PassengerArrivalPaymentCoordinator`, `useBookingPaymentMode`,
`useArrivalPaymentState` et message de `useArrivalPaymentMonitoring`.
Références incertaines conservées, cash seulement après dépose, bouton de relance
et fermeture inchangés. Pas de modale supplémentaire ni timer/animation de défilement.

**Vérifications.** 36/36 tests paiement ciblés réussis, dont visibilité sans
indicateur d'échec, action présente mais bloquée après erreur de vérification,
appuis répétés et absence de défilement lors de 100 rendus sans changement.
TypeScript, ESLint ciblé, frontières réseau et diff validés. Fichiers applicatifs
modifiés sous 400 lignes ; seule l'exception existante `app/wallet.tsx` reste à 414.
Suite complète non relancée pour ce correctif ciblé ; ses résultats précédents
ne sont pas une nouvelle validation. Aucun paiement réel ni essai iOS/Android.

**Détails.** [Visibilité de l'action](ARRIVAL_PAYMENT_VERIFICATION.md#visibilite-du-changement-de-mode).

## 23 septembre 2026 — Refus opérateur FlexPay et sélection directe du paiement

**Problème confirmé.** Une vérification FlexPay réussie retournait une transaction
refusée, avec le numéro de commande dans `reference` et sans `orderNumber` séparé.
Le backend exigeait les preuves complètes de crédit avant de traiter ce refus ;
il renvoyait donc une erreur 400 au lieu du statut financier `failed`. L'app
conservait logiquement l'ordre incertain et bloquait les choix alternatifs.
Le bouton ajouté pour changer de mode surchargeait par ailleurs le formulaire.

**Solution appliquée.** Backend : séparation des preuves nécessaires pour
enregistrer un refus et de celles exigées pour créditer des jetons. Un refus
vérifié et correctement rattaché à l'ordre devient `failed`, avec un message
français ; les contrôles des identifiants, des montants/devises fournis et des
preuves de succès sont conservés. Mobile : suppression du bouton supplémentaire
et de son compteur local. Après refus confirmé, retour automatique vers les
cartes de paiement et sélection directe d'un autre mode, puis validation.

**Fichiers.** Backend : `src/payments/payments.service.ts`,
`wallet-topup-check-evidence.ts`, `wallet-topup-decline.spec.ts`.
Mobile : `ArrivalPaymentActions`, `ArrivalPaymentFields`,
`PassengerArrivalPaymentCoordinator`, `useBookingPaymentMode`, `useArrivalPaymentState`
et tests `arrivalPaymentModeRecovery`/`arrivalPaymentVerification`.

**Précautions et résultats.** 97/97 tests backend ciblés, 36/36 tests mobile
ciblés réussis. Aucun crédit wallet sur refus, aucune nouvelle requête au choix
d'un mode ; cash disponible seulement après dépose. Erreurs HTTP génériques
toujours distinctes d'un refus financier. TypeScript mobile et backend production
sans émission validés ; typage backend incluant tous les tests en échec dans des
fixtures hors périmètre non modifiées, détaillées dans le document spécialisé.
ESLint mobile ciblé et nouveaux modules backend, frontières réseau et diffs
vérifiés. Aucune migration, modification de solde, tentative de paiement réel,
mise en production ou validation native iOS/Android effectuée.

**Déploiement et détails.** [Refus FlexPay et modes de paiement](FLEXPAY_REFUSALS_AND_PAYMENT_MODES.md).
Le backend corrigé doit être redémarré/redéployé ; une nouvelle vérification de
l'ordre existant permet ensuite à l'app de recevoir le refus et de déverrouiller
les choix. Le mobile ne déduit pas un échec financier d'une ancienne erreur 400.

## 23 septembre 2026 — Priorités distinctes sur l’accueil et indicateurs compacts en recherche

**Périmètre et problème.** Les priorités de l’accueil utilisaient la même carte
neutre pour une réservation reçue, un départ proche et une demande à accepter.
Les indicateurs de places/offres en recherche manquaient de différenciation.
La demande porte uniquement sur la présentation, sans agrandir les cartes de recherche.

**Solution appliquée.** Trois variantes visuelles statiques de `CompactTripCard` :
réservation reçue en vert avec une icône de billet, départ proche en bleu avec
une horloge, demande à accepter en orange avec une icône d’envoi. Fond légèrement
teinté, liseré latéral hors flux et libellé existant conservé : la couleur de
catégorie ne transforme pas une réservation en attente en réservation acceptée.
Dans les résultats de recherche, bordure neutre, date bleue et prix contrasté ;
places disponibles en vert, places demandées en orange, offres en bleu et places
indisponibles/inconnues en gris. Les mêmes textes occupent les mêmes lignes.
Les rehauts inline ne changent ni padding, ni graisse, ni hauteur de ligne.
Aucun nouveau statut métier n’est inventé et aucun badge supplémentaire n’est ajouté.

**Fichiers.** `components/trip/CompactTripCard.tsx` et nouveau
`CompactTripCard.variants.ts`, `components/home/HomeActivityCards.tsx`,
`HomeRequestHighlightCard.tsx`, `components/search/SearchResultCard.tsx` et
`SearchRequestResultCard.tsx`. Tests : `tests/compactCardAppearance.test.js`
et `tests/homeActivityCards.test.js`.

**Comportements conservés.** Dimensions et espacements de base des cartes,
photos, prix par place, budget, plage horaire, véhicule, accès au détail, état
désactivé, ordre des priorités et masquage par swipe/accessibilité inchangés.
Les variantes sont opt-in : les autres listes et aperçus gardent leur aspect.
Aucun nouvel effet, timer, abonnement Redux, appel réseau, animation ou image.
La mémoïsation existante, la virtualisation et les gardes de cycle de vie restent
en place. Le guide frontend a orienté le choix de teintes sobres et d’icônes
informatives, sans ajout d’animations décoratives.

**Vérifications et limites.** Suite `test:ui-stability` : **224/224 tests réussis**,
dont cinq nouveaux tests de variantes, conservation de la géométrie déclarée,
contenu accessible et contraste des petits textes (au moins 4,5:1). TypeScript
sans émission, ESLint ciblé, frontières réseau et `git diff --check` validés.
Contrôle de taille : 891 sources, seule exception préexistante `app/wallet.tsx`
à 414 lignes ; aucun fichier applicatif modifié ici ne dépasse 400 lignes.
Les comparaisons de rendu sont des tests JavaScript avec composants natifs simulés,
pas des mesures de pixels, de mémoire ou de fluidité sur appareils. Aucun essai
visuel natif iOS/Android ni build de production effectué pour cette retouche :
vérifier les petits écrans, les grandes polices, les noms longs et le swipe sur
appareils avant diffusion. Pas de promesse de suppression des crashs ou de chauffe.

## 23 septembre 2026 — Corrections des cinq risques de performance de l'audit

**Problèmes.** Reprise REST/GPS conducteur répétée hors écran, suivi passager trop
précis avant départ, sauvegardes identiques du suivi conducteur, historiques
financiers non bornés et accumulation/rechargement des pages de messagerie.

**Solutions appliquées.** Reprise liée au focus avec protection contre les réponses
tardives ; profil GPS équilibré en attente, précis pendant le trajet ; stockage
conducteur sérialisé sans écritures identiques ; nouvelles API financières paginées,
totaux globaux et listes virtualisées ; fenêtre de chat bornée avec accès aux
anciens et nouveaux messages. Formulaire de partage wallet extrait pour respecter
400 lignes. Les règles de trajet, paiement, versement et confirmation sont conservées.
Le guide PostgreSQL a orienté les curseurs et index composites ; migration préparée,
non exécutée, avec précautions de verrouillage documentées.

**Vérifications.** 776/778 tests mobile réussis ; deux références de tests déjà en
échec sur HEAD, hors fichiers métier modifiés. 54/54 tests backend ciblés réussis.
Typage mobile et backend production validé ; aucune source applicative au-dessus
de 400 lignes. Pas d'essai natif ni de mesure de chauffe : aucune promesse de
disparition des crashs. Backend à déployer avant le mobile pour profiter pleinement
des bornes mémoire/réseau ; anciens contrats API conservés pendant la transition.

**Détails, fichiers, mesures et limites :** [Correctifs de performance du 23 septembre](PERFORMANCE_AUDIT_2026_09_23.md).

## 23 septembre 2026 — Fermetures iOS, concurrence GPS et intégration native Android

**Problèmes.** Risques de session GPS passager supprimée par un ancien arrêt,
de retour `onDismiss` absent bloquant une action, de notification globale native
concurrente, de timer passager inutile et de lectures financières intégrales.
Le patch Android de dessin était absent des AAR effectivement utilisés ; le
crash SoLoader signalé exige aussi un contrôle de l'artefact livré.

**Solutions.** File GPS commune avec révision avant permissions ; notification
de paiement conducteur dans les panneaux internes ; secours de démontage iOS
avant libération du blocage ; timer lié à l'écran et arrêté à zéro ; route backend
de contexte de paiement consommée via RTK Query. Compilation des sources corrigées
de React Native/Hermes pour les builds release, et contrôle des bibliothèques/ABI
dans APK/AAB. Le debug habituel garde ses dépendances précompilées.

**Préservation et validation.** Règles de trajet et de paiement, reçus, reprise
d'abonnement, formulaires natifs et anciennes API conservés. Le guide PostgreSQL
a orienté les lectures ciblées par compte. Mobile : 789/791 tests réussis, deux
références préexistantes en échec. Backend : 33 tests ciblés réussis. Typage,
ESLint ciblé, frontières réseau et limite de 400 lignes validés.

Gradle confirme la substitution de dépendance, mais la préparation Hermes release
échoue ici faute de compilateur C++ hôte Windows. Aucun nouveau binaire release,
déploiement ou essai physique. Le crash SoLoader et les freezes de production
ne sont pas déclarés éliminés. Backend puis nouveaux builds natifs à valider
avant diffusion ; précautions et matrice de tests détaillées dans le document.

**Détails, fichiers et limites :** [Stabilité mobile — complément du 23 septembre](STABILITE_MOBILE_2026_09_23.md).

## 23 septembre 2026 — Récapitulatif des déposes compact dans la navigation

**Problème.** Le reçu de dépose affichait directement sur la carte le total,
les lignes financières, une explication, l'actualisation et la confirmation du
cash. Il occupait une grande partie de la navigation ; le sélecteur horizontal
montait également un bouton par passager.

**Solution appliquée.** `features/driver-navigation/DriverDropoffReceipts.tsx`
affiche une seule barre compacte (hauteur minimale de 64 points, pas une hauteur
fixe imposée aux grandes polices) : nombre de déposes, dernier passager, montant
et état du gain. Le guide d'interface a orienté le choix d'un résumé sobre avec
les détails à la demande, au lieu de superposer des reçus sur la carte.

Un toucher ouvre `DriverDropoffReceiptsSheet.tsx`, panneau interne limité à 80 %
de hauteur, avec fermeture explicite, zone sûre inférieure et FlatList virtualisée
(six éléments initiaux, fenêtre de trois écrans). Un seul passager est développé.
Les détails existants et `ConfirmCashReceipt` sont réutilisés sans changement de
calcul ni de validation. Une nouvelle dépose n'interrompt pas le reçu sélectionné
ni une confirmation de cash en cours dans ce panneau.

`DriverBookingRevenue.tsx` propose un affichage compact optionnel. Le total prévu
n'est jamais libellé « Gains crédités » ou « Cash reçu » si la ligne correspondante
ne couvre pas tout ce total. Les montants mixtes restent accompagnés de « Total ·
voir le détail ». Une erreur ou des données d'un autre passager ne deviennent pas
un gain nul inventé. L'affichage détaillé des autres écrans reste inchangé.

**Précautions.** Pas de nouveau modal natif UIKit : réemploi de `RideModal inApp`.
Aucune ouverture automatique à la dépose ; fermeture à la perte de focus, à la
veille ou au changement de trajet. La barre et le panneau ne montent pas leurs
lecteurs financiers simultanément : un seul reçu à la fois, sans nouveau polling,
timer, flux GPS ni requête par ligne de passager. Tous les appels restent RTK Query.
Le cash reste confirmé explicitement par le conducteur et n'est pas assimilé à
un crédit du portefeuille. Aucun changement backend ou paiement réel.

**Vérifications.** 49 tests ciblés réussis : reçus détaillés/compacts, cash, entêtes,
urgence, confirmations manuelles et panneaux iOS/Android. Tests complétés dans
`tests/driverBookingRevenue.test.js`, dont une liste simulée de 100 passagers,
sélection conservée à une nouvelle dépose, fermeture hors écran et distinction
entre gain crédité, cash, attente et total mixte. TypeScript sans émission, ESLint
ciblé, frontière réseau et `git diff --check` validés. 898 sources applicatives
contrôlées, aucune au-dessus de 400 lignes. Ce sont des tests JavaScript et de
structure, pas une mesure native de fluidité ni une validation visuelle sur
appareil. Vérifier petits écrans, grandes polices et défilement sur iOS/Android.

## 23 septembre 2026 — Masquer le récapitulatif de dépose par balayage

**Problème.** Même compact, le récapitulatif des gains occupait la carte après
consultation. Il fallait permettre au conducteur de le masquer sans perdre
l'accès aux reçus et à la confirmation du cash.

**Solution appliquée.** `features/driver-navigation/DriverDropoffReceipts.tsx`
accepte un balayage horizontal vers la gauche ou la droite pour masquer la barre.
Un toucher continue d'ouvrir le détail. Aucune annulation ni message supplémentaire
ne reste sur la carte. Une action équivalente est proposée aux lecteurs d'écran.
`DriverNavigationControls.tsx` ajoute « Gains des passagers » aux options dès
qu'une dépose est confirmée : le même panneau virtualisé reste accessible après
masquage, avec ses reçus et la confirmation explicite du cash reçu.

`driverDropoffReceiptsModel.ts` partage le filtrage existant des déposes du trajet
et construit une clé stable à partir du trajet et des identifiants de réservation.
Une nouvelle dépose fait réapparaître la barre ; un simple rafraîchissement des
données, un changement de montant ou d'ordre ne la réaffiche pas. Le masquage est
un état local conservé tant que ce composant reste monté, sans persistance ni
modification d'une réservation. Quitter puis remonter la navigation peut donc
réafficher le récapitulatif.

**Précautions.** Réemploi de `components/home/SwipeableHomePriority.tsx`, avec un
libellé optionnel adapté aux reçus ; le libellé et le fonctionnement de l'accueil
restent inchangés. Animation sur le thread UI, sans callback JavaScript à chaque
image, seuil horizontal et abandon sur mouvement vertical. Les protections
existantes annulent les callbacks tardifs après démontage, changement de clé ou
désactivation. Le geste est désactivé hors écran et lorsqu'un panneau interne est
ouvert. La lecture financière compacte est également suspendue derrière ce
panneau. Aucun nouveau polling, timer, flux GPS, modal natif ni appel réseau
hors RTK Query. Aucun montant, paiement ou encaissement n'est modifié par le swipe.

**Vérifications.** 53 tests ciblés réussis : reçus/cash, options de navigation,
gestes gauche/droite, callbacks annulés, compilation des worklets avec la
configuration Babel de production, cartes d'accueil et panneaux internes.
Tests complétés dans `tests/driverBookingRevenue.test.js`,
`tests/navigationHeaders.test.js` et `tests/homePriorityGesture.test.js`.
TypeScript sans émission, ESLint ciblé, frontière réseau et `git diff --check`
validés ; 899 sources applicatives contrôlées,
aucune au-dessus de 400 lignes. Les tests JavaScript ne remplacent pas un essai
natif : vérifier le balayage dans la zone défilante, le déplacement de la carte,
les retours depuis les panneaux et VoiceOver/TalkBack sur iOS et Android.
Aucune disparition des freezes ou crashs n'est annoncée sans ces essais.

## 23 septembre 2026 — Plusieurs réservations pendant un trajet et validation des groupes

**Problème.** Les confirmations détaillées prenaient trop de place avec plusieurs
réservations, des avis d'embarquement se remplaçaient et les compteurs confondaient
titulaire et personnes transportées. Il fallait aussi garantir qu'une réservation
de trois places demande une réponse du titulaire, pas trois validations séparées.

**Solution appliquée.** Actions et sélections attachées à `bookingId`, comptage des
personnes par places, listes virtualisées à détail unique, avis éphémères en file
bornée, contrôles de concurrence et de cycle de vie, filtrage des réservations du
compte passager. Les confirmations, descentes anticipées, paiements et gains
précisent la portée du groupe. Le backend local contrôle déjà le titulaire et
compte les confirmations par réservation ; aucun changement backend dans ce lot.

**Détail, fichiers et précautions.** Voir
[Trajets multi-passagers](TRAJETS_MULTI_PASSAGERS.md). Détection automatique,
file de confirmations hors connexion, paiement autoritatif serveur, validation
explicite du cash, SOS et swipe des reçus conservés. Aucun polling supplémentaire.

**Vérifications.** 102 tests ciblés réussis. Suite complète : 807 tests exécutés,
805 réussis ; les deux échecs préexistants de `tests/sourceExtractions.test.js`
restent présents (empreintes historiques des styles de réservations et de
l'API utilisateur/PIN, fichiers non modifiés par ce correctif). Ces empreintes
n'ont pas été réécrites pour masquer les échecs. TypeScript sans émission et
ESLint ciblé validés sans erreur ni avertissement. Frontière réseau et
`git diff --check` validés ; 903 sources contrôlées, aucune au-dessus de 400 lignes.
Les tests sont JavaScript ; aucun essai natif de longue durée n'est annoncé.
Les scénarios iOS et Android restant à exécuter figurent dans le document spécialisé.

## 23 septembre 2026 — Débloquer « Continuer avec le paiement cash »

**Problème constaté.** Le bouton envoyait systématiquement une modification du
mode de paiement, même pour une réservation déjà en cash. Cela rendait une simple
consultation dépendante du réseau. Le code local du backend refuse ce changement
lorsque `cashReceivedAt` est déjà renseigné, avant même de vérifier que le mode
est inchangé. Le mobile ne traitait pas cet encaissement cash comme un règlement
terminé et pouvait encore demander de remettre l'argent. Une erreur serveur
pouvait rester en bas du formulaire défilant, hors de la zone du bouton.
Ces cas ont été reproduits par des tests JavaScript ; faute de trace du clic
signalé, ils ne constituent pas une confirmation du scénario précis en production.

**Solution appliquée.**

- `hooks/arrival-payment/useArrivalPaymentSubmission.ts` ouvre directement le
  récapitulatif si la réservation est déjà en cash. Aucun changement de mode ni
  encaissement n'est envoyé dans ce cas. Les rafraîchissements existants du
  récapitulatif restent non bloquants.
- Lors d'un vrai changement depuis les jetons ou le paiement électronique,
  l'application attend toujours la réponse de la mutation RTK Query. Elle vérifie
  la réservation, le mode cash et le montant retournés avant d'afficher la suite.
  Le montant du groupe reste le montant serveur, sans multiplication par les places.
- `features/arrival-payment/buildPaymentCompletionSummary.ts` distingue cash
  encore à remettre et réception déjà confirmée par le conducteur. Le second cas
  n'invite plus le passager à payer de nouveau.
- `useArrivalPaymentState.ts` propose de terminer lorsque le serveur indique le
  cash reçu. `useBookingPaymentMode.ts` privilégie le mode effectivement réglé
  sur un ancien choix local non soumis.
- `ArrivalPaymentActions.tsx`, `ArrivalPaymentFields.tsx` et
  `components/PassengerArrivalPaymentCoordinator.tsx` affichent les erreurs de
  soumission près des boutons fixes, au lieu du bas du formulaire. Pendant
  l'enregistrement du mode cash, le libellé devient « Enregistrement… ».

**Comportements conservés.** Le passager ne confirme jamais l'encaissement à la
place du conducteur. Un paiement externe connu comme encore en attente bloque
toujours le changement de mode ; ses références ne sont ni effacées ni annulées
par ce bouton. Le cash n'est pas proposé avant l'arrivée. Le verrou anti-double
clic, les montants d'interruption, les trajets gratuits, les réservations de
groupe, le bouton de fermeture et l'isolation entre comptes sont conservés.
Aucun nouveau polling, endpoint, modal natif ou débit de jetons. Aucun changement
backend : lecture de `bookings.service.ts` et `cash-receipts.service.ts` seulement.

**Vérifications.** Trois échecs reproduits avant correction dans les tests de
soumission/récapitulatif cash, puis 72 tests ciblés réussis après correction.
Couverture : cash déjà sélectionné, cash reçu, changement réel de mode, réponse
incohérente, montant groupe, double clic, panne réseau, paiement externe en attente,
déconnexion pendant la requête, ancien choix local et erreur visible près du bouton.
Suite complète : 815 tests, 813 réussis et les deux mêmes échecs préexistants de
`tests/sourceExtractions.test.js` (styles de réservations et API utilisateur/PIN),
sans modification de ces fichiers ni de leurs empreintes dans ce correctif.
TypeScript et ESLint ciblé validés sans erreur ni avertissement ; frontière réseau
et `git diff --check` validés. 903 sources contrôlées, aucune au-dessus de 400 lignes.
Les tests sont JavaScript ; le clic sur iPhone/Android et le backend déployé n'ont
pas été testés. Vérifier sur appareil une réservation cash déjà encaissée et le
passage au cash après un échec électronique confirmé.

## 23 septembre 2026 — Réservation en navigation : boutons coupés et chevauchement

**Périmètre et problème constaté.** Navigation conducteur, réception d'une
réservation pendant un trajet. Le bloc était placé après les statistiques et le
prochain arrêt dans une zone défilante limitée à 30 % de l'écran. Sur la capture
signalée, « Refuser / Accepter » étaient partiellement coupés et la colonne des
commandes de carte empiétait sur les actions. Le mode de paiement partageait aussi
la même ligne que les deux boutons. L'erreur technique tronquée au bas de la
capture a été exclue de ce correctif à la demande de l'utilisateur ; aucune
correction de cette erreur n'est revendiquée.

**Solution appliquée et fichiers.**

- `DriverNavigationPassengersBar.tsx` affiche en priorité une seule réservation
  en attente, avec le nombre des suivantes, sans empiler les cartes des autres
  passagers au-dessus. Une demande de descente urgente conserve la priorité.
- `DriverPendingBookingPrompt.tsx` extrait une carte compacte : titulaire, nombre
  de places, mode de paiement, départ et destination. Les détails peuvent défiler
  si la hauteur disponible est insuffisante. Les boutons restent dans un pied
  séparé non rétractable, avec des cibles d'au moins 44 points, une hauteur
  adaptable et un retour à la ligne possible. Le défilement des détails est
  réinitialisé uniquement lorsque la réservation affichée change.
- `DriverNavigationTopPanel.tsx` sort la réservation de la liste secondaire
  limitée à 30 %. Pendant cet affichage, les confirmations restent accessibles
  via leur bouton compact, sans le texte d'aide secondaire. Contact, SOS et sortie
  de navigation restent accessibles. Les détails habituels reviennent à la fin
  de la file des réservations.
- `DriverNavigationControls.tsx` dispose temporairement les quatre commandes de
  carte sur une rangée. `driverPendingBookingLayout.ts` partage le calcul de
  l'espace réservé entre cette rangée et le panneau supérieur, en tenant compte
  de la hauteur de fenêtre et des marges système. Le menu Options s'ouvre
  au-dessus de la rangée, dans les limites tactiles de son parent. La disposition
  habituelle est rétablie quand la réservation n'est plus affichée.

Les composants et le calcul de disposition se trouvent dans
`features/driver-navigation/`. La composition compacte conserve les couleurs
de l'application et n'ajoute ni animation ni modal.

**Précautions et comportements conservés.** Aucun changement d'API, de prix ou de
paiement. Les mutations RTK Query, la file de réservations, les verrouillages
anti-double clic et le ciblage par identifiant de réservation sont conservés.
Une réservation de plusieurs places reste une seule action pour son titulaire.
Pause/interruption, guidage vocal, recalcul, options et reçus conservent leurs
gestionnaires. Aucun nouveau polling, abonnement GPS, écouteur ou minuteur.

**Vérifications.** 30 tests JavaScript ciblés réussis, dont quatre nouveaux dans
`tests/driverPendingBookingLayout.test.js` : priorité du bloc, urgence prioritaire,
actions hors défilement, réservation de trois places, état de traitement,
commandes conservées et limites tactiles du menu. Suite complète : 819 tests,
817 réussis et les deux échecs préexistants de `tests/sourceExtractions.test.js`
(empreintes historiques des styles de réservations et de l'API utilisateur/PIN).
Les fichiers concernés par ces échecs et leurs empreintes n'ont pas été modifiés.
TypeScript sans émission, ESLint ciblé, frontière réseau et `git diff --check`
validés ; 905 sources contrôlées, aucune au-dessus de 400 lignes.
Le contrôle des dimensions teste les propriétés de
disposition, pas le rendu natif de Yoga. La vérification visuelle sur iPhone et
Android reste à effectuer, notamment avec grande police, petit écran, plusieurs
réservations successives et arrivée simultanée d'une demande de descente.
Aucune absence de crash, de blocage ou de chauffe n'est déduite de ces tests.

## 23 septembre 2026 — Confirmation passager de l'interruption du conducteur

**Périmètre et problème constaté.** Le signalement concerne la confirmation de
l'arrêt demandé par le conducteur, et non la confirmation de dépose. Le code
ignorait la réponse de confirmation et attendait les rechargements du trajet et
de la réservation avant de libérer l'action. Des lectures lentes pouvaient ainsi
laisser l'écran inchangé ; une lecture rejetée pouvait faire afficher une erreur
après une confirmation déjà acceptée. Ces comportements ont été reproduits dans
les tests JavaScript. De plus, le bouton permettant de retrouver le choix
« attendre ou s'arrêter ici » était dans un bloc réservé aux trajets en cours :
il disparaissait lorsque le serveur mettait le trajet en pause.

**Solution effectivement appliquée et fichiers.**

- `hooks/passenger-navigation/usePassengerNavigationInterruption.ts` vérifie la
  réponse serveur (trajet, demande d'interruption, réservation, titulaire et
  confirmation), puis reflète immédiatement cette réponse. Les lectures de
  réconciliation continuent sans bloquer l'action et leurs erreurs ne sont plus
  présentées comme un échec de la confirmation. Un acquittement local, limité à
  cette demande et posé seulement après succès, empêche une lecture ancienne de
  réactiver les boutons. Confirmation et refus conservent le verrou anti-double
  clic ; les callbacks devenus obsolètes après changement de demande, de
  réservation ou sortie de l'écran sont ignorés.
- `store/api/trip/interruptionResponseCache.ts` réutilise la réponse serveur dans
  les caches RTK Query du trajet, de la réservation et des listes personnelles.
  La liste d'activité alimente notamment le modal global « attendre / s'arrêter ».
  Les mises à jour sont limitées au compte et à la réservation concernés ; une
  demande remplacée ou un trajet terminé ne doivent pas être rétablis par une
  réponse ancienne. Aucun statut de paiement ou de dépose n'est déduit de la pause.
- `hooks/passenger-navigation/usePassengerNavigationData.ts` et
  `usePassengerNavigationController.ts` relient cette synchronisation au parcours
  existant. Aucun nouvel endpoint ni abonnement réseau n'est ajouté.
- `features/passenger-navigation/PassengerNavigationInfoCard.tsx` conserve
  `PausedPassengerRideNotice` accessible en dehors du bloc « trajet en cours »
  et affiche « Le trajet est en pause » lorsque l'interruption est confirmée.

**Comportements conservés et précautions.** Le backend reste la source de vérité :
un clic ne valide pas l'arrêt localement avant sa réponse. Le titulaire répond
pour toutes les places de sa réservation ; plusieurs réservations restent des
réponses distinctes. La pause n'est appliquée qu'après les confirmations requises
par le backend. Confirmer l'interruption ne confirme ni dépose ni encaissement :
les choix attendre/s'arrêter, le calcul du montant et le paiement gardent leurs
parcours séparés. Aucun nouveau modal natif, polling, minuteur ou suivi GPS.
Lecture seulement de `trips.controller.ts`, `trips.service.ts` et
`driver-interruption.workflow.ts` côté backend : aucune modification ou opération
sur le backend déployé dans ce correctif.

**Vérifications et limites.** 39 tests ciblés réussis, dont 13 nouveaux dans
`tests/passengerDriverInterruption.test.js` et
`tests/interruptionResponseCache.test.js`. Cas couverts : rechargements bloqués ou
rejetés après succès, mutation refusée et nouvel essai, double clic, confirmation
partielle avec plusieurs réservations, réservation de plusieurs places, refus,
réponse incohérente, changement de demande/compte/écran, préservation des montants,
des paiements et des autres réservations, accès au choix après mise en pause.
Suite complète : 832 tests, 830 réussis et les deux échecs préexistants de
`tests/sourceExtractions.test.js` (empreintes des styles de réservations et API
utilisateur/PIN), sans modification de ces fichiers ni de leurs empreintes ici.
TypeScript sans émission, ESLint ciblé, frontière réseau et `git diff --check`
validés ; 906 sources contrôlées, aucune au-dessus de 400 lignes.
Ces résultats sont des tests JavaScript et des contrôles statiques, pas des essais
natifs ni une reproduction du signalement en production. Il reste à tester sur
iPhone et Android : réseau lent, retour de veille, annulation puis nouvelle demande,
un titulaire de trois places avec une seconde réservation, confirmation/refus,
puis choix attendre/s'arrêter et règlement. Aucune disparition des blocages ou
crashs natifs n'est garantie par ces vérifications.

## 23 septembre 2026 — Descente anticipée : confirmation par le conducteur

**Périmètre et constat.** Le passager demande à descendre avant sa destination ;
le conducteur observe un chargement qui s'arrête sans résultat apparent. Le code
utilisait la réponse de confirmation pour un message, mais ne l'appliquait pas
aux réservations affichées : la disparition de la demande, les arrêts et les
reçus dépendaient de lectures supplémentaires. Le refus attendait encore ces
lectures avant de libérer l'action. La file des demandes affichait aussi des
réservations déjà déposées/terminées ou annulées si leur demande restait marquée
en attente, alors que le garde de l'action empêchait leur traitement.
Ces défauts sont vérifiés dans le code et les tests ; sans réponse réseau du cas
signalé, ils ne prouvent pas la cause exacte de cet incident en production.

**Solution appliquée et fichiers.**

- `features/driver-navigation/passengerInterruptionResponse.ts` centralise
  l'éligibilité et la vérification de la réponse serveur : même réservation,
  trajet, titulaire et demande lorsqu'elle est présente. Une confirmation doit
  renvoyer une réservation terminée ; une réponse encore en attente n'est plus
  annoncée comme une dépose réussie. Le backend omet normalement les demandes
  clôturées, donc une demande absente dans sa réponse reste compatible.
- `useDriverNavigationBookings.ts` et `useDriverBookingActionGuard.ts`, dans
  `hooks/driver-navigation/`, utilisent la même règle pour la file affichée et
  l'exécution. Les demandes devenues inapplicables ne masquent plus les suivantes.
- `hooks/driver-navigation/useDriverBookingActions.ts` applique la réponse
  validée dès la confirmation ou le refus. Les rechargements de réconciliation
  restent non bloquants, y compris après refus. Le montant du récapitulatif vient
  toujours du serveur. Un échec serveur conserve le message d'erreur et ne simule
  aucune dépose ni réussite du paiement.
- `store/api/booking/passengerInterruptionResponseCache.ts` met à jour uniquement
  la réservation concernée dans `getTripBookings` et `getBookingById`, avec
  vérification du compte conducteur, de l'appartenance au trajet et des identités.
  Les versions plus récentes, les demandes remplacées et les états terminaux
  incompatibles sont préservés. Le trajet imbriqué déjà en cache et les identités
  d'affichage non renvoyées ne sont pas écrasés. Les autres réservations ne sont
  pas modifiées. Les reçus existants peuvent utiliser immédiatement la dépose.
- `useDriverNavigationData.ts` et `useDriverNavigationController.ts` relient
  cette mise à jour RTK Query à l'action existante.

**Comportements conservés.** Une réservation de plusieurs places est confirmée
pour son titulaire en une seule action ; son montant n'est pas multiplié à nouveau.
Les autres passagers continuent leur trajet. Aucun recalcul local de tarif,
changement de mode de paiement, confirmation fictive du cash, nouveau polling,
minuteur, abonnement GPS ou modal natif. Les protections contre le double clic,
les anciennes demandes et les réponses après sortie de navigation restent actives.
Le backend a été lu (`bookings.service.ts`, contrôleur et tests d'interruption),
mais pas modifié ni déployé. Sa protection contre le recalcul d'un paiement déjà
en cours reste en place ; ce refus ne peut pas être contourné par l'application.

**Vérifications.** Quatre tests de comportement échouaient avant correction,
puis 27 tests ciblés passent, dont 12 nouveaux dans
`tests/driverPassengerInterruption.test.js` et
`tests/passengerInterruptionResponseCache.test.js`. Les fixtures du garde d'action
dans `tests/interruptionSettlement.test.js` ont été complétées pour représenter
une véritable demande en attente. Couverture : réponse validée, montant de groupe,
deux réservations, double clic, rechargements bloqués/rejetés, refus, erreur métier,
réponse incohérente, sortie d'écran, demande remplacée, compte différent et paiement
plus récent. Suite complète : 844 tests, 842 réussis, les deux échecs préexistants
d'empreintes dans `tests/sourceExtractions.test.js` inchangés (styles des
réservations et API utilisateur/PIN). TypeScript validé. ESLint ciblé sans erreur,
avec cinq avertissements préexistants de `useDriverNavigationBookings.ts`,
également reproduits sur sa version HEAD. Frontière réseau et `git diff --check`
validés ; 908 sources contrôlées, aucune au-dessus de 400 lignes.

**Limites et essais restants.** Tests JavaScript et contrôles statiques seulement,
sans appel au backend déployé ni essai sur appareil. Tester sur iPhone/Android
avec réseau lent, deux demandes successives, une réservation de trois places,
retour de veille, refus serveur et reprise du paiement par le passager. La
réception sur le téléphone du passager conserve les notifications et la
synchronisation existantes, non validées ici de bout en bout. Ces résultats ne
garantissent pas l'absence de crash ou de blocage natif.

## 2026-09-30 — Retrait d’un véhicule sans effacer l’historique

**Périmètre et problème.** Le profil annonçait une suppression irréversible alors que
`DELETE /vehicles/:id` désactive le véhicule. Les trajets en cours ou à venir
peuvent empêcher cette désactivation. L’interface ne l’expliquait pas avant
confirmation.

**Solution appliquée.** Dans `hooks/profile/useProfileVehicles.ts`, la confirmation
décrit le retrait du profil et la conservation de l’historique, et le retour de
succès emploie « retiré ». `components/profile/ProfileVehiclesSection.tsx` montre
une action « Retirer » avec une icône adaptée. La section reste visible au
conducteur après le retrait de son dernier véhicule, avec le bouton d’ajout.
Le test ciblé dans
`tests/profileModules.test.js` vérifie cette confirmation et la réconciliation
après délai réseau ambigu. Le backend refuse aussi la désactivation en présence
de trajets à venir/en cours ou d’un modèle récurrent actif, y compris par
`PUT /vehicles/:id` avec `isActive=false`. La réponse `DELETE /vehicles/:id`
annonce `isActive=false` ; le typage mobile garde ce champ facultatif pendant
le déploiement progressif du backend.

**Comportements conservés et limites.** Le véhicule reste en base pour les anciens
trajets et disparaît de la liste des véhicules actifs ; l’application n’anticipe
pas la réussite avant la réponse du serveur. Les tests ciblés du profil mobile
passent (28/28), ainsi que sa vérification TypeScript et son lint ciblé. Côté
backend, les tests ciblés véhicules/trajets/récurrence passent (57/57) et la compilation
réussit. Aucun essai sur appareil physique ni déploiement n’a été effectué.

## Format pour les prochaines entrées

Pour chaque problème corrigé : date/périmètre, problème constaté, solution
effectivement appliquée, fichiers concernés, comportements conservés, vérifications
et limites. Référencer les documents spécialisés si le détail devient volumineux.

## 2026-10-15 — Refonte visuelle de l’accueil par rôle

**Périmètre et problème constaté.** L’accueil plaçait plusieurs actions au-dessus
de la carte, tandis que la zone inférieure ne montrait qu’une liste horizontale.
Cela s’éloignait des maquettes passager/conducteur et rendait l’action principale
moins évidente. La carte affichait aussi des marqueurs de tous les trajets et
commandes, en doublon avec leurs cartes.

**Solution appliquée et fichiers.** `components/home/HomeHeader.tsx` et
`features/home/HomeHeader.styles.ts` réduisent la zone supérieure à l’avatar,
aux notifications et, si nécessaire, à l’indication d’un trajet en cours.
`components/home/HomeTripsSheet.tsx` et `features/home/HomeTripsSheet.styles.ts`
transforment la feuille en tableau de bord défilant, avec accueil personnalisé,
recherche visuellement identifiable pour le passager, actions « Proposer un
trajet »/« Commander », publication principale pour le conducteur, compteurs
fondés sur les données déjà chargées et une suggestion de trajet/client.
`components/home/HomeSuggestionCard.tsx` et
`features/home/HomeSuggestionCard.styles.ts` ajoutent une carte de route compacte
avec prix, horaire, lieux, identité et accès aux détails.
`components/home/HomeMap.tsx` n’affiche plus les marqueurs des trajets et demandes
ordinaires : ces résultats restent accessibles depuis la feuille. La position
de l’utilisateur et les marqueurs des passagers pendant le trajet du conducteur
restent affichés. `hooks/home/useHomeMap.ts` ne calcule plus les coordonnées,
la sélection ni les références de marqueurs des suggestions cachées ; la caméra
se centre sur l’utilisateur (ou cadre le trajet actif du conducteur). La palette
est ajustée dans `features/home/homeModel.ts` et
l’éclaircissement de fond dans `features/home/HomeScreen.styles.ts`.
`hooks/home/useHomeSheet.ts` sélectionne par défaut les clients pour un compte
conducteur et les trajets pour un passager, y compris après le chargement tardif
du rôle. `components/home/HomeLocationButton.tsx` conserve son action de recentrage.
La barre d’onglets n’a pas été modifiée.

**Comportements conservés et précautions.** Les actions de publication, recherche,
commande, ouverture des détails, listes complètes, notifications et balayage pour
masquer une priorité restent reliés aux mêmes parcours. L’aperçu d’un trajet ouvre
ses détails — il ne contourne pas le flux de réservation. Les nombres affichés
proviennent des listes déjà présentes, sans chiffre de gains inventé et sans
nouvelle requête. La consultation des adresses enregistrées « Maison/Travail »
et les raccourcis récents ne sont pas ajoutés ici, car leur branchement direct
à la recherche n’était pas présent dans le flux existant.

**Vérifications et limites.** `npx.cmd tsc --noEmit --pretty false` passe sans
erreur. `git diff --check` passe. Aucun test unitaire n’a été lancé et aucun essai
sur appareil physique ou émulateur n’a été réalisé ; la disposition selon les
tailles d’écran et le rendu natif de la carte restent à confirmer sur appareils.
L’effet de performance n’a pas été mesuré : les marqueurs supprimés réduisent le
travail de rendu cartographique, mais les lectures de données existantes restent
inchangées.

## 2026-10-15 — Accueil : fidélité aux maquettes conducteur et passager

**Problème constaté.** La première reprise visuelle restait trop éloignée des
références : proportion de carte réduite, tailles de textes et boutons différentes,
absence des raccourcis et bloc conducteur incomplet. Le repère de position pouvait
être caché sous la feuille. Cette entrée complète et remplace les limites visuelles
de l’entrée précédente.

**Solution appliquée.** La palette partagée `features/home/homeDashboardTheme.ts`
et les styles `HomeTripsSheet.styles.ts`, `HomeSuggestionCard.styles.ts` et
`HomeHeader.styles.ts` reprennent le fond crème, le brun orangé, le vert, les
arrondis, les initiales, les boutons bordés et la hiérarchie des deux références.
`HomeTripsSheet.tsx` et `HomeSuggestionCard.tsx` présentent une suggestion principale,
avec l’horaire, le prix, le parcours et les boutons « Réserver » / « Accepter ».
Ces boutons ouvrent les parcours existants de détail et de confirmation ; aucune
réservation ou acceptation n’est envoyée par un simple changement de présentation.
Les avis sont affichés uniquement lorsqu’ils sont fournis par l’API. Un prix absent
n’est plus assimilé à un trajet gratuit dans cette carte.

`HomeDestinationShortcuts.tsx` branche Maison/Travail sur les adresses enregistrées
et préremplit la recherche ; sans adresse enregistrée, le raccourci ouvre leur
gestion. « Récents » déplie jusqu’à trois destinations personnelles tirées des
réservations et commandes déjà chargées dans `useHomePassengerActivity.ts`.
Il s’agit d’un aperçu de l’activité disponible, pas d’un nouvel historique exhaustif.

`HomeDriverStatus.tsx` reprend l’état du serveur et l’échéance de présence pour
afficher « En ligne » ; les états inconnus, expirés ou hors connexion ne sont pas
présentés comme disponibles. `HomeDriverEarnings.tsx` lit le résumé des revenus,
avec cache de 60 secondes et sans interrogation périodique ni téléchargement de
l’historique. Le libellé est « Mes gains — disponibles » : l’API existante ne fournit
pas un agrégat journalier qui permette d’afficher fidèlement « Gains du jour ».
Les lectures de favoris/revenus sont suspendues hors écran actif ou hors réseau.

`useHomeSheet.ts` mesure la zone réellement disponible en tenant compte de la barre
d’onglets : environ 37 % pour la carte et 63 % pour la feuille, plafonnée sur grand
écran et défilable. `HomeMap.tsx`, `useHomeMap.ts`, `useHomeUserLocation.ts` et
`homeMapAppearance.ts` affichent exclusivement la position de l’utilisateur sur
l’accueil, y compris pendant un trajet. Le suivi des passagers reste dans les écrans
de navigation. La carte occupe sa propre zone et son attribution reste visible.
Les priorités de réservation/commande sont déplacées dans la feuille via
`app/(tabs)/index.tsx`. Les destinations de la barre d’onglets sont conservées.

**Précautions et observations natives.** L’aperçu Android a montré un découpage
du halo lorsque le repère utilisait une vue React personnalisée. Il est remplacé
par une image native locale, avec trois densités, générée de manière reproductible
par `scripts/generate-home-position-marker.cjs` :
`assets/images/map-markers/home-position-dot*.png` (4 391 octets au total).
Il ne requiert aucune animation, boucle de capture de vue ou image distante.
`useHomeMarkerReadiness.ts` conserve un contrat de types autonome pour l’ancien
utilitaire ; l’accueil n’en dépend plus. Aucun changement d’authentification,
de dépendance ou de configuration native n’est inclus.

**Vérifications (finalisées le 16 octobre).** TypeScript et lint ciblé passent.
La suite `npm.cmd run test:home` passe (148 tests), ainsi que les trois tests
ajoutés dans `tests/homeDestinationShortcuts.test.js`. Les attentes de
`homeCompactLayout.test.js`, `homeCompactCards.test.js`,
`homeForegroundLifecycle.test.js` et `homeModules.test.js` ont été adaptées aux
proportions, au déplacement des actions et au centrage sur l'utilisateur. Les
vérifications du cycle de vie, des listes en cache, des accès et de la navigation
restent présentes. `git diff --check` passe. Ces tests JavaScript ne constituent
pas des essais natifs.
Un contrôle visuel a été réalisé dans le build de développement de l’émulateur
Android : accueil passager réel et aperçu conducteur isolé avec données fictives,
sans changement de rôle du compte et sans acceptation de commande. Le repère
complet a été vérifié avec une coordonnée locale de présentation, sans injection
dans le GPS ni envoi de cette coordonnée au serveur. Le GPS réel de l’émulateur
n’a pas fourni de position lors de cet essai : le centrage sur une position réelle
reste à vérifier sur téléphone. Aucun essai iOS, build release, mesure de mémoire
ou conclusion sur la disparition des crashs n’est revendiqué.
L'écran temporaire de présentation conducteur a été retiré du projet. Les
raccourcis ont été vérifiés par tests isolés (favoris, recherche préremplie,
destinations récentes et absence de lecture hors écran/réseau) ; leur essai
manuel final n'a pas été terminé, l'émulateur n'étant plus connecté. Le rendu
de carte utilise Google Maps sur Android et MapKit atténué sur iOS : les fonds
cartographiques ne peuvent pas reproduire à l'identique l'illustration fournie.

## 2026-10-16 — Accueil passager : actions plus visibles

**Périmètre et problème.** À la demande de l'utilisateur, les actions passager
devaient ressortir davantage que les deux boutons blancs de la maquette.

**Solution appliquée.** Dans `components/home/HomeTripsSheet.tsx` et
`features/home/HomeTripsSheet.styles.ts`, « Proposer un trajet » reçoit le bleu
de la palette existante et « Commander » le brun orangé, avec du texte blanc.
La barre « Où allez-vous ? » reste blanche et bordée pour conserver son apparence
de recherche. La palette reste limitée, sans ombre ni animation supplémentaire.

**Comportements conservés.** Dimensions minimales, texte redimensionnable, retour
visuel à l'appui, destinations de navigation, affichage conducteur et barre
d'onglets inchangés par cet ajustement. Aucune dépendance ni configuration native
n'a été ajoutée.

**Vérifications et limites.** Le test de `tests/homeCompactLayout.test.js` vérifie
les couleurs distinctes, le contraste du texte blanc (au moins 4,5:1), les cibles
tactiles et les mêmes destinations de navigation. Lint ciblé et tests Home
passent. Ces dernières couleurs n'ont pas fait l'objet d'un nouvel essai visuel
sur appareil physique ou émulateur.

## 2026-10-16 — Accueil : orange, réservation verte et position plus lisible

**Périmètre et demande.** Remplacer le brun des boutons principaux de l'accueil
par de l'orange, afficher « Réserver » en vert et rendre la position personnelle
plus identifiable sur la carte. Cette entrée remplace le choix de couleurs de
l'entrée précédente, sans modifier les parcours métier.

**Solution appliquée.**

- `features/home/homeDashboardTheme.ts`, `HomeTripsSheet.styles.ts` et
  `components/home/HomeTripsSheet.tsx` : « Commander » et « Publier un trajet »
  utilisent l'orange vif `#FF6B35`. Leur texte est sombre pour préserver un
  contraste d'au moins 4,5:1 ; « Proposer un trajet » reste bleu et blanc.
- `features/home/HomeSuggestionCard.styles.ts` : l'action de réservation
  devient verte, avec texte blanc. Les commandes conducteur restent vertes.
- `components/home/HomeMap.tsx` et `features/home/HomeMap.styles.ts` : un seul
  repère personnel, légendé « Votre position ». En l'absence de coordonnées
  valides, la carte indique « Position en attente » sans inventer de position
  à partir du centre par défaut. Les coordonnées sont contrôlées avant rendu.
- `scripts/generate-home-position-marker.cjs` et les trois fichiers
  `assets/images/map-markers/home-position-dot*.png` : repère natif de 60 points,
  orange, cerclé de blanc avec halo renforcé. Les images locales totalisent
  5 178 octets ; aucune vue React animée ni capture répétée de marqueur.
- `features/home/homeMapPolicy.ts`, `hooks/home/useHomeMap.ts` et
  `hooks/home/useHomeUserLocation.ts` : zoom de quartier commun de 0,008 degré
  pour le centrage automatique et le bouton de recentrage.

**Comportements conservés.** Mêmes destinations des boutons, contrôle de la
réservation dans les détails, permissions GPS, fréquences de localisation et
limitation des animations de caméra. Aucune nouvelle lecture réseau, dépendance,
configuration native ou modification de la barre d'onglets. Les cartes de trajet
restent dans la feuille, pas sur la carte géographique.

**Vérifications et limites.** `npm.cmd run test:home` : 156 tests réussis.
`npx.cmd tsc --noEmit --pretty false` passe sans erreur.
`tests/homeCompactLayout.test.js` couvre couleurs, contrastes et actions ;
`tests/homeUserPositionDisplay.test.js` couvre marqueur unique, coordonnées
absentes/invalides, position de secours, légende, retrait de la carte et centrage
à son initialisation. Lint ciblé et `git diff --check` passent. Contrôle visuel
sur l'émulateur Android : boutons orange/vert, repère orange complet et légende
visibles, attribution de la carte non masquée. Aucune coordonnée fictive n'a été
injectée pour cet essai. Pas d'essai sur téléphone physique ni sur iOS ; la
précision GPS réelle et les performances natives ne sont pas mesurées ici.

## 2026-10-16 — Accueil : intégration de la palette A « Orange brûlé et nuit »

**Périmètre et problème.** L'utilisateur a retenu la proposition A pour réduire
la concurrence entre les trois couleurs des boutons. Cette entrée remplace le
choix précédent d'une réservation verte et d'un texte sombre sur orange.

**Solution appliquée.** `features/home/homeDashboardTheme.ts` définit le bleu nuit
`#1E2A4A` et l'orange brûlé `#D1430F`. Ce dernier est légèrement plus sombre que
le `#D9480F` proposé : le contraste calculé avec le blanc passe de 4,30:1 à
4,65:1. Le bleu nuit atteint 14,14:1. Ces chiffres sont des calculs à partir des
couleurs sRGB, pas des mesures d'écran.

`HomeTripsSheet.styles.ts` et `components/home/HomeTripsSheet.tsx` appliquent le
bleu nuit à « Proposer un trajet » et l'orange à « Commander » / « Publier un
trajet », avec texte et icône blancs. L'exception de texte sombre est retirée.
`HomeSuggestionCard.styles.ts` utilise le même orange pour « Réserver » et
« Accepter ». Le vert reste réservé aux repères informatifs, dont « Gratuit »
et « En ligne », sur fond vert pâle adouci. Les accents et contours orange de
l'accueil reprennent la même palette.

**Comportements conservés.** Positions, dimensions, libellés, destinations et
confirmations des boutons inchangés. La recherche reste blanche. Le repère de
position et sa légende conservent leur orange vif : couleur dédiée dans la
palette, consommée par `HomeMap.styles.ts`, sans modification du GPS ni des images
de marqueur. Aucun changement de barre d'onglets, réseau, dépendance ou animation.

**Vérifications et limites.** `npm.cmd run test:home` : 157 tests réussis.
`npx.cmd tsc --noEmit --pretty false` passe sans erreur.
`tests/homeCompactLayout.test.js` vérifie les couleurs de la proposition A,
le texte blanc, le contraste minimal de 4,5:1, les actions conservées et les états
verts. Lint ciblé et `git diff --check` passent. Contrôle visuel de l'accueil
passager sur l'émulateur Android : boutons bleu nuit/orange et texte blanc,
badge gratuit vert, repère personnel inchangé. Pas de nouvel essai iOS ou sur
téléphone physique, ni de mesure de performance native.

## 2026-10-16 — Accueil : navigation de liste intégrée et commande côté conducteur

**Périmètre et problème.** Les accès aux autres trajets et à la liste complète
étaient placés après les cartes et pouvaient sortir de la zone visible. Une
première variante fixée au bas du panneau a été abandonnée à la demande de
l'utilisateur. Le conducteur souhaitait aussi pouvoir commander un véhicule
depuis son accueil, sans devoir changer son profil.

**Solution appliquée.** Dans `components/home/HomeTripsSheet.tsx`, les onglets
« Clients » et « Trajets », avec leur état sélectionné, remplacent le lien de
bascule en bas de liste. Ils sont placés avant les suggestions, à côté de
« Voir tout ». Ce dernier conserve une étiquette accessible précisant la liste
ouverte. Ces contrôles défilent avec le contenu : aucun pied fixe ni élément
superposé aux dernières cartes. Côté passager, le titre des trajets et
« Voir tout » partagent la même ligne, sans accès aux commandes des autres.

Le conducteur dispose de « Commander » à côté de « Publier un trajet ».
Le bouton ouvre le formulaire existant via `getTripRequestCreateHref()`, sans
modifier le rôle du compte ni créer automatiquement une commande. Publication
orange pleine, commande secondaire blanche avec contour orange ; les libellés
peuvent revenir à la ligne. `features/home/HomeTripsSheet.styles.ts` définit
ces rangées compactes et conserve des cibles tactiles d'au moins 44 points.

**Comportements conservés et précautions.** Dimensions du panneau, espace de la
carte, localisation, barre d'onglets principale, priorités des réservations et
limitation à une suggestion montée inchangés. Les contrôles restent présents
sur une liste vide, en chargement ou en erreur. Le repli du panneau continue à
retirer son contenu. Aucun changement réseau, backend, dépendance, permission,
configuration native, fréquence GPS ou animation.

**Vérifications.** `tests/homeCompactLayout.test.js` couvre le positionnement
des accès dans le défilement et avant les suggestions, les deux rôles et modes,
les états vides/chargement/erreur, l'état accessible des onglets, les destinations
et les deux actions conducteur sur une même ligne. Les 19 tests ciblés passent.
`npm.cmd run test:home` : 160 tests réussis, aucun échec.
`npx.cmd tsc --noEmit --pretty false`, le lint ciblé des deux fichiers de
présentation et du test, ainsi que `git diff --check`, passent sans erreur.

**Limites.** Les scénarios avec plusieurs éléments sont des tests JavaScript,
pas une mesure de charge native. Le rendu final n'a pas été validé sur appareil :
l'émulateur Android affichait une navigation de trajet en cours, laissée intacte.
Pas d'essai iOS ni sur téléphone physique. Pour la recette : recharger le build
de développement existant (ou lancer `npx.cmd expo start --dev-client`), vérifier
sur Android et iOS le défilement, les deux onglets internes, « Voir tout » et
l'ouverture du formulaire « Commander » côté conducteur, puis revenir sans
soumettre de commande. Aucun nouveau build natif n'est requis pour ces seuls
changements JavaScript et styles.

## 2026-10-17 — Accueil : priorités au-dessus de la carte

**Périmètre et problème.** Les cartes prioritaires encombraient le panneau
défilant de l'accueil. L'utilisateur souhaite retrouver les trajets et
réservations prioritaires, ainsi que la commande proche, sur la zone de carte.

**Solution appliquée.**

- `app/(tabs)/index.tsx` place `HomeActivityCards` au-dessus de la carte, en
  dehors du panneau et du composant natif `MapView`. Les cartes utilisent les
  sélections et destinations existantes : réservation reçue, trajet conducteur
  à venir, réservation personnelle, commande proche et commande personnelle.
- `components/home/HomeMapPriorities.tsx` affiche une seule carte montée à la
  fois. Des flèches de 44 points et un compteur permettent d'accéder aux autres,
  sans défilement automatique. Le choix reste stable au rafraîchissement ; si la
  carte disparaît ou est masquée, la première priorité restante devient visible.
  La zone de texte est bornée et défile verticalement si nécessaire. Le geste
  horizontal existant continue à masquer une priorité, pas à changer de carte.
- `components/home/HomeActivityCards.tsx`, `hooks/home/useHomeTripSelection.ts`
  et `features/home/homePriorityDismissal.ts` ajoutent la réservation personnelle
  issue des trajets et réservations déjà chargés. Son masquage reste local à
  l'accueil et ne modifie ni réservation ni statut serveur.
- `components/home/HomeTripsSheet.tsx` ne reçoit plus les priorités dans son
  contenu. La commande proche et la réservation déjà mises en avant sur la
  carte sont exclues de sa suggestion pour éviter un doublon. Les autres
  suggestions et les accès aux listes complètes restent disponibles.
- `hooks/home/useHomeController.ts` et `hooks/home/useHomeSheet.ts` réservent
  davantage de hauteur à la carte uniquement lorsqu'une priorité existe. Le
  panneau conserve un défilement et au moins 35 % de l'espace disponible dans
  cette configuration. Ses anciennes mesures natives ne peuvent pas déplacer
  le bouton de recentrage après un changement de hauteur.
- `components/home/HomeMap.tsx` et `features/home/homeMapAppearance.ts` adaptent
  les marges de caméra à la zone occupée, avec une limite selon la hauteur de la
  carte. Le seul marqueur géographique reste la position de l'utilisateur :
  aucun nouveau marqueur de trajet ni position fictive.

**Comportements conservés.** Ordre de sélection des trajets conducteur et des
commandes proches, validité des commandes, priorité de la navigation en cours,
masquage accessible, accès aux détails, boutons de commande/publication et
barre d'onglets principale. Pas de nouvelle dépendance, requête, minuterie,
permission GPS, modification backend ou configuration native. Les tests
confirment la conservation de la place de `HomeMap` dans l'arbre React pendant
les chargements et erreurs ; ils ne mesurent pas la mémoire native.

**Vérifications réalisées.** `npm.cmd run test:home` : 167 tests réussis, aucun
échec. `npx.cmd tsc --noEmit --pretty false`, le lint ciblé et
`git diff --check` passent. Les tests ajoutés ou adaptés dans
`tests/homeMapPriorities.test.js`, `homeActivityCards.test.js`,
`homeCompactLayout.test.js`, `homeForegroundLifecycle.test.js`,
`homeModules.test.js` et `homeUserPositionDisplay.test.js` couvrent la pagination,
le retrait des doublons, le retrait d'une carte obsolète, les réservations
personnelles, le masquage, les marges, les anciennes mesures natives et les
dimensions simulées de petits/grands écrans iOS et Android.

**Limites et recette.** Aucun appareil ni émulateur connecté lors de la
vérification finale. Ces résultats sont JavaScript/TypeScript : rendu, gestes,
grands caractères, orientation paysage et caméra restent à valider sur iOS et
Android réels, sans conclusion sur les crashs ou la chauffe. Recharger le build
de développement avec `npx.cmd expo start --dev-client` ; tester zéro, une et
plusieurs priorités, les flèches, le masquage et l'ouverture des détails,
le repli du panneau et le recentrage. Vérifier la visibilité du point personnel,
des attributions cartographiques et l'absence de doublon dans le panneau.
Aucun nouveau build natif n'est requis pour ces changements ; aucun déploiement
ni envoi de mise à jour n'a été effectué.

## 2026-10-17 — Sonnerie du téléphone pour les alertes conducteur

**Problème et périmètre.** Sonnerie des nouvelles commandes proches et des
réservations signalée comme trop faible. Intervention mobile Android/iOS et
backend des notifications, sans modifier la sélection des conducteurs ni les
changements d'accueil déjà présents.

**Solution appliquée.** Canal Android dédié utilisant la sonnerie du téléphone
et ses attributs audio, avec vibration, compatibilité v2 et respect des choix
utilisateur. Fichier iOS/secours renforcé sans saturation, toujours 29 secondes.
Capacité backend v3 et livraison bornée des commandes programmées, sans migration
de base. Accès aux vrais réglages système depuis « Sonnerie et vibrations ».
Pas d'appel simulé, de volume forcé ni de contournement du mode silencieux.

**Vérifications et limites.** 67 tests mobile et 74 tests backend réussis ; classes
Java compilées isolément ; typage backend de production réussi. Le typage global
backend incluant tous les tests reste en échec hors des fichiers concernés.
Typage mobile réussi, lint ciblé sans erreur (quatre avertissements préexistants).
Gain numérique moyen du fichier : +5,88 dB, pas une mesure acoustique sur appareil.
Nouveaux binaires et déploiement backend encore nécessaires ; aucune action sur
la production et aucune validation sonore sur téléphone physique effectuées.

Fichiers, protections, vérifications détaillées, limites natives et ordre de
déploiement : [Sonnerie conducteur](SONNERIE_CONDUCTEUR.md).

## 2026-10-17 — Diffusion à 5 km, position hors course à 3 minutes et rappel à 6 heures

**Problème et périmètre.** L'utilisateur souhaite informer tous les conducteurs
admissibles proches, renouveler leur position même en veille et les prévenir
après six heures sans position, sans ralentir le suivi d'une course en cours.

**Solution appliquée.** Diffusion backend par lots dans un rayon fixe de 5 km,
première acceptation gagnante, cadence mobile hors course de 180 secondes et
cron de rappel toutes les 5 minutes, une fois par épisode. Migration ajoutée
mais non appliquée à une base applicative. Permissions, désactivation volontaire,
isolation des comptes et cadence GPS pendant une course conservées.

**Vérifications et limites.** 81 tests mobile et 115 tests backend réussis, dont
des tests sur une vraie base PostgreSQL/PostGIS temporaire pour la concurrence,
les distances, les rappels et la migration réversible. Typage mobile et backend
de production réussi. Pas d'essai physique en veille, de mesure batterie ou de
livraison réelle des push. Aucun déploiement, aucune modification AWS ou .env.

Fichiers, déploiement, limites système et recette :
[Alertes proches et localisation](ALERTES_PROXIMITE_LOCALISATION.md).

## 2026-10-17 — Priorités superposées sans déplacement de l'accueil

**Problème constaté.** La présence d'une priorité dans useHomeSheet réduisait
explicitement la hauteur du panneau et agrandissait la carte. Le panneau était
donc poussé vers le bas. Les marges de caméra changeaient aussi, alors que la
demande est une simple superposition sur la carte existante.

**Solution appliquée.** hooks/home/useHomeSheet.ts calcule maintenant la même
hauteur de panneau, le même emplacement de carte et les mêmes marges caméra
avec ou sans priorité. La fonction de marges conditionnelles est retirée de
features/home/homeMapAppearance.ts. Le contrôle de recentrage reste à sa place.
components/home/HomeMapPriorities.tsx conserve une seule carte montée et un
défilement borné qui inclut désormais la pagination : sur une petite zone, ses
flèches restent accessibles en défilant. Lorsque l'espace vertical est court,
le bloc se place à côté du recentrage, sans redimensionner le panneau.
components/home/HomeMap.tsx et app/(tabs)/index.tsx masquent uniquement le libellé
redondant de position dans ce cas, pour éviter un chevauchement ; le point GPS
réel, sa coordonnée et son info-bulle sont conservés.

**Comportements conservés.** Style existant et barre d'onglets, sélection et
ordre métier des priorités, accès aux détails, geste de masquage, pagination,
repli volontaire et repli pendant un trajet. Carte native au même emplacement
dans l'arbre React, sans nouvelle animation, requête ou dépendance. La compétence
frontend-skill a guidé cette retouche limitée à la composition et à la lisibilité,
sans ajout de décor ou de nouvelle fenêtre.

**Vérifications.** 166 tests d'accueil réussis ; les 5 tests de position ont été
rejoués avec succès après ajout du cas de libellé masqué. Typage TypeScript et
lint ciblé sans erreur ; git diff --check réussi. Tests adaptés dans
tests/homeMapPriorities.test.js et tests/homeUserPositionDisplay.test.js :
dimensions identiques avec/sans priorité, iOS/Android simulés, trois hauteurs
portrait, pagination accessible, point GPS conservé. Les tests existants
couvrent le repli, les callbacks de mesure obsolètes et la carte non remontée.

**Observation native et limites.** Accueil ouvert et capture consultée sur
l'émulateur Android déjà démarré : carte, point personnel et panneau visibles.
Ce compte n'avait aucune priorité ; aucune commande ou réservation artificielle
n'a été créée pour le test. Le cas réel avec plusieurs priorités, les grands
caractères, le paysage et iOS restent à vérifier sur appareil. Cette observation
ne prouve ni une résolution de crash ni un gain de performance. Aucun build,
déploiement, changement de données métier ou modification de .env pour la retouche.

## 2026-10-17 — Attendre le rôle avant d'afficher l'accueil

**Problème constaté et périmètre.** Avant la réponse du profil, l'accueil évaluait
`isDriverAccount(undefined)` à `false` et montait donc provisoirement les actions
passager et leur panneau. Le profil conducteur provoquait ensuite un changement
d'interface visible. Correction limitée à l'accueil mobile et à ses tests.

**Solution appliquée.**

- `hooks/home/useHomeContext.ts` expose l'état de résolution du profil existant,
  son erreur et sa relance. Le profil doit appartenir au compte de la session.
  `features/home/homeRolePolicy.ts` exige un identifiant et un rôle reconnu
  (`passenger`, `driver` ou l'ancien alias `both`) avant de révéler l'accueil.
- `app/(tabs)/index.tsx` affiche `components/home/HomeRoleLoader.tsx` pendant
  cette attente : fond clair, accent orange, signature Zwanga, indicateur natif
  et texte neutre « Préparation de votre accueil ». Aucun délai artificiel.
  Échec sans profil exploitable : message dans la page et bouton « Réessayer »,
  sans modal. La relance est inactive hors écran, en arrière-plan ou pendant
  une lecture déjà en cours ; ses exceptions sont absorbées par le gestionnaire.
- Le contenu précédent est déplacé sans modification visuelle dans
  `components/home/HomeDashboard.tsx`. `hooks/home/useHomeController.ts` reçoit
  désormais le contexte déjà résolu. Ses hooks de carte, GPS et données métier
  ne sont montés qu'avec le bon profil, plutôt que derrière un simple cache visuel.
- Le loader utilise uniquement un indicateur natif, suspendu quand l'écran est
  inactif, et un contenu défilable pour les petits écrans/grands caractères.
  Statut accessible, annonce polie et cible de relance d'au moins 48 points.
  La compétence `frontend-skill` a guidé une présentation neutre et sobre,
  sans nouvelle dépendance ni boucle d'animation JavaScript.

**Comportements conservés et protections.** Un profil valide déjà en cache pour
le même compte ouvre directement l'accueil, même pendant une actualisation ou
une erreur réseau ultérieure : le dashboard et sa carte ne sont pas remontés.
Un profil provenant d'un autre compte n'est pas affiché. Pas de seconde requête
de profil, de polling ou de changement de l'authentification. Carte, superposition
des priorités, proportions du panneau, barre d'onglets et suivi en cours conservés.

**Vérifications réalisées.** 177 tests d'accueil JavaScript réussis, dont 11
nouveaux dans `tests/homeRoleLoader.test.js` : chaque rôle, chargement initial,
cache, erreur, relance, changement de compte et accessibilité du loader.
Ces 11 tests ont été rejoués après l'ajout du regroupement accessible du statut.
`tests/homeForegroundLifecycle.test.js` et `tests/homeTripPriority.test.js`
adaptés à l'extraction du dashboard, avec leurs assertions de carte et de cycle
de vie conservées. Corps visuel du dashboard comparé exactement à l'ancien
écran dans l'index Git : identique. Typage TypeScript, lint ciblé et
`git diff --check` réussis.

**Limites.** Aucun essai de ce loader sur appareil physique iOS/Android,
aucun nouveau build et aucun déploiement. Le rendu réel avec lecteur d'écran,
les grands caractères et une première connexion lente restent à vérifier.
Les tests utilisent des I/O natives simulées : aucune disparition de crash ni
réduction mémoire, batterie ou chauffe n'est mesurée. Aucun changement backend,
de données métier, d'infrastructure ou de configuration d'environnement.

## 2026-10-17 — Loader d'accueil illustré : covoiturage et VTC

**Problème et périmètre.** Le premier loader de détermination du rôle était jugé
trop générique. Retouche visuelle du loader uniquement ; la résolution du profil
et les écrans conducteur/passager ne sont pas modifiés par cette itération.

**Solution effectivement appliquée.** `components/home/HomeRoleLoader.tsx`
remplace l'icône encadrée et le spinner par une composition centrée sur Zwanga,
une illustration de trajet et une seule ligne de statut. Le nouveau composant
`components/home/HomeRideLoaderVisual.tsx` dessine une carte stylisée, deux
silhouettes au départ, une voiture bleu nuit et un repère d'arrivée orange.
Illustration SVG avec la dépendance déjà présente : aucun téléchargement d'image,
aucun SDK cartographique, aucune lecture GPS et aucune nouvelle dépendance.
La compétence `frontend-skill` a guidé une composition aérée, un seul visuel
dominant, moins de texte et une animation liée au déplacement.

`features/home/homeLoaderJourney.ts` précalcule 49 positions et orientations sur
la courbe affichée. `hooks/home/useHomeLoaderMotion.ts` utilise une seule boucle
Animated de 3,6 secondes avec `useNativeDriver: true` et `isInteraction: false` :
la voiture suit cette courbe et un halo accompagne l'arrivée. Aucune mise à jour
React par image, aucun timer JavaScript ou écouteur par image. Arrêt de la boucle
à la perte de focus, en arrière-plan, en erreur et au démontage. Une préférence
de réduction des mouvements activée, inconnue ou indisponible conserve un dessin
fixe. Les événements tardifs de préférence ne réactivent pas un loader démonté
et une lecture ancienne ne remplace pas une préférence reçue plus récemment.

**Comportements conservés.** Attente du rôle avant l'accueil, accès immédiat
avec profil en cache, aucun délai minimal ajouté, isolation des comptes et
relance en cas d'erreur. L'illustration ne représente pas un conducteur réellement
attribué et n'annonce aucune position/commande fictive. Décor ignoré des lecteurs
d'écran, statut annoncé séparément, bouton Réessayer conservé. Carte réelle,
panneau d'accueil, barre d'onglets, authentification et backend inchangés.

**Vérifications.** 184 tests d'accueil réussis, dont les 18 tests ciblés du rôle
et de l'illustration. `tests/homeLoaderJourney.test.js` couvre la trajectoire,
la réutilisation des valeurs, 20 cycles actif/inactif, l'arrêt des boucles et
les préférences d'accessibilité ; `tests/homeRoleLoader.test.js` conserve les
tests de rôle et vérifie l'état actif/statique du nouveau visuel. TypeScript,
lint ciblé et `git diff --check` réussis. Le script
`scripts/preview-home-role-loader.cjs` produit des aperçus des composants réels
via React Native Web sous `.expo/home-role-loader-preview`, sans donnée utilisateur.
Captures statiques consultées : chargement en 390 × 760 et 320 × 568, erreur
avec relance en 390 × 760 ; aucun débordement constaté sur ces aperçus.

**Limites.** Les aperçus Web échantillonnent l'animation à mi-parcours ; ils ne
valident pas son rendu animé natif. Fluidité réelle, grands caractères et
VoiceOver/TalkBack restent à tester sur iOS/Android. Aucune mesure de mémoire,
de batterie ou de stabilité native, aucun build ni déploiement pour cette retouche.

## 2026-10-17 — Chargement commun profil/trajet et navigation simplifiée

**Problème.** L'accueil pouvait apparaître avant la reprise d'un trajet en cours ;
le chargement du rôle et la décision de reprise étaient séparés. Certaines
actions du trajet étaient longues à lire ou nécessitaient de retrouver le bon
passager dans une liste.

**Solution appliquée.** Un seul loader attend le choix de l'écran : navigation
selon la participation vérifiée au trajet, sinon accueil avec le rôle du compte.
Le premier dashboard et sa carte ne montent pas avant cette décision. Ajout
d'une récupération après huit secondes, sans nouveau polling. Actions courtes,
confirmation directe du passager du prochain arrêt, commandes cartographiques
libellées et correction du texte compact « Partager ». La compétence
`frontend-skill` a guidé la hiérarchie et la réduction des textes.

Les fichiers, règles préservées, contrôles, limites et recette native sont
détaillés dans [Entrée unifiée et navigation](ENTREE_UNIFIEE_ET_NAVIGATION.md).
355 tests JavaScript de la sélection élargie réussis, puis 60 tests ciblés
rejoués après le dernier garde d'entrée. Aperçus Web statiques consultés à
390 × 760 et 320 × 568. TypeScript (`tsc --noEmit --incremental false`),
lint ciblé et `git diff --check` réussis. Aucun changement backend, build ou déploiement ;
validation physique iOS/Android encore nécessaire.

## 2026-10-17 — Réservations conducteur sans écrans intermédiaires

**Problème.** La notification ouvrait un écran « Nouvelle réservation », puis
un second état « C’est confirmé ! » obligeait à rouvrir les détails. Le refus
dans la gestion imposait aussi un formulaire de motif.

**Solution appliquée.** Réponse directe depuis les cartes de passagers et les
actions natives de notification. Une simple réception ne change plus l'écran.
L'ouverture cible les passagers du trajet ou la navigation en cours ; la
réservation visée est prioritaire. Retour de succès discret, refus sans
formulaire obligatoire, contrôles de session et verrou anti-double appui.
La compétence `frontend-skill` a guidé cette réduction des interfaces.

Fichiers concernés, comportements préservés et recette détaillés dans
[Réservations : réponse directe](RESERVATIONS_REPONSE_DIRECTE.md).
183 tests JavaScript ciblés réussis ; TypeScript et `git diff --check` réussis.
Lint sans erreur, avec douze avertissements préexistants. Aperçus Web statiques
contrôlés à 390 et 320 px ; notifications et interactions natives encore à
valider sur appareils. Aucun changement backend, build ou déploiement.

## 2026-10-17 — Nouvel accueil avant connexion, selon la maquette fournie

**Problème et périmètre.** L'écran public précédant la connexion et l'inscription
ne reprenait pas la nouvelle composition souhaitée. Cette modification concerne
uniquement la présentation de `/auth-entry`, pas l'accueil connecté ni les
formulaires d'authentification.

**Solution appliquée et fichiers.**

- `features/auth/AuthWelcome.tsx` reprend le titre, la phrase de présentation,
  les quatre avantages, le bouton orange « Créer un compte », le bouton bordé
  « Déjà inscrit ? Se connecter » et la mise en évidence des mentions légales.
  Un défilement unique permet d'atteindre les actions sur écran court et avec
  de grands caractères, sans étape d'introduction supplémentaire.
- `features/auth/AuthWelcomeHero.tsx` compose le bandeau pêche, les rues, un
  exemple de trajet et sa bulle de message avec des vues, un petit SVG et le
  logo local existant. C'est une illustration non interactive, pas une offre
  réelle. Les lecteurs d'écran reçoivent une seule description de cette image ;
  ses textes décoratifs ne constituent pas des données de réservation.
- `features/auth/authWelcomeStyles.ts` isole la palette de cet écran et conserve
  les styles du reste de l'application. L'orange du bouton est légèrement
  assombri pour un contraste calculé blanc/orange de **4,56:1**. Les avantages
  passent sur une colonne sous 350 points ou au-delà de 120 % de taille de texte.
  Les textes fonctionnels conservent leur agrandissement système ; seule
  l'illustration est dimensionnée comme une image.
- La compétence `frontend-skill` a guidé la hiérarchie visuelle fidèle à la
  référence, les espacements, le bandeau pleine largeur et des retours limités
  aux appuis et à l'attente des boutons. Aucun mouvement décoratif ajouté.

**Comportements conservés et précautions.** Connexion et inscription ouvrent
toujours `/auth` avec leur mode explicite. Le verrou synchrone contre les
doubles appuis, les états d'attente, le réarmement au retour et les erreurs
françaises sont conservés. La session restaurée et la reprise d'un formulaire
en cours continuent de passer avant l'introduction. Le lien légal garde sa
destination préexistante ; la disponibilité et le contenu distant de cette
page n'ont pas été audités dans cette intervention.

La phrase de la maquette limitant le partage de position aux seuls trajets
n'est pas reprise : les conducteurs disponibles peuvent aussi actualiser
leur position hors trajet. Une ligne « Vous gardez le contrôle de votre
localisation » déplie cette explication directement dans la page, avec le refus
d'autorisation et la désactivation du suivi en veille. Aucune autorisation GPS
n'est demandée par cet écran ; les explications et demandes contextuelles
existantes restent inchangées. Aucun SDK cartographique, lecture GPS, appel API,
timer ou dépendance ajouté. Pas de modification du backend ou de configuration.

**Vérifications réalisées.**

- **102 tests JavaScript réussis** : bienvenue, navigation/authentification,
  brouillon de formulaire, restauration et renouvellement de session, retour,
  clavier et chargement des formulaires. `tests/authWelcome.test.js` couvre
  notamment les doubles appuis, les erreurs, le dépliage de l'information GPS,
  les dimensions de l'illustration, la disponibilité des actions et le contraste.
- TypeScript sans émission, lint ciblé et `git diff --check` réussis. Contrôles
  des frontières réseau et de taille des sources réussis ; aucun fichier source
  de plus de 400 lignes parmi les 1 088 contrôlés.
- `scripts/preview-auth-welcome.cjs` rend les composants réels via React Native
  Web avec le logo et les glyphes existants, sans session ni donnée utilisateur.
  Six formats mesurés : référence 390 × 844 sans marges système, téléphone
  390 × 844 avec marges 47/34, 320 × 568, texte 160 % simulé, paysage 844 × 390
  et tablette 768 × 1024. Aucun débordement horizontal ; connexion, inscription
  et lien légal accessibles en fin de défilement dans les six cas, cibles d'au
  moins 44 pixels. Les actions sont visibles initialement au format standard
  et sur tablette ; le petit écran, le paysage et les grands caractères
  nécessitent un défilement. Captures standard/petit écran/grands caractères
  inspectées sous `.expo/auth-welcome-preview/` (sorties locales ignorées).

**Limites.** Aperçus Web et tests JavaScript, pas d'essai physique Android/iOS.
Le rendu natif, VoiceOver/TalkBack, les zones sûres et l'ouverture du lien légal
restent à vérifier sur appareil. Aucune mesure de mémoire, de chauffe ou de
crash réalisée ; aucun build ni déploiement effectué. Les changements antérieurs
présents dans l'arbre de travail sont conservés.
