# Descente anticipée : présentation et tarif

## Conducteur

La demande de descente est prioritaire dans le panneau de navigation. Sa carte
compacte est rendue hors du ScrollView limité à 30 % de l’écran. Les détails
secondaires et la confirmation standard de dépose reviennent après traitement.
Les actions Contacter et SOS restent accessibles. Refuser et Confirmer conservent
leurs contrôles de chargement et leurs zones tactiles d’au moins 44 points.

Le gain par passager après dépose, y compris manuelle, est décrit dans
[DRIVER_DROPOFF_REVENUE.md](DRIVER_DROPOFF_REVENUE.md).

## Passager

Avant l’envoi, le dialogue existant affiche le minimum de la réservation, puis
une estimation serveur. Le minimum est inclus dans le tarif, pas additionné.
Il concerne le total de la réservation, pas chaque place.

Avec P = prix initial à payer par le passager (après réduction éventuelle) et
r = distance parcourue / distance prévue, limitée à 100 % :

`montant = min(P, max(min(1500, P), arrondi(P × r)))`

Exemples : 10 000 FC et 5 km sur 25 km donnent 2 000 FC ; 5 000 FC pour le même
parcours donnent 1 500 FC ; une réservation à 1 000 FC reste plafonnée à 1 000 FC ;
une réservation gratuite reste gratuite.

Le calcul intervient à l’ouverture seulement, via RTK Query. Pas de polling ni
d’abonnement GPS supplémentaire. La position affichée est celle transmise avec
la demande depuis ce dialogue. L’estimation n’est pas un devis verrouillé : le
serveur confirme le montant lors du traitement, en particulier si la position
n’était pas disponible lors de l’aperçu. Un échec de calcul n’interdit pas l’envoi
d’une demande urgente. Il est indiqué sans présenter le minimum comme un total final.

## Backend à déployer avant la nouvelle application

`POST /bookings/:id/interruption-request/preview` est une lecture authentifiée,
limitée au passager propriétaire d’une réservation embarquée et en cours. Elle
ne crée pas de demande et ne déplace aucun argent. Les coordonnées sont validées.

La confirmation de descente utilise désormais la règle commune `calculateInterruptionFare`,
déjà utilisée pour l’interruption conducteur. Le prix passager est conservé
séparément du montant subventionné et verrouillé contre un second recalcul.
Un paiement électronique en cours ne peut pas être modifié en parallèle.
Un montant déjà réglé n’est pas redemandé ; l’ajustement des paiements électroniques
et en jetons conserve le mécanisme existant de crédit de la différence.

## Vérifications sur appareils avant publication

### Après confirmation (21 septembre 2026)

- Le conducteur voit le `paymentAmount` de la réponse de confirmation, sans
  multiplier par les places ni reprendre le prix brut/subventionné. Les distances
  `travelledDistanceMeters` et `plannedDistanceMeters` sont maintenant conservées
  par le mapper mobile et affichées lorsqu’elles sont disponibles.
- Le récapitulatif distingue cash à recevoir, électronique/jetons en attente,
  déjà payé et gratuit. Confirmer une descente ne signifie jamais encaisser du cash.
  Un montant absent n’est pas remplacé par zéro ou par le prix initial.
- Les actualisations secondaires ne retardent plus le récapitulatif conducteur.
  La confirmation est protégée contre les doubles clics et ne présente aucun
  dialogue tardif après démontage de la navigation.
- Les notifications d’interruption passager invalident aussi les caches de
  réservations RTK Query, au premier plan comme lors d’un appui sur la notification.
  Un appui sur une descente confirmée ouvre la navigation de cette réservation.
- `useSyncArrivedPaymentBooking` reporte une réponse de détail déjà arrivée dans
  le cache des activités du même compte. Une ancienne réponse ne remplace pas une
  réservation plus récente. Ce transfert local ne crée aucune requête, aucun
  minuteur, aucun suivi GPS ni mutation de paiement.
