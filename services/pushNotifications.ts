import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { getStoredFcmToken, removeFcmToken, storeFcmToken } from './tokenStorage';
import { createPushRegistrationAttempt } from './pushRegistrationAttempt';

const DEFAULT_CHANNEL_ID = 'zwanga_default';
const isExpoGo = Constants.appOwnership === 'expo';

type NotifeeModule = typeof import('@notifee/react-native');
type NotifeeDefault = NotifeeModule['default'];
type NotifeeEventType = { PRESS?: number; ACTION_PRESS?: number };

let cachedNotifee: NotifeeDefault | null | undefined;
let cachedEventType: NotifeeEventType | null | undefined;

function getNotifeeRuntime(): {
  notifee: NotifeeDefault | null;
  eventType: NotifeeEventType | null;
} {
  if (cachedNotifee !== undefined) {
    return {
      notifee: cachedNotifee,
      eventType: cachedEventType ?? null,
    };
  }

  try {
    const notifeeModule = require('@notifee/react-native') as NotifeeModule & {
      EventType?: NotifeeEventType;
    };
    cachedNotifee =
      (notifeeModule.default as NotifeeDefault) ??
      (notifeeModule as unknown as NotifeeDefault);
    cachedEventType = notifeeModule.EventType ?? null;
  } catch {
    cachedNotifee = null;
    cachedEventType = null;
    console.warn('[pushNotifications] Notifee unavailable, using expo-notifications fallback.');
  }

  return {
    notifee: cachedNotifee,
    eventType: cachedEventType,
  };
}

let pendingPermission: Promise<boolean> | null = null;
let pendingPrompt: ReturnType<typeof Notifications.requestPermissionsAsync> | null = null;
let permissionPromptCompleted = false;

async function resolvePushPermission(): Promise<boolean> {
  const attempt = createPushRegistrationAttempt();
  try {
    const permission = await attempt.wait(() => Notifications.getPermissionsAsync());
    if (permission.status === 'granted') {
      return true;
    }
    // Android can report denied + canAskAgain on a fresh installation. Do not
    // mistake that for a permanent denial. Never prompt from a background task
    // or repeat a completed prompt on each registration retry.
    if (permission.canAskAgain === false || permissionPromptCompleted || AppState.currentState !== 'active') {
      return false;
    }
    // Do not open a second OS dialog if the user is still deciding after timeout.
    const prompt = pendingPrompt ?? (pendingPrompt = Notifications.requestPermissionsAsync());
    const { status } = await attempt.wait(() => prompt.then(result => {
      permissionPromptCompleted = true;
      if (pendingPrompt === prompt) pendingPrompt = null;
      return result;
    }, error => {
      if (pendingPrompt === prompt) pendingPrompt = null;
      throw error;
    }));
    return status === 'granted';
  } catch {
    // A native failure is not a user choice: the foreground registration loop
    // can try again without requiring a visit to a settings screen.
    console.warn('[Push] Autorisation non vérifiée ; nouvelle tentative différée.');
    return false;
  } finally { attempt.finish(); }
}

export async function requestPushPermissions(): Promise<boolean> {
  const request = pendingPermission ?? (pendingPermission = resolvePushPermission());
  try { return await request; }
  finally { if (pendingPermission === request) pendingPermission = null; }
}

export async function ensureAndroidChannel(options?: {
  includeNotifee?: boolean;
}): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  // Do not load Notifee during app boot unless explicitly requested.
  if (options?.includeNotifee) {
    const { notifee } = getNotifeeRuntime();
    if (notifee) {
      try {
        await notifee.createChannel({
          id: DEFAULT_CHANNEL_ID,
          name: 'Notifications Zwanga',
          importance: 4,
          vibration: true,
        });
      } catch (error) {
        console.warn('[pushNotifications] Failed to create Notifee channel:', error);
      }
    }
  }

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
    (expoConfig?.extra && expoConfig.extra.eas?.projectId) ??
    expoConfig?.projectId ??
    (Constants.manifest && (Constants.manifest as any).extra?.eas?.projectId)
  );
}

