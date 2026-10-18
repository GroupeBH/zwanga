# Versement des gains conducteur depuis le compte marchand Zwanga

## Contrat FlexPay

Référence : documentation FlexPay API v1.4 fournie dans la conversation,
pages 8 à 10 (module Merchant Pay out Service, ajouté le 04/03/2021).

Le conducteur demande ses gains dans Zwanga. Le serveur envoie ensuite
`POST /api/rest/v1/merchantPayOutService` avec les identifiants marchands
de Zwanga. `phone` est le bénéficiaire Mobile Money, et non une personne
à débiter. Le conducteur n'a pas besoin d'un compte marchand FlexPay.

Un accusé initial `code=0` ne confirme pas le versement final. Les callbacks
et la vérification serveur restent nécessaires. Aucun débit, transfert réel,
changement de solde historique ni déploiement n'a été effectué pendant cette correction.

## Application mobile

- `app/driver-earnings.tsx` : écran Revenus, bouton « Recevoir mes gains ».
- `features/driver-earnings/PayoutHistory.tsx` : état, motif français,
  référence sélectionnable, vérification et accès à l'assistance.
- `features/driver-earnings/payoutModel.ts` : formats de téléphone et messages.
- `hooks/driver-earnings/useDriverPayout.ts` : confirmation et reprise contrôlée.
- `services/driverPayoutIntent.ts` : clé d'idempotence persistée avant le POST,
  avec montant, destinataire et propriétaire. Un stockage indisponible bloque
  l'envoi plutôt que de perdre sa référence. Aucun secret FlexPay n'est stocké.
- `store/api/driverSettlementsApi.ts` : tous les appels HTTP restent dans RTK Query.
  Le POST et la vérification de versement disposent de 60 secondes,
  contre 20 secondes pour les lectures ordinaires.

Le montant et le téléphone restent identiques lors de la reprise d'une demande
incertaine. Une reprise n'est jamais envoyée automatiquement au démarrage.
Le bouton « Vérifier ma demande » peut rester disponible avec un solde zéro,
car le serveur peut déjà avoir réservé ce montant. Il réutilise la même clé.
Lorsque l'historique confirme cette clé, le suivi local est supprimé ; le
versement est ensuite suivi par son numéro de commande.

Un changement de compte ou le démontage de l'écran empêche une ancienne
confirmation de déclencher un envoi. Les intentions locales sont isolées
par utilisateur. La double confirmation d'un même dialogue est ignorée.

La vérification manuelle utilise l'endpoint de statut existant, jamais un
nouveau transfert. L'historique et le solde sont relus toutes les 60 secondes
uniquement lorsque l'écran est actif ; aucun nouveau polling permanent n'a été ajouté.

### Choisir un autre numéro Mobile Money — 17 septembre 2026

Le bouton « Recevoir mes gains » ouvre désormais `PayoutDestinationModal` :

1. Le montant du versement et le numéro habituel fourni par `summary.payoutPhone`
   sont affichés. Le numéro est modifiable ; son absence dans le profil ne bloque
   plus la saisie d'un bénéficiaire pour ce versement.
2. Le conducteur peut conserver ce numéro ou en saisir un autre. Le bouton
   « Utiliser mon numéro habituel » rétablit le numéro du profil s'il est valide.
3. « Vérifier et continuer » contrôle le format puis ouvre la confirmation avec
   le numéro complet normalisé en `+243…` et le montant. Aucun POST n'est effectué
   pendant la saisie, à la fermeture du formulaire ou en cas d'annulation.
4. Seule la confirmation finale prépare l'intention persistée et appelle la
   mutation RTK Query `requestDriverPayout` avec le numéro choisi.

Le brouillon est local à `useDriverPayout` : une frappe ne déclenche aucune
requête ni modification du profil. Un rafraîchissement des revenus ne remplace
pas le texte saisi. La fermeture, la sortie de l'écran ou le changement de compte
suppriment ce brouillon. Les contrôles d'identité, de montant et de solde restent
en place ; le backend effectue toujours la validation finale.

Le formulaire réutilise `WalletSheetModal`, notamment sa gestion du clavier,
des zones de sécurité Android/iOS et du démontage de la couche tactile. Il est
placé hors du défilement de l'écran. Les boutons de reprise d'un versement
explicitement échoué ou annulé ouvrent aussi ce formulaire avec le montant à
réessayer. L'historique affiche le destinataire masqué de chaque versement.

Une demande dont le résultat est incertain ne propose **pas** de changement de
numéro : sa vérification réutilise le montant, le destinataire et la clé sauvegardés,
y compris après redémarrage. Un double appui sur « Vérifier et continuer » ne
crée qu'une confirmation ; la protection contre les doubles envois est conservée.

