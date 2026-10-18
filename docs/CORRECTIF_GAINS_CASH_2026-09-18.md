# Gains cash : correctif du 18 septembre 2026

## Règle conservée

Pour un premier trajet totalisant 5 000 FC : le passager remet 2 000 FC en cash
(40 %), Zwanga crédite 3 000 FC au conducteur (60 %). Aucun tarif, pourcentage,
montant encaissé ou taux de commission n'a été modifié.

## Côté mobile

- `features/driver-payments/paymentNoticeModel.ts` : une arrivée cash avec
  `not_required` n'est plus un paiement confirmé. Les confirmations électroniques
  et jetons restent basées sur `succeeded`. `updatedAt` ne remplace plus `paidAt`.
- `DriverPaymentNoticeCoordinator` : protection contre les anciens avis cash en
  cache ; le texte n'attribue plus une action manuelle au passager.
- `tripRevenuePresentation.ts` : modèle commun au modal et aux notifications.
  Seul un résumé `ledgerVerified=true` permet « Gains crédités ». Sinon « Gain à
  vérifier » protège les installations connectées à une ancienne version serveur.
- `NavigationTripRevenueSummary` : composant réutilisable sans appel réseau.
  Il sépare gain crédité, crédit en attente, cash à recevoir et paiement électronique attendu.
- La fin de trajet et les notifications financières invalident les revenus via
  RTK Query, sans nouvelle boucle de polling. Le résumé de secours reste en RTK Query.
- L'historique des gains identifie le crédit cash comme une participation Zwanga,
  et non comme un paiement électronique du passager.

## Côté backend

La correction SQL autorise les gains `cash` subventionnés sans créditer le cash
remis directement au conducteur. La création relit les montants persistés sous
verrou transactionnel et ne recrée jamais un gain existant, même annulé.

La reprise automatique a été explicitement autorisée par l'utilisateur : après
déploiement et migration, 50 réservations au maximum sont examinées toutes les
cinq minutes. Montants incohérents : journalisation, aucune correction arbitraire.
Aucun prélèvement passager et aucun versement FlexPay ne sont déclenchés.

La documentation backend détaillée est dans
`zwanga-backend/docs/finance/cash-subsidy-credit-reliability.md`.

## Livraison indispensable

Le code et les tests sont locaux. Aucune migration, aucun déploiement et aucun
crédit en production n'ont été réalisés pendant cette intervention. Publier le
mobile seul ne débloquera pas le gain : il faut livrer le backend et sa migration.

Contrôles de recette :

1. Trajet cash de 5 000 FC : un seul gain de 3 000 FC, 2 000 FC indiqués en cash.
2. Échec de création du gain : « Crédit en attente », pas « Gains crédités ».
3. Reprise après erreur : un crédit, sans doublon lors de plusieurs événements.
4. Aucun avis de paiement confirmé pour une simple arrivée cash.
5. Paiement électronique/jetons réussi : confirmation conservée.
6. Ancien backend et connexion instable : ne pas annoncer un crédit non vérifié.

Les tests financiers automatisés simulent les dépôts et les transactions ; ils ne
remplacent pas une validation PostgreSQL ni une recette sur appareils physiques.

## Vérifications locales

- TypeScript mobile et backend : valide.
- 148 tests backend ciblés : réussis (réservations, trajets, gains, reprise et migration).
- Suite mobile : 516/517 réussis ; seul échec préexistant du contrat d'extraction
  `userApi` pour le code PIN, fichiers non modifiés dans cette intervention.
- Tests ciblés de présentation financière et des notifications de paiement : réussis.
- 837 sources mobiles contrôlées : aucun fichier au-dessus de 400 lignes.
- Contrôle réseau : aucun appel HTTP direct hors RTK Query.
