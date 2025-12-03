# Configuration des Notifications Push avec Notifee

Ce document explique comment les notifications push sont configurées dans l'application Zwanga pour fonctionner en mode background et ouvrir l'application lors du clic.

## Architecture

### Composants principaux

1. **`services/pushNotifications.ts`** : Service principal pour gérer les notifications
   - `obtainFcmToken()` : Récupère le token FCM/Expo Push Token
   - `displayNotification()` : Affiche une notification avec Notifee
   - `handleIncomingNotification()` : Traite les notifications reçues depuis FCM
   - `setupForegroundNotificationHandlers()` : Configure les handlers pour les notifications en foreground

2. **`components/NotificationHandler.tsx`** : Composant qui gère les notifications et la navigation
   - Écoute les notifications en background et foreground
   - Navigue vers les écrans appropriés lors du clic sur une notification
   - Gère les deep links

## Fonctionnement

### Réception des notifications

1. **En background (app fermée ou en arrière-plan)** :
   - Les notifications FCM sont reçues par le système
   - `handleIncomingNotification()` les intercepte et les affiche avec Notifee
   - `notifee.onBackgroundEvent()` gère les clics sur les notifications

2. **En foreground (app ouverte)** :
   - Les notifications sont interceptées par `expo-notifications`
   - Elles sont ensuite affichées avec Notifee via `handleIncomingNotification()`
   - Les clics sont gérés par `notifee.onForegroundEvent()` (si disponible) ou `expo-notifications`

### Navigation depuis les notifications

Le système de navigation supporte les types de notifications suivants :

- `trip` ou `trip_update` : Navigue vers `/trip/[tripId]`
- `booking`, `booking_accepted`, `booking_rejected`, `booking_cancelled` : Navigue vers `/trip/[tripId]` ou `/bookings`
- `message` ou `chat` : Navigue vers `/chat/[conversationId]`
- `trip_manage` : Navigue vers `/trip/manage/[tripId]`
- `rate` ou `review` : Navigue vers `/rate/[tripId]`

### Format des données de notification

Les notifications doivent inclure un champ `data` avec les informations suivantes :

```json
{
  "type": "trip",
  "tripId": "123",
  "bookingId": "456",
  "conversationId": "789",
  "userId": "abc"
}
```

## Configuration backend

Le backend doit envoyer les notifications FCM avec la structure suivante :

```json
{
  "notification": {
    "title": "Titre de la notification",
    "body": "Corps de la notification"
  },
  "data": {
    "type": "trip",
    "tripId": "123"
  }
}
```

## Configuration requise

### Android

1. Le fichier `google-services.json` doit être présent dans `android/app/`
2. Le plugin Notifee est configuré dans `app.config.js`
3. Les permissions de notification sont demandées via `requestPushPermissions()`

### iOS

1. Les capacités push notifications doivent être activées dans Xcode
2. Le certificat APNs doit être configuré dans le compte développeur Apple

## Utilisation

### Obtenir le token FCM

```typescript
import { obtainFcmToken } from '@/services/pushNotifications';

const token = await obtainFcmToken();
// Envoyer le token au backend pour l'enregistrer
```

### Afficher une notification locale

```typescript
import { displayNotification } from '@/services/pushNotifications';

await displayNotification(
  'Titre',
  'Message',
  { type: 'trip', tripId: '123' }
);
```

## Notes importantes

1. **Expo Go** : Les notifications push distantes ne fonctionnent pas dans Expo Go (SDK 53+). Un build de développement ou EAS est requis.

2. **Background handlers** : `onBackgroundEvent` doit être appelé au niveau racine de l'application, ce qui est fait dans `NotificationHandler.tsx`.

3. **Deep links** : L'application supporte les deep links au format `zwanga://trip/123` ou `zwanga://chat/456`.

4. **Canal Android** : Un canal de notification est créé automatiquement avec l'ID `zwanga_default`.

## Dépannage

### Les notifications ne s'affichent pas

1. Vérifier que les permissions sont accordées
2. Vérifier que le token FCM est bien enregistré sur le backend
3. Vérifier que le backend envoie les notifications avec le bon format
4. Vérifier les logs pour les erreurs

### La navigation ne fonctionne pas

1. Vérifier que le champ `data` contient les bonnes informations
2. Vérifier que le type de notification est supporté
3. Vérifier que les routes existent dans `app/_layout.tsx`

