# Notation native après trajet et confirmation du cash

Date : 22 septembre 2026. Périmètre : application mobile iOS/Android et backend
des réservations. Aucun déploiement ni aucune migration de production exécutés.

## Problème et décision

L'entrée du profil ouvrait la fiche du store. Il manquait une sollicitation
native après une utilisation significative, sans interrompre une réservation,
un paiement ou la navigation. L'utilisateur a choisi les seuils **1, 10, 20**
trajets réussis, et a demandé une confirmation explicite du cash reçu.

L'application utilise maintenant `expo-store-review ~9.0.9`, version compatible
avec son Expo SDK 54. La fenêtre et l'envoi de la note/du commentaire appartiennent
à Apple/Google : aucun formulaire local ne prétend publier un avis dans les stores.
Depuis le 23 septembre 2026, le bouton volontaire du profil demande lui aussi
la fenêtre native, sans redirection. Son déclenchement explicite reste distinct
des seuils/quota des sollicitations automatiques décrits ici. Voir
[Notation depuis le profil](APP_STORE_REVIEWS.md) pour le comportement actualisé.

## Quels trajets comptent ?

- Passager : sa réservation doit être terminée, avec embarquement et dépose
  confirmés par les données serveur et une date de dépose valide.
- Conducteur : le trajet entier doit être terminé, avec au moins un passager
  transporté ; toutes les réservations concernées doivent avoir réussi.
  Les réservations annulées, refusées ou expirées avant embarquement ne comptent
  pas comme passagers transportés. Un trajet solo n'est pas une réussite éligible.
- Paiement : électronique/jetons `succeeded`, montant explicitement nul avec
  `not_required`, ou cash avec une confirmation serveur et un montant correspondant.
  Un paiement anticipé à un kilomètre ne suffit pas : il faut encore la dépose.
- Une interruption, un tarif d'interruption verrouillé, une réservation incertaine,
  un paiement en attente ou échoué ne déclenchent pas de demande d'avis.
- Une réservation de plusieurs places ne compte qu'une fois. Plusieurs réponses
  API ou réservations du même compte pour le même trajet ne multiplient pas le compteur.
- Aucun critère de satisfaction, d'étoiles ou d'avis précédent sur un participant.

## Fréquence, stockage et limites du comptage local

`ZWANGA_STORE_REVIEW_V1:<identifiant-compte-encodé>` dans AsyncStorage contient :
version, date d'initialisation, compteur et dernier seuil sollicité pour chaque
rôle, identifiants de trajets déjà comptés et dates des tentatives.
Il ne contient ni coordonnées, ni contacts, ni contenu d'avis, ni données bancaires.

Chaque rôle atteint les seuils 1, 10, 20, puis 30, 40… Le plafond de **trois
tentatives sur 365 jours glissants est partagé entre les deux rôles**. Les compteurs
ne sont pas remis à zéro au 1er janvier. Plusieurs seuils atteints pendant une
absence sont regroupés en une sollicitation, pas rejoués en rafale.
Une sollicitation différée par le plafond attend une prochaine occasion sûre.

La tentative est écrite AVANT l'appel natif. Si le système ne montre rien, si
l'appel échoue, ou si l'écran change pendant cette écriture, elle reste consommée
par prudence. Une indisponibilité native détectée avant réservation ne consomme
pas de tentative. Une erreur de lecture/écriture ou un historique corrompu bloque
la sollicitation, sans effacer silencieusement le quota ni gêner les trajets.

Les compteurs commencent à l'activation de cette fonctionnalité sur l'installation :
les anciens trajets terminés ne déclenchent pas un modal à la première ouverture.
Le comptage observe les données d'activité RTK existantes, dont la fenêtre backend
des trajets terminés est de 48 h. Un trajet terminé pendant une longue absence,
ou payé après sa sortie de cette fenêtre côté conducteur, peut donc ne pas être
compté. Aucun téléchargement intégral de l'historique n'a été ajouté pour ce cas.
Ce n'est PAS un compteur de trajets exhaustif côté serveur.

Les reçus locaux de dédoublonnage sont limités à 2 048 par rôle. Leur purge avance
une borne temporelle : un ancien trajet réapparu dans le cache ne peut pas être
compté à nouveau ; une confirmation très tardive avant cette borne est ignorée.
La déconnexion conserve la trace du compte. Désinstallation/effacement du stockage,
changement de téléphone et modification de l'horloge limitent cette protection
locale. Un plafond partagé entre plusieurs téléphones nécessiterait un registre
serveur supplémentaire, non implémenté ici.

## Déclenchement sans activité réseau supplémentaire

`StoreReviewCoordinator` est monté sous Redux et le fournisseur d'overlays. Il
consomme seulement `useQueryState` : les requêtes restent celles du coordinateur
d'activité existant. Aucun nouveau polling, GPS, socket ou appel HTTP direct.

La sollicitation attend :

1. l'accueil au premier plan, sans trajet encore actif ;
2. un résumé d'activité serveur rafraîchi depuis la dernière reprise ;
3. la fin des chargements personnels et la fermeture des overlays/modals natifs ;
4. trois secondes calmes, puis une seconde vérification de l'écran, du compte,
   de l'état natif de l'application et du clavier.

Le timer est unique et annulé au changement d'écran, à la veille et au démontage.
L'identité du compte est revérifiée après les opérations asynchrones. Le reçu
de paiement conducteur utilise désormais `RideModal` et participe au même registre
d'occupation ; sa fermeture iOS n'est pas assimilée à un simple `visible=false`.
Le module Expo est chargé seulement si son équivalent natif existe. Web, ancien
binaire et absence de capacité native restent silencieux, sans fallback automatique
vers un navigateur/store. Un backend ne proposant pas encore le résumé d'activité
ne déclenche pas de sollicitation automatique ; les autres fonctions restent disponibles.

