# Redirection Intelligente des Notifications

## Vue d'ensemble

Le système de notifications utilise maintenant une logique intelligente pour rediriger les conducteurs et les passagers vers les pages appropriées en fonction de leur rôle dans le trajet.

## Principe

Lorsqu'un utilisateur clique sur une notification concernant un trajet, le système vérifie automatiquement si cet utilisateur est le conducteur du trajet en question :

- **Si l'utilisateur est le conducteur** → Redirection vers `/trip/manage/[id]` (page de gestion du trajet)
- **Si l'utilisateur est un passager** → Redirection vers `/trip/[id]` (page de détail du trajet)

## Implémentation

### Fichiers concernés

1. **`app/notifications.tsx`** - Pour les clics depuis la liste des notifications
2. **`components/NotificationHandler.tsx`** - Pour les notifications en arrière-plan et les deep links

### Fonctions clés

#### `isUserDriverOfTrip(data: Record<string, any>): boolean`

Vérifie si l'utilisateur connecté est le conducteur du trajet associé à la notification.

```typescript
const isUserDriverOfTrip = (data: Record<string, any>): boolean => {
  if (!currentUser?.id || !data.tripId) return false;
  
  // Si les données contiennent driverId, vérifier directement
  if (data.driverId) {
    return String(data.driverId) === String(currentUser.id);
  }
  
  // Si les données contiennent l'objet trip avec driverId
  if (data.trip?.driverId) {
    return String(data.trip.driverId) === String(currentUser.id);
  }
  
  return false;
};
```

#### `getTripUrl(tripId: string, data: Record<string, any>): string`

Détermine l'URL appropriée en fonction du rôle de l'utilisateur.

```typescript
const getTripUrl = (tripId: string, data: Record<string, any>): string => {
  // Si l'utilisateur est le conducteur du trajet, rediriger vers la page de gestion
  if (isUserDriverOfTrip(data)) {
    return `/trip/manage/${tripId}`;
  }
  // Sinon, rediriger vers la page de détail
  return `/trip/${tripId}`;
};
```

#### `isDriverNotification(type: string): boolean`

Identifie les notifications explicitement destinées aux conducteurs.

```typescript
const isDriverNotification = (type: string): boolean => {
  const driverTypes = [
    'trip_expiring',
    'driver_reminder',
    'booking_pending', // Une nouvelle réservation pour le conducteur
    'trip_starting_soon',
  ];
  return driverTypes.includes(type);
};
```

## Types de notifications gérées

### Notifications avec redirection intelligente

Ces notifications utilisent `getTripUrl()` pour déterminer la destination :

- `trip` - Mise à jour générale du trajet
- `trip_update` - Modification du trajet
- `booking` - Notification de réservation
- `booking_accepted` - Réservation acceptée
- `booking_rejected` - Réservation refusée
- `booking_cancelled` - Réservation annulée
- `booking_pending` - Réservation en attente

### Notifications toujours vers `/trip/manage/[id]`

Ces notifications redirigent toujours vers la page de gestion :

- `trip_manage` - Gestion du trajet
- `trip_expiring` - Trajet sur le point d'expirer
- `driver_reminder` - Rappel pour le conducteur
- `trip_starting_soon` - Trajet qui commence bientôt

### Autres redirections

- `message`, `chat` → `/chat/[id]`
- `trip_request`, `new_trip_request`, etc. → `/request/[id]`
- `rate`, `review` → `/rate/[id]`

## Données requises dans les notifications

Pour que la redirection intelligente fonctionne, les notifications doivent inclure dans leur payload `data` :

```json
{
  "type": "booking_pending",
  "tripId": "123",
  "driverId": "456", // ← Important pour identifier le conducteur
  "bookingId": "789"
}
```

Ou alternativement :

```json
{
  "type": "trip_update",
  "tripId": "123",
  "trip": {
    "driverId": "456" // ← Peut aussi être dans un objet imbriqué
  }
}
```

## Deep Links

Les deep links supportent également la redirection intelligente pour les URLs de type `zwanga://trip/[id]`.

Le système vérifie automatiquement :
1. Si l'URL commence par `trip/manage/` → Redirection directe vers la page de gestion
2. Si l'URL commence par `trip/` → Utilise `getTripUrl()` pour déterminer la destination

Exemple :
- `zwanga://trip/123?driverId=456` → Redirige intelligemment selon l'utilisateur
- `zwanga://trip/manage/123` → Toujours vers la page de gestion

## Avantages

1. **Expérience utilisateur améliorée** : Les conducteurs accèdent directement à leurs outils de gestion
2. **Sécurité** : Empêche les passagers d'accéder accidentellement à la page de gestion
3. **Flexibilité** : Le système s'adapte automatiquement au contexte de chaque utilisateur
4. **Maintenabilité** : Logique centralisée et réutilisable

## Notes importantes

- La fonction `useGetCurrentUserQuery()` doit être disponible pour récupérer l'utilisateur connecté
- Le `currentUser.id` est comparé au `driverId` pour déterminer le rôle
- Les comparaisons utilisent `String()` pour éviter les erreurs de type
- En cas de doute ou d'erreur, le système redirige par défaut vers la page de détail (`/trip/[id]`)

