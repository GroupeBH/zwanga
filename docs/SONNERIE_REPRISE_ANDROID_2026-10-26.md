# Reprise de la sonnerie Android au déverrouillage — 26 octobre 2026

## Constat et périmètre

L'utilisateur signale une sonnerie interrompue au déverrouillage ou à l'entrée
dans Zwanga sur certains téléphones Android. Modèle et traces natives non fournis.
L'inspection et les tests JavaScript reproduisent plusieurs pertes possibles du
relais ; ils n'identifient pas à eux seuls la cause sur les téléphones signalés.

- L'annulation de la carte native précédait la mémorisation de l'alerte. Un
  retour en arrière-plan pendant cet appel pouvait laisser la carte supprimée
  sans alerte à reprendre dans l'application.
- Une alerte encore fraîche au début du relais pouvait devenir silencieuse si
  l'appel natif finissait après `ringUntil`, même sans décision du conducteur.
- La reprise Android attendait l'énumération des notifications. Un échec de
  cette lecture n'était pas retenté pendant la même entrée.

## Solution appliquée

- `services/rideAlertSession.ts` conserve temporairement le relais en mémoire,
  séparément des alertes autorisées à sonner. Il faut toujours confirmer
  l'annulation native avant de transférer l'autorité sonore au lecteur applicatif.
  Trois tentatives maximum, espacées d'au moins trois secondes, dans une fenêtre
  de trente secondes à partir du premier relais ; cinquante éléments maximum.
- `services/driverNotifications.ts` mémorise ce relais avant l'annulation et peut
  le terminer après un nouveau verrouillage. Le lecteur applicatif reste arrêté
  en arrière-plan et reprend à la prochaine entrée. Une annulation qui échoue
  conserve les données utiles même si Android a déjà retiré la carte.
- `hooks/notifications/useRideRinging.ts` reprend les alertes déjà connues après
  le nettoyage du relais sonore d'arrière-plan, sans attendre les listes natives.
  Les lectures en échec ont deux nouvelles tentatives maximum par entrée ; les
  temporisations sont supprimées à la sortie ou au démontage. Les relais en
  attente utilisent la surveillance existante, uniquement au premier plan.
- `hooks/notifications/useRideRealtime.ts` inclut aussi les relais en attente
  dans le traitement des annulations serveur, sans attendre qu'ils soient audibles.

## Comportements conservés

- La simple ouverture ne vaut ni acceptation ni refus. Les décisions confirmées,
  la déconnexion, le changement de compte et l'expiration métier invalident le relais.
- Une notification déjà périmée à sa première lecture ne retrouve pas de son.
  Seul un relais observé encore frais peut se terminer après la courte fenêtre
  sonore, dans la limite locale ci-dessus. Les échéances sonores natives et les
  expirations métier ne sont jamais modifiées dans les données.
- Le compte destinataire, l'exclusion des demandes de soi-même, l'anti-doublon,
  le mode silencieux, Ne pas déranger et les permissions restent contrôlés.
- Aucun accès backend supplémentaire, aucune écriture persistante du relais,
  aucun nouveau service Android, changement natif, dépendance ou configuration.
- iOS conserve son lecteur et son modèle de notification ; les reprises de
  lecture bornées sont communes. Les réponses passager s'arrêtent toujours à
  l'ouverture du trajet concerné.

## Vérifications et limites

Les tests ajoutés dans `tests/androidRideHandoffLatency.test.js` utilisent les
modules réels de coordination, de transfert et de lecture sonore JavaScript,
avec stockage, horloge, cycle Android et pont audio simulés. Ils couvrent demande
proche et réservation, nouveau verrouillage pendant l'annulation, annulation
lente ou réponse perdue, lecture bloquée ou en échec et limites des reprises.
`tests/rideAlertSession.test.js` couvre aussi décision, déconnexion, nettoyage,
expiration métier et plafond de tentatives pendant le relais.

Les 37 tests de ces deux fichiers passent. Les quatre tests de
`tests/rideRealtime.test.js` passent aussi, dont l'annulation serveur d'une
demande et d'une réservation pendant leur relais. Le contrôle global final passe :
2 690 tests réussis, zéro échec, un test Ruby ignoré sur Windows ; TypeScript,
ESLint, frontières réseau, taille et parité des sources natives valides.
Aucun appareil ou émulateur connecté
à ADB lors de l'intervention ; aucun push réel, essai sonore sur matériel ou
build de production effectué. La reprise dans le code est validée par simulation,
pas une continuité sonore garantie sur tous les modèles pendant le déverrouillage.

Recette physique restante : demande puis réservation, téléphone verrouillé ;
déverrouiller via la carte et via le bouton du téléphone ; revenir brièvement en
veille pendant l'ouverture ; vérifier la reprise dans Zwanga, puis l'arrêt après
acceptation/refus confirmé. Refaire avec permissions ou canal sonore désactivés.

Références de cycle de vie et de notification consultées :
[React Native AppState](https://reactnative.dev/docs/appstate) et
[Notifee NotificationAndroid](https://notifee.app/react-native/reference/notificationandroid/).
