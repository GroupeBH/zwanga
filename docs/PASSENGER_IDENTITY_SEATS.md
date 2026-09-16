# Identité passager et nombre de places

Règle vérifiée dans `zwanga-backend` : `bookings.service.ts` et
`trip-requests.service.ts` utilisent `MAX_SEATS_WITHOUT_APPROVED_KYC = 2`.

- 1 ou 2 places : pas de vérification supplémentaire, sauf exigence du conducteur.
- Dès 3 places : identité approuvée nécessaire, quel que soit le rôle du compte.
- Réservation : le nombre de places restantes reste la limite effective.
- Demande / modification : moto à deux roues limitée à 2 places, trois roues à 3.
  Pas de plafond arbitraire par type pour une voiture, conformément au backend.
- Les contrôles du serveur restent autoritaires. Un refus `PASSENGER_KYC_REQUIRED`
  avec `reason: extra_seats` ouvre le parcours passager même si le cache local
  indiquait une vérification approuvée.

L'application partage cette validation dans `utils/passengerSeats.ts`. Les
composants utilisent le contexte d'identité existant et RTK Query, sans nouvelle
requête par changement de compteur. L'estimation des tarifs garde son debounce.
Les brouillons de demande restent dans Redux Toolkit.

L'utilisateur peut choisir son nombre de places avant de vérifier son identité ;
l'envoi est bloqué, pas le choix. Le texte explique la condition dès 3 places et
propose « Vérifier mon identité ». Les modals de réservation / modification se
ferment avant cette navigation puis se rouvrent au retour sans effacer la saisie.

## Profil

« Devenir conducteur » est une action distincte de « Vérifier mon identité ».
Seul le parcours conducteur demande un véhicule et peut activer le rôle conducteur.
Le profil passager ne présente plus le véhicule ou l'abonnement conducteur comme
des éléments manquants de sa vérification. Les noms techniques API restent inchangés,
mais l'interface parle de vérification de l'identité.

## Validation

Tests : `npm run test:trip-request` et `npm run test:profile`.
Sur iOS / Android : vérifier un passager sans véhicule, réserver puis demander 3–5
places, modifier une demande, revenir d'une vérification, vérifier la limite des
motos et d'un trajet presque complet, puis lancer volontairement le parcours
« Devenir conducteur ». Aucun paiement ou changement de rôle réel n'est effectué
par les tests unitaires.
