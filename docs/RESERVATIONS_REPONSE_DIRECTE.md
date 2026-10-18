# Réservations : réponse directe du conducteur

Date : 17 octobre 2026. Périmètre : application mobile, notifications et gestion
des passagers d'un trajet publié. Aucun changement backend, de dépendances ou de
configuration d'environnement.

## Problème constaté

Le gestionnaire de notifications ouvrait `incoming-driver` dès la réception
d'une réservation au premier plan. Cet écran plein écran présentait « Un
passager vous attend », puis « C’est confirmé ! » et « Voir les détails » après
la réponse. Le conducteur devait traverser plusieurs interfaces alors que les
cartes de passagers proposaient déjà les actions nécessaires.

## Solution appliquée

- `hooks/notifications/useDriverNotifications.ts` ne navigue plus automatiquement
  à la réception d'une **réservation**. Un appui sur une notification reste une
  consultation ; seuls les boutons de décision déclenchent une mutation.
- `app/incoming-driver.tsx` conserve la compatibilité des liens existants, mais
  délègue les réservations à
  `features/notifications/IncomingBookingRedirect.tsx`. Après lecture et contrôle
  du destinataire/propriétaire, la réservation ouvre directement la liste des
  passagers d'un trajet à venir ou la navigation d'un trajet en cours. Un état
  d'attente bref et un repli Réessayer/Accueil remplacent les écrans de décision
  et de succès ; aucune acceptation n'est déduite des paramètres du lien.
- `components/ProtectedAppStack.tsx` retire la présentation native
  `fullScreenModal` de cette route de transition. Les propositions exclusives
  de proximité (`dispatch`) conservent leur contenu et leurs règles de réponse.
- `features/manage-trip/ManageTripContent.tsx` place les passagers avant le résumé
  lorsqu'une réservation attend une réponse ou que l'entrée vient de la
  notification. `ManageTripBookings.tsx` place la réservation visée en premier,
  puis les autres réservations en attente, sans modifier le tableau du cache.
  L'horaire et les deux adresses utiles restent visibles. Accepter/Refuser/
  Contacter restent sur les cartes existantes, avec zones tactiles d'au moins
  44 points et retour à la ligne sur petit écran.
- `hooks/manage-trip/useManageTripBookingActions.ts` répond directement, y compris
  pour le refus, avec le motif générique « Refus du conducteur » requis par
  l'endpoint existant. Le formulaire obligatoire de motif est retiré de
  `app/trip/manage/[id].tsx` et des états/contrôleurs associés. Le résultat apparaît
  dans le bandeau existant, annoncé aux lecteurs d'écran, sans page de succès.
- Les décisions acceptées/refusées utilisent le correcteur de cache existant
  `applyDriverBookingDecision`, uniquement après acquittement. Un verrou commun
  protège les doubles appuis et décisions contradictoires. Le statut courant,
  l'appartenance au trajet, l'identité du conducteur, le focus et la session
  sont contrôlés. Les réponses tardives ne changent pas l'interface d'un autre
  compte ou d'un écran quitté. Une erreur réseau reste réessayable ; une réponse
  ambiguë est relue sans seconde écriture automatique. Un échec du rafraîchissement
  suivant ne transforme pas une décision acquittée en échec.
- `hooks/driver-navigation/useDriverNavigationData.ts`,
  `useDriverNavigationFoundation.ts` et `useDriverNavigationBookings.ts` transmettent
  l'identifiant sélectionné au panneau de réservation déjà présent. Une réponse
  en cours garde la priorité ; une réservation déjà traitée n'est pas réactivée.
  Cette entrée rafraîchit les lectures trajet/passagers sans attendre le prochain
  polling. La cadence habituelle du suivi n'est pas modifiée.
- `services/driverNotifications.ts` affiche au premier plan Android une notification
  silencieuse avec les boutons natifs Accepter/Refuser, sur un canal séparé
  `driver-bookings-active-v1`, dédupliquée et limitée au destinataire connecté.
  iOS conserve sa notification distante, sans doublon local. Le gestionnaire
  `components/NotificationHandler.tsx` invalide les données de réservations à la
  réception. `services/driverNotificationResponse.ts` réduit le texte de succès
  d'une réservation à « Réservation acceptée. ».

La compétence `frontend-skill` a guidé la réutilisation de la surface de travail,
la hiérarchie des actions et la suppression des écrans/illustrations décoratifs,
plutôt que l'ajout d'un nouveau modal ou d'une animation.

## Comportements conservés et précautions

Sonnerie de fond, actions natives depuis l'écran verrouillé, arrêt de la sonnerie
à l'ouverture, durée maximale, contrôles serveur et autorisation de réponse sont
conservés. Aucun paiement, siège, tarif ou commission n'est recalculé localement.
Les fonctionnalités Contacter et consulter le profil restent séparées de la
réponse. Annuler une réservation déjà acceptée garde sa confirmation et ses
restrictions avant embarquement. Paiement, SOS, descente et propositions de
proximité ne sont pas modifiés par ce travail.

Une notification refusée ou désactivée par le système ne peut pas être imposée :
les réservations restent consultables dans les écrans existants. Aucun nouveau
polling ou stockage de décision différée n'a été ajouté.

## Vérifications et limites

- 183 tests JavaScript réussis dans la sélection notifications, réponses,
  réservations, navigation, reprise de trajet, contact et overlays. Nouveaux
  tests dans `incomingBookingRedirect.test.js` et `pendingBookingFocus.test.js` ;
  tests de refus, listes et notification silencieuse adaptés/étendus.
- TypeScript : `tsc --noEmit --incremental false` réussi.
- ESLint ciblé : aucune erreur ; douze avertissements préexistants dans les
  hooks de gestion/navigation (dépendances de hooks et variables inutilisées).
- `git diff --check` réussi.
- `scripts/preview-booking-decisions.cjs` génère un aperçu statique des vrais
  composants via React Native Web, avec des données fictives uniquement.
  Captures consultées à 390 × 760 et 320 × 568 : actions accessibles sur la
  première réservation ; sur 320 px, les boutons se répartissent sur deux lignes
  et la liste reste défilable. Ce n'est pas un essai natif.

Aucun build, envoi aux stores ou déploiement réalisé. La présentation effective
des notifications, leurs actions en veille, les grands caractères et
VoiceOver/TalkBack restent à tester sur appareils Android/iOS. Aucune disparition
de crash ou réduction de chauffe n'est déduite des tests JavaScript.

Recette native : recevoir deux réservations au premier plan sans changement
d'écran ; répondre depuis la carte ; tester la notification verrouillée, un
appui sur son corps, puis une réponse native ; vérifier trajet futur/en cours,
réservation déjà traitée, double appui, erreur réseau puis relance et changement
de compte. Aucun parcours ne doit réafficher les deux écrans de réservation
retirés, ni accepter/refuser sur une simple ouverture.
