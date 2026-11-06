# Correctifs de l’audit global — 6 novembre 2026

## Périmètre

Suite des constats A1 à A5 de [l’audit global](AUDIT_GLOBAL_20261106.md). Changements locaux mobile et `zwanga-backend`, sans déploiement, migration applicative, modification de production ou appel fournisseur réel. Les changements préexistants des deux dépôts sont conservés.

## A1 — Ciblage bloqué après désactivation du conducteur

Dans `zwanga-backend/src/users/account-lifecycle.service.ts`, la désactivation libère le conducteur ciblé **et** son échéance ensemble, puis réinitialise `dispatchCheckedAt`. L’opération reste dans la transaction existante, sous verrou de demande ; aucun appel réseau n’y est ajouté.

Seules les demandes `pending` / `offers_received`, sans conducteur sélectionné ni trajet lié, sont libérées. Les courses attribuées, annulées ou expirées ne sont pas rouvertes. Les filtres de refus, disponibilité, proximité et véhicule restent en place ; les invitations du compte désactivé sont retirées comme auparavant.

La visibilité pour les autres conducteurs revient après commit. Le relais conserve l’ordonnancement Redis/SQL existant : une échéance Redis déjà programmée peut retarder la prochaine invitation. Ce correctif ne promet pas de push immédiat et ne réécrit pas les anciennes lignes déjà affectées en production.

Six cas ajoutés dans `src/users/account-lifecycle-postgres.spec.ts` : libération des deux statuts ouverts, rollback complet, maintien de trois états non ouverts. Visibilité SQL réelle et idempotence vérifiées. Le lanceur mobile `scripts/audits/run-global-local-tests.cjs` ajoute le mode `account-lifecycle`, avec environnement minimal, base jetable et blocage des connexions externes.

## A2 — Tests mobile

- `tests/helpers/entryRecoveryHarness.cjs` isole la bannière native au niveau du harnais de reprise. Le composant réel reste testé dans `tests/driverBookingAlertBanner.test.js`.
- `tests/personalListCards.test.js` attend le libellé existant « total passager », en conservant les assertions sur le montant.
- `tests/tripDetailCompact.test.js` vérifie aussi le `sourceTripId` transmis au profil conducteur pour la demande directe.
- `tests/fixtures/sourceExtractions.json` actualise seulement les empreintes `createBooking` / `acceptBooking`, correspondant au prix proposé et au consentement conducteur. La recette RTK/HTTP/PostgreSQL teste ces comportements au-delà des empreintes.

Aucune modification de la navigation ou des libellés en production dans ce lot.

## A3 — Typage backend

- `src/mobile-operations/mobile-analytics.service.ts` sépare calcul et cache typé et décrit explicitement les lignes SQL (comptages, cohortes, événements d’audit avec acteur nullable). Contrat identique sur cache hit et calcul ; durée du cache, requêtes et format HTTP conservés.
- `src/store-management/store-aws-wif.spec.ts` utilise des réponses compatibles `Response` / Gaxios et des mocks adaptés aux surcharges de `getAccessToken`, sans retirer les assertions d’échange, délai, cache et reprise.
- `src/admin/admin-users-vehicle-postgres.spec.ts` vérifie le chemin buffer des petits exports avant lecture, le contrat autorisant aussi un flux.
- `src/admin/admin-analytics-postgres.spec.ts` remplace temporairement le contenu de la liste des migrations puis restaure son état initial, sans réaffectation d’une propriété TypeORM en lecture seule.
- La passe globale a aussi révélé une attente instable à 1 ms dans `src/notifications/ride-mobile-compatibility.spec.ts`. Quatre cas déterministes ont ensuite reproduit une vraie divergence : le TTL Android retenait l’échéance métier la plus proche, mais le contrôle après OAuth pouvait retenir la plus longue. `notifications.service.ts` borne désormais aussi la fenêtre de sonnerie, le permis et la garde d’envoi par l’expiration métier pour `driver_dispatch_offer` / `trip_request_nearby`. Les réservations et décisions restent consultables après leur fenêtre de sonnerie, sans ce nouveau cutoff d’invitation.

Les corrections transactionnelles des mocks dans `request-preparation.spec.ts`, `trip-request-alert-routing.spec.ts`, `accepted-request-outbox.spec.ts`, `trip-request-price.spec.ts` et l’attente `driver_offer` dans `notifications.service.spec.ts` étaient déjà présentes au début de cette intervention : elles sont vérifiées, pas réattribuées. Aucun test Store n’est désactivé, ni son délai augmenté pour masquer un échec.

## A4 — CI

Dans `zwanga-backend/.github/workflows/deploy.yml`, `ACCOUNT_LIFECYCLE` rejoint les suites avec chemin PostgreSQL jetable explicitement défini. Préparation de la CI ECS uniquement ; aucun workflow distant déclenché.

