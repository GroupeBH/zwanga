# Gain par passager après dépose

## Affichage conducteur

Après une dépose confirmée par le serveur, la navigation affiche une carte
« Dépose confirmée » avec le nom du passager et le total lié à **sa réservation**.
La dernière dépose est sélectionnée ; les autres passagers déposés restent
consultables sans cumuler leurs gains dans cette carte.

Le même récapitulatif apparaît dans la fenêtre existante de confirmation manuelle,
sous l’étape Arrivée validée. Il n’est pas ajouté aux écrans passagers. Une réponse
locale en attente d’envoi ou de l’autre personne ne déclenche pas le récapitulatif.

Les lignes distinguent :

- **Gains crédités** : montant net présent dans le registre des gains.
- **À recevoir en cash** : montant remis directement par le passager, hors solde
  de revenus. La dépose n’est pas une preuve d’encaissement du cash.
- **Crédit en attente** : paiement/subvention attendu dans le registre des gains,
  mais dont le crédit n’a pas encore été enregistré.
- **Paiement électronique / en jetons attendu** : paiement pas encore confirmé.

Le total peut donc inclure des montants encore à recevoir : il ne signifie pas
que tout est disponible au retrait. Une réservation de plusieurs places reste
un seul total ; le mobile ne multiplie pas à nouveau par le nombre de places.

Exemple : 3 000 FC effectivement crédités et 2 000 FC à recevoir en cash donnent
un total de 5 000 FC pour ce passager, pas 5 000 FC disponibles dans Revenus.

## Source des montants

Nouvelle lecture authentifiée :

`GET /driver-settlements/bookings/:bookingId/revenue-summary`

Le backend vérifie que la réservation appartient à un trajet du conducteur
connecté, puis ne lit que cette réservation et ses écritures de gains. La
projection réutilise les règles du bilan du trajet, les montants persistés et
les commissions déjà enregistrées. Aucun débit, versement ou crédit n’est créé
par cette lecture.

Les gains en jetons encore impayés sont désormais explicitement distingués dans
le bilan. Un tarif enregistré à zéro reste zéro, même si le prix du trajet a
changé. Les tarifs d’interruption déjà ajustés restent inchangés.

## Performances et stabilité

- Requête via RTK Query, cache partagé entre navigation et confirmation manuelle.
- Seul le passager sélectionné est chargé dans la carte de navigation.
- Dans la fenêtre manuelle, les lectures sont suspendues tant qu’elle est fermée.
- Pas de polling supplémentaire, de suivi GPS ou de nouveau modal natif.
- Lectures suspendues hors écran/en arrière-plan ; actualisation au retour,
  à la reconnexion, via les invalidations financières et sur demande explicite.
- L’identité de réservation de la réponse doit correspondre à la sélection.
  Une réponse d’un autre passager n’est jamais affichée pendant le changement.
- En cas d’erreur : message clair et bouton Actualiser ; aucun montant inventé
  ni zéro de remplacement. Les derniers montants connus sont signalés si conservés.

## Déploiement et vérification

Déployer le backend **avant** cette version mobile. Un ancien backend sans cette
route ne pourra pas fournir le récapitulatif. Aucune migration, nouvelle variable
d’environnement ou dépendance n’est nécessaire.

Tests ciblés : `driverBookingRevenue.test.js`, `driverRevenue.test.js`,
`rideRecoveryUI.test.js`, `navigationHeaders.test.js` et les tests de navigation,
d’interruption et d’overlays. Côté backend : `driver-booking-revenue.spec.ts`,
`driver-cash-subsidy.spec.ts`, `driver-settlements.service.spec.ts` et
`bookings.service.spec.ts`.

Sur iPhone et Android réels, vérifier : dépose automatique, confirmations
manuelles dans les deux ordres, attente hors connexion, retour après veille,
plusieurs passagers successifs, paiement tardif, trajet gratuit et descente
anticipée. Les tests automatisés ne débitent aucun compte réel.

Validation du 22 septembre 2026 : 63 tests mobiles ciblés et 83 tests backend
réussis ; TypeScript mobile et backend de production, lint mobile ciblé et
frontière réseau RTK Query validés. Le contrôle global des tailles signale encore
`app/wallet.tsx` à 414 lignes, non modifié pour ce correctif. Aucun déploiement
ni essai sur appareil physique n’a été effectué pendant cette intervention.
