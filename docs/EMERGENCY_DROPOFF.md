# Descente anticipée : présentation et tarif

## Conducteur

La demande de descente est prioritaire dans le panneau de navigation. Sa carte
compacte est rendue hors du ScrollView limité à 30 % de l’écran. Les détails
secondaires et la confirmation standard de dépose reviennent après traitement.
Les actions Contacter et SOS restent accessibles. Refuser et Confirmer conservent
leurs contrôles de chargement et leurs zones tactiles d’au moins 44 points.

## Passager

Avant l’envoi, le dialogue existant affiche le minimum de la réservation, puis
une estimation serveur. Le minimum est inclus dans le tarif, pas additionné.
Il concerne le total de la réservation, pas chaque place.

Avec P = prix initial à payer par le passager (après réduction éventuelle) et
r = distance parcourue / distance prévue, limitée à 100 % :

`montant = min(P, max(min(1500, P), arrondi(P × r)))`

Exemples : 10 000 FC et 5 km sur 25 km donnent 2 000 FC ; 5 000 FC pour le même
parcours donnent 1 500 FC ; une réservation à 1 000 FC reste plafonnée à 1 000 FC ;
une réservation gratuite reste gratuite.

Le calcul intervient à l’ouverture seulement, via RTK Query. Pas de polling ni
d’abonnement GPS supplémentaire. La position affichée est celle transmise avec
la demande depuis ce dialogue. L’estimation n’est pas un devis verrouillé : le
serveur confirme le montant lors du traitement, en particulier si la position
n’était pas disponible lors de l’aperçu. Un échec de calcul n’interdit pas l’envoi
d’une demande urgente. Il est indiqué sans présenter le minimum comme un total final.

## Backend à déployer avant la nouvelle application

`POST /bookings/:id/interruption-request/preview` est une lecture authentifiée,
limitée au passager propriétaire d’une réservation embarquée et en cours. Elle
ne crée pas de demande et ne déplace aucun argent. Les coordonnées sont validées.

La confirmation de descente utilise désormais la règle commune `calculateInterruptionFare`,
déjà utilisée pour l’interruption conducteur. Le prix passager est conservé
séparément du montant subventionné et verrouillé contre un second recalcul.
Un paiement électronique en cours ne peut pas être modifié en parallèle.
Un montant déjà réglé n’est pas redemandé ; l’ajustement des paiements électroniques
et en jetons conserve le mécanisme existant de crédit de la différence.

## Vérifications sur appareils avant publication

- Petit écran Android/iPhone et grandes polices : les deux actions de descente sont accessibles.
- Refus, confirmation, nouvelle demande suivante et retour des panneaux normaux.
- Aperçu lent/hors connexion : minimum visible immédiatement, demande urgente possible.
- Réservation gratuite, inférieure à 1 500 FC, plusieurs places et tarif subventionné.
- Réservation déjà payée : crédit de la différence, aucun second paiement.
- Ouvertures/fermetures répétées et veille/reprise iOS : aucun modal natif supplémentaire.

## Contrôles automatisés effectués

- 28 tests mobiles ciblés réussis : aperçu du tarif, actions, navigation, overlays et contrat des endpoints.
- 91 tests backend ciblés réussis : tarification, interruptions et service de réservation.
- TypeScript mobile et configuration de production backend : sans erreur.
- ESLint ciblé, frontière réseau RTK Query et contrôle du diff : réussis.
- Le contrôle TypeScript backend incluant tous les tests reste bloqué par des erreurs
  dans des tests non modifiés (OTP, confidentialité, utilisateurs et fidélité).
- Le contrôle global des 400 lignes signale encore `app/wallet.tsx` à 414 lignes,
  fichier non modifié pour cette intervention.

Ces contrôles ne remplacent pas les essais visuels et de veille/reprise sur appareils réels.
