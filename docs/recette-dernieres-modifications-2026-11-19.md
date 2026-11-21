# Recette des dernières modifications — 18–19 novembre 2026

## Conclusion

La validation de bout en bout est **partielle**. Le nouveau binaire Android compile,
son manifeste empaqueté contient le retrait attendu, les intégrations HTTP isolées
réussissent et une commande synthétique a atteint le modal conducteur. La stabilité
native, l'acceptation de cette commande et l'affichage à 200 % ne sont pas validés :
un dialogue Android « application ne répond pas » a interrompu la recette.

Cette recette ne constitue pas une autorisation de déployer. Aucun déploiement,
paiement réel, envoi SMS ou push réel n'a été effectué.

## Environnement et précautions

- Émulateur Android 16 / API 36, architecture x86_64. Compte et backend local de
  test confirmés par l'utilisateur, avec envois externes désactivés.
- Application initialement installée : **1.0.18 (176)**, build de développement.
  Le build signalé dans Play Console, **1.0.19 (185)**, n'est pas celui de cet émulateur.
- Un nouvel APK **debug 1.0.20 (137)** a été compilé depuis le projet actuel. Sa
  signature diffère de celle de l'application installée. Aucune désinstallation,
  installation forcée ou suppression de données n'a été effectuée. L'APK initial
  est sauvegardé localement avant toute tentative de remplacement.
- Le JavaScript actuel a été testé sur l'ancien binaire. Cela ne valide pas à
  l'exécution les changements de manifeste ou les corrections natives du nouveau.
- Le backend sur 5200 a répondu, puis a refusé les connexions (`ECONNREFUSED`),
  avant de revenir. Sans son journal d'erreur, la cause de cet arrêt n'est pas établie.
- La destination API du dev build utilisait une adresse privée ne correspondant
  pas aux interfaces actuelles du PC : les lectures échouaient avec `FETCH_ERROR`.
  Une destination locale explicite a été utilisée uniquement dans le processus
  de recette, sans modifier `.env`, les paramètres de production ou la base.
- Metro habituel est resté en place. Un serveur temporaire sur 8082 et deux
  redirections ADB locales ont permis la recette. Des restrictions du bac à sable,
  une première génération de bundle de 395 secondes et une forte pression mémoire
  ont perturbé les premiers chargements. Ces délais ne sont pas des mesures de
  performance d'un binaire de production.

## Résultats réellement obtenus

| Périmètre | Vérification | Résultat et limite |
| --- | --- | --- |
| Contrôle mobile global | `node scripts/check-release.cjs` relancé après arrêt des processus temporaires de recette | **Réussi, code 0** : compatibilité URI/Metro, parité native, TypeScript, ESLint, frontières réseau, taille des sources ; **4 094 tests réussis**, aucun échec, un ignoré faute de Ruby sous Windows. |
| Compilation Android | `:app:assembleDebug`, x86_64, sans exclusion des tâches natives | **Réussi**, code 0, 23 min 34 s. APK de développement uniquement, pas d'AAB release. |
| Manifeste empaqueté | Inspection avec `aapt` de l'APK neuf, en complément du manifeste fusionné | Services Expo `AudioControlsService` et `AudioRecordingService` absents ; audio Zwanga, localisation, Notifee et récepteurs de démarrage conservés. |
| Régressions ciblées | Politique audio Android, parité native, protections d'alertes, session d'alerte, reprises iOS, outil de lecture du runtime | **45 tests JavaScript réussis**, aucun échec ni ignoré. Contrats/source/simulations, pas une preuve de son audible ou de fonctionnement après redémarrage. |
| Réservations | Endpoints RTK Query mobiles → HTTP NestJS → PostgreSQL temporaire, notifications enregistrées, routage et consentement tarifaire | **10 scénarios réussis** : acceptation, refus, concurrence, prix négocié, isolation et refus d'accès. Fournisseurs externes remplacés et connexions non autorisées bloquées. |
| Crédits | Contrats mobiles → HTTP réel → PostgreSQL temporaire, migrations de crédit, remboursements et cache | **8 scénarios réussis**, dont consentement au coût/taux, droits/KYC, remboursement idempotent et reprise après réponse perdue. Ce n'est pas un paiement chez un opérateur externe. |
| Session mobile/API locale | Lectures depuis le runtime Android authentifié | Profil, activité, commandes, trajets, KYC, notifications et avis de paiement lus avec succès après correction temporaire de la destination API. |
| Permissions natives | Lecture Expo Location et bridge d'alertes | GPS activé, localisation premier plan et arrière-plan accordées ; plein écran, notifications, canal et consentement reconnus comme autorisés. Pas de retrait/réaccord de la permission arrière-plan dans cette recette. |
| Récupération GPS | Désactivation GPS réelle, retour à l'accueil, appui sur « Activer la localisation » | Bouton visible et écran Android « Location » ouvert, confirmé par l'activité native et une capture après stabilisation. GPS réactivé ensuite et relu comme actif. Le retour complet est perturbé par l'ANR décrit ci-dessous. |
| Commande synthétique | Inscription d'un passager fictif par API, commande ciblée sur le conducteur de test, observation mobile | Modal « Nouvelle commande » réellement affiché. L'offre est ensuite observée expirée ; acceptation/refus UI non validés, le dialogue ANR empêchant une interaction fiable. |
| Nettoyage métier | API sur les seules données créées par cette recette | Commande fictive annulée et compte passager synthétique désactivé. Compte conducteur initial conservé, aucun trajet réel ni paiement modifié. |
| Grande police | Passage système à 200 %, vérification `fontScale=2`, capture puis restauration | **Non validé** : dialogue ANR pendant la séquence de retour des réglages/changement de police. Système et runtime relus à 100 % après restauration. |

