# Alertes de trajet : correctifs et recette locale du 28 octobre 2026

## Périmètre

Corriger les quatre défauts identifiés après l'ajout du service audio Android et
tester les demandes proches, offres exclusives et réservations, sans déploiement
ni sollicitation d'utilisateurs réels. Le dev build Android accessible est
`com.zwanga`, version 1.0.18 (176), sur l'émulateur Android 16/API 36. Sa présence
ne prouve pas qu'il contient les correctifs Java ajoutés dans cette intervention.

## Corrections effectivement appliquées

1. **Publication Notifee tardive.** Après le budget d'attente de deux secondes,
   l'ancien callback ne finalisait pas le démarrage audio/réveil. Dans
   `native/android/notifications/RideCardDelivery.java`, le callback tardif et le
   chemin normal partagent une finalisation idempotente. L'existence de la carte
   et son identifiant d'événement sont vérifiés avant le reçu, le service audio et
   le réveil. Une courte observation bornée couvre la visibilité asynchrone de
   `notify()`. Aucun second son, nouvelle carte ou prolongation du délai n'est
   créé par cette finalisation. Un retrait d'autorisation ne doit pas faire
   remonter d'exception depuis l'observation de la carte.
2. **Retour dans l'application.** `services/backgroundRideRinging.ts` et
   `hooks/notifications/useRideRinging.ts` ne suppriment plus une carte temporaire
   encore détenue par le service pendant la préparation audio de premier plan.
   `ForegroundAlertPlayer.java` effectue le transfert seulement après le
   démarrage réussi du lecteur (ou sa préparation en pause pour une annonce).
   `RideAlertAudioService.java` retire alors la carte temporaire `ride-handoff-`,
   mais conserve une notification métier non traitée. Un nouveau passage en
   arrière-plan peut recréer le relais avec le temps restant, sans être bloqué
   par une référence JavaScript devenue obsolète.
3. **Panne technique du lecteur.** `RideAlertAudioPlayer.java` distingue les
   erreurs techniques de préparation/lecture des refus ou pertes permanentes de
   focus. `RideAlertAudioSession.java` permet deux reprises au maximum, après
   300 ms puis 1 seconde, sur le même looper et avant l'échéance monotone initiale.
   Les callbacks d'anciens lecteurs sont invalidés. Aucun réessai après refus du
   focus, perte permanente, fermeture, expiration ou autorisation devenue invalide.
   Un échec persistant reste possible ; ces reprises ne constituent pas une
   garantie de sonnerie sur tous les appareils.
4. **État du canal réellement affiché.** `DriverAlertModule.java` vérifie aussi
   l'importance et le groupe du canal de présentation `ride-audio-visible-v1`.
   `RideAlertAudioService.java` applique la même protection. Le chemin des
   réglages dans `services/driverAlertChannel.ts` et
   `hooks/notifications/useDriverFullScreenPermission.ts` peut maintenant ouvrir
   ce canal précis si c'est lui qui bloque. Aucun canal n'est supprimé ou
   réinitialisé, aucun accord système n'est simulé.

Toutes les modifications Java sont répercutées dans les copies
`android/app/src/main/java/com/zwanga/notifications/`. Aucun changement de schéma,
de transport FCM/APNs, de durée serveur ou de logique d'acceptation n'est requis.
Les binaires sans les nouvelles méthodes du bridge gardent leur repli existant.

## Comportements conservés

- Un seul lecteur de service, compte destinataire contrôlé, décisions et
  déconnexion prioritaires, cartes étrangères non supprimées.
- Échéance métier d'une offre, limite audio de 60 secondes et absence de
  renouvellement sur doublon ; le relais serveur à 40 secondes n'est pas modifié.
- Respect des notifications désactivées, du silence, de Ne pas déranger et du
  focus audio système ; aucun volume forcé ni imitation de véritable appel.
- Actions Accepter/Refuser et confidentialité avant déverrouillage conservées.
- Aucune modification de comportement natif iOS dans ces correctifs Android.

## Vérifications et preuves

- Contrôle global `scripts/check-release.cjs` réussi : TypeScript, ESLint sans
  erreur, frontières réseau, taille des sources, parité native et **2 850 tests
  réussis, zéro échec, un ignoré** (outil Ruby absent). Les tests ciblés touchés
  par les dernières éditions ont également été rejoués séparément.

