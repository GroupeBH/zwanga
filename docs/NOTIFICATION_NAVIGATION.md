# Notifications : demande et trajet associé

La navigation push et la boîte de notifications utilisent la même résolution dans
`utils/notificationNavigation.ts`. Les écritures « lu / désactivé » passent toujours
par RTK Query, mais ne retardent pas l'ouverture de l'écran.

| Notification | Destination |
| --- | --- |
| Demande acceptée, avec `tripId` | Trajet créé |
| Démarrage, pause, interruption demandée / confirmée / annulée / terminée | Trajet, même si `tripRequestId` ou `requestId` est également présent |
| Offre, nouvelle demande, expiration, conducteur en retard | Détail de la demande ; conserver le parcours de reprogrammation |
| Ancienne acceptation sans `tripId` | Détail de la demande, puis accès au trajet associé |

Les notifications d'urgence du backend utilisent `requestId` pour l'identifiant
de l'interruption, **pas** pour celui d'une demande de trajet. Le préfixe
`driver_trip_interruption_*` décrit l'initiateur, pas forcément le destinataire.
Le champ `role` choisit donc la vue passager ou conducteur.

## Depuis le détail de la demande

- Le passager dispose du bouton « Voir mon trajet » dès que `tripId` est connu.
- Si le trajet a démarré, est terminé ou porte une interruption, la demande est
  remplacée par le trajet, uniquement pour son propriétaire et si l'écran est actif.
- L'expiration de la demande ne supprime pas ce lien vers le trajet réel.
- Une erreur réseau temporaire conserve ce lien lorsqu'il est déjà connu. Une
  erreur d'autorisation ou de ressource introuvable ne réutilise pas le lien en cache.
- Les données proviennent des abonnements RTK Query existants. Aucun nouveau
  polling n'est ajouté. Les écrans rechargent leurs données à l'ouverture pour ne
  pas attendre l'ancien intervalle de polling après une notification.
- La navigation différée est annulée si l'écran perd le focus, si le compte ou la
  demande change, ou au démontage ; elle laisse la carte native se libérer sur iOS.

## Vérification

`npm run test:notifications` couvre les payloads backend, les rôles, la navigation
unique, les données en cache, les erreurs réseau et la boîte de notifications.

À valider sur appareils iOS et Android : accepter une demande, ouvrir sa
notification, démarrer le trajet alors que le passager consulte la demande, puis
demander / confirmer / annuler une interruption d'urgence et ouvrir chaque
notification. Vérifier également l'ouverture depuis l'arrière-plan et les droits
d'accès après un changement de compte. Les tests automatisés ne remplacent pas
cette validation native.
