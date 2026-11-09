# Paiement cash : déclaration du passager et confirmation globale du conducteur

## Périmètre et problème constaté — 2026-11-09

Le bouton cash côté passager fermait localement le paiement sans enregistrer de déclaration destinée au conducteur. Celui-ci devait ouvrir les paiements du trajet et effectuer deux appuis pour confirmer la réception. L'utilisateur a autorisé les changements mobile et backend, sans déploiement.

## Solution appliquée

- **Passager :** après l'arrivée, « J’ai payé en cash » transmet explicitement la réservation, le montant affiché et la devise au serveur. Sélectionner le mode cash, fermer le panneau ou appuyer sur Retour ne déclare pas un paiement. Une erreur réseau laisse une possibilité de réessayer, sans annoncer de succès. Un montant ou une devise modifiés par le serveur sont présentés avant un nouvel accord. Pour jetons + cash, la déclaration porte uniquement sur le complément cash, pas sur le total du trajet.
- **Serveur :** nouvelle route authentifiée `PUT /bookings/:id/cash-declaration`, UUID/DTO validés et limitation de fréquence. Le propriétaire passager, l'arrivée, le mode cash, le statut et le montant/devise actuels sont revérifiés sous verrou de réservation. Une notification `cash_payment_declared` est enregistrée dans la même transaction courte ; la clé d'événement déduplique les reprises concurrentes. La déclaration n'écrit aucun reçu, solde, gain, crédit de portefeuille ou statut de paiement électronique.
- **Transmission :** réutilisation de la file transactionnelle et du dispatcher socket existants, puis lecture authentifiée de `/notifications/driver-payments`. Le socket transmet un signal de rafraîchissement, pas un montant à croire directement. La reprise REST existante fonctionne au premier plan, toutes les 60 secondes avec socket connecté ou 15 secondes sans socket ; aucun nouveau timer ni service natif. Le dispatcher temps réel existant s'exécute toutes les deux secondes. Ces intervalles ne constituent pas une garantie de latence réseau.
- **Conducteur :** le coordinateur de paiement déjà monté à la racine de l'application affiche la déclaration, y compris depuis la navigation ou l'accueil. Le modal présente le montant, le passager, « J’ai reçu le cash » et « Pas encore ». Un appui suffit pour confirmer via la route de reçu existante, uniquement après remise physique de l'argent. La confirmation inline utilise le même hook sans second panneau. Le modal n'est pas fermé par Retour pendant la confirmation ; les erreurs restent visibles. Les paiements suivants restent dans la file, sans répétition immédiate du reçu déjà confirmé depuis ce modal.
- **Notifications périmées :** les déclarations dont le cash est déjà reçu, dont le montant/mode a changé ou dont les participants ne correspondent plus sont exclues de la boîte REST et de l'émission différée. Les conversions UUID/texte et les données JSON malformées sont couvertes par PostgreSQL réel.
- **Texte et présentation :** « cash » remplace « espèces » dans les interfaces de paiement, revenus, publication et aide concernées, ainsi que dans les messages backend touchés. Le guide frontend a orienté un modal compact centré, avec un montant lisible et deux actions simples ; pas de nouvelle interface imbriquée. Le guide PostgreSQL a orienté la transaction courte sans appel externe et l'index partiel additif.

## Fichiers principaux

Mobile :

- `store/api/booking/cashReceipt.endpoints.ts`, `store/api/bookingApi.ts` ; nouveau `hooks/arrival-payment/usePassengerCashDeclaration.ts`.
- `components/PassengerArrivalPaymentCoordinator.tsx`, `hooks/arrival-payment/useArrivalPaymentSubmission.ts`, `useArrivalPaymentNavigation.ts`, `features/arrival-payment/ArrivalPaymentActions.tsx` et libellés du même module.
- `components/DriverPaymentNoticeCoordinator.tsx`, nouveaux `features/driver-payments/CashPaymentRequestNotice.tsx` et `useCashReceiptConfirmation.ts`, `ConfirmCashReceipt.tsx`, `paymentInbox.ts`, `paymentNoticeModel.ts`.
- `features/notifications/notificationEffects.ts`, `NotificationListItem.tsx`, annonces vocales de paiement et libellés de revenus, publication, commande et aide.
- Tests cash/paiement et `scripts/audits/test-driver-payment-paths.cjs`.

Backend :

- `src/bookings/cash-receipts.controller.ts`, `cash-receipts.service.ts` et nouveau `cash-declaration-postgres.spec.ts`.
- `src/notifications/cash-declaration-policy.ts`, `notifications.service.ts`, `ride-realtime-delivery.ts` et son test, `driver-payment-notification.ts`.
- Migration `1780000116000-CashDeclarationRealtimeIndex.ts`, enregistrement dans `src/database/migrations/index.ts` et index non synchronisé dans `Notification`.

