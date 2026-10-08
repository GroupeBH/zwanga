# Localisation des conducteurs pour les demandes proches — 8 octobre 2026

## Constat et périmètre

Le serveur possédait déjà l'allocation d'une demande immédiate au conducteur
éligible le plus proche, à partir de sa dernière position valide. Le mobile
envoyait une position uniquement au premier plan, toutes les 45 secondes, après
une requête supplémentaire de statut. Une position devenait inutilisable après
le délai de fraîcheur serveur : un conducteur laissant son téléphone en veille
ne pouvait donc plus recevoir de nouvelles propositions ciblées après ce délai.

Cette modification ajoute une collecte en veille, activée par défaut pour les
conducteurs si l'autorisation système d'arrière-plan est déjà accordée. À la
demande de l'utilisateur, ce comportement remplace l'activation supplémentaire
initialement proposée dans le profil. Un refus explicite dans Zwanga reste
mémorisé par compte. Pas de nouvelle étape de disponibilité, choix de véhicule,
dépendance, migration ou modification du backend. Ce n'est pas une garantie de
sonnerie ni une preuve de réduction de consommation sur appareil.

## Solution appliquée

- `services/nearbyDriverLocation.ts` : tâche Expo Location enregistrée au niveau
  du module, chargée dans `index.ts` avant le routeur. Profil `Balanced`, intervalle
  Android et regroupement différé demandés de 60 s. Renouvellement possible à
  l'arrêt, indicateur iOS et notification de service Android visibles. Démarrage
  uniquement depuis l'app au premier plan, avec permission système d'arrière-plan,
  identité authentifiée concordante et absence de désactivation explicite pour
  ce compte. L'absence de préférence correspond au mode automatique ; aucun
  appel de demande de permission n'est fait par cette tâche. Le service Android ne persiste pas après
  destruction demandée par l'utilisateur (`killServiceOnDestroy`). Les cadences
  natives restent à la discrétion du système.
- `services/nearbyDriverLocationPolicy.ts` : rejet des positions trop anciennes
  (plus de 30 s), futures (plus de 5 s), imprécises (plus de 250 m), coordonnées
  invalides ou signalées comme simulées. Après un envoi réussi, au plus un envoi
  par minute si déplacement d'au moins 100 m ; à l'arrêt, renouvellement après
  deux minutes **si une nouvelle position fraîche est fournie par le système**.
