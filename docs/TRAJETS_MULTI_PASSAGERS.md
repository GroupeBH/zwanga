# Trajets avec plusieurs réservations et réservations de groupe

Date : 23 septembre 2026. Périmètre : navigation conducteur/passager,
confirmations d'étapes, interruptions, notifications et paiement à l'arrivée.

## Règle métier : une réservation n'est pas une personne

Le titulaire est le compte qui a effectué la réservation (`passengerId`).
Les actions restent identifiées par `bookingId`, avec le `tripId` correspondant.
Le nombre de places sert au compteur de personnes transportées ; il ne crée
ni comptes accompagnants, ni validations, ni paiements supplémentaires.

| Exemple | Personnes transportées | Réponses attendues côté passager | Paiements |
| --- | --- | --- | --- |
| Une réservation de trois places | 3 | Une réponse du titulaire pour chaque étape | Un règlement de la réservation |
| Une réservation de trois places et une de deux places | 5 | Deux titulaires répondent indépendamment | Deux règlements indépendants |

L'embarquement et la dépose manuels conservent la confirmation des deux parties :
le conducteur et le titulaire. Les accompagnants du titulaire n'ont pas à
confirmer individuellement. Une demande de descente anticipée concerne toutes
les places de cette réservation, pas les autres réservations du trajet.
La confirmation de réception du cash reste une action explicite du conducteur.

Les montants de paiement et de gain déjà calculés pour la réservation ne sont
pas multipliés une deuxième fois par le nombre de places dans ces écrans.

## Problèmes constatés et solutions appliquées

### 1. Compteurs et identité de réservation

Le compteur conducteur regroupait les étapes par identifiant de passager et
comptait les comptes, sans tenir compte des places réservées. Il pouvait donc
afficher une seule personne pour une réservation de trois places.

`features/driver-navigation/passengerStats.ts`, utilisé par
`hooks/driver-navigation/useDriverPassengerPresentation.ts`, regroupe désormais
par réservation et additionne les places pour les personnes à embarquer,
à bord et déposées. Il ne fusionne pas deux réservations ayant le même titulaire.
Cette modification concerne la présentation, pas la détection GPS ni les tarifs.

Dans `DriverNavigationPassengersBar.tsx`, les réponses à une interruption du
conducteur sont libellées « réservations confirmées par leur titulaire » :
ce compteur ne doit pas être confondu avec le nombre de personnes à bord.

### 2. Confirmations manuelles et grandes listes

`features/ride-recovery/RideRecoveryControl.tsx` présentait tous les blocs
d'actions à la suite et la confirmation finale ne rappelait pas le titulaire.
La liste est maintenant virtualisée, avec un seul bloc de réservation développé.
Le titulaire, le nombre de places et l'itinéraire permettent d'identifier le groupe.
La confirmation finale rappelle qu'elle concerne toutes les places de cette
réservation uniquement. La sélection est conservée par identifiant, même si
l'ordre des réservations change.

Avant l'écriture dans la file hors connexion existante, l'écran vérifie à nouveau
que l'étape est encore disponible pour cette réservation. Un verrou synchrone
empêche les doubles touchers. Les réponses tardives après fermeture, changement
de compte, de trajet ou passage hors écran ne rouvrent pas la confirmation.
Côté passager, seules les réservations appartenant au compte connecté sont proposées.

`features/driver-navigation/NavigationPassengersModal.tsx` utilise également une
liste virtualisée, dans un panneau de hauteur bornée à 85 %, avec l'adresse et le
nombre de places. Ouvrir une étape ou signaler un passager conserve son `bookingId`.
Les premiers lots sont de six réservations pour les confirmations et huit étapes
pour la liste des arrêts ; aucun polling individuel par ligne n'a été ajouté.

L'approche du skill `frontend-skill` a guidé ce choix d'une liste dense avec un
seul détail développé, en réutilisant le style existant sans animation décorative
ni nouveau modal natif.

### 3. Actions concurrentes du conducteur

`hooks/driver-navigation/useDriverBookingActionGuard.ts` est partagé par
`useDriverBookingActions.ts` et `useDriverPickupActions.ts`, depuis
`useDriverNavigationController.ts`. Il empêche deux actions concurrentes de
ces contrôles de mélanger leurs indicateurs de chargement ou leurs confirmations.
Avant de lancer l'action, il vérifie le trajet, la réservation encore présente,
son état et, pour une interruption, l'identifiant de la demande en cours.

Une ancienne réponse ne ferme pas la fenêtre d'un autre passager et ne modifie
pas l'écran suivant. Le verrou est libéré dans `finally` ; il ne remplace pas les
autorisations et protections contre les doublons côté serveur. Il n'est pas un
verrou financier et ne bloque pas le bouton SOS.

### 4. Plusieurs événements proches dans le temps

Les avis de prise en charge pouvaient remplacer immédiatement celui du passager
précédent. `useDriverPickupNoticeQueue.ts`, intégré à
`useDriverNavigationNotices.ts` et `useDriverNavigationSession.ts`, conserve
au plus un avis en attente par réservation éligible. Les réservations sont
présentées dans l'ordre d'arrivée ; un état plus avancé remplace l'ancien avis
de la même réservation. Les avis annulés ou devenus inutiles sont écartés.
Les priorités sont isolées dans `features/driver-navigation/pickupNoticePriority.ts`.

