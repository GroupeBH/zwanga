# Paiement mixte jetons et espèces

## 2026-10-22 — Périmètre et problème

Le paiement en jetons avec un solde insuffisant ne proposait qu'une recharge
Mobile Money. L'utilisateur demande aussi de pouvoir remettre le complément en
espèces. Le signalement « Vérification indisponible » concernait le parcours de
recharge : son correctif, documenté séparément dans le journal, est conservé.
L'occurrence exacte sur le téléphone n'a pas été reproduite à partir de la seule
capture. Le nouveau parcours espèces ne crée et ne vérifie aucune recharge.

Application et dépôt voisin `zwanga-backend` modifiés localement. Aucun
déploiement, appel à un prestataire de paiement ou accès à la base de production.

## Parcours effectivement appliqué

Après l'arrivée confirmée, le passager choisit **Jetons Zwanga**, puis le
complément **Espèces**. Le montant des jetons à débiter et le reste à remettre au
conducteur sont affichés avant validation. Le numéro Mobile Money n'est pas
demandé pour ce choix. La simple ouverture ou sélection ne débite rien.

Exemple synthétique : prix de 4 500 FC, 58 jetons valant 580 FC. La validation
débite 58 jetons et laisse **3 920 FC en espèces**. Le récapitulatif distingue
« Déjà réglé en jetons » de « À remettre au conducteur ». Le conducteur confirme
ensuite uniquement les espèces réellement reçues, avec le contrôle de montant
déjà existant. Le débit des jetons n'est jamais une preuve de remise du cash.

L'option nécessite un backend annonçant `mixedCashSupported`, un trajet terminé
avec arrivée du passager confirmée, une devise CDF, un solde de jetons positif
mais insuffisant et un trajet acceptant les deux moyens. Le complément Mobile
Money, le paiement entièrement en jetons, les espèces seules et le paiement
électronique restent disponibles selon leurs règles précédentes. Le mixte n'est
pas proposé avant l'arrivée ni pour un trajet gratuit.

## Contrat et protections financières

L'API authentifiée `POST /bookings/:id/pay-tokens-cash` reçoit le prix accepté
(`expectedAmount`), la valeur monétaire des jetons acceptée
(`expectedTokenAmount`), leur quantité (`tokenQuantity`) et la devise. Le serveur
revérifie le propriétaire, l'état du trajet, le tarif des jetons et le solde
réellement dépensable. Un tarif ou montant modifié entraîne un refus sans débit.

| Champ après succès | Sens |
| --- | --- |
| `paymentMode = cash`, `paymentStatus = not_required` | Le reliquat est à remettre en espèces, pas à collecter électroniquement. |
| `paymentAmount` | Espèces restant à remettre, 3 920 FC dans l'exemple. |
| `mixedTokenAmount`, `mixedTokenQuantity`, `mixedPaymentAt` | Part en jetons réglée et date d'enregistrement. |
| `paymentAmount + mixedTokenAmount` | Prix total dû par le passager avant répartition. |
| `grossPaymentAmount`, `zwangaSubsidyAmount` | Montant brut et subvention conservés. |

Une seule transaction PostgreSQL verrouille la réservation, débite les jetons,
enregistre la répartition, inscrit le montant dû au conducteur et ajoute sa
notification à l'outbox. Les verrous de portefeuilles sont pris dans un ordre
déterministe ; aucun appel réseau fournisseur n'a lieu dans cette transaction.
La compétence `supabase-postgres-best-practices` a guidé ces transactions courtes
et l'ordre des verrous. Une erreur comptable annule aussi le débit.

Une nouvelle soumission de la même réservation avec exactement les mêmes
montants retourne le règlement existant, y compris après réception du cash.
Une soumission différente est refusée. La répartition confirmée est immuable.
Un échec d'invalidation du cache après commit n'annule pas la réponse de succès.

Le montant déjà réglé en jetons alimente les gains électroniques du conducteur
après commission. Le cash reçu physiquement ne lui est pas crédité une seconde
fois. Une subvention déjà inscrite n'est pas recréée ; elle ne peut être étendue
que si son écriture disponible correspond exactement à la réservation d'origine.
Les fonctions et contraintes préexistantes de commission et de réception cash
ne sont pas remplacées : elles travaillent sur le reliquat.

**Parrainage inchangé, conformément au choix de l'utilisateur : seule la part
en espèces dont la réception est confirmée entre dans le calcul actuel.**
Aucune récompense supplémentaire sur les jetons n'a été ajoutée.

## Coupures, reprise et compatibilité

- Une intention contenant les montants affichés est conservée par compte et
  réservation avant la requête ; un double appui est bloqué.
- Sur timeout, erreur réseau ou résultat serveur indéterminé, elle est conservée.
  « Vérifier à nouveau » renvoie la même intention à l'API idempotente, sans
  acheter de jetons ni lancer de collecte Mobile Money. Le débit ne peut pas
  augmenter si le solde ou le prix affiché change entre-temps.
- La répartition confirmée est conservée localement sous forme d'un reçu minimal
  (identifiant et montants, sans coordonnées ni téléphone), afin qu'une ancienne
  réponse de liste ne réaffiche pas tout le prix comme cash à payer.
