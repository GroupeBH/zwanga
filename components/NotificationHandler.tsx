import {
    ensureAndroidChannel,
    handleIncomingNotification,
    setupForegroundNotificationHandlers,
} from '@/services/pushNotifications';
import { registerBackgroundNotificationTask } from '@/services/backgroundNotificationTask';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { handleNotificationNavigation, getTripUrl } from '@/utils/notificationNavigation';
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
  const { data: currentUser } = useGetCurrentUserQuery();

  useEffect(() => {
    // Configurer le comportement des notifications expo-notifications
    // Désactiver l'affichage automatique en foreground car on utilise Notifee
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false, // Désactivé car on utilise Notifee pour afficher
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: false, // Désactivé car on utilise Notifee pour afficher
        shouldShowList: false, // Désactivé car on utilise Notifee pour afficher
      }),
    });

    // Créer le canal Android
    ensureAndroidChannel();

    // Enregistrer la tâche de fond pour les notifications push
    registerBackgroundNotificationTask().catch((error) => {
      console.warn('Erreur lors de l\'enregistrement de la tâche de fond:', error);
    });

    // Fonction pour naviguer selon le type de notification
    // Utilise la fonction utilitaire partagée pour garantir la cohérence avec les notifications in-app
    const handleNotificationPress = (data: Record<string, any>) => {
      handleNotificationNavigation(data, router, currentUser);
    };

    // Configurer les handlers Notifee pour les notifications en foreground
    // Cela gère les clics sur les notifications affichées avec Notifee
    const cleanupNotifee = setupForegroundNotificationHandlers(handleNotificationPress);

    // Handler pour les notifications reçues quand l'app est en foreground (expo-notifications)
    // Intercepter les notifications FCM et les afficher avec Notifee
    // Notifee gérera ensuite les clics via onForegroundEvent
    const notificationListener = Notifications.addNotificationReceivedListener(async (notification) => {
      console.log('[NotificationHandler] Notification reçue en foreground, affichage avec Notifee');
      // Traiter la notification et l'afficher avec Notifee
      await handleIncomingNotification(notification);
    });

    // Handler pour les notifications pressées en background (expo-notifications)
    // Ce handler est utilisé uniquement pour les notifications reçues en background
    // Les notifications en foreground sont gérées par Notifee via onForegroundEvent
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[NotificationHandler] Notification pressée en background (expo-notifications)');
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

        if (route.startsWith('trip/manage/')) {
          // Gérer explicitement les URLs trip/manage/
          const tripId = route.replace('trip/manage/', '').split('?')[0];
          router.push({
            pathname: '/trip/manage/[id]',
            params: { id: tripId },
          });
        } else if (route.startsWith('trip/')) {
          // Extraire l'ID et les paramètres de requête
          const parts = route.replace('trip/', '').split('?');
          const tripId = parts[0];
          const params = parseQueryParams(parts[1] || '');
          
          // Déterminer si c'est un lien vers manage ou détail
          // Créer un objet data pour passer à getTripUrl
          const linkData = {
            tripId,
            driverId: params.driverId, // Si le backend envoie le driverId dans l'URL
            ...params,
          };
          
          // Pour les deep links, on n'a pas le type de notification, donc on utilise seulement les données
          const targetUrl = getTripUrl(tripId, linkData, currentUser);
          
          // Naviguer vers l'URL appropriée
          if (targetUrl.includes('/trip/manage/')) {
            router.push({
              pathname: '/trip/manage/[id]',
              params: { id: tripId, ...params },
            });
          } else {
            router.push({
              pathname: '/trip/[id]',
              params: { id: tripId, ...params },
            });
          }
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
  }, [router, currentUser]);

  // Ce composant ne rend rien
  return null;
}

