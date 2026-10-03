# Audit des performances et de la sécurité du 2 octobre 2026

## Conclusion et périmètre

Audit du code local de l’application Expo et du backend NestJS associé, incluant
les modifications non commitées présentes au début de l’intervention. **Une fuite
critique de champs d’authentification dans la messagerie est confirmée par une
reproduction sur données fictives.** Les autres priorités sont la confidentialité
des trajets et la protection des connexions HTTP et WebSocket.

Les principaux risques de performance restants sont côté serveur : réponses de
trajets non bornées, enrichissement des conversations par requêtes répétées et
chargement excessif de données lors de l’authentification. La limitation de
l’affichage mobile ne limite pas nécessairement le téléchargement ni le cache API.

Il s’agit d’un audit, **pas d’une mise en œuvre des corrections**. Seuls ce rapport
et son entrée dans `CHANGEMENTS_TECHNIQUES.md` sont ajoutés. Aucune modification
fonctionnelle, migration, installation, mise à niveau ou intervention en production.
Aucune lecture de `.env`, de base de données réelle ou de données utilisateur.

## Priorités

| Référence | Gravité | Constat | Ordre proposé |
| --- | --- | --- | --- |
| F01 | Critique | Secrets de session présents dans les réponses de messagerie | Immédiat |
| F02 | Élevée | Réponses de trajets trop riches et lecture des trajets privés sans contrôle de participation | Avant livraison |
| F03 | Élevée | Limitation des tentatives contournable et durées incohérentes | Avant livraison |
| F04 | Élevée | Cycle de vie et protection des connexions WebSocket incomplets | Avant livraison |
| F05 | Moyenne | Contrôles de fichiers tardifs et stockage local insuffisamment protégé | Durcissement ciblé |
| F06 | Moyenne | Historique du chatbot sans propriétaire vérifié ni éviction globale | Durcissement ciblé |
| F07 | Moyenne | Recherche de trajets non paginée et double lecture sur l’accueil | Optimisation serveur puis mobile |
| F08 | Moyenne | Requêtes répétées et taille de page non plafonnée dans les conversations | Optimisation serveur |
| F09 | Moyenne | Authentification répétée avec chargement des véhicules et documents KYC | Optimisation serveur |

La gravité décrit le risque, pas un incident observé. L’exposition réelle dépend
du code effectivement déployé et des contrôles d’infrastructure non vérifiés ici.

## Constats de sécurité

### F01 Secrets de session dans les réponses de messagerie

**Gravité critique. Confiance élevée.** Règles : exposition de données sensibles,
CWE-200, minimisation des réponses et protection des sessions.

**Localisation.** Backend `src/chat/chat.service.ts:191`, `:234`, `:459` et `:509` ;
`src/users/entities/user.entity.ts:60` et `:124` ;
`src/auth/auth.service.ts:1537`. Routes dans
`src/chat/conversations.controller.ts:36` et `:65` et
`src/chat/chat.controller.ts:12`.

**Preuve.** Les lectures de messages utilisent `relations: ['sender']`, puis
retournent le message ou `lastMessage` sans projection du champ `sender`.
L’entité `User` sélectionne par défaut `password`, `accessToken`, `refreshToken`
et `fcmToken`. `generateTokens` enregistre les deux JWT tels quels dans cette entité.
La projection des participants dans `enrichConversation` ne protège pas
`lastMessage.sender`. Aucun sérialiseur global éliminant ces champs n’a été trouvé.

La reproduction locale de `enrichConversation` avec un dépôt simulé confirme la
présence des quatre noms de champs sensibles dans la réponse. Aucune valeur réelle
n’a été utilisée. La pagination récente des messages ne suffit pas : la liste et
le détail des conversations continuent à utiliser cet enrichissement.

**Impact.** Un participant peut obtenir les jetons du correspondant ayant écrit
un message, et potentiellement agir en son nom. Les conversations avec le support
peuvent également concerner des comptes privilégiés. Le hash du PIN est lui aussi
exposé ; un PIN court se prête à une recherche hors ligne.

