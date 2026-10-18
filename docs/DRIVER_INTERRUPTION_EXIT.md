# Sortie de navigation après interruption — conducteur

## Parcours

- Sans passager à bord : bouton d'interruption → **Interrompre et quitter** →
  réponse serveur réussie → retour automatique à la gestion du trajet.
- Avec passagers à bord : bouton d'interruption → choix du motif → envoi
  réussi → retour automatique à la gestion. L'interruption elle-même exige
  toujours les confirmations des passagers, selon les règles du backend.
- Les messages de succès à fermer et la confirmation supplémentaire de sortie
  ne sont plus intercalés dans ces deux parcours.
- Si une demande est déjà en attente, son dialogue permet de quitter directement.
  Le retour Android et la croix ne redemandent pas de confirmation pour un trajet
  déjà interrompu ou une demande d'interruption en attente.
- Une sortie ordinaire pendant un trajet en cours conserve sa confirmation.

## Sécurité et réseau

`useDriverTripInterruptionActions.ts` ne quitte qu'après une réponse réussie.
Pour la pause directe, la réconciliation existante après erreur de transport
reste conservée : une lecture serveur doit confirmer le statut `upcoming`.
Une erreur non résolue conserve la navigation et affiche un message français.
La mutation n'est jamais rejouée automatiquement.

Les lectures de rafraîchissement restent dans RTK Query mais ne retardent plus
la sortie. Leur échec ne transforme pas une mutation réussie en erreur.
Un verrou protège les doubles clics, et une réponse tardive ne redirige pas
un écran quitté ni un autre trajet.

Le suivi d'arrière-plan est arrêté uniquement après une pause réellement
acceptée. Une simple demande en attente conserve ce suivi. La carte, le guidage
vocal et les abonnements de l'écran sont libérés par le mécanisme de sortie
existant avant le changement d'écran.

## Gestion du trajet

`ManageTripInterruptionNotice.tsx` affiche l'état serveur sans modal : nombre
de confirmations, interruption effective ou refus. Il permet d'annuler une
demande en attente via la mutation RTK Query existante. Une seconde demande de
pause n'est pas proposée pendant cette attente.

Aucune règle de confirmation des passagers, de facturation, de paiement ou de
redémarrage du trajet n'est modifiée. Le parcours de navigation passager n'est
pas changé.

## Vérification

- `driverInterruptionExit.test.js` : confirmations, sortie après succès, erreurs,
  lecture lente, réconciliation, doubles clics, démontage et changement de trajet.
- `manageTripInterruptionNotice.test.js` : suivi inline, annulation et prévention
  des demandes en double.
- `navigationLifecycle.test.js` : libération native avant navigation et protections
  contre les événements obsolètes, avec environnement natif simulé.

À vérifier sur Android/iOS réels : arrêt sans passager, demande avec passagers,
réseau lent, annulation et fermeture des modals sans couche tactile résiduelle.
