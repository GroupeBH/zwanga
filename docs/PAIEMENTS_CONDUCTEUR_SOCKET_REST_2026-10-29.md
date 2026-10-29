# Paiements conducteur : notification, socket et secours REST

## Périmètre et constat — 29 octobre 2026

Le modal conducteur existait, mais lisait les paiements de seulement quatre trajets récents. Le socket ne signalait pas un changement de paiement seul, sans changement de statut de réservation. Un conducteur pouvait donc ne pas voir rapidement le paiement. Une erreur de stockage local pouvait aussi produire une promesse rejetée sans traitement.

Correctifs préparés dans le mobile et `zwanga-backend`, avec accord de l'utilisateur. Aucun déploiement, aucun accès à une base métier existante, aucun paiement ou push réel. Les modifications antérieures du workspace sont conservées.

## Comportement appliqué

1. Une transition serveur vers un paiement électronique/jetons réussi enregistre une notification pour le conducteur réel du trajet, dans la **même transaction** que la réservation. Un rollback annule les deux. La clé d'événement unique évite une seconde notification sur replay.
2. La notification persistée emprunte le dispatcher push existant (notification ordinaire, pas la sonnerie d'une nouvelle demande). Elle reste consultable même si l'envoi push échoue.
3. Le dispatcher socket existant publie un signal `ride_alert`, `kind: payment`, dans la chambre authentifiée du conducteur. Ce signal contient des identifiants, **pas un montant faisant autorité**. Les travailleurs socket et push sont indépendants.
4. Le mobile invalide le cache des reçus et relit `GET /notifications/driver-payments`. Cette route authentifiée renvoie les vingt reçus non lus les plus anciens du compte connecté. L'identité vient du JWT, jamais d'un identifiant choisi dans l'URL.
5. Dans l'application au premier plan, le modal affiche « Paiement reçu », le montant confirmé et le moyen de paiement, avec « Compris » et « Voir le trajet ». L'annonce vocale existante est conservée. Les reçus sont présentés successivement.
6. Sans socket, le contrôle REST est programmé toutes les **15 secondes** ; socket connecté, toutes les **60 secondes** pour récupérer un événement éventuellement perdu. Lecture aussi à la reprise et après reconnexion. Ces cadences ne garantissent pas un délai maximal : latence, erreurs réseau et disponibilité serveur s'ajoutent. Pas de polling en arrière-plan ou hors ligne.
7. Seule la fermeture volontaire du modal ou l'ouverture du trajet marque le reçu localement puis côté serveur. L'arrivée du push/socket n'est pas un accusé de lecture. Une lecture non enregistrée côté serveur est réessayée lors d'un prochain instantané REST. Le stockage local est borné à 500 clés, isolé par compte ; ses erreurs sont interceptées.

### Montants et paiements mixtes

- La notification utilise `paymentAmount` confirmé, jamais le prix initial brut. Cela conserve les montants réduits après interruption ou subvention.
- Pour jetons + cash : première notification « Paiement partiel reçu », montant jetons réellement réglé et espèces restant à recevoir. Le choix du cash ne signifie jamais « cash encaissé ».
- Une seconde notification cash est produite uniquement après la confirmation explicite d'encaissement existante par le conducteur. Elle conserve son identité distincte de la part jetons.
- Les remboursements, commissions, subventions, récompenses/parrainages et calculs de gains ne sont pas modifiés. Un reçu de paiement n'est pas une promesse de fonds immédiatement retirables ; les notifications existantes de gains disponibles restent distinctes.
- L'embarquement automatique d'une réservation prépayée ne réécrit plus son statut de paiement déjà réussi. Cela préserve ce parcours avec l'exigence d'une écriture transactionnelle pour les nouveaux reçus.

## Fichiers concernés

Mobile :

- `features/driver-payments/paymentInbox.ts`, `paymentNoticeModel.ts` : validation des reçus, séparation des parts cash/jetons, déduplication bornée.
- `store/api/driverPaymentApi.ts`, `hooks/notifications/useDriverPaymentInbox.ts` : cache par compte, REST, polling et accusés de lecture différés.
- `components/DriverPaymentNoticeCoordinator.tsx` : file des modals, isolation entre comptes, stockage sécurisé contre les rejets non traités.
- `features/notifications/rideRealtime.ts`, `rideRealtimeRefresh.ts`, `notificationEffects.ts`, `NotificationListItem.tsx` : interprétation du signal, invalidations, destination et icône du reçu.
- `features/arrival-payment/paymentAnnouncement.ts` : annonce spécifique d'un paiement partiel, sans annoncer les espèces comme reçues.
- `tests/driverPaymentInbox.test.js`, `tests/paymentAnnouncement.test.js`, `scripts/audits/test-driver-payment-paths.cjs` : nouveaux contrôles et adaptation du test du modal historique.

Backend :

- `src/notifications/driver-payment-notification.ts`, `transactional-notifications.subscriber.ts` : outbox transactionnelle et déduplication métier.
- `src/notifications/notifications.controller.ts`, `notifications.service.ts`, `ride-realtime-delivery.ts` : REST, signal socket et distribution indépendante du push.
- `src/bookings/cash-receipts.service.ts` : métadonnées du reçu cash pour la navigation et le rattrapage REST.
- `src/bookings/bookings.service.ts` : préservation du statut déjà payé lors de l'embarquement automatique.
- `src/database/migrations/1780000100000-IndexRealtimePaymentReceipts.ts`, `migrations/index.ts`, `src/notifications/entities/notification.entity.ts` : index partiel additif du dispatcher élargi.
- Tests `driver-payment-notification.spec.ts`, `driver-payment-postgres.spec.ts`, `ride-realtime-delivery.spec.ts`, `bookings.service.spec.ts`.

## Migration et compatibilité

La migration `IndexRealtimePaymentReceipts1780000100000` ajoute un index sur les notifications récentes éligibles au socket. L'ancien index réservé aux demandes reste intact. Aucun montant ni reçu existant n'est réécrit. Budgets de verrouillage 3 secondes et d'exécution 30 secondes, compatibles avec le runner transactionnel existant ; sur une grosse table, prévoir une fenêtre adaptée et mesurer la migration en préproduction. Aucun gain chiffré de performance en production n'est revendiqué.

Prévoir **migration puis backend puis mise à jour mobile**. La nouvelle route est additive ; les anciennes versions mobiles conservent leur fonctionnement. Si un ancien serveur répond 404/405, le nouveau mobile conserve le modal basé sur l'activité existante, sans l'ancienne limite de quatre trajets. Les erreurs 500 ou réseau ne sont pas interprétées comme une absence définitive de fonctionnalité.

Les paiements antérieurs au déploiement ne sont pas rétroactivement transformés en nouvelles notifications. Les anciens reçus cash sans métadonnées nécessaires sont exclus de cette nouvelle file, mais restent dans l'historique existant. Pas de modification native ni de dépendance ajoutée.

## Vérifications réalisées

- **151 tests backend ciblés réussis**, dont cinq tests sur PostgreSQL 18/PostGIS jetable : commit/rollback, unicité après replay, réel socket Socket.IO, lecture HTTP du contrôleur et parsing mobile, accusé de lecture limité au bon compte, cash effectivement reçu, paiement partiel, migration up/down/up et véritable commande mixte avec débit de jetons fictifs et tentatives concurrentes.
- **74 tests financiers existants réussis** : paiements mixtes, passage au cash, portefeuille et retraits. Fournisseurs externes simulés.
- **33 tests mobile ciblés réussis** : validation des montants/destinataires, invalidation du vrai cache RTK Query, polling foreground/offline, accusé différé après échec réseau, queue de modals, stockage défaillant, changement de compte, voix et non-régression socket/push. Ce total recouvre une partie du contrôle global, il ne s'y additionne pas.
- TypeScript mobile et **configuration de production backend** validés. Le contrôle général backend incluant tous les fichiers de tests remonte encore des erreurs de typage préexistantes dans des suites non modifiées ; ce n'est pas une validation de l'ensemble des types de tests backend.
- Contrôle global mobile `scripts/check-release.cjs` : code 0, **2 904 tests réussis, 0 échec, 1 ignoré faute de Ruby**, TypeScript, lint global, frontières réseau, limite de taille, compatibilités et parité native validés. La parité ne compile pas de binaire. Le test du cache RTK ajouté après le lancement de ce gate est inclus dans les 33 tests ciblés relancés ; lint des derniers ajouts également réussi.

Les premiers essais PostgreSQL ont identifié une comparaison UUID/texte incorrecte dans la nouvelle requête : cast explicite appliqué et parcours réel relancé avec succès. Les erreurs initiales du nouveau banc (champ obligatoire manquant dans les fixtures, PostgreSQL bloqué par le bac à sable Windows) ont été corrigées/contournées pour les tests locaux ; elles ne sont pas présentées comme des anomalies de production.

Traces locales : `.expo/driver-payments-backend-tests-20261029.log`, `.expo/driver-payments-financial-regression-20261029.log`, `.expo/driver-payments-mobile-targeted-20261029.log`, `.expo/driver-payments-backend-build-types-20261029.log`, `.expo/driver-payments-release-check-20261029.log`.

## Limites et recette restante

Le parcours d'intégration utilise de vrais sockets, HTTP et PostgreSQL, mais une identité de test injectée devant le contrôleur, pas un login JWT réel. Le rendu du modal, AppState, le stockage et la voix sont simulés dans les tests JavaScript. Ce n'est pas une recette tactile complète de l'application sur téléphone. Les accès réseau non locaux sont bloqués dans les tests backend.

À vérifier sur builds Android/iPhone : modal et annonce lors d'un paiement, retour au premier plan après paiement, mode avion/reconnexion, socket indisponible, réception de plusieurs paiements, « Compris » et « Voir le trajet ». La livraison des push dépend toujours des permissions, tokens et fournisseurs ; aucune garantie d'absence de crash ou de livraison universelle n'est annoncée. La migration n'a été exécutée que sur la base temporaire de test ; aucun déploiement effectué.
