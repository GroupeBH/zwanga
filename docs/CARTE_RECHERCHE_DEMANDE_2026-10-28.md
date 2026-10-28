# Recherche d’un conducteur sur carte — 28 octobre 2026

## Demande et périmètre

Après publication d’une demande, afficher les conducteurs proches sur une carte, animer la position du passager et ouvrir sa navigation lorsqu’un conducteur accepte. Auparavant, la route de détail présentait un ticket et attendait le démarrage du trajet pour rediriger vers une autre fiche.

> La section « Précision — Véhicules individuels et dernières positions connues » ci-dessous remplace le groupement par zone et le filtre de dix minutes décrits dans l’implémentation initiale. Les autres protections sont conservées.

## Solution initiale

- La route existante `/request-details/[id]`, déjà utilisée après création et au retour dans l’application, affiche maintenant `RequestSearchScreen` pour le propriétaire d’une demande ouverte. Un compte conducteur faisant sa propre commande est traité comme passager. Les demandes annulées/expirées gardent leur détail existant.
- Carte au-dessus d’un panneau compact : statut, départ, destination, horaire et budget **par place**. Modifier/Annuler restent hors du contenu défilant. L’application n’invente ni véhicules, ni disponibilité, ni heure d’arrivée.
- Le point du passager utilise une mesure GPS de moins de deux minutes. À défaut, le départ choisi est explicitement indiqué, sans le faire passer pour la position actuelle. Un halo lent utilise l’animation native et respecte la réduction des animations. Il est suspendu hors écran ; la projection du halo est invalidée lors des mouvements de carte et à la sortie.
- Le guide de conception UI a orienté une composition centrée sur la carte, avec peu de chrome et les actions essentielles accessibles. Le guide PostgreSQL a orienté la lecture géographique indexable et la restriction des informations retournées.

### Contrat serveur

`GET /trip-requests/:id/search-map`, authentifié, UUID validé, propriétaire uniquement, réponse privée sans cache HTTP, limite de 12 lectures/minute.

- Rayon de **5 km autour du départ enregistré**, véhicule/places compatibles, règles existantes d’éligibilité et de découverte.
- Une position de conducteur doit dater de moins de 10 minutes. Les refus de cette commande sont exclus. Une demande ciblée conserve son audience ; elle n’est pas diffusée à d’autres conducteurs par cette lecture.
- Le conducteur actuellement sollicité pour cette demande reste visible ; une sollicitation active pour une autre demande l’exclut.
- Les conducteurs sont regroupés par cellule géographique de 0,005 degré (environ 550 m à Kinshasa) : coordonnées approximatives et nombre par zone, sans identifiants de conducteurs, noms, téléphones ou positions exactes. Tous les conducteurs éligibles de la zone participent au comptage, et non seulement les 20 premiers de l’ancien sélecteur de conducteur.
- La requête réutilise `ST_DWithin` et les tables/index existants. Aucune migration, écriture métier, notification ou modification de la file de dispatch n’est déclenchée.

### Actualisation et navigation

- Lecture des positions toutes les 30 secondes, uniquement lorsque l’écran est visible, connecté et hors éditeur. Les réponses sont isolées par demande/session, validées avant passage à la carte et limitées défensivement à 500 repères. Un instantané de plus de 90 secondes n’est plus affiché ; la fraîcheur est mesurée à la réception locale pour éviter le décalage de l’horloge serveur/téléphone.
- Le statut de la demande conserve les invalidations temps réel existantes avec un secours REST à 5 secondes pour son propriétaire. Aucun deuxième socket n’est ajouté.
- Après attribution, lecture des réservations du passager pour **ce trajet seulement**. Une réservation acceptée et non terminée permet l’ouverture directe de `/booking/navigate/[bookingId]`, même avant le départ. La lecture peut prendre du temps : aucune navigation vers une réservation supposée n’est fabriquée.
- Une proposition partagée reste soumise à l’accord explicite du passager, via le panneau existant. Une simple offre ne déclenche pas de navigation automatique.
- Les transitions automatiques et le retour à l’accueil libèrent la carte avant changement d’écran ; les minuteries sont annulées à la sortie/changement de session ou de demande. Une erreur de navigation permet de réessayer. Cela ne constitue pas une preuve d’absence de crash natif.
- Une panne temporaire conserve la demande et un message compréhensible ; elle ne recrée pas la commande et ne bloque pas l’application sur la carte. Une simple actualisation n’immobilise plus Modifier/Annuler ; les verrous de mutation et contrôles serveur restent actifs.

