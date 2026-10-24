# Alerte conducteur : identifier Zwanga et retrouver la demande

## Date, périmètre et constats

24 octobre 2026 — application mobile, notifications conducteur, reprise à
l'ouverture et activité native plein écran Android. Aucun changement backend,
déploiement, publication de build ou modification des variables de configuration.

Le besoin exprimé est un parcours identifiable : demande proche → sonnerie et
demande de réveil de l'écran → plein écran autorisé ou notification classique →
fiche de la demande dans Zwanga, avec les actions de réponse.

Constats dans le code, distincts du retour terrain :

- Le retour utilisateur indique une sonnerie audible sans réveil de certains
  Android. Il ne permet pas d'identifier le constructeur, les permissions du
  binaire installé ou la cause exacte. Aucun appareil concerné n'a été testé ici.
- La fenêtre sonore `ringUntil` empêchait aussi la restauration comme candidat
  de navigation d'une demande dont la notification était encore visible.
- Un événement de toucher reçu en arrière-plan après le retour à l'état actif
  pouvait rester en attente du prochain retour dans l'application.
- L'activité plein écran employait le même titre générique pour les demandes et
  réservations, sans récapitulatif même après déverrouillage.

## Solutions effectivement appliquées

### 1. Origine et action attendue explicites

`features/notifications/driverNotificationCard.ts` indique maintenant
« Zwanga · Demande près de vous » ou « Zwanga · Nouvelle réservation » et termine
le contenu par « Ouvrez Zwanga pour répondre ». Le budget/prix, l'itinéraire, les
places et l'horaire déjà présents restent affichés sans inventer les valeurs absentes.
Le contenu reste borné et nettoyé. Cela concerne les cartes produites par ce
formateur mobile ; les titres des pushes APNs/FCM produits par le backend ne sont
pas réécrits par ce changement.

### 2. Fenêtre sonore séparée du candidat de navigation

`services/rideAlertSession.ts` maintient une collection distincte, bornée à
50 candidats silencieux, pour les notifications conducteur restaurées après leur
fenêtre sonore. `hooks/notifications/useRideRinging.ts` restaure aussi ce contexte
après le passage de la carte Android vers l'application.

`components/ActiveRideResumeCoordinator.tsx` consomme la liste d'entrée, distincte
de la liste sonore. Le vérificateur existant relit la demande/réservation avant
redirection : une demande déjà attribuée, annulée, expirée ou étrangère ne devient
pas le nouvel écran principal. Les trajets en cours gardent la priorité.

Pas de nouvelle requête périodique, de nouvelle minuterie de fond, ni de persistance
de contenu privé sur disque. Le contexte est rétabli à partir des notifications
présentes et effacé au changement de session/déconnexion. Les décisions acquittent
les deux collections. Une notification supprimée par l'utilisateur n'est pas recréée
par cette collection après un démarrage à froid.

### 3. Toucher reçu après le retour au premier plan

`features/notifications/pendingDriverOpen.ts` réveille aussi les abonnés pour un
toucher ordinaire. Une microtâche laisse d'abord le gestionnaire de premier plan
consommer l'événement, afin de ne pas doubler la navigation lorsqu'il existe.
Le toucher reste une intention de lecture, jamais une acceptation/refus implicite.

### 4. Plein écran natif léger et identifié

`native/android/notifications/IncomingRideActivity.java` et son miroir dans
`android/app/src/main/java/com/zwanga/notifications/` distinguent réservation et
demande, affichent clairement ZWANGA et proposent « Ouvrir dans Zwanga ».
La hiérarchie visuelle et les libellés suivent le guide `frontend-skill` : texte
court, marque identifiable, actions lisibles, sans animation ou ressource supplémentaire.

Le récapitulatif provient de la notification locale existante, sans requête réseau.
Il n'est affiché qu'une fois le téléphone déverrouillé ; avant cela, une invitation
à déverrouiller protège les adresses et les autres informations privées. Une vue
défilante évite de rendre les actions inaccessibles avec de grandes polices.

Les boutons utilisent toujours les `PendingIntent` existants. Les doubles appuis
pendant le déverrouillage sont bloqués ; son annulation ou son échec permet de
réessayer. La présence de la notification et son échéance sont revérifiées avant
transmission. Un échec de l'appel système au déverrouillage ne fait pas tomber
l'activité. La fenêtre native conserve son plafond de 30 secondes et l'échéance
serveur, sans prolongation automatique.