Côté backend, aucun changement n'est nécessaire pour cette option :
`RequestDriverPayoutDto.phone` est déjà facultatif. `reservePayout` donne priorité
au numéro demandé, puis utilise celui du profil seulement en son absence, conserve
ce numéro dans `DriverPayout` et contrôle sa cohérence lors d'une reprise.
`requestPayout` transmet ensuite `payout.phone` au service de paiement. Ce parcours
ne réécrit pas le téléphone de l'utilisateur. Le code backend a été vérifié en
lecture seule ; aucune configuration ni donnée de production n'a été changée.

## Backend (zwanga-backend)

- `src/payments/payout-policy.ts` : normalisation, validation des URLs de
  versement, classification des refus explicites, messages non techniques.
- `src/payments/flexpay.service.ts` : téléphone envoyé sous la forme `243…`,
  compte marchand et token exclusivement issus de la configuration serveur.
- `src/payments/payments.service.ts` : refus HTTP explicites
  `400/401/403/404/405/422` classés comme échecs ; coupures, 5xx et résultats
  non interprétables conservés comme incertains. Les encaissements des
  passagers ne sont pas modifiés par cette classification.
- `src/driver-settlements/driver-settlements.service.ts` : normalisation avant
  réservation, comparaison canonique des numéros pour l'idempotence, nouveaux
  champs de réponse facultatifs pour les anciens clients : `reference` et
  `requiresReview`. Les verrous, contraintes et contrôles de solde existants
  restent en place. L'identité vérifiée reste obligatoire.

Formats RDC acceptés pour un versement : `0891234567`, `891234567`,
`243891234567`, `+243891234567`, `00243891234567`, avec espaces usuels.
Le téléphone de connexion du profil n'est pas réécrit.

## Cas incertains : ne pas libérer ni relancer aveuglément

Après un timeout sans `orderNumber`, la documentation fournie ne permet pas
de vérifier automatiquement le transfert par la seule référence interne.
Le montant reste donc réservé ; l'app affiche la référence et l'assistance.
Le rapprochement backend existant continue de vérifier les opérations munies
d'un numéro de commande toutes les cinq minutes.

L'assistance doit rapprocher la référence avec FlexPay avant toute correction
manuelle. Les anciens retraits bloqués ne sont pas libérés automatiquement
par ce correctif : ils peuvent correspondre à de vrais transferts.

## Configuration et déploiement

Déployer le backend avant la nouvelle application. Aucune migration nouvelle
n'est nécessaire ; les migrations d'idempotence antérieures doivent déjà être
appliquées. Les `.env`, SSM et paramètres de production n'ont pas été modifiés.

À vérifier dans l'environnement réellement exécuté :

1. `FLEXPAY_PAYOUT_SERVICE_URL`, ou `FLEXPAY_MOBILE_BASE_URL` permettant de
   construire l'URL. En production, l'URL doit être explicitement configurée,
   utiliser HTTPS et cibler `merchantPayOutService`, jamais `paymentService`.
2. `FLEXPAY_TOKEN` (ou son alias existant) et `FLEXPAY_MERCHANT_CODE` doivent
   appartenir au compte marchand Zwanga autorisé à effectuer des versements.
3. Le compte marchand doit disposer des fonds nécessaires ; un solde insuffisant
   côté FlexPay ne signifie pas que le conducteur doit recharger son téléphone.
4. `FLEXPAY_DRIVER_PAYOUT_CALLBACK_URL`, ou la base publique utilisée par le
   backend, doit produire une URL HTTPS accessible publiquement incluant le bon
   préfixe API. Les callbacks locaux sont refusés en production.
5. `FLEXPAY_CHECK_TRANSACTION_URL` doit correspondre au même environnement
   fournisseur. Conserver `FLEXPAY_VERIFY_CALLBACKS=true`.
6. Vérifier l'activation du service marchand auprès de FlexPay et la confirmation
   d'un versement contrôlé, après autorisation de l'exploitant.

Ne jamais publier de token, numéro complet ou extrait brut de `.env` dans les
rapports. En cas d'échec, relever l'identifiant de versement, la référence et le
code de retour côté serveur dans un canal de support autorisé.

## Tests

Mobile : `node --test tests/driverPayout.test.js`, TypeScript,
`node scripts/check-network-boundaries.js`, `node scripts/check-source-size.cjs`.

Pour le choix du destinataire :
`node --test tests/driverPayout.test.js tests/driverPayoutDestination.test.js tests/walletSheetKeyboard.test.js`.
Ces tests couvrent le numéro alternatif, l'absence de numéro de profil, les formats
invalides, l'annulation, le rafraîchissement, les doubles appuis, la reprise après
coupure/redémarrage et le branchement du formulaire sur les deux boutons de retrait.
La vérification visuelle clavier ouvert sur Android/iOS reste à effectuer sur appareil.

Backend : suites `payout-flow.spec.ts`, `driver-payout-recovery.spec.ts`,
`flexpay.service.spec.ts`, `payments.service.spec.ts`,
`driver-settlements.service.spec.ts` et vérification TypeScript.

Les transports FlexPay et la base sont simulés dans ces tests. Ils ne prouvent
pas la disponibilité du compte marchand ni la configuration déployée.
