# Ouverture de la navigation après démarrage

## Parcours conducteur

- **Demande — Accepter et démarrer** : l’application accepte avec le véhicule choisi,
  démarre le trajet créé, puis ouvre `/trip/navigate/<id>` sans message de succès
  à fermer ni passage par la gestion du trajet.
- **Demande déjà acceptée — Démarrer** : après la confirmation initiale et la
  réussite de `startTripFromRequest`, la navigation s’ouvre directement.
- **Gestion du trajet — Démarrer** : après la confirmation initiale et la
  réussite de `startTrip`, la navigation s’ouvre directement. Il en va de même
  si la vérification existante confirme le démarrage après une erreur réseau ambiguë.
- **Accepter sans démarrer** : comportement conservé, sans lancement automatique.

## Implémentation et protections

`useRequestDriverActions` et `useManageTripActions` utilisent
`hooks/navigation/useTripStartTransition.ts` pour mutualiser la transition.

- Les mutations existantes passent toujours par RTK Query. La sélection du véhicule,
  le prix et les règles de réservation ne sont pas modifiés.
- La réponse du serveur après démarrage alimente `getTripById` avec
  `upsertQueryEntries`. Ce n’est ni une requête HTTP supplémentaire ni un statut
  attribué de manière optimiste. Les invalidations existantes restent actives.
- `router.replace` remplace l’écran source par la navigation : aucun écran de
  gestion intermédiaire n’est ajouté à la pile.
- Sur iOS, `RequestAcceptModal.onDismiss` débloque la navigation après la fermeture
  native du modal. Sur Android, la transition suit la mise à jour de sa visibilité.
  Aucun délai fixe ni intervalle supplémentaire n’est ajouté.
- Un verrou empêche les doubles envois pendant l’opération et la transition.
  Une réponse tardive après démontage, perte de focus ou changement de trajet ne
  provoque pas de redirection depuis l’ancien écran.
- Si l’acceptation réussit mais que le démarrage échoue, le message existant permet
  toujours d’accéder à la gestion du trajet créé. L’application ne réaccepte pas
  automatiquement la demande. Une erreur de démarrage seule garde l’écran courant.

## Vérification

`tests/tripStartNavigation.test.js` couvre les deux plateformes, les deux ordres
possibles entre fermeture du modal et réponse serveur, les erreurs, les doubles
clics, la réconciliation du démarrage, le cache RTK Query et les réponses tardives.
`tests/requestDetailModules.test.js` conserve les contrôles du véhicule, du prix
et de l’acceptation sans démarrage.

Les transitions natives restent à vérifier sur appareils iOS et Android réels.
