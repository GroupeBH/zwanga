# Audit local des alertes conducteur — 24 octobre 2026

## Périmètre et verdict

Audit demandé après des retours de sonnerie interrompue au déverrouillage,
d'écran Android restant éteint et de carte aperçue tardivement. L'utilisateur a
explicitement limité les essais à des **simulations locales**. Aucune demande,
réservation, décision, notification distante ou opération serveur réelle.

**Le parcours ne peut pas être déclaré validé pour la production.** Les tests
automatisés passent, mais un défaut d'intégration plein écran est reproduit avec
le véritable cœur Android Notifee. Le problème de réveil signalé sur certains
téléphones n'est pas reproduit sur cet émulateur. La reprise sonore native marche
dans le banc ; cela ne valide pas encore le relais complet React Native/serveur.

## Constats prioritaires

### P1 — L'activité plein écran reçoit un intent sans notification

- `services/rideAlertFullScreen.ts` renvoie `id` et `launchActivity`, sans
  `mainComponent`.
- `native/android/notifications/IncomingRideActivity.java`, méthode `onCreate`,
  exige `getIntent().getBundleExtra("notification")` et se ferme si le résultat
  est nul. Le miroir `android/app/src/main/java/com/zwanga/notifications/` possède
  la même logique.
- Inspection du bytecode **de l'AAR réellement installé** :
  `app.notifee.core.c`, construction du full-screen PendingIntent, n'ajoute
  l'extra `notification` que dans la branche `getMainComponent() != null`.
  L'identifiant numérique, lui, est bien le `String.hashCode()` attendu : ce
  n'est pas la cause observée.
- Avec verrouillage par balayage, permissions système et consentement de test
  accordés, Android démarre l'activité. Le callback du banc reçoit
  `INCOMING ... extras=none`, puis l'activité précédente reprend. L'échec se
  produit pour une demande proche et pour une réservation. La carte subsiste.

**Impact :** l'autorisation plein écran ne suffit pas ; le conducteur ne voit
pas l'interface native attendue. Les tests unitaires existants construisent
eux-mêmes le Bundle et ne couvrent pas ce contrat Notifee/activité.

**À corriger dans une intervention distincte :** transmettre le contexte par un
contrat vérifié avec Notifee, ou le retrouver de manière non ambiguë depuis la
notification active. Ne pas ajouter aveuglément un `mainComponent` fictif dans
l'app : Notifee transmet aussi ce nom au mécanisme de lancement React. Conserver
le consentement, la confidentialité, l'expiration et la séparation des comptes,
puis rejouer le banc et un véritable build React Native. Aucun correctif
fonctionnel n'a été appliqué pendant cet audit.

### P1 de recette — Le binaire Zwanga installé n'est pas le code courant

Le `com.zwanga` présent sur l'émulateur est un build de développement **1.0.17,
versionCode 172**, installé le 22 octobre. Son manifeste ne déclare pas
`USE_FULL_SCREEN_INTENT`. Il ne permet donc pas de valider la fonctionnalité
plein écran des sources actuelles. Ce constat concerne cet APK uniquement, pas
un artefact Play Store ou un autre téléphone. Aucun remplacement, effacement de
données, changement de permission ou ouverture de session dans cet APK.

### Écart de garantie — Réveil et sonnerie ne sont pas universels

Le réveil est observé ici pour les deux événements, avec et sans plein écran,
mais un seul Android AOSP émulé ne représente pas Samsung, Tecno, Infinix,
Xiaomi ou leurs restrictions. Sans verrouillage, Android a affiché une carte
heads-up plutôt que l'activité plein écran. Ce comportement ne constitue pas,
à lui seul, la preuve du défaut précédent ; la trace avec verrouillage établit
le défaut de transmission des données.

Le code limite le son système initial à un fichier d'environ 29 secondes et
les relais en arrière-plan à l'échéance `ringUntil` (au plus 30 secondes pour
le relais). Une alerte restaurée après cette fenêtre reste un candidat de
navigation silencieux. Une session déjà sonore au premier plan peut continuer
jusqu'à décision/expiration métier. Cela **ne garantit pas une sonnerie sans
interruption jusqu'à une réponse, quelle que soit l'heure d'ouverture**.

## Vérifications réalisées

### Contrôles automatisés du dépôt

Commande : `node scripts/check-release.cjs`.

- Parité des sources natives, TypeScript, ESLint, frontières réseau et taille
  des sources : réussis.
- **2 656 tests : 2 655 réussis, 0 échec, 1 ignoré**, durée de la suite
  396 935 ms. Il s'agit principalement de tests Node/TypeScript avec des services
  simulés et de contrôles Java isolés, pas de 2 655 parcours sur téléphone.
- Le test Ruby de politique des cibles iOS est ignoré faute de Ruby installé.
  Aucun Xcode, simulateur iOS, TestFlight ou appareil physique testé ici.
- Après ajout du banc, le contrôle de taille recense 1 190 sources, aucune
  au-dessus de 400 lignes.
- Trois tests supplémentaires de ciblage sûr du runner ont ensuite été ajoutés
  et réussis (`tests/auditAndroidHarness.test.js`) : refus des coordonnées d'une
  autre notification, d'un bouton absent et d'un faux marqueur de test. ESLint
  ciblé et `git diff --check` réussis après ces ajouts. Le sélecteur est également
  vérifié sur la dernière capture UIAutomator réelle ; la suite globale n'a pas
  été relancée uniquement pour ces ajouts de banc/documentation.

