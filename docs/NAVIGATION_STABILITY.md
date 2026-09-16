# Stabilité de la navigation — iOS et Android

## Correctifs

- Recherche : filtre de 1 à 4 places pour les trajets et demandes, y compris les liens entrants. Les règles de vérification d’identité à la réservation sont inchangées.
- Une seule instance `AnimatedRegion` pour le conducteur pendant la vie de l’écran. L’animation précédente est arrêtée avant la suivante et lors de la libération de la carte.
- Carte montée après la transition de navigation ; commandes autorisées seulement après `onMapReady` et une mise en page de taille valide. Les événements d’une ancienne carte sont ignorés.
- Carte retirée pendant l’arrière-plan et avant les sorties prises en charge (retour, modification, évaluation, profil d’un passager). Double appui neutralisé ; récupération si la navigation échoue.
- Calculs d’itinéraire et envois GPS de chaque écran limités à une requête en cours par catégorie. Les réponses obsolètes sont ignorées, les requêtes RTK Query annulables sont interrompues à la sortie. Aucun rejeu des anciennes positions n’est ajouté.
- Rafraîchissements des marqueurs Android dédupliqués par instance native et annulés lorsque la carte est libérée.
- Polling des écrans suspendu hors premier plan. Les services de suivi en arrière-plan, la progression métier du trajet et les règles de paiement sont conservés.

## Vérifications automatisées

`npm run test:navigation`, `npm run test:search`, `node --test tests/*.test.js`, `npx tsc --noEmit --incremental false` et `npm run check:network`.

Les tests des hooks couvrent les événements natifs tardifs, les changements d’écran/trajet, les commandes avant disponibilité de la carte, les doubles appuis, l’annulation et des milliers d’appels simulés. Ils ne mesurent pas la mémoire native et ne reproduisent pas un arrêt du processus par iOS/Android.

## Validation sur appareils réels avant publication

1. Sur iPhone et Android, tester les navigations conducteur **et** passager en version release pendant au moins une heure ; relever la mémoire au début puis régulièrement.
2. Passer plusieurs fois en arrière-plan, verrouiller/déverrouiller le téléphone, revenir à l’écran et vérifier carte, position et suivi du trajet.
3. Alterner connexion lente, coupure et reconnexion ; vérifier que la position actuelle remonte après reprise sans file d’anciennes positions.
4. Tester les boutons de recentrage, le retour, le profil d’un passager, la reprise de navigation et les transitions prise en charge/arrivée/interruption.
5. Vérifier la recherche à 4 places puis la réservation, avec et sans identité vérifiée.

La cause exacte des fermetures signalées reste à confirmer à l’aide des rapports Crashlytics disponibles sur les builds natifs compatibles. En cas de fermeture sans rapport de crash, récupérer aussi les journaux mémoire/arrêt système d’iOS ou Android : un arrêt par manque de mémoire ne produit pas nécessairement une exception JavaScript.