Les 18 intégrations utilisent deux bases PostgreSQL jetables, pas la base habituelle
sur 5200. Un premier essai avec PostgreSQL 17 a échoué pendant l'initialisation,
car PostGIS n'y était pas installé. La relance avec PostgreSQL 18 a réussi ; cet
échec de préparation n'est pas présenté comme un défaut métier ni comme un succès.
Les bases temporaires sont arrêtées et supprimées par leur fixture après les essais.

## Blocage natif observé

Une nouvelle entrée Android `data_app_anr` du 18 novembre à 23:40:55 UTC
(19 novembre à Kinshasa) concerne `com.zwanga`. Son motif est :

`Input dispatching timed out` — attente de 5 003 ms pour `FocusEvent(hasFocus=true)`.

La capture à 200 % montre le dialogue système. « Attendre » a été choisi, puis la
fenêtre ANR a été observée à nouveau pendant l'affichage de la commande fictive.
Le runtime JavaScript continuait à répondre à certaines lectures : cela ne suffit
pas à certifier la réactivité du thread d'interface Android.

Le collecteur natif indique lui-même un délai dépassé lors de la collecte de pile.
Les canaux d'attente ne permettent pas d'attribuer le blocage à une méthode précise.
La pression mémoire de la machine et de l'émulateur est un contexte observé, pas
une cause démontrée. Ne pas confondre cette nouvelle entrée avec les anciens ANR
de démarrage/DevLauncher présents dans le même journal.

Ce résultat ne démontre ni un défaut de `BOOT_COMPLETED`, ni la disparition ou la
persistance de ce défaut dans le nouvel APK, qui n'a pas été installé. Aucun
correctif produit spéculatif n'a été appliqué pendant cette recette.

## Contrôle global et outillage

- Premier `scripts/check-release.cjs` : contrôles de compatibilité, parité native,
  TypeScript, ESLint, frontières réseau et taille des sources terminés. Suite de
  régression volontairement interrompue pour libérer de la mémoire pendant la
  compilation Android. **Pas de résultat global réussi pour ce premier passage.**
- Relance séquentielle du contrôle global terminée avec **code 0** : les sept
  contrôles préalables réussissent, puis **4 094 tests réussissent sur 4 095**,
  aucun échec ni annulation. Un test de politique Ruby est ignoré car Ruby n'est
  pas installé ; il reste à vérifier sous macOS/Ruby. Durée de la suite de tests :
  590,3 secondes. Les 45 tests ciblés sont compris dans ce total et ne doivent pas
  y être additionnés. Les 18 intégrations HTTP/PostgreSQL sont exécutées séparément.
- `scripts/audits/mobile-runtime-probe.cjs` accepte désormais un port Metro local
  explicite via `RIDE_AUDIT_METRO_PORT`, 8081 par défaut. La destination du debugger
  reste limitée à la boucle locale et au port sélectionné ; aucun hôte arbitraire
  n'est accepté. `tests/localRuntimeProbe.test.js` protège les ports valides et le
  rejet des URL/ports invalides. Ses deux tests font partie des 45 tests ci-dessus.
- ESLint ciblé et `git diff --check` réussis pour cet outillage. Aucun changement
  de logique métier, de sonnerie, de permission, de backend ou de configuration
  persistante n'a été ajouté dans cette intervention de test.

## État laissé et preuves locales

- GPS activé et police système/runtime à 100 % ; permissions arrière-plan et
  plein écran conservées ; session conducteur conservée. L'application a été
  fermée sans effacement des données pour terminer les tests automatisés.
- Serveur Metro temporaire arrêté, redirections 8082 et 5200 retirées ; serveur
  Metro habituel et backend utilisateur non arrêtés par cette recette.
- Preuves privées, ignorées par Git : `.expo/e2e-latest-release-check-20261119.log`,
  `.expo/e2e-latest-android-build-20261118.log`,
  `.expo/e2e-targeted-native-20261119.log`, journaux d'intégration
  `isolated-e2e-2026-11-18-*-latest-pg18-20261119.log`,
  `.expo/global-e2e-connected-20261103-latest-20261119.json`,
  `.expo/e2e-anr-dropbox-20261119.log`, `.expo/e2e-anr-events-20261119.log`, captures
  `e2e-20261119-*` dans `.expo/global-e2e-ui-20261103/` et sauvegarde locale de l'APK
  initial. Ne pas publier les captures ou les journaux bruts contenant les données
  du compte de test ou d'autres traces système.

## Vérifications encore nécessaires

1. Installer un nouveau binaire de test avec une signature compatible, ou préparer
   une installation séparée sans effacer le compte actuel. Rejouer le focus,
   les retours des réglages et la grande police avant de conclure sur l'ANR.
2. Sur ce binaire, redémarrage Android 15/16, réception d'alerte hors application
   et en veille, notification persistante, accepter/refuser/expiration et arrêt
   de sonnerie. La désactivation des push réels empêche d'en certifier la livraison.
3. Rejouer « Ma position », le retrait/réaccord des permissions et le parcours
   d'un trajet avec annonces en veille, sur Android physique et iPhone.
4. Compiler et tester le binaire release : ce dépôt reconstruit React Native et
   Hermes depuis leurs sources pour release, contrairement au build debug exécuté.
   Les avertissements D8 de la dépendance Google Auth ne valent pas validation de
   l'authentification Google dans le nouvel APK.
5. Stabiliser l'environnement local (destination API et maintien du backend), puis
   compléter le parcours UI jusqu'à acceptation, trajet et paiement simulé.
