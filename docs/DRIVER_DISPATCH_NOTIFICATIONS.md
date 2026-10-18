# Alertes conducteur automatiques et partage de trajet — 6 octobre 2026

## Périmètre et évolution

Ce guide décrit le code actuel et remplace les consignes de disponibilité manuelle du
5 octobre, conservées dans le journal historique. Problèmes : étape supplémentaire avant
de recevoir une demande, son système trop discret, actions ouvrant une interface,
et parcours d’ajout/notification des proches signalé comme faisant planter iOS.

- Réservation d’un trajet publié : alerte adressée à son conducteur, indépendamment
  de sa dernière position. Pas de réattribution ni d’expiration de la réservation après 30 s.
- Demande immédiate créée avec « Maintenant » : proposition personnelle au conducteur
  éligible le plus proche du point de départ, parmi ceux ayant une position récente.
  Proximité géographique PostGIS, pas estimation routière. Les demandes planifiées restent
  dans leur parcours existant et ne déclenchent pas cette recherche urgente.
- Une proposition en attente par conducteur et par demande. Refus ou expiration :
  recherche du suivant sans solliciter deux fois le même conducteur pour cette demande.
  Délai serveur 30 s par défaut, configurable. La demande garde sa propre échéance.
- Accepter attribue la demande dans une transaction. Le démarrage, le paiement,
  l’embarquement, l’arrivée et leurs validations ne changent pas.

## Automatique ne signifie pas localisation permanente

Aucun bandeau à l’accueil, bouton « disponible », sélection de véhicule ni configuration
préalable. **Profil → Alertes conducteur** est uniquement informatif, avec accès aux réglages
du téléphone. Les permissions système de notification et de localisation restent nécessaires.

Le coordinateur utilise une permission GPS déjà accordée : aucun nouveau dialogue automatique.
Au premier plan, mise à jour immédiate puis toutes les 45 s, une seule opération en vol,
position de moins de 30 s et précision ≤ 250 m. Une opération GPS en attente est annulée
au passage en arrière-plan. Les accès HTTP restent dans RTK Query.

Le serveur conserve la dernière position pendant **300 s par défaut**, calculées depuis
son horodatage. Les candidats doivent encore être valides pendant le délai de réponse
plus 5 s. Une position plus ancienne ne remplace pas une position plus récente.
Une seule position est stockée, sans historique ; purge bornée des anciennes lignes conservée.

**Limite explicite :** aucun nouveau service de localisation permanente hors trajet.
Une demande peut arriver app en arrière-plan/verrouillée pendant cette fenêtre. Après une
fermeture prolongée sans position fraîche, le conducteur est exclu : on ne prétend pas
connaître sa proximité. Recevoir ces demandes indéfiniment nécessiterait un chantier GPS
d’arrière-plan, autorisations et validation batterie/confidentialité. Les notifications
des réservations publiées ne dépendent pas de cette limite.

Le serveur choisit un véhicule actif appartenant au conducteur et compatible avec la demande.
Il conserve le véhicule proposé lors des mises à jour GPS suivantes. Capacités par défaut :
2/3 places pour deux/trois roues, 4 pour voiture ; les règles des trajets publiés ne changent pas.
Le véhicule est indiqué dans l’alerte et dans la proposition détaillée.
Identité approuvée, compte actif, propriété du véhicule, capacité, absence de trajet/demande
en cours ou départ proche restent contrôlés côté serveur. Les anciens endpoints de
disponibilité restent compatibles avec les anciennes installations.

## Sonnerie et réponses rapides

- Son original généré en PCM WAV mono, **29 secondes**, fichier vérifié par lecture de
  l’en-tête WAV. iOS exige un son personnalisé inférieur à 30 secondes.
