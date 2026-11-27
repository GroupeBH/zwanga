# Correctifs et recette de l’audit — 27 novembre 2026

Ce document complète [l’audit initial](audit-plateforme-2026-11-27.md). Il ne remplace pas ses résultats historiques. Les modifications restent locales ; aucun déploiement ni paiement réel.

## Correctifs appliqués

| Point | Solution et fichiers principaux | Garanties conservées |
| --- | --- | --- |
| A1 — Contrôle de livraison | Extraction du sélecteur de lieu de modification dans `features/trip-detail/TripEditLocationPicker.tsx`, utilisé par `app/trip/[id].tsx`. Réparation des fixtures et des assertions devenues obsolètes. | Aucun changement des coordonnées, références, règles de réservation ou API de modification. Les empreintes de styles/contrats ont été réalignées sur les fonctionnalités déjà présentes ; elles ne constituent pas une preuve visuelle native. |
| A2 — Devis | `app/services/[id].tsx` : verrou synchrone, refus des actions si lecture périmée/en erreur/inactive, consentement renouvelé à chaque version, réponses anciennes ignorées et erreur de mutation visible même pendant le rendu de chargement. | L’idempotence et la validation serveur ne sont pas remplacées par le verrou d’interface. Un échec permet de réessayer. |
| A3 — Profil membre | `components/ProtectedAppStack.tsx` : route `public-profile/[id]` dans le groupe authentifié. | Pas de changement de l’API publique du site ni du QR conducteur. |
| A4 — Activité conducteur | Backend : `compact-driver-activity.ts` et `trips.controller.ts`. Mobile : `activityTripMapper.ts`, `getTrips.endpoints.ts`. Vue optionnelle `scope=activity&view=compact`, profils conducteurs mutualisés. | Réponse historique toujours disponible ; nouveau mobile compatible avec l’ancien tableau serveur ; réservations, paiements, avis et états conservés. Optimisation partielle : pas de réduction démontrée des requêtes SQL ni d’hydratation des réservations. |
| A5 — GPS | `services/background/locationSendGate.ts`, tâches GPS conducteur et passager : temporisation et verrou liés à la session ; une réponse d’un ancien trajet ne libère ni ne pénalise le suivant. | Délais anti-boucle, reprise d’authentification et règles d’arrêt conservés. Aucun gain de batterie ni fonctionnement en veille certifié par ces tests JavaScript. |
| A6 — Cache services | Tags `ProServices` qualifiés `DOCUMENTS`, `CREDITS`, `FLEET` dans les cinq API concernées. | Le remboursement invalide encore le portefeuille ; les requêtes du domaine concerné se rechargent. Pas encore une granularité par dossier individuel. |
| A7 — Contrôles CI | `scripts/check-integration.cjs` inclut réservation, crédit, catalogue et authentification isolée. Workflows backend : variables PostgreSQL des suites supplémentaires activées et exigées par `test/ci-integration-policy.test.cjs`. | Aucun déclenchement de workflow ni déploiement. Les erreurs/sorties interrompues ne sont pas traitées comme un succès. |
| A8 — Fixtures | Harnais React admin avec effets et nettoyage ; formulaire catalogue actuel `ProductEditor` utilisé en recette ; méthodes d’abonnement unitaire et groupée simulées ; schémas TypeORM typés ; preuve de paiement synthétique complète. `dispatch-handoff.spec.ts` vérifie maintenant le refus atomique avec exclusion du conducteur et retrait des invitations, avant allocation suivante. `installation-update-delivery.spec.ts` attend le paramètre de reprise `queued=true`. | Les règles métier ne sont pas relâchées pour faire passer les tests. La décomposition des grands services backend reste un chantier distinct. |
| Défaut découvert sur émulateur | `utils/errors/errorPresentation.ts` : le mot français « date » dans une alerte de retard ne suffit plus à la transformer en erreur de validation. Terminologie d’arrivée harmonisée côté passager dans `passengerRideProgress.ts` et `ride-recovery`. | Traduction des véritables erreurs techniques de date conservée ; confirmations et transitions serveur inchangées. |
| Démarrage des fixtures SQL | `pin-reset-welcome-bonus-postgres.spec.ts` et `welcome-bonus-200-postgres.spec.ts` : initialisation jetable avec `--no-sync`, comme le harnais commun `test/isolated-postgres.ts`, délai `initdb` borné à 60 s et préparation globale à 120 s. | Seulement la synchronisation initiale des fichiers synthétiques est évitée ; `fsync` reste actif pendant les tests. Aucun changement des options ou délais des bases applicatives. Nettoyage conservé, limité au dossier temporaire préfixé de chaque suite. |

## Vérifications et preuves

Un test de callback React ne remplace pas un toucher sur appareil. Les résultats ci-dessous séparent les passes complètes, les reprises ciblées et les suites volontairement exclues.

