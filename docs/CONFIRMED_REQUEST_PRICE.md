# Prix validé d’une demande de trajet

- À la création, l’application envoie toujours `maxPricePerSeat` avec le montant effectivement affiché à la validation, même si le passager n’a pas touché au prix recommandé. L’arrondi de présentation du formulaire est donc déjà inclus dans ce montant.
- Le prix envoyé est **par place**, pas le total. Exemple : 2 000 FC × 2 places = 4 000 FC. Le nombre de places supplémentaires disponibles chez le conducteur ne change pas ce prix.
- Sans estimation exploitable, le passager peut toujours fixer son budget manuellement. Aucun prix absent, invalide ou nul n’est envoyé par le formulaire comme une invitation à recalculer après confirmation.
- Dans le formulaire de modification, les tarifs sont réestimés via RTK Query pour l’itinéraire et le nombre de places saisis, même si le type de véhicule ne change pas. Le prix de l’option sélectionnée et le total sont affichés avant confirmation. Une saisie manuelle reste possible ; un changement de parcours, de repère, de véhicule ou de nombre de places la remet en mode estimation. Une réponse tardive de l’ancien parcours ne remplace jamais le prix courant.
- À l’enregistrement d’une demande encore ouverte, le formulaire envoie explicitement le nouveau `maxPricePerSeat` affiché. Le serveur conserve ce montant sans effectuer une seconde estimation après la confirmation. Modifier le trajet déjà accepté ne permet toujours pas de changer son prix.
- L’acceptation directe copie ce montant dans `selectedPricePerSeat` et dans le trajet associé. L’ancien parcours d’offre conserve le prix de l’offre explicitement acceptée par le passager.
- Le serveur bloque les changements de prix et le basculement gratuit/payant d’un trajet associé à une demande (`TRIP_REQUEST_PRICE_LOCKED`). Son formulaire de modification affiche le tarif en lecture seule. Les trajets publiés indépendamment restent modifiables.
- Les réductions du premier trajet et les ajustements/remboursements d’une interruption d’urgence sont conservés : ils concernent le règlement de la réservation, pas une nouvelle estimation du tarif par place.

## Déploiement et vérification

Déployer ensemble les changements de l’application et de `zwanga-backend`. Le serveur reste compatible avec les anciennes applications qui omettent le prix à la création : dans ce cas seulement, leur calcul initial historique reste en place. Il faut donc mettre l’application à jour pour garantir le montant affiché dès la création.

Aucune migration, modification rétroactive de prix, opération de paiement ou remboursement n’est exécuté par ce correctif. Les demandes déjà créées avec un prix différent ne sont pas corrigées automatiquement.

Sur téléphone, vérifier un prix recommandé arrondi, un budget manuel sans estimation et deux places, puis accepter côté conducteur et démarrer le trajet. Le même prix par place doit apparaître dans la demande et le trajet lié ; le total doit correspondre aux places réservées. Avant acceptation, modifier l’itinéraire en conservant le véhicule : le budget doit afficher la nouvelle estimation et l’enregistrer à la confirmation. Tester également un changement de repère, de véhicule et de places, une réponse réseau tardive, une saisie manuelle, ainsi qu’un trajet publié indépendamment.
