# Commission cash et tolérance de dette — 7 octobre 2026

**Évolution d'interface du même jour :** la carte `DriverCommissionPanel` décrite
dans l'historique ci-dessous a ensuite été retirée du portefeuille. Les fonds
réservés figurent dans les détails du solde et seule une dette serveur positive
produit une alerte compacte. La lecture est désormais dans `useWalletCashDebt`.
Voir le [journal technique](CHANGEMENTS_TECHNIQUES.md) pour les fichiers et tests
de cette simplification ; les règles backend ci-dessous restent applicables.

## Règles appliquées

- Commission conservée à **5 %**. La mention initiale de 15 % a été corrigée par
  l’utilisateur avant livraison. Ni les paiements électroniques ni les jetons
  passagers ne changent de commission.
- Un jeton de réserve cash vaut 100 FC ; la tolérance est de **25 jetons**, soit
  **2 500 FC**. Tous les jetons financent les commissions cash : achats, bonus,
  fidélité, parrainage, récompenses et jetons reçus par partage. Cette extension
  nécessite la migration 1780000055000, décrite ci-dessous.
- À la publication publique, contrôle du prix par place multiplié par les places
  proposées, si le cash fait partie des paiements acceptés. Il s’agit d’un contrôle
  de capacité, sans débit ni réservation anticipée pour des passagers inexistants.
- À l’acceptation, contrôle atomique de la commission du paiement du passager,
  réserves déjà engagées déduites. La part disponible est réservée ; le manque
  peut atteindre 25 jetons. La dette est suivie séparément : le solde réel du
  portefeuille ne devient pas négatif.
- Dès qu’une dette, même inférieure à 25 jetons, existe, aucun nouveau cash n’est
  accepté. Les moyens électroniques restent disponibles. Une recharge partielle
  ne réactive pas le cash tant qu’il reste un dû.
- Tout crédit de jetons couvre en priorité le dû : il complète la réserve d’une
  course confirmée ou règle la commission d’une course terminée. Annuler une
  course non effectuée libère sa réserve et son dû.
- Exception explicitement validée : une course déjà embarquée peut terminer même
  si le tarif final entraîne une dette supérieure à 25 jetons. Cette dette est
  intégralement enregistrée ; aucun nouveau cash avant régularisation.

Exemple : 4 places à 10 000 FC représentent 2 000 FC de commission, donc 20 jetons.
Avec 8 jetons disponibles, l’estimation affiche 12 jetons de manque. Les passagers
étant acceptés séparément, le premier engagement créant une dette bloque les
acceptations cash suivantes jusqu’à régularisation ; publier ne garantit donc
pas que toutes les réservations ultérieures seront acceptables sans recharge.

## Backend local

### Extension à toutes les origines — 7 octobre 2026

**Problème :** le contrôle de capacité, la réservation et le prélèvement cash
utilisaient uniquement `withdrawableBalance`. Les bonus disponibles ne pouvaient
donc ni financer la commission ni régulariser une dette.

**Solution appliquée :** nouvelle migration en avant
`src/database/migrations/1780000055000-CashCommissionAllTokenOrigins.ts`, enregistrée
dans `index.ts`, avec SQL dans `sql/cash-all-token-origins.ts`. Les anciennes
migrations restent inchangées. La capacité utilise le solde total, moins toutes
les réserves engagées. Les bonus sont réservés/utilisés en premier, puis la part
achetée. `chargedWithdrawableTokens` garde la part réellement prélevée sur les
jetons retirables, y compris lors de plusieurs ajustements et remboursements.
La reprise historique initialise cette part avec les prélèvements antérieurs,
qui provenaient exclusivement de jetons achetés, sans changer leur taux ni montant.

La contrainte de réserve porte désormais sur le solde total. Le trigger de crédit
considère tous les crédits du compte de jetons, pas seulement leur composante
retirable. La migration rapproche aussi les dettes existantes avec les jetons déjà
disponibles ; une course confirmée reçoit une réserve, une course terminée reçoit
un prélèvement tracé. Aucun crédit fictif et aucun solde négatif.

`src/wallet/wallet-origin.ts` protège les origines réservées contre les paiements,
transferts, retraits et débits administratifs. `wallet.service.ts` et
`driver-finance.service.ts` recalculent respectivement le retirable et la capacité
cash ; `purchasedTokensOnly` vaut désormais `false`. L'entité `wallet-account.entity.ts`
porte la contrainte actualisée. La démarche PostgreSQL a guidé la conservation du
verrouillage utilisateur → portefeuille → commission, sans appel réseau transactionnel.

