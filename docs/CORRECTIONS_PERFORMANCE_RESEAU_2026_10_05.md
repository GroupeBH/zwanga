# Corrections performance et réseau — 5 octobre 2026

## Périmètre

Mise en œuvre des cinq constats de l'[audit du 4 octobre](AUDIT_PERFORMANCE_RESEAU_2026_10_04.md).
Les changements portent sur la reprise de session, les confirmations GPS, les
lectures d'affichage des écrans audités et le carnet d'adresses d'invitation.
Les modifications préexistantes, notamment la terminologie d'arrivée à
destination et les notifications transactionnelles du backend, sont conservées.

Les résultats ci-dessous sont des vérifications de code et des tests automatisés
avec dépendances natives/réseau simulées. Ce ne sont pas des mesures sur appareil
ou en production. Aucun déploiement, migration ou ajout de dépendance effectué.

## R01 — Reprise du renouvellement après reconnexion

**Problème :** après un échec réseau transitoire, le délai de renouvellement de
60 secondes empêchait aussi une nouvelle tentative lorsque la connexion revenait.

**Appliqué :** un compteur de transitions hors ligne → en ligne permet une
nouvelle tentative après un échec réseau, un timeout ou une erreur serveur 5xx.
La première reconnexion est éligible immédiatement ; les nouvelles tentatives
liées à des reconnexions successives sont espacées d'au moins cinq secondes.
Le compteur est mis à jour avant la diffusion du signal de retour réseau.

**Fichiers :** nouveau `services/networkRecovery.ts`, modifications de
`services/nativeQueryListeners.ts`, `services/tokenRefresh.ts` et
`tests/sessionRenewal.test.js`.

**Conservé :** une seule requête de renouvellement en vol, isolation par version
de session, impossibilité de rétablir un compte déconnecté, refus d'utiliser un
access token expiré. Aucun contournement des refus d'authentification ou du statut
429 ; aucune nouvelle tentative automatique des écritures financières.

**Limite :** sans transition réseau confirmée, le délai ordinaire de 60 secondes
reste applicable. La reconnexion rend la tentative suivante éligible ; elle
n'ajoute pas de boucle permanente de renouvellement.

## R02 — Confirmation GPS malgré la correction de l'horloge

**Problème :** une date GPS future corrigée par le serveur produisait un écho
plus ancien que la date envoyée. Le client pouvait alors déclencher son repli
HTTP malgré l'enregistrement de la position.

**Appliqué côté serveur :** les deux handlers conducteur/passager retournent
un acquittement Socket.IO après leur traitement existant. Il contient le trajet,
la réservation pour le passager, la date originale, la date serveur et le statut
`accepted` ou `superseded`. Le service de réservation expose seulement une
information supplémentaire lorsque la position est déjà dépassée ; ses requêtes
et règles métier ne changent pas.

**Appliqué côté mobile :** l'acquittement positif associé à l'envoi peut confirmer
son traitement même si l'horloge a été corrigée. Les identifiants et la date
renvoyés sont vérifiés lorsqu'ils sont présents. Un acquittement incompatible
ne valide pas l'échantillon. Les écouteurs temporaires sont toujours libérés.

**Fichiers mobiles :** `services/trackingLocationDelivery.ts`,
`tests/trackingLocationDelivery.test.js`.
**Backend voisin :** `src/tracking/tracking.gateway.ts`,
`src/bookings/bookings.service.ts`, nouveau
`src/tracking/tracking-location-ack.spec.ts`.

**Conservé :** autorisations, validation des coordonnées, progression automatique
du trajet, diffusion aux clients existants, limitation des envois, repli HTTP
et délai de 2,5 secondes. L'ancien écho reste utilisable avec son contrôle de date
strict : un ancien instantané ne devient pas une confirmation valable.

**Livraison :** déployer le backend pour bénéficier de cette correction avec
une horloge décalée. Le client reste compatible avec une ancienne gateway, mais
celle-ci peut encore nécessiter le repli HTTP. Un serveur répondant après le délai
peut aussi déclencher ce repli ; sa latence réelle n'a pas été mesurée.

## R03 et R04 — Lectures d'affichage hors ligne et écrans masqués

**Problème :** arrêter uniquement le polling ne retirait pas les abonnements
susceptibles de relancer des lectures au retour de l'application. Certains
pollings d'affichage continuaient aussi lorsque le réseau était déclaré hors ligne.

**Appliqué :** nouveau `hooks/useDisplayReads.ts`, partagé par les chemins
d'affichage concernés. Les lectures ne sont abonnées que lorsque leur écran
est actif et le réseau déclaré disponible. La réinscription demande une lecture
fraîche, sans ajouter une deuxième lecture via les options globales de focus ou
de reconnexion. Les fonctions d'actualisation refusent un rappel tardif sur un
écran masqué, démonté, une autre ressource ou une autre version de session.
Les instantanés utilisés restent limités à la ressource et à la session courantes.

**Fichiers concernés :**

- Accueil : `hooks/home/useHomeTripFeed.ts`, `useHomeDriverActivity.ts`,
  `useHomePassengerActivity.ts`.