L'embarquement d'une réservation ne ferme plus l'avis ou le compteur d'attente
d'une autre. La fermeture différée d'une voix ne déclenche pas une annonce pour
un avis déjà fermé. L'échec de la synthèse vocale ne supprime pas l'avis visuel.

Les bannières d'information de `features/navigation/rideOverlayStore.ts` disposent
d'une file bornée à vingt avis en attente, en plus de l'avis affiché. Les messages
identiques sont dédoublonnés. `RideNoticeBanner.tsx` efface cette file au passage
en arrière-plan ; la sortie de navigation la libère également. En cas de saturation,
le plus ancien avis en attente est retiré. Cela ne concerne que les informations
éphémères, jamais une mutation, une dette ou une confirmation en attente serveur.
Les panneaux d'étapes et les données serveur restent les points de consultation.

`useDriverTrackingSocket.ts` utilise ces bannières pour les avis d'embarquement
incertain ou manqué, sans remplacer une boîte de confirmation interactive.
La priorité SOS existante est conservée.

### 5. Interruptions, paiement et gains d'un groupe

`hooks/passenger-navigation/usePassengerNavigationInterruption.ts` associe la
réponse d'interruption au couple exact réservation/titulaire. Un ancien test avec
un « ou » pouvait confondre deux réservations du même compte. Une confirmation
en attente pour cette réservation est maintenant nécessaire pour répondre.
Les doubles envois et les retours tardifs après passage hors écran sont protégés ;
`usePassengerNavigationController.ts` transmet l'activité de l'écran.

`PassengerInterruptionFarePreview.tsx`, `DriverInterruptionPrompt.tsx` et le
dialogue conducteur précisent la portée de la descente pour un groupe. Les règles
de montant minimal, de plafond initial et de trajet gratuit restent inchangées.

`hooks/arrival-payment/useArrivalPaymentState.ts` filtre explicitement les
réservations du titulaire connecté, avant toute sélection du paiement à présenter.
`features/arrival-payment/ArrivalPaymentFields.tsx` affiche « Total pour N places »
pour un groupe. Il conserve le montant serveur sans nouveau calcul ni multiplication.
Les modes de paiement, la reprise après échec et le seuil de préparation à un
kilomètre ne sont pas modifiés par ce correctif.

`features/driver-navigation/DriverDropoffReceiptsSheet.tsx` indique les places
et précise que le montant détaillé porte sur l'ensemble du groupe. La sélection
unique du reçu, l'encaissement cash explicite et l'accès par les options après
masquage de la barre restent disponibles.

## Contrôle du backend existant

Lecture du code local de `zwanga-backend`, sans modification ni déploiement :

- `src/ride-declarations/ride-declarations.service.ts` vérifie que l'auteur est
  le titulaire de la réservation ou le conducteur du trajet, y compris lors
  d'une répétition de requête. Les déclarations sont enregistrées par réservation.
- `src/trips/trips.service.ts` construit les confirmations d'interruption à partir
  des réservations embarquées, pas d'une réponse distincte pour chaque place.
- `src/trips/driver-interruption.workflow.ts` associe la réponse au passager
  authentifié et à la réservation concernée.

Ces contrôles existants sont cohérents avec la règle demandée. Cette lecture ne
constitue pas un test du backend déployé ou d'une transaction de production.

## Vérifications et limites

Tests ajoutés dans `tests/multiPassengerNavigation.test.js` et complétés dans
`rideRecoveryUI.test.js`, `arrivalPaymentResume.test.js`,
`arrivalPaymentModeRecovery.test.js`, `passengerInterruptionPreview.test.js`,
`interruptionSettlement.test.js` et `driverManualReroute.test.js`.

Ils couvrent notamment trois places avec une seule déclaration, deux réservations
du même titulaire, listes simulées de cent entrées, sélection stable malgré le
réordonnancement, notifications simultanées, isolation des compteurs, double clic,
changement de trajet, passage en arrière-plan et refus des données d'un autre compte.
Les détails des résultats finaux sont consignés dans `CHANGEMENTS_TECHNIQUES.md`.

Aucun nouvel endpoint, flux GPS, polling périodique ni appel HTTP hors RTK Query.
Ces tests JavaScript ne mesurent pas la mémoire, la chauffe ou la fluidité native.
Il reste à vérifier sur iPhone et Android physiques :

1. Deux titulaires, dont un ayant réservé trois places : embarquements et déposes
   distincts, chaque réponse et chaque paiement appliqués à la bonne réservation.
2. Une interruption urgente pendant qu'une autre réservation est en attente de
   confirmation ou de paiement ; accès SOS toujours disponible.
3. Plusieurs notifications reçues ensemble, perte du réseau et retour après veille.
4. Défilement, grandes polices, fermeture et réouverture des panneaux, puis swipe
   du récapitulatif et réouverture des gains depuis les options.
5. Un trajet long avec plusieurs réservations, pour contrôler la stabilité native.

La descente partielle d'un accompagnant au sein d'une même réservation n'est pas
introduite : le titulaire agit pour l'ensemble des places qu'il a réservées.
