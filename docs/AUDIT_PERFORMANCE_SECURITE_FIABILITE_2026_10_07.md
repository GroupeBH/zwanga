# Audit performance, sécurité et fiabilité du 7 octobre 2026

## Synthèse

**Suivi :** les corrections locales ultérieures et leurs vérifications sont décrites
dans le [journal technique](CHANGEMENTS_TECHNIQUES.md#7-octobre-2026--correctifs-de-laudit--sessions-parrainage-réseau-et-push).
Ce rapport conserve l’état constaté avant correction ; les limites restantes,
notamment la révocation push différée hors ligne, sont distinguées dans le journal.

Huit points sont à corriger ou à améliorer dans le code local. Les priorités sont
l’isolation des destinataires push, la distinction entre panne serveur et session
invalide, et la reprise de l’activation des alertes conducteur. Les correctifs des
audits précédents ne sont pas présentés comme des problèmes encore ouverts.

| Réf. | Priorité | Domaine | Constat |
| --- | --- | --- | --- |
| A01 | P1 — avant livraison | Sécurité | Un même jeton push peut rester associé à plusieurs comptes |
| A02 | P1 — avant livraison | Fiabilité | Une panne de base de données pendant le refresh provoque une déconnexion |
| A03 | P1 — avant livraison | Fiabilité | Une activation échouée des alertes conducteur est mémorisée comme réussie |
| A04 | P2 | Sécurité / fiabilité | L’effacement local des identifiants peut échouer silencieusement |
| A05 | P2 | Fiabilité | Un parrainage en attente peut être appliqué au compte suivant |
| A06 | P2 | Fiabilité / latence | Le push de nouvelle réservation n’a pas de reprise durable équivalente au dispatch |
| A07 | P2 | Performance réseau | Des lectures récentes échappent aux règles d’activité et de connectivité |
| A08 | P2 | Performance / fiabilité | Les annonces de mise à jour et les invitations urgentes partagent une file FIFO |

P1 désigne l’ordre de traitement recommandé, pas une exploitation observée en
production. Un chantier complémentaire de tri des dépendances figure après ces
huit constats. Aucun correctif applicatif n’est appliqué dans cette intervention.

## Périmètre et méthode

Lecture de l’application Expo/React Native, de ses tests, et ciblée du backend
NestJS voisin `zwanga-backend` : authentification, jetons push, notifications,
dispatch et réservations. Les chemins backend ci-dessous sont relatifs à ce dépôt
voisin. Les numéros de ligne décrivent l’état local inspecté, non une version de
production certifiée. Les modifications préexistantes sont conservées.

La revue sécurité distingue contrôle serveur, confidentialité des notifications
et persistance locale. Les recommandations web non pertinentes pour React Native
ne sont pas appliquées mécaniquement. Les méthodes backend reproduites ont été
extraites du code et transpilées avec des dépendances simulées ; aucun serveur ni
base de données n’a été démarré. Les reproductions mobiles utilisent les vrais
modules TypeScript et les outils de simulation des tests du projet.

Pas de lecture de `.env`, de secrets, de données personnelles, de trafic ou de
logs de production. Pas de modification de dépendance, de migration, de build
natif ou de déploiement. Le back-office web et l’infrastructure déployée ne font
pas l’objet d’un audit exhaustif.

## A01 — Isolation insuffisante des destinataires push

**Gravité sécurité : élevée. Confiance élevée sur le défaut de rattachement.**
Règle : isolation entre comptes et minimisation des données, CWE-200.

**Sources :** backend `src/users/users.service.ts:896`,
`src/users/entities/user.entity.ts:99`, `src/auth/auth.service.ts:788` ; mobile
`services/pushNotifications.ts:176`, `components/AuthGuard.tsx:293` ; backend
`src/bookings/bookings.service.ts:3731`.

`updateFcmToken` exécute `update(userId, { fcmToken })` sans détacher ce jeton
des autres utilisateurs. La déconnexion backend efface les jetons d’authentification,
mais pas `fcmToken`. `clearStoredFcmToken` ne supprime que la copie SecureStore.
La colonne push ne porte pas de contrainte d’unicité dans l’entité inspectée.

**Reproduction :** la vraie méthode `updateFcmToken`, avec un dépôt fictif, laisse
le même identifiant d’installation sur A et B après son enregistrement par B.
Un changement de compte ne doit pas être assimilé à un changement garanti du
jeton natif. Expo documente sa stabilité entre mises à jour dans sa
[FAQ push](https://docs.expo.dev/push-notifications/faq/).

**Impact :** après A → déconnexion → B sur le même téléphone, des notifications
destinées à A peuvent encore afficher noms et informations de trajet. Le contrôle
du `driverId` avant une réponse empêche une action pour A depuis B, mais ne protège
pas un texte déjà affiché par le système.

**Correction proposée :** rattacher atomiquement chaque installation push à son
propriétaire courant, détacher l’ancien propriétaire et ses capacités associées,
et désenregistrer l’installation à la déconnexion avec reprise contrôlée si elle
est hors ligne. Vérifier aussi les envois différés et limiter les données sensibles
des notifications susceptibles d’être déjà en transit. Préserver les autres
appareils autorisés si le produit prend en charge plusieurs installations.

**Limite :** pas d’envoi réel APNs/FCM ni de preuve d’exposition en production.
Le nettoyage serveur ne peut pas rappeler un push déjà confié au transport.

## A02 — Une panne de refresh est présentée comme une session invalide

**Gravité fiabilité : élevée. Confiance élevée.**

**Sources :** backend `src/auth/auth.service.ts:753` et `:779`,
`src/auth/strategies/jwt.strategy.ts:36` ; mobile `services/tokenRefresh.ts:9`
et `:62`.

Le `catch` de `refreshToken` transforme toute erreur en `UnauthorizedException`,
y compris une indisponibilité du dépôt utilisateur ou un échec technique pendant
la génération des jetons. Le client interprète correctement un HTTP 401 de refresh
comme un refus définitif et exécute `forceLocalLogout`.

**Reproduction :** vérification JWT simulée réussie, puis dépôt utilisateur levant
un timeout fictif : la vraie méthode renvoie 401, non une erreur temporaire. Les
tests mobiles existants confirment qu’un 401 efface la session, alors qu’un 503 la
conserve. Le `catch` global de `JwtStrategy.validate` présente un défaut analogue
de classement des erreurs sur les requêtes authentifiées ordinaires.

**Impact :** une panne d’infrastructure peut déconnecter des utilisateurs ayant
des identifiants valides, perturber le suivi d’un trajet et multiplier les reconnexions.

**Correction proposée :** réserver 401 aux jetons réellement invalides, expirés ou
révoqués ; conserver les refus métier et retourner une erreur 5xx contrôlée pour
une panne technique. Ne pas contourner l’autorisation : refuser l’opération, tout
en permettant au mobile de garder son contexte et de réessayer avec délai borné.
Tester lecture et écriture de jetons en panne, suspension et rotation concurrente.

## A03 — L’échec d’activation des alertes conducteur n’est pas repris

**Gravité fiabilité : élevée. Confiance élevée.**

**Sources :** `components/AuthGuard.tsx:284`, `:293`, `:299`, `:300` ; backend
`src/trip-requests/dispatch/dispatch.service.ts:253`,
`src/notifications/notifications.service.ts:420`.

Après l’enregistrement du jeton push, les erreurs de configuration native,
d’enregistrement de la tâche de fond ou de `/driver-dispatch/notifications` sont
absorbées. Le code renseigne malgré tout
`lastSyncedFcmRegistration.current = registrationKey`. Le même couple compte/jeton
est ensuite ignoré. Le résultat `{ registered: false }` n’est pas non plus vérifié.

**Reproduction :** vraie fonction locale `syncTokenWithBackend`, transport simulé :
premier enregistrement des capacités en échec, puis nouvelle tentative avec un
access token différent mais le même compte et jeton push. Un seul appel aux
capacités a lieu : la deuxième tentative est écartée comme déjà synchronisée.

**Impact :** le conducteur peut conserver des push ordinaires mais ne pas avoir
sonnerie/actions. Sans capacité enregistrée, le backend l’exclut des propositions
de proximité. Un redémarrage peut permettre de réessayer ; le problème n’est pas
une désactivation définitive du compte.

**Correction proposée :** séparer les états « jeton enregistré » et « capacités
confirmées », vérifier `registered`, puis prévoir une reprise bornée au retour
réseau/au premier plan. Maintenir le repli pour les anciens backends sans bloquer
la connexion et distinguer une incompatibilité durable d’une panne transitoire.

## A04 — Déconnexion locale sans garantie d’effacement durable

**Gravité sécurité : moyenne, conditionnelle à une erreur de stockage.**
Règle : invalidation de session et traitement explicite des erreurs, CWE-613.

**Sources :** `services/tokenStorage.ts:230`, `:239`, `:243` ;
`store/slices/authSlice.ts:55`, `:67` ; `features/auth/sessionPolicy.ts`.

`clearTokens` efface le cache mémoire, absorbe chaque rejet de `deleteItemAsync`,
puis retourne seulement le résultat de la comparaison de version de session.
L’appelant peut donc annoncer une déconnexion complète alors que les anciennes
valeurs restent sur disque. La déconnexion serveur est volontairement tolérante
aux pannes réseau.

**Reproduction :** deux faux JWT non expirés, suppression SecureStore simulée en
échec : `clearTokens()` retourne `true`, le cache courant est vide, mais une nouvelle
instance du vrai module relit les deux valeurs. Elles restent admissibles selon
la vraie politique `hasRecoverableAuthSession` utilisée pour la reprise.

**Impact :** particulièrement si la révocation serveur n’a pas pu aboutir, un
redémarrage peut restaurer le compte dont la personne pensait s’être déconnectée.
Ce scénario suppose une panne du stockage ; sa fréquence native n’est pas mesurée.

**Correction proposée :** enregistrer et traiter explicitement l’intention de
déconnexion, empêcher la restauration tant que le nettoyage n’est pas confirmé,
et réessayer l’effacement. Ne pas considérer un simple cache mémoire vide comme
une preuve d’effacement durable. Tester également un stockage totalement
indisponible et préserver la protection contre les réponses d’une ancienne session.

## A05 — Parrainage persistant non rattaché au compte de capture

**Gravité fiabilité : moyenne. Confiance élevée.**

**Sources :** `utils/referralAttribution.ts:3` et `:10`,
`components/ReferralAttributionHandler.tsx:64`, `:142`.

Les invitations en attente utilisent des clés globales au téléphone. Leur structure
ne mémorise pas le compte authentifié au clic. La reprise choisit
`current.current.userId` au moment de l’attachement, non le propriétaire de l’intention
initiale. La protection contre les anciennes attributions différées déjà consommées
ne couvre pas cette invitation encore en attente.

**Reproduction :** vrai composant et stockage simulé : capture hors ligne avec A
connecté, passage à B, retour réseau. L’appel d’attachement est lancé sous B.

**Correction proposée :** associer les captures authentifiées à leur compte,
isoler la file par propriétaire et vérifier la session avant l’attachement. Garder
un parcours distinct pour une capture anonyme destinée à la future inscription.
Conserver la date originale, la priorité de la première invitation et les reprises
hors ligne. Le serveur continue de décider de l’éligibilité ; aucun contournement
de ses règles de parrainage n’est démontré ici.

## A06 — Nouvelle réservation sans reprise durable du push

**Gravité fiabilité : moyenne à élevée selon la dépendance aux alertes.**
Constat établi par lecture des chemins d’envoi et de reprise, pas par incident réel.

**Sources backend :** `src/bookings/bookings.service.ts:1372`, `:3697`, `:3731` ;
`src/notifications/notifications.service.ts:45`, `:285`, `:603`.

`notifyDriverOfNewBooking` ignore l’envoi si le conducteur n’a pas encore de jeton.
Sinon il utilise `sendNotification`, non une notification transactionnelle avec
`eventKey`. Un échec est enregistré, mais `new_booking` ne figure pas parmi les
types repris par `claimCriticalFinancialNotifications` : cette reprise concerne
les événements dotés d’une clé ou les types critiques explicitement listés.
La réservation attend aussi cet appel d’envoi avant de rendre sa réponse.

**Impact :** une réservation peut être créée sans alerte push livrée ni nouvelle
tentative automatique après une panne ponctuelle. L’affichage dans l’application
peut la retrouver ; cela ne remplace pas l’alerte attendue téléphone en veille.
Le transport ajoute également de la latence au parcours de réservation.

**Correction proposée :** inscrire l’événement dans la file durable au commit de
la réservation, même sans jeton disponible, avec clé stable et reprise courte
adaptée. Avant chaque envoi, revérifier réservation encore en attente, trajet,
destinataire et échéance ; ne pas rejouer la création de réservation pour réessayer
son push. Conserver la suppression des invitations pour les trajets privés issus
d’une demande déjà attribuée.

## A07 — Lectures hors ligne ou derrière un autre écran

**Gravité performance : moyenne.** Le travail superflu est confirmé ; son coût
batterie, réseau et rendu sur téléphone n’est pas mesuré.

**Sources :** `components/DriverPresenceCoordinator.tsx:19`, `:35`, `:52`,
`features/publish/PublishPaymentModes.tsx:18`, `store/api/driverFinanceApi.ts:20`.

Le coordinateur de présence utilise l’activité de l’app mais pas le signal réseau.
Son timer appelle `refetch()` toutes les 45 secondes même lorsque RTK annonce
`online: false`. Le profil global reste également abonné en arrière-plan. Dans
la publication, la lecture des finances est suspendue uniquement en l’absence
d’utilisateur, pas lorsque le portefeuille recouvre le formulaire. Ses tags
`Wallet`, `Subscription` et `Booking` peuvent donc réactualiser cet abonnement masqué.

**Reproduction :** vrai coordinateur, `online: false`, transport simulé en échec :
lecture initiale puis deux ticks simulant 45 secondes chacun donnent trois
tentatives de lecture. Aucun paquet réseau ni temps GPS réel n’est mesuré. Le
maintien de l’abonnement financier masqué est établi par inspection des options
du hook ; RTK déduplique toujours les abonnements à une même clé.

**Correction proposée :** étendre la politique d’activité/connectivité existante
à ces lectures, prévoir une reprise unique au retour réseau/écran, et conserver
le brouillon de publication. Ne pas appliquer ce blocage aux actions financières
ni au suivi GPS natif requis pendant un trajet. Le serveur doit continuer à
laisser expirer une présence sans position récente, sans prolongation optimiste.

## A08 — Les alertes urgentes attendent derrière les annonces

**Gravité performance / fiabilité : moyenne, dépendante de la charge.**

**Sources backend :** `src/notifications/notifications.service.ts:492`, `:508`,
`:517` ; `src/app-updates/app-update-dispatch.service.ts:21` et `:36` ;
`src/trip-requests/dispatch/dispatch.service.ts:29`, `:207`, `:261`.

La file transactionnelle prend les 25 notifications les plus anciennes, tous
types confondus, et les envoie par groupes de cinq. Les campagnes de mise à jour
peuvent y ajouter jusqu’à 100 lignes par passage de 30 secondes. Une invitation
de proximité expire par défaut 30 secondes après sa création, avant sa livraison.
L’appel supplémentaire du dispatcher par le cycle de proximité accélère la
vidange, mais ne change ni cet ordre ni le verrou de traitement en cours.

**Impact conditionnel :** avec une file déjà en retard ou un transport lent, une
invitation urgente peut attendre derrière des annonces non urgentes, puis être
supprimée à raison parce qu’elle a expiré. Ce n’est pas une saturation observée,
ni une mesure du débit maximal de production.

**Correction proposée :** réserver une capacité de traitement aux invitations
à échéance courte, avec ordre par priorité/échéance et une part de capacité pour
les autres événements. Conserver déduplication, claims multi-instance et contrôle
d’obsolescence. Mesurer délai création → envoi, âge de file, erreurs transport et
invitations expirées avant envoi ; valider sous charge avant de modifier les délais.

## Dépendances à trier séparément

La consultation du registre npm avec `npm.cmd audit --omit=dev --json` a retourné
63 signalements de paquets : 23 modérés, 39 élevés et un critique. La première
tentative réseau avait échoué ; la nouvelle consultation a produit le résultat
ci-dessus. Ce total inclut les dépendances indirectes et leurs parents affectés :
il ne représente ni 63 défauts indépendants ni 63 failles exploitables sur téléphone.
L’option `--omit=dev` ne suffit pas à exclure l’outillage livré dans les dépendances
d’Expo et React Native.

Exemple vérifié : `package-lock.json:13673` contient `shell-quote@1.10.0`, apporté
par `react-devtools-core` (`package-lock.json:12615`). L’[avis du mainteneur
GHSA-pqg4-j6r4-53mv](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv)
annonce une correction en 1.11.0 d’une injection conditionnelle dans la construction
de commandes shell. Aucun chemin d’exploitation de cette fonction depuis une
entrée utilisateur mobile n’est démontré par cet audit. Ce signal doit être traité
comme une maintenance de la chaîne d’outils, pas comme une preuve d’exécution de
commandes à distance dans Zwanga.

**Amélioration proposée :** trier les alertes selon le code réellement chargé
(mobile natif, web, outils de build), mettre à jour les dépendances compatibles
par lots, puis refaire tests et builds. Ne pas lancer `npm audit fix --force` :
le résultat suggère notamment des changements majeurs et même des retours à des
versions anciennes d’Expo. Aucun paquet ni lockfile n’a été modifié ici. L’audit
de dépendances concerne le dépôt mobile, pas l’arbre complet du backend ou les
bibliothèques natives CocoaPods/Gradle.

## Vérifications réalisées et limites

- `node --test --test-concurrency=4 --test-reporter=tap tests/*.test.js` :
  **1 478 tests réussis, aucun échec**, environ 124 secondes sur cet environnement.
- `node node_modules/typescript/bin/tsc --noEmit` : réussite, aucune erreur.
- `node scripts/check-network-boundaries.js` : réussite.
- `node scripts/check-source-size.cjs` : 1 035 sources, aucune au-dessus de 400 lignes.
  Ce contrôle est une règle de maintenance, pas une mesure de performance.
- Reproductions supplémentaires en mémoire : rattachement push partagé,
  refresh avec panne du dépôt, capacités push non reprises, suppression SecureStore
  en échec, parrainage entre comptes, timer de présence hors ligne. Dépendances
  natives et transports simulés ; aucun appel métier réel.

Les tests JavaScript verts ne couvrent pas à eux seuls ces scénarios d’échec, les
crashs UIKit, le comportement APNs/FCM en veille, la chauffe, les FPS ou la mémoire
native. Aucun essai sur iPhone/Android physique ni plan d’exécution PostgreSQL de
production n’a été réalisé. Les dépendances natives nécessitent aussi une revue
de compatibilité et des essais de build, distincts de l’analyse JavaScript.

## Ordre de correction proposé

1. Isoler les installations push par compte et corriger la classification des
   erreurs d’authentification (A01, A02).
2. Rendre fiable l’activation puis la livraison des alertes (A03, A06, A08).
3. Renforcer les intentions persistantes de déconnexion et parrainage (A04, A05).
4. Réduire les lectures inutiles et mesurer le résultat sur appareil (A07).

La présente intervention ajoute uniquement ce rapport et sa référence dans le
journal technique. Les solutions ci-dessus restent proposées, non appliquées.
