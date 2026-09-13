# Prix validé d’une demande de trajet

- À la création, l’application envoie toujours `maxPricePerSeat` avec le montant effectivement affiché à la validation, même si le passager n’a pas touché au prix recommandé. L’arrondi de présentation du formulaire est donc déjà inclus dans ce montant.
- Le prix envoyé est **par place**, pas le total. Exemple : 2 000 FC × 2 places = 4 000 FC. Le nombre de places supplémentaires disponibles chez le conducteur ne change pas ce prix.
- Sans estimation exploitable, le passager peut toujours fixer son budget manuellement. Aucun prix absent, invalide ou nul n’est envoyé par le formulaire comme une invitation à recalculer après confirmation.
- À la modification d’une demande encore ouverte, seul un nouveau `maxPricePerSeat` explicitement envoyé par le passager remplace le prix enregistré. Une adresse, un repère, une date ou un type de véhicule ne déclenchent plus de recalcul serveur du budget.
- L’acceptation directe copie ce montant dans `selectedPricePerSeat` et dans le trajet associé. L’ancien parcours d’offre conserve le prix de l’offre explicitement acceptée par le passager.
- Le serveur bloque les changements de prix et le basculement gratuit/payant d’un trajet associé à une demande (`TRIP_REQUEST_PRICE_LOCKED`). Son formulaire de modification affiche le tarif en lecture seule. Les trajets publiés indépendamment restent modifiables.
- Les réductions du premier trajet et les ajustements/remboursements d’une interruption d’urgence sont conservés : ils concernent le règlement de la réservation, pas une nouvelle estimation du tarif par place.

## Déploiement et vérification

Déployer ensemble les changements de l’application et de `zwanga-backend`. Le serveur reste compatible avec les anciennes applications qui omettent le prix à la création : dans ce cas seulement, leur calcul initial historique reste en place. Il faut donc mettre l’application à jour pour garantir le montant affiché dès la création.

Aucune migration, modification rétroactive de prix, opération de paiement ou remboursement n’est exécuté par ce correctif. Les demandes déjà créées avec un prix différent ne sont pas corrigées automatiquement.

Sur téléphone, vérifier un prix recommandé arrondi, un budget manuel sans estimation et deux places, puis accepter côté conducteur et démarrer le trajet. Le même prix par place doit apparaître dans la demande et le trajet lié ; le total doit correspondre aux places réservées. Tester également une modification de repère sans changement de prix et un trajet publié indépendamment.