## Fichiers concernés

Mobile : `app/request/[id].tsx`, `features/request-detail/RequestSearchScreen.tsx`, `RequestSearchMap.tsx`, `RequestOwnerModals.tsx`, `requestSearchModel.ts`, `RequestPassengerTicket.tsx`, `store/api/requestSearchApi.ts`, `hooks/request-detail/useRequestDetailData.ts`, `useRequestDetailExit.ts`, `hooks/useAssignedTripNavigation.ts`.

Backend voisin : `src/trip-requests/request-search-map.ts`, `request-search-map.spec.ts`, `trip-requests.controller.ts`, `trip-requests.service.ts`, `dispatch/dispatch-postgres.spec.ts`.

Tests mobiles : `requestSearchMap`, `requestSearchScreen`, `requestDetailExit`, `assignedTripNavigation`, ainsi que les contrôles existants d’entrée, formulaire, détail, réponse et lecture d’écran. Les simulations des composants de ciblage et du délai de réponse ont été complétées dans les tests de présentation existants ; leurs comportements restent testés séparément.

## Vérifications et limites

- Tests JavaScript mobiles ciblés : **125 réussis**, couvrant notamment publication, reprise à l’ouverture, ciblage, état de la carte, navigation, annulation des transitions et isolation des comptes. Puis **15 contrôles navigation/sortie réussis**, dont un nouveau cas de transition ignorée (126 cas distincts) : récupération bornée à deux secondes afin de restaurer les actions plutôt que garder un chargement infini.
- Backend : **8 tests unitaires réussis** et **3 scénarios réussis sur PostgreSQL/PostGIS jetable local** (groupement/confidentialité/refus/clôture ; ciblage/auto-exclusion/désactivation ; sollicitation de cette demande ou d’une autre). La première tentative en environnement restreint n’a pas pu démarrer PostgreSQL ; la relance autorisée hors sandbox a réussi. Aucun accès à la base applicative.
- TypeScript mobile et backend de production vérifiés ; ESLint ciblé, frontières réseau et taille des sources mobiles contrôlés. Ce ne sont pas des compilations Xcode/Gradle.
- Aucun essai de ce nouvel écran sur téléphone physique, aucune capture native Android/iOS, aucun push réel ni test de charge production. Les animations, le cadrage en petits écrans/grands caractères, les changements d’orientation et le partage de trajet sont à valider sur appareils avant diffusion.
- Déployer le nouvel endpoint backend avant de distribuer la version mobile pour afficher les conducteurs. Un ancien serveur sans cet endpoint donne un état « Positions indisponibles », mais la demande et les actions existantes restent accessibles. Aucun déploiement effectué.
- Les constats de l’audit précédent sur les notifications avec prix restent un périmètre distinct ; aucune carte n’est ajoutée à Notifee et aucune correction native de cet audit n’est annoncée ici.

## Précision — Véhicules individuels et dernières positions connues

### Demande et changements appliqués le 2026-10-28

Le passager doit voir les véhicules autour du départ à leur dernière position connue, et non un véhicule représentant plusieurs conducteurs dans une cellule géographique.

