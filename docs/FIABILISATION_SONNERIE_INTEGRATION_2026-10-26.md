# Fiabilisation des alertes et validation de leur int?gration

Date : 26 octobre 2026. Application Zwanga et d?p?t local `zwanga-backend`.
Suite ? [l?audit des derni?res modifications](AUDIT_FIABILITE_SONNERIE_2026-10-26.md).
Aucun d?ploiement, notification ? des utilisateurs r?els, acc?s aux secrets ou
modification d?une base de production. Les donn?es des essais sont fictives.

## Corrections appliqu?es

| Constat de l?audit | Solution appliqu?e | Fichiers principaux |
| --- | --- | --- |
| F1 ? Un lot de cinq interrompait la diffusion rapide | Continuer jusqu?au lot vide, au budget de deux secondes ou ? vingt lots ; conserver cinq travailleurs simultan?s | Backend `notifications.service.ts`, `urgent-drain.spec.ts` |
| F2 ? Les reprises internes Firebase pouvaient immobiliser les travailleurs | Envoi urgent HTTP v1 avec un budget de huit secondes, annulation du transport et aucune reprise HTTP cach?e ; rafra?chissement OAuth partag? | Backend `bounded-firebase-send.ts`, initialisation du projectId et appel depuis `notifications.service.ts` |
| F3 ? Une erreur de publication native ne d?clenchait pas de secours | Travail WorkManager unique programm? d?s r?ception ; trois tentatives locales au maximum ; carte Android de secours apr?s ?chec explicite de Notifee | `RideFirebaseMessagingService.java`, `RideDeliveryWorker.java`, `RideCardDelivery.java`, `RideCardFallback.java` |
| F4 ? Une r?servation tardive disparaissait ? l?expiration du son | S?parer la fen?tre d?admission du son et la visibilit? de la carte ; r?servation tardive silencieuse ; offre exclusive expir?e toujours rejet?e | `RideNotificationBundle.java`, canal silencieux d?di? |
| F5 ? Le d?verrouillage pouvait perdre une sonnerie commenc?e tard | Enregistrer le d?but et la fin du clip natif ; restaurer ce d?lai sans le renouveler, en respectant l?expiration m?tier | `ridePlaybackDeadline.ts`, parsers d?invitations, `rideAlertSession.ts`, `driverNotifications.ts`, `backgroundRideRinging.ts`, `legacyRideSound.ts`, `useRideRinging.ts`, `IncomingRideActivity.java` |
| F6 ? Le fournisseur pouvait accepter un push jamais affich? | Une seule nouvelle tentative serveur pour Android v6 sans re?u d?affichage ; m?me identit? et m?me ?ch?ance ; d?duplication native persistante | Backend `recover-unacknowledged-ride.ts`, migration `1780000094000-RideDeliveryRecovery.ts` |

Les re?us distinguent maintenant l?heure d?observation sur le t?l?phone de
l?heure de r?ception par le serveur, ainsi que l?origine native/JavaScript et
un code d??chec limit?. Les donn?es sont envoy?es lors de l?entr?e dans
l?application, sans bloquer la publication. Une r?ponse 400 d?un ancien serveur
entra?ne une seule tentative sans les nouveaux champs pour conserver la
compatibilit? d?un d?ploiement progressif. Fichiers :
`services/rideNotificationReceipt.ts`, `store/api/driverDispatchApi.ts`,
backend `ride-notification-receipt.ts`, DTO, contr?leur et service dispatch.
Un re?u ? affich? ? ne prouve jamais qu?un utilisateur a entendu le son.

La reprise serveur concerne uniquement les envois v6 r?cents, accept?s depuis
plus de douze secondes et cr??s depuis moins de quarante-cinq secondes. Elle
est limit?e ? vingt-cinq lignes par passage, avec verrouillage `SKIP LOCKED` et
unicit? de la reprise. Une absence de re?u peut simplement signifier que
l?application reste ferm?e ; elle ne constitue pas une preuve de perte.
La nouvelle tentative est donc born?e et utilise la d?duplication du r?cepteur.
Les messages iOS et les anciens clients ne subissent pas cette reprise de SENT.

