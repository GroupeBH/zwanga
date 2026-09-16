# Nombre de places facultatif dans les demandes de trajet

Référence backend : `FIN-TRIP-003`  
Date : 19 août 2026

## Comportement dans l'application

Dans le formulaire de création, le nombre de places est facultatif :

- la valeur effective affichée est « 1 place par défaut · facultatif » ;
- tant que le passager ne modifie pas le compteur, `numberOfSeats` n'est envoyé ni à `vehicle-options` ni à la création ;
- le backend retourne et enregistre alors une place ;
- si le passager choisit deux places, l'application envoie explicitement `numberOfSeats: 2` ;
- le formulaire de modification indique lui aussi que les places demandées sont facultatives ; ne pas modifier cette valeur conserve la quantité existante.

L'application continue d'afficher la valeur effective retournée par le serveur dans le détail et dans les listes. Le conducteur voit donc toujours un minimum concret pour son offre.

## Prix affichés

L'absence du champ est strictement équivalente à une place :

```text
prixTotalRecommandé = prixParPlaceRecommandé × 1
```

Le prix par place, le type de véhicule, le coefficient météo et le mode de paiement ne changent pas. L'application n'effectue pas de substitution monétaire locale : elle utilise les estimations renvoyées par le serveur.

## Compatibilité

- un backend mis à jour accepte les anciens clients qui envoient toujours 1 ou 2 ;
- la nouvelle application doit être livrée avec un backend qui accepte l'absence du champ ;
- les demandes historiques restent inchangées ;
- aucune migration mobile ou de stockage local n'est requise.

## Fichiers concernés

- `store/api/tripRequestApi.ts` : payload de création facultatif ;
- `app/request/index.tsx` : omission du champ non choisi et libellé facultatif ;
- `app/request/[id].tsx` : libellé facultatif dans la modification.

## Vérifications

- compilation TypeScript de l'application ;
- lint ciblé des formulaires de demande ;
- contrôle d'une création sans choix et d'une création explicite à deux places.
