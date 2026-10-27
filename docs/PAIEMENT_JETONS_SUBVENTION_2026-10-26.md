# Paiement après bonus ou descente anticipée — 26 octobre 2026

## Problème et diagnostic

Un paiement en jetons à l'arrivée affichait une erreur interne de cohérence du
gain conducteur. Le signalement concerne un montant passager réduit, après une
descente anticipée ou avec le bonus de premier trajet. Aucun compte réel ni
enregistrement de production n'a été consulté pour cette intervention.

Le code permet de créditer la subvention au conducteur dès l'arrivée du
passager lorsque la réservation est encore en paiement espèces. Ce crédit est
enregistré dans l'unique gain de cette réservation. Si le passager choisit
ensuite les jetons, le serveur comparait ce crédit de subvention au gain complet
attendu après paiement : il rejetait une transition pourtant légitime.

Le fait que le montant passager soit inférieur au tarif brut ne constitue donc
pas, à lui seul, une erreur. Le tarif arrêté pour une descente anticipée doit
également être conservé, même si le trajet du conducteur continue.

Exemple **synthétique**, avec la politique de commission actuelle :

| Élément | Montant |
| --- | ---: |
| Tarif brut | 2 000 FC |
| Bonus de premier trajet, déjà crédité au conducteur | 1 200 FC |
| Part du passager | 800 FC, soit 80 jetons |
| Commission de 5 % sur la part du passager | 40 FC |
| Gain final du conducteur | 1 960 FC |
| Ajout au gain existant | 760 FC |

Cet exemple n'est pas une reconstitution du compte ayant envoyé la capture.
Les anciennes réservations conservent leur propre politique de commission.

## Solution appliquée

### Backend voisin `zwanga-backend`

- `src/driver-settlements/paid-cash-subsidy.ts` : ajout d'une transition limitée
  à un crédit correspondant exactement à la subvention, sans commission,
  disponible, et appartenant à la même réservation, au même passager, au même
  conducteur, au même trajet et à la même devise. Le paiement doit être confirmé
  et la réservation terminée. Les paiements mixtes, espèces déjà reçues et replis
  vers les espèces sont exclus de cette transition.
- `src/driver-settlements/driver-settlements.service.ts` : verrouillage du gain
  pendant le règlement transactionnel, puis mise à jour du **même** enregistrement
  avec le montant complet déjà calculé par les règles existantes. Identifiant et
  date de disponibilité sont conservés ; aucun second crédit de bonus n'est créé.
- Pour une finalisation électronique arrivant après le crédit de subvention,
  relecture de la réservation sous verrou dans une transaction, avant de relire
  et verrouiller son gain. L'état transmis par l'appelant ne remplace pas l'état
  serveur courant.
- Les incohérences véritables restent bloquantes. Elles renvoient le code
  `DRIVER_EARNING_RECONCILIATION_REQUIRED` et un message compréhensible, sans
  identifiant interne dans le message présenté au passager.

Le débit des jetons, le paiement confirmé et le gain conducteur restent dans la
transaction existante de `capturePointsPaymentForBooking`. Si la vérification
comptable échoue, le débit et la confirmation sont annulés ensemble. Aucun appel
au fournisseur de paiement ni notification externe n'est ajouté sous verrou.

### Application

- `utils/errorHelpers.ts` traduit le nouveau code ainsi que l'ancien message du
  serveur. L'utilisateur reçoit une instruction d'actualisation et de contact
  de l'assistance en cas de persistance, sans identifiant de réservation.
- Le message ne prétend pas qu'aucun débit électronique n'a eu lieu et ne pousse
  pas à payer une seconde fois par un autre moyen.
- `tests/earningPaymentError.test.js` couvre les deux formats d'erreur et conserve
  le message de solde de jetons insuffisant.

## Comportements conservés et protections

- Prix négocié ou arrêté lors de la descente anticipée, montant passager,
  subvention, conversion en jetons et politiques historiques de commission.
