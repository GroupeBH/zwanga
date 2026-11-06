# Audit global mobile et backend — 6 novembre 2026

Suivi : les constats ci-dessous décrivent l’état avant intervention. Voir les [correctifs locaux du 6 novembre et leurs vérifications](CORRECTIFS_AUDIT_GLOBAL_20261106.md) ; le risque résiduel deepmerge et les limites de qualification native restent explicités.

## Conclusion

**Pas de feu vert global au déploiement en l'état.** Un blocage métier a été reproduit sur PostgreSQL et les contrôles de livraison comportent des échecs. Il faut distinguer ces deux catégories : plusieurs échecs proviennent des harnais de test, pas d'un crash démontré de l'application.

Audit commencé le 5 novembre et terminé le 6 novembre, heure de Kinshasa. Périmètre : dépôt mobile `zwanga` et état local de `zwanga-backend`, y compris ses modifications non commitées. Aucun correctif métier, changement de configuration, installation de dépendance, déploiement ou accès à la base de production effectué.

## Constats prioritaires

### A1 — P1 : une demande ciblée peut perdre sa reprise automatique

- **Déclencheur :** un passager choisit un conducteur sur la carte ; le compte de ce conducteur est désactivé/suspendu avant son acceptation.
- **Cause :** `zwanga-backend/src/users/account-lifecycle.service.ts:135` supprime `targetDriverPriorityUntil`, mais conserve `targetDriverId`. La demande reste `pending`.
- **Conséquence :** `target-driver-policy.ts:7` continue d'exclure les autres conducteurs ; `target-map-driver.ts:182` ne reprend plus la recherche, puisqu'il exige une échéance non nulle. La reprise automatique après les trois minutes ne peut plus fonctionner dans cet état. Une intervention explicite du passager reste possible ; il ne s'agit pas d'un arrêt de toutes les demandes.
- **Preuve réelle :** service de désactivation et persistance PostgreSQL/PostGIS exécutés sur des comptes synthétiques. Après désactivation : cible conservée, échéance nulle, reprise `false`, autre conducteur refusé par la politique d'accès. Le témoin avec une échéance expirée reprend correctement. Aucune tentative de connexion externe. Le témoin utilise une date passée, sans attendre trois minutes réelles.
- **À corriger, non appliqué :** retirer transactionnellement le ciblage devenu invalide et conserver une reprise du dispatch, sans rouvrir une demande déjà acceptée/annulée. Ajouter un test PostgreSQL de ce cas.

### A2 — P1 : le contrôle mobile utilisé par EAS n'est pas vert

- **Neuf échecs constatés dans la première passe**, et contrôle interrompu à sa limite locale de vingt minutes de tests. Les vingt derniers fichiers ont été exécutés séparément : **204/204 réussis**, dont les six tests du fichier frontière déjà exécutés. Les 401 fichiers du contrôle ont ainsi été parcourus sans modifier leurs assertions ; le contrôle EAS n'a pas été déclaré réussi.
- Six scénarios de `tests/entryActivityRecovery.test.js` échouent avec `Unexpected token 'typeof'`.
- La chaîne d'import a été identifiée : `ActiveRideResumeCoordinator` → `DriverBookingAlertBanner` → `react-native-safe-area-context` → code Flow de React Native chargé directement dans Node. Le harnais `tests/helpers/entryRecoveryHarness.cjs` ne simule pas cette nouvelle frontière native.
- Un autre scénario de `tests/personalListCards.test.js:102` attend `total estimé`, tandis que `features/bookings/BookingListCard.tsx:55` affiche maintenant `total passager`.
- `tests/sourceExtractions.test.js:26` conserve les empreintes de `createBooking`/`acceptBooking` antérieures aux champs de négociation. Le parcours HTTP/PostgreSQL de ces nouveaux champs passe dans la recette intégrée ; le snapshot d'extraction ne reflète plus ce changement fonctionnel.
- `tests/tripDetailCompact.test.js:58` attend l'ouverture du profil avec le seul identifiant conducteur, alors que `features/trip-detail/TripSummary.tsx:105` transmet aussi `sourceTripId`, utilisé par la demande directe depuis ce profil.
- `package.json:13` appelle `scripts/check-release.cjs` dans le post-install EAS : ces échecs bloquent la validation de livraison. **Cette erreur Node n'est pas une preuve de crash du même composant sous Metro/iOS/Android.**
- **À corriger, non appliqué :** compléter les simulations natives des tests de reprise et réconcilier les contrats de libellé, paramètres et snapshots avec les fonctions effectivement retenues, en conservant les assertions de navigation, de consentement et de montant. Ne pas supprimer les tests du contrôle EAS. Le dépassement de délai sur cette machine chargée n'est pas, à lui seul, une mesure de lenteur de l'application en production.

### A3 — P2 : les tests backend ne suivent pas tous les nouveaux contrats