- Android : FCM data-only haute priorité, tâche Expo existante puis Notifee.
  Canal neuf `booking-ring-v2`, importance haute, vibration, son dédié, contenu privé
  sur écran verrouillé, boutons Accepter/Refuser sans ouverture d’activité.
  Notification stable pour éviter les doublons ; expiration de la carte des demandes,
  mais réservation publiée toujours accessible après la fin du son.
- iOS : alerte Expo/APNs, catégorie `driver-offer-v2`, son `driver_ring.wav`,
  interruption `time-sensitive` et entitlement correspondant.
  Les actions n’exigent pas l’ouverture de l’app, mais demandent le déverrouillage système.
  Un appui prolongé/développement de la notification peut être nécessaire selon l’OS.
- Les actions natives appellent directement les endpoints existants, via RTK Query et
  les identifiants SecureStore. Session/destinataire vérifiés, verrou anti-double clic.
  Le serveur vérifie à nouveau destinataire, statut, délai et répétition.
- Annulation de la notification tentée dès la réponse pour interrompre son alerte ;
  confirmation discrète et silencieuse après résultat serveur. Si réseau/état incertain,
  « Réponse à vérifier », jamais un faux succès ni une acceptation différée automatique.
  Toucher le résultat ouvre les détails. Un simple lien ne vaut jamais acceptation.
- L’écran entrant dans l’app conserve trajet/passager/prix/paiement/véhicule, boutons
  et compte à rebours serveur. Fermeture/réponse demande la suppression de l’alerte.
- Les capacités v2 sont liées à une empreinte versionnée du token push, dans la table
  existante. Les anciennes capacités v1 et les notifications ordinaires restent compatibles.

### Particularité native iOS

Expo SDK 54 n’exécute pas les actions iOS en tâche JS de fond comme sur Android.
Le délégué installé Notifee laisse normalement les notifications Expo au délégué Expo.
Un patch de build ciblé transmet **uniquement** les réponses `driver-offer-v2` avec le
protocole/type attendus à Notifee, en conservant les données Expo `userInfo.body`.
Les autres notifications gardent leur délégué. Script idempotent, échec explicite si
l’ancre du SDK change, exécuté au `postinstall`. Aucune nouvelle dépendance.

L’entrée `index.ts` enregistre les handlers avant Expo Router, y compris lors d’un
démarrage de fond. L’écoute des actions commence avant la restauration du profil ; un appui
sur le corps d’une alerte peut conserver une destination en mémoire jusqu’à cette restauration,
uniquement pour son destinataire. Aucune décision n’est mise en attente par ce mécanisme.
Pas de CallKit/PushKit, full-screen intent, service d’appel permanent,
boucle audio distincte, notification critique ou contournement du silencieux/DND.

**Non vérifié sur appareil :** volume réel, durée effectivement audible, interruption
du son iOS déjà en cours, affichage verrouillé, lancement JS par l’OS et pont Objective-C.
Ni la réception ni un volume « fort » ne sont garantis face aux réglages utilisateur,
économie d’énergie, arrêt forcé ou restrictions du système.

