# Paiement : récupération après réponse perdue

> Évolution du 23 octobre : un **complément d’achat de jetons** peut désormais
> être abandonné pour le règlement du trajet au profit du cash, même sans résultat
> définitif de la recharge. La recharge reste réconciliable dans le portefeuille.
> Voir [la bascule sécurisée](PAIEMENT_BASCULE_JETONS_ESPECES_2026-10-23.md).
> Les restrictions historiques ci-dessous restent applicables aux collectes
> électroniques directement affectées au trajet.

## 2026-10-23 — Problème et périmètre

Le passager voyait un long formulaire désactivé, avec « Vérification
indisponible », sans comprendre quelle action entreprendre. Les chemins
concernés sont le paiement électronique du trajet et le complément Mobile
Money d'un paiement en jetons. L'utilisateur a autorisé les modifications
du dépôt voisin `zwanga-backend`, sans déploiement.

Constats dans le code, distincts d'une reproduction sur téléphone :

- Une reprise de recharge idempotente pouvait renvoyer son ancien état sans
  relire le résultat de l'opérateur.
- Une réponse perdue avant réception de la référence laissait une intention
  locale non résolue. L'absence de transaction lors d'une simple lecture ne
  suffisait pas : la requête initiale pouvait encore arriver au serveur.
- Le service mixte refusait tout ancien paiement fournisseur, même définitivement
  échoué. Le changement de mode électronique ne vérifiait pas systématiquement
  sa transaction avant d'effacer les références.
- Un ancien callback de refus pouvait rétablir le mode électronique après
  un choix explicite des espèces ou un règlement en jetons.

## Parcours appliqué

Une fiche courte donne le montant, la destination et une action principale.
Pendant l'attente : « Vérifier mon paiement », un accès à l'aide et une croix
de fermeture toujours disponible. La correction UX du 23 octobre ci-dessous
retire « Changer de paiement », qui ne faisait que relancer la récupération et
laissait croire qu'un autre mode était déjà disponible. Vérifier ne signifie
pas annuler un débit chez l'opérateur.

Après un refus confirmé, le bouton principal devient « Payer [montant] en
espèces » lorsque l'arrivée et les moyens acceptés/disponibles le permettent.
Le choix est enregistré directement au serveur ; il ne simule pas une remise
d'argent. La confirmation des espèces reçues reste une action du conducteur.
« Autre moyen de paiement » rouvre le choix habituel, notamment jetons + espèces.
Un paiement par carte déjà commencé garde son lien de reprise.

Un résultat inconnu, une erreur réseau, une réponse HTTP 404 ou un stockage
indisponible ne prouvent jamais un refus. La fiche reste fermable et propose
de réessayer ou de demander de l'aide. Une ancienne explication d'attente
ne remplace pas le message d'un refus reçu ensuite.

Fichiers mobiles :

- `features/arrival-payment/ArrivalPaymentRecovery.tsx` : fiche compacte,
  actions stables et montant explicite, sans nouvelle animation.
- `components/PassengerArrivalPaymentCoordinator.tsx` : remplacement du
  formulaire grisé, maintien des reçus, interruptions et reprise carte.
- `hooks/arrival-payment/useArrivalPaymentRecovery.ts` : récupération explicite,
  protection des doubles appuis et des réponses d'un autre compte/trajet.
  Le suivi automatique est suspendu pendant cette récupération manuelle.
- `hooks/arrival-payment/useArrivalPaymentSubmission.ts` : action espèces
  réutilisant les contrôles existants et un état occupé jusqu'à la fin réelle.
- `features/wallet/topUpIntent.ts` et `store/api/walletApi.ts` : reprise de la
  clé et des paramètres originaux ; persistance de la référence retrouvée
  avant de confier le suivi au contrôle par numéro de transaction.

## Réconciliation serveur

`POST /wallet/topups/recover` est authentifié, limité à 20 appels/minute et
reçoit `idempotencyKey`, `amount` en jetons, `method`, éventuellement `phone`.
L'identité provient de la session, jamais du corps envoyé par le client.

- Transaction existante : contrôle du propriétaire, du type et des paramètres
  originaux ; conservation du devis historique. Si une référence en attente
  existe, le résultat est relu via le contrôle prestataire existant.