## Confirmation explicite du cash

Le contrôle `ConfirmCashReceipt` est réutilisé dans les réservations du conducteur
et dans le reçu de dépose en navigation. Il montre le montant passager issu du
backend, puis demande « Oui, cash reçu » ou « Pas encore », sans nouveau modal.
Double appui verrouillé, erreur française, retour tardif ignoré après démontage
ou perte de focus. Aucun paiement n'est déduit de la fermeture de ce contrôle.

`PUT /bookings/:id/cash-receipt` via RTK Query transmet le montant et la devise
présentés. Le backend valide l'authentification, le conducteur propriétaire du
trajet, la réservation terminée, la dépose, le mode cash et le montant actuel.
L'UPDATE conditionnel revérifie ces conditions et conserve le premier horodatage
avec `COALESCE`. Une modification concurrente du tarif ou du mode refuse la confirmation.

Les colonnes distinctes `cashReceivedAt`, `cashReceivedByDriverId` et
`cashReceivedAmount` sont lisibles mais exclues des UPDATE ORM ordinaires pour
empêcher une ancienne copie GPS/paiement d'effacer le reçu. Une contrainte protège
le mode et le montant confirmés, y compris lors de mises à jour concurrentes.
Le changement de mode de paiement après confirmation cash est refusé.

La confirmation n'appelle ni FlexPay, ni le wallet, ni les règlements/subventions.
`paymentStatus`, `paymentAmount` et `paidAt` ne sont pas transformés en paiement
électronique. Le reçu de navigation indique « Cash reçu », sans augmenter les
gains crédités. Les caches réservations/trajets sont invalidés et le résumé
d'activité inclut le reçu afin de propager ce fait au conducteur et au passager.
Ce reçu atteste la déclaration du conducteur, pas une vérification bancaire du cash.

## Fichiers principaux

- `features/store-review/reviewEligibility.ts` : preuves métier de réussite.
- `reviewPolicy.ts` : seuils, quota glissant, validation, dédoublonnage borné.
- `reviewRepository.ts` : lectures/écritures sérialisées par compte et réservation de tentative.
- `nativeReview.ts` : capacité native et chargement Expo sans redirection automatique.
- `components/StoreReviewCoordinator.tsx`, `ReduxProvider.tsx` : orchestration légère.
- `features/navigation/rideOverlayStore.ts`, `components/DriverPaymentNoticeCoordinator.tsx` : garde d'occupation.
- `store/api/trip/activityTripMapper.ts` : preuve conducteur dérivée des réservations déjà reçues.
- `store/api/booking/cashReceipt.endpoints.ts`, `bookingApi.ts`, `bookingMapper.ts`,
  `serverTypes.ts`, `types/trips.ts` : mutation RTK et contrat du reçu cash.
- `features/driver-payments/ConfirmCashReceipt.tsx`, `DriverBookingRevenue.tsx`,
  `features/manage-trip/ManageTripBookings.tsx`, `features/driver-navigation/DriverDropoffReceipts.tsx` : confirmation et reçu.
- Backend : `cash-receipts.controller.ts`, `cash-receipts.service.ts`,
  `bookings.module.ts`, `bookings.service.ts`, `entities/booking.entity.ts`,
  `activity/activity.service.ts`, migration `1780000039000-AddCashReceipts.ts`
  et registre `database/migrations/index.ts`.

## Déploiement et recette native

Déployer la migration backend avant le code qui lit ces colonnes, puis reconstruire
les applications iOS et Android avec le nouveau module natif. Une simple mise à
jour JavaScript ne fournit pas `ExpoStoreReview` aux anciens binaires. La migration
ne régularise aucun ancien cash ; toutes les nouvelles colonnes restent nulles
jusqu'à une confirmation explicite. Son rollback supprime ces reçus : sauvegarde
et plan de déploiement nécessaires. Le verrou DDL est limité à cinq secondes pour
son acquisition ; valider le temps de scan de contrainte sur une base de staging.

À tester sur appareils : trajet gratuit, jetons, électronique, cash confirmé/non
confirmé, tous les passagers déposés, interruption, application en veille jusqu'à
la fin, paiement tardif, reçus natifs iOS ouverts/fermés, changement de compte,
retour accueil, double appui et réseau lent. Vérifier aussi les seuils avec des
historiques de test et les grandes polices du contrôle cash.

Apple/Google décident si la fenêtre s'affiche et ce qu'elle propose ; on ne peut
pas prouver depuis le retour API qu'un avis a été rédigé ou publié. TestFlight
ne permet pas de valider une sollicitation réelle ; les circuits de test Google
ont leurs propres conditions. Ne pas automatiser de publication d'avis réels.
Le plafond trois/an est celui de l'application, pas une garantie universelle des
stores. Sources officielles consultées : [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/storereview/),
[Google Play](https://developer.android.com/guide/playcore/in-app-review),
[Apple](https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews).

## Vérifications

Tests JavaScript/TypeScript couvrant éligibilité, cash, seuils, quotas, stockage,
concurrence, absence du module natif, cycle de vie, reprise et fermeture des modals.
Tests backend couvrant droits, montant/devise obsolètes, courses concurrentes
simulées, retries, protection des colonnes et SQL de migration. Ces tests utilisent
des doubles de stockage/SDK/base : ils ne constituent pas une exécution réelle
de la migration PostgreSQL ni une mesure de performance ou de stabilité native.
Résultats finaux consignés dans `CHANGEMENTS_TECHNIQUES.md`.
