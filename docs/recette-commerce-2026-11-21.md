# Recette du catalogue et des remboursements

Date : 21 novembre 2026. Périmètre : nouvelles intégrations commerce du mobile, du backend, de l’admin et du site public. Ce rapport ne vaut pas validation de toutes les autres fonctionnalités de Zwanga.

## Résultat et portée

Les **9 scénarios d’intégration HTTP**, **68 tests backend ciblés** et **29 tests mobile ciblés** passent. Les contrôles TypeScript des quatre dépôts passent. Les parcours financiers ont été exercés sur PostgreSQL temporaire avec des comptes, contrats et montants synthétiques ; les fournisseurs SMS, push, stockage et paiement réels n’ont pas été sollicités.

Sur l’émulateur Android 16 connecté à Metro, le nouveau catalogue renvoyait d’abord HTTP 500. La migration commerciale était absente de la base locale. Après autorisation explicite, **seule `ServiceCommerce1780000140000`** a été appliquée à cette base, sans réinitialisation. Les catégories, les filtres et l’accès aux achats chargent ensuite correctement. Aucune offre commerciale n’y est publiée : le parcours complet de souscription/paiement n’a donc pas été exécuté par gestes natifs sur ce compte.

Les composants admin/mobile testés contre l’API sont les composants réels, mais leurs hooks et primitives d’interface sont pilotés par un banc JavaScript. Ce n’est pas une session complète dans un navigateur admin ou sur un iPhone.

## Scénarios croisés exécutés

Source : `tests/integration/commerceBackendE2E.test.cjs`, fixture `tests/helpers/commerceBackendFixture.cjs`.

| Scénario | Vérifications effectives | Résultat |
| --- | --- | --- |
| Création depuis le formulaire admin | Callback réel, client RTK admin, JWT, DTO, contrôleur, SQL ; produit masqué avant activation, prix comptant à 80 %, coûts privés absents de la projection publique | Réussi |
| Achat comptant | Choix mobile/API, examen admin, acceptation, débit unique, refus de remise avant paiement, stock/proof requis, activation soldée sans mandat de crédit | Réussi |
| Crédit et solde anticipé | Acompte, petits paiements, ancien devis refusé, remise de 10 % du restant, écriture distincte de l’encaissement, mêmes montants mobile/admin, réconciliation | Réussi |
| Document sans acompte | Première échéance obligatoire avant délivrance, versements quotidiens imputés au même échéancier | Réussi |
| Changement de formule | Période échue et payée exigée, conservation du solde et de l’historique, version ou montant périmé refusé | Réussi |
| Habilitations et éligibilité | Authentification, rôles, propriétaire du contrat, KYC, refus véhicule sans activité réelle suffisante | Réussi |
| Paiement depuis l’écran mobile | Callbacks réels ; réponse perdue après débit, nouvelle tentative avec le même identifiant, absence de double prélèvement | Réussi |
| Fiche produit mobile | Choix comptant, récapitulatif, commentaire transmis à l’admin, absence de débit à l’envoi du dossier | Réussi |
| Catalogue du site | Appel public HTTP réel, rendu du composant réel, prix identiques, lien vers la fiche mobile, absence de coûts internes | Réussi |

La fixture charge les vrais services financiers, contrôleurs, migrations, validations et gardes. Sa stratégie JWT utilise une clé temporaire et des utilisateurs synthétiques. Les connexions sont limitées aux ports locaux autorisés ; les scénarios vérifient qu’aucune connexion externe n’a été tentée. Les métadonnées de justificatifs sont synthétiques : l’upload S3 n’est pas testé. Le changement d’échéancier utilise un cas de test dont la période est échue, sans changer l’horloge ou les contrats de la base habituelle.

## Contrôles complémentaires

| Contrôle | Résultat | Limite |
| --- | --- | --- |
| Backend : politique commerciale, règles Pro, PostgreSQL et architecture | 68 tests, 4 suites réussis | Pas l’ensemble des tests du backend |
| Mobile : commerce, catalogue historique, remboursements et Services | 29 tests réussis | Exécution JavaScript, pas pilotes natifs |
| TypeScript mobile, backend, admin, site | Réussi | Pas une compilation de binaires Android/iOS |
| ESLint mobile ciblé, frontières réseau, taille des sources | Réussi ; 1 426 modules, aucun au-delà de 400 lignes | Pas une mesure de charge ou de consommation mémoire |
| Aperçus RN-Web produit, contrat et confirmation | 6 rendus : 320 × 568, polices à 100 % et 200 % ; pas de débordement horizontal, actions contrôlées accessibles et d’au moins 44 px | La confirmation reste défilable à grande police ; ce n’est pas le clavier natif ni VoiceOver/TalkBack |
| Android connecté au backend local | Catégories, filtre Téléphones, achats/dossiers, messages d’indisponibilité et nouvelle tentative contrôlés | Catalogue local sans produit publié ; pas de paiement natif effectué |

