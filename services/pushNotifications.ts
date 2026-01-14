import notifee from '@notifee/react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getStoredFcmToken, removeFcmToken, storeFcmToken } from './tokenStorage';

const DEFAULT_CHANNEL_ID = 'zwanga_default';
const isExpoGo = Constants.appOwnership === 'expo';

export async function requestPushPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') {
      return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.warn('Impossible de demander la permission push:', error);
    return false;
  }
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  // Créer le canal avec Notifee pour les notifications en background
  await notifee.createChannel({
    id: DEFAULT_CHANNEL_ID,
    name: 'Notifications Zwanga',
    importance: 4, // AndroidImportance.HIGH
    vibration: true,
  });

  // Créer aussi le canal avec expo-notifications pour compatibilité
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Notifications Zwanga',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

async function getExpoProjectId(): Promise<string | undefined> {
  const expoConfig: any = Constants.expoConfig ?? Constants.manifest2?.extra;
  return (
    // Try multiple fallbacks, handling types that may lack "extra"
    (
      (expoConfig?.extra && expoConfig.extra.eas?.projectId) ??
      expoConfig?.projectId ??
      (Constants.manifest && (Constants.manifest as any).extra?.eas?.projectId)
    )
  );
}

export async function obtainFcmToken(): Promise<string | null> {
  const granted = await requestPushPermissions();
  if (!granted) {
    return null;
  }

  if (isExpoGo) {
    console.warn(
      'Expo Go ne supporte pas les notifications push distantes depuis SDK 53. Utilisez un build de développement ou un build EAS.',
    );
    return null;
  }

  await ensureAndroidChannel();

  try {
    if (Platform.OS === 'android') {
      const devicePushToken = await Notifications.getDevicePushTokenAsync();
      const token = devicePushToken?.data ?? null;
      if (token) {
        const stored = await getStoredFcmToken();
        if (stored !== token) {
          await storeFcmToken(token);
        }
        return token;
      }
    }

    const projectId = await getExpoProjectId();
    const expoPushTokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const expoToken = expoPushTokenResponse?.data ?? null;
    if (expoToken) {
      const stored = await getStoredFcmToken();
      if (stored !== expoToken) {
        await storeFcmToken(expoToken);
      }
    }
    return expoToken;
  } catch (error) {
    console.warn('Erreur lors de la récupération du token push:', error);
    return null;
  }
}

export function subscribeToFcmRefresh(): (() => void) | undefined {
  console.warn('La mise à jour automatique du token n’est pas supportée sur Expo Go.');
  return undefined;
}

export async function clearStoredFcmToken(): Promise<void> {
  await removeFcmToken();
}

/**
 * Affiche une notification avec Notifee (fonctionne en background)
 */
export async function displayNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<string | null> {
  try {
    await ensureAndroidChannel();

    // Notifee utilise une structure différente pour les données
    const notificationData: any = {
      title,
      body,
      android: {
        channelId: DEFAULT_CHANNEL_ID,
        pressAction: {
          id: 'default',
        },
        // Utiliser l'icône de notification générée par Expo
        // Expo génère automatiquement 'ic_notification' à partir de l'icône configurée dans app.config.js
        // Cette icône est optimisée pour les notifications Android (monochrome, taille appropriée)
        smallIcon: 'ic_notification',
        // Grande icône (optionnel) - utilise l'icône de l'app
        largeIcon: 'ic_launcher',
      },
      ios: {
        sound: 'default',
      },
    };

    // Ajouter les données personnalisées si disponibles
    if (data && Object.keys(data).length > 0) {
      // Les données peuvent être passées via les propriétés de la notification
      // ou stockées séparément pour être récupérées lors du clic
      notificationData.data = data;
    }

    const notificationId = await notifee.displayNotification(notificationData);

    return notificationId;
  } catch (error) {
    console.warn('Erreur lors de l\'affichage de la notification:', error);
    return null;
  }
}

/**
 * Configure les handlers de notifications en foreground avec Notifee
 * Cette fonction doit être appelée au démarrage de l'application
 * Note: onBackgroundEvent doit être appelé au niveau racine (dans NotificationHandler.tsx)
 */
export function setupForegroundNotificationHandlers(
  onNotificationPress?: (data: Record<string, any>) => void,
): () => void {
  if (isExpoGo) {
    // Notifee n'est pas disponible dans Expo Go
    return () => {};
  }

  try {
    // Handler pour les notifications pressées en foreground avec Notifee
    const unsubscribeForeground = notifee.onForegroundEvent(async ({ type, detail }) => {
      console.log('[Notifee] Foreground event:', type, detail);
      
      if (type === 1) { // EventType.PRESS
        // Notification pressée
        const data = detail.notification?.data || {};
        console.log('[Notifee] Notification pressée en foreground:', data);
        
        if (onNotificationPress) {
          onNotificationPress(data);
        }
      } else if (type === 2) { // EventType.ACTION_PRESS
        // Action pressée (si des actions sont définies)
        const actionId = detail.pressAction?.id;
        const data = detail.notification?.data || {};
        console.log('[Notifee] Action pressée en foreground:', actionId, data);
        
        if (onNotificationPress) {
          onNotificationPress(data);
        }
      }
    });

    // Retourner une fonction de nettoyage
    return () => {
      try {
        unsubscribeForeground();
      } catch (error) {
        console.warn('Erreur lors du nettoyage du handler Notifee foreground:', error);
      }
    };
  } catch (error) {
    console.warn('Erreur lors de la configuration du handler Notifee foreground:', error);
    return () => {};
  }
}

/**
 * Traite une notification FCM reçue et l'affiche avec Notifee
 * Cette fonction doit être appelée quand une notification est reçue depuis FCM
 */
export async function handleIncomingNotification(
  notification: Notifications.Notification,
): Promise<void> {
  try {
    // Vérifier que la notification a une structure valide
    if (!notification || !notification.request || !notification.request.content) {
      console.warn('Notification invalide reçue (structure manquante):', notification);
      return;
    }

    const { title, body, data } = notification.request.content;

    // Afficher la notification avec Notifee (fonctionne même en background)
    await displayNotification(
      title || 'Zwanga',
      body || '',
      data as Record<string, any>,
    );
  } catch (error) {
    console.warn('Erreur lors du traitement de la notification entrante:', error);
  }
}

