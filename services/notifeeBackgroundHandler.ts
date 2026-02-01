/**
 * Handler d'événements en arrière-plan pour Notifee
 * Ce fichier doit être importé au niveau racine de l'application (_layout.tsx)
 * pour que les événements de notification soient gérés même quand l'app est fermée
 */

import { Linking } from 'react-native';
import { ONGOING_TRIP_NOTIFICATION_ID } from './ongoingTripNotification';

// Types Notifee
type NotifeeModule = typeof import('@notifee/react-native');
type NotifeeDefault = NotifeeModule['default'];
type EventType = NotifeeModule['EventType'];

let notifee: NotifeeDefault | null = null;
let EventTypeEnum: typeof EventType | null = null;

// Charger Notifee dynamiquement
try {
  const notifeeModule = require('@notifee/react-native') as NotifeeModule;
  notifee = notifeeModule.default ?? (notifeeModule as unknown as NotifeeDefault);
  EventTypeEnum = notifeeModule.EventType;
} catch (error) {
  console.warn('[NotifeeBackgroundHandler] Notifee non disponible');
}

/**
 * Configure le handler d'événements en arrière-plan pour Notifee
 * Ce handler est appelé même quand l'app est complètement fermée
 */
if (notifee && EventTypeEnum) {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    console.log('[NotifeeBackgroundHandler] Background event:', type, detail);

    const { notification, pressAction } = detail;

    // Gérer les pressions sur les notifications
    if (type === EventTypeEnum!.PRESS || type === EventTypeEnum!.ACTION_PRESS) {
      const data = notification?.data || {};
      
      console.log('[NotifeeBackgroundHandler] Notification pressée en background:', data);

      // Pour les notifications de trajet en cours
      if (data.type === 'ongoing_trip' || notification?.id === ONGOING_TRIP_NOTIFICATION_ID) {
        const navigateTo = data.navigateTo as string | undefined;
        const tripId = data.tripId as string | undefined;
        const role = data.role as string | undefined;

        // Construire l'URL de deep link
        let deepLink = 'zwanga://';
        
        if (navigateTo) {
          // Convertir le chemin expo-router en deep link
          // Ex: /trip/manage/123 -> trip/manage/123
          deepLink += navigateTo.startsWith('/') ? navigateTo.slice(1) : navigateTo;
        } else if (tripId) {
          if (role === 'driver') {
            deepLink += `trip/manage/${tripId}`;
          } else {
            deepLink += `trip/${tripId}`;
          }
        }

        console.log('[NotifeeBackgroundHandler] Navigation via deep link:', deepLink);

        // Ouvrir l'app avec le deep link
        try {
          await Linking.openURL(deepLink);
        } catch (error) {
          console.error('[NotifeeBackgroundHandler] Erreur ouverture deep link:', error);
          // Fallback: ouvrir l'app simplement
          await Linking.openURL('zwanga://');
        }
        return;
      }

      // Pour les autres types de notifications, utiliser navigateTo ou les données standard
      const navigateTo = data.navigateTo as string | undefined;
      const tripId = data.tripId as string | undefined;
      const conversationId = data.conversationId as string | undefined;
      const requestId = data.requestId as string | undefined;

      let deepLink = 'zwanga://';

      if (navigateTo) {
        deepLink += navigateTo.startsWith('/') ? navigateTo.slice(1) : navigateTo;
      } else if (requestId) {
        deepLink += `request/${requestId}`;
      } else if (tripId) {
        // Déterminer si c'est un conducteur ou passager
        const role = data.role as string | undefined;
        if (role === 'driver') {
          deepLink += `trip/manage/${tripId}`;
        } else {
          deepLink += `trip/${tripId}`;
        }
      } else if (conversationId) {
        deepLink += `chat/${conversationId}`;
      }

      console.log('[NotifeeBackgroundHandler] Navigation via deep link:', deepLink);

      try {
        await Linking.openURL(deepLink);
      } catch (error) {
        console.error('[NotifeeBackgroundHandler] Erreur ouverture deep link:', error);
        await Linking.openURL('zwanga://');
      }
    }

    // Gérer les dismissals (optionnel)
    if (type === EventTypeEnum!.DISMISSED) {
      console.log('[NotifeeBackgroundHandler] Notification dismissed:', notification?.id);
      // Pas d'action spéciale pour l'instant
    }
  });

  console.log('[NotifeeBackgroundHandler] Background handler configuré');
}

export {};