- L’endpoint propriétaire renvoie maintenant `vehicles` : identifiant de repère opaque propre à la demande, latitude/longitude enregistrées sans arrondi, type de véhicule et `positionUpdatedAt`. Un seul véhicule actif compatible est choisi par conducteur selon la sélection existante ; il ne s’agit pas de localiser séparément tous les véhicules de son garage.
- La date correspond au champ de position existant `driver_dispatch_presence.updatedAt`, alimenté par les mécanismes GPS/présence déjà en place. Aucune nouvelle collecte ni permission n’est ajoutée.
- Suppression du filtre propre à cette carte qui cachait les positions de plus de dix minutes. La politique existante de dernière position connue reste applicable : partage désactivé explicitement = exclusion ; ancien enregistrement sans autorisation durable = validité de son bail respectée. Il n’est pas supposé qu’une ancienne position représente la position actuelle du véhicule.
- Les images voiture/moto/tricycle existantes sont réutilisées, une par repère. Un toucher affiche « Dernière position connue : il y a … ». À partir de dix minutes, le repère est atténué et le panneau explique les véhicules plus pâles. L’âge est calculé avec l’horloge serveur, puis le temps écoulé localement depuis réception, pour supporter un décalage d’horloge du téléphone.
- Les filtres d’éligibilité, de compatibilité, de refus et de ciblage ainsi que le rayon de 5 km autour du départ sont conservés. Une simple lecture ne diffuse pas la demande et ne change pas la file de notification.
- Les identifiants de compte/véhicule, noms, plaques et téléphones ne sont pas retournés. Les coordonnées individuelles sont accessibles uniquement au propriétaire de la demande encore ouverte, avec les contrôles et limites de fréquence existants. Ce sont des données de position réelles : les repères ne constituent pas une anonymisation des coordonnées.

### Performance et compatibilité

- Sélection géographique `ST_DWithin` et index existant conservés. Tri par distance puis conducteur, lecture bornée à 501 lignes : au maximum les 500 véhicules les plus proches sont transmis, `truncated` signale un dépassement et l’interface l’indique. Aucun regroupement ou décalage artificiel de coordonnées ; deux véhicules au même point peuvent donc se superposer et nécessiter de zoomer.
- Cette borne protège la quantité de données et les repères natifs ; elle ne constitue pas un test de charge de la requête ni une garantie de fluidité pour 500 repères sur tous les téléphones.
- Les anciens `groups` restent présents pour compatibilité, calculés à partir de cette sélection avec leur filtre de dix minutes. `total` décrit désormais les véhicules transmis. Le mobile précédent comptait ses groupes lui-même ; le nouveau mobile compte ses véhicules validés.
- Un ancien backend ne retournant que des groupes ne donne pas lieu à de faux véhicules aux centres des zones : l’application indique les positions indisponibles et conserve les actions. Déployer le backend enrichi avant le nouveau mobile.
- Actualisation toutes les 30 secondes à l’écran, expiration de l’instantané après 90 secondes, mise en pause hors écran/hors ligne, protection du cycle de vie natif et navigation vers la réservation acceptée inchangées. Les positions anciennes du GPS et l’ancienneté de l’instantané API sont deux notions distinctes.
- Les règles PostgreSQL ont guidé le maintien du filtre géographique indexable, la réponse bornée et la restriction des champs accessibles. Pas de migration ni modification des sources Android/iOS.

### Fichiers et vérifications de cette précision

Mobile : `features/request-detail/requestSearchModel.ts`, `RequestSearchMap.tsx`, `RequestSearchScreen.tsx`, `tests/requestSearchMap.test.js`, `requestSearchScreen.test.js`, nouveau `requestSearchVehicleMarkers.test.js`.

Backend : `src/trip-requests/request-search-map.ts`, `request-search-map.spec.ts`, `dispatch/dispatch-postgres.spec.ts`.

- **109 tests JavaScript mobiles réussis**, en deux exécutions de 40 puis 69 tests : coordonnées individuelles, images et info-bulles des trois types, âge/fraîcheur/décalage d’horloge, positions invalides, compatibilité ancien serveur, lecture à l’écran, refus/ciblage, formulaire, actions et navigation.
- **10 tests backend unitaires réussis**, dont bornage à 500, champs exposés, positions anciennes, isolement par demande et contrôles d’accès.
- **3 scénarios PostgreSQL/PostGIS jetables réussis**, 81 autres cas non sélectionnés : coordonnées proches non regroupées, position ancienne, refus/clôture, audience ciblée/auto-exclusion/désactivation et conducteur sollicité pour cette demande ou une autre. Aucune base applicative ni donnée réelle utilisée.
- TypeScript mobile et build backend sans émission réussis ; ESLint ciblé mobile sans erreur ; frontières réseau valides ; 1 215 sources contrôlées, aucune au-dessus de 400 lignes.
- Tests de composants exécutés en JavaScript avec dépendances natives simulées : **aucun essai Android/iPhone ni compilation native effectué pour cette précision**, aucun déploiement ni push réel. Le rendu des icônes, leur superposition, les info-bulles et les performances sur appareils restent à vérifier.
