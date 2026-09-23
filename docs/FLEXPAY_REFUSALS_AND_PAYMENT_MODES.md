# Refus FlexPay et sélection directe d'un autre paiement

Date : 23 septembre 2026. Périmètre : backend paiements/recharges et formulaire
mobile de paiement à l'arrivée. Cette intervention remplace le bouton supplémentaire
introduit dans les itérations de [vérification des paiements](ARRIVAL_PAYMENT_VERIFICATION.md).

## Cause établie

Le contrôle du prestataire répond avec une enveloppe `code: 0` : la consultation
a fonctionné. Cela ne signifie pas que le paiement a réussi. La transaction
interne présente `status: 4` avec un message explicite de refus par l'opérateur.
Dans ce format, `reference` contient le numéro de commande consulté et le champ
`orderNumber` séparé est absent.

`PaymentsService.applyFlexPayCheckResult` exigeait préalablement pour toute recharge
les champs complets d'une preuve de crédit, dont `orderNumber`. Cette validation
levait une erreur 400 avant d'atteindre la branche de refus. Le wallet ne recevait
pas de transaction `failed`, et le mobile gardait la référence pour éviter un
second paiement tant que le résultat financier restait inconnu.

Les données personnelles et références du log ne sont pas reproduites ici.

## Backend : solution effectivement appliquée

- `src/payments/payments.service.ts` : identifie le résultat financier avant
  d'appliquer la règle de preuve propre aux recharges. La reconnaissance existante
  du refus est conservée : statut d'échec déjà reconnu ou message explicite de
  refus, à condition que la transaction ne soit pas signalée comme réussie.
  Le `4` isolé n'est pas généralisé à tous les contrats prestataires : dans le
  cas corrigé, le message explicite accompagne le statut et prouve le refus.
- `src/payments/wallet-topup-check-evidence.ts` : pour un refus vérifié, exige
  une corrélation avec l'ordre local ou la référence marchande locale. Une
  référence égale à l'ordre demandé suffit en l'absence du champ `orderNumber`.
  Une référence ou un ordre explicitement contradictoire reste rejeté.
- Les montants et devises présents continuent de passer par
  `assertProviderTransactionMatches`. Le montant client incluant les frais ne
  remplace pas le montant marchand utilisé par la vérification.
- Pour les succès ou les états non confirmés, l'exigence de preuve complète
  reste inchangée. `hasVerifiedWalletTopUpProof` et la logique de crédit ne sont
  pas assouplis. En particulier, ce correctif n'invente pas un champ manquant
  dans une preuve de paiement réussi.
- Le refus est enregistré comme `failed` avec « Paiement refusé par l’opérateur.
  Aucun montant confirmé. ». L'état terminal est ensuite servi sans nouvelle
  interrogation du prestataire.
- `WalletService.checkTopUpPaymentStatus` peut retourner normalement cette
  transaction échouée. Sa branche existante ne crédite pas le wallet pour un
  état différent de `succeeded` ; aucune modification de comptabilité n'est ajoutée.

Les versements conducteur, remboursements, callbacks non vérifiés et règles de
montants ne sont pas modifiés. Aucune migration, script de régularisation ou
édition des données d'un paiement réel n'a été exécuté.

## Mobile : formulaire simplifié

- `features/arrival-payment/ArrivalPaymentActions.tsx` : retrait du bouton
  « Changer de mode de paiement » et de sa ligne d'explication. Le pied conserve
  le paiement/la vérification et la fermeture ; pas de nouvelle fenêtre.
- `hooks/arrival-payment/useBookingPaymentMode.ts` : conserve le brouillon et
  les verrous, mais supprime le compteur et la commande liés au bouton retiré.
- `useArrivalPaymentState.ts` et `PassengerArrivalPaymentCoordinator.tsx` :
  branchement direct de l'état de refus vers le formulaire, sans callback de
  changement intermédiaire.
