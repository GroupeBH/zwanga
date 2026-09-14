# Sélection d’un lieu

Le contrat public de `LocationPickerModal` est conservé : titre, sélection initiale, recherche initiale, GPS à l’ouverture en option, tracé et restriction à l’itinéraire, `onSelect` et `onClose`.

## Organisation

- `components/LocationPickerModal.tsx` : modal, recherche, accès aux favoris/repères et confirmation. La session est démontée à la fermeture.
- `components/location-picker/LocationPickerMap.tsx` : carte native mémorisée, chargée après `Modal.onShow`, commandes différées jusqu’à sa disponibilité, épingle centrée et minuterie de nouvelle tentative.
- `hooks/location-picker/useLocationPicker.ts` : sélection, recherche différée de 550 ms, GPS, réponses obsolètes et validation.
- `features/location-picker` : styles, validation des coordonnées en RDC et limitation du tracé affiché.

## Comportements préservés et optimisations

Les favoris fonctionnent avec leurs coordonnées disponibles sans requête supplémentaire. Les résultats contenant déjà leurs coordonnées ne nécessitent plus un second appel de détail. Un repère rapide applique le résultat trouvé sans relancer la recherche avec son nom.

Les coordonnées sont sélectionnées immédiatement ; obtenir leur adresse ne bloque pas la confirmation. Le géocodage et la recherche passent par RTK Query. Les adresses résolues sont conservées dans un cache mémoire de 40 entrées pendant cinq minutes. Le GPS utilise d’abord une position récente et suffisamment précise, avec un délai maximal d’attente pour l’interface.

La carte est indépendante de la saisie et des changements du pied de page. Ses résultats superposés ne changent pas sa hauteur. Son tracé est limité à 400 points pour l’affichage uniquement ; le positionnement sur l’itinéraire utilise tous les points validés. Le point choisi reste disponible si la carte ou le réseau tarde à répondre.

Le suivi natif continu de la position, les bâtiments et les intérieurs sont désactivés dans ce sélecteur ponctuel ; le bouton « Ma position » reste disponible. Les cartes de navigation d’un trajet ne sont pas modifiées par cette refonte.

## Validation

`npm run test:location-picker`, `node --test tests/*.test.js`, `npx tsc --noEmit --incremental false`, ESLint sur les fichiers concernés et `npm run check:network`.

À vérifier sur iOS et Android : petit écran avec clavier, favoris, repères, recherche lente, GPS refusé, déplacement puis confirmation immédiate, sélection sur un itinéraire, fermeture/réouverture rapide. Les tests automatisés ne mesurent ni la durée réelle du chargement des tuiles ni le rendu natif. L’émulateur connecté affichait un écran noir au moment de cette intervention ; la validation visuelle reste à faire.
