# Retour à la navigation depuis le trajet en cours

Le bandeau `OngoingTripBanner` ouvre directement :

- `/booking/navigate/:bookingId` pour le passager, avec l’identifiant de sa réservation ;
- `/trip/navigate/:tripId` pour le conducteur du trajet.

Le rôle est celui de la personne sur le trajet, pas la capacité de son compte à
conduire. Les réservations d’un autre compte, annulées, terminées ou dont la dépose
est confirmée par le passager ne produisent pas de bandeau passager.

Le lien passager du bandeau existait déjà. La notification permanente associée
renvoyait cependant au détail du trajet : elle conserve maintenant aussi
`bookingId`. Le clic sur la notification et son action rapide, y compris en
arrière-plan, utilisent la même destination passager. Une ancienne notification
sans identifiant de réservation conserve son repli vers le détail, sans inventer
un identifiant de navigation.

Le suivi est réinitialisé lorsque le trajet, le rôle ou la réservation change,
pas à chaque rendu. Aucun polling ni appel réseau au clic n’a été ajouté.
Le backend et les étapes de confirmation du trajet ne changent pas.

Tests : `node --test tests/ongoingTripBanner.test.js tests/notificationNavigation.test.js`.
Valider aussi sur téléphone le retour depuis la notification système et son action rapide.