- Tests ciblés JS et Java avec doublures : publication/retour, ancien bridge,
  décision pendant l'attente, nouveau verrouillage, reprise technique bornée,
  absence de reprise après perte permanente de focus, groupe/canal bloqué et
  destination des réglages. Fichiers `tests/backgroundRideAudio*.test.js`,
  `rideAudioReliability.test.js`, `foregroundNativeWatchdog.test.js`,
  `driverAlertChannel.test.js`, `fullScreenChannelNative.test.js`,
  `fullScreenPermissionReliability.test.js`.
- Compilation hors ligne du banc natif isolé `com.zwanga.audit` réussie. Il
  compile les sources Java de production mais remplace React Native par des
  adaptateurs et n'a pas de permission Internet. Le rendu logiciel de diagnostic
  est activé dans ce banc uniquement, pour isoler les blocages gfxstream déjà
  observés sur cet émulateur ; le rendu de production n'est pas modifié.
- Dix scénarios audio réels sur cet émulateur réussis, puis rejoués après la
  dernière compilation : publication délibérément
  retardée, doublon sans délai renouvelé, lecture hors application, autre
  notification sonore, pertes temporaires/atténuation/perte permanente de focus,
  veille et déverrouillage, préparation de premier plan, décision et expiration.
  Le test lit l'état du lecteur natif : il ne mesure pas le niveau sonore du
  haut-parleur. `scripts/audits/test-ride-audio-service.cjs`, résultats locaux
  `.expo/ride-alert-fixes-audio-final-20261028/`. Ce second passage vérifie aussi
  la présence de la bannière SystemUI après huit secondes, contrairement au
  premier passage audio seul. Le cas de retard est ajouté à
  `NativeCardProbe.java` dans le banc seulement.
- Dix-sept scénarios de publication natifs réussis : carte/action/prix,
  déduplication, partage, secours Notifee, retard silencieux, auteur exclu,
  expiration, WorkManager, réveil, consentement sans permission système,
  plein écran effectivement lancé avec permission pour réservation/demande/offre,
  absence de prise de premier plan lorsque le téléphone est déverrouillé, et
  callback tardif ne ressuscitant pas une offre expirée.
  Résultats `.expo/ride-alert-fixes-publication-final-20261028/native-matrix.json`.
- Vingt et un scénarios d'interaction du banc réussis : demande/réservation,
  premier plan/autre application/veille, permission refusée, clics carte et
  boutons, déverrouillage du plein écran, arrêt audio/retrait après décision
  locale. `scripts/audit-android-alerts.cjs`, résultats
  `.expo/ride-alert-fixes-lifecycle-20261028/`. Les boutons ouvrent la fiche
  fictive du banc, pas l'écran React Native connecté au backend.
- Trois scénarios de présentation réussis avec le banc recompilé : bannière
  encore visible après huit secondes, fin de présentation conservant la carte
  en attente et ses actions, absence de recréation d'une carte supprimée.
  Résultats `.expo/ride-alert-fixes-banner-20261028/results.json`.
  Le total est donc de **51 scénarios natifs distincts**, sans compter les
  répétitions d'une même recette. Cela reste un essai sur émulateur.
- Vingt contrats serveur/mobile réussis via
  `scripts/check-backend-mobile-ringing.cjs`, face aux sources mobiles du commit
  `1d33445`. Ce contrôle ne prouve pas la provenance exacte du binaire du store.
- Suites serveur de répartition : **101 tests réussis et un ignoré**, après
  relance de la suite PostgreSQL. Le premier passage simultané avec les autres
  contrôles avait 13 échecs sur la préparation des données, dépassant le budget
  de cinq secondes du `beforeEach`. La relance seule avec `--testTimeout=20000`
  a réussi ses 51 tests ; ce résultat n'efface pas la sensibilité du banc à la
  charge de la machine. Ni les échéances métier ni les assertions de latence
  n'ont été modifiées. Le test de charge multiréplique optionnel reste ignoré.
  Les instances PostgreSQL/Redis sont temporaires, les comptes fictifs et le
  transport FCM simulé ; le lanceur existant ne charge pas `.env`.
  Journaux `.expo/ride-alert-fixes-backend-20261028.log` et
  `.expo/ride-alert-fixes-backend-isolated-20261028.log`.
