import {
    ensureAndroidChannel,
    handleIncomingNotification,
    setupForegroundNotificationHandlers,
} from '@/services/pushNotifications';
import { registerBackgroundNotificationTask } from '@/services/backgroundNotificationTask';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
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

    // Fonction helper pour extraire l'ID du trip-request depuis différentes structures de données
    const extractTripRequestId = (data: Record<string, any>): string | null => {
      // Chercher dans différentes variantes possibles
      if (data.requestId) return String(data.requestId);
      if (data.tripRequestId) return String(data.tripRequestId);
      if (data.trip_request_id) return String(data.trip_request_id);
      if (data.tripRequest?.id) return String(data.tripRequest.id);
      if (data.trip_request?.id) return String(data.trip_request.id);
      if (data.data?.requestId) return String(data.data.requestId);
      if (data.data?.tripRequestId) return String(data.data.tripRequestId);
      if (data.data?.trip_request_id) return String(data.data.trip_request_id);
      if (data.data?.tripRequest?.id) return String(data.data.tripRequest.id);
      if (data.data?.trip_request?.id) return String(data.data.trip_request.id);
      
      // Log pour déboguer si aucun ID trouvé
      console.log('[NotificationHandler] Aucun ID de trip-request trouvé dans:', data);
      return null;
    };

    // Fonction pour déterminer si l'utilisateur connecté est le conducteur du trajet
    const isUserDriverOfTrip = (data: Record<string, any>): boolean => {
      if (!currentUser?.id) return false;
      
      // Extraire tripId de différentes variantes
      const tripId = data?.tripId || data?.trip?.id || data?.data?.tripId || data?.data?.trip?.id;
      
      // Vérifier si la notification est destinée à un conducteur via role
      const role = data?.role || data?.data?.role;
      if (role === 'driver') {
        console.log('[NotificationHandler] Notification destinée à un conducteur (role=driver)');
        // Si on a un tripId, c'est probablement pour un trajet que le conducteur a publié
        if (tripId) {
          return true;
        }
      }
      
      // Vérifier driverId dans toutes les variantes possibles de la structure
      const driverId = 
        data?.driverId || 
        data?.trip?.driverId || 
        data?.trip?.driver?.id ||
        data?.data?.driverId || 
        data?.data?.trip?.driverId ||
        data?.data?.trip?.driver?.id;
      
      if (driverId) {
        const isDriver = String(driverId) === String(currentUser.id);
        console.log('[NotificationHandler] isUserDriverOfTrip check:', {
          tripId,
          driverId,
          currentUserId: currentUser.id,
          isDriver,
          role,
        });
        return isDriver;
      }
      
      // Si role=driver mais pas de driverId, on assume que c'est pour le conducteur connecté
      if (role === 'driver' && tripId) {
        console.log('[NotificationHandler] Notification pour conducteur (role=driver) - redirection vers manage');
        return true;
      }
      
      console.log('[NotificationHandler] driverId et role non trouvés dans les données de notification');
      return false;
    };

    // Fonction pour déterminer l'URL du trajet (manage ou détail)
    const getTripUrl = (tripId: string, data: Record<string, any>, type?: string): string => {
      // Vérifier si la notification est destinée à un conducteur via role
      const role = data?.role || data?.data?.role;
      
      // Si role=driver, rediriger vers la page de gestion
      if (role === 'driver') {
        console.log('[NotificationHandler] Notification pour conducteur (role=driver) - redirection vers trip/manage');
        return `/trip/manage/${tripId}`;
      }
      
      // Si l'utilisateur est le conducteur du trajet (vérifié via driverId), rediriger vers la page de gestion
      if (isUserDriverOfTrip(data)) {
        console.log('[NotificationHandler] Utilisateur est conducteur - redirection vers trip/manage');
        return `/trip/manage/${tripId}`;
      }
      
      // Si c'est une notification explicitement pour un conducteur, rediriger vers la page de gestion
      // (même si driverId n'est pas dans les données, les notifications pour conducteurs sont envoyées au conducteur)
      if (type && isDriverNotification(type)) {
        console.log('[NotificationHandler] Notification pour conducteur (type) - redirection vers trip/manage');
        return `/trip/manage/${tripId}`;
      }
      
      // Sinon, rediriger vers la page de détail
      console.log('[NotificationHandler] Redirection vers trip/[id] (vue publique)');
      return `/trip/${tripId}`;
    };

    // Fonction pour détecter si c'est une notification explicitement pour un conducteur
    const isDriverNotification = (type: string): boolean => {
      const driverTypes = [
        'trip_expiring',
        'driver_reminder',
        'booking_pending', // Une nouvelle réservation pour le conducteur
        'trip_starting_soon',
      ];
      return driverTypes.includes(type);
    };

    // Fonction pour naviguer selon le type de notification
    const handleNotificationPress = (data: Record<string, any>) => {
      try {
        const { type, tripId, bookingId, conversationId } = data;
        
        // Extraire l'ID du trip-request de manière robuste
        const requestId = extractTripRequestId(data);
        
        // Log pour déboguer
        console.log('[NotificationHandler] Notification pressée:', { type, tripId, bookingId, conversationId, requestId, data });

        // Attendre que l'app soit prête avant de naviguer (réduit à 100ms pour une réponse plus rapide)
        setTimeout(() => {
          // Gérer les notifications de trajets
          if (type === 'trip' || type === 'trip_update') {
            if (tripId) {
              router.push(getTripUrl(tripId, data, type));
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
              router.push(getTripUrl(tripId, data, type));
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

          // Gérer les notifications explicitement pour conducteurs
          if (isDriverNotification(type) && tripId) {
            router.push(`/trip/manage/${tripId}`);
            return;
          }

          // Gérer les notifications de demandes de trajet
          // Gérer les variantes avec underscore et tiret
          const isTripRequestType = 
            type === 'trip_request' ||
            type === 'trip-request' ||
            type === 'trip_request_accepted' ||
            type === 'trip-request-accepted' ||
            type === 'trip_request_rejected' ||
            type === 'trip-request-rejected' ||
            type === 'trip_request_cancelled' ||
            type === 'trip-request-cancelled' ||
            type === 'trip_request_pending' ||
            type === 'trip-request-pending' ||
            type === 'new_trip_request' ||
            type === 'new-trip-request' ||
            type === 'trip_request_new' ||
            type === 'trip-request-new' ||
            (typeof type === 'string' && type.toLowerCase().includes('trip') && type.toLowerCase().includes('request'));
          
          if (isTripRequestType) {
            console.log('[NotificationHandler] Notification de demande de trajet détectée, requestId:', requestId);
            if (requestId) {
              console.log('[NotificationHandler] Navigation vers /request/' + requestId);
              try {
                router.push({
                  pathname: '/request/[id]',
                  params: { id: requestId },
                });
              } catch (error) {
                console.error('[NotificationHandler] Erreur lors de la navigation:', error);
                // Fallback avec le format direct
                router.push(`/request/${requestId}`);
              }
              return;
            } else if (tripId) {
              // Si une demande a créé un trajet, naviguer vers le trajet
              console.log('[NotificationHandler] Navigation vers /trip/' + tripId);
              router.push(`/trip/${tripId}`);
              return;
            }
            console.warn('[NotificationHandler] Notification de demande de trajet sans requestId ni tripId');
            // Si c'est une notification de demande de trajet mais sans ID, ne rien faire
            return;
          }

          // Gérer les notifications d'avis
          if (type === 'rate' || type === 'review') {
            if (tripId) {
              router.push(`/rate/${tripId}`);
              return;
            }
          }

          // Fallback : naviguer selon les IDs disponibles même sans type spécifique
          // Vérifier requestId AVANT tripId pour éviter de naviguer vers un trajet au lieu d'une demande
          // Ré-extraire l'ID au cas où il n'aurait pas été trouvé précédemment
          const fallbackRequestId = requestId || extractTripRequestId(data);
          if (fallbackRequestId) {
            console.log('[NotificationHandler] Fallback: Navigation vers /request/' + fallbackRequestId);
            try {
              router.push({
                pathname: '/request/[id]',
                params: { id: fallbackRequestId },
              });
            } catch (error) {
              console.error('[NotificationHandler] Erreur lors de la navigation (fallback):', error);
              // Fallback avec le format direct
              router.push(`/request/${fallbackRequestId}`);
            }
            return;
          }
          if (tripId) {
            router.push(getTripUrl(tripId, data, type));
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
        }, 100);
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
          const targetUrl = getTripUrl(tripId, linkData);
          
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
  }, [router]);

  // Ce composant ne rend rien
  return null;
}

