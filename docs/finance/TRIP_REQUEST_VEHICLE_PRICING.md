# Sélection du véhicule et tarification d'une demande de trajet

## 1. Objet

Cette documentation décrit l'intégration mobile du choix du type de véhicule dans le formulaire de demande de trajet. Elle couvre tous les comportements qui influencent un montant affiché ou envoyé au serveur.

Le passager doit voir les options disponibles et leur estimation avant d'envoyer sa demande. Le backend reste l'unique source de vérité pour le calcul tarifaire.

## 2. Périmètre fonctionnel

Le formulaire prend en charge trois types canoniques :

| Valeur API | Libellé affiché par le serveur | Usage |
| --- | --- | --- |
| `car` | Voiture | Course en voiture |
| `motorcycle_2_wheels` | Moto à 2 roues | Course en moto deux roues |
| `motorcycle_3_wheels` | Moto à 3 roues | Course en moto trois roues |

Ces valeurs sont volontairement distinctes du type historique `VehicleType` de l'application (`car`, `moto`, `tricycle`). Le type `TripRequestVehicleType` empêche une conversion implicite ou l'envoi d'une ancienne valeur non acceptée par l'API des demandes.

## 3. Source des prix

Le client appelle :

`POST /api/v1/trip-requests/vehicle-options`

Corps envoyé :

```json
{
  "departureLocation": "Gombe",
  "departureReference": "Rond-point Socimat",
  "departureCoordinates": [15.273, -4.303],
  "arrivalLocation": "Lemba",
  "arrivalReference": "Super Lemba",
  "arrivalCoordinates": [15.327, -4.417],
  "numberOfSeats": 2
}
```

Les références et coordonnées ne sont envoyées que lorsqu'elles sont connues. Le backend résout l'itinéraire, applique ses règles par type de véhicule et renvoie les estimations.

Structure utilisée par le mobile :

```json
{
  "currency": "CDF",
  "pricingModel": "distance_per_vehicle_type",
  "distanceMeters": 5000,
  "numberOfSeats": 2,
  "weatherImpact": {
    "priceMultiplier": 1.3
  },
  "options": [
    {
      "vehicleType": "car",
      "displayName": "Voiture",
      "maximumSeats": null,
      "availableForRequestedSeats": true,
      "pricePerKmPerPassenger": 500,
      "recommendedPricePerSeat": 3250,
      "recommendedTotalPrice": 6500
    }
  ]
}
```

Le mobile n'applique aucun tarif fixe local et ne recalcule pas l'estimation. Il formate uniquement les valeurs retournées par l'API.

## 4. Déroulement dans le formulaire

1. Le passager renseigne le départ et la destination.
2. Le formulaire appelle `vehicle-options` avec l'itinéraire et, seulement si le passager le précise, le nombre de places. Une place est utilisée par défaut.
3. Pendant le calcul, un indicateur remplace la liste et le bouton d'envoi reste désactivé.
4. Les trois options sont affichées avec leur prix recommandé par place.
5. Pour plusieurs places, le total estimé est aussi affiché.
6. Une option incompatible avec le nombre de places est visible mais non sélectionnable.
7. La voiture est la sélection initiale. Si elle devient indisponible, la première option disponible est sélectionnée.
8. Changer l'itinéraire ou le nombre de places recharge toutes les estimations.
9. Le passager choisit une option puis envoie la demande.

Lorsque `weatherImpact.priceMultiplier` est supérieur à `1`, le coefficient est affiché à côté du titre des options. Le montant affiché inclut déjà cet ajustement : le mobile ne multiplie pas une seconde fois le prix.

## 5. Estimation et budget maximum

Deux notions différentes sont présentées :

- `recommendedPricePerSeat` est l'estimation calculée par le backend pour l'option sélectionnée ;
- `maxPricePerSeat` est un plafond choisi manuellement par le passager.

### 5.1 Budget non modifié