- Deux parcours automatisés inter-dépôts passent par l'API HTTP, PostgreSQL,
  Redis, le producteur de notifications serveur et les gestionnaires mobiles
  JavaScript : refus puis conducteur suivant ; absence de réponse puis relais.
  Les deux échéances réelles de 40 secondes ont donné des relais à **40,973 s**
  et **41,152 s**. Ces mesures ne sont pas des délais de livraison FCM sur un
  téléphone. Un historique de 211 000 notifications synthétiques est également
  couvert ; aucune base de production n'est utilisée.
- Sept suites complémentaires de réservation/notifications : **103 tests
  réussis**, avec transport simulé (routage Android/iOS, actions conducteur,
  reprise de l'envoi des réponses de réservation et son passager).
  Journal `.expo/ride-alert-fixes-booking-backend-final-20261028.log`.
  Le cumul des suites serveur distinctes est **204 réussites, un ignoré**.
- Le dev build installé s'ouvre sur l'accueil ; déconnexion puis connexion au
  compte conducteur local explicitement choisi réussies dans la vraie interface.
  Une position de test a été injectée dans l'émulateur et enregistrée par l'API
  locale ; ce n'est pas une validation de la cadence GPS en arrière-plan.
  Le serveur renvoie `available: false` malgré une présence enregistrée, un
  compte conducteur actif et un KYC approuvé : la politique existante le
  considère occupé par un trajet ou une commande. La création d'une demande
  exclusivement destinée à ce compte est donc rejetée en HTTP 400, avant envoi.
  Aucun trajet préexistant n'a été annulé et le ciblage n'a pas été élargi.
  À cette première étape, accepter/refuser une nouvelle alerte dans le dev build
  restait non validé. La reprise avec un second compte est décrite ci-dessous.
  Les comptes passagers fictifs créés pour ces essais ont été désactivés via
  l'API locale ; aucune demande n'a été créée avec succès ni laissée en attente.
  Aucun identifiant de compte, jeton ou contenu d'environnement n'est consigné.

## Reprise du 28 octobre avec le second conducteur local autorisé

Cette reprise ne change pas le code applicatif. Le compte fourni ensuite par
l'utilisateur est disponible selon `driver-dispatch/status`, possède un véhicule
actif compatible et un KYC approuvé. Connexion réussie dans la vraie interface
du dev build Android 1.0.18 (176). Sa position de test est enregistrée via l'API
locale ; aucune position de téléphone physique n'est simulée.

Les créations HTTP sont exclusivement adressées à ce conducteur avec
`targetDriverId`, `immediateDispatch: true`, un passager fictif différent par
essai et des adresses de test. La base locale est examinée en transaction de
lecture seule, avec délai de requête limité et refus préalable de tout hôte
non local, conformément au guide PostgreSQL. Aucune valeur de configuration,
identité ou clé n'est enregistrée dans ce rapport. La correspondance entre le
compte du récepteur natif, le jeton FCM de l'émulateur et le destinataire serveur
est vérifiée en mémoire, sans afficher les jetons.

| Essai réel | Résultat observé et portée |
| --- | --- |
| Première demande, application ouverte | Fournisseur FCM acceptant l'envoi ; reçu JavaScript `received`/`displayed` environ 15 s après création. Invitation expirée sans action : pas une réussite du parcours Accepter/Refuser. |
| Nouvelle demande, refus dans la fiche | Fiche fictive observée avec Accepter/Refuser ; clic Refuser effectué dans l'interface. Offre serveur `declined`, notification inactive. Réception/affichage remontés en moins d'une seconde à la précision du relevé SQL. |
| Nouvelle demande après retour à l'accueil | Reçus réception/affichage autour de 2 s, mais aucune fiche automatique observée pendant la fenêtre de réponse ; offre expirée. La politique existante cesse la redirection automatique après une navigation dans la même session d'entrée. Ce cas n'est pas compté comme acceptation réussie. |
| Application hors premier plan, acceptation depuis l'alerte | Clic Accepter sur la surface de notification, ouverture de Zwanga sur « Course confirmée » et bouton « Aller chercher le passager ». SQL confirme l'offre `accepted`, la demande `driver_selected` et le conducteur ciblé effectivement sélectionné. Aucun trajet démarré ni embarquement simulé. |
| Téléphone en veille | État initial Android `Dozing`, puis `Awake` au premier relevé environ 2 s après création ; présence de notifications Zwanga. Pas d'activité plein écran observée pendant 32 s ; accès spécial `USE_FULL_SCREEN_INTENT` signalé comme refusé par Android. Aucune décision exercée pendant cet essai. |

Le transport **FCM réel vers l'émulateur** est cette fois utilisé, depuis le
backend local uniquement. Les accusés `displayed` ne prouvent ni un volume
audible ni la visibilité permanente d'une bannière. Le filtre initial du
diagnostic des services pouvait aussi sélectionner `com.zwanga.audit` : son
indicateur audio pendant 32 secondes est donc **écarté des preuves** du dev build.
La lecture sonore continue reste couverte par les essais séparés du banc natif,
pas certifiée dans ce parcours FCM réel. À la fin, aucun service
`com.zwanga/.notifications.RideAlertAudioService` n'est observé.

Le modal applicatif « Demandes en plein écran » a été observé et activé. Cela ne
permet pas de conclure à un accord système effectif. L'ouverture explicite de
l'écran Android d'autorisation conduit à `Settings/SpaActivity`, mais ses vues
ne sont pas exploitables dans cet essai (capture noire, hiérarchie inaccessible).
Aucun accès spécial n'est forcé par ADB. Il faut rejouer cette permission dans
une nouvelle compilation intégrant les correctifs natifs, puis sur appareil
physique ; la cause précise de cet état système n'est pas établie ici.

Nettoyage confirmé par API puis SQL : **cinq demandes annulées, cinq comptes
passagers fictifs désactivés**, aucune modification des trajets préexistants.
Le passager fictif n'avait volontairement aucun jeton push : sa notification
d'acceptation n'est donc pas un test de livraison passager réussi. Les scripts
temporaires de connexion/diagnostic et les captures contenant l'interface du
compte ne sont pas conservés. Le compte conducteur reste connecté dans le dev
build pour la suite des essais. Les réservations sur trajet publié restent
validées par les suites automatisées et le banc, pas par ce parcours connecté.

## Limites et livraison

Une **nouvelle compilation Android** est nécessaire pour les changements Java,
même si un dev build a été installé avant ces modifications. Les tests du banc
ne certifient ni le binaire installé ni le parcours complet React Native.
L'indisponibilité du premier compte a été contournée uniquement par l'utilisation
du second compte autorisé, sans modifier les contrôles d'éligibilité. Refus et
acceptation des demandes sont maintenant testés avec FCM réel ; le plein écran
du dev build, le son audible et le parcours connecté des réservations restent
à valider. Pas d'essai iPhone, de téléphone physique Samsung, d'APNs réel, de
Doze profond ni de restrictions constructeur reproduites dans cette session.
L'autorisation plein écran ne garantit pas à elle seule la présentation sur
chaque appareil ; les restrictions Android et choix de l'utilisateur restent
applicables. Aucun déploiement ni changement de configuration de production.

Références de comportement système vérifiées : [focus audio Android](https://developer.android.com/media/optimize/audio-focus)
et [restrictions de démarrage des services](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
Un démarrage depuis une activité visible dans le banc ne reproduit pas à lui seul
l'exemption accordée à un véritable message FCM prioritaire.

## Autorisation plein écran — page Android précise

Complément du 28 octobre : le bouton de consentement doit mener directement au choix Android, sans parcourir les réglages généraux.

- Nouveau bridge natif `requestFullScreenPermission`, cible `android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT` avec `package:` suivi du package courant. Ce chemin explicite ne court-circuite pas l’ouverture lorsque la lecture initiale indique déjà une autorisation. Avant Android 14, consentement existant conservé ; sur iOS, aucun appel à cette API Android.
- Ouverture uniquement après appui, avec activité en premier plan et un travail UI périmant après 1,8 s. Absence d’activité, changement de cycle, lancement refusé et build non compatible ne deviennent pas des succès. La préférence locale reste distincte du droit système.
- Le hook ne considère pas `settings-opened` comme une autorisation. Il relit l’état réel au retour ; revenir sans activer le commutateur laisse l’étape non autorisée. Le nouveau bridge est optionnel pour ne pas casser les binaires existants, mais sa disponibilité exige une nouvelle build native.
- La page spécifique de localisation n’est pas un écran Zwanga. Le parcours existant conserve `requestBackgroundPermissionsAsync()` après l’accès au premier plan et l’explication du conducteur. Quand le système ne permet plus de redemander, son repli vers les réglages de l’application reste nécessaire. L’intent interne Android `MANAGE_APP_PERMISSION` est réservé au système (`GRANT_RUNTIME_PERMISSIONS`) : il n’est pas utilisé pour promettre un raccourci universel après refus définitif.
- Sur l’émulateur connecté, `ACCESS_FINE_LOCATION` et `ACCESS_BACKGROUND_LOCATION` étaient déjà accordées. Ne pas redemander ici est correct. Aucune permission de l’application connectée n’a été retirée pour forcer une démonstration.

Vérifications acquises : 74 tests ciblés de coordination/hooks/interface/localisation, puis 8 tests de plein écran et de méthodes Java compilées avec substituts Android, tous réussis. Le nouveau `fullScreenPermissionIntentNative.test.js` vérifie la cible précise, l’exécution UI différée, les gardes d’activité/délai, les échecs, la répétition explicite et Android 13. Ce test Java ne remplace pas un essai OS réel. TypeScript, lint ciblé, parité et limite de taille validés. Compilation hors ligne de `com.zwanga.audit` réussie avec le nouveau bouton de revue de permission.

Premier essai visuel interrompu : ouverture du banc sans contenu visible (capture noire, UIAutomator sans racine), malgré activité au premier plan et écran système ON. Après un redémarrage Android, le journal crash montrait des SIGABRT répétés de `surfaceflinger`, RenderEngine/Skia, `WrapBackendTexture` et `maxRenderTargetSize: 0`. Le même émulateur Pixel_5 a ensuite été relancé avec `-no-snapshot -gpu software`, **sans effacement des données** ; aucun réglage graphique de production n’a changé. Cette panne du banc ne constitue pas un crash Zwanga démontré.

Essai visuel final réellement exécuté sur Android 16/API 36 :

1. Appui sur « Autorisation plein écran (test) » dans le banc, qui appelle la nouvelle méthode Java de production. Ouverture directe de `com.android.settings`, page « Full-screen notifications », application « Zwanga · TEST LOCAL », commutateur « Allow full-screen notifications from this app ». Pas de navigation dans les réglages généraux. L’accès était initialement permis : la nouvelle action ouvre bien la page même dans ce cas.
2. Désactivation **dans cette interface système**, puis Retour : reprise de `AuditActivity`. Lecture du bridge : `allowed=false`, `optIn=true`. Le consentement local ne masque donc pas le refus Android.
3. Nouvel appui depuis le banc : même page précise. Activation du commutateur **dans l’interface**, puis Retour : `allowed=true`, `optIn=true`. Aucun `appops allow` utilisé pour simuler l’autorisation obtenue.
4. Nettoyage : mode AppOps du seul banc rétabli à `default`, consentement synthétique désactivé, banc arrêté. Dev build Zwanga rouvert et connexions ADB locales rétablies. Captures/XML temporaires retirés du stockage partagé de l’émulateur ; capture utile conservée localement dans `.expo/zwanga-permission-settings.png`, traces sans données personnelles dans `.expo/permission-review-native-20261028.log`. Aucune permission du package connecté `com.zwanga` modifiée.

Régression complète finale : `scripts/check-release.cjs` retourne **0**, avec **2 856 tests réussis, 1 ignoré faute de Ruby, aucun échec**. TypeScript, lint global, frontières réseau, parité native, compatibilités URI/Metro et taille des sources réussis. Journal `.expo/permission-review-release-20261028.log`. Le premier lancement ciblé avait un défaut de test (activation deux fois du minuteur simulé dans le même cas) ; les scénarios ont été séparés et la suite relancée avec succès, sans masquer cet échec initial.

Limites : ce test système emploie la méthode Java réelle dans le banc natif isolé, pas un nouveau dev build React complet. La coordination React et le retour de permission sont couverts séparément par les tests de hooks. Pas de Samsung physique, d’iPhone ou d’installation de production testés dans ce complément. Aucun nouveau push réel ni changement backend. L’affichage plein écran d’une invitation reste soumis à la politique du téléphone, indépendamment du bon fonctionnement du raccourci d’autorisation.

Références : [Android — accès spécial plein écran](https://developer.android.com/about/versions/14/behavior-changes-14#secure-fsi), [Expo — permissions de localisation](https://docs.expo.dev/versions/latest/sdk/location/#locationrequestbackgroundpermissionsasync).