**Correction recommandée.** Projections explicites de l’auteur pour toutes les
réponses HTTP, WebSocket et notifications ; rendre les colonnes sensibles non
sélectionnées par défaut et les charger explicitement dans les seules routines
d’authentification. Stocker une empreinte des refresh tokens plutôt que leur valeur,
après adaptation du mécanisme de renouvellement.

**Précautions et mitigation.** Tester connexion, renouvellement, support, historique
et émission temps réel. Si ce code est déployé, restreindre les réponses concernées
en priorité et organiser la révocation des sessions potentiellement exposées après
correction. Cette révocation n’est pas effectuée par l’audit. Les valeurs en base
peuvent être nulles ou expirées ; cela ne supprime pas le défaut de projection.

### F02 Données privées accessibles par les lectures de trajets

**Gravité élevée. Confiance élevée.** Règles : autorisation sur les objets, CWE-200
et CWE-862.

**Localisation.** Backend `src/trips/trips.controller.ts:58`, `:73`, `:170`, `:210` ;
`src/trips/trips.service.ts:377`, `:601`, `:3278`, `:3345` et `:3424`.

**Preuve.** Les recherches publiques retournent `sanitizeTrip`, qui inclut
`bookings: sanitizedBookings`. La réservation conserve ses champs par propagation
de `...rest`, dont origine/destination et informations de paiement, et peut renvoyer
`passengerCurrentLocation`. `sanitizeUser` inclut `phone: user.phone`.
La reproduction du sérialiseur avec un trajet fictif confirme téléphone conducteur,
téléphone passager, point d’origine et position récente du passager dans le résultat.

En complément, `GET /trips/all-trips` est authentifié par le garde global mais
sans restriction de rôle ni de propriétaire : sa requête ne filtre ni conducteur,
ni participation, ni `isPrivate`. `GET /trips/:id` ne transmet pas l’identité du
lecteur au service. Les vérifications présentes sur les routes dédiées au suivi
ne protègent pas ces autres chemins de lecture.

**Impact.** Collecte des coordonnées et déplacements de passagers sans participation
au trajet ; un compte ordinaire peut aussi lire des trajets privés ou terminés.

**Correction recommandée.** Séparer DTO public de découverte et DTO participant.
Ne pas joindre les réservations dans les listes publiques ; réserver téléphones,
positions exactes et détails de paiement aux personnes autorisées. Restreindre
`all-trips` au périmètre administratif approprié et vérifier la participation pour
les détails privés. Séparer également les clés de cache selon la projection,
sans réutiliser un détail privilégié comme réponse publique.

**Précautions et mitigation.** Préserver les informations nécessaires pour réserver
et les marqueurs publics explicitement souhaités, sans exposer les passagers.
Tester anonyme, utilisateur tiers, conducteur, passager et administrateur.
La position récente n’est retournée que si elle passe les contrôles de fraîcheur
et de coordonnées ; les autres informations ne dépendent pas de cette fraîcheur.
Aucune réponse de production n’a été téléchargée.

### F03 Limitation des tentatives de connexion insuffisante

**Gravité élevée. Confiance élevée sur le code ; exposition dépendante du proxy.**
Règles : EXPRESS-PROXY-001, EXPRESS-AUTH-001.

**Localisation.** Backend `src/common/guards/throttler.guard.ts:25` et `:47` ;
`docker/nginx/lb.conf:30` ; `src/auth/auth.controller.ts:199` ;
`src/auth/auth.service.ts:300` et `:334` ; `src/app.module.ts:73` ;
`src/google-maps/google-maps.controller.ts:35`.

