# Revue PawaPay — 24 septembre 2026

## Périmètre

Durcissement des ajouts PawaPay dans `zwanga-backend` et adaptation des libellés
Mobile Money dans l’application. Travaux existants sur les comptes, services pro
et navigation conservés. Aucun paiement réel, déploiement, modification de secret
ou migration exécutée pendant cette intervention.

## Problèmes confirmés et corrections appliquées

### Compilation et réponses HTTP

Le service déréférençait des objets potentiellement nuls : compilation bloquée.
Les réponses vides pouvaient aussi être interprétées comme un refus définitif.

- `pawapay.types.ts` et `pawapay-snapshot.ts` séparent types et décodage ; validation
  des objets, UUIDv4 et type d’opération (`depositId`, `payoutId`, `refundId`).
- Vérification v2 via `FOUND/data` ; `NOT_FOUND` reste indéterminé, pas échoué.
- Initiation : `ACCEPTED` et `DUPLICATE_IGNORED` ne signifient jamais argent reçu.
  Réponse mal formée, inconnue ou mauvais UUID : issue incertaine, sans relance.
- Délai HTTP plafonné à 30 secondes et redirections HTTP désactivées.

### Bascule entre prestataires

Une coupure de connexion ou un HTTP 502 pouvait lancer une seconde opération
chez l’autre prestataire alors que la première avait peut-être été reçue.

`payment-provider.policy.ts`, `pawapay.service.ts`, `flexpay.service.ts` et
`payments.service.ts` imposent désormais :

- bascule uniquement pour un refus identifié avant traitement ou une configuration
  manquante détectée avant le POST ; pas de décision par mots-clés génériques ;
- timeout, reset, HTTP 5xx, réponse inexploitable : paiement en attente, sans
  nouvelle opération automatique ; UUID PawaPay conservé et enregistré avant POST ;
- liste explicite de prestataires invalide laissée vide, sans activer les deux ;
- exceptions HTTP typées. FlexPay prioritaire par défaut, préférence backend
  conservée, PawaPay uniquement Mobile Money et cartes exclusivement FlexPay.

### Montants et numéros

Le formateur arrondissait tous les CDF à l’entier, en désaccord avec le montant
enregistré. `pawapay-msisdn.ts` conserve désormais le montant exact : deux décimales
au maximum et borne correspondant à la colonne existante. Valeurs nulles,
négatives, non finies ou trop précises rejetées.

