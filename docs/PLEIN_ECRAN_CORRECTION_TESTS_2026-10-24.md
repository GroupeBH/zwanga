# Correction plein écran et essais backend locaux — 24 octobre 2026

## Problème et solution appliquée

L'audit précédent avait reproduit une activité native plein écran lancée puis
immédiatement fermée : l'intent Notifee n'avait pas de Bundle `notification`.
L'utilisateur demande le composant en veille et autorise maintenant des essais
avec le dépôt voisin `zwanga-backend`.

`services/rideAlertFullScreen.ts` ajoute `mainComponent: 'main'` au
`fullScreenAction`. Ce nom n'est pas fictif : c'est la racine Expo déclarée par
`MainActivity.getMainComponentName()`. Notifee 9.1.8 ajoute alors au PendingIntent
les données attendues par l'activité. La destination reste
`com.zwanga.notifications.IncomingRideActivity`, une interface Android native,
sans montage d'un arbre React sur l'écran verrouillé.

`IncomingRideActivity.java`, dans `native/android/notifications/` et son miroir
`android/app/src/main/java/com/zwanga/notifications/`, traite aussi `onNewIntent`
pour remplacer une invitation lorsque l'activité `singleTop` existe déjà. Le
timer précédent est retiré et les références de présentation sont réinitialisées.
Une génération de présentation empêche un ancien callback de déverrouillage
d'envoyer une réponse après le remplacement de l'invitation, ou de déverrouiller
le bouton d'une nouvelle action.

## Comportements conservés

- Plein écran soumis au build prévu pour cela, au consentement du conducteur et
  à l'autorisation Android ; sinon la carte reste le repli normal.
- Respect des notifications désactivées, du silencieux/Ne pas déranger, des
  canaux personnalisés et de l'échéance sonore. Aucune modification du volume
  système ni contournement du verrouillage.
- Route détaillée masquée tant que l'écran est verrouillé ; les boutons demandent
  le déverrouillage puis utilisent les PendingIntent existants. Les contrôles
  métier et d'identité restent dans le parcours applicatif/serveur.
- Les alertes expirées et les notifications supprimées ne redeviennent pas
  actionnables. Les cartes ne sont pas acquittées par la simple ouverture du
  plein écran.
- Aucun changement du backend métier, de `.env`, des profils EAS, du manifeste
  de production ou de la configuration distante. Aucun déploiement.

## Tests et preuves

### Tests mobile

- `tests/rideFullScreen.test.js` vérifie l'action Notifee complète, sa cohérence
  avec le vrai nom de la racine Expo, le repli en cas de refus/erreur et le
  remplacement d'intent.
- `tests/rideLockScreenPresentation.test.js` compile la véritable activité
  contre le SDK Android ; le test Java isolé couvre confidentialité, doubles
  appuis, refus du déverrouillage, expiration et callbacks d'une présentation
  remplacée. Ce test Java n'est pas un essai sur téléphone.
- Le banc Android est recompilé avec les sources natives copiées sans
  modification. Leurs empreintes sont identiques aux sources corrigées.
  `AuditRuntime.java` fournit la même propriété `mainComponent` que le service.
- Le runner `scripts/audit-android-alerts.cjs` conserve l'audit initial et écrit
  les nouveaux résultats sous `fixed/with-lock/` via `--fixed --with-lock`.
  Il teste désormais aussi les trois boutons du vrai plein écran natif pour
  chaque type d'alerte. La fiche d'arrivée et ses décisions restent fictives.

Sur le premier passage corrigé, **les 15 scénarios existants passent**, y compris
les deux contrôles plein écran qui échouaient avant. La trace contient désormais
`extras=[mainComponent, notification]`, avec le Bundle `data`, au lieu de
`extras=none`. L'émulateur est un Android 16/API 36 ; il utilise le verrouillage
par balayage, pas un PIN ni la biométrie. Les captures peuvent être noires pour
la fenêtre native : `FLAG_SECURE` reste volontairement actif.

La seconde passe utilise aussi la protection de génération et les essais
d'appui depuis le plein écran : **21 scénarios réussis, aucun échec**. Les six
appuis natifs (trois actions pour deux événements) déverrouillent l'écran par
balayage, transmettent l'événement Notifee, ouvrent la fiche locale et reprennent
le lecteur. Les boutons du banc ne modifient aucune réservation réelle. Un état
MediaPlayer `playing` n'est pas assimilé à une mesure acoustique.

