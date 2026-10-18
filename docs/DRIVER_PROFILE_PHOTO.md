# Photo du conducteur : publication et rendez-vous

Date : 25 septembre 2026. Périmètre : application mobile et `zwanga-backend`.

## Problème et règle retenue

Le conducteur pouvait publier plusieurs trajets sans photo. Les alertes de
prise en charge montraient le véhicule, mais pas son visage.

« Plus d'un trajet » est interprété comme la **deuxième publication du compte**,
pas uniquement deux trajets simultanément actifs. Le premier trajet public
ponctuel reste possible sans photo. Une annulation ou suppression ne remet
pas ce droit à zéro. La règle ne change ni l'activation conducteur, ni la
vérification d'identité, ni les droits d'un passager dans sa réservation.

## Solution backend

- `src/users/entities/user.entity.ts` : ajout du booléen serveur
  `hasPublishedTrip`, absent des DTO de modification du profil.
- `src/database/migrations/1780000044000-AddDriverPublicationPhotoPolicy.ts`
  et `src/database/migrations/index.ts` : création de la colonne, enregistrement
  de la migration et reprise des publications publiques encore en base,
  y compris les trajets terminés ou annulés.
- `src/trips/trip-publication-photo.ts` : verrou du compte conducteur,
  lecture de sa photo actuelle, vérification du droit, sauvegarde des trajets
  et mise à jour de la trace dans une transaction `READ COMMITTED`.
  Deux publications concurrentes passent ainsi par le même verrou.
  Un échec de sauvegarde n'enregistre pas de première publication.
- `src/trips/trips.service.ts` : branchement sur les publications ponctuelles,
  la génération récurrente et le passage d'un trajet privé en public.
  La création d'une programmation récurrente exige une photo avant de sauvegarder
  le modèle, puisqu'elle autorise plusieurs publications futures.
  Les modèles déjà existants sont aussi contrôlés au moment de leur génération.
  Si la photo manque, aucune occurrence du lot n'est publiée et la génération
  n'avance pas son marqueur ; les autres modèles restent traités par le cron.

La réponse est une erreur métier `DRIVER_PROFILE_PHOTO_REQUIRED`, pas une
erreur réseau ambiguë. Un conducteur abonné n'est pas exempté. Le contrôle est
indépendant des quotas journaliers, du véhicule et de la vérification d'identité,
qui restent en place.

Les trajets **privés** issus de l'acceptation d'une demande ne sont pas des
publications : ils ne consomment pas ce droit et restent possibles sans photo.
En revanche, les rendre publics applique la règle au conducteur du trajet,
même si l'action est déclenchée par le passager propriétaire de la demande.

Les recommandations du skill `supabase-postgres-best-practices` ont guidé
le verrouillage atomique et court : aucun appel réseau, géocodage, cache ou
notification dans la transaction. La recherche d'une publication existante
utilise `driverId`, déjà préfixe de l'index d'historique conducteur, et non un
chargement complet des trajets. Aucun polling n'a été ajouté.

## Solution mobile

- `features/publish/publicationPhotoPolicy.ts` et
  `hooks/publish/usePublishSubmission.ts` : refus explicite avec le bouton
  **Ajouter ma photo**. Il ouvre `/edit-profile` par empilement de navigation ;
  le formulaire de publication n'est ni réinitialisé ni remplacé. Le conducteur
  ajoute sa photo avec le parcours existant, revient puis relance la publication.
  Aucun envoi automatique, aucune réconciliation d'une erreur métier et aucun
  chargement de l'historique pour recalculer le nombre de publications côté client.
- `features/navigation/PickupDriverDetails.tsx` : bloc compact de 52 px avec la
  photo, le nom et le libellé « Votre conducteur ». Le composant est mémoïsé
  sur des propriétés simples. L'image utilise le composant natif, sans animation.
  Une erreur d'image affiche « Photo non disponible » sans réessai en boucle.
  Une URL remplacée peut être chargée à nouveau. Aucune reconnaissance faciale
  ni validation du contenu de la photo n'est introduite.
