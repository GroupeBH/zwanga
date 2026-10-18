# Navigation conducteur simple

Date : 18 octobre 2026. Périmètre : présentation mobile du trajet conducteur
et variante conducteur du composant de confirmation partagé.

## Problème et objectif

Le conducteur devait interpréter simultanément durée, arrêts, confirmations et
commandes secondaires. Le bouton permanent « Arrêter » ne distinguait pas la
pause de l’arrêt anticipé. L’utilisateur jugeait le parcours difficile à comprendre.
La simplification suit une hiérarchie centrée sur une prochaine action, selon
le skill `frontend-skill`, sans ajouter d’animation ou d’écran intermédiaire.
L’amélioration de compréhension reste à valider avec les chauffeurs concernés.

## Solution appliquée et fichiers

- `features/driver-navigation/DriverNavigationTopPanel.tsx` : en-tête compact
  « Trajet en cours », connexion et durée/distance secondaires. Regroupement
  du prochain passager, de son adresse et de sa confirmation dans un même bloc.
  Contacter cible ce passager lorsque la prochaine étape est connue ; le choix
  des contacts reste disponible sinon. SOS reste visible. La flèche porte
  « Retour au trajet » : elle conserve la destination réelle, l’écran de gestion
  du trajet, sans demander son arrêt. Suppression du partage permanent redondant
  avec l’action conservée dans Plus.
- `features/driver-navigation/DriverNavigationPassengersBar.tsx` :
  « Allez chercher le passager » ou « Emmenez le passager à l’arrivée », nom et
  adresse lisibles, sans ouverture obligatoire d’une fiche. Si tous les arrêts
  sont traités, indication de l’arrivée du trajet. Si la prochaine étape manque
  mais que des arrêts restent à faire, invitation à consulter Les arrêts.
- `features/ride-recovery/RideRecoveryControl.tsx` : variante visuelle explicite
  `driverNavigation`, action principale d’au moins 52 points et indication
  « Appuyez quand le passager est monté/descendu. Véhicule à l’arrêt. ».
  Passagers, Contacter et SOS occupent la rangée secondaire. Les autres usages
  conducteur et passager conservent leur présentation par défaut.
- Lorsqu’une nouvelle réservation est présentée, `driverOverviewOnly` remplace
  la confirmation directe par Mes passagers : aucun nom de nouveau client ne
  surmonte une action portant sur une autre réservation. Le contrôle reste monté,
  avec ses protections contre les doubles appuis et ses déclarations en cours.
  Mes passagers ouvre la feuille existante, sans déclarer une montée ou descente.
- `features/driver-navigation/DriverPendingBookingPrompt.tsx` : identité et
  Contacter en tête, adresses défilantes, Accepter/Refuser hors de ce défilement.
  Cette disposition corrige le chevauchement observé dans l’aperçu sur petit écran.
- `features/driver-navigation/DriverNavigationControls.tsx` : après la précision
  de l’utilisateur le même jour, quatre commandes permanentes Ma position,
  Partager le trajet, Arrêter le trajet et Plus. Le bouton d’arrêt est rouge,
  plus large, et ouvre la confirmation existante ; il ne termine pas le trajet
  immédiatement. Une demande existante affiche Arrêt demandé et donne accès
  à son état. Partager ouvre le partage existant, avec indicateur de chargement
  et protection pendant la création du lien. Les deux boutons se désactivent
  hors écran. Plus rassemble le réglage du son, Les arrêts, Actualiser la route,
  Modifier, les passagers sur la carte, les gains et les portions de route
  lorsqu’ils sont disponibles. La largeur de la rangée s’adapte à l’écran et à
  ses marges latérales. Les gestionnaires métier continuent de vérifier l’état
  réel au moment de l’action.
- `features/driver-navigation/driverNavigationLayout.ts` : ajustement des limites
  du bloc supérieur et du guidage pour réserver l’espace des commandes sur les
  petits écrans, en conservant les marges système et les zones défilantes bornées.
- `features/driver-navigation/NavigationPassengersModal.tsx`,
  `NavigationPassengerRow.tsx`, `NavigationWaypointModal.tsx` : mots plus directs
  (À prendre, À bord, Descendus, Voir l’adresse, Où prendre/déposer le passager).
- `hooks/driver-navigation/useDriverTripActions.ts` et `app/trip/navigate/[id].tsx` :
  libellés simples et cohérents pour la pause, la reprise, l’arrêt anticipé,
  l’adresse introuvable et le retour à l’écran du trajet. Les dialogues sensibles
  expliquent toujours l’accord attendu des passagers ; les destinations des liens
  et les mutations restent inchangées.
