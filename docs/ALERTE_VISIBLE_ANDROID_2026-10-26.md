# 26 octobre 2026 — Carte visible et réveil Android

## Problème et constats

Signalement : sonnerie audible en veille sans écran allumé, carte visible tardivement.
Le modèle et la version Android concernés ne sont pas connus. Aucun téléphone ni
émulateur n'est connecté pendant cette intervention ; le symptôme physique n'est
donc pas reproduit ici.

Deux constats vérifiés dans les sources et dépendances installées :

- Au retour au premier plan, `displayForegroundAlert` annulait la notification
  sonore puis autorisait le lecteur audio avant d'attendre la publication de la
  carte silencieuse. Un canal ou affichage natif lent créait un son sans repère
  visuel. Les anciens tests de relais imposaient explicitement cet ordre.
- Dans l'AAR Notifee installé, `lightUpScreen` demande le réveil **avant** `notify`
  avec des acquisitions sans délai maximal, dont un verrou CPU supplémentaire.
  Vérification par désassemblage local du bytecode, concordant avec
  [PowerManagerUtils](https://github.com/invertase/notifee/blob/main/android/src/main/java/app/notifee/core/utility/PowerManagerUtils.java).
  Cela ne prouve pas que ce mécanisme explique à lui seul le téléphone signalé.

## Solution appliquée

- `services/driverNotifications.ts` : préparation du canal silencieux pendant
  que l'ancienne carte reste présente ; annulation du son système ; publication
  de la nouvelle carte ; puis seulement autorisation du lecteur dans l'app.
  Le relais temporaire garde l'événement si la publication échoue, avec les
  trois tentatives en trente secondes déjà prévues. Une interruption sonore
  transitoire reste possible entre annulation et publication native.
- `services/rideAlertScreenWake.ts`, `services/backgroundRideRinging.ts` et
  `services/driverNotifications.ts` : désactivation de `lightUpScreen` de Notifee,
  tentative dédiée **après publication** de la carte sonore. Cette tentative
  n'attend pas une réponse serveur et ne bloque ni la notification ni son relais.
  Les contrôles réveil/plein écran du retour en arrière-plan se font en parallèle.
  Une unique relance après 150 ms couvre la carte pas encore présente dans la
  liste native après `notify`, sans prolonger la date limite ni recréer la carte.
- `native/android/notifications/DriverAlertModule.java` et son miroir dans
  `android/app/src/main/java/com/zwanga/notifications/DriverAlertModule.java` :
  nouveau pont `wakeDisplayedAlert`, vérifiant carte active, identifiant, canal,
  expiration, écran déjà allumé, permissions, volume, mode silencieux, Ne pas
  déranger et réglages du canal. Une seule acquisition d'écran de **1,5 seconde**,
  sans verrou CPU supplémentaire. `ON_AFTER_RELEASE` laisse ensuite le délai
  d'extinction habituel du système. Aucun contournement du verrouillage.
- Diagnostic statique et limité en fréquence si le pont manque ou est refusé.
  Aucun contenu de demande, identifiant utilisateur ou secret n'est journalisé.

La carte garde son titre Zwanga, son prix/destination disponibles, ses actions
et `autoCancel: false`. Le plein écran conserve ses contrôles de build, de
consentement et d'autorisation système. Expiration, exclusion de l'auteur,
changement de compte, refus/acceptation et confidentialité écran verrouillé
restent appliqués. Backend, iOS et profils EAS inchangés.

## Vérifications et limites

- Tests JavaScript avec notifications, horloge et audio natifs simulés : attente
  de carte, échec/reprise d'affichage, deuxième verrouillage, expiration,
  concurrence des fournisseurs, réveil après publication seulement.
- Tests Java : exécution des méthodes de production avec services Android
  simulés, puis compilation de ces méthodes contre le SDK Android 36 réel.
  Cela ne constitue ni un build Gradle complet, ni un essai sur appareil.
- Résultat ciblé : 89 tests réussis, aucun ignoré ; les trois tests du nouveau
  pont ont aussi été rejoués après la dernière modification, avec succès.
- Contrôle global `node scripts/check-release.cjs` : code 0, **2 713 tests
  réussis, zéro échec, un test Ruby ignoré sur Windows**. TypeScript, ESLint,
  frontières réseau, limite de 400 lignes et parité des sources natives valides.
  TypeScript et lint ciblé rejoués après la dernière modification : code 0.
  `git diff --check` valide. Rapport local : `.expo/ride-card-first-release.log`.
- Couverture ajoutée : `tests/rideDisplayedScreenWake.test.js` et
  `tests/rideDisplayedScreenWakeNative.test.js`. Cas de relais adaptés dans
  `tests/androidRideHandoffLatency.test.js`, `tests/driverNotifications.test.js`,
  `tests/rideAudioReliability.test.js` et `tests/rideSoundRecovery.test.js`.
- Aucune mesure de délai réel FCM, d'allumage physique ou d'autonomie réalisée.

Un **nouveau build Android** est nécessaire. Le profil `ride-alerts-test`
inclut le plein écran ; le profil `production` ne l'active pas. Un ancien binaire
peut appliquer l'ordre carte/son JavaScript mais n'a pas ce nouveau pont natif.

Android et le constructeur gardent la décision finale d'allumage. L'API de
réveil historique est dépréciée sur les Android récents ; la voie plein écran
autorisée utilise déjà `Activity.setTurnScreenOn`.
[Référence Android PowerManager](https://developer.android.com/reference/android/os/PowerManager).
Le résultat `requested` indique une tentative, pas la preuve que l'écran s'est
allumé. Une garantie universelle de réveil n'est pas annoncée.

## Recette sur le téléphone concerné

Avec un build neuf et des comptes de test, essayer demande proche et réservation
en premier plan, écran actif hors Zwanga et écran éteint ; puis déverrouiller et
ouvrir Zwanga. Vérifier carte identifiable, destination/prix, acceptation/refus,
arrêt du son après décision et réception d'une deuxième demande. Répéter avec
plein écran autorisé puis refusé, canal muet et Ne pas déranger. Relever modèle,
version Android et délai push/carte/son ; aucun envoi réel n'a été fait ici.