Le contrôle global `node scripts/check-release.cjs` est également réussi :
parité native, TypeScript, ESLint, frontières réseau, taille des sources et
**2 659 tests réussis sur 2 660, zéro échec, un ignoré** (test Ruby iOS, Ruby non
installé). La suite de tests dure 303 250 ms. ESLint ciblé et `git diff --check`
réussissent aussi après extension du runner.

Traces locales ignorées par Git :

- `.expo/fullscreen-fix-release-check.log` ;
- `.expo/ride-alert-emulator-results/fixed/with-lock/results.json` et traces ;
- `.expo/backend-alert-tests-local-2026-10-24.log` ;
- `.expo/audit-emulator-fixed-build.log`.

### Backend local

**197 tests réussis, 7 suites, aucun échec** lors de l'exécution locale achevée :

- `src/database/transactional-notifications-postgres.spec.ts` ;
- `src/trip-requests/dispatch/dispatch-postgres.spec.ts` ;
- `src/notifications/driver-action-notifications.spec.ts` ;
- `src/notifications/nearby-request-cooldown.spec.ts` ;
- `src/notifications/notifications.service.spec.ts` ;
- `src/trip-requests/trip-request-alert-routing.spec.ts` ;
- `src/bookings/booking-response-outbox.spec.ts`.

Les deux suites SQL utilisent PostgreSQL 18/PostGIS, dans des clusters
temporaires sur `127.0.0.1` et des ports aléatoires. Elles créent des utilisateurs,
véhicules, demandes, réservations et notifications synthétiques. Elles exercent
notamment proximité à 5 km, sélection/éligibilité, présence, concurrence,
expiration, acquittement transactionnel et reprise des notifications. Les
transports Firebase/Expo sont substitués ; **aucun vrai push n'est envoyé**.

La première tentative sous environnement restreint n'avait pas pu démarrer
PostgreSQL : 91 tests sans base réussis, 46 tests non exécutables à cause de
l'échec de préparation du cluster. La relance avec autorisation de démarrage
local a exécuté les sept suites avec succès (268,42 s). Ce premier échec
d'environnement n'est pas présenté comme un bug métier corrigé.

Les recommandations `supabase-postgres-best-practices` ont guidé le choix de
clusters jetables et de connexions locales, en conservant les limites de pools
des fixtures existantes. Aucun schéma ni aucune migration n'a été appliqué à
la base habituelle. Le backend n'est pas lancé avec son `AppModule`/`.env` :
les cron jobs et les transports configurés pour l'application ne sont pas
activés. Le dépôt backend reste inchangé.

Les clusters temporaires sont arrêtés et supprimés par les suites. L'APK du
banc et son XML UIAutomator sont retirés de l'émulateur après les vérifications ;
le binaire et les traces restent dans `.expo` pour une réinstallation éventuelle.
Le verrouillage initial est rétabli et `com.zwanga` reste installé sans changement.

## Limites et prochaine recette

Ces essais relient des **vérifications séparées** : services backend avec base
locale réelle, logique mobile testée sous Node et activité/notifications/audio
sur un banc Android. Ils ne constituent pas encore une session de bout en bout
dans le véritable Zwanga avec authentification, HTTP, FCM et Expo Router.

Le `com.zwanga` déjà installé sur l'émulateur (build 172) ne déclare pas
l'autorisation plein écran et n'est pas remplacé. Pour un essai du véritable
client, il faut reconstruire Android avec le plein écran activé et pointer
explicitement vers l'environnement de test voulu. Le profil existant
`ride-alerts-test` hérite de la configuration de production : ne pas l'assimiler
à un profil backend local. Aucun profil n'a été changé pendant cette intervention.

Un OS peut conserver une carte heads-up au lieu du plein écran, notamment sans
verrouillage ; aucune garantie de réveil sur tous les constructeurs. iOS, les
téléphones physiques signalés, Doze profond, le volume réel et les pushes
distants restent à vérifier. Aucune certification de disparition des crashs,
de la chauffe ou de l'absence de pertes de notifications.