- Transaction absente : réservation de la référence originale en `CANCELLED`.
  L'index unique existant départage cette réservation et une initiation tardive.
  Si la récupération gagne, l'initiation tardive ne déclenche pas de débit ;
  si l'initiation gagne, son paiement reste en attente, sans annulation fictive.
- Succès : le crédit portefeuille vérifié/idempotent existant est appliqué,
  puis le mobile reprend le règlement en jetons. Un échec de cette dernière
  étape conserve le verrou, sans proposer un second règlement en espèces.
- Aucun appel prestataire n'est exécuté sous un verrou de base dans ce nouveau
  mécanisme. La récupération ne lance aucune nouvelle collecte Mobile Money.

Fichiers serveur : `src/payments/topup-recovery.ts`, `payments.service.ts`,
`src/wallet/dto/recover-topup.dto.ts`, `wallet.controller.ts`, `wallet.service.ts`.
Le rejeu de l'initiation idempotente vérifie désormais la transaction existante,
sans deuxième initiation. Le service wallet applique les preuves de crédit
et la déduplication existantes, y compris lors de ce rejeu.

`src/bookings/bookings.service.ts` vérifie la transaction électronique avant
un changement de mode ; attente/inconnu/succès empêchent de l'écraser. Un refus
tardif ne rétablit plus le mode électronique sur un choix espèces/jetons.
`mixed-cash-payment.service.ts` n'interdit plus le mixte pour un ancien paiement
`FAILED` ou `CANCELLED`. Les paiements en attente/réussis et recharges en attente
continuent de le bloquer. Cette règle remplace la restriction plus large du
22 octobre ; ce n'est pas une refonte de toutes les courses financières possibles.

Conservés : montants et arrivées validés côté serveur, absence de double débit
de jetons sur reprise, paiement confirmé non modifiable, confirmation cash
conducteur, reçu mixte, subvention et parrainage calculé sur les espèces uniquement.

## Vérifications réalisées et limites

- **95 tests mobiles ciblés réussis** : suites `arrivalPayment*.test.js`,
  `walletQueryReliability`, `topUpIntent`, `mixedCashPayment`, `paymentStorageRecovery`.
  Couverture des choix, reprise sans nouvelle initiation, double appui,
  statut inconnu, ancienne API, succès à terminer en jetons, réponses tardives,
  stockage et corrélation retrouvée. Ce sont des tests JavaScript, pas des essais
  UI natifs.
- **158 tests unitaires/services backend réussis** : `payments.service`,
  `topup-payment-claim`, `wallet.service`, `bookings.service`, `topup-recovery`,
  `booking-payment-recovery` (dépendances simulées).
- **11 tests PostgreSQL locaux réussis** dans `mixed-cash-payment-postgres` :
  transaction mixte, déduplication, rollback, refus/cancel antérieur autorisé,
  arbitrage réel de l'index unique entre récupération et initiation tardive.
  Cluster temporaire neuf, boucle locale, comptes synthétiques, transports
  simulés, aucun chargement de `.env` ni connexion à la production. Le démarrage
  était interdit dans le sandbox ; l'exécution autorisée hors sandbox a réussi.
- TypeScript mobile et backend avec `tsconfig.build.json` sans émission
  réussis ; lint ciblé mobile et deux nouveaux fichiers de production backend,
  frontière réseau, limite de taille des sources et `git diff --check` contrôlés.
  Le TypeScript global backend incluant toutes les anciennes specs reste en
  erreur sur d'autres suites ; aucun nettoyage de masse ni certification de
  son lint global. Aucune mesure de chauffe, de mémoire ou de performance native.

## Livraison et recette restante

1. Livrer le backend en environnement de test avant le mobile. Aucun changement
   de schéma n'est nécessaire pour cet endpoint ; la migration mixte antérieure
   reste à appliquer si absente. Elle n'a été exercée ici qu'en base jetable.
2. Tester sur Android et iOS : refus Mobile Money puis espèces, complément
   échoué puis jetons + espèces, réponse perdue puis réouverture, double appui,
   paiement toujours en attente, paiement déjà réussi et reprise de carte.
