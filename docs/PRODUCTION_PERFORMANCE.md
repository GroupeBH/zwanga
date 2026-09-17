# Optimisations de production — 11 septembre 2026

Mise à jour : [correctifs mobile et backend du 17 septembre 2026](./PERFORMANCE_2026-09-17.md).
Le bilan ci-dessous décrit le lot du 11 septembre ; la pagination des messages et les lectures d'activité ont depuis été implémentées dans ce nouveau lot.

Modifications côté application, sans changement des contrats de paiement, de réservation, de KYC ou de progression automatique des trajets. Aucun déploiement en production n'a été effectué.

## État du plan

| Priorité | Chantier | Réalisé dans ce dépôt | Validation / reste à faire |
| --- | --- | --- | --- |
| P0 | Diagnostic des crashs | Firebase Crashlytics, contexte appareil/version/route, remontée des erreurs interceptées par AppErrorBoundary. Mesure JS jusqu'au premier écran disponible. | Nouveau binaire requis. Confirmer la remontée des crashs natifs et les symboles de la version dans Firebase. L'origine des crashs iPhone rapportés n'est pas démontrée par ces changements. |
| P0 | Cycle de vie GPS | Invalidation des démarrages asynchrones après sortie de navigation, retrait des abonnements tardifs, un seul propriétaire du suivi passager au premier plan entre coordinateur et écran de navigation. | Vérifier sur appareils réels les permissions retardées, l'arrière-plan, l'arrêt du trajet et les retours rapides entre écrans. Le suivi natif des trajets actifs reste conservé. |
| P1 | Polling natif | AppState et connectivité reliés à RTK Query. Arrêt du polling des écrans concernés lorsqu'ils sont masqués. Scans de paiements suspendus en arrière-plan, réutilisation des réservations récemment chargées. | Vérifier la reprise après mode avion et retour au premier plan. Aucun polling indispensable aux trajets actifs n'a été supprimé globalement. |
| P1 | Démarrage | Restauration locale si les deux jetons de session sont valides, rafraîchissement préventif après les interactions, suppression du délai artificiel de 1,8 s du splash. | Un access token expiré exige toujours un rafraîchissement valide. Comparer les démarrages à froid avec/sans réseau sur les mêmes appareils. |
| P1 | Estimations dans les listes | Cache partagé, attente de la fin des interactions, deux lectures simultanées au maximum pour les aperçus, annulation des tâches encore en file lorsque l'écran est quitté. Le détail/navigation ne passe pas par cette file. | PARTIEL : pour supprimer le N+1 complètement, le backend doit fournir une vraie durée/heure d'arrivée dans ses listes. Le mapper actuel utilise la date de départ comme valeur provisoire d'arrivée. Le calcul précis reste disponible, et le repli local existant n'est pas une mesure du trafic. |
| P1 | Historique des messages | FlatList inversée et virtualisée, dédoublonnage HTTP/WebSocket, suppression de la copie intégrale dans messagesSlice, invalidations ciblées, cache d'historique libéré 30 s après le dernier abonnement. | PARTIEL : l'API d'historique retourne encore tout l'historique. Un contrat serveur par curseur est nécessaire pour borner aussi le volume téléchargé. Vérifier ordre des jours, édition, suppression et position de lecture. |
| P1 | WebSockets | Connexion partagée, comptage des abonnements aux rooms, réutilisation à la reconnexion, fermeture après le dernier consommateur, isolation à la déconnexion/changement de compte et mise à jour de l'authentification. | Le délai de grâce du suivi est de 5 s. Les rooms de suivi sont conservées pendant une panne tant que l'écran les utilise. Tester la reconnexion et les événements d'embarquement/arrivée. |
| P1 | Pagination | Notifications par lots de 40 avec offset ; conversations par pages de 50. Dédoublonnage des éléments et chargement à la demande. | PARTIEL : aucun paramètre de pagination non documenté n'a été inventé pour trajets, demandes et réservations. Ne pas tronquer ces listes : les coordinateurs en dépendent pour détecter les trajets actifs. Prévoir des endpoints dédiés aux trajets actifs avant de paginer ces historiques. |
| P1 | Cache itinéraires | Cache LRU de 64 entrées, expiration purgée à l'écriture et à la lecture, requêtes identiques en cours toujours mutualisées. | Tester navigation prolongée et succession de recherches ; une nouvelle zone doit rester consultable après éviction. |
| P1 | Carte de sélection | Plus de mise à jour React à chaque frame ; validation de la position au repos, recherche d'adresse obsolète ignorée, repli si le SDK omet l'événement final. Les repères sélectionnés explicitement restent prioritaires. | Glisser, zoomer, choisir un favori/repère, confirmer immédiatement, fermer/réouvrir, tester sans réseau. |
| P2 | Photos de profil | Capture à une résolution modérée quand le matériel l'annonce, redimensionnement à 1 024 px maximum avant aperçu et envoi, JPEG, ratio conservé, buffers natifs libérés. | Tester portrait/paysage, selfie, galerie HEIC, reprise Android après destruction de l'activité et refus de permission. Le fichier original n'est jamais écrasé. |
| P2 | Recherches obsolètes | Les géocodages manuels départ/arrivée sont annulés à la modification du champ ou à la sortie de l'étape dans la demande et la publication. | Uniquement des lectures : aucune création, acceptation ou opération de paiement n'est annulée par cette optimisation. |
| P2 | Journaux de production | Retrait de console.log/info/debug au bundling production ; effets de bord des arguments préservés. Warnings/errors maintenus ; avertissements réseau de navigation répétitifs limités. | Pas de suppression générale des erreurs. Aucun gain CPU/FPS chiffré n'est revendiqué sans profilage sur appareil. |