**Mobile :** explications corrigées dans `DriverCommissionPanel.tsx` et
`PublishPaymentModes.tsx` et `CashCommissionNotice.tsx`. Le détail Pro ne prétend plus que les récompenses ne
financent pas le cash. `WalletOverview.tsx`, `WalletWithdrawalSection.tsx` et
`hooks/wallet/useWalletWithdrawal.ts` calculent les jetons retirables libres comme
`max(0, min(jetons retirables, solde total - réserve cash))` pour ne pas soustraire
les bonus réservés des jetons achetés une seconde fois.

**Règles conservées :** commission 5 %, dette maximale 25 jetons pour un nouvel
engagement, aucun nouveau cash en présence d'une dette, exception pour terminer une
course déjà embarquée, autorisations, blocage des portefeuilles à vérifier et
idempotence des prélèvements. Les bonus peuvent payer une commission mais ne deviennent
pas retirables. Un remboursement de commission restaure les origines réellement
débitées, jamais davantage de jetons retirables qu'avant le prélèvement.

**Vérifications de cette extension :**

- 34 tests JavaScript mobile ciblés réussis : réserve, publication, portefeuille,
  saisie de retrait et dette. Les nouvelles assertions couvrent la réserve financée
  par bonus sans blocage indu des jetons achetés libres.
- Suite mobile complète : **1 504/1 504 réussis**, aucun test ignoré, puis relance
  ciblée après harmonisation finale des messages de régularisation.
- 134 tests unitaires backend ciblés réussis : origines, portefeuille, retraits,
  ajustements administratifs, finance conducteur, abonnements et réservations.
- 73 tests PostgreSQL 17 réussis sur cluster éphémère local, dont 16 scénarios de
  la nouvelle politique ; 3 diagnostics opt-in de compatibilité avec un ancien
  commit restent ignorés. La suite conserve les tests des migrations précédentes,
  puis applique réellement la migration 1780000055000 : reprise historique, bonus
  seuls, mélange d'origines, remboursements, dette, crédit de bienvenue, concurrence,
  dispatch et protection des réserves. Fichiers :
  `src/database/driver-finance-postgres.spec.ts` et
  `test/cash-all-token-origins-postgres.ts`.
- Le premier démarrage PostgreSQL a échoué en sandbox ; une relance autorisée a
  permis les essais. Une fixture de crédit utilisait incorrectement le résultat
  `UPDATE RETURNING` de TypeORM : corrigée pour fournir un vrai identifiant de
  compte au trigger, puis suite relancée avec succès.
- TypeScript mobile et backend applicatif, ESLint mobile ciblé, limites de taille
  des sources et `git diff --check` validés. Aucun paiement réel, essai sur téléphone,
  lecture de `.env`, migration applicative ou déploiement pendant cette modification.

**Activation :** préparer une sauvegarde et une recette préproduction. Examiner
`npm run migration:show`, puis appliquer le lot approuvé avec `npm run migration:run`.
Coordonner migration et remplacement de tous les serveurs/workers financiers :
l'ancien code ne comprend pas une réserve supérieure aux jetons retirables.
Ne pas assimiler ces tests au feu vert d'un déploiement progressif avec anciennes
instances ; voir aussi l'audit de compatibilité dans le journal financier backend.
Vérifier bonus seuls, solde mixte, réserve concurrente, recharge/bonus avec dette,
annulation et remboursement avant activation. Pas de rollback automatique de cette
migration financière ; retour arrière par migration en avant après rapprochement.

### Mise en place initiale de la dette (avant extension des origines)

- `src/database/migrations/1780000053000-CashCommissionCredit.ts` et
  `src/database/migrations/sql/cash-commission-credit.ts` : migration en avant,
  politique de crédit version 2, conservation des réservations déjà confirmées et
  de l’historique. Les réservations encore en attente passent à la nouvelle
  politique. Aucun recalcul rétroactif de commissions encaissées.
- `zwanga_cash_sync` conserve l’ordre de verrouillage utilisateur, portefeuille,
  commission et les notifications transactionnelles existantes. Accepter depuis
  l’app, une notification ou une écriture SQL passe par le même contrôle.
- `zwanga_request_cash_guard` réserve dès la sélection cash d’un conducteur,
  y compris via dispatch. Le champ `requestId` rattache temporairement la réserve
  à la demande, puis à la réservation lors de son acceptation. Annulation,
  expiration et libération d’un conducteur libèrent la réserve non transférée.
  Le remplacement d’un conducteur conserve son historique soldé.
- `zwanga_publication_cash_guard` vérifie les publications et les changements de
  prix/places/modes. Pour une acceptation directe, vérification préalable avant
  insertion du trajet privé, sans compter deux fois une réserve de dispatch.
- `src/database/migrations/index.ts` enregistre la migration ; les entités Booking
  et TripRequest portent la version serveur, non exposée en écriture dans les DTO.
