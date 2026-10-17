# Démarrage du trajet et chargement de la navigation

Date : 18 octobre 2026. Périmètre : application mobile et service de trajets du
dépôt `zwanga-backend`. Intervention commencée le 17 octobre, sans déploiement,
modification de configuration, migration ni accès à un compte réel.

## Problème constaté

Le message « Le statut du trajet a changé. Actualisez-le avant de réessayer. »
provient de la mise à jour conditionnelle du démarrage dans le backend.
Un défaut est reproductible dans le code : une pause avant embarquement remet
le trajet à `upcoming` mais garde `startedAt`. Le démarrage exigeait ensuite
`startedAt IS NULL`, rendant cette reprise impossible. Une tentative concurrente
pouvait aussi produire ce conflit alors qu'une autre avait déjà démarré le trajet.
L'historique du trajet photographié n'a pas été consulté : ce diagnostic explique
un chemin défectueux avéré, sans attribuer avec certitude ce chemin au compte signalé.

Les attentes initiales de navigation utilisaient un indicateur générique, peu
explicite. Il fallait conserver les contrôles d'accès avant d'afficher la carte.

## Solutions appliquées

### Backend

- `src/trips/trips.service.ts` distingue le premier démarrage de la reprise
  après pause avant embarquement. Seul le premier initialise `startedAt` et
  efface l'ancien suivi ; la reprise conserve le début initial et la position.
  L'heure d'arrivée estimée est recalculée depuis l'heure de reprise.
- La mise à jour reste atomique et conditionnée par le trajet, son conducteur,
  son état `upcoming` et la présence/absence attendue de `startedAt`. Pas de
  comparaison fragile des fractions de seconde du timestamp PostgreSQL.
- Une demande répétée pour le trajet déjà actif du même conducteur renvoie
  son état actualisé sans rejouer la transition ni ses notifications. Même
  principe lorsqu'une autre tentative gagne la mise à jour conditionnelle.
  Les conflits restants exposent le code `TRIP_START_STATE_CHANGED` et gardent
  le message français existant.
- La compétence PostgreSQL a guidé le maintien d'une mise à jour courte,
  gardée par l'état, sans requête d'itinéraire ni notification sous un nouveau
  verrou transactionnel. Aucun changement de schéma ou de migration.

### Application

- `utils/tripStartReconciliation.ts` reconnaît uniquement les conflits de
  démarrage connus : nouveau code, ancien message de conflit, ancien message
  indiquant un trajet déjà en cours. Une seule lecture fraîche vérifie l'état
  serveur ; aucun nouvel ordre de démarrage n'est envoyé automatiquement.
- `hooks/manage-trip/useManageTripController.ts` et
  `hooks/driver-navigation/useDriverNavigationData.ts` utilisent cette
  vérification. La navigation n'est autorisée que pour le bon trajet confirmé
  `ongoing`. Des données conservées dans un résultat de lecture en erreur ne
  constituent jamais une confirmation. La récupération bornée des erreurs de
  transport reste disponible, sans assimiler les refus métier à un succès.
- `features/navigation/NavigationLoading.tsx` réutilise l'illustration vectorielle
  et l'animation native existantes de l'accueil : voiture, itinéraire et point
  d'arrivée. `frontend-skill` a guidé cette continuité visuelle et la sobriété du
  message « Ouverture de votre trajet ». Pas de pourcentage inventé.
- Le composant est intégré dans `components/trip/DriverTripAccessGuard.tsx`,
  `app/trip/navigate/[id].tsx` et `app/booking/navigate/[id].tsx`. Sa variante
  compacte accompagne l'attente de la carte sans couvrir les commandes du trajet.
  L'attente plein écran garde un retour immédiat et un contenu défilable. Après
  huit secondes au premier plan, un conseil de connexion remplace le texte court,
  sans nouvelle requête, échec artificiel ou tentative de démarrage.
- L'animation s'arrête hors focus/en arrière-plan et respecte le mouvement
  réduit du système grâce au composant existant. Le délai est nettoyé à la
  sortie. Aucun GPS, SDK cartographique, dépendance ou image lourde ajouté.

