# Structure modulaire de l'API ZWANGA

Cette structure divise les requêtes API Redux Toolkit Query en différents fichiers selon les modules fonctionnels.

## Structure des fichiers

```
store/api/
├── baseApi.ts          # Configuration de base (baseQuery, tagTypes)
├── authApi.ts          # Authentification
├── userApi.ts          # Utilisateurs
├── tripApi.ts          # Trajets
├── messageApi.ts       # Conversations & messages
├── reviewApi.ts        # Avis et signalements
├── notificationApi.ts  # Notifications
├── vehicleApi.ts       # Véhicules
├── zwangaApi.ts        # Point d'entrée principal (ré-exporte tout)
├── bookingApi.ts       # Réservations
└── README.md           # Cette documentation
```

## Modules

### `baseApi.ts`
Configuration de base partagée par tous les modules :
- `baseQuery` avec authentification automatique
- `tagTypes` pour le cache invalidation
- `reducerPath` : `'zwangaApi'`

### `authApi.ts`
Endpoints d'authentification :
- `login` - Connexion avec téléphone/mot de passe
- `register` - Inscription d'un nouvel utilisateur
- `verifyPhone` - Vérification du numéro de téléphone (SMS)
- `verifyKYC` - Vérification d'identité (KYC)

### `userApi.ts`
Endpoints utilisateurs :
- `getCurrentUser` - Récupérer l'utilisateur connecté
- `updateUser` - Mettre à jour le profil
- `getUserById` - Récupérer un utilisateur par ID

### `tripApi.ts`
Endpoints trajets :
- `getTrips` - Rechercher des trajets (avec filtres)
- `getMyTrips` - Récupérer les trajets publiés par l'utilisateur connecté
- `getTripById` - Récupérer un trajet par ID
- `createTrip` - Créer un nouveau trajet
- `updateTrip` - Mettre à jour un trajet
- `deleteTrip` - Supprimer/annuler un trajet
- `bookTrip` - Réserver des places

### `bookingApi.ts`
Endpoints réservations :
- `createBooking` - Créer une nouvelle réservation
- `getMyBookings` - Récupérer les réservations de l'utilisateur connecté
- `getTripBookings` - Récupérer les réservations d'un trajet (conducteur)
- `getBookingById` - Détails d'une réservation
- `updateBookingStatus` - Accepter / refuser une réservation (conducteur)
- `acceptBooking` - Accepter une réservation (conducteur)
- `rejectBooking` - Refuser une réservation avec motif (conducteur)
- `cancelBooking` - Annuler une réservation (passager)

### `messageApi.ts`
Endpoints conversations / messages :
- `listConversations` - Liste paginée des conversations de l'utilisateur
- `getConversation` - Détails d'une conversation (participants, dernier message…)
- `getConversationMessages` - Messages d'une conversation
- `sendConversationMessage` - Envoyer un message
- `markConversationAsRead` - Marquer une conversation comme lue
- `createConversation`, `addParticipants`, `removeParticipant`

### `reviewApi.ts`
Endpoints avis et signalements :
- `createReview` - Créer un avis
- `reportUser` - Signaler un utilisateur
- `getReviews` - Récupérer les avis d'un utilisateur

### `notificationApi.ts`
Endpoints notifications :
- `getNotifications` - Liste des notifications
- `markNotificationAsRead` - Marquer comme lue

### `vehicleApi.ts`
Endpoints véhicules :
- `getVehicles` - Liste des véhicules de l'utilisateur connecté
- `createVehicle` - Ajouter un véhicule
- `updateVehicle` - Modifier un véhicule
- `deleteVehicle` - Supprimer un véhicule

## Utilisation

### Import depuis le fichier principal

```typescript
import { 
  useLoginMutation,
  useGetTripsQuery,
  useSendConversationMessageMutation,
  useCreateVehicleMutation
} from '@/store/api/zwangaApi';
```

### Import depuis un module spécifique

```typescript
import { useLoginMutation } from '@/store/api/authApi';
import { useGetTripsQuery } from '@/store/api/tripApi';
```

## Avantages de cette structure

1. **Séparation des responsabilités** : Chaque module gère ses propres endpoints
2. **Maintenabilité** : Plus facile de trouver et modifier un endpoint spécifique
3. **Scalabilité** : Facile d'ajouter de nouveaux modules sans toucher aux existants
4. **Réutilisabilité** : La configuration de base est partagée
5. **Type safety** : TypeScript garantit la cohérence des types

## Ajout d'un nouveau module

1. Créer un nouveau fichier `nouveauModuleApi.ts` :

```typescript
import { baseApi } from './baseApi';

export const nouveauModuleApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Vos endpoints ici
  }),
});

export const {
  useVotreHookQuery,
  useVotreHookMutation,
} = nouveauModuleApi;
```

2. Importer dans `zwangaApi.ts` :

```typescript
import './nouveauModuleApi';

export {
  useVotreHookQuery,
  useVotreHookMutation,
} from './nouveauModuleApi';
```

3. Ajouter le tagType dans `baseApi.ts` si nécessaire :

```typescript
tagTypes: ['User', 'Trip', 'NouveauModule', ...],
```