Références : [actions Android](https://notifee.app/react-native/docs/android/interaction/),
[actions iOS](https://notifee.app/react-native/docs/ios/interaction/),
[Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/notifications/),
[sons iOS](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/SchedulingandHandlingLocalNotifications.html).

## Proches et partage

Les routes détail/gestion/navigation ne montent plus les modals de sécurité et d’ajout
des proches. La route historique `/security` explique le partage manuel.
**Partager mon trajet** est libellé et visible, réutilise le lien de suivi public existant,
puis la feuille de partage du téléphone. Verrou synchrone jusqu’à la fin du partage,
état occupé accessible, erreur de repli. Sur navigation conducteur, une réservation urgente
ou arrivée prioritaire garde la place principale ; le partage reste dans les options.

Backend : politique centrale désactivée pour les quatre envois automatiques de proches
(embarquement/arrivée passager, embarquement conducteur, début/fin de trajet,
arrivée non confirmée), avant lecture des contacts ou appel réseau.
Les contacts déjà enregistrés ne sont pas supprimés. SOS, messages internes, OTP,
notifications du compte et lien de suivi restent distincts et conservés.
Ce retrait évite le parcours signalé ; **la cause native du crash iOS n’est pas établie
et aucune disparition globale des crashs n’a été mesurée**.

## Fichiers concernés par cette révision

Mobile :
- `components/DriverPresenceCoordinator.tsx`, `store/api/driverDispatchApi.ts`,
  `app/driver-availability.tsx`, `components/profile/ProfileDriverAvailabilityEntry.tsx`.
  Suppression du hook `hooks/driver-dispatch/useDriverAvailability.ts` et du style
  `features/driver-dispatch/DriverAvailability.styles.ts` devenus sans usage.
- `services/driverNotifications.ts`, `driverNotificationResponse.ts`,
  `notifeeBackgroundHandler.ts`, `hooks/notifications/useDriverNotifications.ts`,
  `features/notifications/driverInvitation.ts`, `app/incoming-driver.tsx`.
  `features/notifications/pendingDriverOpen.ts` conserve uniquement la destination à froid.
- `index.ts`, `package.json`, `app.config.js`, `scripts/generate-driver-ring.cjs`,
  `scripts/patch-notifee-expo-driver-actions.cjs`, `assets/sounds/driver_ring.wav`,
  copie native `android/app/src/main/res/raw/driver_ring.wav` (Android est versionné).
  iOS est aussi versionné : ressource déclarée dans `ios/zwanga.xcodeproj/project.pbxproj`
  et entitlement dans `ios/zwanga/zwanga.entitlements`, en plus de la configuration Expo.
- `components/trip/TripShareAction.tsx`, `hooks/manage-trip/useManagedTripShare.ts`,
  `app/security.tsx`, `app/trip/[id].tsx`, `app/trip/manage/[id].tsx`,
  `app/trip/navigate/[id].tsx`, composants de détail/gestion/navigation :
  `TripDetailContentSheet`, `ManageTripContent`, `DriverNavigationControls`,
  `DriverNavigationTopPanel`, `PassengerNavigationHeader`.
- Tests `driverAvailability`, `driverNotifications`, `driverNotificationResponse`,
  `driverNotificationNativeAssets`, `tripShareAction`, adaptations `manageTripSummary`,
  `navigationHeaders`, `ongoingTripBanner` et `startupSession` (doublures natives et partage).

Backend voisin (correctifs autorisés par l’outil) :
- `src/trip-requests/dispatch/dispatch.dto.ts`, `dispatch.controller.ts`,
  `dispatch.service.ts`, `dispatch-postgres.spec.ts`.
- `src/notifications/notifications.service.ts`, `driver-action-notifications.spec.ts`.
- `src/safety/trusted-contact-policy.ts`, son test, `src/bookings/bookings.service.ts`,
  `src/trips/trips.service.ts`.

Aucun nouveau schéma/migration dans cette révision. Prérequis de l’étape précédente :
migration `1780000048000-AddDriverDispatch`, unicités partielles, index PostGIS,
outbox transactionnelle, endpoints de réponse. Verrous courts, candidats bornés,
aucun envoi réseau dans une transaction. Les changements historiques restent dans le journal.

## Déploiement nécessaire, non effectué ici

1. Backend : appliquer la migration précédente si nécessaire après sauvegarde/test,
   avec `npm run migration:run`, puis déployer/redémarrer le code backend.
   Garder le mécanisme de migration habituel, jamais `synchronize` en production.
2. Activer `DRIVER_DISPATCH_ENABLED=true`. Réglages : `DRIVER_DISPATCH_RESPONSE_SECONDS`
   (30, bornes 10–120), `DRIVER_DISPATCH_RADIUS_METERS` (5000, 500–20000),
   `DRIVER_DISPATCH_POSITION_SECONDS` (300, 60–900). Le réglage legacy
   `DRIVER_DISPATCH_PRESENCE_SECONDS` ne concerne que les anciens clients.
   Ce sont les valeurs par défaut du code ; aucun fichier d’environnement consulté.
3. Reconstruire **obligatoirement** les binaires, pas seulement une OTA JavaScript :
   `npx eas-cli build --platform android --profile production`,
   `npx eas-cli build --platform ios --profile production`.
   Distribuer via piste interne Play/TestFlight. Vérifier le provisioning time-sensitive iOS.
   Le profil `dev` actuel cible un simulateur iOS ; ne pas l’utiliser tel quel sur iPhone.
   Aucun build/store/deploiement réel lancé ici.
4. Ouvrir la nouvelle app une fois, connecter le conducteur et laisser les permissions
   habituelles/enregistrement push se terminer. Aucun passage par « Alertes conducteur »
   n’est requis. Les autres notifications restent sur leurs canaux.

Repli : désactiver le flag remet les notifications classiques et stoppe les nouvelles
recherches. Les demandes immédiates en cours restent annulables, sans conversion automatique.
Ne pas supprimer les tables. La désactivation des messages aux proches reste indépendante.

## Recette physique obligatoire

Deux conducteurs et un passager de test :
1. Sans configurer de disponibilité, ouvrir les apps conducteurs avec GPS/notifications
   autorisés, puis verrouiller les téléphones ; créer « Maintenant ». Le plus proche du
   départ compatible reçoit seul la proposition. Tester aussi plusieurs véhicules.
2. Accepter/refuser **sur la notification** (développer la carte si nécessaire).
   Pas de confirmation UI supplémentaire ; confirmer l’état réel sur le serveur et
   chez le passager. Laisser expirer : alerte finie et proposition au conducteur suivant.
3. Réserver un trajet publié : alerte dédiée même sans position récente du conducteur,
   réponse rapide ; la réservation n’expire pas à la fin du son.
4. iOS et Android : premier plan, arrière-plan, verrouillé, processus fermé normalement,
   redémarrage à froid. Tester silencieux/DND/notifications refusées en observant les limites.
5. GPS refusé/périmé (>5 min par défaut), compte passager, driver occupé, véhicule inactif :
   aucune fausse éligibilité. Réouvrir l’app renouvelle la position autorisée.
6. Réseau coupé, délai serveur passé, doubles clics, deux appareils, changement de compte,
   annulation simultanée : pas de faux succès, réponse expirée ni acceptation différée.
7. Partager depuis détail/gestion/suivi, annuler/relancer la feuille iOS, vérifier absence
   d’ajout de contacts, absence de SMS proches même avec anciennes préférences, SOS intact.
8. Messages, OTP, paiements, suivi GPS de trajet actif : tests de non-régression.

## Vérifications automatisées et limites

Résultats finaux et commandes dans l’entrée du 6 octobre du
[journal technique](CHANGEMENTS_TECHNIQUES.md). Les tests JavaScript utilisent des
doublures natives. Le test PostgreSQL utilise exclusivement un cluster temporaire de test
en boucle locale, arrêté/supprimé après exécution ; aucune donnée applicative n’est consultée.

Commande depuis le backend, avec PostgreSQL/PostGIS local :
```powershell
$env:DISPATCH_TEST_POSTGRES_BIN = 'C:/Program Files/PostgreSQL/18/bin'
node node_modules/jest/bin/jest.js --runInBand src/trip-requests/dispatch/dispatch-postgres.spec.ts
```

Les skills frontend et PostgreSQL ont guidé respectivement la hiérarchie simple du partage,
le retrait de la configuration superflue et les transactions/index/sélections bornées.
Aucun essai physique, compilation Objective-C, mesure batterie, test de charge ni garantie
de livraison push effectué. Ces limites ne sont pas remplacées par les tests unitaires.