Captures locales non versionnées : `.expo/commerce-preview/` et `.expo/global-e2e-ui-20261103/commerce-*.png`. Les captures natives concernent uniquement les écrans commerciaux sans données personnelles affichées.

## Incident local et correction

1. Les API publiques `/api/v1/zwanga-pro/commerce/categories` et `/products` renvoyaient 500 ; l’application affichait un message et un bouton Réessayer.
2. La lecture du schéma a confirmé l’absence de la table des catégories et de l’enregistrement de la migration commerciale, avec les trois migrations Pro préalables présentes.
3. Après accord de l’utilisateur, le script local a vérifié la cible et le serveur PostgreSQL sur boucle locale, puis exécuté uniquement la migration commerciale et son enregistrement TypeORM dans une transaction. Délais DDL limités ; aucun compte, solde ou contrat de test ajouté à cette base.
4. Les deux API ont répondu 200, avec cinq catégories et zéro produit publié. La tentative suivante dans Android a chargé les données ; les lectures de contrats et dossiers ont également réussi.

Une tentative réseau Android intermédiaire a échoué par `FETCH_ERROR`, puis la suivante a réussi. Sa cause n’a pas été établie ; elle n’est pas attribuée à la migration. Un premier contrôle de sécurité du script avait refusé la représentation IPv6 `::1/128` : ce contrôle a été corrigé avec `host(inet_server_addr())` avant toute écriture.

Les premiers essais isolés avaient rencontré deux obstacles de recette : lancement du PostgreSQL temporaire bloqué par le sandbox et pièce de stock téléphone sans IMEI dans la fixture. Le lancement autorisé puis l’ajout d’un IMEI synthétique ont permis de terminer les tests ; la contrainte IMEI du produit n’a pas été supprimée. Le journal `PRO_CREDIT_WORK_RETRY` de la suite backend correspond à une panne de worker injectée volontairement et couverte par son test.

## Reproduire les tests

Depuis le dépôt mobile, avec PostgreSQL installé localement :

```powershell
$env:AUDIT_POSTGRES_BIN='C:\Program Files\PostgreSQL\17\bin'
node --test tests/integration/commerceBackendE2E.test.cjs
node --test tests/commerceFlow.test.js tests/assetCreditCatalogue.test.js tests/creditRepayments.test.js tests/servicesDashboard.test.js
node scripts/preview-commerce.cjs 'C:\Program Files\Google\Chrome\Application\chrome.exe'
```

Depuis le dépôt backend :

```powershell
$env:PRO_CREDIT_TEST_POSTGRES_BIN='C:\Program Files\PostgreSQL\17\bin'
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/financing/tests/commerce.policy.spec.ts src/financing/tests/pro-credit.policy.spec.ts src/financing/tests/pro-credit.postgres.spec.ts src/financing/tests/financing-architecture.spec.ts
```

Dans chacun des quatre dépôts : `node node_modules/typescript/bin/tsc --noEmit --incremental false`.

Les fixtures détruisent uniquement leurs clusters jetables. Ces commandes ne sont pas des commandes de migration de la base habituelle ou de déploiement.

## Points restant avant ouverture publique

- Pour les **nouveaux contrats Pro**, la retenue automatique sur trajet cash et son reliquat dû ne sont pas couverts. Le mobile et le site indiquent le paiement volontaire depuis le solde ; les anciens crédits gardent leur comportement. Ne pas annoncer une couverture automatique cash complète.
- Effectuer la recette native complète sur Android/iOS physiques avec une offre de test publiée, sans utiliser de clients réels : choix, justificatifs, consentement, paiement, perte réseau, reprise et changement de compte.
- Effectuer la recette admin dans un navigateur réel, notamment formulaires, concurrence, stock, pièces privées, retour et rapprochement financier.
- Vérifier stockage privé, liens profonds, images, notifications et fournisseur de paiement dans leur environnement de test dédié. Aucun succès de ces transports n’est déduit du banc JavaScript.
- Valider contrats, prix et marges avec les responsables métier ; tester les migrations et rapprochements sur une copie représentative avant production.

Aucun déploiement AWS, publication Store, paiement réel ou envoi réel n’a été effectué. La correction du HTTP 500 local n’est pas une certification de stabilité générale, d’absence d’ANR ou de capacité en production.

Le [guide catalogue et remboursements](catalogue-achats-remboursements-2026-11-21.md) décrit les règles, fichiers modifiés et précautions contre les régressions.
