# Publication : places ajustables et contact dans Zwanga

Date : 2 octobre 2026. Périmètre : application mobile, publication de trajets,
contacts du détail, de la gestion et du suivi d’un trajet.

## Problèmes et comportement appliqué

Le compteur de publication imposait 2 ou 3 places aux motos et un minimum de
4 aux voitures. Les valeurs par défaut sont conservées, mais deviennent ajustables :

- Moto à deux roues : 2 par défaut, réglable de 1 à 2.
- Moto à trois roues : 3 par défaut, réglable de 1 à 3.
- Voiture : 4 par défaut, réglable à partir de 1, sans plafond métier supplémentaire.

Les boutons −/+ restent visibles, sont désactivés aux limites et utilisent des
mises à jour fonctionnelles pour les appuis rapprochés. Le choix est mémorisé
par type de véhicule pendant le brouillon, sans transférer la capacité d’une
voiture à une moto. « Publier un autre trajet » réinitialise ces choix. La valeur
affichée est celle transmise comme `totalSeats`, y compris en publication régulière.

Le modal de contact propose désormais **Message dans Zwanga**, indépendamment
de la disponibilité du téléphone. Il ouvre la conversation pour que l’utilisateur
rédige son message ; aucun texte n’est envoyé automatiquement. Pour une réservation,
le serveur retrouve/crée la conversation de cette réservation et vérifie ses
participants. Sans réservation, l’application réutilise une conversation connue
ou la recherche par pages avant d’en créer une si nécessaire.

Le détail du trajet réutilise le composant de contact commun. Son accès est renommé
« Contacter » et reste disponible sans téléphone. WhatsApp est conservé ; les
appels téléphoniques restent disponibles dans la gestion et la navigation où ils
existaient déjà. Le bouton Message direct du résumé n’est pas supprimé.

Le skill `frontend-skill` a guidé une hiérarchie sobre : compteur lisible, cibles
de 44 × 44, texte court, messagerie intégrée mise en avant et moyens externes
secondaires. Le compteur et le prix sont séparés pour éviter leur compression
sur petits écrans. Aucune animation décorative ou dépendance supplémentaire.

## Contrat serveur vérifié, sans modification du backend

Lecture des sources locales de `zwanga-backend` :

- `src/trips/dto/trip.dto.ts` : minimum de 1 place.
- `src/trips/trips.service.ts` et `src/vehicles/entities/vehicle.entity.ts` :
  maximum de 2/3 places selon la moto, contrôle des publications simples/régulières.
- `src/chat/chat.service.ts` : réutilisation du chat d’une réservation et contrôle
  du conducteur/passager autorisé, y compris une réservation en attente.

Les capacités et les autorisations serveur ne sont pas contournées. Aucun appel
à la production, aucune modification de données, de schéma ou de `.env`.

## Fichiers concernés

- Places : `features/publish/publishSeatPolicy.ts`, `PublishSeatSelector.tsx`,
  `PublishPricingStep.tsx`, `hooks/publish/usePublishFormState.ts`,
  `usePublishSuccessActions.ts`.
- Messagerie : `hooks/navigation/useTripContactMessaging.ts`,
  `features/navigation/NavigationContactModal.tsx`, `navigationContacts.ts`,
  `features/trip-detail/TripContactModal.tsx`, `TripSummary.tsx`,
  `TripDetailActionsFooter.tsx`, `app/trip/[id].tsx`.
- Utilitaire : `utils/directConversation.ts`, réexporté sans changement de
  comportement par `features/trip-detail/tripDetailModel.ts`. Cette extraction
  évite d’importer la carte et ses images pour retrouver une conversation.
- Tests : `tests/publishSeatSelection.test.js`, `tripContactMessaging.test.js`,
  `navigationAssistance.test.js`, `tripDetailCompact.test.js`.
- Aperçu : `scripts/preview-trip-publishing-contact.cjs` ; sorties générées
  dans `.expo/trip-publishing-contact-preview/`, ignorées par Git.

## Précautions et vérifications

Les requêtes de conversation ne partent qu’après un appui, jamais à l’ouverture
du modal. Verrou synchrone contre les doubles appuis, chargement visible, erreur
en français et réessai possible. Fermer, quitter l’écran, changer de compte,
retirer le contact ou invalider la session empêche une réponse tardive de naviguer.
Le modal utilise l’overlay existant, sans empiler une nouvelle fenêtre native
devant la carte. Une requête déjà envoyée peut finir côté serveur après fermeture ;
sa réponse ne déclenche alors aucune navigation.

Sont conservés : prix/gratuité, vérification d’identité, véhicules, trajets
réguliers, réservations en attente, appels/WhatsApp, SOS et double validation
de l’embarquement/dépose. Aucune nouvelle permission ni dépendance native.

Vérifications réalisées :

- **99 tests JavaScript réussis** : places/defaults/limites/changements de véhicule,
  payloads simples et réguliers, contacts, sessions, erreurs et réponses tardives ;
  régressions passagers, détails, formulaires, chat et actions de trajet.
- TypeScript `tsc --noEmit --incremental false` : réussi.
- ESLint ciblé sur les sources modifiées : réussi, sans avertissement.
- `check-source-size.cjs` : 994 sources, aucune au-dessus de 400 lignes.
- `check-network-boundaries.js` et `git diff --check` : réussis (avertissement
  CRLF/LF préexistant dans un fichier hors périmètre).
- Aperçu des vrais composants via React Native Web sur 320 et 360 px, contacts
  fictifs et navigation simulée. Capture inspectée ; aucun débordement horizontal
  dans les quatre cas, boutons −/+ mesurés à 44 × 44, action Message de 67 px
  de haut. Chrome utilise un profil temporaire isolé, sans compte utilisateur.

Les API, la navigation et les modules natifs sont simulés dans les tests. Ce ne
sont pas des essais sur appareils ni un test de bout en bout avec le backend.
Restent à vérifier sur Android/iOS : publication réelle de 1 place puis retour
au formulaire, ouverture/envoi/réception du chat avec les deux participants,
retour au suivi de trajet, réseau lent/hors ligne, WhatsApp/appels et grandes
polices. Aucun constat de disparition de crashs ou de chauffe n’est formulé.

Commande de régression :

```text
node --test --test-concurrency=2 tests/publishSeatSelection.test.js tests/passengerSeats.test.js tests/tripContactMessaging.test.js tests/navigationAssistance.test.js tests/pendingBookingContact.test.js tests/tripDetailCompact.test.js tests/tripDetailPerformance.test.js tests/driverProfilePhoto.test.js tests/rideRecoveryUI.test.js tests/formSafeArea.test.js tests/chatLifecycle.test.js
```
