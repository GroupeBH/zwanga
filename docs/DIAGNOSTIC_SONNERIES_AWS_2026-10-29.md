# Demandes sans sonnerie — diagnostic AWS du 29 octobre 2026

## Périmètre et précautions

Signalement : demandes créées depuis 21 h 25 sans sonnerie sur les téléphones de test. Toutes les heures de ce document sont celles de Kinshasa (UTC+1).

Après accord explicite, une unique tâche ECS temporaire a exécuté un diagnostic borné avec l'image de production, sans démarrer l'application Nest ni ses workers. PostgreSQL : connexion TLS vérifiée, mode lecture seule vérifié, transaction `READ ONLY`, délais courts, résultats limités et `ROLLBACK` final. Redis : uniquement `LRANGE`, `ZSCORE`, `TTL`, `EXISTS`. Les consignes du skill PostgreSQL ont guidé ces limites. Aucun compte, trajet, paiement, jeton push ou réglage n'a été modifié ; aucune notification n'a été renvoyée.

La fenêtre de données est **21 h 25 à 21 h 57 min 57 s**. La tâche a démarré à 21 h 57 min 55 s et est confirmée `STOPPED` à 21 h 58 min 35 s, avec code de sortie 0 pour ses deux conteneurs. Le service reste sur la révision 32, une instance active sur une attendue, sans déploiement en attente. Les scripts et résultats minimisés restent dans `.expo/`, hors sources applicatives. Aucun identifiant de personne, téléphone, coordonnée précise ou secret n'est reproduit ici.

## Résultats constatés en production

Les cinq demandes retrouvées concernent une voiture, une place, un départ programmé et aucun conducteur ciblé explicitement.

| Création | État à la lecture | Invitations enregistrées | Suite constatée |
| --- | --- | ---: | --- |
| 21:35:29 | Conducteur sélectionné | 1 | Acceptation à 21:35:55, demande convertie en trajet |
| 21:36:52 | Annulée | 1 | Annulation à 21:37:06, avant la fin du premier délai |
| 21:37:21 | Annulée | 2 | Première invitation expirée, seconde annulée avec la demande à 21:38:36 |
| 21:40:51 | Annulée | 2 | Première invitation expirée, seconde annulée avec la demande à 21:41:33 |
| 21:42:10 | En attente | 4 | Quatre invitations expirées ; nouvelle vérification de distribution à 21:57:55 |

Les dix notifications sont enregistrées `sent`, sans erreur fournisseur enregistrée, mais sans accusé `receivedAt` ou `displayedAt`. Un identifiant de message est classé Expo par son préfixe ; les neuf autres sont classés non-Expo par le diagnostic, compatible avec FCM dans le code local, sans capture du payload réellement transmis. **`sent` ne prouve ni réception sur appareil, ni affichage, ni son audible.** Aucun refus conducteur n'est enregistré pour ces cinq demandes ; les annulations de demande ne sont pas des refus conducteur.

### Le relais après 40 secondes fonctionne sur cette fenêtre

Pour la demande de 21:42:10, les invitations partent successivement à **21:42:10, 21:42:51, 21:43:32 et 21:44:13**. Leurs échéances sont respectivement 21:42:50, 21:43:31, 21:44:12 et 21:44:53. Le relais suivant est observé environ 0,3 à 1,2 seconde après l'échéance précédente. Le délai de 40 secondes court ici depuis l'émission de l'invitation, sans preuve de réception sur le téléphone.

Au diagnostic, la file Redis de cette demande est vide, sans verrou actif, avec une échéance de réexamen présente. Les quatre autres demandes, terminées ou annulées, n'ont plus de file. Cela contredit une panne globale de Redis ou un relais systématiquement bloqué après le premier conducteur sur cette fenêtre. Cela ne prouve pas l'absence de toute panne intermittente.

### La proximité repose parfois sur des positions très anciennes

