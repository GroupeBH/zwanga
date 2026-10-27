# Sonnerie : durée Android et reprise après erreur — 26 octobre 2026

## Signalement et constats

L'utilisateur signale des demandes parfois silencieuses sur un téléphone de
conducteur proche et souhaite une sonnerie dépassant 30 secondes lorsque le
système le permet. Aucun journal du téléphone concerné n'a été fourni : les
constats ci-dessous sont établis dans le code, sans attribuer avec certitude
chaque signalement à une seule cause.

1. Le serveur arrêtait la fenêtre d'amorçage à `createdAt + 30 secondes`, et non
   30 secondes après réception. Un envoi traité/livré après ce délai restait
   silencieux ; une carte informative pouvait néanmoins être conservée.
2. Android embarquait le même fichier de 29 secondes qu'iOS. La carte de demande
   joue volontairement ce fichier une seule fois pour garder une carte visible
   après le son, sans boucle native illimitée.
3. Après trois erreurs de lecteur au premier plan, le même événement pouvait
   rester définitivement sans nouvelle tentative jusqu'au changement de session
   ou à l'arrivée d'un autre événement.

## Corrections appliquées

- Fenêtre serveur de 60 secondes à partir de la création. Elle reste immuable
  lors des retries et bornée par l'expiration métier lorsqu'elle est présente.
  Une alerte arrivée après 45 secondes peut donc encore être amorcée ; une
  ancienne réservation ne se remet pas à sonner des heures plus tard.
- Les nouvelles offres exclusives utilisent un délai de réponse compris entre
  60 et 120 secondes. Une ancienne configuration inférieure à 60 retombe sur
  60. Les offres déjà créées et la fin de validité de la demande ne sont pas
  prolongées rétroactivement.
- Android : fichier PCM spécifique de 60 secondes, même sonorité, même niveau,
  mêmes canaux et même nom de ressource `driver_ring`. Les choix de son personnalisé,
  mode silencieux, volume, canal désactivé et « Ne pas déranger » sont conservés.
  La carte d'une réservation peut rester visible après la fin de son fichier.
- Le relais de l'application vers l'arrière-plan et l'activité plein écran
  Android acceptent désormais la fenêtre de 60 secondes, sans renouveler le
  délai serveur. Les offres expirées continuent d'être exclues.
- Au premier plan : après trois erreurs natives, pause d'une minute puis
  possibilité de réessayer le même événement encore en attente. Un afflux de
  nouveaux événements ne contourne pas ce délai. Un refus temporaire du contrôle
  audio est revérifié au plus toutes les cinq secondes, sans forcer le son.
- Le générateur produit séparément les fichiers iOS et Android. Le plugin
  Android réinstalle la version longue après la copie Expo lors d'un prebuild
  propre ; le contrôle de parité détecte aussi une ressource Android incorrecte.

Fichiers mobile : `features/notifications/driverRinging.ts`,
`services/backgroundRideRinging.ts`, `services/driverNotifications.ts`,
`services/foregroundRideSound.ts`, `native/android/notifications/IncomingRideActivity.java`
et son miroir Android, `assets/sounds/android/driver_ring.wav`,
`android/app/src/main/res/raw/driver_ring.wav`, `scripts/generate-driver-ring.cjs`,
`plugins/withDriverAlertSources.js`, `scripts/check-native-sources.cjs` et tests
associés. Le fichier iOS `assets/sounds/driver_ring.wav` est inchangé octet pour octet.

Fichiers backend : `src/notifications/notifications.service.ts`,
`driver-action-notifications.spec.ts`, `ride-delivery-reliability.spec.ts`,
`src/trip-requests/dispatch/dispatch.service.ts`, `dispatch-postgres.spec.ts`.

## Comportements conservés et limites système

La proximité seule ne suffit pas : le serveur utilise la dernière position
enregistrée, l'éligibilité du compte et du véhicule, l'absence d'un trajet
incompatible, le jeton push et les autorisations. La pause de 24 heures après
quatre demandes proches ignorées/refusées a ensuite été supprimée à la demande
de l'utilisateur : voir [le correctif dédié](SONNERIE_SANS_SUSPENSION_2026-10-26.md).
L'auteur d'une demande reste exclu de ses propres alertes.

Au premier plan, le lecteur conserve le fonctionnement existant jusqu'au
traitement de l'événement ou à son expiration. Son watchdog natif de 15 secondes
renouvelé par les contrôles de santé reste présent : il protège d'une boucle
orpheline si JavaScript se bloque. Ce watchdog n'est pas une limite de durée
de 15 secondes pour une session saine.

Android peut interrompre ou supprimer un son selon les réglages, le constructeur,
le panneau de notifications et l'état de l'application. Le fichier de 60 secondes
est une durée prévue, pas une garantie d'audibilité sur tous les appareils.
Les décisions continuent d'arrêter les alertes correspondantes.

Sur iOS en arrière-plan, le son de notification reste de 29 secondes : Apple
exige un fichier de moins de 30 secondes. La durée de validité d'une notification
et la durée du fichier sonore sont distinctes. Aucun détournement de CallKit,
aucune répétition de push pour contourner cette limite, aucun changement forcé
du volume ou du mode silencieux.

Références officielles : [sons de notification Apple](https://developer.apple.com/documentation/usernotifications/unnotificationsound),
[comportement des notifications Android](https://developer.android.com/reference/android/app/Notification).

## Vérifications

- Contrôle global final `node scripts/check-release.cjs` réussi : parité des
  sources et du son natif, TypeScript, ESLint, frontières réseau, taille des
  sources et **2 734 tests réussis**, zéro échec, un test Ruby ignoré sous Windows.
- 79 tests mobiles ciblés réussis : délais, relais en arrière-plan, reprise après
  erreurs, décisions, autorisations, format/durée des fichiers, parité des sources
  et ordre réel des mods de prebuild sur une arborescence temporaire.
- Le test du watchdog compile la classe Java de production avec des substituts
  Android/React Native. Il vérifie sa logique, pas l'audio d'un téléphone.
- Backend, avant suppression de la suspension : 125 tests du flux de demandes,
  des sonneries et de l'ancienne pause réussis, dont PostgreSQL/PostGIS éphémères
  locaux. Les nouveaux résultats figurent dans le correctif dédié. Le test d'une livraison
  après 45 secondes conserve une fenêtre positive ; les tests d'expiration
  vérifient qu'une ancienne offre ne retrouve pas de validité. Compilation
  TypeScript de production réussie.
- Un ancien test du contrôle mobile complet exigeait le blocage définitif après
  trois erreurs. Son attente a été remplacée par la pause d'une minute avec
  reprise, puis le fichier concerné a été retesté avec succès.
- Aucun envoi réel ni déploiement. Nouveau build Android nécessaire pour le son
  natif et l'activité plein écran, puis déploiement backend pour les nouveaux
  délais. Une mise à jour JavaScript seule ne remplace pas le son natif installé.
- Pas d'essai acoustique sur Android physique/iPhone, pas de garantie nouvelle
  de réveil d'écran, pas de mesure de batterie ou de disparition des crashs.