export async function obtainFcmToken(options?: { requestPermission?: boolean }): Promise<string | null> {
  if (isExpoGo) {
    console.warn('Expo Go does not support remote push from SDK 53. Use a dev build or EAS build.');
    return null;
  }
  // Prepare Android before the OS permission prompt or token lookup, not only
  // after permission was granted. This setup is automatic after authentication.
  await ensureAndroidChannel();
  const granted = options?.requestPermission === false
    ? (await Notifications.getPermissionsAsync()).status === 'granted'
    : await requestPushPermissions();
  if (!granted) {
    return null;
  }

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

    if (Platform.OS === 'ios') {
      const { obtainIosFirebaseToken } = await import('./iosFirebaseMessaging');
      const firebaseToken = await obtainIosFirebaseToken();
      if (firebaseToken) { await storeFcmToken(firebaseToken); return firebaseToken; }
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

export function subscribeToFcmRefresh(
  onTokenRefresh: (token: string) => void | Promise<void>,
): () => void {
  if (isExpoGo) {
    return () => {};
  }

  const subscription = Notifications.addPushTokenListener(() => {
    // Sur iOS, l'événement contient le token APNs natif alors que Zwanga
    // enregistre un ExpoPushToken. On recalcule donc le token transportable
    // au lieu de transmettre aveuglément la valeur native au backend.
    void obtainFcmToken({ requestPermission: false })
      .then(async (token) => {
        if (token) {
          await onTokenRefresh(token);
        }
      })
      .catch((error) => {
        console.warn('Unable to refresh push token:', error);
      });
  });

  let disposed = false;
  let stopFirebase = () => {};
  if (Platform.OS === 'ios') void import('./iosFirebaseMessaging').then(module => {
    if (!disposed) stopFirebase = module.subscribeIosFirebaseToken(onTokenRefresh);
  }).catch(() => {});
  return () => { disposed = true; stopFirebase(); subscription.remove(); };
}

export async function clearStoredFcmToken(): Promise<void> {
  await removeFcmToken();
}

export async function displayNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<string | null> {
  try {
    await ensureAndroidChannel({ includeNotifee: true });

    const { notifee } = getNotifeeRuntime();

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

    const notificationId = await notifee.displayNotification({
      title,
      body,
      data,
      android: {
        channelId: DEFAULT_CHANNEL_ID,
        pressAction: {
          id: 'default',
        },
        smallIcon: 'notification_icon',
        largeIcon: 'ic_launcher',
      },
      ios: {
        sound: 'default',
      },
    });

    return notificationId;
  } catch (error) {
    console.warn('Error while displaying notification:', error);
    return null;
  }
}

export function setupForegroundNotificationHandlers(
  onNotificationPress?: (data: Record<string, any>) => void,
): () => void {
  if (isExpoGo) {
    return () => {};
  }

  const { notifee, eventType } = getNotifeeRuntime();
  if (!notifee) {
    return () => {};
  }

  try {
    const unsubscribeForeground = notifee.onForegroundEvent(async ({ type, detail }: any) => {
      console.log('[Notifee] Foreground event:', type, detail);

      if (type === (eventType?.PRESS ?? 1)) {
        const data = detail?.notification?.data || {};
        if (onNotificationPress) {
          onNotificationPress(data);
        }
      } else if (type === (eventType?.ACTION_PRESS ?? 2)) {
        const data = detail?.notification?.data || {};
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

export async function handleIncomingNotification(
  notification: Notifications.Notification,
): Promise<void> {
  try {
    if (!notification || !notification.request || !notification.request.content) {
      console.warn('Invalid notification payload:', notification);
      return;
    }

    const { title, body, data } = notification.request.content;

    await displayNotification(title || 'Zwanga', body || '', data as Record<string, any>);
  } catch (error) {
    console.warn('Error while processing incoming notification:', error);
  }
}