- `services/nearbyDriverPositionDelivery.ts` : un seul envoi en cours, partagé
  entre premier plan et tâche native. Réutilisation du transport authentifié
  `PUT /driver-dispatch/position` (délai existant de 10 s, renouvellement de session,
  contrôle serveur du rôle et de l'éligibilité). Attente progressive après erreur,
  de 30 s à 5 min ; aucun rejeu d'une ancienne position au retour du réseau.
  Les entrées de mutation RTK sont libérées après traitement.
- `components/DriverPresenceCoordinator.tsx` : suppression du GET de statut avant
  chaque prélèvement ; la mutation restitue déjà le statut serveur. Vérification
  au premier plan toutes les 60 s, arrêt des temporisations JS en arrière-plan
  et hors connexion. Repli sur la collecte au premier plan si l'arrière-plan est
  refusé ou indisponible ; aucun second prélèvement si la tâche native fonctionne
  ou qu'un suivi de trajet est actif.
- `services/background/driverGpsProfile.ts` et `passengerGpsProfile.ts` : après
  enregistrement de la session de trajet, suspension de la collecte de proximité
  avant le démarrage du GPS de trajet. Les callbacks de proximité vérifient aussi
  l'absence de trajet. La reprise hors trajet se fait depuis le premier plan.
  Un échec d'arrêt natif ne bloque pas le démarrage du suivi métier existant.
- `store/index.ts` : suppression du propriétaire de la tâche et arrêt à la
  déconnexion/changement de compte, sans effacer les préférences de désactivation.
  Générations de session et sérialisation empêchent un démarrage retardé de relancer
  un ancien suivi. Une session en cours de déconnexion est bloquée jusqu'à une
  nouvelle authentification ; le changement direct de compte ne bloque pas le
  nouveau conducteur. Le coordinateur suspend aussi ses lectures pendant le logout.
  `store/api/driverDispatchApi.ts` refuse une mise à jour du cache issue d'une
  ancienne session.
- `components/profile/NearbyDriverLocationPermission.tsx` et
  `app/driver-availability.tsx` : accès via Profil → Alertes conducteur,
  explication du mode automatique, bouton de désactivation si le téléphone autorise
  déjà le suivi, bouton de permission sinon. Désactivation possible même avant
  d'accorder la permission ; réactivation volontaire d'un réglage désactivé.
  Pas de demande de permission automatique au démarrage ni de
  bandeau supplémentaire sur l'accueil. Un refus conserve la découverte au
  premier plan. Le composant n'est pas proposé aux passagers.
- `app.config.js` et `ios/zwanga/Info.plist` : description de permission alignée
  avec le suivi de trajet et la recherche de demandes proches. Les capacités de
  localisation natives préexistantes sont réutilisées.

## Serveur et notifications conservés

Inspection en lecture seule de
`../zwanga-backend/src/trip-requests/dispatch/dispatch.service.ts`,
`dispatch.controller.ts` et `dispatch.dto.ts` : contrôle de rôle conducteur,
fraîcheur/précision, expiration de présence, rayon géographique, tri par distance,
véhicule et places compatibles, exclusion des conducteurs occupés, allocation
transactionnelle et acceptation/refus authentifiés existent déjà. Le serveur
conserve la décision ; le client ne choisit pas les destinataires.

Une proposition ciblée `driver_dispatch_offer` conserve la sonnerie dédiée,
les boutons Accepter/Refuser et son échéance. Les réservations `new_booking`
restent inchangées. Arrêt sonore à l'ouverture de Zwanga conservé. Une annonce
générale `trip_request` reste distincte et ne fait pas sonner tous les conducteurs
pendant 30 s. Voir aussi [le fonctionnement des sonneries](SONNERIES_DEMANDES_2026_10_08.md).

L'allocation serveur doit être activée et le token push courant enregistré par
un client compatible. Aucune configuration, base ou infrastructure de production
n'a été modifiée pendant cette intervention.

## Données et limites

Le stockage local ajouté contient uniquement le compte propriétaire de la tâche
et les choix de désactivation par compte, pas d'historique de positions ni de
file de coordonnées. La clé historique du consentement est conservée pour le
propriétaire de la tâche, afin de rester compatible avec une inscription native
existante ; elle ne constitue plus un prérequis d'activation du mode automatique.
Les choix de désactivation survivent à une déconnexion et à un redémarrage.
Les positions envoyées
utilisent le stockage serveur de présence déjà existant et sa politique de
fraîcheur/rétention ; cette politique n'a pas été modifiée ici. À la révocation,
la dernière position déjà reçue par le serveur reste soumise à son expiration
normale. Désactiver la collecte en veille ne désactive pas les notifications de
réservation ni l'utilisation des positions autorisées au premier plan.

Un arrêt forcé, une restriction d'économie d'énergie, le refus de permission ou
l'absence de position récente peuvent interrompre l'éligibilité. Une permission
« Toujours » est nécessaire sous iOS ; sous Android la localisation de fond et
le service visible doivent être autorisés. Ni une socket ni un webhook ne peuvent
remplacer l'autorisation du système pour réveiller le GPS d'une app arrêtée.
Référence : [Expo Location](https://docs.expo.dev/versions/v54.0.0/sdk/location/).

Le volume, le mode silencieux et Ne pas déranger restent sous le contrôle du
téléphone. Aucun contournement ajouté, ni CallKit/PushKit.

## Vérifications

- `npm run test:nearby-drivers` : **87 tests JavaScript réussis**, avec modules
  natifs simulés. Inclut nouveaux tests `nearbyDriverLocation`, `nearbyDriverDelivery`,
  `nearbyDriverPermission`, ainsi que disponibilité, sessions GPS conducteur et
  passager, suivi actif, actions de notification et assets de sonnerie.
- `tests/driverAvailability.test.js`, `driverGpsLifecycle.test.js`,
  `driverBackgroundSession.test.js`, `passengerGpsProfile.test.js` adaptés aux
  nouvelles dépendances ; les assertions de suivi métier sont conservées.
- `npx tsc --noEmit --incremental false` et ESLint sur les fichiers TypeScript
  modifiés : réussis.
- `npm run check:source-size` : 1 052 sources, aucune au-delà de 400 lignes.
  `git diff --check` : réussi.
- Suite complète `node --test --test-concurrency=4 --test-reporter=dot tests/*.test.js` :
  trois échecs dans `sourceExtractions.test.js`, comparaisons de références pour
  les styles d'authentification et les endpoints de réservation/demande. Les
  mêmes écarts ont été recalculés sur les contenus du dernier commit `HEAD`
  avec `git show`, sans modifier la copie de travail : ils sont antérieurs à
  cette intervention. Les références n'ont pas été régénérées arbitrairement.
  Aucun autre échec signalé par cette exécution complète.
- La cadence, l'attente progressive, les doubles callbacks, les réponses tardives
  et la révocation pendant un démarrage natif retardé sont exercés en JavaScript.
  Sont également vérifiés : activation sans préférence préalable, refus système,
  isolation par compte, désactivation persistante après logout/redémarrage,
  réactivation explicite et absence de relance pendant une déconnexion.
  Aucun chiffre de batterie/chauffe mesuré, aucun test physique iOS/Android et
  aucun push réel envoyé dans cette intervention.

## Construire et tester sur appareils

```sh
npm run test:nearby-drivers
npx eas-cli build --platform android --profile dev-device
npx eas-cli build --platform ios --profile dev-device
npx expo start --dev-client
```

Ces builds ne sont pas lancés par cette intervention. Le profil `dev-device`
vise des appareils physiques ; Expo Go n'est pas adapté à ce test. Le backend
de développement doit être accessible depuis le téléphone.

1. Connecter un conducteur éligible, véhicule actif, notifications autorisées.
   Si la localisation d'arrière-plan est déjà autorisée, vérifier le démarrage
   automatique et l'indicateur/notification système, sans passer par le profil.
   Sinon, dans Profil → Alertes conducteur, accorder l'autorisation après avoir
   lu l'explication. Sans permission, vérifier le maintien du premier plan seul.
2. Verrouiller le téléphone plus longtemps que la validité de la dernière
   position serveur, puis créer une demande immédiate proche depuis un autre
   compte de test. Vérifier, avec deux conducteurs de test, le choix du plus
   proche **éligible**, le véhicule/les places compatibles et l'absence de ciblage
   d'une position périmée.
3. Vérifier le son prolongé, Accepter/Refuser, l'expiration sans réponse et l'arrêt
   de la sonnerie à l'ouverture de l'app. Refaire le test pour une réservation
   d'un trajet publié, qui ne dépend pas de la localisation de proximité.
4. Démarrer/terminer un trajet : pas de double suivi natif, navigation et remontées
   conducteur/passager conservées, reprise de la recherche depuis le premier plan.
5. Tester réseau perdu/retrouvé, GPS désactivé, permission révoquée, déconnexion,
   changement de compte et fermeture forcée. Aucune réutilisation de position
   ancienne comme si elle venait d'être mesurée.
   Désactiver le suivi dans le profil, se déconnecter puis reconnecter le même
   compte : il doit rester désactivé jusqu'à une réactivation volontaire.
6. Mesurer consommation et cadence GPS réelles en veille et en déplacement sur
   iPhone et plusieurs marques Android avant de conclure à un gain de batterie.
   Mettre à jour les déclarations de confidentialité/stores si leur description
   actuelle ne couvre pas la localisation conducteur hors trajet.
