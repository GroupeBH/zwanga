# Chargement et priorités de l'accueil — 19 novembre 2026

## Problème et périmètre

Le loader d'entrée vérifiait l'activité, mais l'accueil attendait sa fermeture
pour monter et charger ses propres listes. Des rappels facultatifs et des reprises
de commandes anciennes pouvaient ensuite interrompre cet accueil. L'utilisateur
demande une ouverture préparée, avec seulement les réservations nouvelles,
commandes proches et trajets en cours comme interruptions automatiques métier.
Périmètre mobile, sans modification du backend, de `.env` ou déploiement.

## Solution appliquée

- Le bon accueil commence à se préparer sous le loader partagé dès que le profil
  du compte est connu. Les lectures et les interactions ont désormais des états
  distincts : préparer les listes n'autorise ni modal, ni annonce, ni caméra active.
- Un signal associe le premier layout, l'initialisation de la carte et les données
  utiles de l'accueil. Aucun besoin d'obtenir un GPS précis ni toutes les tuiles.
  Les lectures réutilisent RTK Query ; pas de nouveau polling de découverte.
- Favoris passager et résumé des gains conducteur sont préparés dans les mêmes
  caches que leurs composants. Un clic précoce sur « Maison » ne doit pas prendre
  un cache encore non demandé pour une liste de favoris vide.
- La préparation a un plafond de huit secondes : réseau hors ligne, erreur de
  profil ou destination prioritaire libèrent l'attente. Après révélation, un
  rafraîchissement ou retour des réglages ne remet pas cette préparation à zéro.
  Les données encore lentes/indisponibles restent récupérables dans l'accueil.
- Le trajet en cours vérifié et la nouvelle réservation peuvent interrompre cette
  préparation. Une commande proche/dispatch conserve sa validation et son alerte.
- Les anciennes propositions de prix, commandes personnelles en attente et
  commandes acceptées mais non démarrées ne déclenchent plus de redirection à
  l'ouverture. Leurs accès et cartes restent disponibles ; la navigation explicite
  après création/acceptation ou un clic de notification n'est pas supprimée.
- Pas de modal facultatif de mise à jour ni de demande automatique de permissions
  sur l'accueil. Les boutons de localisation et contrôles du profil restent
  disponibles ; le GPS déjà autorisé continue de fonctionner. La demande d'avis
  du store est limitée au profil, avec ses règles d'éligibilité existantes.
- À l'accueil, annonces vocales limitées aux réservations en attente de réponse
  et commandes proches ; pas de rappel vocal automatique des activités anciennes.

## Fichiers

- `components/ActiveRideResumeCoordinator.tsx`,
  `hooks/navigation/useHomePreparation.ts`,
  `features/navigation/homePreparationContext.ts`,
  `hooks/navigation/useRequestEntryResume.ts`.
- `app/(tabs)/index.tsx`, `components/home/HomeDashboard.tsx`, `HomeMap.tsx`,
  `hooks/home/useHomeContext.ts`, `useHomeController.ts`, `useHomeDriverActivity.ts`,
  `useHomePassengerActivity.ts`, `useHomeLocation.ts`,
  `useHomeSupportingData.ts`,
  `features/activity/activityQueryOptions.ts`, `hooks/useUserLocation.ts`.
- `components/DriverPermissionsCoordinator.tsx`,
  `TripLocationPermissionCoordinator.tsx`, `StoreReviewCoordinator.tsx`.

## Comportements conservés et limites

Les gardes de session et de validation du numéro restent prioritaires et bloquent
aussi les lectures préparatoires. Un ancien callback ne prépare pas un autre
compte/session. Les contrôles KYC, mises à jour obligatoires et flux de paiement
ne sont pas retirés. Aucun changement des canaux Notifee, de la sonnerie, des
envois push ou du suivi GPS natif. Une localisation désactivée n'est jamais
annoncée comme activée sans consentement de l'utilisateur.

Le délai de huit secondes est un garde-fou, pas une mesure de performance ni une
garantie que tous les services répondent dans ce délai. Un clic volontaire vers
un formulaire, une conversation ou un paiement garde sa priorité. Le chargement
d'entrée vérifie toujours les activités pour éviter une navigation sur cache périmé.

## Vérifications

- Suite élargie : **702 tests JavaScript réussis**, zéro échec/ignoré, couvrant
  accueil, reprise, réservations, alertes conservées, permissions, session, carte,
  navigation et propositions. Les premiers essais ont détecté des attentes de
  tests devenues obsolètes et un défaut d'isolation des horloges de test ; ces
  cas ont été adaptés à la nouvelle politique puis rejoués avec succès.
- Complément : **120 tests réussis** sur activité partagée, confirmations,
  récupération, overlays, partage, retrait, caméra, cycle de vie et grandes polices.
  Ces ensembles se recouvrent : ils ne sont pas additionnés comme tests uniques.
- Après préparation des favoris/gains : sous-ensemble de **35 tests réussis**
  sur préparation, cycle de vie et priorité de l'accueil, incluant la vérification
  du signal layout/données/carte.
- TypeScript et ESLint ciblé vérifiés localement ; contrôle des frontières réseau
  et taille des sources sans anomalie. Pas de relance du contrôle release intégral
  pour cette intervention.

Aucun essai physique, test API connecté, déploiement ou nouvelle validation
d'absence d'ANR. Restent à tester sur Android/iOS : démarrage lent/hors ligne,
compte passager/conducteur, retour des réglages, réception pendant le loader,
réservation et reprise d'un trajet, puis accès aux permissions par un clic explicite.