- Paiement à l'arrivée du passager alors que le trajet conducteur est encore actif.
- Une seule écriture de débit et un seul gain conducteur en cas de répétitions
  simultanées. Le gain n'est jamais réduit par cette nouvelle transition.
- Écritures annulées ou déjà marquées payées non réactivées. Aucun rapprochement
  automatique d'un montant ou d'un propriétaire incohérent.
- Retraits soustraits séparément du total des gains, fonctionnement des espèces,
  du paiement mixte et du parrainage inchangés.
- Aucun changement de schéma, aucune migration, aucune modification native.

## Vérifications réalisées

| Vérification | Résultat réel |
| --- | --- |
| Contrôle global application `node scripts/check-release.cjs` | Code 0 : TypeScript, ESLint, frontières réseau, taille des sources et parité native valides ; 2 715 tests réussis, zéro échec, un test Ruby ignoré sur Windows |
| Tests backend ciblés, 13 suites Jest | 211 tests réussis, zéro échec |
| PostgreSQL temporaire local, deux suites | 17 tests réussis, zéro échec, aucune suite ignorée |
| TypeScript backend de production : `tsc -p tsconfig.build.json --noEmit --incremental false` | Code 0 |
| ESLint des trois nouveaux fichiers backend | Code 0 après typage explicite des doubles de test |
| TypeScript backend incluant toutes les spécifications | En échec dans des fichiers de tests non modifiés ; aucun diagnostic dans les fichiers du correctif |
| `git diff --check` dans les deux dépôts | Réussi |

Les suites PostgreSQL sont
`src/driver-settlements/paid-cash-subsidy-postgres.spec.ts` et
`src/bookings/mixed-cash-payment-postgres.spec.ts`. Elles créent des clusters
temporaires accessibles uniquement sur la boucle locale, avec des comptes
synthétiques, puis les arrêtent et les suppriment. Elles n'utilisent pas la
configuration applicative ni la base de production.

Les six nouveaux essais PostgreSQL vérifient : bonus de premier trajet,
descente anticipée avec bonus, descente anticipée sans bonus, trois règlements
concurrents, annulation atomique d'un règlement incohérent, et finalisations
électroniques concurrentes. Les onze essais existants de paiement mixte passent
également, dont la conservation d'une subvention déjà créditée.

Les tests unitaires `paid-cash-subsidy.spec.ts` couvrent aussi les identités,
devises et montants discordants, les états annulés/payés, les espèces déjà reçues,
le paiement mixte et les anciennes politiques de commission. Les autres suites
exécutées concernent les règlements conducteur, subventions espèces, résumés et
revenus conducteur, récupération de subventions, réservations, interruptions,
reçus espèces, portefeuille et bonus d'accueil.

Au premier essai, PostgreSQL ne pouvait pas démarrer dans le bac à sable ; les
tests ont ensuite été exécutés avec autorisation sur les clusters locaux isolés.
Deux assertions ont été adaptées au retour des nombres décimaux sous forme de
chaînes par PostgreSQL, sans changer les montants attendus ni la logique métier.
Après mise au propre du typage des tests, les deux nouvelles suites ont été
rejouées : 27 tests réussis, dont six sur PostgreSQL réel isolé. Ce passage
recouvre les tests déjà comptabilisés ci-dessus ; il ne s'y ajoute pas.

## Déploiement et limites

Le correctif est préparé dans les deux dépôts, **sans déploiement**. Le backend
doit être déployé pour débloquer cette transition de paiement ; la modification
mobile seule améliore le message mais ne corrige pas le serveur.

Aucune réparation globale d'écritures historiques n'est effectuée. Une
réservation présentant réellement un gain incohérent nécessite un contrôle
comptable. La cause exacte de chaque compte affecté n'est pas certifiée sans
inspection de ses données autorisée séparément.

Aucun paiement réel Mobile Money, essai sur appareil, build iOS/Android ni
mesure de chauffe ou de crash n'a été réalisé. Après déploiement sur un
environnement de test, vérifier sur téléphone le paiement en jetons après un
premier trajet subventionné et après une descente anticipée, ainsi que le solde,
le reçu et les gains affichés après réouverture.
