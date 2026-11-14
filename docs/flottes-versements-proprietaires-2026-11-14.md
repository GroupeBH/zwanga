# Flottes : versements déclarés et confirmés — 14 novembre 2026

## Périmètre et décision métier

Suite du [registre de flotte et crédit matériel](flottes-credit-materiel-2026-11-13.md), préparée dans le mobile, le backend et le portail partenaire, sans déploiement. Le registre ne permettait pas de définir un montant périodique ni de suivre les versements au propriétaire.

Le choix confirmé est un **montant fixe par jour, semaine ou mois**, défini dans chaque contrat. Le conducteur déclare un versement déjà réalisé hors Zwanga ; un responsable de la flotte confirme ou refuse sa réception. **Cette déclaration ne débite aucun portefeuille Zwanga.** Elle ne constitue pas une preuve bancaire ni une vérification automatique d'un transfert externe.

- Les versements partiels sont permis. Le montant, la date, la référence et la période couverte sont enregistrés séparément.
- Seuls les versements confirmés comptent dans « Reçu par le propriétaire ». Les déclarations en attente ont un total distinct ; un refus reste visible avec son motif.
- Les conditions doivent préciser les jours de règlement et les périodes couvertes. Aucun échéancier, impayé calculé, prorata, pénalité ou dette automatique n'est inventé.
- La règle du crédit matériel reste distincte : commission habituelle et remboursement matériel ne sont pas modifiés par ce suivi propriétaire.

## Solution appliquée

### Backend et base de données

- `src/partners/fleet-registry.dto.ts`, `fleet-registry.service.ts`, `fleet-registry.controller.ts` : montant et périodicité proposés ensemble ; accord explicite du conducteur sur ces conditions. Une invitation rejouée ne peut pas changer silencieusement le montant. Les anciens contrats sans montant restent sans montant.
- `src/database/migrations/1780000126000-FleetExternalPayments.ts`, enregistrée dans `src/database/migrations/index.ts` : montant mineur CDF et périodicité sur l'affectation, séquence d'historique, table `fleet_external_payments`, contraintes de montant/statut/décision, unicité de l'opération et index de pagination.
- `src/partners/fleet-payments.dto.ts`, `fleet-payments.service.ts`, `fleet-payments.controller.ts`, `partners.module.ts` : déclaration, historique paginé et décision. Identité issue de l'authentification, validation des UUID/DTO, limitation de fréquence et contrôle de l'organisation côté serveur.
- `src/partners/partners.service.ts` : capacité `fleet.payments.confirm` pour les responsables autorisés. Une organisation suspendue peut rapprocher ses anciens versements sans rouvrir les nouvelles affectations.

Les principales routes, sous le préfixe API existant, sont :

| Route | Utilisation |
| --- | --- |
| `GET /partners/fleet-assignments/history` | Affectations du conducteur, y compris clôturées |
| `GET /partners/organizations/:org/fleet-assignments` | Affectations de la flotte autorisée |
| `GET/POST /partners/fleet-assignments/:id/payments` | Historique / déclaration du conducteur |
| `GET /partners/organizations/:org/fleet-assignments/:id/payments` | Historique propriétaire |
| `POST /partners/organizations/:org/fleet-assignments/:id/payments/:paymentId/decide` | Confirmation ou refus motivé |

Les montants sont des entiers en centimes CDF, multiples de 100 pour saisir des FC entiers, positifs et bornés. Une date de versement future est refusée selon la date civile de Kinshasa. Un contrat doit avoir été accepté et être actif ou clôturé ; la clôture n'empêche pas de déclarer un règlement tardif.

Une même opération UUID et un même contenu renvoient le résultat existant. Un contenu différent avec la même clé est refusé. Verrou transactionnel par opération, contrainte unique et verrou de ligne pour les décisions protègent des doubles clics et des réponses concurrentes. Un conducteur ne peut pas confirmer son propre versement, même s'il est gestionnaire. Une décision déjà enregistrée n'est pas réécrite.

Les historiques d'affectations et de versements utilisent un curseur de séquence, 30 éléments par page. Les totaux portent sur l'ensemble des versements du contrat, pas sur la page affichée. Lecture des lignes et des totaux dans une même transaction `REPEATABLE READ` pour éviter un résultat incohérent pendant une confirmation concurrente.

### Mobile

- `app/services/fleet.tsx`, `store/api/fleetRegistryApi.ts` : montant et périodicité visibles avant acceptation, consentement transmis, historique des affectations paginé et accès « Mes versements ».
- `app/services/fleet-payments/[id].tsx`, `store/api/fleetPaymentsApi.ts`, `features/pro-services/fleetPaymentModel.ts` : résumé du contrat, reçus/en attente, déclaration, historique et motifs de refus ; route protégée dans `components/ProtectedAppStack.tsx`.
- `hooks/fleet/useFleetPaymentDeclaration.ts` : intention enregistrée localement avant le POST, par compte et affectation. Après délai réseau ou fermeture, la même opération est reprise. Le formulaire ne fabrique pas une seconde déclaration tant que la première est incertaine. Une réponse déjà confirmée ou refusée affiche son véritable statut.
- Changement de compte, sortie de l'écran ou passage en arrière-plan pendant la persistance : aucune nouvelle requête n'est lancée avec une ancienne session. Les réponses tardives ne renseignent pas le nouvel écran. La lecture utilise les données du contrat courant et s'arrête hors écran actif.
- Le mode « Déclarer un versement » masque temporairement les totaux et l'historique pour montrer rapidement les champs. Retour au suivi possible sans abandonner une opération incertaine. Aucun nouveau modal système ou module natif.

### Portail partenaire