- `src/driver-finance/driver-finance.policy.ts` et `driver-finance.service.ts` :
  plafond, crédit encore disponible et dû retournés au conducteur. Les options
  des passagers ne révèlent pas le portefeuille du conducteur.
- `src/bookings/bookings.service.ts` fige la conversion cash CDF à 100 FC ;
  `src/driver-settlements/driver-settlements.service.ts` conserve pour la version 2
  la commission sur le montant payé par le passager, hors participation Zwanga.
- `src/common/filters/api-exception.filter.ts` traduit les refus financiers en
  messages français, notamment dette existante et capacité insuffisante.

## Mobile

- `utils/cashCommission.ts` : estimation de commission et de manque ; prise en
  compte prudente des arrondis par passager. Un ancien serveur qui ne fournit pas
  de capacité de crédit n’est pas présumé autoriser une dette.
- `features/publish/PublishPaymentModes.tsx`, `PublishPricingStep.tsx` : calcul
  pour toutes les places ; commission, manque estimé et blocage après dette
  affichés sans changer automatiquement les moyens choisis.
- `features/driver-payments/CashCommissionNotice.tsx`,
  `features/request-detail/RequestAcceptModal.tsx`, `app/request/[id].tsx` et
  `app/incoming-driver.tsx` : explication avant acceptation cash, montant dû et
  consigne de recharge ; pas de nouveau modal obligatoire.
- `features/driver-payments/DriverCommissionPanel.tsx` : dû en jetons et FC dans
  le portefeuille, conditions de tolérance dans les détails dépliables.
- `store/api/driverFinanceApi.ts`, `driverDispatchApi.ts` : champs facultatifs pour
  compatibilité et invalidation des données financières après réponse dispatch.

## Vérifications et limites de la mise en place initiale

- Tests JavaScript ciblés mobile : 19 réussis pour calcul, seuil, toutes les
  places, compatibilité ancien serveur, visibilité de la dette et réseau.
  Suite mobile complète finale : **1 497/1 497 réussis** avec
  `node --test --test-concurrency=4 tests/*.test.js`.
  Fichiers : `tests/cashCommissionCredit.test.js`, `driverFinance.test.js`,
  `publishPricingLayout.test.js`, `driverCommissionPanel.test.js`. Le test du modal
  dans `requestDetailModules.test.js` a été adapté pour isoler le nouveau composant
  financier et contrôler sa présence uniquement lorsque le modal est ouvert.
- Tests unitaires backend ciblés : 148 réussis, couvrant finance, réservations,
  demandes, abonnements, participation cash et erreurs API.
- TypeScript mobile validé ; TypeScript backend applicatif validé avec
  `tsc --noEmit --incremental false -p tsconfig.build.json`.
- Le contrôle TypeScript incluant tous les tests backend échoue dans des tests
  non modifiés ici (activity, keccel-otp, pawapay, privacy, identity, trip-loyalty).
  Ces erreurs ne sont pas présentées comme résolues.
- PostgreSQL : **55 tests réussis** dans `driver-finance-postgres.spec.ts`, sur un
  cluster éphémère local, sans chargement du `.env` applicatif : seuil exact,
  dépassement, concurrence, réserves cumulées, publication, dispatch, transfert
  vers booking, remplacement du conducteur, annulation, bonus exclus, recharge
  partielle/complète, ajustement après embarquement et politiques historiques.
  Le premier lancement sandbox et une initialisation sous charge ont échoué ;
  la relance finale autorisée et isolée a réussi.
- ESLint mobile ciblé, limites de taille des sources et `git diff --check` validés.
- Aucun essai sur téléphone, paiement réel, migration applicative ou déploiement.
  Le contrôle de capacité à la publication ne bloque pas les fonds : un autre
  engagement ultérieur peut rendre une réservation inéligible, d’où la seconde
  vérification transactionnelle. Le parcours historique création de trajet privé
  puis booking n’est pas transformé en une transaction globale par ce correctif.

## Déploiement et recette

1. Sur une base de préproduction sauvegardée, vérifier toutes les migrations en
   attente (`npm run migration:show`) puis appliquer le lot approuvé avec
   `npm run migration:run`. La migration 1780000053000 ne doit pas être annulée
   automatiquement : elle contient de l’historique financier et des réserves.
2. Déployer le backend après migration, puis le mobile. Aucune nouvelle dépendance
   ni configuration native : ce correctif ne nécessite pas, à lui seul, de nouveau
   build natif si la runtime est compatible avec le canal de mise à jour utilisé.
3. Sur iOS et Android : publication cash plusieurs places, acceptation normale et
   depuis notification, seuil exact de 25 puis dépassement, recharge partielle puis
   complète, annulation, arrivée après tarif final augmenté et changement vers un
   paiement électronique. Vérifier les montants serveur et les notifications.
