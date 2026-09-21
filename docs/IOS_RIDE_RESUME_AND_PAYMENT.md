# Reprise d’un trajet et paiement sur iOS / Android

## Incident visé

Le passager réserve en paiement électronique, embarque, verrouille le téléphone puis revient après la dépose. Des fenêtres concurrentes et un paiement resté occupé peuvent alors rendre l’application difficile à utiliser, y compris après retour à l’accueil.

L’inspection a identifié plusieurs défauts reproductibles dans la logique JavaScript. Elle ne remplace pas un profilage de l’iPhone concerné et ne prouve pas, à elle seule, la cause native de tous les blocages.

## Corrections du paiement

- `useBookingPaymentMode` déduit le choix du mode enregistré sur la réservation, ou d’une transaction déjà en cours. Une information manquante n’est plus interprétée comme du cash. Une transaction électronique en attente ne peut pas être remplacée par une sélection cash dans ce formulaire.
- `useArrivalPaymentRefresh` actualise les réservations via RTK Query une fois au retour au premier plan avant de présenter le paiement. Une erreur réseau ne supprime pas les informations déjà disponibles.
- `useArrivalPaymentState` garde la réservation affichée pendant sa confirmation : son passage de « pending » à « succeeded » ne sélectionne pas subitement une ancienne réservation cash. Les autres rappels restent repliés après fermeture du récapitulatif.
- `useArrivalPaymentMonitoring` ne redémarre plus à chaque nouvelle identité de callback ou mise à jour du cache. Il n’exécute qu’une vérification à la fois, interrompt les lectures à la mise en veille et libère l’indicateur d’attente dans le nettoyage. Une ancienne réponse ne peut pas débloquer ou modifier une nouvelle vérification.
- Les mutations financières ne sont pas annulées par le nettoyage des lectures. Le règlement par jetons partage une seule promesse en cours par réservation. Si le serveur indique déjà le règlement réussi au réveil, aucun nouveau débit n’est demandé par ce mécanisme.
- `useArrivalPaymentCompletion` présente immédiatement la réponse de règlement. Le solde et l’historique s’actualisent ensuite sans bloquer le bouton de fermeture. Une lecture lente ne remplace ni le mode de paiement autoritatif ni un panneau déjà fermé.
- `usePaymentPersistence` conserve les références par compte, fusionne les modifications et ordonne les écritures locales hors des fonctions de mise à jour d’état React. Le coordinateur est remonté lorsque le compte change ; les opérations suivantes vérifient que leur session est toujours valide.
- « Fermer et reprendre plus tard » replie la fenêtre sans déclarer le paiement effectué, effacer une référence en attente ou créer une nouvelle transaction. Un rappel permet de la rouvrir, notamment depuis l’accueil.
- L’ouverture de la facture attend la fermeture logique du panneau, sans attendre les interactions continues avec la carte.

### Contrat cash vérifié dans le backend

`BookingsService.updatePaymentMode` (`zwanga-backend/src/bookings/bookings.service.ts`) change le mode. Pour un mode cash déjà sélectionné, il peut simplement retourner la réservation ; il ne constitue pas une attestation d’encaissement. L’application affiche donc des instructions de remise au conducteur, pas « paiement confirmé » ou « le passager a confirmé » sur cette seule réponse. Aucun changement du calcul des tarifs, subventions, gains ou paiements backend n’est introduit ici.

## Fenêtres pendant la navigation

`RideOverlayProvider` / `RideOverlayScope` / `RideModal` coordonnent les panneaux de navigation à l’intérieur de l’écran. Le panneau de paiement global utilise aussi ce mécanisme sur l’accueil. Cela évite de multiplier les présentations natives pour ces parcours.

