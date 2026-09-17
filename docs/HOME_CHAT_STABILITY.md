# Accueil et messagerie : lisibilité, priorité et stabilité

## Périmètre — 17 septembre 2026

Modifications côté application mobile pour les gels signalés sur iOS,
notamment après un long séjour sur l’accueil et au retour d’une conversation.
Aucun changement de contrat HTTP, de données serveur, de paiement ou de
suivi des étapes d’un trajet. Aucun déploiement effectué.

Les points ci-dessous sont des risques identifiés dans le code et corrigés.
Sans trace native ni reproduction sur iPhone, ils ne permettent pas d’attribuer
tous les gels signalés à une cause unique ni d’affirmer leur disparition en production.

## Lisibilité et classement

- `HomeActivityCards` met en gras les noms du départ et de la destination dans
  les cartes de réservation reçue et de trajet publié prochainement.
  Le séparateur « vers » conserve son style discret.
- `OngoingTripBanner` met également ces deux noms en gras ; ses destinations de
  navigation conducteur/passager ne changent pas.
- Le classement reste local, à partir des trajets et de la position déjà disponibles.
  Les réservations existantes restent en tête, avec la réservation en cours prioritaire.
- Les suggestions utilisent des tranches de distance de 500 m, puis l’horaire le
  plus tôt dans chaque tranche. À horaire égal, distance exacte puis identifiant.
- Sans position utilisable, repli chronologique. Un départ sans coordonnées suit
  les départs localisés ; il n’est pas supprimé. Le tri précède la limite de dix résultats.

Voir [la règle détaillée de proximité](HOME_TRIP_PROXIMITY.md).

## Accueil laissé ouvert

### Activité de l’écran

`useHomeContext` distingue désormais deux signaux :

- `isFocused` : l’accueil est l’écran courant dans la navigation. Il détermine
  la présence de la carte et l’activation du cycle de vie GPS de l’accueil.
- `isScreenActive` : l’accueil est courant **et** l’application est active.
  Il suspend le polling, les lectures conditionnelles de proximité, les
  abonnements de suivi et les commandes de caméra hors premier plan.

`useHomeController` fournit le second signal aux hooks d’activité, de requêtes,
de suivi distant et de caméra, tout en conservant le premier pour la carte et
`useHomeLocation`. Une fenêtre système ne doit pas équivaloir à quitter l’accueil.
`useUserLocation` gère lui-même AppState : les callbacks hors premier plan sont
ignorés immédiatement, puis l’observateur GPS est arrêté après deux secondes
d’inactivité. Quitter l’accueil arrête cet observateur immédiatement.
Les services dédiés au suivi de trajet en arrière-plan restent inchangés.