## A5 — Dépendances

Dans les deux `package.json` / `package-lock.json`, overrides ciblés : `glob >=9 <14.0.2` vers **14.0.2** et `minimatch >=7 <11.0.1` vers **11.0.1**. Les anciennes API callback sont conservées. Les dépendances transitives correspondantes suivent la résolution npm ; aucun changement majeur Expo, React Native ou NestJS.

Avis vérifiés : [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249), [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). Le nouvel audit npm, développement inclus, indique **0 modérée, 0 élevée, 0 critique** par dépôt. Restent **16 paquets faibles côté mobile et 7 côté backend**, tous issus de [l’avis deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), sans correctif officiel publié lors de cette passe. Ce sont des paquets affectés par propagation, pas 23 failles indépendantes.

Les consommateurs directs restants de `deepmerge` dans les lockfiles sont `@expo/config` côté mobile, `jest-config` et `fork-ts-checker-webpack-plugin` côté backend. Cela ne prouve pas l’inexploitabilité. Aucun downgrade ou remplacement d’API non vérifié n’est imposé.

`tests/dependencySecurityCompatibility.test.js` et `zwanga-backend/test/dependency-security.test.cjs` vérifient les versions résolues, les API synchrones/asynchrones et une annulation explicite. Les correctifs post-install existants sont conservés. Le lanceur npm local n’a pas pu charger sa commande `run` ; les mêmes scripts post-install ont ensuite été exécutés directement avec Node, avec succès.

## Vérifications

- Tests mobile ciblés de reprise, bannière et contrats : **37/37 réussis**.
- Compatibilité des dépendances : **7/7 mobile, 7/7 backend**, dont échanges HTTP/gRPC locaux et modules natifs Node sharp/bcrypt. Ce ne sont pas des essais iOS/Android.
- Cycle de vie PostgreSQL/PostGIS jetable : **17/17 réussis**.
- Analytics/exports sur PostgreSQL jetable : **43/43 réussis**, dont un cache hit sans transaction SQL.
- Recette RTK mobile → HTTP/Nest → PostgreSQL/PostGIS : **10/10 réussis**, avec contrôleurs et transactions réels, cache mémoire et fournisseurs externes interdits. Ce n’est pas un parcours de clics dans le binaire natif.
- TypeScript backend complet, tests inclus : **réussi**.
- ESLint strict backend ciblé : **service analytics désormais réussi**, après typage des résultats SQL (25 erreurs supprimées). Il reste **67 erreurs dans les trois fichiers de tests vérifiés** : tests mobile SQL 41, mocks Google 24, tests exports 2. La comparaison initiale à configuration identique comptait 120 erreurs sur les quatre fichiers Git précédents, puis 92 avant le typage SQL final. Aucune désactivation de règle ; le lint backend global n’est pas annoncé comme réussi. Traces : `.expo/fixes-backend-lint-comparison-20261106.json` et `.expo/fixes-backend-analytics-lint-20261106.log`.
- Contrôle mobile complet `check-release` : **réussi**, TypeScript, ESLint, frontières réseau, taille, compatibilité URI/Metro, parité des sources natives ; **3 280 tests réussis, 0 échec, 1 ignoré** (Ruby absent pour un contrôle de politique iOS). Étape tests : environ 621 secondes sur cette machine ; ce n’est pas une mesure de performance de l’application.
- Backend Jest global après correction des échéances : **3 688 réussites, 0 échec, 836 ignorés**, 304 suites réussies / 43 ignorées. Les suites SQL nécessitant un flag ne sont pas activées dans cette passe ; les 17 + 43 tests SQL explicites sont rapportés séparément. Les 28 tests de compatibilité mobile des alertes passent, ainsi que les 20 tests Google/WIF.
- La première passe backend avait encore un échec d’échéance à 1 ms (3 685 réussites / 1 échec) ; la recette déterministe intermédiaire a reproduit deux divergences métier avant le correctif. La seconde passe globale ci-dessus est celle de validation, pas une suppression des tests en échec.

Les passes ciblées et globales se recouvrent : ne pas additionner leurs totaux. Traces locales `.expo/fixes-*` et `.expo/global-e2e-*-fixes-20261106*`, non destinées à publication brute. Node 24.22.1.

## Limites

Pas de nouveau build natif, de test physique iOS/Android, de mesure ANR/mémoire/batterie ni de réception réelle FCM/APNs. Pas de garantie d’absence de crash ou de livraison de sonnerie à 100 %. Configurations AWS, permissions système et fournisseurs restent à qualifier séparément. Le guide PostgreSQL a orienté la transaction courte, la conservation des verrous et la vérification des rollbacks sur base isolée.
