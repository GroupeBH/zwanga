# Demandes directes et contre-propositions de prix

Date : 5 novembre 2026. Périmètre : mobile `zwanga` et backend `zwanga-backend`.

## Demande et comportement livré

Le passager devait pouvoir consulter un conducteur depuis la carte et lui adresser une demande. Le conducteur devait aussi pouvoir proposer un autre prix, avec **une alerte sonore dans Zwanga**, et non un appel téléphonique classique.

- Carte d'attente d'une demande : toucher un véhicule ouvre le profil du conducteur. L'action du profil cible **la demande existante**, sans créer un doublon. La priorité temporaire de trois minutes et les contrôles de révision déjà présents restent appliqués.
- Accueil passager : toucher un marqueur de trajet ouvre le profil de son conducteur ; le bouton de demande directe préremplit le conducteur dans le formulaire existant. Le profil accessible depuis un trajet publié propose cette même action, tout en conservant un lien vers le trajet publié et sa réservation.
- Important : les marqueurs de l'accueil proviennent des **départs des trajets publiés**, pas de la position GPS actuelle de leur conducteur. Seule la carte d'attente utilise les dernières positions connues. Aucun véhicule fictif ni fausse position temps réel n'a été ajouté.
- Conducteur : après sélection du véhicule, « Proposer un autre prix » ouvre une saisie du prix **par place**, avec le total pour le nombre de places demandé. Un lien compact est ajouté aux contrôles existants, sans nouveau parcours ni liste de choix encombrante.
- Passager : reçoit une alerte de contre-proposition, ouvre le détail puis choisit « Accepter ce prix » ou « Refuser ce prix ». Le prix peut dépasser le budget initial, mais n'est appliqué qu'après cette acceptation explicite. La sélection du conducteur ne débite pas le passager.
- Conducteur : voit le prix envoyé et « Retirer ma proposition » tant que la réponse est en attente. Refus ou retrait libèrent la recherche pour d'autres conducteurs ; le conducteur écarté ne reçoit pas à nouveau **cette demande**, sans suspension globale de son compte.

## Contrats et fichiers backend

Toutes les routes sont sous `/api/v1/trip-requests`, avec authentification existante et validation des identifiants.

| Route | Usage et garde principale |
| --- | --- |
| `GET /:id/map-driver?markerId=…` | Résolution du marqueur opaque, uniquement par le propriétaire de la demande et parmi les véhicules actuellement admissibles |
| `POST /:id/counter-offer` | Conducteur authentifié ; `vehicleId` UUID lui appartenant et prix entier de 1 à 1 000 000 FC |
| `POST /:id/offers/:offerId/reject` | Propriétaire de la demande uniquement ; rejet de sa proposition non partagée et encore ouverte |

Fichiers concernés : `src/trip-requests/trip-requests.controller.ts`, `trip-requests.service.ts`, `request-search-map.ts`, `request-refusal.ts`, `reject-driver-offer.ts`, `dto/counter-offer.dto.ts`, `dto/target-map-driver.dto.ts`, `dispatch/request-acceptance.ts` ; `src/notifications/notifications.service.ts`, `ride-response-delivery.ts`, `ride-realtime-delivery.ts`.

La création de l'offre, sa phase de réponse et la notification durable sont validées dans **une transaction PostgreSQL**. Verrou de la demande et contrôles existants conservés : auteur, conducteur ciblé, proximité, horaires compatibles, identité, véhicule actif/type/capacité, refus antérieur, demande non attribuée et non expirée. Deux conducteurs concurrents ne peuvent pas réserver la même phase de réponse séquentielle.

Le flux séquentiel réutilise la fenêtre existante de **120 secondes pour la décision du passager**, plafonnée par l'expiration de la demande. La priorité de trois minutes d'un ciblage sur la carte est une phase distincte. Les anciennes demandes non séquentielles conservent leurs règles de disponibilité ; la fenêtre de 120 secondes n'est pas présentée comme universelle.

Acceptation, rejet, retrait et expiration rendent les notifications devenues obsolètes non livrables. L'acceptation stocke `selectedPricePerSeat`, déjà utilisé à la création du trajet. Aucun nouveau calcul de paiement, commission, bonus ou parrainage n'a été introduit. Les offres de trajet partagé conservent leur parcours séparé. L'ancienne route de création d'offre conserve son plafond de budget.

Les tables, index et primitives de notification existants sont réutilisés : **aucune nouvelle migration pour ce lot**. Le guide PostgreSQL a orienté les transactions courtes, requêtes paramétrées et la résolution bornée des marqueurs (au plus 500 candidats, mêmes critères que la carte).

## Intégration mobile et sonnerie

Profils/demandes : `app/driver/[id].tsx`, `app/request/index.tsx`, `components/trip-request/{DriverProfileRequestAction,DirectDriverNotice}.tsx`, `hooks/trip-request/{useDirectDriverPrefill,useRequestTripController}.ts`, `features/trip-request/directDriverRequest.ts`, `store/api/requestDriverApi.ts`.

Cartes : `components/home/HomeMap.tsx`, `features/home/homeMapMarkers.ts`, `hooks/home/{useHomeMapMarkers,useHomeMapNavigation}.ts`, `features/trip-detail/TripSummary.tsx`, `features/request-detail/{RequestSearchScreen,MapDriverSelection}.tsx`.

