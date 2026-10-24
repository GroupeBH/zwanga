# Banc d'audit Android local des alertes

Application de test **séparée** : `com.zwanga.audit`, libellée « Zwanga · TEST
LOCAL ». Ne remplace pas `com.zwanga`, ne lit pas ses préférences ni ses comptes.
La permission Internet est supprimée du manifeste fusionné. Aucun appel serveur,
Firebase, acceptation ou refus réel n'est exécuté.

## Ce qui est réel et ce qui est simulé

- Gradle copie sans modification les sources actuelles `DriverAlertModule`,
  `ForegroundAlertPlayer` et `IncomingRideActivity`, ainsi que `driver_ring.wav`.
- Notifee Core provient de la dépendance locale de l'application ; les services
  Android de notifications, écran, verrouillage et MediaPlayer sont réels.
- Le contexte React, ses callbacks de cycle de vie et les promesses sont des
  adaptateurs Java minimaux. Le relais JavaScript et la fiche métier sont simulés
  par `AuditRuntime`/`AuditActivity`, **pas exécutés dans React Native**.
- Le script Node teste séparément le véritable code TypeScript avec les suites
  du projet. Le banc natif ne constitue donc pas une recette de bout en bout.
- La lecture `playing` est un état du lecteur Android : elle ne prouve pas un
  volume audible sur les haut-parleurs de tous les téléphones.

Les dépendances AndroidX/Kotlin du banc sont fixées aux versions disponibles en
cache ; ce n'est pas un graphe Gradle de production complet. Le plein écran est
déclaré uniquement dans ce package de test. Aucun flag de l'app n'est modifié.

## Compilation et exécution

Depuis la racine, avec Android SDK 36 et JDK 17 :

```powershell
.\android\gradlew.bat -p tests/android/ride-alert-harness --offline assembleDebug
adb -s emulator-5554 install -r .expo/ride-alert-audit-build/outputs/apk/debug/ZwangaLocalAlertAudit-debug.apk
node scripts/audit-android-alerts.cjs emulator-5554
node scripts/audit-android-alerts.cjs emulator-5554 --with-lock
# Après correction : préserver les traces initiales et tester aussi les boutons du plein écran.
node scripts/audit-android-alerts.cjs emulator-5554 --with-lock --fixed
```

En environnement restreint, utiliser le Gradle 8.14.3 déjà installé et son cache
local explicite plutôt qu'un wrapper qui tenterait un téléchargement. Si des
dépendances manquent, la compilation hors ligne échoue ; ne pas présenter les
essais comme réalisés.

Le runner refuse un appareil non identifié comme émulateur. Il autorise les
notifications et l'accès plein écran **du seul package de test**, puis compare
demande/réservation au premier plan, hors de l'application et écran éteint, avec
et sans consentement applicatif plein écran. Le refus des notifications est aussi
testé. Le receiver d'injection est réservé à ADB/système via la permission DUMP.
L'option `--with-lock` active temporairement le verrouillage par balayage et
restaure son état initial dans `finally` ; aucun PIN n'est créé. L'émulateur de
test doit être dédié, sans verrouillage sécurisé ni données utilisateur. Le
runner vérifie aussi les touchers sur la carte et ses deux boutons,
pour chaque type d'événement, via les vrais PendingIntent Notifee. Ces boutons
ouvrent uniquement la fiche fictive ; ils ne prennent aucune décision métier.
Les callbacks de cycle de vie du banc journalisent la présence et les noms des
extras de l'activité plein écran, sans modifier ses sources de production.
L'action plein écran inclut `mainComponent: 'main'` comme le service mobile réel :
Notifee transmet ainsi son Bundle à l'activité native. Le runner `--fixed` ajoute
six appuis depuis cette activité et conserve ses sorties sous `fixed/with-lock/`.

Les captures, résultats et traces synthétiques sont conservés dans
`.expo/ride-alert-emulator-results/`. Les fenêtres et notifications du banc sont
nettoyées à la fin ; l'émulateur revient sur son lanceur, écran actif. Pour retirer
ensuite seulement ce banc, après vérification du nom :

```powershell
adb -s emulator-5554 uninstall com.zwanga.audit
```

Les décisions simulées servent uniquement à vérifier l'arrêt du lecteur et la
suppression de la carte locale. Le serveur, le choix du véhicule, la reprise du
trajet réel, les restrictions constructeurs, Doze profond et iOS restent hors de
ce banc. Se référer au journal technique pour les résultats observés, y compris
les éventuels échecs.