- Passe globale : **3 622 réussites, 18 échecs, 825 tests ignorés**, sur 4 465 cas ; 291 suites passent, six échouent, 43 sont ignorées.
- Seize échecs proviennent de simulations incomplètes des transactions/comptes : `trip-request-price.spec.ts`, `accepted-request-outbox.spec.ts`, `request-preparation.spec.ts`, `trip-request-alert-routing.spec.ts`. Les doubles ne fournissent pas `manager.findOne` ou `repository.manager.transaction`, désormais utilisés par les vrais services.
- Un échec dans `notifications.service.spec.ts:238` attend l'ancienne liste d'alertes prioritaires, sans `driver_offer`, ajouté pour la négociation.
- Le dernier échec est un délai de cinq secondes dans le test de décompression Store. **La relance isolée de cette suite réussit : 29/29**, sans changer les assertions ou le délai. Ne pas en déduire un défaut de décompression en production.
- La vérification TypeScript incluant les tests échoue aussi : 14 diagnostics dans `mobile-postgres.spec.ts` et `store-aws-wif.spec.ts`, concernant des résultats typés `{}` et des doubles Gaxios/Jest. **La compilation des sources de production avec `tsconfig.build.json` réussit.**
- Le workflow ECS exécute Jest avant de publier : ces incohérences doivent être réparées, sans retirer les protections de disponibilité de compte du code métier.

### A4 — P2 : une suite PostgreSQL récente est ignorée par la CI ECS

- `src/users/account-lifecycle-postgres.spec.ts:22` dépend de `ACCOUNT_LIFECYCLE_TEST_POSTGRES_BIN` et bascule en `describe.skip` sans cette variable.
- La boucle de `.github/workflows/deploy.yml:61` active plusieurs suites PostgreSQL, mais pas `ACCOUNT_LIFECYCLE`. Aucune autre initialisation de cette variable n'a été trouvée dans le dépôt.
- Le nettoyage transactionnel d'un compte, ses remboursements et ses conflits avec une course peuvent donc ne pas être exercés par la CI de livraison, même lorsque les autres suites PostgreSQL tournent.
- **À corriger, non appliqué :** activer explicitement cette suite dans la CI et y ajouter le scénario A1 ; vérifier les tests ignorés dans les rapports de livraison.

### A5 — P2 : dette de dépendances modérées, sans exploitation démontrée

Audit npm du registre public, dépendances de développement incluses, sans installation :

| Dépôt | Modérées | Faibles | Élevées / critiques |
| --- | ---: | ---: | ---: |
| Mobile | 68 | 1 | 0 / 0 |
| Backend | 23 | 2 | 0 / 0 |

Ces nombres comptent des paquets affectés, avec propagation transitive : **ce ne sont pas 94 failles indépendantes**. Les trois avis à l'origine des chaînes observées concernent :