Négociation : `features/request-detail/{RequestCounterOffer,PassengerPriceOffers,RequestDriverDecision,RequestPassengerTicket}.tsx`, `counterOfferPolicy.ts`, `requestPresentation.ts`, `hooks/request-detail/useRequestAvailability.ts`, `store/api/counterOfferApi.ts`, mapper/types des demandes et offres.

Alertes : `features/notifications/{rideSound,rideAlert,rideRealtime,passengerResponseNotice}.ts`, `hooks/notifications/{useRideRealtime,useRideRinging}.ts`, `components/PassengerRideResponseCoordinator.tsx`.

- Le protocole `counter-offer-v1` distingue une proposition de prix d'une simple confirmation de conducteur. La déduplication inclut l'identifiant de l'offre.
- Socket et notification durable transmettent la même contre-proposition ; RTK Query recharge l'état serveur. Le modal actif recontrôle la demande toutes les 15 secondes et se ferme si la proposition n'est plus en attente. Les lectures ne tournent pas lorsque l'application est inactive.
- La durée de son demandée est plafonnée à **60 secondes restantes**, sans dépasser l'expiration. Une proposition ne sonne pas indéfiniment. Le comportement audible réel reste soumis aux permissions, au mode silencieux et au système Android/iOS.
- Contrairement à une réponse ordinaire, la simple présence sur le détail ne considère pas automatiquement le nouveau prix comme traité. Une interaction explicite ferme l'alerte. « Pas maintenant » la rend silencieuse mais ne refuse pas l'offre.
- Les confirmations ordinaires de conducteur restent silencieuses au premier plan ; leur modal et leur assistance vocale sont conservés.
- Boutons protégés contre les doubles appuis ; une réponse réseau tardive ne modifie pas l'interface d'un autre compte ou d'un composant démonté. Une erreur ne simule jamais un accord : message visible et relecture serveur.
- Préremplissage du conducteur bloquant uniquement pendant sa vérification ; retrait volontaire possible pour revenir à une recherche normale. Un contexte de marqueur invalide n'ouvre pas silencieusement une nouvelle demande.

## Vérifications effectuées

Les suites suivantes utilisent exclusivement des données fictives.

- **Mobile : 369 tests JavaScript ciblés réussis** après mise à jour des fixtures impactées : demandes, profils directs, cartes d'accueil, contre-propositions, alertes/restauration/déduplication et navigation de notification. Une première passe avait des échecs de mocks/imports et d'attentes UI anciennes ; les suites concernées ont ensuite passé séparément (65 tests), puis la sélection entière a été rejouée avec succès.
- Nouveaux tests : `tests/directDriverProfile.test.js`, `counterOfferFlow.test.js`, `counterOfferActions.test.js` ; extensions des tests de réponse passager, cartes, formulaires et actions de demande. Les tests de sonnerie Android/iOS simulent les API natives ; ils ne prouvent pas une émission sonore physique.
- **Backend : 54 tests ciblés de contrôleur/service et 44 tests de transport de notifications réussis.** Ils couvrent notamment JWT/rôle, DTO, identifiants forgés, payload Firebase/Expo, canal/son et durée de vie de la contre-proposition. Firebase/Expo sont simulés ; aucun push réel envoyé.
- **Huit scénarios sur PostgreSQL 18/PostGIS temporaire isolé réussis** : résolution propriétaire du marqueur, création et publication socket durable, rollback si écriture de notification impossible, concurrence, acceptation/propriété/prix, rejet, retrait et expiration. Les 132 scénarios hors filtre n'ont pas été exécutés dans cette passe. Le premier lancement restreint n'avait pas pu démarrer PostgreSQL ; la relance autorisée utilise uniquement un cluster temporaire sur loopback, sans `.env` ni base applicative.
- Le scénario d'acceptation a également été rejoué seul après ajout de l'assertion sur la désactivation de la notification : réussi (139 hors sélection). Il n'est pas compté comme un neuvième scénario distinct.
- Fichiers backend de tests : `src/trip-requests/trip-requests.controller.spec.ts`, `dispatch/dispatch-postgres.spec.ts`, `test/counter-offer-postgres.ts`, `src/notifications/driver-action-notifications.spec.ts` ; tests existants de service et de carte également exécutés.
- TypeScript mobile et configuration de build backend sans émission : réussis. ESLint mobile sur les fichiers modifiés : aucune erreur. Frontière réseau : réussie. Taille des sources mobile : **1 283 sources, aucun dépassement de 400 lignes**. Vérification des diffs des deux dépôts : réussie (avertissements de fins de ligne Windows seulement).

## Livraison et limites

Publier le backend compatible **avant** le nouveau mobile. Les anciennes routes sont conservées, mais les anciennes versions mobiles ne connaissent pas ce nouveau protocole de contre-proposition au premier plan. Ne pas considérer un déploiement backend seul comme une validation de la nouvelle UX.

Aucun déploiement, appel téléphonique, SMS, paiement réel, envoi push réel, modification AWS, secret, `.env` ou base de production. Aucun changement natif requis par ce lot ; aucun build natif ou essai physique réalisé ici. Les suites ne certifient ni la réception APNs/FCM, ni l'absence de crash/ANR/chauffe. La confirmation sonore et visuelle Android/iPhone, les pertes réseau réelles et la recette d'un trajet payé au prix négocié restent à effectuer sur un environnement de test.
