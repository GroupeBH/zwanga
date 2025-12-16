# Gestion des Notifications Push en Arrière-plan avec Expo Task Manager

Ce document explique comment Expo Task Manager est utilisé pour gérer les notifications push en arrière-plan dans l'application Zwanga.

## Vue d'ensemble

Expo Task Manager permet d'exécuter du code JavaScript en arrière-plan, même quand l'application est fermée ou en arrière-plan. Cela est essentiel pour traiter les notifications push et effectuer des actions spécifiques (mise à jour du store, synchronisation des données, etc.).

## Architecture

### Composants principaux

1. **`services/backgroundNotificationTask.ts`** : Service principal pour la tâche de fond
   - Définit la tâche avec `TaskManager.defineTask()`
   - Traite les notifications reçues en arrière-plan
   - Fournit des fonctions pour enregistrer/désenregistrer la tâche

2. **`components/NotificationHandler.tsx`** : Composant qui enregistre la tâche au démarrage
   - Appelle `registerBackgroundNotificationTask()` lors du montage
   - Gère la navigation depuis les notifications

3. **`app.config.js`** : Configuration Expo
   - Active les notifications en arrière-plan (`enableBackgroundRemoteNotifications: true`)
   - Configure le plugin `expo-task-manager`

## Fonctionnement

### 1. Définition de la tâche

La tâche est définie au niveau racine du module dans `backgroundNotificationTask.ts` :

```typescript
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  // Traiter la notification reçue en arrière-plan
});
```

**Important** : La tâche doit être définie AVANT que l'application ne démarre, c'est pourquoi elle est importée dans `app/_layout.tsx`.

### 2. Enregistrement de la tâche

La tâche est enregistrée au démarrage de l'application dans `NotificationHandler.tsx` :

```typescript
await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
```

Cette méthode lie la tâche Task Manager aux notifications push d'expo-notifications.

### 3. Traitement des notifications

Quand une notification est reçue en arrière-plan :

1. Le système d'exploitation (iOS/Android) reçoit la notification FCM
2. Expo Notifications intercepte la notification
3. La tâche de fond est automatiquement déclenchée
4. La fonction de tâche traite la notification via `handleIncomingNotification()`
5. La notification est affichée avec Notifee

## Configuration requise

### iOS

Dans `app.config.js`, les modes d'arrière-plan sont configurés :

```javascript
UIBackgroundModes: ['remote-notification', 'fetch']
```

### Android

Les permissions nécessaires sont configurées automatiquement par Expo. Le plugin `expo-task-manager` est ajouté dans la configuration.

## Format des données

Les notifications sont passées à la tâche sous la forme :

```typescript
{
  notification: Notifications.Notification  // Format expo-notifications standard
}
```

Ou en format FCM direct :

```typescript
{
  title: string,
  body: string,
  data: Record<string, any>,
  id?: string,
  badge?: number
}
```

## Utilisation

### Enregistrer la tâche

La tâche est automatiquement enregistrée au démarrage de l'application. Si vous devez l'enregistrer manuellement :

```typescript
import { registerBackgroundNotificationTask } from '@/services/backgroundNotificationTask';

await registerBackgroundNotificationTask();
```

### Vérifier l'état de la tâche

```typescript
import { isBackgroundNotificationTaskRegistered } from '@/services/backgroundNotificationTask';

const isRegistered = await isBackgroundNotificationTaskRegistered();
```

### Désenregistrer la tâche

Utile lors de la déconnexion ou du nettoyage :

```typescript
import { unregisterBackgroundNotificationTask } from '@/services/backgroundNotificationTask';

await unregisterBackgroundNotificationTask();
```

## Limitations

1. **Expo Go** : Les notifications push distantes ne fonctionnent pas dans Expo Go (SDK 53+). Un build de développement ou EAS est requis.

2. **Temps d'exécution** : Les tâches de fond ont un temps d'exécution limité (environ 30 secondes sur iOS, variable sur Android).

3. **Ressources** : Les tâches de fond doivent être légères et ne pas bloquer le thread principal.

## Dépannage

### La tâche n'est pas déclenchée

1. Vérifier que `enableBackgroundRemoteNotifications` est à `true` dans `app.config.js`
2. Vérifier que la tâche est bien enregistrée : `await isBackgroundNotificationTaskRegistered()`
3. Vérifier les logs pour voir si la tâche est appelée

### Erreurs dans la tâche

Les erreurs sont capturées et loggées, mais ne bloquent pas le système de notifications. Vérifier les logs de la console pour plus de détails.

### Notifications non reçues en arrière-plan

1. Vérifier que les permissions de notification sont accordées
2. Vérifier que le token FCM est valide et enregistré sur le backend
3. Vérifier que le backend envoie les notifications avec le bon format

## Notes importantes

1. **Ordre d'importation** : La tâche doit être importée dans `app/_layout.tsx` AVANT que l'application ne démarre pour être correctement définie.

2. **Gestion des erreurs** : Les erreurs dans la tâche sont capturées pour éviter de bloquer le système de notifications.

3. **Performance** : La tâche doit être rapide et ne pas effectuer d'opérations lourdes (appels API synchrones, etc.).

4. **Compatibilité** : Cette implémentation fonctionne avec `expo-notifications` et `@notifee/react-native` pour une gestion complète des notifications.