Le contrôle de budget reprend visuellement l'estimation de l'option sélectionnée. Le client n'envoie cependant pas `maxPricePerSeat`. Le backend recalcule alors le prix au moment de la création, ce qui évite de faire confiance à une valeur d'interface devenue obsolète.

### 5.2 Budget modifié

Dès que le passager utilise les boutons `-` ou `+`, le montant devient son budget maximum. Le libellé change en conséquence et `maxPricePerSeat` est envoyé au backend.

Le pas de modification reste de `500 CDF` et le minimum de `500 CDF`. Un budget personnalisé est conservé si le passager change ensuite de type de véhicule : les prix propres à chaque option restent visibles pour permettre la comparaison.

### 5.3 Nature de l'estimation

Les montants de la liste sont des estimations de demande. Le montant effectivement retenu peut dépendre de l'offre acceptée et des validations serveur. L'interface utilise donc les termes `estimé`, `recommandé` et `budget maximum`, et ne présente pas l'estimation comme un débit définitif.

## 6. Création de la demande

Le champ `vehicleType` est obligatoire dans le type `CreateTripRequestPayload` et dans le corps de la requête :

```json
{
  "departureLocation": "Gombe",
  "arrivalLocation": "Lemba",
  "departureDateMin": "2026-08-18T10:00:00.000Z",
  "departureDateMax": "2026-08-18T11:00:00.000Z",
  "numberOfSeats": 2,
  "vehicleType": "motorcycle_3_wheels",
  "paymentMode": "cash"
}
```

Si le budget a été modifié, `maxPricePerSeat` est ajouté au corps. Sinon il est omis.

La validation locale refuse l'envoi lorsque :

- les lieux ou la fenêtre horaire ne sont pas valides ;
- le budget personnalisé n'est pas un nombre positif ;
- aucune option tarifée disponible n'est sélectionnée ;
- un calcul des options est encore en cours.

## 7. Modification d'une demande existante

Le propriétaire peut changer le type de véhicule depuis le modal `Modifier la demande` tant que la demande est encore modifiable. Le type actuel est présélectionné et reste visible dans le résumé de la demande après l'enregistrement.

### 7.1 Chargement des options

L'application rappelle `POST /api/v1/trip-requests/vehicle-options` avec l'itinéraire et le nombre de places présents dans le formulaire d'édition. L'appel est temporisé de `350 ms` afin d'éviter une requête à chaque frappe lors de la saisie manuelle d'une adresse.

Les options affichent de nouveau :

- le prix recommandé par place ;
- le total estimé lorsqu'il y a plusieurs places ;
- le coefficient météo lorsqu'il est supérieur à `1` ;
- l'indisponibilité éventuelle pour le nombre de places demandé.

L'enregistrement est désactivé pendant le calcul, après une erreur tarifaire ou lorsqu'aucune option disponible n'est sélectionnée.

### 7.2 Changement avec estimation serveur

Lorsqu'un nouveau type est choisi, le champ de budget affiche sa nouvelle estimation. Tant que le passager ne modifie pas ensuite ce montant, l'application envoie le nouveau `vehicleType` sans `maxPricePerSeat` :

```json
{
  "vehicleType": "motorcycle_2_wheels"
}
```

Le backend recalcule alors lui-même le prix recommandé. Le montant affiché par le mobile ne devient donc pas une source financière faisant autorité.

### 7.3 Changement avec budget personnalisé

Si le passager modifie le champ `Prix max/place` après avoir choisi le véhicule, l'application envoie les deux valeurs :

```json
{
  "vehicleType": "motorcycle_3_wheels",
  "maxPricePerSeat": 6500
}
```

Dans ce cas, le backend conserve explicitement le plafond du passager au lieu de le remplacer par la recommandation.

### 7.4 Conditions de modification

Le changement reste interdit lorsque la demande est annulée, expirée, associée à un conducteur sélectionné ou à une offre déjà acceptée. Le mobile masque l'action lorsque la demande n'est plus modifiable et le backend réapplique la même validation.

## 8. Gestion des erreurs et cohérence