La déduplication GPS n'utilise que des envois confirmés. Une émission conducteur WebSocket sans accusé n'est pas considérée comme une preuve de livraison et ne bloque pas le secours REST. La fenêtre entre transports ne rallonge pas la cadence propre à chaque transport. Les seuils métier de `constants/rideProgress.ts` restent inchangés.

## Vérifications automatisées

Résultats locaux : TypeScript sans erreur ; 16 tests de performance/non-régression et 6 tests de parrainage réussis ; contrôle des frontières HTTP réussi ; bundles Hermes Android/iOS avec source maps générés. ESLint sur les fichiers modifiés : aucune erreur ; les avertissements restants concernent du code existant et sont à traiter séparément.

Commandes de contrôle :

```sh
npx tsc --noEmit
npm run test:performance
npm run test:referrals
npm run check:network
npx expo export --platform android --platform ios --max-workers 2 --source-maps --output-dir <dossier-temporaire>
```

Les tests de performance exécutent les modules TypeScript réels, avec uniquement les accès natifs/réseau simulés : expiration/éviction, file de lectures, suppression des logs, signaux AppState/réseau, résolution et libération des photos, sessions WebSocket concurrentes, cadence GPS, restauration de session, dédoublonnage des messages et progression des pages.

Le contrôle HTTP vérifie l'absence d'appels directs hors des couches RTK Query autorisées. Les SDK natifs (Firebase, cartographie, géolocalisation) et les sockets restent des transports distincts ; ce contrôle ne prétend pas intercepter leur trafic interne.

## Recette bloquante avant publication

Une exportation Metro/Hermes valide le bundle JavaScript, pas la liaison native ni le comportement sur téléphone. Recompiler Android et iOS : les modules Crashlytics, expo-network et expo-image-manipulator ne peuvent pas être ajoutés par une simple mise à jour JavaScript. Aucune montée de SDK Expo ni modification du mode de gel/détachement Android n'a été faite.

- [ ] Compiler une version release Android et une version iOS avec les nouveaux modules et archiver leurs source maps/symboles.
- [ ] Vérifier un crash contrôlé dans une version interne, puis sa réception dans Firebase ; ne pas ajouter de bouton de crash accessible au public.
- [ ] Sur un Android modeste et un iPhone concerné : ouverture/recherche/détail/retour répétés, liste longue, rotation, arrière-plan et reprise.
- [ ] En duo conducteur/passager : prise en charge, immobilité au point de rendez-vous, embarquement, destination, fin de trajet ; vérifier les positions avec écran éteint et après perte réseau.
- [ ] Quitter la navigation pendant une demande de permission GPS ; vérifier l'absence de nouvel abonnement d'écran après sa fermeture.
- [ ] Messagerie : historique long, recevoir/envoyer/éditer/supprimer, changer d'écran, mode avion puis reconnexion ; aucun message dupliqué ni historique d'un ancien compte.
- [ ] Notifications/conversations : dépasser une page, recharger, supprimer en milieu de liste, vérifier accès aux éléments plus anciens et compteurs.
- [ ] Parcours de non-régression : publication/demande de trajet, repères rapides, prix manuel sans estimation, choix du véhicule à l'acceptation, réservation, annulation, KYC passager et conducteur.
- [ ] Paiements en environnement de test : recharge mobile money/carte, retour dans l'application, confirmation serveur puis solde, revenus conducteur et paiement d'arrivée. Ne pas déduire la réussite d'un débit de la seule fermeture du prestataire.
- [ ] Mesurer avant/après sur les mêmes téléphones et jeux de données : temps jusqu'au premier écran utilisable, nombre de requêtes, mémoire après 20 allers-retours, fluidité et batterie sur un trajet de 30 minutes.

Les travaux backend et cette recette physique restent ouverts. Les tests locaux ne permettent pas de garantir à eux seuls l'absence de régression en production.