- Mise à jour du 23 octobre : un paiement fournisseur en attente ou réussi
  interdit le mixte ; un ancien refus/annulation confirmé ne le bloque plus.
  Une recharge encore en attente pour le passager interdit la conversion.
  Voir [la reprise Mobile Money](PAIEMENT_RECUPERATION_MOBILE_MONEY.md).
  Un trigger bloque l'insertion ultérieure d'un paiement électronique de cette
  réservation après enregistrement du mixte.
- Sans le nouveau backend, le champ de capacité manque : l'option espèces du
  complément est masquée et les parcours antérieurs sont conservés.

## Fichiers concernés

Mobile :

- `hooks/arrival-payment/useMixedCashPayment.ts` : choix, intention, soumission
  et reprise ; `useArrivalPaymentState.ts`, `useBookingPaymentMode.ts` et
  `useArrivalPaymentSubmission.ts` : intégration sans modifier le parcours MM.
- `components/PassengerArrivalPaymentCoordinator.tsx`,
  `features/arrival-payment/ArrivalPaymentFields.tsx`, `ArrivalPaymentReceipt.tsx`,
  `buildPaymentCompletionSummary.ts` et
  `features/driver-payments/ConfirmCashReceipt.tsx` : choix et montants lisibles.
- `features/arrival-payment/mixedCashReceipt.ts`, `paymentTypes.ts`,
  `paymentRetention.ts` : conservation d'une intention et d'un reçu confirmé.
- `types/trips.ts`, `store/api/booking/{serverTypes.ts,bookingMapper.ts,createBooking.endpoints.ts}`,
  `store/api/bookingApi.ts`, `store/api/driverFinanceApi.ts` : contrat API additif.
- `tests/mixedCashPayment.test.js`, `tests/arrivalPaymentSheet.test.js` : tests
  de non-régression et adaptation des doublures du coordinateur.

Backend :

- `src/bookings/mixed-cash-payment.{controller,service}.ts`,
  `dto/mixed-cash-payment.dto.ts`, `bookings.module.ts` : nouvel endpoint.
- `src/bookings/entities/booking.entity.ts`, `bookings.service.ts` : champs et
  préservation du reliquat ; les autres moyens ne peuvent pas écraser le mixte.
- `src/driver-finance/driver-finance.service.ts` et
  `src/driver-settlements/driver-settlements.service.ts` : capacité et gains.
- `src/database/migrations/1780000089000-MixedTokensCash.ts` et `index.ts` :
  colonnes, contraintes et triggers additifs.
- `src/bookings/mixed-cash-payment-postgres.spec.ts`,
  `test/mixed-cash-commission-postgres.ts`,
  `src/database/driver-finance-postgres.spec.ts` : tests PostgreSQL isolés.

## Vérifications réalisées et limites

- **61 tests mobiles réussis** : mixte, reprise, soumission, vérification,
  changement de mode, fenêtre de paiement et réception du cash. Ils couvrent
  le double appui, la réponse perdue, les montants figés, les données périmées et
  l'absence de requête financière à l'ouverture. Ce sont des tests JavaScript,
  pas des essais Android/iOS.
- **117 tests backend de régression réussis** sur réception cash, paiement
  proche de l'arrivée, gains conducteur, subventions, revenus, portefeuille et
  refus de recharge. Deux suites supplémentaires financement/parrainage passent
  également, soit **16 tests** ; aucune règle de parrainage n'a changé.
- **113 tests réussis sur PostgreSQL temporaire réel**, deux suites, trois tests
  optionnels préexistants ignorés. Couverture : concurrence de deux règlements,
  retour arrière transactionnel, montant reçu, subvention unique, commission
  cash recalculée de 225 à 196 FC et remboursement unique de 2,9 jetons,
  interverrouillage avec paiement fournisseur, contraintes et rollback de
  migration. Toutes les données sont synthétiques ; aucune base applicative
  n'est utilisée. La suite mixte de sept tests a aussi été rejouée séparément.
- TypeScript mobile et build backend sans émission réussis. Lint ciblé mobile
  et des six nouveaux fichiers backend réussi ; contrôles de taille des sources
  et `git diff --check` réussis.
  Le lint global des deux projets n'est pas déclaré exempt d'erreurs.

La migration et le backend doivent être livrés et validés en environnement de
test avant d'activer le parcours mobile. La migration `1780000089000` n'a été
appliquée que dans les clusters temporaires de test. Son rollback refuse de
supprimer une répartition déjà utilisée : après un premier paiement réel,
préférer une correction en avant pour conserver la preuve financière.

Limites conservatrices : CDF uniquement ; contrôles de capacité cash existants
conservés ; tout paiement fournisseur non résolu exige d'abord une réconciliation ;
une écriture de gain historique incompatible est refusée, jamais réécrite pour
forcer le débit. La notification est enregistrée transactionnellement, mais sa
livraison au téléphone n'a pas été testée ici. Aucun paiement Mobile Money réel,
essai sur téléphone, test de charge ou mesure de mémoire/chauffe réalisé.

Recette avant livraison : confirmer l'arrivée sur deux comptes de test, payer
58 jetons + 3 920 FC, couper le réseau pendant la réponse et reprendre, rouvrir
l'application, puis confirmer les 3 920 FC côté conducteur. Vérifier les soldes,
la commission, le parrainage cash uniquement et le reçu. Rejouer ensuite espèces
seules, jetons seuls, complément MM, subvention et tarif modifié. Contrôler aussi
la lisibilité sur petit écran et avec caractères agrandis.