## Comportements conservés et protections

- Le passager déclare une remise ; **seul le conducteur du trajet confirme la réception**. Ni le choix cash, ni la dépose, ni la fermeture du panneau ne valent reçu.
- Règles financières jetons/Mobile Money, référence de paiement, gain conducteur et parrainage inchangées. La part cash n'est pas créditée comme un versement électronique.
- Contrôles de session, compte, activité de l'application, doubles appuis et réponse tardive conservés/renforcés. Pas de notification d'un paiement appartenant à un autre compte.
- Les alertes de nouvelles commandes/réservations, leur sonnerie, transport natif, plein écran, canaux, délais et ciblage ne sont pas modifiés. Le nouvel événement utilise la catégorie logique `payment`, jamais une invitation sonore de trajet.
- Aucun fichier natif, permission, dépendance, configuration privée ou secret modifié. Changements préexistants du module partenaires backend laissés intacts.

## Vérifications réalisées

- **Mobile :** campagne finale de **186 tests JavaScript ciblés paiement/cash/reçus/notation réussie** ; campagne complémentaire de **140 tests réussie** incluant le nouveau contrôle de changement de devise, les notifications de conducteur, la navigation vers les notifications, les panneaux et formulaires. Le retour au cash après un paiement électronique échoué présente d'abord les instructions ; il ne déclare aucune remise avant « J’ai payé en cash ». Ces campagnes se recouvrent : leurs nombres ne doivent pas être additionnés comme des tests distincts.
- **Backend :** huit suites, **167 tests réussis**, dont deux suites avec PostgreSQL/PostGIS temporaire réel. Cas couverts : déclaration absente à la simple sélection, cinq déclarations concurrentes donnant un seul événement, reprise après reçu, mauvais participant, état/montant/devise invalides, notification périmée, JSON invalide, complément mixte et rollback de transaction. Migration vérifiée par `up`, répétition de `up`, `down`, puis `up` sans suppression des notifications.
- **Intégration croisée :** mutation mobile réelle chargée dans le banc JavaScript → HTTP local → contrôleur/service et PostgreSQL réels → socket réel → coupure du socket et récupération REST → parseur/modal/hook mobiles → confirmation HTTP du conducteur. Identités synthétiques injectées dans le serveur de test : ce test n'exerce pas la chaîne JWT/Nest complète. Les primitives de rendu React Native sont simulées ; ce n'est pas un parcours tactile dans l'application installée.
- **Incident détecté par les essais :** la première passe PostgreSQL a rejeté une comparaison texte/UUID dans le nouveau filtre. Conversion explicite corrigée, puis les huit suites passent. Un délai borné a été ajouté à l'attente du socket du nouveau test pour nettoyer le serveur HTTP en cas d'échec. Une première tentative de lancement PostgreSQL dans le bac à sable était interdite ; la passe validée utilise un processus local autorisé, toujours isolé.
- **Isolation :** base temporaire créée pour les tests puis supprimée par le banc, environnement sans identifiants applicatifs, connexions externes bloquées. Aucune base existante, fournisseur de paiement, SMS ou push réel utilisé.
- **Contrôles statiques :** TypeScript sans émission réussi dans les deux dépôts ; ESLint mobile global puis ciblé réussi. ESLint backend réussi sur le contrôleur/service cash, le filtre des déclarations et la migration ; pas de passe ESLint globale backend revendiquée. Contrôles mobile des frontières réseau, de taille (1 305 sources, aucune au-dessus de 400 lignes), de parité des sources natives et `git diff --check` réussis. La parité native ne compile ni ne lance l'application.

## Livraison et limites

1. Déployer séparément le backend avec la migration additive de l'index, puis la version mobile. **Aucun déploiement ni migration sur une base existante effectué ici.** La migration borne l'attente d'un verrou à trois secondes et son exécution à trente secondes : une base chargée peut nécessiter une nouvelle tentative planifiée.
2. Le nouveau mobile nécessite la nouvelle route pour transmettre une déclaration cash. Un ancien mobile conserve son comportement historique sans déclaration ; l'ancien reçu conducteur reste compatible. Les anciennes déclarations purement locales ne sont pas reconstituées artificiellement.
3. Une connexion serveur est nécessaire pour prévenir l'autre participant. Hors application, l'affichage relève du push et des réglages du système ; le modal est prévu dans l'application active. Pas de garantie de livraison instantanée hors réseau.
4. Aucun test de rendu sur iPhone/Android physique ni nouvelle compilation native dans ce lot. Le parcours natif réel, la taille des polices et la cohabitation avec les panneaux de navigation restent à vérifier sur appareils. Aucun engagement d'absence de crash, d'ANR ou de chauffe sur la base des seuls tests JavaScript.