**Preuve.** Pour une requête publique, le garde prend le premier élément de
`x-forwarded-for` avant `req.ip`. La configuration Nginx versionnée utilise
`$proxy_add_x_forwarded_for`, qui conserve un préfixe fourni par le client.
Le test local confirme que changer uniquement cet en-tête change la clé du quota
pour une même adresse distante simulée. Le login n’ajoute pas de compteur d’échecs
par compte ; la protection visible repose sur ce quota IP alors que le PIN comporte
quatre chiffres.

La valeur globale de repli est `ttl: ... ?? 60`, soit **60 millisecondes** avec
Throttler 5.2.0, non une minute. Plusieurs routes utilisent aussi `6000` tout en
commentant « par minute ». Le login explicite, lui, utilise bien `60000` : le défaut
de durée ne doit pas lui être attribué. Les compteurs du module restent locaux au
processus, sans stockage partagé configuré pour le throttling.

**Impact.** Multiplication des essais de PIN et abus des services publics coûteux,
notamment cartographie et chatbot. Le nombre d’essais n’est pas global entre instances.

**Correction recommandée.** Définir les proxys réellement dignes de confiance,
normaliser les en-têtes au dernier proxy puis utiliser l’adresse validée. Ajouter
un quota partagé IP et compte normalisé, avec temporisation progressive ; clarifier
toutes les durées en millisecondes. Ne pas transformer cela en blocage permanent
d’un compte qu’un tiers pourrait provoquer.