Les quatre destinataires de la dernière demande ont respectivement une dernière position enregistrée le **27 octobre, le 28 octobre, le 22 octobre et le 29 octobre à 17 h 14**. Leur proximité réelle pendant le test n'est donc pas établie. Les protocoles enregistrés au moment du diagnostic sont v2, v2, v4 et v4 ; ce ne sont pas des numéros de version de l'application.

Le contrôle du fichier compilé de sélection dans l'image déployée ne retrouve pas le marqueur `stalePosition`, présent dans le tri local récent. C'est un indice de divergence de sources, pas une comparaison exhaustive de l'image. Le commit de l'image n'étant pas disponible dans l'historique local, ne pas assimiler le code local courant à celui de production. En particulier, ne pas promettre que le tri des positions récentes suffirait à résoudre ce test : des conducteurs à position récente sont aussi indisponibles selon les règles métier.

### Des conducteurs proches sont exclus par d'autres critères

L'instantané à 21 h 57 montre notamment :

- un conducteur proche, à position récente et protocole v6, déjà affecté à une demande acceptée ;
- le conducteur ayant accepté la première demande, toujours affecté, avec un trajet à venir ;
- un autre conducteur proche sans jeton push enregistré, également avec un trajet à venir ;
- l'auteur des demandes, lui-même conducteur, correctement exclu de ses propres alertes ;
- d'autres profils sans véhicule actif compatible ou sans identité approuvée.

Ces observations décrivent **l'état à la lecture**, pas un historique exhaustif de chaque critère à chaque envoi. Le lien avec chacun des téléphones physiquement présents n'est pas établi. La règle locale d'exclusion des demandes déjà acceptées ne vérifie pas un chevauchement précis avec le nouveau départ : une course future peut bloquer les nouvelles invitations. Toute évolution de cette règle doit préserver l'absence de double affectation et être validée séparément.

Le diagnostic X-Ray précédent établit aussi un rejet HTTP 400 de mise à jour de position à 21:34:27 pour identité non approuvée. Cela prouve un blocage pour cette opération uniquement, pas pour l'ensemble des testeurs.

## Ce qui reste indéterminé

- Aucun des dix envois ne porte `nativeDeliveryVersion=6` dans l'enregistrement de notification et aucun renvoi n'est enregistré dans la table de reprise. Les accusés absents ne permettent pas de conclure que tous les téléphones étaient injoignables : un client ancien ou une remontée tardive peut aussi produire cette absence.
- Aucun test physique iOS/Android, capture FCM/APNs du téléphone ou essai sonore n'a été effectué dans cette intervention. Aucun changement de build ou de canal n'est prouvé nécessaire sur ce seul diagnostic.
- Les vérifications PostgreSQL et Redis ont réussi sans section en erreur. Ce ne sont pas des tests bout à bout du son ; les résultats de tests locaux de l'audit précédent ne sont pas réutilisés comme preuve de livraison en production.
- Aucune erreur fournisseur explicite n'est retrouvée dans les dix enregistrements. Une panne globale Firebase n'est donc pas démontrée, mais la livraison réelle de ces messages reste inconnue.

## Suites recommandées, non appliquées

1. Identifier les comptes des téléphones du test, puis vérifier leur disponibilité réelle, l'enregistrement push et la version de protocole annoncée. Ne pas réinitialiser leurs courses ni leurs jetons sans accord.
2. Valider les règles de disponibilité pour une course acceptée mais future, et le classement des positions périmées. Conserver l'exclusion de l'auteur, le contrôle du véhicule, de l'identité et des conflits de trajet.
3. Corréler une nouvelle invitation contrôlée avec réception/affichage sur appareil et décision conducteur. Ne pas confondre expiration de l'invitation et refus volontaire, ni absence d'accusé et manque d'intérêt.
4. Comparer les correctifs locaux avec l'image réellement déployée avant de préparer un déploiement. Aucun correctif applicatif ou déploiement n'a été réalisé pendant ce diagnostic.
