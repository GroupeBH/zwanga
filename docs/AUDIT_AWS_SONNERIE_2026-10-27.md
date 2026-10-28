# Vérification AWS des sonneries — 27 octobre 2026

## Demande et périmètre

Signalement : pendant des essais entre 14 h et 15 h à Kinshasa, un seul
conducteur entend la sonnerie ; après son refus, les autres n'entendent rien.
Un conducteur a découvert et refusé la demande depuis les priorités, sans avoir
constaté de notification. L'utilisateur confirme que les testeurs ont le même build.

Intervention en lecture seule sur AWS. Aucun changement de service, paramètre,
base métier ou notification ; aucune nouvelle tâche de diagnostic lancée.
Un relevé SQL antérieur, déjà présent dans le backend voisin, a été recoupé
avec sa sortie CloudWatch : comparaison complète des objets JSON identique.
Il provient d'une tâche terminée normalement, avec PostgreSQL en lecture seule.

- Journaux de l'API : **14 h–15 h Kinshasa**, soit 13 h–14 h UTC,
  121 événements, pagination épuisée.
- Relevé détaillé réutilisé : requêtes créées **14 h 30–15 h** ; sept commandes
  entre **14:48:21 et 14:58:35**. Ce relevé SQL ne couvre pas la première demi-heure.
- Service ECS stable sur la révision 29 depuis 13:33, une tâche sur une attendue.
  Image identifiée par son digest ECR et le commit
  `e35ae493030222c39fc30b080e3dbb2af3b5aadd`.
- Code de ce commit consulté via GitHub, sans fusion ni téléchargement dans la
  branche de travail. Les changements locaux de refus et de ciblage ne sont pas
  présents dans cette image de production.

## Faits constatés

| Contrôle | Résultat |
| --- | --- |
| Parcours des sept commandes | Programmées : `immediateDispatch=false` |
| Notifications créées | 6 par demande, 42 au total |
| Transport | 28 FCM, 14 Expo |
| Résultat fournisseur enregistré | 42 `sent`, aucun échec fournisseur dans ce relevé |
| Invitations exclusives de dispatch | Aucune pour ces sept demandes |
| Accusés de réception/affichage | 7, tous pour le même destinataire natif v6 |
| Reprises automatiques | 7 reprises natives, pour ce destinataire v6 |
| Refus enregistrés | 4 sur les sept demandes |

Les six notifications de chaque demande ont été créées au moment de la commande,
avant les refus. L'observation « un seul téléphone sonne » ne signifie donc pas
que le serveur a sélectionné un seul conducteur. `sent` confirme l'acceptation
par le fournisseur, pas l'affichage ni un son audible sur le téléphone.

Des accusés natifs ont été envoyés au serveur plusieurs minutes après leur
observation locale. Leur heure d'arrivée serveur n'est pas l'heure du push.
L'absence d'accusé sur les autres modes ne prouve pas à elle seule une absence
de notification : la télémétrie n'est pas uniforme selon le protocole.

## Défauts et limites identifiés

### 1. Pas de nouvelle sonnerie garantie après le refus d'une commande programmée

Dans le code déployé, `enqueueScheduledRequestAlert` diffuse aux conducteurs
éligibles et exclut ensuite les couples commande/conducteur déjà enregistrés
dans l'outbox. `declineNearbyRequest` enregistre le refus, sans rappeler
`allocateNext` ni déclencher un nouvel envoi urgent. Le cron peut encore contacter
un conducteur jamais contacté, mais ne refait pas sonner les destinataires du
premier envoi simplement parce que l'un d'eux a refusé.

La reprise des notifications `sent` sans accusé d'affichage ne concerne que le
récepteur Android v6. Elle est bornée à un renvoi, après 12 secondes, pendant les
45 premières secondes. Les autres protocoles ne bénéficient pas de cette reprise.
Les alertes observées ont une échéance d'environ 60 secondes. Ces différences
expliquent une limite réelle de disponibilité ; elles ne prouvent pas pourquoi
chaque téléphone silencieux n'a pas présenté son alerte initiale.

