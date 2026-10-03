# Corrections de l’audit sécurité et performance — 2 octobre 2026

## Périmètre et statut

Implémentation locale des constats F01–F09 du
[rapport d’audit](AUDIT_PERFORMANCE_SECURITE_2026_10_02.md), dans `zwanga` et
le dépôt voisin `zwanga-backend`. Le rapport d’audit reste un état historique.
Les chemins `src/…` et `docker/…` ci-dessous désignent le backend.

Les recommandations de revue sécurité ont guidé les projections explicites,
les contrôles de propriété et les limites d’entrée. Les recommandations
PostgreSQL ont guidé la pagination avant hydratation et les requêtes groupées.
Aucun index ni migration n’a été inventé sans plan d’exécution réel.

## Solutions effectivement appliquées

### F01 — Champs d’authentification dans la messagerie

- `src/chat/message-response.ts` introduit une liste explicite des champs des
  messages et de leur expéditeur. `chat.service.ts` l’applique aux réponses REST,
  WebSocket et aux résumés `lastMessage`, sans modifier l’envoi des notifications.
- `src/users/entities/user.entity.ts` exclut par défaut mot de passe et jetons des
  sélections TypeORM. Les chemins qui vérifient un PIN, un mot de passe administrateur
  ou un refresh token sélectionnent explicitement les seuls champs nécessaires.
- `src/auth/token-fingerprint.ts` et `auth.service.ts` stockent des empreintes SHA-256
  des nouveaux jetons, avec comparaison à temps constant. Les jetons historiques
  restent acceptés lors du refresh puis sont remplacés par des empreintes.
  Le hachage lent bcrypt du PIN est conservé ; un PIN ne se traite pas comme un JWT.

Les contrats de connexion, OTP, Google/Apple et renouvellement restent inchangés.
Les champs FCM restent disponibles aux services de notifications, mais ne sont
jamais dans la projection des expéditeurs. Aucune révocation globale n’est exécutée.

### F02 — Confidentialité des trajets et vérification de participation

- `src/trips/trip-read-policy.ts`, `trips.controller.ts` et `trips.service.ts`
  séparent découverte publique et détail participant. Les listes publiques n’exposent
  ni passagers/réservations, ni téléphones, ni plaque, ni position GPS en direct,
  ni contacts de sécurité. Les points publiés de départ et d’arrivée restent visibles.
- Le détail privé exige conducteur ou titulaire d’une réservation. Les droits sont
  relus en base **avant** tout accès au cache de détail. Un passager ne reçoit que
  ses réservations ; une réservation annulée ne donne plus accès au suivi actif.
  L’état serveur du trajet et de la réservation prévaut sur le cache pour ces décisions.
- `GET /trips/all-trips` est réservé aux rôles administratifs existants. Il conserve
  une réponse tableau mais accepte `page` et `limit` : 50 trajets par défaut,
  100 maximum, ordre départ/identifiant stable avant hydratation. L’ancien cache
  global non borné n’est plus lu par cette route.
- `app/driver/[id].tsx` ne télécharge plus tous les trajets pour calculer deux nombres
  et une liste de véhicules. `users.service.ts`, `src/users/dto/user.dto.ts`,
  `store/api/user/getProfileSummary.endpoints.ts`, `profileMapper.ts` et `types/users.ts`
  fournissent les statistiques agrégées et véhicules via le profil public existant.

Le conducteur conserve ses données de gestion, le passager ses informations de
réservation/paiement, les parties autorisées les contacts utiles. Une réservation
historique conserve l’accès à son propre historique ; ce n’est pas un droit de suivi GPS.

### F03 — Quotas fiables et partagés

- `src/common/services/redis-throttler.storage.ts` utilise un compteur Redis atomique
  avec expiration, partagé entre instances. Une erreur du stockage refuse l’opération
  au lieu de désactiver le quota. Le délai `Retry-After` est exprimé en secondes.
- `src/common/guards/throttler.guard.ts` utilise l’utilisateur authentifié ou
  `req.ip`, jamais directement l’en-tête fourni par le client. `src/main.ts` fait
  confiance uniquement aux adresses/CIDR explicitement configurés par
  `TRUSTED_PROXY_CIDRS`. `docker/nginx/lb.conf` remplace le préfixe X-Forwarded-For
  fourni par le client par l’adresse distante observée par Nginx.
- `account-throttle.decorator.ts` et `auth.controller.ts` ajoutent un quota commun
  par numéro normalisé/haché pour login et login administrateur : 20 tentatives
  sur 15 minutes, 60 sur 24 heures. Il expire automatiquement ; le reset PIN reste
  disponible. Il compte toutes les tentatives, pas seulement les échecs.
