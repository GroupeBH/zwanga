# Entrée unifiée et actions du trajet — 2026-10-17

## Problème et périmètre

L'accueil attendait le rôle du profil, tandis que la reprise du trajet utilisait
un coordinateur séparé. L'accueil pouvait être visible avant la redirection.
Les actions de navigation employaient des termes longs et, avec plusieurs
réservations, demandaient de retrouver le passager dans la liste.

Cette intervention concerne le mobile : choix de l'écran d'entrée, chargement
commun, confirmations manuelles et présentation des actions. Aucun changement
backend, de tarif, d'authentification, d'infrastructure ou de configuration.

## Solutions appliquées

### Un chargement pour choisir l'écran

- `components/ActiveRideResumeCoordinator.tsx` entoure désormais le navigateur
  via `features/navigation/appEntryContext.ts` dans `components/ReduxProvider.tsx`.
  Le navigateur reste monté ; une vue superposée, et non un modal natif, masque
  la transition. `components/home/HomeRoleLoader.tsx` est réutilisé avec le
  statut « Ouverture de Zwanga » et des actions de récupération.
- `hooks/navigation/useActiveRideResume.ts` attend les informations de trajet
  déjà partagées par le coordinateur d'activité. Un trajet candidat est vérifié
  par une lecture authentifiée fraîche avant la navigation. Pour un trajet
  `ongoing`, le conducteur propriétaire rejoint `/trip/navigate/[id]` et le
  titulaire d'une réservation acceptée encore active `/booking/navigate/[id]`.
  Le rôle dans ce trajet prime sur le rôle global : un conducteur voyageant
  comme passager reçoit la navigation passager. La provenance commande ou
  réservation d'un trajet publié ne change pas cette règle.
- Sans trajet en cours, le même chargement attend un profil du compte courant
  avec un rôle reconnu avant d'afficher l'accueil. Les deux réponses peuvent
  arriver dans n'importe quel ordre. Une participation déjà vérifiée n'attend
  pas inutilement le rôle global pour ouvrir sa navigation.
- `hooks/home/useHomeContext.ts` continue la souscription de profil existante.
  Le coordinateur en observe le cache sans nouvelle souscription ni polling.
  `app/(tabs)/index.tsx` ne monte pas initialement le dashboard, sa carte et ses
  hooks métier tant que la décision commune n'est pas terminée. Lors d'une
  vérification ultérieure, un dashboard déjà affiché pour ce compte reste monté
  derrière le loader, avec son travail de premier plan suspendu.
- La couverture existe dès le premier rendu de l'accueil, même si la clé du
  navigateur n'est pas encore prête. Seule la redirection attend cette clé.
  L'identité du jeton authentifié est utilisée pendant l'hydratation du profil.
- Après huit secondes de chargement visible, ou une erreur connue, une relance
  est proposée. Elle actualise seulement les informations encore nécessaires.
  « Ouvrir l'accueil » permet de différer la vérification du trajet si le rôle
  du profil est connu ; un rôle inconnu n'est jamais assimilé à « passager ».
  Le délai affiche une récupération, il n'annule pas les requêtes HTTP partagées.

### Des actions de navigation plus directes

- `features/ride-recovery/rideRecoveryPresentation.ts` et
  `RideRecoveryControl.tsx` présentent « Je suis à bord » / « Je suis arrivé »
  au passager et « Le passager est à bord » / « Le passager est descendu » au
  conducteur. Action primaire orange contrastée, sans confirmation positive
  supplémentaire. Les informations d'attente ou d'enregistrement restent honnêtes.
- `DriverNavigationTopPanel.tsx` transmet la réservation et l'étape du prochain
  arrêt. Le conducteur peut confirmer ce passager en un appui ; « Tous les
  passagers » conserve l'accès aux autres réservations. Un arrêt obsolète ne
  peut pas devenir une confirmation d'arrivée à la place d'une montée, ni
  valider un autre passager. Si le raccourci n'est plus valable, une sélection
  explicite reste nécessaire.
- `DriverNavigationPassengersBar.tsx`, `PassengerNavigationHeader.tsx`,
  `PassengerNavigationInfoCard.tsx` et `app/booking/navigate/[id].tsx` raccourcissent
  les termes : « Aller chercher », « Déposer le passager », « Rendez-vous »,
  « Je veux descendre ici », « Annuler ma place ». Les conditions et gestionnaires
  d'annulation/interruption ne sont pas changés.
