# Audit avant déploiement — 29 octobre 2026

> Mise à jour après l'audit : le conflit P2 décrit ci-dessous a été corrigé et testé à la demande de l'utilisateur. Voir [le correctif de modification d'horaires](CORRECTIF_MODIFICATION_HORAIRES_2026-10-29.md). Le constat historique et les résultats de cet audit restent conservés ; les réserves de livraison native ne sont pas levées par ce correctif serveur.

## Décision

**Pas de feu vert sans réserve pour une publication générale.** Les campagnes automatiques ci-dessous passent, mais un défaut métier reste reproduit : modifier l'heure d'un trajet peut contourner la nouvelle protection contre les courses incompatibles. Les archives natives de production et la livraison réelle des alertes sur téléphones restent également à valider.

Audit des sources mobiles courantes et du backend voisin, avec leurs modifications locales préexistantes. Aucun correctif applicatif, déploiement, accès AWS, envoi réel de SMS/push ou paiement opérateur effectué pendant cet audit. Les seuls ajouts sont ce rapport, son entrée dans le journal et des diagnostics ignorés sous `.expo/`.

## Anomalie confirmée — P2 : modification d'horaire sans recontrôle du planning

- **Fichiers :** `../zwanga-backend/src/trips/trips.controller.ts:250`, `src/trips/trips.service.ts:1095` et `:1226`. Par comparaison, `src/trips/trip-publication-photo.ts:63` applique le contrôle à la publication.
- **Scénario :** un conducteur possède un trajet publié et une commande acceptée à un autre horaire. Il déplace ensuite le départ du trajet publié à l'heure de cette commande. `TripsService.update()` change `departureDate` puis enregistre directement le trajet, sans relire les autres engagements et sans prendre le verrou conducteur utilisé par les nouvelles publications/acceptations.
- **Impact :** deux engagements incompatibles peuvent subsister pour le même conducteur malgré la nouvelle politique de disponibilité. Le même chemin doit être examiné pour les trajets issus d'une demande, dont le prix est protégé mais pas ce changement d'horaire.
- **Reproduction exécutée :** `.expo/audit-predeploy-trip-update.cjs` extrait la véritable méthode `update()` par l'AST TypeScript et l'exécute avec dépôts en mémoire et collaborateurs hors périmètre simulés. Résultat : nouvel horaire sauvegardé, **1 écriture et 0 lecture de disponibilité**, alors que le faux gestionnaire est configuré pour signaler un conflit. Le contrôleur délègue à cette méthode sans contrôle additionnel. Ce diagnostic n'est pas un parcours HTTP/PostgreSQL et ne mesure pas une collision en production.
- **Correction proposée, non appliquée :** revalider l'horaire sous le même verrou conducteur que publication/acceptation, dans une transaction courte, en excluant le trajet modifié lui-même. Garder les appels réseau après la transaction. Ajouter des tests PostgreSQL de déplacement vers une commande existante et de modification concurrente à une acceptation, ainsi que des cas compatibles.

## Résultats exécutés pendant cet audit

| Campagne | Résultat mesuré | Portée et limites |
| --- | --- | --- |
| Mobile : `scripts/check-release.cjs` | Réussi ; **3 006 tests réussis, 0 échec, 1 ignoré** | TypeScript, ESLint, frontière réseau, compatibilité des correctifs de dépendances, parité des sources natives et régressions JS. Ruby absent : test de politique CocoaPods ignoré. |
| Taille des sources mobiles | **1 243 sources**, aucune au-dessus de 400 lignes | Maintenabilité, pas une mesure de fluidité ou de mémoire. |
| Backend : TypeScript de production | Réussi avec `tsc --noEmit --incremental false -p tsconfig.build.json` | Pas de création ni de déploiement d'image serveur. |
| Backend : suite générale hors fichiers PostgreSQL/Redis | **251 suites, 3 066 tests réussis**, 1 test ignoré | Services et contrats testés avec collaborateurs simulés. Le test de migration ignoré a ensuite été exécuté séparément avec succès. |
| Distribution des demandes : PostgreSQL/PostGIS + Redis jetables | **159 réussis, 0 échec, 1 ignoré** dans deux suites | `sequential-dispatch.postgres.spec.ts` et `dispatch-postgres.spec.ts`. Le benchmark de charge optionnel n'a pas été activé. |
| Cohérence financière : PostgreSQL jetable | **17 réussis, 0 échec** | `booking-financial-consistency-postgres.spec.ts` : initiation concurrente, succès/échec désordonnés, ancienne référence, fin de trajet concurrente, débit et rollback. Fournisseur de paiement simulé. |
| OTP : Redis jetable | **9 réussis, 0 échec** | Usage unique, concurrence, limites d'essais, activation après confirmation et refus d'envoi. Aucun SMS envoyé. |
| Migration paiement PawaPay : PostgreSQL jetable | **1 réussi, 0 échec** | `pawapay-provider-migration.spec.ts`, exécuté séparément après son omission dans la suite générale. Ce n'est pas une migration de la base de production. |
| Banc natif Android isolé : compilation | Réussie hors ligne | Sources Java courantes et son copiés par Gradle dans `com.zwanga.audit`. Graphe de dépendances et adaptateurs du banc, pas APK de production Zwanga. |
| Publication native Android sur émulateur | **17 scénarios réussis lors de la relance** | Carte, prix, actions, duplication, expiration, auto-notification exclue, reprise WorkManager, réveil, plein écran autorisé/refusé et téléphone déjà actif. |
| Audio natif Android sur émulateur | **10 scénarios réussis** | Publication tardive, carte après 8 secondes, autre notification sonore, focus audio temporaire/duck/permanent, veille/déverrouillage, relais avant-plan, décision et échéance. |
| `git diff --check` mobile | Réussi | Avertissements de normalisation CRLF/LF uniquement. Aucun fichier préexistant annulé. |

Ces nombres couvrent des assertions et suites partiellement recoupées, pas autant de parcours utilisateurs distincts.

### Intégration mobile/backend réellement testée

Les deux scénarios optionnels de `test/sequential-mobile-flow.ts` ont été activés avec le dépôt mobile local. Ils exécutent création HTTP, contrôleurs/services backend, publication vers un serveur FCM **factice local**, code d'action mobile réel, refus ou absence de réponse, puis relais. PostgreSQL et Redis sont réels mais jetables. Les gardes d'authentification et les comptes sont de test ; l'accusé de présentation est synthétique dans cette campagne. Les scénarios natifs sont exécutés séparément.

Ce résultat ne doit pas être présenté comme un parcours complet Play Store/TestFlight → FCM/APNs → interface React Native → fournisseur de paiement réel.

### Incident du premier essai Android

Le premier lancement après installation du banc a dépassé le délai ADB de 15 secondes lors de l'injection d'une alerte. Les journaux du seul package de test montrent une initialisation lente, puis une publication effectuée ; `dumpsys activity lastanr` n'indiquait aucun ANR depuis le démarrage. La relance du banc déjà initialisé passe les 17 scénarios sans modifier les sources ni les assertions.

L'échec initial est conservé et ne devient pas une réussite rétroactive. Une surcharge locale ou le démarrage à froid est une hypothèse compatible avec ces traces, pas une cause prouvée. La latence d'une première réception sur téléphone réel reste à mesurer. Les tests audio ont ensuite réussi, y compris la vérification du bandeau après 8 secondes ; cela ne garantit pas sa persistance sur tous les appareils.

## Réserves de livraison native

### iOS : dépendances résolues non validées localement

`validate-ios-toolchain.cjs --config-only` passe pour la configuration Xcode 26. En revanche, `validate-ios-crashlytics.cjs` échoue sur les fichiers locaux : les Pods Crashlytics attendus sont absents du lock et les entrées `SdkReactNative` / `DiditSDK/AutoDetection` ne correspondent pas à la version installée 4.9.1. Le lock local est ancien.

Un `pod install` sur macOS suivi des contrôles et d'une archive de production est nécessaire pour conclure. Le contrôle est prévu après CocoaPods dans EAS : **cet état local ne démontre pas que le prochain build EAS échouera**, ni que l'application plantera. Ne pas contourner le contrôle ni éditer manuellement les versions du lock pour le faire passer. La réception effective des symboles Crashlytics n'a pas été testée.

### Android : aucun artefact de production à contrôler

`validate-android-native.cjs --auto` ne trouve pas d'AAB/APK release local. Les contrôles des bibliothèques natives, ABI et alignement de l'artefact final restent donc non effectués. L'APK du banc Android, bien que compilé et testé, ne remplace pas cette validation.

### Essais physiques et intégrations externes encore nécessaires

- iPhone et Android physique, dont Samsung : application ouverte, autre application au premier plan et écran verrouillé ; mesurer émission, réception, affichage, son, ouverture et décision. Tester permissions accordées/refusées et premier lancement.
- Un vrai paiement de test jetons + complément Mobile Money : confirmation fournisseur, crédit du portefeuille, règlement du trajet et notification conducteur ; rejouer la vérification et un callback pour contrôler l'absence de double effet.
- Parcours KYC Didit, connexion Apple et inscription SMS avec la configuration de la release. Le nouveau fournisseur OTP reste soumis à une recette réelle avant activation.
- Démarrage à froid, retour du réseau, cartes et navigation prolongée sur appareils représentatifs. Aucun profilage FPS, mémoire, batterie ou chauffe n'a été réalisé ici.

Ces essais requièrent une build et des comptes/environnements de test adaptés. Aucun défaut fournisseur ni absence de crash physique n'est déduit des tests isolés.

## Performance : conclusions limitées aux preuves

- Les nouveaux repères de l'accueil réutilisent les listes déjà chargées et sont plafonnés à 10 ; ils n'ajoutent ni lecture GPS ni requête réseau.
- La réparation de l'inscription push est conditionnée au premier plan et à la connectivité, avec revalidation toutes les cinq minutes et regroupement des rotations en cours. Ce n'est pas une nouvelle inscription serveur chaque seconde.
- Les scénarios SQL/Redis vérifient concurrence, reprises et exclusions ; les 674,875 secondes de durée totale de cette campagne incluent préparation, données et injections de panne. **Ce n'est pas la latence d'une demande utilisateur.** Aucun chiffre de charge de production n'est annoncé.
- Les tests ne permettent pas de certifier l'absence de chauffe, de crash iOS/Fabric ou de restriction constructeur Android.

## Conditions proposées avant publication

1. Corriger le chemin de modification d'horaire et ajouter sa non-régression concurrente.
2. Produire et contrôler les véritables archives de livraison iOS/Android avec les scripts existants, sans assouplir les contrôles.
3. Effectuer la recette physique et les transactions de test décrites ci-dessus, notamment réception au démarrage à froid et complément Mobile Money.
4. Déployer toutes les répliques backend compatibles avec la nouvelle politique de verrouillage ; un ancien processus ne bénéficie pas automatiquement de cette protection. Prévoir surveillance et retour arrière. Rien n'a été déployé par cet audit.

## Traces locales et documentation

Sorties ignorées sous `.expo/` : `audit-predeploy-mobile-20261029.log`, `audit-predeploy-backend-unit-20261029.log`, `audit-predeploy-dispatch-20261029.log`, `audit-predeploy-financial-20261029.log`, `audit-predeploy-otp-20261029.log`, `audit-predeploy-payment-migrations-20261029.log`, `audit-predeploy-native-build-20261029.log`, `audit-predeploy-native-20261029.log` (premier échec), `audit-predeploy-native-retry-20261029/` et `audit-predeploy-audio-20261029/`.

Les diagnostics `.expo/run-predeploy-backend-20261029.cjs` et `.expo/audit-predeploy-trip-update.cjs` ne sont pas du code livré. Le premier utilise un environnement minimal sans lecture de `.env`. Les bases et Redis sont éphémères et les fournisseurs externes simulés. Le skill PostgreSQL a guidé le contrôle des transactions/verrous et l'usage de bases jetables. Aucun secret ni donnée de compte réel n'est inclus dans ce rapport.

Références : [audit global précédent](AUDIT_STABILITE_FIABILITE_2026-10-29.md), [correctifs des alertes et des horaires](CORRECTIFS_ALERTES_HORAIRES_2026-10-29.md), [journal technique](CHANGEMENTS_TECHNIQUES.md).
