# Double validation et paiement unifié — 2 octobre 2026

Complément UI ultérieur : les [modales de résultat](RIDE_ACTION_RESULTS_2026_10_02.md)
ont été ajoutées après les actions. Elles ne rétablissent pas d’étape de validation
intermédiaire et ne changent pas la règle bilatérale décrite ici.

## Périmètre et décision finale

Cette intervention remplace la règle « passager seul » décrite dans
[le premier rapport d’embarquement](PASSENGER_PICKUP_2026_10_02.md).
À la demande finale de l’utilisateur, **le conducteur et le titulaire de la
réservation valident chacun l’embarquement et la dépose manuels**. La simplification
porte sur les clics, pas sur le nombre de personnes qui doivent confirmer.
Les transitions automatiques existantes restent possibles sans ces deux appuis.

Problèmes constatés dans le code et la capture fournie : sélection puis nouvelle
confirmation avant enregistrement, états d’attente ambigus, formulaire de paiement
remplacé par un autre écran de résumé avec informations et actions répétées.
Il ne s’agit pas d’une reproduction sur téléphone physique.

## Solutions appliquées

### Embarquement et dépose

- Un appui sur « Je suis à bord » ou « Je suis arrivé » enregistre la déclaration
  du passager. Pour un seul passager, les boutons conducteur enregistrent également
  directement sa propre déclaration. Avec plusieurs réservations, le conducteur
  choisit la réservation dans la liste existante puis confirme, sans écran de revue
  supplémentaire pour une réponse positive.
- Le serveur ne finalise une étape manuelle qu’avec les deux réponses positives.
  Une déclaration isolée reste en attente ; le worker peut notifier l’autre
  personne, mais ne déclenche pas le règlement final de la dépose.
- Les textes distinguent « enregistré sur ce téléphone », « votre validation
  reçue, en attente du conducteur/passager » et « votre validation est attendue ».
  La réception de la réponse de l’autre personne n’est jamais présentée comme la
  réception d’une réponse locale encore en file d’attente.
- Verrou synchrone contre les doubles appuis, indicateur d’enregistrement, erreur
  de stockage réessayable et contrôle des callbacks périmés sont conservés.
- Le lien facultatif « Vérifier les confirmations » permet toujours de consulter
  une réponse et de signaler un désaccord. Seul ce désaccord conserve une revue
  explicite : aucune modale intermédiaire n’est imposée à la confirmation positive.
- Le rappel conducteur après dépassement du point de récupération propose sa
  validation et explique que le passager confirme de son côté. Annulation et
  arrêt d’un trajet privé conservent leurs conditions existantes.
- Le rejeu d’une paire de reçus prête réutilise la même preuve, pour chacun des
  acteurs et chacune des étapes. Une seule déclaration ne peut pas être promue.
  Aucun ancien reçu n’est redaté et aucun désaccord n’est effacé.

Fichiers application : `features/ride-recovery/RideRecoveryControl.tsx`,
`rideRecoveryPresentation.ts`, `rideRecoveryModel.ts`, `rideOutboxEngine.ts` dans
ce même dossier ; `features/driver-navigation/NavigationPickupBypassModal.tsx` ;
`hooks/passenger-navigation/usePassengerNavigationNotices.ts`.
Le callback `handleConfirmBypassedPickup`, sa garde `pickup-confirm` et son
branchement dans la navigation conducteur ont été rétablis dans
`hooks/driver-navigation/useDriverPickupActions.ts`,
`hooks/driver-navigation/useDriverBookingActionGuard.ts` et
`app/trip/navigate/[id].tsx` : ces trois fichiers retrouvent leur état `HEAD`.

Fichiers backend, dans `../zwanga-backend` :
`src/ride-declarations/ride-declaration.model.ts`, `ride-declaration.policy.ts`,
`ride-declarations.service.ts` ; `src/bookings/bookings.controller.ts` et
`bookings.service.ts`.
Les anciennes routes HTTP conducteur et passager restent utilisables et passent
par les déclarations transactionnelles, avec vérification de leur rôle.
Les anciennes méthodes internes conducteur qui fabriquaient les deux validations
restent désactivées (`RIDE_DECLARATION_REQUIRED`) ; aucune route active ne les appelle.
Les effets d’une confirmation déjà finalisée sous l’ancienne règle restent pris
en charge : cette intervention ne réécrit pas les trajets passés.

### Une seule modale de paiement

- Un même composant affiche montant total, destination, mode de paiement, détails
  utiles, état du traitement puis reçu. Montant et actions dominent visuellement,
  avec séparateurs sobres et sélecteurs compacts. La compétence frontend a guidé
  cette hiérarchie utilitaire et la suppression des blocs décoratifs redondants.
- Le bas de la feuille conserve l’action principale et une seule sortie
  secondaire. Le contenu reste défilable sur petits écrans ou avec du texte
  agrandi ; cette intervention ne promet pas un formulaire complet sans défilement.
- Les trajets déjà payés ou gratuits ouvrent directement leur reçu, sans demander
  une nouvelle validation du paiement. La référence est sélectionnable ; la
  facture reste accessible si un historique correspondant est disponible.
- En espèces, « Terminer · paiement en espèces » ferme directement les
  instructions quand le mode est déjà enregistré. Il ne déclare pas que le
  conducteur a reçu l’argent. Un changement vers cash attend la réponse serveur ;
  si le montant a changé, le montant serveur reste affiché avant fermeture.
