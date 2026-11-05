# Recette mobile–backend des ajouts — 5 novembre 2026

## Correctifs appliqués après la recette

Les deux défauts ci-dessous ont été corrigés dans le code backend et les scénarios qui les reproduisaient réussissent désormais, sans déploiement. Les constats initiaux sont conservés plus bas pour distinguer les erreurs reproduites des résultats après correction. Cela ne vaut pas certification globale de production ou des binaires natifs.

### Accès aux réservations

- `zwanga-backend/src/bookings/bookings.controller.ts` transmet désormais l'identité authentifiée à `findOneForViewer` et valide le format UUID. Aucun identifiant de lecteur fourni par le client n'est utilisé.
- `src/bookings/bookings.service.ts` vérifie en base que le lecteur est le passager de la réservation ou le conducteur de son trajet **avant de consulter le cache partagé**. La vérification est bornée à l'identifiant de réservation et utilise des paramètres ORM. Un compte tiers reçoit la même réponse 404 qu'une réservation inexistante ; une panne de lecture n'autorise pas un repli sur un cache non autorisé.
- `findOne` reste une lecture interne pour les mutations qui effectuent déjà leurs propres contrôles. Aucun accès administrateur implicite n'est ajouté à la route publique. Les participants gardent l'accès à leur réservation et à leur historique, sans nouveau filtre de statut.
- `src/bookings/booking-access.spec.ts` couvre la transmission de l'acteur, les deux participants, le cache rempli, l'identité absente, l'échec de vérification et les appels internes.

### Requête des demandes disponibles

- Cause confirmée par la génération réelle du SQL TypeORM : l'alias `TripRequest.id`, placé juste avant un saut de ligne dans la sous-requête de disponibilité du compte, n'était pas remplacé par l'identifiant SQL correctement cité.
- `zwanga-backend/src/trip-requests/request-proximity.ts` délimite cette expression par des parenthèses. Les filtres de proximité, dernière position, refus, ciblage, compte disponible, types de véhicules et dates ne sont pas supprimés ni élargis. Aucune migration ou modification des données applicatives.
- `src/trip-requests/request-proximity.spec.ts` compile les requêtes ORM avec et sans pagination : deux échecs avant correction, deux réussites après. Les identifiants des utilisateurs restent liés comme paramètres, pas concaténés dans le SQL.

### Vérifications après correction

- **75/75 tests backend** : accès aux réservations, génération SQL et service de réservation/paiement.
- **10/10 scénarios intégrés RTK mobile → HTTP/Nest → PostgreSQL/PostGIS** : les huit parcours métier initiaux restent valides ; accès interdit à un conducteur ou passager tiers sur cache vide/rempli ; absence de session ; UUID invalide ; ancien conducteur refusé après changement du propriétaire dans la base synthétique malgré un cache ancien conservé.
- Le harnais `tests/helpers/bookingBackendFixture.cjs` utilise désormais le vrai `CacheService` avec stockage mémoire sérialisé. L'invalidation est exercée ; Redis et l'expiration TTL ne sont pas simulés. `tests/integration/bookingBackendE2E.test.cjs` renforce le scénario d'accès et ajoute le cas de propriété révoquée.
- **53/53 tests mobiles** ciblés : proposition de prix, bandeau conducteur, priorité/entrée de réservation, redirection et affichage du détail. Aucun changement métier mobile nécessaire.
- **160/160 tests des suites dispatch PostgreSQL/PostGIS et cohérence financière** : les sept scénarios SQL précédemment en échec réussissent sans désactiver leurs assertions ; les scénarios de proximité, refus, recherche, ciblage, contre-propositions et concurrence restent valides. Les 20 scénarios financiers passent également. Cette passe inclut quelques tests de politique sans SQL ; il ne s'agit pas de 160 parcours mobiles.
- Compilation TypeScript backend (`tsconfig.build.json`, sans émission), ESLint des deux fichiers de harnais mobiles et des deux nouveaux tests backend réussis. La relance des neuf tests d'accès/génération SQL passe après les ajustements de typage et de formatage des tests. Les diffs ciblés ne présentent pas d'erreur d'espacement. Cela ne remplace pas un lint global des modifications préexistantes.

Les bases sont jetables et locales, avec comptes synthétiques et interdiction des connexions externes. Aucune tentative de connexion externe pendant les dix scénarios intégrés. Aucune base de production, configuration `.env`, notification réelle, opération financière ou publication modifiée. Le guide PostgreSQL a orienté la vérification d'appartenance en base et la conservation des prédicats de visibilité. Ces résultats ne constituent pas un essai natif iOS/Android ni une garantie de livraison push ou d'absence de crash.

## Conclusion initiale, avant correctifs

