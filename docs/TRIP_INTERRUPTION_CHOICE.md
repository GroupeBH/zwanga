# Interruption confirmée : attendre ou s’arrêter

Après confirmation de tous les passagers à bord, le trajet passe en pause (`upcoming`) et l’interruption reste `confirmed`. Aucune réservation n’est automatiquement terminée et aucune place n’est libérée.

Chaque passager voit un choix dans le modal partagé avec le paiement :

- **Attendre le redémarrage** : conserve réservation, embarquement, place et prix initial ; aucun paiement.
- **M’arrêter ici et payer** : affiche un devis serveur puis termine uniquement cette réservation. Le règlement utilise le parcours existant (espèces, jetons ou paiement électronique selon disponibilité).

Le conducteur peut redémarrer quand tous les passagers ont choisi. Une réservation en attente reprend sans remise à zéro de son embarquement ou de son heure de départ. Depuis la navigation passager, « Voir le montant et choisir » permet de changer d’avis pendant la pause.

## Calcul et garanties

Pour le prix initial **total de la réservation**, après remises déjà appliquées :

`montant = min(prix initial, max(1 500 FC, prix initial × distance parcourue / distance prévue))`

Un trajet gratuit reste gratuit. Le minimum ne s’applique pas séparément à chaque place. Exemple : 5 km sur 25 km = 20 % ; sur 10 000 FC le montant est 2 000 FC, sur 6 000 FC il est de 1 500 FC, sur 1 000 FC il reste de 1 000 FC.

Les distances sont estimées côté serveur entre le départ et la destination propres à la réservation, et la position figée de l’interruption. Le calcul réutilise le service d’itinéraire existant et son repli géographique ; il ne constitue pas une mesure d’odomètre. Sans positions valides, le paiement de l’arrêt reste désactivé et « Attendre » reste disponible.

Le devis est stocké par interruption et réservation ; l’application transmet son identifiant, jamais un montant. Le prix du trajet publié n’est pas modifié. Les remises et rappels de paiement ne doivent pas écraser le montant de l’arrêt. Une différence sur un paiement déjà effectué est créditée en jetons, comme dans le parcours d’interruption existant.

Les transitions utilisent un verrou court sur le trajet, puis la réservation. Aucun appel d’itinéraire ou de paiement n’est fait sous ces verrous. Les décisions sont persistantes ; les traitements financiers interrompus sont repris toutes les minutes, par lots de 25, avec déduplication des remboursements.

## Application et performance

Toutes les lectures et décisions réseau passent par RTK Query. Le modal réutilise la requête des réservations déjà présente, sans ajouter de suivi GPS ni de boucle de consultation globale. La réception d’une notification d’interruption invalide les données concernées. Le devis n’est demandé que lorsque le choix est ouvert. Un seul modal natif héberge le choix et le règlement, pour éviter leur superposition sur iOS.

## Déploiement requis

Déployer le backend `zwanga-backend` avec la migration **1780000034000-AddInterruptionPassengerDecisions**, avant de distribuer l’application. Cette migration n’a pas été exécutée par cette modification. Elle ajoute décisions, devis, suivi des traitements et verrouillage du montant sans modifier les anciennes réservations. Son retour arrière exige un archivage explicite des données financières.

Les anciennes versions mobiles ne proposent pas ce choix : coordonner les mises à jour (ou imposer une version minimale) avant d’activer ce parcours en production.

## Vérifications manuelles avant production

1. Sur Android et iOS : conducteur et deux passagers ; confirmer l’interruption progressivement ; vérifier qu’aucune place n’est libérée avant un arrêt explicite.
2. Un passager attend, l’autre s’arrête : contrôler montant affiché, paiement réel sur environnement de test, places et accès à la navigation du passager restant.
3. Redémarrer : vérifier conservation des embarquements, prix et position ; une ancienne décision d’arrêt ne doit plus être acceptée après reprise.
4. Tester 20 %, minimum, prix initial inférieur à 1 500 FC, gratuité, plusieurs places, réduction initiale et paiement déjà effectué.
5. Tester réseau coupé, double appui, application fermée puis rouverte et panne après validation ; vérifier qu’aucun débit/remboursement n’est dupliqué.
6. Vérifier petite hauteur d’écran, grande taille de texte et retour de l’arrière-plan. Les tests automatisés ne remplacent pas ces essais appareils et PostgreSQL réels.
