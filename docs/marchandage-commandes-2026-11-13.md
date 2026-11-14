# Marchandage avant prise en charge — 13 novembre 2026

## Périmètre et problème

Les commandes permettaient une proposition conducteur et une réponse du passager, sans retour de prix du passager ni prix ferme du conducteur. L'accord doit rester attaché à la commande et au montant effectivement accepté.

## Fonctionnement appliqué

1. Le conducteur conserve l'acceptation directe au budget de la commande, ou envoie un prix.
2. Le passager accepte, propose son prix une fois, ou refuse pour chercher ailleurs.
3. Le conducteur accepte le prix du passager, propose son prix ferme, ou renonce.
4. Sur le prix ferme, le passager accepte ou cherche un autre conducteur. Aucun nouveau tour n'est proposé.

Les champs de prix sont intégrés aux détails existants, sans empilement de modals natifs. Les textes et annonces vocales distinguent le prix envoyé, la réponse attendue et le prix ferme. Le retrait conducteur reste possible. Le bouton de recherche d'un autre conducteur affiche une confirmation avec un indicateur de proximité : positions récentes de moins de dix minutes, positions anciennes mais de moins de 48 heures, aucun candidat, ou information indisponible. Aucun délai d'arrivée ou succès de remplacement n'est garanti. Le candidat actuel est exclu ; véhicule, places, distance de cinq kilomètres, refus, compte et conflits horaires sont filtrés côté serveur. L'indicateur n'expose pas d'identité et est demandé uniquement à l'ouverture de cette confirmation.

## Contrats et précautions

- Backend : `DriverOffer.negotiationStage` et `previousOfferId`, migration `1780000122000-RequestPriceNegotiation`. Chaque tour crée un identifiant d'offre différent ; le précédent devient annulé. Le prix d'une révision n'est pas modifié.
- Nouvelles routes : `POST /trip-requests/:id/offers/:offerId/passenger-price`, `final-price`, `accept-passenger-price` et `GET .../alternatives`. Les identités viennent de la session, pas du corps envoyé.
- Transactions : verrous comptes puis commande, contrôle du rôle métier, de l'offre courante, de l'absence d'affectation et du délai. Une acceptation mémorisant le prix et la notification se fait dans la même transaction.
- La file existante reste réservée à cet échange. Chaque tour séquentiel reprend le délai existant de 120 secondes, borné par la dernière heure de départ, avec sonnerie limitée à 60 secondes. Les règles existantes de refus, retrait et expiration libèrent la recherche. Le délai ordinaire de 40 secondes des invitations n'a pas été changé.
- Notifications durables : le type existant `driver_offer` est conservé, avec `negotiationStage` pour identifier le destinataire. Socket et push partagent l'identifiant d'offre ; REST reconstruit une alerte depuis l'offre serveur sans prolonger sa sonnerie. Une réponse ancienne ne doit plus sonner lorsque le prix a changé. L'acceptation par le conducteur prévient le passager via `trip_request_accepted`.
- Affichage en **total du trajet** ; stockage et calcul financier existants en `pricePerSeat` conservés, ainsi que les planchers serveur et la divisibilité par le nombre de places. Aucun changement des débits, commissions ou moyens de paiement.
- Les offres historiques et celles envoyées par un ancien conducteur mobile gardent accepter/refuser. Le nouveau client conducteur envoie `negotiationVersion: 1` avec son prix initial ; seul cet accord de compatibilité crée l'étape `driver_initial` qui autorise le retour du passager. Les trajets partagés et réservations publiées ne passent pas par ce nouveau marchandage. Aucun changement du lecteur audio natif Android/iOS.

## Fichiers principaux

Mobile : `features/request-detail/{PassengerPriceOffers,RequestPendingOfferActions,NegotiationPriceInput,priceNegotiation,passengerOfferAlert,requestResponseWindow,requestPresentation}`, `store/api/priceNegotiationApi.ts`, types et mappers d'offres, destinataire d'alerte et annonces dans `features/notifications`, `PassengerRideResponseCoordinator`, `DriverOffersList`.