- `minimatch`, amplification de motifs : versions corrigées indiquées dans [l'avis GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- `glob`, parcours de fichiers poursuivi après annulation : [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
- `deepmerge`, empoisonnement du prototype de l'objet retourné : aucun correctif publié indiqué au moment de la consultation, [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

Les lockfiles contiennent notamment `minimatch` 9.0.9/10.2.6, `glob` 10.5.0/13.0.6 et `deepmerge` 4.3.1 selon les branches de dépendance. Une partie concerne les outils de build/test, mais certaines branches backend passent par TypeORM, l'instrumentation ou les clients Google : ne pas tout classer arbitrairement « développement uniquement ». Aucun chemin d'exploitation par un utilisateur de Zwanga n'a été démontré ici. Préparer des mises à jour ciblées et vérifier les compatibilités ; **ne pas appliquer aveuglément `npm audit fix --force`**, dont certaines propositions changent de version majeure Expo/Nest/instrumentation.

## Vérifications réalisées

| Vérification | Résultat et portée |
| --- | --- |
| TypeScript mobile, ESLint, frontières réseau et taille des sources | Réussis dans le contrôle global |
| Compatibilité des correctifs URI/Metro et parité des sources natives | Réussies ; aucune compilation native |
| Tests JavaScript mobile | **3 270 réussites / 9 échecs / 1 ignoré**, reconstitués sur les deux passes ; six tests rejoués déduits |
| Jest backend global, connexions externes bloquées | 3 622 réussites / 18 échecs / 825 ignorés ; aucun flag PostgreSQL activé pour cette passe |
| Relance Store isolée | 29/29 réussis ; recouvre la passe globale, ne pas additionner comme de nouveaux cas |
| TypeScript backend production | Réussi, sans émission de fichiers |
| TypeScript backend avec tests | 14 diagnostics de typage de tests, voir A3 |
| RTK mobile → HTTP/Nest → PostgreSQL/PostGIS | **10/10 réussis** |
| Sonde de désactivation du conducteur ciblé | Défaut A1 reproduit, témoin positif valide |
| Suite PostgreSQL de cycle de vie des comptes | **11/11 réussis**, activée explicitement pour cette passe ; ne couvre pas A1 |
| npm audit | Résultats A5, audit des dépendances JavaScript et non des bibliothèques natives |

La recette intégrée vérifie le budget proposé, le consentement explicite du conducteur, les appels anciens sans consentement au nouveau prix, le refus puis une nouvelle réservation, les trois acceptations concurrentes, la capacité, les validations DTO, la navigation issue des événements, et la confidentialité des détails de réservation avec cache rempli et propriétaire modifié.

Comptage mobile : la première passe produit 3 082 résultats TAP de premier niveau (3 072 réussites, neuf échecs, un ignoré). La seconde repart de `tripLocationPermissionCoordinator.test.js` jusqu'à `walletWithdrawal.test.js` : 204 réussites, dont six déjà comptées. Total distinct : 3 280 cas. Le test ignoré exige Ruby, absent de cette machine, pour vérifier une politique de cibles iOS ; il reste à exécuter sur macOS/Ruby. Le délai atteint concerne l'étape de tests du contrôle local, pas le temps de démarrage de Zwanga. Les suites backend ignorées ne sont pas annoncées comme des validations PostgreSQL ; les passes SQL explicites sont indiquées séparément.

Elle utilise de vrais contrôleur, service, transactions et subscriber de notifications, mais une stratégie JWT de test, un stockage de cache en mémoire et des fournisseurs externes interdits. **Ce n'est pas un parcours de clics dans l'interface native, ni une réception réelle FCM/APNs/FlexPay/SMS.** Les bases PostgreSQL sont créées dans des répertoires temporaires dédiés puis arrêtées/nettoyées ; aucun backend applicatif existant n'a été utilisé ou réinitialisé.

## Performance, sécurité et stabilité : observations positives et limites

- Le benchmark géométrique existant, sur 8 000 points et 500 positions synthétiques, mesure **7 850 ms** pour la double projection de référence contre **58 ms** pour l'analyse indexée, construction incluse ; 7 999 000 contre 18 992 projections de segments. Mesure Node sur cette machine pendant d'autres contrôles, **pas** une mesure de fluidité, batterie ou chauffe sur téléphone.
- Les lectures d'affichage consultées sont conditionnées par l'activité/réseau ; la boîte des paiements conducteur espace ses lectures selon l'état socket. La rotation de session, les délais réseau/Redis et les limites du pool PostgreSQL disposent déjà de protections : ne pas les retirer pour masquer un échec de test.
- Les contrôles d'appartenance d'une réservation résistent aux essais HTTP/cache actuels. Les callbacks FlexPay de recharge passent par une vérification fournisseur et un règlement idempotent ; les tests ne valident pas la configuration ou la disponibilité du fournisseur réel.
- Les services Android d'alerte consultés disposent d'une échéance et de nettoyages ; les activités/services internes concernés ne sont pas exportés. La parité source/native passe. Cela ne mesure ni ANR, ni mémoire native, ni restrictions constructeur, ni continuité audio réelle.
- L'émulateur présent porte **1.0.18 / build 176**, installé le 28 octobre, alors que le dépôt mobile est en 1.0.19. Il n'a pas été présenté comme une qualification native des derniers changements. Aucun essai physique iOS/Android, build release, test de faible mémoire, campagne de charge serveur ou inspection AWS réalisé pendant cet audit.
- Les tests de contrats UI/navigation couvrent de nombreux états, mais aucune validation visuelle complète de la nouvelle version sur petit écran/grande police/VoiceOver/TalkBack n'a été effectuée. Aucune certification globale d'UX, de livraison push ou d'absence de crash n'est donc donnée.

## Traces et reproduction

Résultats locaux, non destinés à être publiés tels quels : `.expo/audit-global-20261105-mobile.log`, `.expo/audit-mobile-tail-20261106.log`, `.expo/global-e2e-backend-20261103-audit-20261105.json`, `.expo/global-e2e-types-20261103-audit-20261106.log`, `.expo/audit-store-recheck-20261106.json`, `.expo/audit-booking-contract-20261106.log`, `.expo/audit-account-lifecycle-20261106.json`, `.expo/audit-targeted-account-20261106.log`, rapports npm `audit-global-20261105-*-dependencies.json`.

Commandes utilisées avec Node 24.22.1 : `node scripts/check-release.cjs`, `node scripts/audits/run-global-local-tests.cjs backend`, même lanceur en mode `types`, `node scripts/audits/run-booking-contract.cjs` avec binaires PostgreSQL/PostGIS jetables explicitement indiqués, et `node scripts/benchmark-driver-route.cjs`. Les noms des rapports globaux sont hérités du lanceur ; leurs suffixes identifient cette passe. La sonde A1 est conservée localement dans `.expo/audit-targeted-account-20261106.cjs`, avec environnement minimal et garde des connexions.

Le guide PostgreSQL a orienté l'isolation de la reproduction et l'analyse des transactions. Les modifications préexistantes des deux dépôts sont conservées. Ce document et son référencement dans le journal sont les seuls ajouts suivis de cet audit ; les pistes de correction ci-dessus restent **non appliquées**.
