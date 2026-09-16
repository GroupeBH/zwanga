/**
 * Enregistrement du foreground service Notifee (Android)
 * Nécessaire quand on utilise `android.asForegroundService`
 */

// Types Notifee (chargés dynamiquement pour éviter les plantages si indisponibles)
type NotifeeModule = typeof import('@notifee/react-native');
type NotifeeDefault = NotifeeModule['default'];

let notifee: NotifeeDefault | null = null;
let registerForegroundService: ((handler: (notification: any) => Promise<void>) => void) | null = null;

try {
  const notifeeModule = require('@notifee/react-native') as any;
  notifee = notifeeModule.default ?? (notifeeModule as NotifeeDefault);
  registerForegroundService =
    notifeeModule.registerForegroundService ??
    notifee?.registerForegroundService ??
    null;
} catch (error) {
  console.warn('[NotifeeForegroundService] Notifee non disponible');
}

if (registerForegroundService) {
  registerForegroundService((notification: any) => {
    console.log('[NotifeeForegroundService] Foreground service actif:', notification?.id);
    return new Promise(() => {
      // Garder le service en vie tant que la notification est active
    });
  });
}

export {};
