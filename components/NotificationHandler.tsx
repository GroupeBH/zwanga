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
        const { type, tripId, bookingId, conversationId, requestId } = data;

        // Attendre que l'app soit prête avant de naviguer
        setTimeout(() => {
          // Gérer les notifications de trajets
          if (type === 'trip' || type === 'trip_update') {
            if (tripId) {
              router.push(`/trip/${tripId}`);
              return;
            }
          }

          // Gérer les notifications de réservations
          if (
            type === 'booking' ||
            type === 'booking_accepted' ||
            type === 'booking_rejected' ||
            type === 'booking_cancelled' ||
            type === 'booking_pending'
          ) {
            if (tripId) {
              router.push(`/trip/${tripId}`);
              return;
            } else if (bookingId) {
              router.push('/bookings');
              return;
            }
          }

          // Gérer les notifications de messages
          if (type === 'message' || type === 'chat') {
            if (conversationId) {
              router.push({
                pathname: '/chat/[id]',
                params: { id: conversationId },
              });
              return;
            }
          }

          // Gérer les notifications de gestion de trajet
          if (type === 'trip_manage') {
            if (tripId) {
              router.push(`/trip/manage/${tripId}`);
              return;
            }
          }

          // Gérer les notifications de demandes de trajet
          if (
            type === 'trip_request' ||
            type === 'trip_request_accepted' ||
            type === 'trip_request_rejected' ||
            type === 'trip_request_cancelled' ||
            type === 'trip_request_pending'
          ) {
            if (requestId) {
              router.push(`/request/${requestId}`);
              return;
            } else if (tripId) {
              // Si une demande a créé un trajet, naviguer vers le trajet
              router.push(`/trip/${tripId}`);
              return;
            }
          }

          // Gérer les notifications d'avis
          if (type === 'rate' || type === 'review') {
            if (tripId) {
              router.push(`/rate/${tripId}`);
              return;
            }
          }

          // Fallback : naviguer selon les IDs disponibles même sans type spécifique
          if (tripId) {
            router.push(`/trip/${tripId}`);
            return;
          }
          if (requestId) {
            router.push(`/request/${requestId}`);
            return;
          }
          if (conversationId) {
            router.push({
              pathname: '/chat/[id]',
              params: { id: conversationId },
            });
            return;
          }
          if (bookingId) {
            router.push('/bookings');
            return;
          }

          // Par défaut, ouvrir l'app sur l'écran principal
          router.push('/(tabs)');
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
      // Format attendu: zwanga://trip/123, zwanga://trip/123?track=true, zwanga://chat/456, zwanga://request/789, zwanga://bookings, etc.
      try {
        const route = url.replace('zwanga://', '');
        
        // Fonction helper pour parser les paramètres de requête
        const parseQueryParams = (queryString: string): Record<string, string> => {
          const params: Record<string, string> = {};
          if (queryString) {
            queryString.split('&').forEach((param) => {
              const [key, value] = param.split('=');
              if (key && value) {
                params[key] = decodeURIComponent(value);
              }
            });
          }
          return params;
        };

        if (route.startsWith('trip/')) {
          // Extraire l'ID et les paramètres de requête
          const parts = route.replace('trip/', '').split('?');
          const tripId = parts[0];
          const params = parseQueryParams(parts[1] || '');
          
          // Naviguer vers le trajet avec les paramètres
          router.push({
            pathname: '/trip/[id]',
            params: { id: tripId, ...params },
          });
        } else if (route.startsWith('chat/')) {
          const conversationId = route.replace('chat/', '').split('?')[0];
          router.push({
            pathname: '/chat/[id]',
            params: { id: conversationId },
          });
        } else if (route.startsWith('request/')) {
          const requestId = route.replace('request/', '').split('?')[0];
          router.push({
            pathname: '/request/[id]',
            params: { id: requestId },
          });
        } else if (route.startsWith('bookings')) {
          router.push('/bookings');
        } else if (route.startsWith('trip/manage/')) {
          const tripId = route.replace('trip/manage/', '').split('?')[0];
          router.push({
            pathname: '/trip/manage/[id]',
            params: { id: tripId },
          });
        } else if (route.startsWith('rate/')) {
          const tripId = route.replace('rate/', '').split('?')[0];
          router.push({
            pathname: '/rate/[id]',
            params: { id: tripId },
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