3. Vérifier les deux comptes passager/conducteur, les reçus, la confirmation
   cash et les écritures comptables. Tester petit écran et grandes polices.

Sans cet endpoint (ancienne API), l'application conserve le verrou et propose
l'aide ; elle ne se rabat pas sur une nouvelle demande de débit. Une collecte
déjà envoyée mais toujours sans résultat/référence exploitable exige encore
une réconciliation prestataire/support. Elle n'est pas annulée par un délai
arbitraire. Aucune garantie d'absence de double paiement sur tout le système
ni de disparition de crash natif n'est déduite de ces tests.

## 2026-10-23 — Correction de la fenêtre repliée et des actions ambiguës

La capture transmise montre un fond assombri et seulement le bas d'un bouton
« Un instant… ». Dans le code, le panneau de récupération utilisait `flex: 1`
alors que la feuille parente avait uniquement un `maxHeight`, sans hauteur
définie. Cette combinaison permet un effondrement du contenu flexible ; les
anciens tests de logique ne validaient pas sa géométrie native.

Solutions appliquées :

- `components/PassengerArrivalPaymentCoordinator.tsx` : hauteur explicite de
  82 % du conteneur, plafonnée à 540 points, uniquement pour la récupération.
  Les reçus, le choix initial de paiement et les interruptions gardent leur
  disposition. Une vérification en pause transmet désormais son vrai message.
- `features/arrival-payment/ArrivalPaymentRecovery.tsx` : en-tête fixe avec
  fermeture de 44 points, montant/destination, état compréhensible et une action
  principale. Le contenu et les actions partagent un seul défilement pour les
  petits écrans/grandes polices. Aucun empilement de modals ni animation ajouté.
- « Un instant… » devient « Vérification du paiement… » ou « Passage aux
  espèces… ». Un enregistrement espèces ne présente plus un titre d'échec.
  Le bouton trompeur de changement pendant l'attente est retiré. Après refus
  confirmé, espèces et autres modes restent accessibles selon le serveur.
- La lecture des moyens disponibles n'est plus demandée depuis cette fiche
  tant que le paiement est indéterminé ou avant l'arrivée.
- `tests/arrivalPaymentSheet.test.js` et `tests/arrivalPaymentRecoveryUX.test.js` :
  garde de hauteur, priorité des interruptions, fermeture pendant le chargement,
  message de pause, absence de fausse promesse espèces et accès par défilement.
- `scripts/preview-arrival-payment.cjs` : aperçu local des composants réels via
  React Native Web, données fictives, aucun appel API. Il utilise un navigateur
  Chromium/Edge local sans fenêtre, un profil temporaire et une émulation exacte
  du viewport. Les icônes sont remplacées par des symboles de test.

Précautions conservées : références de paiement, protection des doubles appuis,
aucun déblocage cash sur timeout/réponse inconnue, décision financière serveur,
remise d'espèces confirmée par le conducteur. Fermer ne supprime pas la tentative.
Aucun fichier backend ou natif modifié pour cette correction d'affichage.

Vérifications de cette correction : **103 tests ciblés réussis**, puis les
10 tests de fiche/récupération repassés après le plafonnement de hauteur ;
TypeScript sans émission, ESLint ciblé, taille des sources, frontière réseau
et `git diff --check` réussis. Les cinq aperçus navigateur passent : attente,
vérification et espèces à 390 × 844 ; 320 × 568 avec texte à 150 % ; paysage
844 × 390. À taille normale les actions sont visibles sans défilement ; dans
les deux formats contraints elles sont atteignables par défilement, avec titre
et fermeture visibles. Captures normales inspectées visuellement.

Limites : ce rendu utilise le moteur web, pas Yoga/Android/iOS. Un premier essai
de capture par taille de fenêtre était tronqué par Edge ; il a été remplacé
par l'émulation du viewport avant de valider ces résultats. Aucun paiement réel,
déploiement, build natif ni test sur téléphone physique. La suite globale du
projet n'a pas été relancée pour cette correction ciblée. Il reste à vérifier
la feuille réelle sur Android/iOS, retour arrière, rotation et grandes polices.