**Validation globale refusée en l'état : deux défauts backend reproduits.** Les parcours de proposition de prix fonctionnent dans la recette intégrée, mais ils ne suffisent pas à qualifier la livraison complète.

### 1. Lecture d'une réservation par un compte non participant

- Preuve : le test `HTTP booking details must not disclose another passenger reservation to an unrelated account` reçoit **HTTP 200**, au lieu de 403/404, avec le JWT valide d'un conducteur sans lien avec la réservation synthétique.
- Chemin : `zwanga-backend/src/bookings/bookings.controller.ts`, `GET /bookings/:id`, appelle `BookingsService.findOne(id)` sans transmettre l'acteur. La méthode charge la réservation, son passager et son trajet sans contrôle d'appartenance. Le garde JWT vérifie l'authentification, pas la participation à cette réservation.
- Impact : connaître l'identifiant d'une réservation permet à un autre compte connecté d'en obtenir les détails. Le contrôle de redirection côté mobile fonctionne mais ne protège pas l'API.
- Correctif nécessaire, **non appliqué dans cette demande de tests** : vérifier l'identité du passager ou du conducteur propriétaire côté serveur, y compris lorsque les données viennent du cache. Conserver les lectures internes autorisées et tester les éventuels accès administratifs explicitement.

### 2. Listes de demandes disponibles : requête SQL invalide

- Preuve : **sept scénarios** de `src/trip-requests/dispatch/dispatch-postgres.spec.ts` échouent sur PostgreSQL réel : `missing FROM-clause entry for table "triprequest"`.
- Le point commun est `TripRequestsService.findAll`, lors de l'hydratation par `tripRequestRepository.find`. Les conditions `Raw` composées par `nearbyRequestDriverVisibilitySql` sont impliquées ; l'alias ORM doit être correctement délimité dans le SQL final. La cause précise doit être corrigée et revérifiée sur le SQL généré, pas seulement par une simulation du repository.
- Cas échoués : les deux scénarios Home ; visibilité Kinshasa/Kisangani ; limite de 5 km ; choix de la position la plus récente ; demande adressée à un conducteur ; exclusion après refus.
- Impact : l'accueil ou les listes de demandes peuvent échouer au lieu d'afficher les opportunités. Une réponse vide avant l'hydratation ne reproduit pas nécessairement l'erreur. Ces essais ne prouvent pas que tous les envois push sont bloqués.
- Correctif nécessaire, **non appliqué** : corriger la composition des alias de la requête et relancer ces scénarios sans supprimer les protections de proximité, ciblage, compte disponible ou refus.

## Recette intégrée initiale

Fichiers mobiles ajoutés :

- `scripts/audits/run-booking-contract.cjs` : lanceur à environnement nettoyé, sans configuration applicative ni identifiants de fournisseur.
- `tests/helpers/bookingBackendFixture.cjs` : serveur Nest sur loopback, vrais contrôleur, garde JWT, DTO, service de réservation, subscriber de notifications et PostgreSQL/PostGIS jetable. La migration `1780000113000-BookingPriceProposal` est réellement exécutée.
- `tests/integration/bookingBackendE2E.test.cjs` : vrais endpoints RTK Query mobiles, middleware/cache, `fetchBaseQuery`, HTTP et mappers de réponse. Ne recopie pas la logique métier serveur.
- `scripts/audits/check-local-booking-runtime.cjs` : relance en lecture seule des trois requêtes en erreur dans le runtime de l'émulateur. Les jetons restent dans Hermes ; seules les catégories de résultat et durées sont affichées.

**Résultat : 8 réussites, 1 échec de sécurité**, aucun scénario ignoré dans cette suite. Les huit parcours réussis vérifient :

1. Proposition de prix → réservation en base → notification durable destinée au conducteur → ouverture du bon trajet → consentement explicite → montant retourné au passager.
2. Refus des anciens boutons d'acceptation sans confirmation du prix proposé : HTTP 409, aucune consommation de places ni notification de réponse.
3. Trois acceptations concurrentes, puis répétition après réponse supposée perdue : une seule consommation de places et une seule notification de réponse.
4. Refus du prix puis nouvelle réservation normale, avec compatibilité de l'ancien appel d'acceptation.
5. Rejet d'une acceptation par un autre conducteur, d'un appel non authentifié et de montants/identités forgés dans le DTO.
6. Rejet des propositions invalides sans générer d'alerte.
7. Capacité devenue insuffisante : aucun changement partiel du tarif, du statut ou de la notification.
8. Absence de redirection mobile pour une réservation refusée ou un autre conducteur.

Exemple financier synthétique vérifié : prix public 3 000 FC/place, proposition 2 000 FC/place pour deux places, montant brut accepté 4 000 FC. La politique réelle de première course calcule 1 600 FC à payer par le passager. Le tarif public reste 3 000 FC/place et aucun débit n'est déclenché par l'accord.

