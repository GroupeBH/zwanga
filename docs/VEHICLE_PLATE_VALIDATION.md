# Format des plaques dans les formulaires mobile

Règle demandée : exactement **4 chiffres, 2 lettres puis 2 chiffres**, par exemple
`1234AB56`. La validation commune se trouve dans `utils/vehiclePlate.ts`.

- Format enregistré : `^[0-9]{4}[A-Z]{2}[0-9]{2}$`.
- Les lettres ASCII minuscules sont converties en majuscules ; les espaces et
  tirets sont retirés. `0001 az 02` devient `0001AZ02`, sans perdre les zéros initiaux.
- Les caractères étrangers au format et les caractères en trop ne sont ni
  tronqués ni supprimés pour fabriquer artificiellement une plaque valide.
- Une aide visible donne le format attendu. Le bouton de validation reste
  désactivé tant que la plaque est invalide.

## Parcours couverts

- `VehicleFormModal` : création et modification dans le profil, création pendant
  la publication d'un trajet.
- `components/auth/VehicleModal` : saisie du véhicule à l'inscription conducteur.
- `useProfileVehicles` et `usePublishVehicleCreation` : nouvelle vérification
  avant la mutation RTK Query, même si l'action est appelée sans passer par le bouton.
- `useSignupProfileActions` : contrôle avant de poursuivre l'inscription conducteur.
- `useRegistrationActions` : contrôle final et normalisation des données envoyées
  par téléphone, Google ou Apple.

Les passagers n'ont toujours aucune obligation d'ajouter un véhicule. Les véhicules
existants ne sont pas supprimés ni modifiés automatiquement. Une ancienne plaque
non conforme doit être corrigée pour enregistrer une modification du véhicule.

Le durcissement concerne ici les formulaires de l'application. Il ne modifie ni
le backend ni sa base de données et ne constitue pas une validation côté serveur.
Aucun appel réseau supplémentaire n'est ajouté pendant la saisie.

## Vérification

`node --test tests/vehiclePlate.test.js tests/profileModules.test.js tests/formSafeArea.test.js`

Les tests couvrent le format exact, les caractères invalides, les zéros initiaux,
les plaques trop longues, la création, la modification, les trois méthodes
d'inscription et la préservation du parcours passager.