La migration est additive et r?versible. Elle limite l?attente des verrous ?
trois secondes et chaque instruction ? quinze secondes dans une transaction,
puis restaure les r?glages pr?c?dents. La cr?ation d?index classique reste ?
planifier au d?ploiement selon le volume r?el ; un d?passement doit faire ?chouer
la migration plut?t que bloquer ind?finiment le trafic. Aucun index n?a ?t? cr??
en production.

## Pr?cautions conserv?es

- Exclusion de l?auteur de la demande, identit? du destinataire et session
  native valides, v?rification serveur avant r?ponse, premi?re acceptation
  gagnante et rejet des offres expir?es.
- Les anciens refus/absences de r?ponse n?activent aucune suspension globale.
- Permissions, canaux d?sactiv?s, volume syst?me et mode Ne pas d?ranger restent
  respect?s. Aucun canal sonore de remplacement n?est cr?? pour contourner un
  choix de silence.
- La carte de secours ouvre les d?tails authentifi?s avec ? Voir et accepter ?
  et ? Voir et refuser ?. Elle ne d?cide pas ? la place du conducteur. Le chemin
  Notifee normal conserve ses actions existantes.
- Un accus? technique n?accepte ni ne refuse une course. Le renvoi conserve
  l?identifiant d?origine, ce qui ?vite de renouveler la sonnerie d?une carte
  d?j? publi?e.
- Aucun changement aux ressources du marimba durant ce correctif : Android
  garde le clip continu de 60 secondes et iOS son fichier distinct de 29 secondes.

## Anomalies suppl?mentaires trouv?es par les essais

1. PostgreSQL/TypeORM ne renvoyait pas une simple liste pour un UPDATE brut :
   le compteur pouvait annoncer deux lignes pour une seule reprise. Le CTE
   termine maintenant par un SELECT ; un essai concurrent v?rifie une seule
   reprise entre deux travailleurs.
2. `notify()` peut retourner avant que la carte soit observable par
   `getActiveNotifications()`. Une observation native born?e ? 300 ms ?vite
   un faux ?chec. Le secours n?est lanc? qu?apr?s un ?chec explicite ; un appel
   Notifee encore en cours est laiss? au m?canisme de reprise, pour ?viter que
   deux publications concurrentes coupent mutuellement leur son.
3. Le r?cepteur natif pr?cise l?ic?ne de notification pr?sente dans les
   ressources de l?application. Le banc de test fournit une ressource ?quivalente.
4. WorkManager n?cessitait Guava dans le classpath de l?application r?elle,
   m?me si le banc poss?dait d?j? cette d?pendance. Les deux d?pendances sont
   d?clar?es dans `plugins/withDriverAlertSources.js` et le Gradle g?n?r?.
5. Le r?veil de secours est diff?r? de 1,5 seconde lorsqu?une action plein ?cran
   est pr?sente, afin de laisser SystemUI d?cider alors que l??cran est encore
   ?teint. Le rappel v?rifie encore le compte, la carte, le d?lai et les r?glages.
   Des protections emp?chent les exceptions de ce rappel d?atteindre le thread UI.

Les sources canoniques sont sous `native/android/notifications` ; leurs copies
sous `android/app/src/main/java/com/zwanga/notifications` ont ?t? synchronis?es.

## V?rifications r?alis?es

- `node scripts/check-release.cjs` : TypeScript mobile, ESLint, fronti?res r?seau,
  limite de taille et parit? native r?ussis ; **2 745 tests r?ussis**, un test
  Ruby ignor? sous Windows. Deux nouveaux tests de re?us ajout?s ensuite passent
  aussi ; la s?rie compl?mentaire re?us/d?lais/politique JVM compte sept succ?s.
- Backend : **136 tests r?ussis dans sept suites**, incluant le transport HTTP
  born?, la diffusion, les payloads Android/iOS, les re?us, la reprise concurrente
  et les sc?narios PostgreSQL/PostGIS sur un cluster jetable en boucle locale.