## Comportements conservés et limites explicites

- Le réveil simple (`lightUpScreen`) reste distinct de l'autorisation plein écran.
  La carte Android conserve `autoCancel: false` : le toucher ne doit pas la retirer
  à lui seul. L'utilisateur ou le système peut néanmoins la supprimer ; les offres
  exclusives ont toujours leur expiration propre.
- Plein écran seulement si le build l'inclut, si le conducteur y a consenti et si
  Android l'autorise. Le profil `ride-alerts-test` l'active explicitement dans
  `eas.json` ; les réglages de production ne sont pas modifiés ici. Un nouveau
  binaire Android est nécessaire pour les changements Java.
- Pas de contournement du verrouillage, du mode silencieux, de Ne pas déranger,
  des canaux personnalisés ou du refus de permission. Les demandes de l'auteur
  lui-même restent exclues.
- Accepter une demande proche ouvre le flux existant de choix du véhicule et de
  consentement ; aucun véhicule n'est choisi automatiquement. Les réponses aux
  invitations/réservations conservent leurs endpoints authentifiés et leur
  déduplication. Ouvrir la fiche ne vaut pas réponse.
- Une ancienne fenêtre sonore n'est pas réarmée. La description vocale normale
  d'entrée peut toujours porter sur la fiche vérifiée ; le candidat silencieux
  n'est pas ajouté à la file sonore/vocale des notifications.
- Le plein écran Android n'a pas d'équivalent ajouté sur iOS : APNs affiche la
  notification système, puis Zwanga traite l'ouverture. Les correctifs iOS de
  reprise sonore précédents sont conservés et retestés.
- Aucune garantie de livraison ou de réveil « à coup sûr » : absence de réseau,
  restrictions du système/constructeur, application arrêtée de force, permissions
  refusées ou services push indisponibles restent hors du contrôle du seul client.
  Cette modification ne prouve pas la résolution du réveil sur l'appareil signalé.

## Vérifications réalisées

- **217 tests ciblés réussis, aucun échec ni test ignoré.** Suites sonnerie,
  restauration, réponses, actions, consentement plein écran, parité native,
  orientation d'entrée et réservation prioritaire.
- Nouveaux tests : `rideAlertEntryRetention`, `rideAlertEntryRestore`,
  `rideLockScreenPresentation`, plus scénarios ajoutés à
  `driverNotificationActions` et `requestEntryResume`. Notamment : ouverture par
  l'icône après fin du son sur Android/iOS simulés, toucher tardif, refus des
  demandes déjà attribuées, nettoyage de session et plafond mémoire.
- Java : l'activité réelle compile contre le SDK Android API 36 installé, avec
  le seul pont de configuration remplacé par un substitut. Les méthodes de
  présentation/déverrouillage sont également exécutées avec des substituts des
  services système. Ce ne sont **ni un build Gradle complet ni des essais natifs
  sur téléphone**.
- `npx tsc --noEmit`, ESLint sur les fichiers modifiés de ce périmètre, parité des
  sources natives, limite de taille des sources et `git diff --check` : réussis.
- Suite globale, push réel, installation APK/AAB, batterie/chauffe et validation
  visuelle avec verrouillage physique : non réalisés.

## Recette sur appareils avant diffusion

1. Build compatible, notifications autorisées, plein écran refusé : déclencher
   une nouvelle demande téléphone en veille ; contrôler son, réveil éventuel et
   carte Zwanga. Déverrouiller sans ouvrir Zwanga : vérifier la carte conservée.
2. Plein écran autorisé : contrôler la surface Zwanga et les deux réponses ;
   annuler le déverrouillage puis recommencer ; vérifier une seule décision.
3. Ouvrir par la carte puis par l'icône, pendant et après la fenêtre sonore :
   contrôler la fiche correcte, sans relancer artificiellement un ancien son.
4. Faire accepter/annuler la demande ailleurs avant l'ouverture : vérifier qu'elle
   n'est pas présentée comme encore disponible. Tester aussi un trajet déjà en cours.
5. Refaire avec une deuxième demande distincte, grande taille de police, économie
   de batterie et les marques Android concernées ; tester sur iPhone réel aussi.

Références consultées : [Notifee — autoCancel et notification Android](https://notifee.app/react-native/reference/notificationandroid/),
[Android — autorisation et limites du plein écran](https://source.android.com/docs/core/permissions/fsi-limits).
