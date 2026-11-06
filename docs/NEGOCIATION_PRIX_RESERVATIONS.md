# Proposition de prix pour une réservation — 5 novembre 2026

## Périmètre et comportement

Le passager peut choisir « Proposer mon prix » dans la première étape d'une réservation d'un trajet publié. Il saisit un montant entier en FC **par place**, inférieur au tarif affiché. Le total suit le nombre de places. Le récapitulatif précise que le conducteur doit accepter ce prix et le bouton devient « Envoyer mon prix ». « Garder le prix affiché » rétablit la réservation habituelle.

Le conducteur voit le total proposé dans la gestion du trajet ou le panneau de réservation de sa navigation, avec « Accepter ce prix » et « Refuser ». L'accord est explicite et ne modifie ni le prix public du trajet ni les réservations des autres passagers. Le refus permet de revenir au parcours existant de nouvelle réservation. Cette livraison n'ajoute pas d'enchères successives sur une même réservation : les contre-propositions des demandes privées restent un flux distinct.

Aucun paiement n'est déclenché par la proposition ou l'acceptation. Le règlement à l'arrivée, les paiements mixtes, la réduction de bienvenue, la capacité, les contrôles KYC et les règles de prise en charge restent en place. Le montant passager et le montant brut conducteur restent distincts. Les vues de réservation ne recalculent plus systématiquement le montant à partir du prix public.

## Mobile

- `features/trip-detail/BookingPriceProposalField.tsx` : champ facultatif et retour au prix affiché, sans nouveau modal ; composition intégrée à l'interface existante suivant le guide `frontend-skill`.
- `features/trip-detail/bookingPriceProposal.ts` : validation, total proposé, total passager (y compris jetons + espèces) et consentement explicite à l'acceptation.
- `hooks/trip-detail/useTripDetailBookingState.ts`, `useTripBookingWizard.ts`, `useTripBookingPricing.ts`, `useTripBookingSubmission.ts`, `useTripDetailController.ts` : état local, validation avant la suite et avant l'envoi, estimation, remise à zéro après réussite/annulation/changement de trajet. Les sélections de carte ne réinitialisent pas la proposition.
- `app/trip/[id].tsx`, `features/trip-detail/TripBookingModal.tsx`, `TripBookingSteps.tsx`, `TripDetailActionsFooter.tsx` : formulaire et montant de « Ma réservation ».
- `features/bookings/BookingListCard.tsx`, `features/manage-trip/ManageTripBookings.tsx`, `features/driver-navigation/DriverPendingBookingPrompt.tsx` : montants et actions explicites.
- `hooks/manage-trip/useManageTripBookingActions.ts`, `hooks/driver-navigation/useDriverBookingActions.ts`, `store/api/bookingApi.ts` : envoi du montant accepté, conservation des verrous anti-double-appui, contrôles de session et réconciliation après coupure réseau.
- `types/trips.ts`, `store/api/booking/{serverTypes,bookingMapper,createBooking.endpoints}.ts` : contrat `proposedPricePerSeat` et montant brut serveur. Les appels ordinaires d'acceptation par identifiant seul restent pris en charge.
- `features/notifications/driverNotificationCard.ts`, `services/driverNotificationResponse.ts` : la carte JavaScript d'une proposition ouvre « Voir le prix proposé » ; une action native ancienne ne peut pas accepter un tarif non confirmé. Son refus reste possible ; un conflit de consentement mène aux détails pour vérifier le prix.

## Backend `zwanga-backend`