**Mitigation et limites.** Un WAF qui remplace effectivement les en-têtes et limite
les essais peut réduire le risque ; cela reste à vérifier sur l’infrastructure
réelle. Ne pas simplement activer `trust proxy: true`. Références :
[NestJS sur les durées et le stockage des quotas](https://docs.nestjs.com/security/rate-limiting),
[Express sur la confiance accordée aux proxys](https://expressjs.com/en/guide/behind-proxies/).

### F04 Connexions WebSocket non alignées sur le cycle de vie du compte

**Gravité élevée. Confiance élevée sur les contrôles manquants ; impact réseau non
mesuré.** Règles : cycle de vie des sessions, autorisation continue, limitation des abus.

**Localisation.** Backend `src/common/websocket-security.ts:28` et `:72` ;
`src/chat/chat.gateway.ts:44`, `:67` et `:80` ;
`src/tracking/tracking.gateway.ts:135`, `:166` et `:216` ; comparer
`src/auth/strategies/jwt.strategy.ts:29`.

**Preuve.** `authenticateSocket` vérifie la signature et l’expiration du JWT puis
enregistre `userId` et `authExpiresAt`, sans vérifier l’existence ou la suspension
du compte comme le fait la stratégie HTTP. L’expiration est contrôlée sur les
événements entrants, sans fermeture programmée de la socket ni sortie des rooms.
Les diffusions sortantes utilisent directement `server.to(...).emit(...)`.
Aucune politique de quota WebSocket par utilisateur/événement n’a été identifiée
dans ces gateways ; le garde HTTP ne constitue pas cette protection.

**Impact.** Un compte suspendu conservant un JWT valide peut encore établir une
connexion ; une connexion déjà abonnée peut recevoir des diffusions après expiration
du jeton. Les événements de chat/GPS peuvent aussi solliciter les services sans
quota applicatif adapté au temps réel.

**Correction recommandée.** Vérifier le statut serveur au handshake, fermer à
l’expiration, propager les suspensions/révocations aux instances et retirer les
abonnements devenus non autorisés. Ajouter un quota partagé et un contrôle des
traitements simultanés par type d’événement, sans casser la cadence GPS normale.

**Précautions et limites.** Conserver les contrôles de participation déjà présents,
la reconnexion et le renouvellement mobile. Tester un client passif après expiration,
un compte suspendu et plusieurs instances. Les tests actuels vérifient surtout
les événements entrants ; aucun essai réseau de charge n’a été effectué.

### F05 Contrôle des fichiers et protection du stockage local

**Gravité moyenne, pouvant augmenter selon le déploiement. Confiance élevée sur
le code.** Règles : EXPRESS-UPLOAD-001, EXPRESS-STATIC-001.

**Localisation.** Backend `src/users/users.controller.ts:86` et `:122` ;
`src/common/services/file-upload.service.ts:57`, `:67` et `:118` ;
`src/main.ts:197`.

**Preuve.** Les interceptors de profil et KYC ne définissent pas de `limits.fileSize`.
Le plafond est vérifié dans `saveFile`, après réception du buffer. Le type est
contrôlé par `file.mimetype`, fourni par le client, et l’extension locale vient de
`originalname`. Un buffer fictif qui n’est pas une image mais annonce `image/png`
atteint le stockage simulé, avec la modération optionnelle désactivée dans cette
simulation. Aucun fichier ni objet S3 n’a été créé par ce test.

Sans configuration S3, tout le répertoire d’uploads est servi statiquement, y
compris le sous-répertoire KYC. Un document peut alors être lu sans contrôle de
propriétaire dès que son URL est connue. Une extension active autorisée par la seule
déclaration MIME constitue également un risque de contenu actif sur cette origine.

**Impact.** Pression mémoire pendant l’upload ; validation insuffisante du contenu ;
accès durable à des documents sensibles en stockage local. L’exploitation XSS ne
signifie pas automatiquement vol de tokens de l’application native.

**Correction recommandée.** Limites de taille/nombre/champs dès le parseur multipart,
contrôle du format réel puis réencodage des images avec bornes de dimensions,
extension choisie par le serveur. Servir le KYC par une route autorisée ou une URL
signée à durée limitée, hors racine publique.

**Précautions et limites.** Conserver les tailles/formats légitimes, la modération
et le repli de stockage. La limite du proxy peut atténuer le risque mémoire ; la
configuration effective n’est pas inspectée. S3 est privé dans le code examiné :
le constat de publication statique concerne uniquement le mode local. Aucun test
d’upload volumineux ou de contenu actif n’a été lancé.

### F06 Historique du chatbot sans isolation de propriétaire ni borne globale

**Gravité moyenne. Confiance élevée sur le code ; service actif en production non
confirmé.** Règles : autorisation sur les objets, quotas et rétention des données.

**Localisation.** Backend `src/chatbot/chatbot.controller.ts:24` et `:82` ;
`src/chatbot/chatbot.service.ts:14`, `:42`, `:51`, `:162` et `:193`.

**Preuve.** La clé d’historique vient de `dto.conversationId` et n’est pas liée à
`userId`. L’endpoint public peut réutiliser une clé connue. La suppression
authentifiée n’exige pas non plus le propriétaire. La limite de vingt messages
s’applique par conversation, mais la `Map` n’a ni plafond de conversations ni TTL ;
`cleanupOldConversations` ne supprime rien.

**Impact.** Réutilisation ou pollution du contexte d’une autre conversation si son
identifiant est connu, suppression par un autre compte et croissance mémoire avec
le nombre de conversations. Une divulgation précise par le modèle n’a pas été
reproduite ; le défaut d’isolation précède son invocation.

**Correction recommandée.** Identifiants opaques générés côté serveur, propriété
vérifiée à chaque accès, session anonyme dédiée si ce mode reste souhaité, quotas
et stockage partagé à expiration. Fixer aussi une borne globale et un budget de
concurrence pour l’inférence.

**Précautions et mitigation.** Conserver le contexte d’un utilisateur entre ses
messages et la suppression de son propre historique. Restreindre temporairement
l’accès public si ce service est exposé. Aucun appel à Ollama ni test de saturation.

## Constats de performance

### F07 Recherche de trajets non bornée de bout en bout

**Gravité moyenne, impact croissant avec la volumétrie.**

**Localisation.** Backend `src/trips/trips.service.ts:325`, `:414`, `:422` et `:585` ;
application `hooks/home/useHomeTripFeed.ts:58`, `:73`, `:130` ;
`store/api/trip/getTrips.endpoints.ts:34` et `:85`.

**Preuve.** La recherche utilise `getMany()` sans limite et joint toutes les
réservations/passagers. L’accueil demande une liste générale et une liste par
coordonnées, les fusionne, puis ne garde que cinquante éléments dans `tripsSlice`.
Mais les réponses complètes ont déjà été téléchargées, transformées et conservées
dans RTK Query. Le paramètre `minSeats` de l’accueil déclenche la recherche, pas
le chemin sans filtre disposant d’un cache de liste.

**Impact attendu, non mesuré sur téléphone.** Plus de charge SQL, sérialisation,
trafic, allocations et transformation JavaScript à mesure que l’offre augmente.
La limite visuelle de cinquante cartes ne borne pas ces coûts.

**Solution proposée.** Endpoint paginé de découverte avec projection publique
compacte, taille maximale serveur et curseur stable. Une seule stratégie de lecture
sur l’accueil, avec repli explicite si la recherche locale est vide/indisponible.
Conserver le classement premium, les filtres, la recherche et l’accès aux pages
suivantes : un simple `slice` serveur ferait disparaître des résultats.

**Validation future.** Jeux synthétiques de 50/500/5000 trajets ; comparer nombre
de lignes, poids des réponses, temps SQL, transformation JS et mémoire native.
Aucun gain chiffré, EXPLAIN réel ou comportement thermique n’est revendiqué ici.

### F08 Requêtes répétées et page non plafonnée dans les conversations

**Gravité moyenne.**

**Localisation.** Backend `src/chat/chat.service.ts:125`, `:133`, `:459`, `:481` ;
`src/chat/dto/conversation.dto.ts:44`.

**Preuve.** Après la lecture de la page, chaque conversation effectue une recherche
du dernier message puis un comptage des non-lus. La reproduction avec vingt
conversations et dépôts simulés observe **20 recherches + 20 comptages**, hors
lecture initiale de page et authentification. Le DTO impose `Min(1)` mais pas de
`Max` ni `IsInt` ; une valeur fictive d’un million pour `limit` passe la validation.
`Promise.all` multiplie alors les opérations concurrentes selon la taille demandée.

**Impact attendu.** Latence de la messagerie et contention du pool PostgreSQL sous
charge. Le nombre de requêtes est constaté avec mocks, pas leur durée en production.

**Solution proposée.** Plafond entier serveur, requêtes groupées pour derniers
messages et non-lus, projections sûres de F01. Vérifier les index avec le plan
d’exécution réel avant d’ajouter des migrations. Préserver ordre, compteurs,
conversation support et contrôle d’accès aux réservations.

**Limite.** Les pages bornées du cache mobile et la pagination récente des messages
sont déjà présentes ; il ne faut pas les présenter comme absentes. Le problème
décrit concerne l’enrichissement serveur des conversations et les anciens chemins
de messages complets encore exposés.

### F09 Authentification répétée et lecture trop large du profil

**Gravité moyenne. Constat statique corroboré par le code du framework installé.**

**Localisation.** Backend `src/app.module.ts:113` ;
`src/auth/decorators/auth.decorator.ts:8` ;
`src/auth/strategies/jwt.strategy.ts:32` ;
`src/users/users.service.ts:181`.

**Preuve.** `JwtAuthGuard` est global et également ajouté aux routes `@Auth()`.
Le créateur de contexte Nest concatène gardes globaux et locaux ; Passport relance
l’authentification à chaque invocation. La stratégie appelle `usersService.findOne`,
qui charge `relations: ['vehicles', 'kycDocuments']` alors qu’elle utilise surtout
identité, rôle et statut. Les endpoints concernés supportent donc un travail
d’authentification redondant et une lecture inutile des relations.

**Impact attendu.** Coût SQL/hydratation évitable à chaque lecture protégée,
notamment pour les appels fréquents. Les jointures peuvent multiplier les lignes
avec le nombre de véhicules et documents ; aucun facteur de latence réel mesuré.

**Solution proposée.** Garder un seul chemin de garde effectif et une requête dédiée
aux champs d’authentification. Ne pas remplacer la vérification serveur du statut
par le seul rôle contenu dans le JWT ou par un cache sans invalidation.

**Précautions.** Vérifier les routes publiques, privées et administratives,
les suspensions et le changement de mot de passe obligatoire. Le détail complet du
profil doit rester disponible sur son endpoint, pas dans toutes les authentifications.

## Vérifications réalisées

- Lecture statique des chemins API, auth, OTP, paiements, uploads, chat, suivi,
  déclarations de trajet, caches mobiles et cycle de vie GPS.
- Reproductions locales sans réseau ni base réelle : noms des champs sensibles
  de `lastMessage.sender`, projection de trajet fictif, changement de clé du quota
  selon l’en-tête, comptage des appels d’enrichissement, validation d’un plafond
  excessif et acceptation d’un faux contenu image avec stockage simulé.
- Tests JavaScript frontend ciblés : **98 réussis**, couvrant politiques de
  performance, GPS/Places, caches bornés, écrans inactifs, sessions et résultats
  d’actions de trajet.
- Jest backend : **4 suites, 66 tests réussis** — `websocket-security`,
  `throttler.guard`, `ride-declaration.policy`, `ride-declarations.service`.
  Le test de quota existant accepte précisément l’en-tête transmis ; ces suites
  ne constituent pas une validation des scénarios de sécurité manquants ci-dessus.
- TypeScript frontend : `tsc --noEmit --incremental false` réussi.
- Contrôle des frontières réseau réussi ; contrôle de taille : **984 sources,
  aucun fichier au-dessus de 400 lignes**. Ce sont des garde-fous, pas des benchmarks.

## Protections existantes et faux positifs écartés

- Les jetons natifs sont stockés dans SecureStore ; la version de session protège
  les renouvellements et requêtes tardives après changement de compte.
- Les vérifications OTP sont liées à une finalité et consommées atomiquement.
  Les déclarations manuelles de trajet gardent autorisation, double accord,
  idempotence et transactions courtes sans appels réseau ; les effets secondaires
  sont traités après commit.
- Les callbacks PawaPay sont vérifiés et ceux de FlexPay consultent le prestataire
  par défaut. Aucun contournement financier n’est déclaré sur la seule présence
  d’un endpoint public de callback.
- Les abonnements GPS partagés, relectures liées à l’activité et pages bornées déjà
  en place ne sont pas recommandés une deuxième fois comme s’ils étaient absents.
- Dépendances inspectées dans le lockfile : Multer racine 1.4.5-lts.2, mais les
  interceptors Nest référencent leur dépendance imbriquée 2.2.0. L’avis
  [Multer sur le filtre asynchrone](https://github.com/expressjs/multer/security/advisories/GHSA-qvfw-j98x-7q72)
  demande un `fileFilter` asynchrone, non trouvé sur les chemins examinés : il
  n’est pas présenté comme une faille exploitée ici. Aucune mise à niveau aveugle.

## Limites et suite recommandée

Audit ciblé, non certification exhaustive. Pas de test Android/iOS physique, de
profilage Hermes/Instruments/Android Studio, de test de charge, de scan dynamique
de production, d’audit complet de dépendances npm ni d’analyse des accès historiques.
Les politiques WAF, bucket, reverse proxy effectif et les index réellement installés
restent à vérifier. Aucun incident, vol de compte, crash ou chauffe n’est affirmé.

Commencer par F01 et F02, puis F03/F04 ; ajouter des tests négatifs de confidentialité
et de révocation avant livraison. Traiter ensuite F05/F06 et les optimisations
F07–F09 avec mesures avant/après. Les changements de projection devront être
compatibles avec les versions mobiles déjà déployées et ne pas supprimer les
informations dont conducteur et passager ont légitimement besoin.
