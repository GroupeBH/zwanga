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
    expoConfig?.extra?.eas?.projectId ??
    expoConfig?.projectId ??
    Constants.manifest?.extra?.eas?.projectId
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