- `tsc -p tsconfig.build.json --noEmit --incremental false` : r?ussi. La commande
  incluant tous les anciens tests signale encore des erreurs de typage hors de
  ce correctif ; elle ne constitue pas une validation globale du typage des tests.
- Compilation r?elle de l?application Android :
  `:app:compileDebugJavaWithJavac --offline`, r?ussie. Ce n?est ni une compilation
  release compl?te ni une compilation iOS.
- Compilation et installation du banc Android local r?ussies. Neuf sc?narios
  valid?s par `scripts/audits/test-native-ride-delivery.cjs` : carte en arri?re-plan,
  doublon sans renouvellement, ?chec Notifee avec secours, r?servation tardive
  silencieuse, exclusion de l?auteur, offre expir?e, reprise WorkManager,
  ?cran r?veill? avec carte, plein ?cran autoris? sur une invitation isol?e.
- Le sc?nario serveur de bout en bout cr?e des conducteurs fictifs proches et
  ?loign?s, produit les invitations via le vrai service et PostgreSQL, envoie le
  payload HTTP ? un fournisseur simul? local, injecte ce payload dans le vrai
  publieur natif du banc sur l??mulateur, remonte son re?u r?el ? l?API Nest,
  teste le refus et l?acceptation via HTTP et v?rifie le conducteur s?lectionn?.
  Il v?rifie aussi qu?un autre compte ne peut accuser la notification du voisin.

Les chemins de tests sont `src/trip-requests/dispatch/dispatch-postgres.spec.ts`
dans le backend, `tests/ridePlaybackDeadline.test.js`,
`tests/rideReceiptMetadata.test.js` et `tests/nativeRidePayload.test.js` dans
l?application. Le banc `tests/android/ride-alert-harness` ne poss?de pas de
permission r?seau ; seul le processus de test serveur contacte la boucle locale.
L?authentification du contr?leur utilise une identit? de test, pas une connexion
JWT r?elle. Le ciblage, les DTO, les contr?leurs, les services et la base sont r?els.

## Limites et suite du d?ploiement

- FCM/APNs r?els, iPhone physique, restrictions des fabricants Android, son
  acoustiquement audible et interface React Native compl?te ne sont pas certifi?s
  par le banc. Les tests JS exercent s?par?ment les transitions et la restauration.
- Lors d?un sc?nario en rafale conservant plusieurs cartes, Android a affich? la
  notification avec son intention plein ?cran sans ouvrir l?activit?. L?essai
  avec invitation isol?e et autorisation a r?ussi. Ce comportement mesur? interdit
  d?annoncer un plein ?cran garanti ? chaque ?v?nement.
- WorkManager et le r?veil restent soumis ? l?OS. Son enregistrement en base est
  asynchrone : un arr?t du processus avant cette ?criture reste possible. Apr?s un arr?t forc? de
  l?application, un refus de permission ou un blocage syst?me durable, les reprises
  born?es ne garantissent pas la livraison. Un envoi HTTP annul? peut d?j? avoir
  ?t? accept? par FCM ; l?identit? stable et la d?duplication r?duisent le risque
  de doublon, sans pr?tendre assurer une livraison r?seau exactement une fois.
- Le rafra?chissement OAuth est coalesc? et les appelants sont born?s. Le SDK
  de credentials ne fournit pas ici d?annulation de sa propre lecture : une
  lecture d?finitivement bloqu?e reste unique jusqu?? sa r?solution ou au
  red?marrage du processus, sans accumulation de t?ches suppl?mentaires.
- Il faut livrer le backend avec la migration et reconstruire le binaire Android
  pour b?n?ficier du nouveau r?cepteur. Rien n?a ?t? d?ploy? automatiquement.
  Un test avec de vrais comptes de test et des push r?els reste n?cessaire avant
  d?affirmer la fiabilit? sur les appareils de production.

R?f?rence du format public utilis? : [API Firebase HTTP v1](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages).