Backend : `negotiate-request-price.ts`, contrôleur/service des commandes, DTO prix, entité/migration, `request-search-map.ts`, validation et livraison des notifications. Tests : `test/counter-offer-postgres.ts`, tests HTTP du contrôleur et du worker socket ; mobile `priceNegotiation.test.js` et non-régressions des contre-propositions.

## Vérifications et limites

- 141 tests JavaScript ciblés réussis sur les écrans, notifications, annonces, retrait et délais ; 24 tests ciblés supplémentaires réussis après ajout des scénarios d'accord conducteur, double clic, erreur réseau, changement de compte et démontage. Quatre tests du contrat RTK/API vérifient les routes et la projection des révisions. Ces campagnes se recouvrent et ne doivent pas être additionnées comme tests distincts. Le rendu natif et les transports externes y sont simulés.
- 24 tests backend HTTP/worker réussis : JWT et rôles réels dans la suite HTTP avec service simulé ; destinataires et socket testés avec transport simulé.
- TypeScript mobile et backend applicatif vérifiés ; ESLint ciblé réussi. La campagne PostgreSQL a révélé l'inclusion de positions de plus de 48 heures dans l'indicateur ; correction appliquée. Une fixture HTTP omettait aussi la projection réelle des offres ; elle utilise maintenant les vraies lectures et projections du service.
- Dernière campagne PostgreSQL/PostGIS ciblée : 20 tests réussis, dont le parcours HTTP conducteur/passager, les révisions périmées, la concurrence, le retrait, l'expiration, les destinataires, les anciens mobiles et la migration montée/descente. Base temporaire isolée ; identité HTTP synthétique et adaptateurs externes simulés. Les tests HTTP avec JWT réel sont séparés et simulent le service.
- Campagne PostgreSQL complète après corrections : Jest annonce **152 tests réussis / 152**, en 489,851 secondes. Le lanceur PowerShell avec redirection a remonté un code 1 en traitant la ligne de synthèse Jest écrite sur stderr comme `NativeCommandError` ; le rapport Jest ne contient pas d'échec de test. Le cluster temporaire a été arrêté et nettoyé par la suite. Ce résultat n'est pas une mesure de débit en production.
- Premier contrôle complet mobile : 3 786 tests réussis, deux échecs et un ignoré sur 3 789. Relance avec journal : **3 790 réussis, deux échecs, un ignoré / 3 793**, en 742,193 secondes. Les deux échecs sont localisés dans `requestDecisionLayout.test.js` et `requestOfflineRecovery.test.js` : leurs fixtures chargeaient indirectement `expo-modules-core` après l'ajout du panneau de marchandage. Les dépendances hors du scénario testé sont désormais simulées ; le panneau réel reste couvert par ses propres tests. **19 tests ciblés passent après correction**, sans retirer les assertions de placement et de récupération hors ligne. Ce n'est pas un crash observé sur appareil.
- Après les derniers ajustements des libellés : 42 tests ciblés réussis (marchandage, présentation, carte, prix et annonces), TypeScript global mobile et ESLint ciblé réussis. `priceNegotiationApi.test.js` ajoute quatre tests de contrats RTK/API réussis. **Le contrôle complet de release n'a pas été relancé après la correction finale des deux fixtures** ; aucune validation globale verte n'est revendiquée.
- Aucun essai sur téléphone physique, aucune compilation native, aucun SMS/push/paiement réel et aucun déploiement. Cela ne certifie pas l'absence de crash iOS/Android.

## Mise en service à prévoir, non effectuée

Appliquer la migration puis mettre à jour **toutes les tâches backend concernées, y compris les workers**, avant de distribuer le mobile compatible. Éviter de rendre le nouveau marchandage accessible pendant une période où d'anciens workers consomment les notifications : ils ne connaissent pas le tour passager. Le conducteur doit utiliser le nouveau mobile pour ouvrir ce marchandage ; sans `negotiationVersion: 1`, le passager conserve accepter/refuser, sans retour de prix. Prévoir un essai Android/iOS avec les deux rôles avant une généralisation.

La migration limite l'attente des verrous et refuse le retour arrière tant qu'une négociation est en attente. Ne pas supprimer les colonnes pour contourner ce garde-fou.