- `DriverNavigationControls.tsx` ajoute les libellés visibles « Arrêter »,
  « Son », « Options », « Actualiser », dans des cibles de 56 points.
  `driverNavigationLayout.ts` réserve leur place et celle du prochain arrêt ;
  la liste d'arrêts ne se réduit plus à une zone de hauteur nulle sur petit écran.
- `components/trip/TripShareAction.tsx` conserve la largeur naturelle du libellé
  compact. Un aperçu a révélé que `flex: 0` pouvait comprimer « Partager »
  lettre par lettre ; ce comportement est remplacé par une base automatique
  sans rétrécissement du texte.

La compétence `frontend-skill` a guidé une action dominante, des mots courts,
moins de texte et des commandes lisibles, sans nouveau décor ou animation de
navigation. Le loader illustré existant conserve sa réduction des mouvements.

## Protections et comportements conservés

- Aucun trajet terminé, annulé, non accepté ou avec arrivée du passager déjà
  déclarée n'est repris comme trajet actif. Le contrôle serveur reste obligatoire.
- Une seule reprise automatique par entrée au premier plan et par compte.
  Quitter volontairement la navigation permet toujours d'utiliser l'accueil.
- Paiement, conversation, SOS, formulaires et actions explicites de notification
  ne sont pas remplacés par cette redirection. Les panneaux de trajet déjà
  ouverts gardent la priorité.
- Les réponses tardives après changement de compte, session, route, arrière-plan
  ou démontage sont ignorées. Un passage en arrière-plan ne monte pas un premier
  dashboard encore bloqué par la décision d'entrée.
- Les confirmations passent toujours par la file persistante existante, avec
  protection contre les doubles appuis et vérification de l'étape. Aucun état
  final ou paiement n'est inventé localement. L'arrivée du passager conserve
  le déclenchement existant du paiement ; les désaccords restent vérifiables.
- Contact, SOS, partage, détails, autres passagers et commandes secondaires
  restent disponibles. Aucun changement des cadences GPS/socket ou de la barre
  d'onglets. Aucune dépendance ajoutée.

## Vérifications et limites

- 355 tests JavaScript réussis dans la sélection élargie : accueil, entrée de
  trajet, activité partagée, navigation, confirmations persistantes, panneaux,
  paiement à l'arrivée et partage. Après le dernier garde du premier rendu
  avant disponibilité du navigateur, 60 tests ciblés entrée/profil ont été
  rejoués avec succès, dont ce cas supplémentaire.
- Les tests de nouvel arrêt couvrent plusieurs passagers, les deux étapes,
  annulation, disparition et arrêt périmé. Les tests d'entrée couvrent les
  deux ordres de réponse profil/activité, rôle global différent de la
  participation, réseau lent, hors ligne, expiration du délai, relance,
  changement de compte, premier rendu, arrière-plan et sortie volontaire.
- Une première exécution très parallèle a révélé un test nouvellement ajouté
  dépendant d'une marge d'une seconde pendant le chargement des modules. Son
  horodatage de réponse est maintenant posé après l'entrée, conformément au
  scénario testé ; ce n'était pas une erreur de production constatée.
- `scripts/preview-active-navigation.cjs` rend les composants réels avec React
  Native Web dans `.expo/active-navigation-preview`. Les captures statiques
  conducteur/passager en 390 × 760 et 320 × 568 ont été consultées après les
  corrections : actions principales et contact/SOS visibles, prochain arrêt
  conservé dans une zone défilable et libellé Partager sur une ligne. Icônes
  remplacées par des glyphes, carte synthétique, aucune donnée de compte réel.
- TypeScript et lint des sources modifiées contrôlés ; résultats finaux
  consignés dans le journal technique.

Il ne s'agit pas d'essais natifs : refaire sur Android et iOS le démarrage à
froid et le retour au premier plan pour les deux rôles, un compte conducteur
réservant comme passager, le réseau lent/coupé, plusieurs passagers, de grands
caractères et TalkBack/VoiceOver. Vérifier les protections pendant un paiement,
un appel/contact et un SOS. Aucun build ni déploiement réalisé. Aucune diminution
de crash, de mémoire ou de chauffe n'est revendiquée sans mesure sur appareil.
