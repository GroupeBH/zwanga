# Android : reprise sonore et carte tardive au déverrouillage

## Date, périmètre et faits

24 octobre 2026 — complément aux corrections du
[parcours d'alerte conducteur](PARCOURS_ALERTE_CONDUCTEUR_2026-10-24.md).
Modification du client JavaScript/TypeScript uniquement : aucun changement de
fichier natif, backend, dépendance, configuration, permission ou déploiement ici.
Les modifications natives déjà présentes dans le répertoire sont conservées.

Le retour terrain décrit une sonnerie audible sans réveil de l'écran, puis un
arrêt au déverrouillage et une carte visible tardivement dans l'application.
Le modèle, le build installé et le délai entre réception et ouverture ne sont
pas établis. Ce signalement n'est pas une reproduction instrumentée.

Constats vérifiés dans le code, pouvant contribuer au retard :

- La restauration attendait la fin des lectures Notifee **et** Expo avant de
  traiter le moindre résultat. Chaque lecture est bornée à 8 secondes ; un lecteur
  bloqué retardait donc aussi les résultats déjà disponibles de l'autre.
- Le relais Android attendait la création du canal silencieux, l'annulation du
  son système puis l'affichage de la carte avant d'enregistrer l'alerte sonore dans
  Zwanga. Un affichage lent pouvait consommer la fenêtre sonore restante.
- Même lorsque le pont natif renvoyait un canal v3/v4 prêt, la configuration
  attendait encore la création du canal historique v2 inutilisé.
- Les contrôles de réveil et de plein écran, indépendants, étaient séquentiels.

Les délais cités sont des plafonds du code, pas des mesures sur le téléphone
concerné. Ces constats ne prouvent pas la cause de l'écran resté éteint.

## Solutions appliquées et fichiers

### Restauration sans dépendance entre les deux lecteurs

`hooks/notifications/useRideRinging.ts` traite les résultats de chaque lecteur dès
leur disponibilité. Les limites de temps, l'isolation des exceptions et le contrôle
de la session, de l'état actif et de la génération d'ouverture sont conservés.
Une reprise rapide ne crée toujours qu'un passage de rattrapage en attente.

Les alertes conducteur Android fraîches des deux lecteurs passent par le même
service de relais, avec la même déduplication. Le lecteur Expo ne peut donc pas
démarrer indépendamment un son pendant que Notifee annule encore le précédent.
Une carte ancienne, ou sans échéance sonore exploitable, est conservée comme
candidat silencieux d'entrée, sans réarmer une sonnerie au démarrage.

### Le son applicatif n'attend plus la présentation de la carte

`services/driverNotifications.ts` prépare le canal silencieux parallèlement à
l'annulation de la notification sonore. L'alerte est enregistrée dès que cette
annulation a réussi, si le compte et l'état actif sont toujours valides. La carte
silencieuse est ensuite présentée séparément, avec ses actions et
`autoCancel: false` conservés. La navigation existante peut traiter le candidat
sans attendre ce rendu natif ; ses contrôles serveur ne sont pas contournés.

Si l'annulation échoue ou reste bloquée, le lecteur applicatif n'est pas lancé
par ce relais. Le rejet éventuel de la préparation du canal est immédiatement
pris en charge, même si l'annulation n'est pas terminée.

Un retour en veille pendant cette préparation utilise le mécanisme existant
`reconcileBackgroundRideRinging`, seulement pour une alerte encore pendante avec
une échéance sonore future explicite. Il ne produit pas simultanément une autre
sonnerie sous l'identifiant principal. Une nouvelle entrée peut ensuite rétablir
la carte silencieuse. Les anciens messages sans échéance restent compatibles avec
le chemin de livraison en arrière-plan, sans fabriquer de nouvelle échéance dans
le mécanisme de relais.

### Allègement avant la présentation en arrière-plan

Toujours dans `services/driverNotifications.ts` :

- Le canal historique n'est créé que s'il est réellement celui choisi. Le canal
  v3 éventuellement conservé par le pont pour respecter un choix utilisateur
  n'est ni remplacé ni réactivé de force.
- Les vérifications de réveil et de plein écran se déroulent en parallèle.
  L'action plein écran reste attachée seulement si les deux contrôles l'autorisent
  et si l'alerte est toujours fraîche. Leurs limites de temps ne changent pas.

## Précautions et comportements conservés

- Aucun nouveau polling, minuterie de fond, accès réseau ou stockage de contenu
  de notification. Les collections et protections de déduplication existantes
  restent bornées.
- Pas de décision implicite à la lecture : accepter/refuser demeure une action
  explicite et authentifiée. Une décision, une déconnexion ou un changement de
  compte invalident toujours les travaux devenus obsolètes.
- Les propres demandes d'un conducteur restent exclues des alertes conducteur.
- Le son système doit être arrêté avant le démarrage du son applicatif par ce
  relais. L'expiration des offres et la fenêtre sonore d'origine ne sont pas
  prolongées par une relivraison ou une reprise. Une sonnerie applicative commencée
  à temps conserve sa règle existante d'arrêt à la décision/expiration métier.
- Permissions, silencieux, Ne pas déranger, choix des canaux, consentement plein
  écran et confidentialité sur écran verrouillé sont inchangés.
- Les corrections iOS précédentes sont conservées et retestées ; aucun appel
  Notifee Android supplémentaire n'est ajouté au parcours iOS.

## Vérifications réalisées

- **247 tests ciblés réussis, aucun échec ni test ignoré** : 213 tests du périmètre
  sonnerie/restauration/actions/voix/entrée/plein écran, plus 34 tests des canaux,
  du secours natif, du watchdog sonore et de la réservation prioritaire.
- `tests/androidRideHandoffLatency.test.js` : neuf nouveaux cas sur les modules
  réels avec ponts simulés, dont carte/canal lent, annulation en attente ou échouée,
  doubles lecteurs, changement de compte, décision, retour en veille puis reprise,
  contrôles parallèles et restauration silencieuse d'un ancien message.
- `tests/rideAlertRestoration.test.js` : lecteurs bloqués dans les deux sens,
  résultats tardifs après veille/déconnexion/démontage, génération de reprise et
  isolation des erreurs. Les assertions ne supposent plus un ordre artificiel
  entre deux lecteurs indépendants.
- TypeScript sans émission et ESLint ciblé : réussis. Parité native : réussie.
  Contrôle de taille : 1 190 sources, aucune au-delà de 400 lignes.
  `git diff --check` : réussi (avertissement de normalisation de fins de ligne
  sur un fichier déjà modifié, sans erreur d'espacement).
- Les tests Java existants du lecteur, du contrôle de réveil et de l'activité
  plein écran sont relancés avec leurs substituts système. L'activité compile
  contre le SDK Android installé avec le pont de configuration substitué. Cela
  ne constitue pas un build Gradle complet ni une exécution sur Android physique.

## Limites et recette restante

Aucun push réel, essai en économie de batterie, mesure de latence sur appareil,
build APK/AAB complet ou validation constructeur n'est effectué ici. La suite
globale du projet n'est pas relancée. Aucun réveil universel ni continuité sonore
sur le modèle signalé n'est annoncé comme acquis.

Pour la recette, utiliser un build contenant également les changements natifs
précédents. Vérifier d'abord son profil : le plein écran reste explicitement
activé par le profil de test existant et soumis au consentement et à Android.
Ne pas conclure qu'un ancien binaire bénéficie des modifications Java.

1. Sur le modèle concerné, créer une demande distincte téléphone verrouillé puis
   écran éteint sans verrouillage ; relever réception, carte, son et réveil.
2. Déverrouiller sans toucher la carte, puis ouvrir Zwanga par celle-ci et par
   l'icône : contrôler l'identification de Zwanga, la bonne fiche et les actions.
3. Refaire une ouverture pendant la fenêtre sonore, puis après son expiration :
   le second cas conserve l'accès à la demande mais ne réarme pas un son ancien.
4. Revenir rapidement en veille pendant le chargement, rouvrir, refuser/accepter,
   puis recevoir une nouvelle demande : ni doublon sonore ni blocage durable.
5. Refaire avec plein écran refusé/autorisé, notifications désactivées et Ne pas
   déranger. Un refus système ne doit jamais être contourné.

Références consultées : [Notifee — interactions Android](https://notifee.app/react-native/docs/android/interaction/)
et [Android — notifications urgentes](https://developer.android.com/develop/ui/views/notifications/time-sensitive).