Trace locale ignorée par Git : `.expo/audit-release-2026-10-24.log`.

### Nature exacte des essais Android

- Émulateur AOSP Android 16/API 36, x86_64, format 1080 × 2340.
- APK distinct `com.zwanga.audit`, nommé « Zwanga · TEST LOCAL », sans permission
  Internet, sans Firebase, sans compte et sans accès aux préférences de Zwanga.
- Sources **copiées sans modification** : `DriverAlertModule.java`,
  `ForegroundAlertPlayer.java`, `IncomingRideActivity.java` et `driver_ring.wav`.
- Notifee React Native installé : **9.1.8**, AAR Core `202108261754` ; véritables
  services Android de notification,
  MediaPlayer, écran et verrouillage. Les adaptateurs de contexte React, cycle
  de vie et promesses sont minimaux ; le relais JS est simulé dans `AuditRuntime`.
  La fiche et les boutons métier sont fictifs. Les callbacks de diagnostic
  appartiennent à l'application du banc, pas aux sources natives copiées.
- Compilation Gradle 8.14.3 hors ligne avec les dépendances présentes en cache.
  Ce n'est pas une compilation release complète de Zwanga ni son graphe natif
  exact. Le premier démarrage du banc a nécessité de corriger son propre
  provider Notifee ; les scénarios ci-dessous ont été rejoués ensuite.

| Situation simulée | Demande proche | Nouvelle réservation |
| --- | --- | --- |
| Banc ouvert | Carte unique et lecteur natif `playing` | Idem |
| Écran actif, hors banc | Carte présente, pas de prise de focus forcée | Idem |
| Écran éteint, plein écran non consenti | Réveil observé, carte présente | Idem |
| Écran éteint, plein écran autorisé | Réveil et carte ; interface plein écran non maintenue | Idem |
| Retour dans le banc pendant la fenêtre sonore | Lecteur natif repris, carte conservée | Idem |
| Décision locale simulée | Lecteur arrêté, carte retirée | Idem |
| Toucher carte, Accepter, Refuser hors banc | Trois ouvertures locales, événements Notifee reçus | Idem |

**24 scénarios enregistrés** : neuf dans la configuration initiale sans écran
de verrouillage, puis quinze avec verrouillage par balayage (dont six touchers).
Vingt satisfont tous leurs contrôles ; quatre ne maintiennent pas l'interface
plein écran. Parmi ces quatre, les deux essais avec verrouillage fournissent la
preuve de l'intent sans données. Il ne s'agit pas de quatre bugs indépendants.
Les six touchers ouvrent uniquement la fiche fictive et relancent le lecteur ;
ils ne valident ni l'acceptation/refus serveur ni une redirection Expo Router.

Le refus de `POST_NOTIFICATIONS` empêche la carte et le lecteur sonore du banc.
Le verrouillage utilisé est un balayage, pas un PIN ni une authentification
biométrique. `playing` prouve l'état du lecteur, **pas un volume acoustique
mesuré**. La création de carte observée en local n'est pas une mesure de latence
FCM/APNs ni une preuve de disponibilité d'un push en production.

Les résultats détaillés et captures synthétiques se trouvent sous
`.expo/ride-alert-emulator-results/`, avec un sous-dossier `with-lock/`.
Le code de sortie non nul du runner est volontaire lorsque le contrôle plein
écran échoue ; ne pas le remplacer par un succès de convenance.

## Fichiers ajoutés, comportements conservés et limites

- `tests/android/ride-alert-harness/` : projet Android de test isolé, adaptateurs
  Java, activité fictive, receiver protégé par `android.permission.DUMP`, README.
- `scripts/audit-android-alerts.cjs` : scénarios locaux, vérifications d'état,
  touchers des notifications, captures et traces. Refuse les appareils non
  identifiés comme émulateurs ; restaure le verrouillage initial après les essais.
- `tests/auditAndroidHarness.test.js` : protection du ciblage UI du banc, sans
  lancement ADB ni modification de l'émulateur.
- Le présent rapport et son lien dans `docs/CHANGEMENTS_TECHNIQUES.md`.

Toutes les modifications fonctionnelles préexistantes du worktree sont
conservées. Aucun `.env`, secret, identifiant utilisateur réel, backend, flag
de production ou binaire Zwanga n'est modifié. Aucun déploiement.
En fin d'essai, seul `com.zwanga.audit` et son fichier UIAutomator temporaire
sont retirés de l'émulateur. `com.zwanga` reste installé, le verrouillage initial
est rétabli. Le banc est réinstallable depuis l'APK conservé localement sous
`.expo/ride-alert-audit-build/outputs/apk/debug/` ; les rapports/captures restent
disponibles. Les trois sources Java copiées ont des SHA-256 identiques à leurs
originaux du worktree.

**Restent à tester :** le vrai appairage Firebase/APNs → JS → rôle/session →
fiche demande/réservation, décisions serveur et leurs échecs, ouverture après
arrêt du processus, Doze profond, économie de batterie, appareils physiques
concernés, volume réel, iOS en veille et redirection Expo Router. Les suites
unitaires couvrent une partie de ces règles mais ne remplacent pas ces essais.
Aucune conclusion de disparition des crashs, de la chauffe ou des pertes
d'alertes ne peut être tirée de ce banc.
