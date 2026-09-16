# Expiration d'une demande après deux heures sans réponse

## 1. Règle affichée par l'application

Une demande reste active pendant deux heures complètes à partir de sa création. Elle expire uniquement si aucun conducteur n'a répondu.

```text
échéance = createdAt + 2 heures
```

La plage de départ choisie par le passager n'est pas l'échéance de la demande.

## 2. Source de vérité

Le mobile ne calcule et ne change aucun statut localement. Il utilise le statut renvoyé par l'API :

- `pending` : aucune réponse ;
- `offers_received` : au moins une réponse reçue ;
- `driver_selected` : conducteur choisi ;
- `cancelled` : demande annulée ;
- `expired` : deux heures écoulées sans réponse.

Le polling déjà présent recharge la demande active toutes les trente secondes. Il s'arrête lorsque le backend renvoie un état terminal.

## 3. Texte utilisateur

Pendant la recherche, l'écran précise que la demande n'expirera après deux heures que si personne ne répond.

Lorsque le statut devient `expired`, il indique explicitement qu'aucun conducteur n'a répondu dans les deux heures et propose de créer une nouvelle demande.

## 4. Conséquences financières

- aucun prix n'est recalculé sur le mobile ;
- aucun paiement, point ou gain de parrainage n'est créé ou annulé ;
- le budget maximal et le type de véhicule de la demande restent inchangés ;
- une offre reçue conserve son prix même lorsque deux heures se sont écoulées ;
- le backend demeure la seule source du statut et des montants.

## 5. Fichier mobile modifié

| Fichier | Modification |
| --- | --- |
| `app/request/[id].tsx` | explication du délai pendant la recherche et après expiration |

## 6. Vérifications recommandées

1. créer une demande et confirmer qu'elle reste `pending` avant deux heures ;
2. vérifier qu'une demande sans réponse devient `expired` après l'échéance serveur ;
3. créer une offre avant l'échéance et confirmer que la demande reste `offers_received` après deux heures ;
4. vérifier que le texte « deux heures » apparaît dans les états concernés ;
5. confirmer qu'aucun montant local n'est modifié.

La documentation serveur complète est `docs/finance/trip-request-response-expiration.md` dans le dépôt backend.
