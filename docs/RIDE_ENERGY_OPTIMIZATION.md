# Réduction de la consommation pendant les trajets

## Portée et limites

Ces changements concernent l’application mobile, principalement les navigations
conducteur et passager. Ils ne modifient ni les tarifs, ni les règles serveur
d’embarquement, de dépose ou de confirmation manuelle. Aucun changement de variable
d’environnement, de dépendance ou de déploiement backend n’est nécessaire.

L’exécution de tests JavaScript ne mesure pas la température d’un iPhone. Les gains
énergétiques réels restent à vérifier sur un appareil physique en version Release.

## 1. Partage des positions GPS

`services/rideLocationStream.ts` partage les positions de la tâche native avec les
consommateurs visibles. Chaque canal est identifié par le trajet conducteur ou la
réservation passager, pour éviter de mélanger les sessions.

- Les tâches conducteur et passager publient la position avant d’attendre l’envoi réseau.
- L’écran conducteur, l’écran passager et le coordinateur global utilisent ce même service.
- Un seul observateur GPS de secours est installé par canal, même avec plusieurs consommateurs.
- Dès qu’une position native fraîche arrive, l’observateur de secours est retiré.
- Sans nouvelle position native pendant environ 8 à 10 secondes, le service tente
  de réactiver le GPS de premier plan. Ce délai concerne le lancement du secours :
  il ne garantit pas que le téléphone obtiendra immédiatement un nouveau signal GPS.
- Les callbacks issus d’un observateur déjà retiré sont ignorés, même si son
  initialisation asynchrone se termine après la fermeture de l’écran.
- En arrière-plan, l’observateur de premier plan et son contrôle périodique sont
  arrêtés. La tâche native existante continue le suivi du trajet.
- Le dernier désabonnement libère le canal, le minuteur et l’écouteur d’activité.
- Un échec d’activation du GPS impose un délai de 15 secondes avant une nouvelle tentative.

Les abonnements natifs et handles de minuteurs restent hors Redux : ce sont des
ressources non sérialisables, pas des données métier à recopier à chaque mesure GPS.
Les données métier continuent d’utiliser Redux Toolkit et RTK Query.

## 2. Conservation des automatismes

La haute précision, les positions à l’arrêt et l’absence de pause automatique
du GPS natif sont conservées. Les supprimer pourrait empêcher la détection d’un
passager immobile au point de rendez-vous ou la confirmation d’arrivée.

Sur iOS, `timeInterval` ne limite pas la fréquence native. Le traitement visuel
possède donc sa propre limitation. `deferredUpdatesInterval: 2000` permet aussi de
regrouper les callbacks natifs en arrière-plan, sans abaisser la précision GPS.
Le conducteur conserve les points du lot pour l’évaluation de passage à destination.

Les cadences métier restent inchangées : envoi conducteur à environ 5 secondes,
passager à 7 secondes, secours natif à 8 secondes. Les callbacks disponibles et
le réseau peuvent allonger ces délais. La fenêtre de fraîcheur d’embarquement de
10 secondes n’a pas été élargie et les horodatages GPS ne sont pas remplacés par
une fausse date récente.

## 3. Travail de la carte

Dans `features/driver-navigation/driverLocationListener.ts` :

- La validation GPS et les contrôles de sécurité restent indépendants du rendu.
- Les calculs sur l’itinéraire et les mises à jour du marqueur sont limités à une
  exécution toutes les deux secondes, avant de parcourir les polylines.
- Les animations du marqueur passent de 4 500 à 750 ms et ne redémarrent pas pour
  un déplacement inférieur à deux mètres depuis la dernière position affichée.
- Une application en arrière-plan ne lance pas d’animation de carte.
- Les limitations distinctes d’envoi réseau, d’état React et d’étapes sont conservées.

Côté passager, les positions validées mettent à jour les références immédiatement,
mais les états d’affichage et de confirmation manuelle au plus toutes les deux secondes.

## 4. Envois confirmés et déduplication

Le gateway backend inspecté diffuse `driver_location` et `passenger_location`,
mais ses handlers d’envoi ne retournent pas d’accusé de réception explicite.
Attendre uniquement cet accusé provoquait donc des reprises HTTP inutiles.

`services/trackingLocationDelivery.ts` accepte comme confirmation :

1. Un écho serveur du bon trajet et, pour un passager, de la bonne réservation,
   avec les mêmes coordonnées (tolérance de sérialisation de 0,000001 degré) et
   un horodatage au moins aussi récent que la mesure envoyée.
2. Un accusé positif explicite, si une version du backend le fournit.

Une simple émission, un accusé vide ou une ancienne position ne comptent pas comme
un succès. Sans confirmation sous 2,5 secondes, ou après déconnexion/refus explicite,
la promesse échoue et les hooks existants peuvent utiliser leur secours HTTP.

Les tâches natives consultent les confirmations récentes ainsi que les courts
envois socket en cours avant de faire un envoi redondant. Les fenêtres d’attente
sont bornées et les réponses HTTP réussies sont également mémorisées. Les premiers
envois concurrents ou une confirmation perdue peuvent encore produire un doublon :
le mécanisme ne remplace pas les protections d’ordre des mesures côté serveur.

Tous les appels HTTP restent dans RTK Query. Le socket de suivi existant est conservé.

## 5. Lecture de positions en secours

`useDriverLocationFallback` effectue une lecture HTTP initiale, puis suspend son
polling tant que le socket est connecté et reçoit des positions valides et récentes.
Une déconnexion ou une position vieillissante réactive le polling à 10 secondes.
La fraîcheur est contrôlée toutes les 5 secondes, avec un seuil de 15 secondes.
Une reconnexion sans nouvelle position ne suffit pas à désactiver le secours.

Le passager n’émet plus une demande socket supplémentaire toutes les 10 secondes
en parallèle. Le conducteur demande les positions des passagers uniquement si
une position nécessaire à ses étapes manque ou devient ancienne. Un passager
encore suivi ne masque pas l’absence de position d’un autre passager.

Ces abonnements d’écran sont libérés en arrière-plan ; le suivi natif du trajet,
les rafraîchissements métier et les mécanismes de reprise existants sont conservés.

## Vérifications automatisées

```text
node --test tests/*.test.js
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-network-boundaries.js
node scripts/check-source-size.cjs
git diff --check
```

Les nouveaux tests couvrent notamment une heure simulée de positions natives,
la reprise GPS après silence, les initialisations tardives, le nettoyage des
abonnements, les confirmations socket absentes ou anciennes, la reprise HTTP
et les mises à jour natives très fréquentes sans animations répétées à l’arrêt.

## Validation indispensable sur appareils

Comparer le build précédent et le nouveau sur un même iPhone réel, avec la même
luminosité, le même parcours et les mêmes conditions de charge :

1. Trajet conducteur puis passager pendant au moins 30 minutes, carte ouverte.
2. Attente à l’arrêt au point de rendez-vous : vérifier l’embarquement automatique.
3. Arrivée et passage à destination : vérifier les notifications et la finalisation.
4. Connexion lente, coupure réseau, puis reconnexion : vérifier le suivi et la
   disponibilité des confirmations manuelles existantes.
5. Écran verrouillé, retour au premier plan, changement d’écran et fin de trajet.
6. Localisation d’arrière-plan refusée : vérifier le secours avec l’application ouverte.
7. Répéter les scénarios clés sur Android.

Mesurer avec les outils de profilage iOS le CPU, le rendu, la mémoire, l’énergie,
les abonnements GPS et le nombre de requêtes. Une baisse de chauffe ne peut être
annoncée comme mesurée qu’après cette comparaison, pas sur la seule base des tests.