- `components/fleet-registry.tsx`, `lib/api/fleet-registry.ts` : montant et périodicité lors de la proposition du contrat ; conditions explicites de règlement externe.
- `components/fleet-payments.tsx`, `lib/api/fleet-payments.ts` : affectations identifiées par conducteur, véhicule et date ; historiques paginés, totaux, confirmation explicite de réception ou refus motivé. Les lecteurs seuls n'ont pas de bouton de décision.
- `lib/domain/catalog.ts` : permission issue des capacités serveur. `app/api/backend/[...path]/route.test.ts` vérifie le relais réel des mutations, sans remplacement par un simulateur financier.
- Verrou de double clic, données liées au contrat courant et fermeture des actions devenues obsolètes après décision d'un autre responsable. La décision serveur reste l'autorité.

## Comportements conservés et précautions

Pas de changement des sonneries, notifications de commandes, calculs de commission, collecte du crédit matériel ou propriété des véhicules. Les contrôles KYC et d'autorisation de conduite existants sont conservés. L'affectation du registre **n'accorde toujours pas le droit d'utiliser un véhicule appartenant à un tiers**.

Les anciennes routes restent disponibles. Un ancien client ne peut pas accepter silencieusement un nouveau contrat à montant périodique sans transmettre l'accord sur ces conditions. Les anciens contrats sans ces conditions restent compatibles ; aucun loyer rétroactif n'est ajouté.

Les guides PostgreSQL et UI ont orienté les verrous courts, les contraintes, la pagination et la présentation compacte. Ils ne constituent pas une certification juridique ni une validation native.

## Vérifications réellement effectuées

- Backend : **97 tests réussis dans cinq suites**, dont **27 sur PostgreSQL isolé** (`asset-credit.postgres` et `fleet-registry.postgres`). Scénarios : consentement, montants partiels, concurrence, rejeu idempotent, droits d'accès, auto-confirmation interdite, refus motivé, règlement après clôture, organisation suspendue, pagination et protection du retour arrière de migration.
- Les parcours HTTP Nest utilisent de vraies validations DTO et une base PostgreSQL réelle avec une identité de test injectée. Ils ne valident pas la connexion JWT, un fournisseur de paiement ni un parcours sur appareil.
- Les trois autres suites backend sont `partners.service.spec`, `driver-category` et `accepted-request-outbox`. Les fixtures des deux dernières ont été alignées sur leurs types actuels (UUID de réservation, photo nullable), sans changer l'implémentation des alertes. Le contrôle TypeScript global incluant ces tests passe désormais ; le blocage décrit dans le bilan du 13 novembre est levé.
- Portail : **105 tests Vitest réussis dans 13 fichiers** après les derniers ajustements ; TypeScript global sans émission ni cache incrémental réussi. Ces tests utilisent des doubles réseau et ne remplacent pas les essais backend.
- Mobile ciblé : **33 tests JavaScript réussis** flotte, versements, crédit, Services et onglets. Couverture de la persistance, reprise après fermeture, double clic, changement de session, stockage indisponible et contrat API. TypeScript et ESLint ciblé réussis après les ajustements d'interface.
- Contrôle mobile complet final : `node scripts/check-release.cjs` **réussi (code 0), 3 822 tests réussis, 1 ignoré, aucun échec**, environ 428 s pour la suite de régression. TypeScript, ESLint, parité des sources natives, frontières réseau et limite de taille des sources passent aussi. Cette passe remplace celle à 3 820 réussites exécutée avant les derniers ajustements. Les 33 tests ciblés cités ci-dessus sont inclus : ne pas les additionner. La parité et les tests de code natif isolé ne remplacent pas un build complet Android/iOS.
- Le test ignoré concerne la politique Ruby des cibles de déploiement iOS : Ruby n'est pas installé dans cet environnement Windows. Ce contrôle reste à exécuter sur l'environnement macOS/Ruby de build.
- Aperçus des composants réels via React Native Web, fixtures sans API (`scripts/preview-fleet-payments.cjs`) : historique en 390 × 844, formulaire en 320 × 568 et texte à 160 %. Zéro débordement horizontal mesuré, toutes les actions accessibles en défilant si nécessaire. Captures locales dans `.expo/fleet-payments-preview/` ; ce ne sont pas des captures Android/iOS.
- Les anciennes mesures de coexistence financière du 13 novembre ne sont pas additionnées aux résultats de cette intervention. Aucun test sur appareil physique, compilation native ou affirmation d'absence de crash/chauffe.

## Livraison et travail encore ouvert

Rien n'est déployé et aucune base existante n'a été migrée. En recette, appliquer les migrations du crédit et du registre puis `1780000126000-FleetExternalPayments` avant de publier ces interfaces. Prévoir sauvegarde et contrôle d'accès avec de vrais comptes de recette. Le retour arrière refuse de supprimer des conditions périodiques ou des versements enregistrés ; il n'efface pas un historique financier pour faciliter un rollback.

Restent à implémenter/valider séparément :

1. Le véritable droit de conduire un véhicule de propriétaire tiers, de bout en bout dans commandes, publication, navigation et clôture. Le registre actuel ne prétend pas le fournir.
2. L'idempotence persistante de création d'espace propriétaire et d'émission d'offre crédit après rechargement du portail. Après une réponse incertaine, vérifier les listes avant de recréer ces éléments.
3. La pagination des anciennes listes encore limitées à 100 éléments, l'export comptable complet et de nouvelles notifications de services.
4. Les échéances/arriérés calculés, maintenance, assurance et télémétrie. Aucun débit propriétaire, partage automatique de revenus ni règle de pénalité n'a été activé.
5. Un parcours connecté mobile/portail/backend avec authentification réelle, puis les essais natifs Android/iOS avant livraison.
