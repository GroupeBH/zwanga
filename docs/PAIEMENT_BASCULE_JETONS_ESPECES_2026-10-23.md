# Bascule du complément Mobile Money vers les espèces — 23 octobre 2026

## Problème et périmètre

Le paiement en jetons avec complément Mobile Money restait verrouillé tant que
le fournisseur ne répondait pas. Le passager ne pouvait pas choisir le cash,
même s’il n’avait pas validé la demande sur son téléphone. Une absence de
confirmation ne prouve cependant pas l’absence de débit : il faut traiter
correctement une réponse tardive, sans déclarer artificiellement la recharge annulée.

Ce changement couvre le **complément d’un paiement en jetons**. Un paiement
Mobile Money directement affecté au trajet conserve la vérification existante :
échec confirmé → espèces possibles ; résultat inconnu → pas de second règlement.
Le détachement/remboursement d’un encaissement direct inconnu n’est pas implémenté ici.

## Solution mobile appliquée

- `ArrivalPaymentRecovery.tsx` : si le cash est accepté/disponible après l’arrivée,
  « Payer [montant total] en espèces » devient l’action principale du complément
  bloqué. « Vérifier Mobile Money » est secondaire. La fermeture reste accessible.
  La compétence frontend a guidé la hiérarchie des actions et la réduction du texte.
- `useTokenCashFallback.ts` et endpoint `switchTokenPaymentToCash` : commande
  explicite, simple vol, sans initiation Mobile Money ni débit de jetons. Une
  lecture de statut en cours ne bloque pas le bouton. Les mutations financières,
  le paiement mixte déjà engagé et les problèmes de stockage restent protégés.
- Le serveur doit confirmer le choix avant d’afficher les instructions cash.
  Réponse perdue/409/ancien serveur : aucune fausse réussite, références conservées,
  possibilité de réessayer la même commande idempotente.
- `tokenCashFallback.ts`, types, mapper et `useArrivalPaymentState` : preuve serveur
  persistée par compte/réservation, restaurable sur une liste momentanément ancienne.
  `useBookingPaymentMode`, `useArrivalPaymentMonitoring`, `useArrivalPaymentRecovery`
  et le coordinateur n’essayent plus de régler cette réservation en jetons.
- `buildPaymentCompletionSummary.ts` explique que **le montant entier** est à
  remettre au conducteur, et que les jetons actuels et une éventuelle recharge
  confirmée ensuite restent dans le portefeuille. Ce n’est ni une annulation
  opérateur ni un remboursement Mobile Money. Le mixte jetons + espèces existant
  reste un parcours distinct.

## Backend préparé, sans déploiement

Dans `../zwanga-backend` :

- `token-cash-fallback.controller.ts` / `.service.ts` :
  `POST /bookings/:id/token-cash-fallback`, authentifié, UUID validé, limité à
  10 appels/minute. Vérification du propriétaire, arrivée, tarif, cash accepté,
  absence de débit jetons, de paiement mixte/encaissé et de transaction de collecte
  directe sur la réservation (même anciennement refusée : la correction tardive
  du fournisseur reste à réconcilier par le parcours existant).
  Verrou court sur la réservation ; aucun appel prestataire sous transaction.
- Migration `1780000091000-TokenCashFallback.ts`, enregistrée dans l’index :
  marqueur durable `tokenCashFallbackAt`, contrainte cash et protection des
  écritures anciennes. Interdiction d’un nouveau débit de cette réservation
  (jetons ou collecte directe) après la bascule, y compris depuis un ancien client.
  La transaction originale de recharge n’est ni supprimée ni modifiée.
- Garde-fous explicites dans `bookings.service.ts`, `mixed-cash-payment.service.ts`
  et options de `driver-finance.service.ts`. Une recharge tardive vérifiée suit
  le crédit portefeuille idempotent existant, sans repayer ce trajet.
- Les déclencheurs existants de commission cash et la confirmation de réception
  par le conducteur restent en place. Aucun calcul de parrainage modifié.

Les recommandations Postgres ont guidé le verrouillage court, l’arbitrage avec
le règlement concurrent et les contraintes de conservation. La migration est
additive et refuse un retour arrière qui effacerait les choix financiers ; une
correction en avant est nécessaire après utilisation.

## Vérifications et limites

- 136 tests JavaScript ciblés réussis (paiements, conservation/reprise, commandes
  API et régressions connexes). Le snapshot des endpoints a été étendu uniquement
  pour la nouvelle commande, avec test explicite de son contrat et de ses caches.
- TypeScript mobile et backend, ESLint mobile ciblé, limites réseau, taille des
  sources et `git diff --check` réussis. Suites globales non relancées.
- Backend : 47 tests réussis, dont scénarios PostgreSQL réel sur clusters jetables
  (bascule, double appel, paiement direct bloquant, recharge tardive, écriture
  ancienne, courses entre paiement et bascule), et régressions paiement mixte/reprise.
- 108 tests supplémentaires de commissions réussis avec les vrais déclencheurs
  SQL, dont la commission entière de la bascule et son annulation transactionnelle
  si la réserve cash est insuffisante. Trois tests de compatibilité avec un commit
  de déploiement précis restent ignorés (commit non fourni).
- Les premières tentatives locales ont échoué avant les tests : lancement
  PostgreSQL bloqué par le sandbox, puis PostGIS absent de PostgreSQL 17. Les
  exécutions autorisées utilisent PostgreSQL 18 avec PostGIS, sans `.env` ni base existante.
- Sept aperçus React Native Web avec données fictives : contrôles visibles en
  390×844 ; accessibles par défilement en 320×568 avec texte à 150 % et en paysage.
  Ces aperçus ne constituent pas une validation native Android/iOS.
- Aucun paiement réel, aucun appel FlexPay/PawaPay, aucune modification native,
  aucune migration sur une base existante et aucun déploiement effectués.
- Avant livraison : déployer la migration et le backend associés, puis tester
  le mobile sur appareils physiques, notamment réponse opérateur tardive,
  perte réseau après validation cash, reprise de session et confirmation conducteur.
