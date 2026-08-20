# Jetons Zwanga et bonus d'abonnement

Référence backend : `FIN-WALLET-001`  
Date : 20 août 2026

## Dénomination visible

L'application utilise désormais le nom « jetons Zwanga » dans :

- le portefeuille ;
- le profil et les paramètres ;
- l'achat et le partage ;
- les moyens de paiement d'un trajet ;
- le paiement d'un abonnement ;
- l'historique des paiements et du portefeuille.

Les valeurs techniques `points` et `PTS` restent acceptées dans les réponses du serveur. L'application transforme `PTS` en « jeton » ou « jetons » à l'affichage. Elle transforme aussi les anciennes descriptions historiques contenant « points » sans modifier l'écriture enregistrée en base.

## Bonus après paiement

L'écran d'abonnement annonce le bonus avant le paiement et confirme son crédit après activation :

```text
abonnement payé et confirmé = +25 jetons
```

Le serveur est la source de vérité. L'application ne calcule pas le solde et ne crée aucune écriture locale. Après un paiement confirmé, elle recharge le portefeuille, le profil et l'abonnement actif.

Le plan renvoyé par le backend expose :

- `tokensAmount` : prix de l'abonnement en jetons ;
- `tokensCurrency` : code technique de l'unité ;
- `subscriptionRewardTokens` : bonus, actuellement 25.

Les champs historiques `pointsAmount` et `pointsCurrency` restent utilisés comme repli pour assurer la compatibilité avec un backend plus ancien.

## Compatibilité

- la valeur de canal reste `points` dans le payload ;
- la route reste `/subscriptions/subscribe/points` ;
- aucune migration du stockage local n'est requise ;
- un ancien client continue de fonctionner ;
- une nouvelle application peut lire les nouveaux ou les anciens champs du plan.

## Vérifications

- affichage du portefeuille au singulier et au pluriel ;
- affichage de `subscription_reward` dans l'historique ;
- confirmation du bonus sur tous les canaux de paiement ;
- rechargement du solde après activation ;
- compilation TypeScript et lint ciblé.