- `src/bookings/booking-price-proposal.ts` : proposition bornée, tarif par place inférieur au tarif publié, exclusions des trajets gratuits/privés et des montants non entiers. Contrôle du montant explicitement accepté et protection contre le changement d'un tarif déjà engagé en paiement ou ajusté.
- `src/bookings/dto/booking.dto.ts`, `bookings.controller.ts` : `proposedPricePerSeat` à la création ; `acceptedPricePerSeat` à l'acceptation ou au changement de statut. DTO validés côté serveur.
- `src/bookings/entities/booking.entity.ts` : proposition nullable, immuable via les mises à jour ORM.
- `src/bookings/bookings.service.ts` : la proposition est conservée séparément du tarif initial. À l'accord du propriétaire du trajet, le montant brut et la réduction existante sont recalculés dans la transaction qui réserve les places. Les répétitions de décision ne reprennent pas de places et ne créent pas une seconde réponse. Aucun appel réseau externe n'a été ajouté dans la transaction.
- `src/notifications/transactional-notifications.subscriber.ts` : même événement `new_booking`, même destinataire et même outbox durable ; le prix proposé est annoncé comme un budget. Pas de nouveau transport ni de nouvelle catégorie de sonnerie.
- `src/database/migrations/1780000113000-BookingPriceProposal.ts`, référencée dans `index.ts` : une colonne `integer NULL` avec contrainte positive, sans reprise des anciennes réservations. Le retour arrière refuse de supprimer la colonne tant qu'une proposition reste en attente ; les montants financiers convenus sont conservés.

Le guide PostgreSQL a servi à limiter le changement de schéma à une colonne nullable et à conserver l'accord, les places et la notification dans la même transaction.

## Vérifications réalisées

- Mobile : première passe de **68 tests**, puis passe de **72 tests**, toutes deux réussies (périmètres partiellement communs, ne pas additionner ces nombres comme des cas distincts). Couverture : saisie, prix par place/total, soumission, consentement conducteur, paiements mixtes affichés, refus, double-appui, changement de session, interruptions réseau, navigation, actions de notification et bandeau persistant.
- Fichiers : `tests/{bookingPriceProposal,bookingLocationPermission,pendingBookingContact,manageBookingEntryReliability,driverPendingBookingLayout,driverNotifications,manageTripCancellation,driverActionsReadIsolation,driverNotificationActions,requestAcceptanceSound,bookingsBackNavigation,driverBookingAlertBanner}.test.js`.
- Backend : **121 tests** réussis dans `booking-price-proposal.spec.ts`, `booking-response-outbox.spec.ts`, `bookings.service.spec.ts`, `transactional-notifications.subscriber.spec.ts`. L'échec initial d'une simulation incomplète du constructeur a été corrigé avant relance ; la réduction de bienvenue est testée avec le code réel de calcul.
- PostgreSQL/PostGIS isolé : **20 tests** réussis dans `booking-financial-consistency-postgres.spec.ts`, dont trois nouveaux scénarios pour les propositions. Migration réellement exécutée dans une base jetable sur loopback, concurrence réelle de trois acceptations, une seule réponse durable et une seule consommation de places, rollback de capacité insuffisante, refus d'un prix nul et refus d'un retour arrière avec proposition en attente. La première tentative de démarrage de la base de test n'a pas abouti ; la relance autorisée hors restrictions a réussi. Base temporaire arrêtée et supprimée par le harnais, sans données applicatives.
- Contrôles : TypeScript mobile et backend (configuration de build, sans émission), ESLint mobile ciblé, frontière réseau RTK Query, limite des sources (1 286 sources, aucun dépassement de 400 lignes), diffs des deux dépôts sans erreur d'espacement.

## Livraison et limites

1. Exécuter la migration backend puis livrer le backend avant la version mobile proposant ce prix. Rien n'a été déployé ni migré en production pendant cette intervention.
2. Un ancien mobile conducteur peut toujours traiter les réservations ordinaires. Pour une proposition, il doit utiliser la nouvelle interface : un appel d'acceptation sans consentement au montant retourne `BOOKING_PRICE_CONFIRMATION_REQUIRED`, sans modifier la réservation.
3. Les surfaces natives anciennes peuvent encore afficher « Accepter » ; le serveur empêche leur acceptation aveugle et le parcours ouvre les détails. Les fichiers natifs n'ont pas été changés. La carte générée en JavaScript affiche « Voir le prix proposé ».
4. Les validations natives sont simulées dans les tests JavaScript. Pas d'essai physique Android/iPhone, de paiement Mobile Money, SMS ou push réel. La durée du bandeau flottant hors application reste contrôlée par Android/iOS ; cette fonctionnalité ne garantit pas sa visibilité permanente.
5. Pas de modification des secrets, de `.env`, des paramètres AWS, ni de la règle financière de parrainage.