Le cache serveur est simulé sans stockage. La signature JWT est réelle avec une clé aléatoire de test, mais la stratégie d'authentification de production, la rotation de session et les limites de débit globales ne sont pas qualifiées par ce harnais. Les fournisseurs de paiement, SMS, géocodage et push sont remplacés par des interdictions d'appel. Le réseau du harnais n'autorise que les ports PostgreSQL et HTTP éphémères. **Aucune tentative de connexion externe observée pendant les neuf tests.**

### Rejouer

Avec Node conforme au projet et PostgreSQL/PostGIS local :

```powershell
$env:AUDIT_POSTGRES_BIN = 'C:/Program Files/PostgreSQL/18/bin'
node scripts/audits/run-booking-contract.cjs
```

Ce test retournait un code d'échec avant la correction d'accès. L'assertion n'a pas été désactivée ni inversée : les nouvelles vérifications d'accès et de cache passent après correction, comme indiqué plus haut.

## Autres vérifications de la recette initiale

| Périmètre | Résultat observé | Nature et limite |
| --- | --- | --- |
| Mobile, 17 fichiers ciblés | **256/256 réussites** | Tests JavaScript : OTP, demande directe, contre-proposition, alertes, bandeau et navigation ; interfaces natives simulées |
| Backend, deuxième passe contrôleur demandes + compatibilité inscription + OTP utilisateur/service + actions de notification | **129/129 réussites**, cinq suites | Contrats HTTP et tests de service ; fournisseurs simulés |
| PostgreSQL, dispatch et cohérence financière | **153 réussites / 160**, sept échecs SQL décrits plus haut | Deux suites ; les 20 scénarios financiers passent. Les huit scénarios de contre-proposition inclus dans le dispatch passent |
| Nouvelle recette RTK → HTTP → PostgreSQL | **8/9**, un échec d'accès | Interaction des modules mobiles et du backend, pas des clics dans l'interface native |
| Émulateur, profil/KYC/mise à jour | **3 requêtes réussies après relance** | Environ 1 504 ms / 1 121 ms / 939 ms ; un relevé local, pas un benchmark de production |
| Émulateur, retour dans l'application | **3/3 passages réussis** | Application visible, session locale conservée, aucun nouvel événement ANR/crash ni écran d'erreur observé |

Les nombres des passes ne doivent pas être additionnés comme s'il s'agissait de scénarios uniques : certains contrôles se recouvrent. Une première passe backend n'était pas valide pour PostgreSQL à cause des restrictions de lancement Windows ; un test HTTP avait aussi dépassé cinq secondes sous charge locale. La relance autorisée des bases jetables a permis les vrais essais SQL, et la relance du contrôleur a réussi sans modifier ses assertions. Les erreurs initiales de montage du nouveau harnais (fournisseur simulé assimilé à une Promise, nettoyage Windows) ont été corrigées avant la mesure finale.

## Émulateur et périmètre natif

Backend habituel `/health` : `ok`. Runtime Metro connecté, authentifié, en développement et configuré vers le backend local sur le port 5200. Aucun identifiant personnel ni valeur de configuration n'est consigné ici.

Le binaire installé est **1.0.18, build 176**, installé le 28 octobre. Le code JavaScript servi par Metro et les appels de lecture ont été inspectés ; cela ne constitue pas une validation du prochain binaire natif. Les trois essais de retour utilisent `scripts/audits/recheck-local-startup.cjs resume`, déjà présent. Captures et résultat local se trouvent dans `.expo/recheck-startup-20261103-resume/` (nom historique du harnais, exécution effectuée pour cette recette).

Pas de parcours tactile complet de nouvelle réservation sur ce binaire, pas d'iPhone ni d'appareil physique testé, pas de notification FCM/APNs reçue réellement, pas d'essai sonore en veille dans cette recette. La présence du message dans l'outbox est vérifiée ; sa livraison effective au téléphone et la durée du bandeau système ne le sont pas. Aucune conclusion de disparition des crashs, ANR ou de la chauffe en production.

## Changements et précautions de la recette initiale

Uniquement des tests, outils locaux et documentation ajoutés pendant cette recette ; aucune correction métier, modification native, migration de base applicative, publication ou déploiement. Les modifications préexistantes des deux dépôts sont conservées. Le guide PostgreSQL a servi à isoler les bases et à vérifier les transactions/concurrences réelles.

Les bases temporaires sont arrêtées et supprimées par les harnais. Un dossier synthétique arrêté, retenu par Windows après un premier essai, a été supprimé séparément après vérification de son chemin exact et de l'absence de serveur actif. Aucune donnée de l'application n'a été supprimée.
