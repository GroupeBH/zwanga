# Découpage du formulaire de demande de trajet

## Périmètre

Premier lot de refactorisation : `app/request/index.tsx`, ses composants et ses hooks.
La demande et la publication partagent désormais le géocodage manuel et son indicateur visuel.
Le découpage complet de la publication, du profil, du détail de trajet et de la navigation reste à réaliser par lots, avec leurs propres tests métier.

## Responsabilités

| Module | Responsabilité |
| --- | --- |
| `app/request/index.tsx` | Assemblage de l'écran, pied de page et branchement du sélecteur de lieu. |
| `components/trip-request/` | Itinéraire, aperçu cartographique mémorisé, horaire, budget/places/paiement, confirmation et calendrier iOS. Composants à props typées, sans appels HTTP. |
| `components/address/ManualAddressStatus.tsx` | Retour visuel partagé entre demande et publication, avec les styles et le libellé du contexte. |
| `useRequestTripController` | Coordination du formulaire, préremplissage, sélection des lieux, calculs d'affichage. Un seul appel par écran. |
| `useRequestDraft` / `requestDraftsSlice` | Brouillon Redux Toolkit isolé par instance de formulaire, setters stables et mises à jour fonctionnelles basées sur la valeur courante. |
| `useRequestSchedule` | Préréglages, actualisation de l'heure et calendrier natif Android/iOS. |
| `useRequestVehicleOptions` | Paramètres de l'estimation, délai de 250 ms puis fin des interactions, lecture du cache RTK Query et réessai explicite. |
| `useRequestSubmission` | Validation, mutation de création, protection contre le double clic, récupération après réponse réseau incertaine, choix de navigation. |
| `useManualAddressGeocode` | Lecture différée de 650 ms, annulation des recherches remplacées et exclusion de leurs réponses tardives. |
| `features/trip-request/` | Fonctions de calcul testables sans environnement natif et styles existants. |

## Propriété des états

- **Redux Toolkit** : données éditables du brouillon (lieux, références, horaire, places, budget, paiement, note). Les dates sont des nombres de millisecondes ; les objets `Date` n'existent que dans les adaptateurs d'interface. Le brouillon est supprimé au démontage de son formulaire, à la déconnexion et au changement de compte. Un résultat tardif ne recrée pas un brouillon supprimé.
- **RTK Query** : favoris, géocodage, recommandations tarifaires, création et récupération des demandes. Le nouvel endpoint de lecture `tripRequestVehicleOptions` conserve le contrat POST existant et mutualise les lectures identiques ; son cache expire 30 secondes après le dernier abonnement. L'ancienne mutation de consultation reste disponible pour les autres écrans.
- **État React local** : ouverture des modals, étape affichée, indicateurs transitoires, résultat de soumission et aperçu cartographique. Les refs, objets natifs et promesses ne vont pas dans Redux.

L'estimation n'est pas copiée dans une seconde liste locale. `currentData` évite d'afficher les options d'un ancien itinéraire. Le budget choisi par l'utilisateur n'est pas remplacé quand une nouvelle estimation arrive. Le tracé continue d'utiliser le service d'itinéraires existant, qui envoie ses requêtes par RTK Query.

## Non-régression

Contrats conservés : places facultatives dans le payload, budget manuel autorisé sans estimation, limite de capacité connue respectée, choix du véhicule, calendrier local, modals de confirmation, choix accueil/détail après création. Aucun POST de création n'est rejoué automatiquement après un délai d'attente : la récupération se fait par lecture des demandes.

Commandes :

```sh
npm run test:trip-request
npm run test:performance
npm run test:referrals
npm run check:network
npx tsc --noEmit
```

Les tests du formulaire exécutent les modules TypeScript et le véritable cache Redux/RTK Query, avec les effets natifs et le cycle des hooks simulés. Ils ne remplacent pas les essais de rendu sur appareil.

Vérifications locales du 11 septembre 2026 : 11 tests du formulaire, 16 tests de performance et 6 tests de parrainage réussis ; TypeScript et ESLint sur les fichiers concernés sans erreur ni avertissement ; frontière HTTP valide ; export Expo/Hermes Android et iOS avec source maps réussi. Aucun déploiement ni test sur téléphone réel n'a été effectué dans ce lot.

À vérifier sur Android et iOS : saisie manuelle rapide, sélection d'un repère puis changement de lieu, fermeture/réouverture du formulaire, calendrier personnalisé, budget après panne réseau, modification du nombre de places, double clic d'envoi, choix du modal de succès et parcours de publication.