En RDC, Airtel/Orange acceptent deux décimales CDF, Vodacom exige un entier CDF.
Un montant incompatible est refusé avant POST, jamais arrondi silencieusement.
Les numéros sont normalisés sans supprimer arbitrairement les lettres et doivent
respecter les formats RDC. Les opérateurs inconnus ne sont pas acceptés comme
configuration de repli. [Précision officielle des opérateurs](https://docs.pawapay.io/v2/docs/providers).

### Callbacks et preuve financière

Un callback pouvait réaffecter prestataire et identifiant. Seules les recharges
avaient un contrôle de montant ; la vérification serveur était désactivable.

Dans `payments.service.ts`, `pawapay-payment-state.ts`, `payments.controller.ts`
et `wallet-topup-proof.ts` :

- correspondance obligatoire prestataire, type, UUID enregistré et référence
  lorsqu’elle est fournie ; callbacks FlexPay interdits sur transactions PawaPay ;
- lecture authentifiée systématique auprès de PawaPay sur l’identifiant stocké ;
  le callback public ne constitue jamais une preuve de statut ou de montant ;
- avant succès : montant et devise obligatoires et exacts pour réservations,
  abonnements, recharges, revenus, parrainage et retrait de jetons ;
- recharge impossible sur la seule base de `rawCallbackPayload` ;
- `PAWAPAY_VERIFY_CALLBACKS` retiré des exemples : aucun contournement autorisé ;
- HTTP 200 seulement après traitement réussi. Échec de vérification/finalisation
  propagé ; callback final encore indéterminé lors de la lecture à réessayer ;
- remboursement PawaPay refusé explicitement et non annoncé dans les capacités :
  son workflow comptable n’est pas implémenté, il ne peut pas valider un encaissement.

Références : [initiation idempotente](https://docs.pawapay.io/v2/api-reference/deposits/initiate-deposit),
[callbacks et accusés HTTP](https://docs.pawapay.io/v2/docs/what_to_know).

### Concurrence et reprise métier

Une réponse tardive pouvait écraser un succès. Un succès enregistré avant erreur
de finalisation pouvait ensuite être renvoyé sans retenter le crédit métier.

- `commitPawaPayState` relit la ligne sous verrou court, recontrôle la tentative
  et conserve états finaux et date de paiement. Aucun HTTP sous le verrou :
  application du guide PostgreSQL pour limiter la contention.
- Un succès contradictoire après échec/annulation final impose un rapprochement
  manuel, sans acquittement silencieux ni mouvement financier automatique.
- `payment-settlement.registry.ts` ne traite que les états finaux. Gestionnaire
  métier manquant : erreur, pas un succès acquitté sans finalisation.
- Une lecture d’un paiement PawaPay final retente sa finalisation métier.
  Les protections existantes contre les écritures répétées du portefeuille
  sont conservées. Aucun nouveau cron ou polling mobile.
- `wallet.service.ts` et son test adaptent le message de preuve et la description
  du crédit au prestataire réellement utilisé.

## Application mobile

Le suivi existant par numéro de commande accepte l’UUID PawaPay. Aucun SDK ajouté,
pas de deuxième boucle de vérification ni de choix de prestataire imposé au client.
Libellés Mobile Money neutres dans le modal de recharge, son suivi, les choix de
paiement d’arrivée/demande, l’historique, la réservation, le parrainage et les
présentations/suivis/initiation des abonnements.

Fichiers : `features/wallet/WalletTopUpModal.tsx`,
`hooks/wallet/useWalletTopUpMonitoring.ts`, `features/arrival-payment/paymentTypes.ts`,
`features/trip-request/requestFormModel.ts`, `features/payment-history/paymentHistoryModel.ts`,
`hooks/trip-detail/useTripBookingPayment.ts`, `hooks/referrals/useReferralActions.ts`,
`components/profile/ProfileSubscriptionModal.tsx`, hooks d’abonnement dans
`hooks/profile` et `hooks/subscription-payment`.
Les messages exclusivement carte FlexPay restent inchangés, de même que les
mécanismes de fermeture/reprise des modals, changement de compte, cash et jetons.

## Vérifications et limites

- TypeScript mobile et backend de production sans émission : valide.
- 278 tests réussis dans 16 suites backend ciblées : PawaPay/FlexPay, recharges, retraits,
  revenus, parrainage et abonnements. Nouveaux tests : `pawapay.service.spec.ts`
  et `pawapay-settlement.spec.ts` (contrats, montants, erreurs réseau, callbacks
  incompatibles, reprise de finalisation, réponses tardives et conflits).
- 61 tests mobiles ciblés passent : recharge, retrait, conservation/contexte de
  paiement, profil et formulaire de demande.
- 933 sources mobiles contrôlées : aucune au-dessus de 400 lignes ; nouveaux
  modules PawaPay également inférieurs à 400 lignes.
- `git diff --check` : aucune erreur d’espaces ; avertissements LF/CRLF Windows.

Les tests utilisent des doubles HTTP/ORM, pas un serveur PawaPay ni PostgreSQL
réel. Pas de validation native, de mesure de chauffe ou de crash, ni d’annonce de
validation de toute la suite globale du projet.

## Conditions avant activation

1. Vérifier la migration additive existante `1780000042000-AddPawapayPaymentProvider`
   avant activation. Elle est enregistrée, non exécutée ici.
2. Configurer accès, environnement et callbacks HTTPS dans le gestionnaire de
   secrets et le dashboard marchand, jamais dans le mobile.
3. Tester en sandbox : dépôt, recharge, abonnement, versement, refus opérateur,
   coupure après POST, redémarrage, callback répété et exactitude des soldes.
4. Vérifier limites et opérateurs activés sur le compte. La configuration et la
   prédiction dynamiques PawaPay ne sont pas intégrées ; routage actuel par
   préfixes des opérateurs RDC pris en charge.
5. Signatures cryptographiques de callbacks non implémentées. La preuve est la
   lecture serveur authentifiée obligatoire ; restrictions de débit conservées.
   Signatures et protection réseau complémentaire restent des pistes à déployer.
6. Remboursements PawaPay non activés. États finaux contradictoires à rapprocher
   manuellement ; idem pour une requête FlexPay perdue avant réception du numéro
   de commande, à identifier par sa référence. Aucun crédit correctif inventé.

Guide backend associé : `zwanga-backend/PAWAPAY_SETUP.md`.
