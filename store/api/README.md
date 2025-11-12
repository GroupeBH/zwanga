# Structure modulaire de l'API ZWANGA

Cette structure divise les requêtes API Redux Toolkit Query en différents fichiers selon les modules fonctionnels.

## Structure des fichiers

```
store/api/
├── baseApi.ts          # Configuration de base (baseQuery, tagTypes)
├── authApi.ts          # Authentification
├── userApi.ts          # Utilisateurs
├── tripApi.ts          # Trajets
├── messageApi.ts       # Messages
├── reviewApi.ts        # Avis et signalements
├── notificationApi.ts  # Notifications
├── zwangaApi.ts        # Point d'entrée principal (ré-exporte tout)
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
- `getTripById` - Récupérer un trajet par ID
- `createTrip` - Créer un nouveau trajet
- `updateTrip` - Mettre à jour un trajet
- `cancelTrip` - Annuler un trajet
- `bookTrip` - Réserver des places

### `messageApi.ts`
Endpoints messages :
- `getConversations` - Liste des conversations
- `getMessages` - Messages d'une conversation
- `sendMessage` - Envoyer un message
- `markMessagesAsRead` - Marquer comme lus

### `reviewApi.ts`
Endpoints avis et signalements :
- `createReview` - Créer un avis
- `reportUser` - Signaler un utilisateur
- `getReviews` - Récupérer les avis d'un utilisateur

### `notificationApi.ts`
Endpoints notifications :
- `getNotifications` - Liste des notifications
- `markNotificationAsRead` - Marquer comme lue

## Utilisation

### Import depuis le fichier principal

```typescript
import { 
  useLoginMutation,
  useGetTripsQuery,
  useSendMessageMutation 
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


