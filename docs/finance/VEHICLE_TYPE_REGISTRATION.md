# Création d'un véhicule — choix obligatoire du type

## 1. Objet

Ce document décrit l'intégration mobile de `FIN-VEH-001`. Le type de véhicule est maintenant choisi lors de chaque création et transmis tel quel au backend.

La modification est financièrement sensible sans déplacer d'argent : un véhicule doit correspondre au type d'une demande, et ce type de demande sélectionne ensuite la grille tarifaire appliquée par le serveur.

## 2. Valeurs canoniques

| Valeur envoyée | Libellé affiché |
| --- | --- |
| `car` | Voiture |
| `motorcycle_2_wheels` | Moto à 2 roues |
| `motorcycle_3_wheels` | Moto à 3 roues |

Le catalogue partagé se trouve dans `constants/vehicleTypes.ts`. Les anciennes catégories d'inscription `sedan`, `suv`, `van` et `moto` ne sont plus utilisées pour créer un véhicule.

## 3. Écrans concernés

### Inscription conducteur

L'étape profil présente les trois choix canoniques. Le type, la marque, le modèle, la couleur et la plaque doivent être renseignés avant de poursuivre. Le même objet véhicule est envoyé pour :

- l'inscription téléphone en `multipart/form-data` ;
- la première inscription Apple en JSON ;
- la première inscription Google en JSON.

### Profil

Le bouton d'ajout ouvre `VehicleFormModal`. Le choix du type apparaît avant les informations mécaniques. Après création, la liste affiche le type avec la couleur du véhicule.

### Publication d'un trajet

Lorsqu'un conducteur n'a pas encore le véhicule nécessaire, le même formulaire peut être ouvert sans perdre la progression du trajet. Le véhicule créé est sélectionné immédiatement et sa carte affiche son type.

## 4. Interaction du formulaire partagé

- aucune option n'est présélectionnée ;
- les trois lignes sont entièrement tactiles ;
- l'état choisi est signalé par la bordure, la couleur, l'icône et un bouton radio ;
- les rôles d'accessibilité `radio` et l'état `checked` sont exposés ;
- le bouton principal reste désactivé sans sélection ;
- la validation parente contrôle à nouveau le type avant l'appel réseau ;
- fermer ou réinitialiser le formulaire efface la sélection.

## 5. Contrat de création

La mutation `createVehicle` exige :

```ts
{
  type: 'car' | 'motorcycle_2_wheels' | 'motorcycle_3_wheels';
  brand: string;
  model: string;
  color: string;
  licensePlate: string;
  photoUrl?: string;
}
```

Exemple :

```json
{
  "type": "motorcycle_3_wheels",
  "brand": "TVS",
  "model": "King",
  "color": "Bleu",
  "licensePlate": "TRI-001"
}
```

Le client ne convertit pas ce type vers les valeurs historiques des trajets publiés (`moto`, `tricycle`). Les deux contrats restent distincts tant que l'API des trajets utilise encore l'ancien type.

## 6. Lecture et compatibilité

Le modèle mobile `Vehicle` contient désormais `type`. Les adaptateurs de profil et de trajet lisent le champ renvoyé par l'API. Un repli de lecture vers `car` protège temporairement l'application si elle communique avec un ancien serveur ; aucune création ne bénéficie de ce repli.

## 7. Incidence sur les montants

- aucun montant n'est calculé dans le formulaire véhicule ;
- aucun tarif local n'est ajouté ;
- aucune opération de paiement, de points, de parrainage ou de retrait n'est déclenchée ;
- le type est seulement conservé pour les contrôles ultérieurs de compatibilité avec une demande tarifée ;
- les prix affichés dans une demande continuent de provenir de `POST /trip-requests/vehicle-options`.

## 8. Fichiers mobiles modifiés

| Fichier | Rôle |
| --- | --- |
| `constants/vehicleTypes.ts` | source partagée des options et libellés |
| `components/VehicleFormModal.tsx` | sélecteur obligatoire |
| `components/auth/types.ts` | options canoniques de l'inscription |
| `app/auth.tsx` | validation et payloads téléphone/Apple/Google |
| `app/(tabs)/profile.tsx` | création et affichage depuis le profil |
| `app/publish.tsx` | création et affichage pendant la publication |
| `store/api/vehicleApi.ts` | contrat de mutation obligatoire |
| `store/api/authApi.ts` | types des payloads sociaux |
| `store/api/tripApi.ts` | adaptation des véhicules inclus dans les trajets |
| `store/api/userApi.ts` | adaptation des véhicules du profil |
| `types/index.ts` | propriété `Vehicle.type` |

## 9. Vérifications

- `npx tsc --noEmit` ;
- lint Expo/ESLint ;
- test manuel recommandé pour les trois types dans l'inscription, le profil et la publication ;
- contrôle réseau recommandé pour confirmer la présence exacte du champ `type`.

La documentation serveur détaillée est `docs/finance/vehicle-type-registration.md` dans le dépôt backend.