- Jetons disponibles/utilisés, complément Mobile Money, opérateur ou carte,
  numéro de paiement, reprise carte et vérification d’un paiement en attente
  restent disponibles selon le contexte. Les contrôles restent verrouillés
  pendant toute la soumission, pas seulement pendant une mutation isolée.

Fichiers : `components/PassengerArrivalPaymentCoordinator.tsx` ;
`features/arrival-payment/ArrivalPaymentFields.tsx`, `ArrivalPaymentActions.tsx`,
`ArrivalPaymentReceipt.tsx`, `buildPaymentCompletionSummary.ts`, `paymentTypes.ts` ;
`hooks/arrival-payment/useArrivalPaymentSubmission.ts` ;
`features/screen-styles/components/PassengerArrivalPaymentCoordinator/index.ts`
et `compact.styles.ts` ; `scripts/preview-arrival-payment.cjs`.

## Précautions et comportements conservés

- Une réservation groupée garde un titulaire et une déclaration par acteur et
  étape, indépendamment du nombre de places. Aucun appui ne confirme pour les
  autres réservations du trajet.
- Autorisation, KYC requis, trajet actif, réservation acceptée, borne temporelle,
  priorité des confirmations automatiques et traitement des désaccords conservés.
- La compétence Postgres a guidé la conservation de l’ordre des verrous
  **trajet puis réservation**, des effets externes après commit et des reçus
  immuables. Pas de migration, modification du schéma ou du garde SQL des désaccords.
- Files persistantes isolées par compte, reprise après perte de réponse HTTP et
  suspension en arrière-plan conservées. L’application n’invente pas de drapeaux
  finaux d’embarquement, d’arrivée ou de paiement réussi.
- Paiement anticipé déjà autorisé à proximité de la destination, interruptions,
  calcul des montants, cash reçu par le conducteur et règles de revenus inchangés.
  Une déclaration de dépose isolée ne remplace pas les conditions de règlement.
- Un paiement fournisseur en attente n’autorise pas un deuxième paiement.
  SOS, contacts, avis automatiques, facture et navigation sont conservés.

## Vérifications et résultats

**189 tests JavaScript application réussis**, aucun échec, avec :

```powershell
$arrivalChecks = rg --files tests | Where-Object { $_ -match '(rideRecovery.*|arrivalPayment.*|paymentContext|paymentRetention|nearArrivalPayment|cashReceipt|pickupProximity|passengerCountdown|passengerRideCompletion|multiPassengerNavigation|navigationHeaders|driverPickupAnalysis|passengerDriverInterruption|passengerInterruptionPreview|interruptionSettlement|notificationNavigation)\.test\.js$' }
node --test --test-concurrency=4 $arrivalChecks
```

**139 tests unitaires backend réussis dans cinq suites**, aucun échec :

```powershell
node node_modules/jest/bin/jest.js --runInBand --no-cache --runTestsByPath src/ride-declarations/ride-declaration.policy.spec.ts src/ride-declarations/ride-declarations.service.spec.ts src/bookings/boarding-detection.spec.ts src/bookings/bookings.service.spec.ts src/bookings/near-arrival-payment.spec.ts
```

Tests ajoutés/adaptés : `tests/rideRecoveryUI.test.js`, `rideRecovery.test.js`,
`pickupProximity.test.js`, `arrivalPaymentSubmission.test.js`,
`arrivalPaymentSheet.test.js` ; les deux specs de `src/ride-declarations` et
`src/bookings/bookings.service.spec.ts` côté backend. Ils couvrent les deux ordres
de validation, les états incomplets, le worker sans règlement prématuré, les
rejeux, désaccords, doubles appuis, changement de compte/écran, groupes, cash,
paiements déjà confirmés/gratuits et soumissions lentes.

Contrôles complémentaires : TypeScript application et backend sans émission
réussis ; ESLint ciblé sans erreur (cinq avertissements de dépendances de hooks
préexistants dans `usePassengerNavigationNotices.ts`, inchangés) ; frontière
réseau valide ; 979 sources contrôlées, aucune au-dessus de 400 lignes ;
`git diff --check` valide dans les deux dépôts.

L’aperçu généré avec `node scripts/preview-arrival-payment.cjs` utilise les vrais
composants via React Native Web et des données fictives. La capture navigateur
a été inspectée pour six cas : Mobile Money, jetons avec complément, espèces,
reçu, clavier simulé et texte agrandi. Les actions de bas de feuille restent
visibles dans cet aperçu ; les contenus longs sont défilables. Ce n’est pas une
validation du clavier, des polices ni du rendu natif Android/iOS.

## Livraison et limites

Livrer ensemble le contrat backend de double validation et l’application.
En particulier, ne pas garder un éventuel backend intermédiaire « passager seul ».
Aucun déploiement, changement de version, build natif, paiement réel ou migration
n’a été effectué. Aucun trajet existant n’a été modifié dans une base réelle.

Les tests utilisent des doubles de services/stockage/base : pas d’essai concurrent
sur PostgreSQL réel ni d’essai sur téléphone physique. À valider avant publication :
les deux ordres d’embarquement/dépose sur deux comptes, réseau lent et mode avion,
double appui, reprise après fermeture, accord/désaccord, automatique, clavier,
safe areas et paiement fournisseur réel en environnement de test. Aucune mesure
de fluidité, chauffe, consommation ou disparition de crash n’est revendiquée.