Fichiers déployés : `src/trip-requests/dispatch/scheduled-request-alert.ts`,
`dispatch.service.ts`, `src/notifications/nearby-request-cooldown.ts`,
`recover-unacknowledged-ride.ts`, `notifications.service.ts`.

### 2. Repli mobile considéré définitivement réussi dans la session

Défaut reproduit dans `hooks/auth/usePushRegistration.ts` :

1. Le mobile peut proposer v6, puis accepter v4/v3/v2 après un rejet de validation.
2. Le succès du repli remplit `capabilityKey` avec seulement compte + jeton.
3. Les tentatives périodiques et un retour au premier plan ne rehaussent pas ce
   protocole lorsque v6 devient disponible : le contrôle « déjà enregistré » sort
   avant de comparer le protocole effectivement accepté à celui désormais possible.

Reproduction JavaScript avec l'implémentation réelle du hook et I/O simulées :
repli `[6,4,3,2]`, récupération du serveur, attente simulée de trois minutes et
retour au premier plan ; aucune nouvelle inscription v6. Un scénario d'audit et
deux tests existants utilisés par le harnais ont réussi à caractériser ce comportement.
Ce défaut reste **à corriger** ; aucune correction d'exécution n'a été appliquée
durant cet audit.

Les protocoles v2 et v6 observés ne sont **pas** des numéros de build. Le même
build peut déclarer des capacités différentes selon la plateforme, l'état natif,
la session ou un repli. Le témoignage de l'utilisateur est donc compatible avec
ce relevé. Les traces disponibles ne permettent pas d'attribuer le repli reproduit
à un téléphone précis du test.

### 3. Refus et observabilité incomplets en production

Un avertissement HTTP concernant un refus apparaît à **14:55:27**. Le log ne
conserve pas son statut et son code d'erreur sous une forme exploitable
(`[[object Object]]`). Aucun refus correspondant n'apparaît dans le relevé.
Le code déployé exige encore un événement de sonnerie préalable pour refuser une
commande, ce qui est incompatible avec certains refus depuis la liste.
Le correctif local déjà préparé retire cette dépendance ; il n'est pas déployé.
Il serait inexact d'affirmer le statut HTTP exact de cet incident à partir du log.

## Priorités recommandées, non déployées

1. Réconcilier le protocole réellement enregistré et celui disponible sur l'appareil,
   avec reprise bornée après repli et nouvelle vérification au retour dans l'app.
2. Conserver la diffusion à tous les conducteurs éligibles, mais distinguer
   fournisseur ayant accepté, appareil ayant reçu, carte affichée et audio démarré.
   Préparer une reprise bornée par événement/appareil avec déduplication et respect
   des refus ; éviter un renvoi aveugle aux anciens protocoles susceptible de doubler
   les sonneries. Le seul relais « prochain conducteur » ne répare pas la réception.
3. Déployer après validation le refus idempotent déjà préparé, puis vérifier le
   traitement d'un refus depuis les priorités sans événement de sonnerie préalable.
4. Ajouter aux diagnostics plateforme/build, protocole réellement accepté, état des
   autorisations/canaux et erreur native de lecture audio ; conserver les erreurs
   HTTP structurées côté serveur. Ne jamais journaliser jetons, téléphones ou GPS.

## Limites des conclusions

Vérification locale complémentaire sous Node 24.22.1 : **26 tests JavaScript
réussis, aucun échec**, dans `tests/pushRegistration.test.js`,
`tests/driverAlertChannel.test.js` et `tests/nativeRidePayload.test.js`.
Ces tests existants ne couvraient pas le retour vers v6 après un repli réussi ;
leur réussite ne contredit donc pas le défaut caractérisé séparément ci-dessus.

Pas de nouveau test physique ni de notification envoyée aux utilisateurs.
Les états de proximité relevés à 15:14 ne prouvent pas l'éligibilité historique
exacte de tous les testeurs. Leurs identités n'ont pas été rapprochées de la salle
de test. Aucune affirmation de correction complète, de réception garantie ou de
résolution de crash n'est faite. La cause exacte du silence de chaque appareil
nécessite encore ses traces de réception/affichage/audio.