- Un seul panneau est visible et reçoit les interactions : SOS, confirmation d’action, paiement, puis panneaux ordinaires.
- Un panneau temporairement recouvert reste monté, mais caché et non interactif. Cela conserve les formulaires imbriqués sans boucles de montage/démontage.
- Les panneaux liés à un écran sont désenregistrés lorsqu’il devient inactif. Le paiement global n’est pas perdu au retour à l’accueil.
- Les avis automatiques simples d’embarquement et d’approche deviennent une bannière temporaire, au lieu d’une nouvelle fenêtre bloquante. Les actions de sécurité, de confirmation et de récupération manuelle sont conservées.
- Le bouton Retour Android et les demandes de fermeture restent traités. Hors navigation, les formulaires existants conservent leur présentation native.

Référence de plateforme : React Native définit `onDismiss` comme le callback de fermeture native sur iOS ; le panneau intégré émet sa fermeture logique après retrait de son contenu ([documentation Modal](https://reactnative.dev/docs/modal#ondismiss)). La reprise utilise l’état premier plan / arrière-plan de l’application ([documentation AppState](https://reactnative.dev/docs/appstate)).

## Charge pendant les longs trajets

- L’abonnement conducteur conserve les mêmes écouteurs tant que le trajet et son activité ne changent pas. Les callbacks lisent les données récentes sans quitter/rejoindre le canal à chaque actualisation des réservations.
- Les coordonnées conducteur reçues côté passager ignorent les doublons et les échantillons antérieurs ; leur publication vers la carte est regroupée au maximum toutes les deux secondes, en conservant la dernière position reçue. Le minuteur est libéré à la sortie.
- Les événements d’embarquement, de dépose et de fin ne passent pas par cette limitation d’affichage. Les tâches GPS et règles backend ne sont pas modifiées.
- Toutes les lectures et mutations HTTP restent dans RTK Query. Le coordinateur des panneaux est un état d’interface temporaire, pas une nouvelle source de données métier.

## Validation automatisée et limites

Tests ajoutés : `arrivalPaymentResume.test.js`, `rideOverlays.test.js`, `passengerDriverLocationDisplay.test.js` ; tests d’abonnement, de soumission et de mise en page complétés. Ils couvrent notamment les réponses tardives, la veille en cours de vérification, le mode manquant, le règlement déjà réussi, les panneaux concurrents et des centaines de cycles de nettoyage.

TypeScript et contrôle de la frontière réseau vérifiés. Deux références historiques de `sourceExtractions.test.js` échouaient déjà avant ces changements (styles de réservations et endpoints utilisateur) ; leurs valeurs attendues n’ont pas été remplacées pour masquer l’écart. Le contrôle global des 400 lignes signale également `app/wallet.tsx`, modifié séparément avant ce correctif ; il n’est pas retouché ici.

## Recette obligatoire sur appareils réels

1. Réserver en électronique, embarquer, laisser l’iPhone verrouillé jusqu’après la dépose puis rouvrir l’application. Vérifier le mode, le montant et l’absence de confirmation cash spontanée.
2. Démarrer un paiement Mobile Money, mettre en veille pendant la vérification, confirmer chez l’opérateur puis revenir. Vérifier une seule transaction et un récapitulatif utilisable sans attendre l’historique.
3. Répéter en réseau lent, coupé puis rétabli. Fermer et reprendre le panneau, retourner à l’accueil : navigation et boutons doivent rester utilisables.
4. Tester la recharge complémentaire de jetons pendant la veille ; vérifier qu’un règlement déjà réussi n’est pas débité une seconde fois.
5. Croiser approche, embarquement, dépose, SOS et confirmation manuelle. Fermer les panneaux, ouvrir la facture et revenir : aucune couche invisible ne doit retenir les touches.
6. Répéter sur Android, avec retour système, clavier ouvert et plusieurs réservations récentes. Tester aussi un trajet long avec changement d’application répété.

Les tests de hooks simulent les cycles de vie ; ils ne mesurent ni UIKit ni la mémoire GPU. La validation TestFlight sur le modèle d’iPhone concerné reste nécessaire avant de conclure à la disparition du gel en production.