Les onglets Accueil et Messages utilisent `freezeOnBlur: false` pour laisser
leurs rendus de désactivation et nettoyages s’exécuter. Le gel des rendus d’un
onglet inactif est une option d’optimisation de navigation, pas une protection
contre les plantages : [documentation React Navigation](https://reactnavigation.org/docs/bottom-tab-navigator/#freezeonblur).
Cette modification n’est pas une preuve que cette option causait les gels.

### Carte et position

- `useHomeMapCamera` dépend des valeurs numériques de la région, pas de
  l’identité d’un nouvel objet renvoyé après chaque rafraîchissement.
- Une région identique, ou un déplacement inférieur à 15 m sans changement
  significatif de zoom, ne déclenche pas une nouvelle animation.
- Les mouvements réels gardent la temporisation existante : au moins 1 200 ms
  entre animations sur iOS, 700 ms sur Android ; animation de 420 ms.
- Une nouvelle cible remplace une cible en attente. Le timer est annulé à la
  désactivation ou au démontage. Le retour sur l’accueil réactive le centrage.
- Ces seuils concernent uniquement la caméra : les positions servant aux trajets,
  à l’embarquement et à la dépose ne sont pas arrondies par ce hook.
- `useHomeTripFeed` mémorise les paramètres sur les coordonnées déjà arrondies
  utilisées par la requête. Un faible bruit GPS n’en recrée plus le tableau fusionné
  et ne redispatche plus inutilement la liste Redux.
- La recherche par coordonnées est suspendue lorsque l’accueil est inactif.
- `useUserLocation` ignore les callbacks d’un ancien observateur GPS et les
  callbacks reçus hors premier plan, même si le natif les livre après son arrêt.

### Correctif du clignotement et du chargement de carte

La première version du correctif de stabilité associait le montage de la carte
et l’effet GPS au signal combiné navigation/AppState. Une interruption système
pouvait donc retirer la carte et relancer la demande d’autorisation GPS au retour.
Cette dépendance a été retirée ; les tests isolés de caméra ne couvraient pas
cette interaction entre permission native et cycle de vie de l’accueil.

La séquence d’autorisation dans `useUserLocation` est maintenant la suivante :

1. Lire l’autorisation avec `getForegroundPermissionsAsync`.
2. Réutiliser une autorisation accordée, sans redemander au système.
3. Sinon, n’ouvrir automatiquement la demande qu’à la première tentative de
   cette instance du hook, si l’application est active et peut encore demander.
   Un refus ne provoque pas de nouvelle fenêtre à chaque retour au premier plan ;
   une action explicite peut toujours réessayer si le système l’autorise.
4. Partager la promesse d’autorisation entre appels concurrents de cette instance.
5. Vérifier le montage et la génération avant de démarrer le suivi. Une réponse
   tardive d’un écran quitté ne démarre pas un nouvel observateur et ne coupe pas
   celui d’une session plus récente.

Le suivi passif utilise `mayShowUserSettingsDialog: false` pour ne pas rouvrir
automatiquement une activité de réglages Android. La récupération explicite
de position conserve son comportement, ses deux niveaux de cache et son repli
en cas d’échec GPS. Les profils de précision restent inchangés : proximité
`Balanced` / 15 s / 50 m ; navigation `High` / 5 s / 25 m.

`HomeScreen` ne remplace plus toute sa vue par un écran de chargement pendant
la lecture des trajets. La carte garde sa place dans l’arbre de rendu ; le statut
« Recherche des trajets proches… » ou « Recherche des demandes proches… » apparaît
dans la feuille. Les états d’erreur et de nouvelle tentative de cette feuille
sont conservés. Une lecture lente ou en échec ne bloque donc plus le montage
de la carte. Cela ne garantit pas le téléchargement des tuiles sans connexion.

`useHomeMapNavigation` conserve le retrait de la carte avant l’ouverture d’un
détail et lorsque l’accueil perd réellement le focus. Il annule aussi une
navigation différée si l’application passe en arrière-plan. Les actions de
réservation, d’acceptation et les règles métier des trajets ne sont pas modifiées.

## Sortie d’une conversation

`useChatExit` centralise la flèche retour et le retour système Android :

1. Verrouiller immédiatement une seconde demande de retour et les interactions tardives.
2. Rendre la conversation inactive : désabonner les lectures RTK Query et le socket,
   retirer la liste native, désactiver la saisie et l’ajustement au clavier.
3. Demander la fermeture du clavier après ce rendu de désactivation.
4. Sur iOS avec clavier visible, attendre son événement de fermeture, avec un repli
   de 300 ms si l’événement n’arrive pas. Sinon, poursuivre au prochain timer.
5. Après une courte marge de 40 ms, revenir une seule fois. En l’absence d’écran
   précédent, aller à la liste des messages.

Les timers et écouteurs sont nettoyés si l’écran est démonté ou désactivé.
Un retour différé ne peut donc pas dépiler un autre écran après la fermeture.
Les gestes de navigation natifs continuent à bénéficier du nettoyage à la perte
de focus ; ils ne sont pas remplacés par le bouton personnalisé.

## Messagerie : durée de vie et coût des rendus

- `useChatRealtime` s’abonne avant de rejoindre le salon, retire immédiatement ses
  abonnements à la sortie et ignore les événements d’un ancien écran, d’une autre
  conversation ou sans identifiant/contenu valides.
- Le cache RTK Query déduplique les messages par identifiant. Les résumés restent
  dans le slice Redux existant, sans y recopier tout l’historique.
- Le client socket connecte aussi un abonné sans réservation ; il garde une connexion
  partagée tant qu’il reste un salon ou un écouteur. À leur disparition, il détruit
  socket et écouteurs, y compris si la lecture du token est encore en attente.
  Cela ne change pas les événements émis par le backend.
- Les deux lectures de conversation sont suspendues quand l’écran est inactif.
  À sa réactivation, les messages sont relus si le cache a plus de 30 secondes,
  avec rafraîchissement manuel et reconnexion toujours possibles.
- `ChatMessageList`, composant mémorisé, isole la liste virtualisée de la saisie.
  Ses données, son regroupement par date et ses callbacks restent stables quand
  seul le brouillon change. Modification, suppression, accusés de lecture et
  déduplication gardent leur fonctionnement.
- Les listes désactivent `removeClippedSubviews` sur iOS ; Android conserve son
  comportement. La liste des conversations protège aussi l’ouverture contre les
  doubles clics et tolère l’absence de participants.
- L’envoi et l’édition ont un verrou immédiat pour éviter les doublons avant la
  mise à jour de l’état de chargement. Une erreur ne restaure pas un brouillon sur
  un écran quitté et n’écrase pas un nouveau texte saisi entre-temps.
- Les actions différées de modification/suppression vérifient que la conversation
  est encore active avant de démarrer.

Toutes les opérations HTTP restent dans RTK Query. Aucun polling supplémentaire
ni nouveau service de géolocalisation n’a été ajouté.

## Limite backend identifiée, non modifiée ici

Dans `zwanga-backend/src/chat/chat.service.ts`, `getConversationMessages` charge
tous les messages et leur relation `sender`, sans pagination. La virtualisation
réduit les vues natives mais pas la taille de cette réponse ni du cache JS.
Pour les très longs historiques, il faudra ajouter une pagination serveur et son
chargement progressif RTK Query, sans tronquer silencieusement les messages existants.

## Vérifications et recette native

Vérifications initiales du lot accueil/messagerie : 434 tests automatisés
réussis, dont la caméra stationnaire, la priorité horaire dans une zone, le retour
clavier, les callbacks tardifs, le double envoi et 50 cycles du socket.

Après le correctif ciblé de carte :

- 49 tests ciblés réussis, dont 15 nouveaux tests de cycle de vie GPS et d’accueil.
  Ils couvrent 50 interruptions brèves, les refus et autorisations permanentes,
  une fenêtre de permission ouverte plus de deux secondes, la sortie d’écran,
  les réponses natives tardives, les profils GPS et la position dans les formulaires.
- Suite complète dans l’arbre de travail courant : 460 tests réussis sur 461.
  L’échec de `sourceExtractions.test.js` concerne les empreintes des endpoints
  `updatePin` / `updatePinWithOtp` de `userApi`, modifiés séparément. Ni ces endpoints
  ni les empreintes attendues n’ont été modifiés pour ce correctif de carte.
- TypeScript sans erreur et ESLint réussi sur les sources de ce correctif.
- Contrôle des frontières HTTP réussi : aucun nouvel appel direct hors RTK Query.
- 818 fichiers sources contrôlés, aucun au-dessus de 400 lignes.

Les tests de cycle de vie utilisent des doubles des APIs natives ; ils ne mesurent
pas la mémoire MapKit ni le thread UI d’un iPhone réel. Recette avant diffusion :

1. Sur un build release/TestFlight, laisser l’accueil ouvert 30 à 60 minutes,
   immobile puis avec déplacements ; alterner arrière-plan et premier plan.
2. Ouvrir/fermer une conversation au moins 50 fois, avec/sans clavier, en saisissant
   et en recevant des messages. Essayer aussi le geste retour iOS et le retour Android.
3. Répéter avec connexion instable, envoi en cours et historique volumineux.
4. Vérifier le retour, la saisie, le défilement, la modification/suppression et
   l’actualisation des messages ; pas de couche tactile bloquante après sortie.
5. Relever mémoire et CPU avec Instruments. Si le gel persiste, joindre le modèle
   d’iPhone, la version d’iOS, le build, l’heure et les traces de blocage/crash/Jetsam.

Complément de recette pour la carte Android :

1. Avec une autorisation déjà accordée, ouvrir l’accueil et vérifier que la carte
   reste visible pendant les chargements de trajets et les retours au premier plan.
2. Sans autorisation, accepter ou refuser, y compris après plusieurs secondes ;
   vérifier qu’une seconde fenêtre ne s’ouvre pas automatiquement au retour.
3. Alterner accueil/autres onglets et ouvrir les détails puis la navigation d’un
   trajet. Vérifier la carte, le recentrage et la conservation du trajet en cours.
4. Refaire ces essais avec le GPS désactivé puis réactivé et une connexion lente.

La validation native reste à effectuer. L’émulateur Android `emulator-5554`
est détecté, mais la sonde ADB n’a pas reçu de réponse en cinq secondes ; seule
cette sonde a été arrêtée. Ni l’émulateur ni le serveur ADB n’ont été redémarrés.
Les tests avec doubles natifs ne prouvent pas que tous les clignotements signalés
ont disparu sur appareil, ni que le gel prolongé iOS est entièrement résolu.