| Situation | Comportement mobile |
| --- | --- |
| L'itinéraire est incomplet | Les options et la distance sont vidées |
| L'appel tarifaire est en cours | Indicateur de chargement et envoi désactivé |
| L'appel tarifaire échoue | Message explicite et bouton `Réessayer` |
| Le nombre de places change | Nouvelle requête et réévaluation de la disponibilité |
| Le prix recommandé est `null` | Affichage `À confirmer` ; le serveur reste responsable du calcul final |
| Une ancienne réponse ne contient pas `vehicleType` | Lecture compatible avec repli sur `car` |

Le formulaire ne permet pas d'envoyer silencieusement une demande après l'échec du chargement des prix. Cette contrainte garantit que le passager a vu une option et son estimation avant la création.

## 9. Analytics

L'événement existant `trip_request_created` contient maintenant :

```json
{
  "vehicle_type": "car",
  "seats": 2,
  "max_price_per_seat": null,
  "payment_mode": "cash"
}
```

`max_price_per_seat: null` signifie que le passager n'a pas personnalisé son plafond. Cela ne signifie pas que la course est gratuite ou sans estimation.

## 10. Fichiers modifiés

| Fichier | Modification | Impact financier |
| --- | --- | --- |
| `types/index.ts` | Ajout de `TripRequestVehicleType` et de `TripRequest.vehicleType` | Conserve le type qui détermine la règle tarifaire |
| `store/api/tripRequestApi.ts` | Contrat de `vehicle-options`, hook RTK Query et `vehicleType` obligatoire à la création | Transporte les prix serveur sans recalcul local |
| `app/request/index.tsx` | Liste des options, prix, disponibilité, coefficient météo, budget et validation | Rend le choix tarifaire explicite avant l'envoi |
| `app/request/[id].tsx` | Sélection tarifée dans le modal d'édition, validation et affichage du type courant | Permet un changement de grille tarifaire sans faire confiance au calcul du client |
| `docs/finance/TRIP_REQUEST_VEHICLE_PRICING.md` | Documentation du flux mobile | Fournit la traçabilité fonctionnelle et technique |

## 11. Scénarios de recette

1. Créer un itinéraire valide avec une place et vérifier l'affichage des trois options.
2. Comparer chaque prix affiché avec la réponse brute de `vehicle-options`.
3. Passer à deux places et vérifier les totaux ainsi que la disponibilité.
4. Choisir chaque type successivement et vérifier la mise à jour du prix recommandé.
5. Modifier le budget, changer de type et vérifier que le budget personnalisé reste inchangé.
6. Envoyer sans modifier le budget et vérifier que `maxPricePerSeat` est absent du corps.
7. Envoyer après modification et vérifier que `maxPricePerSeat` est présent.
8. Vérifier que `vehicleType` correspond exactement à l'option sélectionnée.
9. Simuler une erreur réseau, vérifier le blocage de l'envoi puis le bouton `Réessayer`.
10. Simuler un coefficient météo supérieur à `1` et vérifier son affichage sans double multiplication.
11. Ouvrir une demande modifiable et vérifier que son type actuel est présélectionné.
12. Changer uniquement le type et vérifier que le `PUT` omet `maxPricePerSeat`.
13. Changer le type puis personnaliser le budget et vérifier que le `PUT` contient les deux champs.
14. Simuler une erreur de tarification dans le modal et vérifier que l'enregistrement reste bloqué.
15. Enregistrer puis vérifier que le nouveau type apparaît dans le résumé de la demande.

## 12. Ordre de déploiement

1. Déployer le backend qui expose `vehicle-options` et persiste `vehicleType`.
2. Déployer cette version mobile.
3. Contrôler les erreurs `400` sur la création et les erreurs de l'endpoint tarifaire.
4. Comparer pendant les premières courses `vehicle_type`, l'estimation affichée, le budget personnalisé et le prix de l'offre acceptée.

Le backend exigeant désormais `vehicleType`, les anciennes versions mobiles qui ne l'envoient pas peuvent recevoir une erreur `400`. La coordination des versions doit donc faire partie du plan de publication.