- `features/navigation/PickupVehicleDetails.tsx` : intègre ce bloc sans retirer
  la marque, le modèle, la couleur, la plaque ni le rappel de vérification.
  Le conducteur reste visible même si les données du véhicule sont absentes.
- `features/navigation/pickupAwareness.ts` : complète uniquement les données
  du même trajet, sans remplacer une identité conducteur actuelle par un ancien
  instantané ni reprendre un véhicule explicitement remplacé ou retiré.

Le composant partagé est déjà utilisé par les alertes passager de l'accueil,
du détail du trajet et de la navigation : approche, arrivée du conducteur et
présence au point de récupération. Il affiche le **conducteur de ce trajet**,
jamais l'utilisateur connecté ni un véhicule par défaut. La déduplication
des alertes, leurs seuils et leur portée par réservation sont conservés.
Trois places réservées par une personne ne créent pas trois alertes.

## Déploiement et limites

1. Sauvegarder la base et valider la migration sur une copie de préproduction.
2. Exécuter les migrations backend avant de démarrer le nouveau code
   (`npm run migration:run` dans le backend, selon la procédure existante).
   La configuration du projet ne lance pas les migrations automatiquement.
3. Déployer le backend puis la version mobile apportant le message actionnable
   et les photos dans les alertes. Une ancienne app reçoit le refus serveur,
   mais ne possède pas le nouveau raccourci d'ajout de photo.

La migration n'a **pas été exécutée** pendant cette intervention et rien
n'a été déployé. Elle écrit dans `users` pour la reprise historique : prévoir
une fenêtre adaptée au volume et éviter les publications concurrentes d'anciens
serveurs pendant la migration/bascule. Le retour arrière automatique refuse
d'effacer la trace ; un retour arrière applicatif peut conserver cette colonne.

Les publications déjà supprimées avant la migration ne sont pas reconstructibles
à partir des tables actuelles. Un compte dont tous les anciens trajets publics
ont disparu pourra donc bénéficier une fois de la tolérance. Après mise en place,
la trace persiste même après suppression de ses trajets.

La présence d'une référence de photo enregistrée est contrôlée, pas son contenu
ni sa disponibilité distante. Le mobile gère l'absence ou l'échec de chargement.
Le passage temporaire par l'écran de profil conserve le formulaire en mémoire ;
ce n'est pas une sauvegarde persistante après arrêt forcé de l'application.

## Vérifications

- Tests mobiles ciblés : 22/22 passent (`driverProfilePhoto`,
  `pickupVehicleNotices`, `pickupProximity`). Identité du bon conducteur,
  reprise de données incomplètes, photo retirée, erreur de téléchargement,
  retour au profil sans remplacement du formulaire et seuils inchangés.
- Tests backend ciblés : 53/53 passent (`trip-publication-photo.spec.ts`,
  `trips.service.spec.ts`, `driver-publication-photo-migration.spec.ts`).
  Première/deuxième publication, photo vide, clé stockée/URL, lot récurrent,
  simulation de deux envois concurrents, échec de sauvegarde, acceptation privée,
  conversion en publication par le passager et contrat de migration.
- TypeScript mobile et backend : sans erreur. `git diff --check` : valide.
  Contrôle de taille mobile : 937 sources, aucune au-dessus de 400 lignes.
- Suite mobile complète : 964/966. Deux échecs déjà documentés avant cette
  intervention dans `sourceExtractions.test.js` : référence des styles de
  réservation et empreintes des endpoints PIN. Ni les sources concernées ni
  leurs références n'ont été modifiées pour masquer ces échecs.
- Les tests de transaction et de migration sont des tests Jest avec doubles,
  pas des essais PostgreSQL réels. L'exclusion concurrente réelle, les verrous
  de migration et le rollback transactionnel doivent être vérifiés en préproduction.
- Aucun essai sur téléphone iOS/Android réalisé. Vérifier sur petit écran et
  grande police les alertes sur accueil/navigation, le chargement d'image sur
  réseau lent, puis le parcours publication → photo → retour → publication.
  Aucune mesure native de mémoire, chauffe ou disparition de crashs annoncée.