- Gestion d'un trajet : `hooks/manage-trip/useManageTripState.ts` et adaptation
  des types d'actualisation dans `useManageTripTracking.ts`.
- Détail d'une demande : `hooks/request-detail/useRequestDetailData.ts` et
  adaptation des types dans `useRequestDriverActions.ts`, `useRequestPassengerActions.ts`.
- Publication : `hooks/publish/usePublishVehicleState.ts` et adaptation du type
  d'actualisation du profil dans `usePublishSubmission.ts`.
- Écrans `app/my-requests.tsx`, `app/driver-earnings.tsx`, `app/invite.tsx`.

**Conservé :** données déjà disponibles lorsque le composant doit les afficher
hors connexion, logique métier des formulaires, GPS et suivi temps réel, reprise
des actions en attente, contrôle des retraits et rapprochement des paiements.
La politique ne sert pas à annuler une mutation déjà envoyée. Les abonnements
partagés requis par un autre consommateur actif restent possibles.

**Tests :** nouveaux `tests/displayReadRecovery.test.js` et
`tests/displayScreenReads.test.js` : désabonnement hors ligne/écran couvert,
réactivation, instantané isolé, protection des rappels tardifs et utilisation
réelle des hooks gestion de trajet, détail de demande et véhicule de publication.
Les fixtures des suites accueil, publication, réservation et revenus fournissent
désormais l'état réseau Redux attendu, sans suppression des assertions métier.

**Limites :** application aux chemins d'affichage audités, pas suppression de
toute activité réseau de l'application hors ligne. Une requête déjà partie peut
se terminer. Le rendu des différents états hors connexion reste à vérifier sur
appareil, notamment lors d'une première ouverture sans données en cache.

## R05 — Carnet d'adresses d'invitation paginé

**Problème :** tous les contacts et des images inutilisées étaient chargés avant
l'affichage, puis le carnet entier était filtré à chaque frappe.

**Ajouté :** `features/invite/contactPager.ts`, `hooks/invite/useInviteContacts.ts`
et `tests/inviteContacts.test.js`. `app/invite.tsx` affiche au plus 50 contacts
par page, avec navigation précédente/suivante, chargement localisé et réessai.
Le lien de parrainage reste accessible pendant la lecture des contacts.

**Amélioré :** recherche après 350 ms sans nouvelle frappe, lecture native
sérialisée, abandon logique des résultats devenus obsolètes et suspension sur
écran inactif. Les noms utilisent le filtre natif sur l'ensemble du carnet ; une
recherche numérique parcourt des pages natives bornées, y compris au-delà des
contacts déjà affichés. Les contacts sans téléphone sont ignorés. L'autorisation
est vérifiée à nouveau au retour sur l'écran, notamment après passage dans les
réglages.

**Supprimé :** demande d'images inutilisées, conservation du carnet complet dans
l'état React et filtrage intégral à chaque frappe. Les initiales remplacent la
branche d'image non alimentée. La liste virtualisée conserve des lots de rendu
limités et une seule page de résultats.

**Conservé :** permission système, partage du lien, invitation WhatsApp avec
repli SMS, recherche des contacts non encore affichés. Aucun transfert de carnet
vers un serveur ajouté ; le parcours QR de parrainage n'est pas modifié.

**Limites :** une recherche de numéro absent peut encore parcourir tout le carnet,
mais par pages natives, sans garder toutes les entrées en mémoire JavaScript.
Un appel natif commencé ne peut pas être annulé physiquement ; son résultat
obsolète est ignoré. Les coûts natifs et les carnets réels restent à mesurer.

## Vérifications et limites globales

- Suite mobile complète relancée après tous les ajouts : 1 362 tests JavaScript
  réussis, aucun échec (environ 119 secondes dans cet environnement).
- Backend ciblé : 82 tests réussis dans les suites service véhicules,
  acquittements GPS, gateway et service réservations. Ce n'est pas la suite
  complète du backend, ni un test de charge PostgreSQL.
- TypeScript mobile et backend validés ; backend avec `--incremental false`
  pour ne pas écrire de fichier de compilation dans `dist`.
- ESLint ciblé : aucune erreur ; 15 avertissements existants dans les imports
  et dépendances d'effets des hooks audités. Les nouveaux helpers et les sources
  plaque, contacts et invitation vérifiés séparément n'ont pas d'avertissement.
- Contrôle des frontières réseau réussi. Contrôle de taille : 1 006 sources,
  aucune au-dessus de 400 lignes. `git diff --check` réussi.

Les simulations testent les mécanismes et les régressions couvertes ; aucune
réduction chiffrée de batterie, chauffe, mémoire native, trafic en production ou
crashs n'est annoncée. À vérifier sur Android/iOS : mode avion puis retour réseau,
navigation aller-retour entre écrans, compte changé pendant une lecture,
horloge décalée conducteur/passager, permissions et gros carnet d'adresses.
Les validations embarquement/arrivée et les opérations de paiement doivent aussi
faire partie des essais de non-régression avant livraison.
