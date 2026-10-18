# Contact du passager avant acceptation — 8 octobre 2026

## Problème et solution appliquée

Le bouton de discussion ouvrait directement une conversation interne. Il ouvre
désormais le modal partagé de contact, avec **Appeler**, **WhatsApp** et
**Message dans Zwanga**, dans le détail d'une demande et la proposition de
proximité. Rien n'est lancé tant qu'un moyen de contact n'a pas été choisi.

Le serveur masquait auparavant tout numéro avant acceptation. Après accord
explicite de l'utilisateur sur cette divulgation, un endpoint dédié est ajouté :
`GET /trip-requests/:id/passenger-contact`. Le serveur vérifie à chaque ouverture
le compte conducteur actif, sa dernière identité approuvée et son véhicule actif
via les règles d'éligibilité existantes. Il refuse sa propre demande, une demande
annulée, expirée ou déjà attribuée. Pour une demande immédiate, seul le conducteur
de la proposition encore en attente et non expirée peut lire le contact.

Réponse minimale : identifiant de demande, identifiant/nom/numéro du passager,
heure serveur et échéance. JWT, rôle, UUID valide, limite de 10 lectures/minute et
`Cache-Control: private, no-store`. Les listes, aperçus et notifications ne
contiennent aucun nouveau numéro. L'accès est limité au clic, pas au chargement
de l'écran. Aucun repli vers une recherche de profil public en cas de refus.

## Fichiers concernés

- Mobile : `features/request-detail/RequestPassengerContact.tsx`,
  `hooks/request-detail/useRequestPassengerContact.ts` (remplace le hook
  `useRequestPassengerMessaging.ts`), `features/request-detail/requestContactPolicy.ts`,
  `features/navigation/navigationContacts.ts`, `store/api/tripRequestApi.ts`,
  `store/api/trip-request/contracts.ts`, `tests/requestPassengerContact.test.js`
  (remplace `requestPassengerMessaging.test.js`) et `package.json`.
- Modal réutilisé sans changer ses actions existantes :
  `features/navigation/NavigationContactModal.tsx` et son hook de messagerie.
- Backend voisin `../zwanga-backend` :
  `src/trip-requests/trip-requests.controller.ts`, `trip-requests.service.ts`,
  `dispatch/dispatch.service.ts`, `trip-request-contact.spec.ts` et
  `trip-requests.controller.spec.ts` dans le même dossier.

## Performance et précautions contre les régressions

- Une lecture de contact à la demande, sans poll ni préchargement de conversations.
  Le résultat RTK est réinitialisé après lecture ; le contact demeure uniquement
  dans l'état éphémère du modal, pas dans le cache des listes ni sur disque.
- Lectures par identifiant et sélection de colonnes ; vérification de proposition
  bornée à une ligne, avec paramètres liés. Le guide Postgres a orienté la requête
  vers les index existants (clé primaire et proposition en attente par demande),
  sans ajouter de migration. Aucun gain de latence n'a été mesuré en base réelle.
- Chargement visible et protection contre doubles clics. Les réponses tardives
  sont ignorées après fermeture, perte de connexion, changement de compte, sortie
  d'écran ou mise en arrière-plan. Retour depuis téléphone/WhatsApp : rouvrir le
  contact relance les contrôles serveur.
- Fermeture à l'échéance serveur, ou à celle plus courte de la proposition.
  Le délai relatif serveur évite de dépendre d'une horloge de téléphone décalée ;
  la latence réseau est déduite de manière conservatrice. Aucun délai prolongé.
- Réutilisation du modal `inApp` et de son infrastructure de superposition,
  sans ajouter de contrôleur modal natif iOS. La messagerie ne se résout qu'au
  clic sur son bouton. Appeler/WhatsApp sont désactivés si le numéro est absent.
- Prix, acceptation/refus, création du trajet, notifications et échéances restent
  inchangés. Discuter du prix ne modifie pas le tarif enregistré. Les contacts
  des réservations et trajets déjà acceptés conservent leur fonctionnement.
- La disponibilité est contrôlée à l'ouverture ; un numéro déjà communiqué ne
  peut pas être effacé du téléphone du destinataire. Aucune garantie de révocation
  rétroactive d'un numéro ni de synchronisation instantanée de toutes les vues.

## Vérifications réalisées

- Mobile : `node --test tests/requestPassengerContact.test.js tests/tripContactMessaging.test.js tests/pendingBookingContact.test.js tests/routeLocationDetails.test.js`
  — **63 tests réussis**. Canaux de contact simulés, pas d'appel réel.
- `npm run test:audit-ux` — **85 tests réussis**.
- Suite mobile complète : `node --test --test-concurrency=4 tests/*.test.js`
  — **1 657 tests, 1 654 réussis**, les trois écarts de références préexistants
  de `sourceExtractions.test.js` persistent (styles auth, `updateBookingStatus`,
  `acceptTripRequest`). Aucun autre échec et aucune référence régénérée.
- `npx tsc --noEmit`, ESLint sur les fichiers TypeScript du changement et
  `npm run check:source-size` réussis : 1 056 sources, aucune au-dessus de 400 lignes.
- Backend : `npm test -- --runInBand --no-cache --runTestsByPath src/trip-requests/trip-request-contact.spec.ts src/trip-requests/trip-requests.controller.spec.ts src/trip-requests/trip-request-privacy.spec.ts`
  — **42 tests réussis**. Contrôles HTTP JWT/rôles/UUID/cache et logique de service ;
  repositories PostgreSQL simulés. Pas de migration ou de requête sur données réelles.
- Backend : `npx tsc -p tsconfig.build.json --noEmit --incremental false` réussi.
  Le contrôle `npx tsc --noEmit --incremental false` incluant tous les tests reste
  en échec sur des fichiers de test non modifiés (activité, ancienne migration,
  finances, OTP, paiement, confidentialité, utilisateurs et fidélité). Aucun
  diagnostic ne vise les nouveaux tests ou le code ajouté.
- `git diff --check` réussi dans les deux dépôts (avertissements de fins de ligne
  seulement). Ces contrôles sont JavaScript/TypeScript, pas des essais natifs.

## Mise en service et limites restantes

1. Déployer le backend corrigé **avant** le client. En développement : lancer
   `npm run start:dev` dans `zwanga-backend` ; un processus watch existant peut
   déjà reprendre les modifications. Aucun redémarrage ou déploiement effectué ici.
2. Mobile : `npx expo start --dev-client` avec un binaire de développement
   compatible. Ce correctif n'ajoute ni dépendance, ni permission, ni code natif ;
   il n'exige pas à lui seul un nouveau build natif. Distribuer le JS mis à jour
   par le mécanisme habituel pour les utilisateurs des stores.
3. Sur iPhone et Android réels, avec comptes de test : ouvrir chaque type de
   demande, choisir Appeler, WhatsApp puis Message, revenir dans Zwanga et vérifier
   que rien n'a été accepté et que le prix n'a pas changé. Tester numéro absent,
   WhatsApp absent, double clic, hors ligne, fermeture et proposition expirée.
4. Vérifier qu'un autre conducteur ne peut pas ouvrir le contact d'une proposition
   attribuée, ni d'une demande déjà acceptée ; les listes ne doivent jamais montrer
   le numéro. Tester la fermeture sans blocage tactile sur iOS.

Aucun essai sur appareil physique, mesure batterie, test de charge ou EXPLAIN
PostgreSQL n'a été réalisé. Aucune disparition de freeze/crash n'est annoncée.
Aucune modification de production ou de variable d'environnement effectuée.