- Le coordinateur de paiement existant reste l’unique formulaire. Il conserve
  le mode choisi, affiche le montant final et propose le règlement s’il reste dû.
  Un paiement réussi n’est pas redébité. Reporter le paiement anticipé ne masque
  pas un règlement encore dû après la descente. Le rappel existant permet de
  reprendre un formulaire volontairement fermé après l’arrivée.
- Sans notification ou sans connexion, la mise à jour dépend des lectures de
  secours existantes et de la synchronisation au retour au premier plan ; le
  téléphone n’invente pas une confirmation ni un montant hors connexion.
- Le paiement anticipé électronique/jetons s’ouvre maintenant à **1 km de la
  destination personnelle**, à partir d’une position récente. Voir
  [NEAR_ARRIVAL_PAYMENT.md](NEAR_ARRIVAL_PAYMENT.md). L’ouverture seule ne débite
  rien et ne termine pas le trajet.

### Scénarios manuels

- Petit écran Android/iPhone et grandes polices : les deux actions de descente sont accessibles.
- Refus, confirmation, nouvelle demande suivante et retour des panneaux normaux.
- Aperçu lent/hors connexion : minimum visible immédiatement, demande urgente possible.
- Réservation gratuite, inférieure à 1 500 FC, plusieurs places et tarif subventionné.
- Réservation déjà payée : crédit de la différence, aucun second paiement.
- Ouvertures/fermetures répétées et veille/reprise iOS : aucun modal natif supplémentaire.
- Après confirmation conducteur : montant et distance visibles ; paiement passager
  possible en électronique/jetons, y compris après veille et après report à 1 km.

## Contrôles automatisés du 21 septembre 2026

- 78 tests mobiles ciblés réussis : seuil de 1 km, restitution du montant,
  synchronisation, soumission, veille/reprise, notifications, navigation et overlays.
- 111 tests backend ciblés réussis, dont la confirmation conducteur pour les trois
  modes de paiement, le tarif réduit, le paiement à 1 000 m et le refus à 1 001 m.
- TypeScript mobile et backend de production (`tsconfig.build.json`) : réussis.
- ESLint des sources modifiées : aucune erreur ni avertissement. Frontière réseau
  RTK Query et `git diff --check` : réussis.
- La suite supplémentaire `sourceExtractions.test.js` conserve deux échecs
  préexistants : empreinte des styles de réservations et contrat `userApi`
  (PIN/OTP). Ni les sources concernées ni leurs références n’ont été modifiées.
- Le contrôle des 400 lignes retrouve `app/wallet.tsx` à 414 lignes, inchangé ici.
  Les fichiers mobiles créés/modifiés pour ce correctif restent sous la limite.

Commandes de régression ciblées :

```text
node --test tests/nearArrivalPayment.test.js tests/interruptionSettlement.test.js tests/arrivalPaymentSubmission.test.js tests/arrivalPaymentResume.test.js tests/notificationNavigation.test.js tests/rideOverlays.test.js tests/navigationLifecycle.test.js tests/passengerInterruptionPreview.test.js tests/interruptionChoice.test.js
npx jest --runInBand near-arrival-payment.spec.ts passenger-interruption-fare.spec.ts driver-interruption-booking.spec.ts interruption-fare.spec.ts bookings.service.spec.ts
```

La seconde commande s’exécute dans `zwanga-backend`. Aucun paiement réel ni
déploiement n’a été effectué pendant ces vérifications.

### Validation de l’étape précédente (aperçu avant demande)

- 28 tests mobiles ciblés réussis : aperçu du tarif, actions, navigation, overlays et contrat des endpoints.
- 91 tests backend ciblés réussis : tarification, interruptions et service de réservation.
- TypeScript mobile et configuration de production backend : sans erreur.
- ESLint ciblé, frontière réseau RTK Query et contrôle du diff : réussis.
- Le contrôle TypeScript backend incluant tous les tests reste bloqué par des erreurs
  dans des tests non modifiés (OTP, confidentialité, utilisateurs et fidélité).
- Le contrôle global des 400 lignes signale encore `app/wallet.tsx` à 414 lignes,
  fichier non modifié pour cette intervention.

Ces contrôles ne remplacent pas les essais visuels et de veille/reprise sur appareils réels.