- `features/arrival-payment/ArrivalPaymentFields.tsx` : un refus confirmé ramène
  la zone défilante aux cartes de paiement. Un seul message d'erreur y demande
  de sélectionner un autre moyen, puis de valider. L'ancien mode n'est pas
  remplacé automatiquement par le cash ou un autre moyen.
- Les cartes existantes sont directement sélectionnables et exposent leur
  état choisi/désactivé à l'accessibilité. Sélectionner une carte n'appelle
  aucune mutation : l'utilisateur confirme ensuite le paiement choisi.
- Les références ne sont libérées qu'après un état terminal confirmé, comme
  auparavant. Une erreur HTTP 400/404/502 ou un timeout seuls ne débloquent
  pas un paiement incertain. Cash reste disponible après arrivée/dépose seulement.

Le défilement est ponctuel, sans timer ni animation persistante. Les rendus
ordinaires du store ne le relancent pas. Aucun polling ou appel HTTP ajouté ;
les accès existants restent dans RTK Query.

## Vérifications réalisées

- Backend : **97/97 tests réussis** dans six suites : `payments.service`,
  `wallet-topup-decline`, `wallet-topup-proof`, `flexpay.service`,
  `payment-messages` et `wallet.service`.
- Nouvelle suite `wallet-topup-decline.spec.ts` : format de refus sans ordre
  séparé, message français, statut terminal réutilisé, wallet sans crédit ni
  accès au ledger, refus rattachés correctement et contradictions rejetées,
  enveloppe de consultation en erreur, preuves positives toujours exigées.
- Mobile : **36/36 tests réussis** dans `arrivalPaymentModeRecovery`,
  `arrivalPaymentVerification`, `arrivalPaymentSubmission`, `arrivalPaymentResume`.
  Sélection directe après suppression de la référence refusée, absence de bouton
  supplémentaire, cartes bloquées pendant l'incertitude, message et retour aux
  choix après refus, aucun défilement supplémentaire sur 100 rendus ordinaires.
- TypeScript mobile : validé. TypeScript backend de production via
  `tsconfig.build.json`, sans émission ni incrémental : validé.
- Le typage backend global incluant les fichiers de tests échoue encore dans
  des fixtures non modifiées de `activity/booking-activity`, `keccel-otp`,
  `trip-requests/trip-request-privacy`, `users/legal-identity`, `users/user-gender`
  et `wallet/trip-loyalty`. Aucun échec ne concerne les nouveaux fichiers.
- ESLint ciblé mobile et deux nouveaux fichiers backend ; contrôle des diffs
  et frontières réseau. Tous les fichiers mobile modifiés restent sous 400
  lignes. L'exception préexistante `app/wallet.tsx` à 414 lignes reste hors périmètre.
  Le grand service backend existant n'est pas refactoré entièrement ici ; la
  validation extraite et sa suite restent chacune sous 400 lignes.

## Déploiement, limites et recette

Ce sont des modifications locales, non déployées. Redémarrer le backend local
ou déployer sa nouvelle version avant de recontrôler le paiement existant.
Dans le modal, « Vérifier à nouveau » relit le même ordre ; lorsque le backend
renvoie `failed`, l'app retire la référence pendante et autorise les autres modes.
Il n'est pas nécessaire de supprimer manuellement une transaction ou de forcer
son statut depuis le mobile.

Si l'ancien backend continue de renvoyer 400, le mobile conserve le verrouillage.
Si FlexPay est indisponible, une erreur réseau reste une incertitude, pas un refus.
Ce correctif ne traite pas automatiquement une réponse d'initiation perdue sans
numéro de commande récupérable, ni un format incomplet de preuve de succès.

Les tests utilisent uniquement des réponses synthétiques et repositories simulés.
Aucun paiement réel, test de production, build natif ou essai physique iOS/Android.
Recette restante : même ordre auparavant bloqué, refus reçu, autres cartes actives,
sélection d'un autre mode sans débit, validation explicite, puis veille/reprise
et fermeture. Tester aussi montant d'interruption, cash après dépose et petit
écran/clavier. Aucune garantie d'absence de crash ou de chauffe native annoncée.