- `scripts/preview-active-navigation.cjs` : scénarios conducteur prise en charge,
  descente, nouvelle réservation, aucun passager et hors connexion aux deux formats
  précités. Le scénario de réservation utilise le vrai composant de présentation.

Complément : les tests de commandes vérifient désormais la présence directe
de Partager et Arrêter sans ouvrir Plus, leurs états occupés/désactivés, le refus
de callbacks devenus inactifs et les tailles tactiles à 320 px. La dernière
recette commune accueil/navigation/recherche compte 206 tests réussis ; voir
[le complément accueil](ACCUEIL_CONDUCTEUR_CLIENTS.md). L’aperçu final de descente
avec les quatre commandes a été inspecté à 320 × 568 et 390 × 760 sur Web.

## Comportements conservés et précautions

- Une montée ou descente peut toujours être déclarée en un appui depuis la prochaine
  étape. Pas de nouveau modal de succès. Les règles de confirmation, de détection
  automatique, la file hors connexion et la validation par l’autre participant
  ne sont pas modifiées.
- La réservation et l’étape préférées restent explicitement vérifiées. Un ancien
  point de prise en charge ne devient pas une déclaration de descente en un appui.
- Arrêt anticipé avec des passagers à bord : accord de tous toujours nécessaire.
  Pause sans passager et retour à la gestion restent distincts de la fin du trajet.
- Actions désactivées pendant leur traitement ou lorsque l’écran n’est plus actif ;
  les contrôles de session, changement de trajet et réponses tardives sont conservés.
- Les coordonnées complètes restent consultables sans troncature de l’adresse dans
  le contexte courant. Les détails longs défilent ; les commandes restent distinctes.
- Paiements, gains, autorisations de contact, signalements, GPS, sockets, carte native,
  APIs et backend ne sont pas modifiés. Aucun nouveau polling ni nouvelle dépendance.
- Les champs `.env`, données personnelles et secrets sont hors du périmètre.

## Vérifications réalisées

Suite Node ciblée : **158 tests réussis, zéro échec**, dans les fichiers suivants :

- `tests/driverNavigationCompact.test.js`
- `tests/navigationHeaders.test.js`
- `tests/rideRecoveryUI.test.js`
- `tests/navigationPassengersPanel.test.js`
- `tests/driverPendingBookingLayout.test.js`
- `tests/passengerInterruptionPreview.test.js`
- `tests/driverInterruptionExit.test.js`
- `tests/navigationLifecycle.test.js`
- `tests/rideRecovery.test.js`
- `tests/rideOverlays.test.js`
- `tests/driverBookingRevenue.test.js`
- `tests/tripStartNavigation.test.js`
- `tests/driverActionsReadIsolation.test.js`

Les tests modifiés couvrent la hiérarchie des commandes, les bornes d’affichage,
la confirmation d’un seul passager/étape, les doubles appuis, la présentation d’une
réservation entrante sans confirmation du mauvais passager, les contacts et les
options toujours accessibles. Les suites existantes vérifient aussi les réponses
tardives, le hors connexion, les gains et les interruptions.

Autres contrôles :

- TypeScript `--noEmit --incremental false` : réussi.
- `scripts/check-network-boundaries.js` : réussi.
- `scripts/check-source-size.cjs` : réussi, 1 090 sources contrôlées, aucune au-delà
  de 400 lignes.
- ESLint ciblé : zéro erreur ; trois avertissements préexistants dans
  `useDriverTripActions.ts` (deux imports du même module, une dépendance de hook).
- `git diff --check` : réussi.
- Aperçus React Native Web inspectés sur les formats 390 × 760 et 320 × 568 :
  prise en charge, descente et nouvelle réservation. Correction du chevauchement
  de la nouvelle réservation avant la vérification finale. Données fictives,
  fond cartographique et icônes de substitution : ce ne sont pas des captures natives.

## Limites et validation restante

Aucun essai sur Android/iOS physique, build natif ou déploiement réalisé pour ce
changement. Les tests JavaScript et aperçus Web ne prouvent ni l’absence de crash
ou de chauffe, ni une amélioration mesurée des performances. La carte native,
les très grandes tailles de police, TalkBack/VoiceOver et les gestes réels doivent
être vérifiés sur appareil. Les variantes sans passager/hors connexion disposent
d’un aperçu généré mais n’ont pas toutes fait l’objet d’une inspection visuelle.

Recette recommandée, véhicule à l’arrêt : prise en charge puis descente ; plusieurs
passagers ; arrivée d’une réservation pendant une confirmation ; contact/SOS ;
pause sans passager puis reprise ; arrêt anticipé avec passager ; coupure réseau,
retour au trajet et retour dans la navigation. Faire ensuite essayer le parcours
aux chauffeurs pour vérifier les mots et la reconnaissance de l’action attendue.