| Contrôle exécuté | Résultat connu |
| --- | --- |
| TypeScript backend, tests inclus | Réussi après corrections |
| Précontrôles mobiles | TypeScript, ESLint sans erreur, limites de taille, frontières réseau, compatibilité Metro/URI et cohérence des sources natives réussis ; aucune compilation native |
| Première passe mobile complète | 4 439 réussis, deux échecs, un ignoré sur 4 442 tests ; voir les reprises ci-dessous |
| Mobile après corrections, exécution en deux parties | 4 441 réussis, zéro échec, un ignoré sur 4 442 tests après déduplication ; précontrôles réussis ; détail de la reprise ci-dessous, pas une exécution monolithique achevée |
| Backend Jest général, en transpilation seule | 4 638 réussis, deux assertions en échec, 1 370 ignorés sur 6 010 tests ; 392 suites réussies, deux en échec, 63 ignorées |
| Reprise backend des deux suites corrigées et du format compact | 15/15 réussis dans trois suites, avec vérification TypeScript activée |
| SQL ciblé : arrivée/paiement, autorisations et récupération financière | 41/41 réussis dans quatre suites ; base PostgreSQL jetable et preuves synthétiques |
| SQL ciblé : réinitialisation et bonus de bienvenue | 29/29 réussis dans deux suites après correction de leur initialisation ; aucun crédit sur la base habituelle |
| Garde-fous des workflows backend | 2/2 tests de politique CI réussis, sans exécuter les workflows |
| Admin : tests JavaScript | 246/246 réussis |
| Portail partenaire | 98/98 réussis dans 15 fichiers |
| Site public | 7/7 réussis |
| Contrôle complet d’intégration locale | 33/33 : réservation 10, crédit 8, catalogue 9, authentification 6 ; HTTP/PostgreSQL/Redis temporaires, fournisseurs simulés ; sortie 0 |
| Relais de demandes : refus et expiration | 2/2 scénarios ciblés réussis ; 127 autres scénarios exclus par filtre, non comptés comme réussis |
| Régressions ciblées après les deux échecs mobiles | 31/31 réussies : devis, GPS, cache, activité compacte, libellés et transport natif simulé JVM ; reprise complémentaire 22/22 avec recouvrement, nombres non additionnés |
| Lectures sur le backend habituel relancé | 27/27 HTTP 200, neuf routes lues trois fois |

Les deux échecs de la première passe mobile étaient : une assertion attendant encore le mot « dépose » au lieu d’« arrivée » et un test de transport Java dépendant du démarrage à froid de son serveur HTTP/JVM sous charge. Le premier a été réaligné sur le texte destiné au passager. Le second prépare désormais la connexion de sa fixture avant de mesurer le transport natif ; **le délai de production de 1 500 ms et les contrôles de validité ne sont pas augmentés**. Ce test utilise des adaptateurs Android/JSON simulés : ce n’est pas une preuve de réception sur téléphone.

La nouvelle passe mobile s’est interrompue après le test 1 935, sans bilan global. Les 292 fichiers restants ont été rejoués en repartant de `iosDeploymentTarget.test.js` : sortie 0, 2 512 réussites et un test ignoré sur 2 513, en 387 s. Les six tests de ce fichier étaient déjà présents à la fin du premier journal. Leur recouvrement a été comparé explicitement, puis dédupliqué : 1 935 + 2 513 − 6 = 4 442. La séquence correspond à la première passe complète, sauf le renommage volontaire d’une assertion du contrat d’activité compacte dans `tests/activityTrips.test.js`. Aucun échec dans les deux parties ; le test Ruby ignoré n’est compté qu’une fois. Cela valide les tests exécutés après corrections, sans transformer le premier processus interrompu en sortie réussie.

La suite Ruby de politique iOS est ignorée sur ce poste, faute de Ruby. Les 1 370 tests ignorés de la passe backend ne sont pas déclarés réussis : les suites SQL ont leurs propres options d’activation, et seules celles explicitement mentionnées ont été rejouées avec leur base temporaire. Une première tentative backend interrompue n’est pas comptée ; le JSON de la passe terminée fait foi. Le backend général n’a pas été entièrement rejoué après ses deux corrections de fixtures.

Avant correction du démarrage des fixtures, la reprise PIN/bonus comptait 13 réussites et 16 échecs consécutifs à `initdb ETIMEDOUT`, avant toute assertion métier de la seconde suite. L’erreur de processus empêchait également Jest de sérialiser son JSON (référence circulaire). Après correction, la reprise complète des deux fichiers a une sortie 0 et un bilan JSON de 29 réussites ; les anciens échecs ne sont pas effacés des journaux.

Preuves locales (artefacts non destinés à être publiés, à conserver sans données de comptes) :

- `.expo/isolated-e2e-2026-11-27-release.log` : première passe mobile ; `.expo/fix-audit-final-regressions.log` : reprise 31/31.
- `.expo/isolated-e2e-2026-11-27-release-final.log` : début de la nouvelle passe mobile interrompue ; `.expo/fix-audit-mobile-final-resume.log` et `.json` : reprise terminée, sortie 0, recouvrement de six tests.
- `.expo/platform-backend-runtime-2026-11-27.json` : bilan backend terminé ; `.expo/fix-audit-backend-regressions.json` : reprise 15/15. Le wrapper PowerShell de cette reprise signale les messages Jest sur stderr comme `NativeCommandError` ; le JSON Jest indique bien zéro échec.
- `.expo/isolated-e2e-2026-11-27-postgres-fixes-corrections.json` : 41 tests ciblés ; `.expo/isolated-e2e-2026-11-27-integration-corrections.log` : contrôle d’intégration 33/33.
- `.expo/isolated-e2e-2026-11-27-sequential-probe-corrections.json` : relais ciblé, deux scénarios seulement.
- `.expo/fix-audit-pin-welcome.log` : démarrage SQL en échec ; `.expo/fix-audit-pin-welcome-final.json` : reprise SQL 29/29.
- `.expo/platform-audit-2026-11-27-{admin,partner,web}.log` : contrôles des trois portails.

