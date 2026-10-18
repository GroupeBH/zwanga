# Panneau des passagers pendant la navigation

Date : 25 septembre 2026. Périmètre : application mobile, navigation conducteur.

## Problème

La liste affichait deux lignes pour une réservation : récupération et dépose.
Après embarquement, le nom barré et grisé pouvait laisser croire que le passager
n'était plus concerné. Les compteurs avec icônes, le badge « Auto » et l'alerte
rouge sans libellé obligeaient le conducteur à deviner leur signification.
Le panneau occupait systématiquement 85 % de l'écran, même avec peu de données.

## Solution appliquée

- `passengerPanelModel.ts` regroupe les points par **identifiant de réservation**.
  Il produit une fiche pour chaque réservation, pas pour chaque place ni chaque
  étape. Deux réservations du même titulaire restent distinctes. Une réservation
  de trois places reste une fiche avec trois places.
- La fiche affiche « À récupérer », « À bord » ou « Déposé », le nom et
  le nombre de places. L'adresse correspond à l'étape actuelle : récupération
  avant embarquement, dépose ensuite. La dépose terminée prime sur une
  récupération encore incomplète dans l'instantané reçu.
- La fiche correspondant au prochain arrêt connu est placée en premier avec
  « PROCHAIN ARRÊT ». Les réservations déjà déposées passent en fin de liste.
  Ceci réordonne uniquement la présentation : les waypoints de navigation,
  le calcul d'itinéraire et l'ordre des arrêts ne sont pas modifiés.
- `NavigationPassengerRow.tsx` remplace les icônes ambiguës par deux boutons
  distincts : « Voir le point d’arrêt » et « Signaler un problème ».
  Aucun bouton n'est imbriqué dans un autre. Les réservations déposées restent
  lisibles, sans nom barré ni action de progression supplémentaire.
- `NavigationPassengersModal.tsx` affiche « Mes passagers », le nombre de
  réservations et de places, puis trois compteurs légendés : « À récupérer »,
  « À bord », « Déposés ». Ces compteurs utilisent toujours les **places**,
  conformément au calcul existant, pas le nombre de lignes de la liste.
- `NavigationPassengersModal.styles.ts` isole la présentation. Liste sobre,
  une seule mise en avant pour le prochain arrêt, texte à contraste lisible,
  actions d'au moins 44 points et retour à la ligne sur petite largeur.
  Le panneau a une hauteur liée au contenu, plafonnée à 85 % ; la liste défile
  et « Revenir à la carte » reste en dehors de celle-ci avec la marge basse sûre.
- `NavigationWaypointModal.tsx` ne prétend plus que le conducteur est déjà
  arrivé lorsqu'il ouvre simplement les détails d'un point depuis la liste.

Le skill frontend a orienté la refonte vers la hiérarchie nom → statut → lieu →
action, en retirant les badges décoratifs et les doublons. Aucune image,
animation décorative ou nouvelle fenêtre native n'a été ajoutée.

Les quatre fichiers de présentation/modèle cités sont dans
`features/driver-navigation/`.

## Comportements conservés et précautions

- GPS, détection automatique, confirmation manuelle existante, paiements,
  notifications, droits d'accès et backend : inchangés.
- Le détail et le signalement utilisent toujours le waypoint et l'identifiant
  de la réservation sélectionnée. Une pression ne valide ni embarquement ni dépose.
- Avant de naviguer vers le formulaire de signalement existant, la visibilité
  du panneau est désactivée. Aucun signalement n'est envoyé automatiquement.
- Les conditions de priorité des autres modals et le composant partagé
  `RideModal` sont conservés ; pas de second mécanisme de présentation iOS.
- `FlatList` conserve la virtualisation (lots de huit, fenêtre de trois,
  `removeClippedSubviews=false`). Le regroupement est mémoïsé et ne s'exécute
  pas quand le panneau n'est pas visible. Les lignes sont mémoïsées.
  Aucun nouveau polling, timer, abonnement ou appel réseau.

## Vérifications et limites

- 24 tests ciblés passent : `navigationPassengersPanel.test.js`,
  `multiPassengerNavigation.test.js`, `navigationHeaders.test.js`.
- Cas couverts : deux noms identiques, plusieurs réservations par titulaire,
  groupe de trois places, passage récupération → dépose, prochain arrêt,
  dépose terminée, liste vide, fermeture et priorités des modals.
- TypeScript : valide. `git diff --check` : valide.
  940 sources mobiles contrôlées, aucune au-dessus de 400 lignes.
- Ces tests JavaScript inspectent le modèle et l'arbre de composants ; ils
  ne mesurent ni le rendu Yoga réel ni la mémoire native. Aucun essai physique
  iOS/Android ni mesure de crash/chauffe pendant cette intervention.
- À vérifier sur appareils : petite hauteur, grande taille de police, adresses
  longues, défilement avec de nombreuses réservations, réception d'une alerte
  prioritaire pendant l'ouverture et retour depuis le formulaire de signalement.

Suite complète : 970/972. Les deux échecs préexistants de
`sourceExtractions.test.js` (empreintes des styles de réservation et API PIN)
restent présents ; leurs références n'ont pas été modifiées dans cette refonte.
