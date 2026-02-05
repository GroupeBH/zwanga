import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getStoredFcmToken, removeFcmToken, storeFcmToken } from './tokenStorage';

const DEFAULT_CHANNEL_ID = 'zwanga_default';
const isExpoGo = Constants.appOwnership === 'expo';

// Load Notifee dynamically to avoid startup crashes when native module is unavailable.
type NotifeeModule = typeof import('@notifee/react-native');
type NotifeeDefault = NotifeeModule['default'];

let notifee: NotifeeDefault | null = null;
let notifeeEventType: { PRESS?: number; ACTION_PRESS?: number } | null = null;

try {
  const notifeeModule = require('@notifee/react-native') as NotifeeModule & {
    EventType?: { PRESS?: number; ACTION_PRESS?: number };
  };
  notifee = notifeeModule.default ?? (notifeeModule as unknown as NotifeeDefault);
  notifeeEventType = notifeeModule.EventType ?? null;
} catch (error) {
  console.warn('[pushNotifications] Notifee unavailable, using expo-notifications fallback.');
}

export async function requestPushPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') {
      return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.warn('Cannot request push permission:', error);
    return false;
  }
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  // Notifee channel (optional)
  if (notifee) {
    try {
      await notifee.createChannel({
        id: DEFAULT_CHANNEL_ID,
        name: 'Notifications Zwanga',
        importance: 4, // AndroidImportance.HIGH
        vibration: true,
      });
    } catch (error) {
      console.warn('[pushNotifications] Failed to create Notifee channel:', error);
    }
  }

  // Expo notifications channel (always attempted)
  try {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: 'Notifications Zwanga',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  } catch (error) {
    console.warn('[pushNotifications] Failed to create expo channel:', error);
  }
}

async function getExpoProjectId(): Promise<string | undefined> {
  const expoConfig: any = Constants.expoConfig ?? Constants.manifest2?.extra;
  return (
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
      'Expo Go does not support remote push from SDK 53. Use a dev build or EAS build.',
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
    console.warn('Error while retrieving push token:', error);
    return null;
  }
}

export function subscribeToFcmRefresh(): (() => void) | undefined {
  console.warn('Automatic token refresh is not supported in Expo Go.');
  return undefined;
}

export async function clearStoredFcmToken(): Promise<void> {
  await removeFcmToken();
}

/**
 * Display a notification with Notifee when available.
 * Fallback to expo-notifications local notification otherwise.
 */
export async function displayNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<string | null> {
  try {
    await ensureAndroidChannel();

    if (!notifee) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
        },
        trigger: null,
      });
      return id;
    }

    const notificationData: any = {
      title,
      body,
      android: {
        channelId: DEFAULT_CHANNEL_ID,
        pressAction: {
          id: 'default',
        },
        smallIcon: 'ic_notification',
        largeIcon: 'ic_launcher',
      },
      ios: {
        sound: 'default',
      },
    };

    if (data && Object.keys(data).length > 0) {
      notificationData.data = data;
    }

    const notificationId = await notifee.displayNotification(notificationData);
    return notificationId;
  } catch (error) {
    console.warn('Error while displaying notification:', error);
    return null;
  }
}

/**
 * Configure foreground notification handlers with Notifee.
 */
export function setupForegroundNotificationHandlers(
  onNotificationPress?: (data: Record<string, any>) => void,
): () => void {
  if (isExpoGo || !notifee) {
    return () => {};
  }

  try {
    const unsubscribeForeground = notifee.onForegroundEvent(async ({ type, detail }) => {
      console.log('[Notifee] Foreground event:', type, detail);

      if (type === (notifeeEventType?.PRESS ?? 1)) {
        const data = detail.notification?.data || {};
        console.log('[Notifee] Notification pressed in foreground:', data);

        if (onNotificationPress) {
          onNotificationPress(data);
        }
      } else if (type === (notifeeEventType?.ACTION_PRESS ?? 2)) {
        const actionId = detail.pressAction?.id;
        const data = detail.notification?.data || {};
        console.log('[Notifee] Action pressed in foreground:', actionId, data);

        if (onNotificationPress) {
          onNotificationPress(data);
        }
      }
    });

    return () => {
      try {
        unsubscribeForeground();
      } catch (error) {
        console.warn('Error while cleaning Notifee foreground handler:', error);
      }
    };
  } catch (error) {
    console.warn('Error while configuring Notifee foreground handler:', error);
    return () => {};
  }
}

/**
 * Process an incoming notification and display it.
 */
export async function handleIncomingNotification(
  notification: Notifications.Notification,
): Promise<void> {
  try {
    if (!notification || !notification.request || !notification.request.content) {
      console.warn('Invalid notification payload:', notification);
      return;
    }

    const { title, body, data } = notification.request.content;

    await displayNotification(
      title || 'Zwanga',
      body || '',
      data as Record<string, any>,
    );
  } catch (error) {
    console.warn('Error while processing incoming notification:', error);
  }
}