### Mesure locale du format compact

Même compte de test, même jeu de 88 trajets, trois lectures séquentielles de chaque format :

| Format | JSON décodé | Durées observées |
| --- | ---: | --- |
| Historique | 374 445 octets | 1 156 / 1 686 / 4 490 ms |
| Compact | 311 974 octets | 343 / 981 / 845 ms |

Réduction déterministe de volume sur ce jeu : **62 471 octets, environ 16,7 %**. Les durées sont influencées par le cache et les autres processus du poste : elles ne prouvent pas un gain de latence en production. Rapport technique sans corps de réponse ni identifiants : `.expo/platform-readonly-corrections-2026-11-27.json`.

### Parcours Android

Sur l’émulateur avec le JavaScript courant : bouton Réessayer de l’accueil après retour du backend ; alerte de prise en charge en retard (texte corrigé observé), Attendre ; onglet Services ; Acheter à crédit ; historique Mes achats et paiements ; Mes crédits précédents / Mes remboursements ; retours. Recherche : liste de sept départs, ordre « Prochains départs », champ de départ. Publication : première étape, destination manuelle, action suivante désactivée sans arrivée ; retour sans publication.

Mes trajets : bascules Publiés/Historique/Réservations, accès Mes revenus sans retrait ; ouverture d’une réservation en attente, statut explicite et carte routière visibles, ouverture/recentrage/fermeture de l’itinéraire. Notifications : Activité, Assistance et Messages ; ouverture de l’aide et d’une conversation synthétique, sans appel, email ni message envoyé. Profil : ouverture, paramètres, édition sans enregistrement, sécurité sans appel d’urgence.

Flottes : ouverture depuis Services, état sans affectation, accès au répertoire Rejoindre une flotte ; Postuler ouvre le champ de message et l’envoi reste désactivé sans texte. Aucune candidature ni espace propriétaire créé. Documents : ouverture de Nouvelle demande ; Continuer sans sélection affiche « Choisissez au moins un document » ; sélectionner un document permet d’atteindre Coordonnées ; un nom vide bloque la progression avec une erreur explicite. Aucune demande envoyée.

Depuis Recherche, ouverture d’un autre trajet puis du formulaire Réserver : Mobile Money, Jetons et Cash visibles ; repère de départ obligatoire et repère d’arrivée facultatif selon les lieux affichés. Ouverture du sélecteur de récupération : tracé routier détaillé visible (avec virages, pas une simple liaison droite), sélection cartographique et géocodage en cours visibles. La conservation finale du lieu à la fermeture n’a pas été observée ; aucune réservation soumise et aucune validation serveur des 100 m attestée par cet essai tactile.

La fiche QR retourne « Fiche conducteur indisponible » pour le compte dont le KYC est en attente. Le backend réserve cette fiche aux conducteurs actifs : restriction conservée, partage QR non validé pour un conducteur éligible. L’émulateur utilise encore le binaire Android 1.0.18 (176) avec le JavaScript courant ; aucun nouveau binaire de livraison n’a été construit.

Le catalogue habituel et les crédits du compte sont vides : les boutons d’achat et de remboursement ne peuvent pas être certifiés avec ce compte. Le catalogue, ses choix et ses mutations sont testés séparément avec données synthétiques sur le backend temporaire. Aucun règlement n’a été lancé sur le backend habituel.

## Couverture et limites

Inventaire : **68 fichiers d’écrans/routage et 516 fichiers de tests mobiles**. La [matrice de recette Android](recette-ecrans-2026-11-27.csv) compte 20 fichiers testés partiellement, un bloqué et 47 non exécutés dans l’émulateur pendant cette recette. Ces nombres ne constituent pas un pourcentage de couverture de chaque bouton. Les tests couvrent des fonctions, contrôleurs et composants, avec une recette native partielle.

- Reste à valider sur appareils physiques Android et iOS : permissions, GPS/voix en veille, notifications réelles, retour d’appel, rendu et fluidité des cartes, grandes polices et longues sessions.
- Pas de paiement réel, de test de capacité de production, de compilation native de livraison ni de déploiement.
- Le poste est contraint en mémoire pendant les suites ; une durée de test locale n’est pas une mesure de performance de la plateforme.
- A4 est partiellement traité (volume réseau), A8 reste partiellement traité (fixtures et petite extraction, pas refonte des services).
- Ne pas annoncer « tous les écrans et tous les boutons validés » tant que la matrice native complète n’a pas été exécutée avec les états et données nécessaires.