## Comportements conservés et précautions

Les contrôles conducteur/KYC et d'autre trajet actif restent appliqués avant une
transition. Un appel d'un autre conducteur ne peut pas lire ou redémarrer le
trajet. Un trajet annulé ou terminé ne peut pas être réactivé par ce correctif.
Le workflow d'interruption avec décisions des passagers reste prioritaire ; la
reprise simple refuse un ancien trajet en pause avec un passager encore à bord.
Prix, places, réservations, embarquement, paiement et cadence GPS sont inchangés.

Les verrous anti-double appui, les protections de sortie/changement de trajet et
la fermeture des dialogues iOS avant navigation sont conservés. Le loader ne
monte pas les contrôleurs conducteur avant vérification de participation et ne
modifie pas les délais de montage/libération de la carte native. Une annulation,
un refus d'accès ou une lecture incohérente restent des erreurs, pas une navigation.

## Vérifications réalisées

- **121 tests JavaScript mobiles réussis**, zéro échec :
  `tripStartNavigation`, `homeLoaderJourney`, `homeRoleLoader`,
  `tripStartReconciliation`, `navigationLoading`, `confirmedRideCache`,
  `manageTripCancellation`, `navigationLifecycle`, `tripExpiryAccess`,
  `driverBookingReadAccess`, `auditUsabilityFixes`, `tripParticipation`,
  `navigationHeaders`, `driverActionsReadIsolation` dans `tests/*.test.js`.
  Les nouveaux cas couvrent notamment le conflit suivi d'un état actif ou
  annulé, une lecture échouée conservant des données, le délai du loader,
  sa sortie et ses quatre emplacements. Les tests de garde/navigation existants
  ont été adaptés au composant partagé sans retirer leurs contrôles d'accès.
- **61 tests backend réussis** : `src/trips/trip-start-restart.spec.ts`,
  `src/trips/trips.service.spec.ts`, `src/trips/driver-interruption.workflow.spec.ts`.
  Le nouveau fichier couvre démarrage, pause/reprise, demandes répétées et
  concurrentes, annulation concurrente, fin de trajet, autre conducteur et
  préservation du workflow d'interruption. Dépôts et services simulés : ce
  passage ne constitue pas un essai de concurrence sur PostgreSQL réel.
- TypeScript sans émission réussi pour le mobile et la configuration de build
  backend. ESLint ciblé : zéro erreur et quatre avertissements préexistants
  dans `useManageTripController.ts` (trois dépendances de hooks et une variable
  inutilisée). Vérification `git diff --check` réussie dans les deux dépôts.
- `scripts/preview-navigation-loading.cjs` rend les composants réels via React
  Native Web, avec l'animation figée à mi-parcours et des marges système simulées.
  Aperçus **390 × 760**, **320 × 568** et carte **390 × 300** inspectés visuellement
  dans `.expo/navigation-loading-preview/review.png` (sortie locale ignorée).
  Le titre, l'illustration et le retour restent visibles dans les deux formats
  plein écran. Ce contrôle statique ne mesure pas la fluidité native.

## Livraison et limites

Le backend corrigé doit être déployé pour rendre la reprise disponible aux
applications installées. Aucune nouvelle variable ni migration n'est requise
pour ce correctif précis ; ne pas confondre avec les autres modifications déjà
présentes dans les dépôts. Le loader et la récupération du conflit nécessitent
la livraison du code mobile. Aucun build ni déploiement réalisé ici.

À vérifier sur Android/iOS physiques : premier démarrage, pause avant
embarquement puis reprise, double appui, réseau interrompu, retour pendant le
chargement, permissions/participation refusées, texte agrandi et lecteur d'écran.
Les tests sont locaux avec dépendances simulées et les captures sont Web ; pas
de reproduction du compte signalé, de mesure de chauffe/mémoire, ni d'affirmation
de résolution d'un crash natif. Les changements préexistants sont conservés.