- `app.module.ts` valide une durée en millisecondes via `THROTTLE_TTL_MS` ; la variable
  historique `THROTTLE_TTL` reste interprétée en secondes. Sans configuration : 60 s.
  Une valeur invalide empêche le démarrage plutôt que de neutraliser silencieusement
  le quota. Les anciennes durées de 6 s commentées « par minute » deviennent 60 s
  dans les contrôleurs trips/vehicles/google-maps. Les quotas GPS autorisent
  60 écritures et 120 lectures/minute ; `/health` dispose de 120 lectures/minute.

Les quotas restent temporaires et les erreurs ajoutées sont en français. La cadence
GPS habituelle de quatre secondes reste en dessous des plafonds.

### F04 — Sessions et abonnements WebSocket

- `src/common/services/ws-session.service.ts` vérifie en base existence, activation,
  suspension et empreinte du jeton au handshake. Il ferme les sockets à l’expiration
  même lorsqu’elles ne produisent aucun événement. Une relecture groupée toutes les
  10 s détecte suspension, révocation et remplacement du jeton ; elle échoue fermée
  si la vérification serveur échoue. Ce délai n’est pas une révocation instantanée.
- `ws-tracking-rooms.ts` retire les abonnements GPS devenus invalides : trajet actif
  et conducteur, ou réservation acceptée. La politique de consultation du chat
  historique entre ses deux propriétaires reste conservée.
- `ws-work.interceptor.ts` borne les opérations en cours à 3 par compte et 64 par
  processus. Les quotas Redis communs aux gateways sont 30 connexions/minute/compte
  et 120 événements/minute/compte. Les connexions sont plafonnées à 6 par compte
  et 2 000 par processus ; ces deux plafonds ne sont pas des limites globales de cluster.
- `websocket-security.ts`, `chat.gateway.ts`, `tracking.gateway.ts` et `common.module.ts`
  appliquent ces protections, bornent les rooms à 32 et traitent `leave_booking`.
- `services/chatSocket.ts` et `services/trackingSocket.ts` réutilisent le mécanisme
  mobile de refresh existant lors de `session_expired`, avec ses protections de compte.

Contrôles de participation, notifications, détection automatique, abonnements partagés
et reconnexion sont conservés. Le garde HTTP n’est pas présenté comme un quota WebSocket.

### F05 — Images et stockage local KYC

- `src/common/image-upload-policy.ts`, `users.controller.ts`, `auth.controller.ts`
  limitent le multipart avant stockage mémoire : 5 Mio/fichier, 3 fichiers,
  32 champs, 35 parties et 64 Kio/champ. Les contrôles existants de taille configurable
  dans le service restent appliqués en plus de ce plafond.
- `file-upload.service.ts` vérifie le contenu réel JPEG/PNG/WebP puis utilise
  **Sharp 0.35.5**, ajouté et verrouillé dans `package.json`/`package-lock.json`.
  Décodage complet, maximum 25 millions de pixels, refus des images animées/multipages,
  orientation corrigée, dimensions ramenées à 2 560 pixels maximum sans agrandissement,
  JPEG qualité 90, retrait des métadonnées, dont GPS. Quatre décodages simultanés
  maximum par processus et délai de traitement configuré à dix secondes.
- `local-upload-policy.ts` et `main.ts` remplacent l’exposition statique générale par
  des clés de fichier contrôlées ; KYC local nécessite une signature liée au chemin
  et à l’expiration. Les lecteurs KYC autorisés obtiennent une URL valable 15 minutes,
  `no-store`, sans possibilité de signer un KYC via une photo de profil/véhicule.
  Les chemins de suppression locaux sont également bornés.

