import {
    ensureAndroidChannel,
    handleIncomingNotification,
    setupForegroundNotificationHandlers,
} from '@/services/pushNotifications';
import { registerBackgroundNotificationTask } from '@/services/backgroundNotificationTask';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';

/**
 * Composant pour gérer les notifications push et la navigation
 * Doit être monté une seule fois dans l'application (dans ReduxProvider ou _layout)
 */
export function NotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    // Configurer le comportement des notifications
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Créer le canal Android
    ensureAndroidChannel();

    // Enregistrer la tâche de fond pour les notifications push
    registerBackgroundNotificationTask().catch((error) => {
      console.warn('Erreur lors de l\'enregistrement de la tâche de fond:', error);
    });

    // Fonction pour naviguer selon le type de notification
    const handleNotificationPress = (data: Record<string, any>) => {
      try {
        const { type, tripId, bookingId, conversationId, userId } = data;

        // Attendre que l'app soit prête avant de naviguer
        setTimeout(() => {
          switch (type) {
            case 'trip':
            case 'trip_update':
              if (tripId) {
                router.push(`/trip/${tripId}`);
              }
              break;

            case 'booking':
            case 'booking_accepted':
            case 'booking_rejected':
            case 'booking_cancelled':
              if (tripId) {
                router.push(`/trip/${tripId}`);
              } else if (bookingId) {
                // Si on a seulement le bookingId, on peut naviguer vers les bookings
                router.push('/bookings');
              }
              break;

            case 'message':
            case 'chat':
              if (conversationId) {
                router.push({
                  pathname: '/chat/[id]',
                  params: { id: conversationId },
                });
              }
              break;

            case 'trip_manage':
              if (tripId) {
                router.push(`/trip/manage/${tripId}`);
              }
              break;

            case 'rate':
            case 'review':
              if (tripId) {
                router.push(`/rate/${tripId}`);
              }
              break;

            default:
              // Par défaut, ouvrir l'app sur l'écran principal
              router.push('/(tabs)');
              break;
          }
        }, 300);
      } catch (error) {
        console.warn('Erreur lors de la navigation depuis la notification:', error);
      }
    };

    // Configurer les handlers Notifee pour les notifications en foreground
    const cleanupNotifee = setupForegroundNotificationHandlers(handleNotificationPress);

    // Handler pour les notifications reçues en background avec Notifee
    // Note: onBackgroundEvent doit être appelé au niveau racine (hors composant React)
    // Pour l'instant, on utilise expo-notifications pour gérer les notifications en background
    // Les notifications affichées avec Notifee seront gérées par le handler de réponse d'expo-notifications

    // Handler pour les notifications pressées en foreground (via expo-notifications)
    // Les notifications affichées avec Notifee seront gérées par le handler de réponse

    // Handler pour les notifications reçues quand l'app est en foreground (expo-notifications)
    // Intercepter les notifications FCM et les afficher avec Notifee
    const notificationListener = Notifications.addNotificationReceivedListener(async (notification) => {
      // Traiter la notification et l'afficher avec Notifee
      await handleIncomingNotification(notification);
    });

    // Handler pour les notifications pressées (expo-notifications)
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      handleNotificationPress(data);
    });

    // Handler pour les deep links (quand l'app est ouverte depuis une notification)
    const linkingListener = Linking.addEventListener('url', (event) => {
      const { url } = event;
      // Parser l'URL et naviguer si nécessaire
      // Format attendu: zwanga://trip/123, zwanga://chat/456, etc.
      try {
        const route = url.replace('zwanga://', '');
        if (route.startsWith('trip/')) {
          const tripId = route.replace('trip/', '');
          router.push(`/trip/${tripId}`);
        } else if (route.startsWith('chat/')) {
          const conversationId = route.replace('chat/', '');
          router.push({
            pathname: '/chat/[id]',
            params: { id: conversationId },
          });
        }
      } catch (error) {
        console.warn('Erreur lors du traitement du deep link:', error);
      }
    });

    // Nettoyage
    return () => {
      cleanupNotifee();
      notificationListener.remove();
      responseListener.remove();
      linkingListener.remove();
    };
  }, [router]);

  // Ce composant ne rend rien
  return null;
}