Modération existante, stockage S3 privé, profil et pièces KYC restent disponibles.
Les URL publiques historiques de KYC local deviennent volontairement inaccessibles
sans signature ; une relecture autorisée les renouvelle. Les URL hébergées par un
prestataire externe ne sont pas réécrites. Références consultées :
[limites du décodeur Sharp](https://sharp.pixelplumbing.com/api-constructor/) et
[installation des binaires](https://sharp.pixelplumbing.com/install/).

### F06 — Historique et charge du chatbot

- `src/chatbot/chatbot-history.ts` remplace la Map sans plafond par Redis : propriété
  vérifiée, 20 messages de 4 000 caractères maximum, expiration après 30 minutes,
  index plafonné à 500 conversations. L’écriture et la suppression contrôlent aussi
  le propriétaire atomiquement ; une suppression pendant une réponse est refusée.
- Les identifiants sont générés côté serveur. Une conversation anonyme exige son
  `conversationToken` signé, lié à son identifiant, propriétaire et expiration.
  Connaître uniquement l’identifiant ne permet pas de reprendre son historique.
  Les conversations anonymes et authentifiées sont séparées.
- `chatbot.service.ts`, `chatbot.controller.ts`, `dto/chatbot.dto.ts` ajoutent ces
  contrats, un bail Redis de concurrence (4 traitements, 1 par conversation),
  une annulation d’inférence à 30 s et une limite de génération de 512 tokens.
  Les erreurs internes ne sont plus retournées telles quelles au client.

La FAQ et le contexte des messages sont conservés. Un client anonyme doit désormais
renvoyer le token reçu pour continuer ; les anciennes conversations en mémoire ne
sont pas importées. Aucun appel au modèle réel n’a été effectué pour ces tests.

### F07 — Découverte paginée et accueil moins coûteux

- `src/trips/trip-discovery-page.ts`, `dto/trip.dto.ts`, `trips.service.ts` et
  `trips.controller.ts` ajoutent `POST /trips/discovery`, 30 éléments par défaut,
  50 maximum, sans jointure des réservations/passagers. Le curseur est lié aux
  filtres et au classement premium/prix, distance ou date, puis date/identifiant.
  Les directions suivante/précédente sont prises en charge avec paramètres SQL liés.
  La limite est appliquée avant hydratation ; les listes publiques historiques
  sont également plafonnées. La clé de cache de découverte est versionnée et son
  invalidation conservée via `cache.service.ts`.
- `store/api/trip/discovery.ts`, `contracts.ts`, `tripApi.ts`,
  `hooks/search/useSearchController.ts` et `app/search.tsx` utilisent trois pages
  maximum de 30 trajets dans RTK Query, avec navigation dans les deux directions.
  Le compteur décrit les trajets « affichés », pas un faux total serveur.
  Le filtre de places reste immédiat à l’écran, avec 350 ms de temporisation réseau ;
  le délai de 450 ms pour la recherche textuelle est conservé.
- `hooks/home/useHomeTripFeed.ts` attend le résultat géographique avant de solliciter
  le repli général, sauf absence de localisation. Les lectures sont suspendues
  lorsque l’écran est inactif et la copie Redux reste bornée à 50 éléments.

Filtres, tri, classement premium, accès aux pages suivantes, demandes de trajets et
repli hors connexion sont conservés. En mode repli, la lecture périodique locale
peut continuer pour détecter le retour de résultats proches : ce n’est pas la
suppression absolue de toute paire de requêtes. Les pages ne sont pas un instantané
immuable d’une base qui continue à recevoir des modifications.

### F08 — Conversations : requêtes groupées et lectures historiques bornées

- `src/chat/conversation-summaries.ts` charge les derniers messages et les non-lus
  avec **deux requêtes groupées par page**, au lieu de deux par conversation.
  `chat.service.ts` et `dto/conversation.dto.ts` plafonnent les pages à 50 entiers,
  les contenus à 4 000 caractères et les listes de participants à 50.
- `src/common/legacy-page.ts`, contrôleurs chat/conversations/support et services
  chat/support bornent également les anciennes lectures de messages à 100 éléments.
  Elles gardent leur réponse tableau, les derniers messages en ordre chronologique,
  et acceptent `page`/`limit` pour accéder aux précédents. Le WebSocket historique
  retourne les 100 derniers messages. Le client mobile récent conserve sa route
  paginée par curseur déjà existante, inchangée.

Les non-lus, droits d’accès, conversation support, envois et notifications sont
conservés. Les consommateurs anciens supposant une liste exhaustive devront paginer.
Les pages offset de compatibilité sont plafonnées à 10 000 ; le curseur reste
préférable pour de grands historiques. Aucun gain de latence réel n’est revendiqué.

### F09 — Authentification sans lectures redondantes

- `src/common/guards/jwt-auth.guard.ts` mémorise une validation réussie uniquement
  dans la requête HTTP courante via un symbole interne. Un simple `req.user` ne
  contourne pas Passport ; un échec n’est pas mémorisé. Gardes globaux et décorateurs
  existants sont conservés pour ne pas fragiliser les routes.
- `src/auth/strategies/jwt.strategy.ts` appelle `UsersService.findAuthIdentity`,
  projection de sept champs sans véhicules ni pièces KYC. Le statut est relu sur
  le serveur à chaque requête, sans cache de rôle ou de suspension.

Le détail complet reste disponible via l’endpoint de profil. Aucun changement aux
règles d’autorisation administrateur ou de changement obligatoire de mot de passe.

## Vérifications réalisées et résultats

- Passe élargie frontend Node : **397 tests réussis**, incluant accueil, recherche,
  sessions, profil, performance, historiques, récupération de trajet et paiement.
  Après nettoyage ciblé des imports/dépendances de hook : **31 tests supplémentaires
  rejoués avec succès**, avec recouvrement ; les nombres ne s’additionnent pas.
- Backend Jest : **23 suites, 289 tests réussis**. Couverture des projections négatives,
  vérification de droits avant cache, statuts obsolètes, refresh/PIN/OAuth, uploads,
  chatbot, quotas, pagination, chat, suivi, réservations et déclarations de trajet.
- Huit tests de chat utilisent un serveur Socket.IO local réel avec base et Redis
  simulés. Les tests de décodage exécutent réellement Sharp sur des images synthétiques.
- Compilation de requête avec les vraies métadonnées TypeORM/PostgreSQL, sans
  connexion ni exécution SQL : vérifie alias de clé primaire, guillemets et LIMIT.
  Cette vérification a détecté puis permis de corriger deux défauts de pagination
  invisibles dans les premiers mocks. Ce n’est pas un test PostGIS réel.
- TypeScript application `--noEmit --incremental false` et backend production
  `-p tsconfig.build.json --noEmit --incremental false` réussis. La compilation globale
  backend incluant tous les anciens specs comportait déjà des erreurs hors périmètre
  (activity, keccel-otp, pawapay, trip-request-privacy, legal-identity, user-gender,
  trip-loyalty) ; elle n’est pas déclarée entièrement verte.
- ESLint sur les fichiers frontend modifiés par cette intervention : zéro erreur
  et zéro avertissement après correction ciblée. Contrôle des frontières réseau
  réussi ; **985 sources, aucune au-dessus de 400 lignes**. `git diff --check` réussi,
  avec simples avertissements de conversion CRLF/LF. Pas d’autoformatage global.

Les premiers échecs de mocks liés aux nouveaux contrôles de session, au flux accueil
séquentiel et aux libellés de recherche ont été corrigés. Les assertions de propriété,
de refus et de limites sont conservées ou renforcées, pas supprimées pour verdir les tests.

## Livraison et limites restantes

1. Déployer le backend avant l’application qui appelle `/trips/discovery`.
   Tester la compatibilité des anciennes versions : profil conducteur ancien utilisant
   `all-trips` désormais refusé, pagination des anciennes listes et token du chatbot.
   La suppression des données privées exposées est intentionnelle.
2. Définir **les adresses réelles du dernier proxy** dans `TRUSTED_PROXY_CIDRS`.
   Sans cela derrière Nginx, le serveur est protégé contre l’en-tête forgé mais plusieurs
   utilisateurs publics partageront le quota de l’IP du proxy. Ne pas activer une
   confiance universelle. Vérifier aussi le cas d’un CDN en amont et empêcher l’accès
   direct non prévu au backend. Aucune valeur d’infrastructure n’a été devinée.
3. Vérifier Redis commun à toutes les instances et sa disponibilité. Les limites et
   historiques dépendants de Redis refusent les opérations lorsque le stockage échoue.
   Tester réellement les scénarios multi-instance, expiration et panne avant production.
4. Installer les dépendances backend depuis le lockfile et vérifier Sharp dans l’image
   Linux de livraison. Valider les photos KYC sur appareils réels après réencodage et
   l’accès aux URL signées sur le proxy ; conserver une clé de signature stable et secrète.
5. Après analyse opérationnelle de F01, décider de la révocation des sessions qui ont
   pu être exposées. **Aucune analyse de logs réels ni révocation n’a été effectuée.**
   Les anciennes valeurs stockées migrent lors d’un login/refresh. Le contrôle des
   empreintes WebSocket n’est pas une promesse de révocation immédiate de tous les
   JWT HTTP : la politique HTTP existante de validité du jeton reste en place.
6. Réaliser des essais iOS/Android physiques, du profilage natif, des mesures SQL/EXPLAIN
   et des tests de charge contrôlés. Les limites et nombres d’appels sont vérifiés
   localement ; aucune amélioration chiffrée de batterie, chauffe ou latence réelle
   n’est affirmée. Aucun audit exhaustif de dépendances ou de production n’a été mené.

Les modifications préexistantes sur double accord embarquement/dépose, file hors
connexion, résultats d’action, paiement unifié et règles cash/participation Zwanga
sont conservées. Aucun secret, fichier `.env`, utilisateur réel ou environnement de
production n’a été consulté ou modifié pour cette intervention.
