import type { Router } from 'expo-router';
import type { User } from '@/types';

/**
 * Fonction helper pour extraire l'ID du trip-request depuis différentes structures de données
 */
export const extractTripRequestId = (data: Record<string, any>): string | null => {
  // Chercher dans différentes variantes possibles
  if (data?.requestId) return String(data.requestId);
  if (data?.tripRequestId) return String(data.tripRequestId);
  if (data?.trip_request_id) return String(data.trip_request_id);
  if (data?.tripRequest?.id) return String(data.tripRequest.id);
  if (data?.trip_request?.id) return String(data.trip_request.id);
  if (data?.data?.requestId) return String(data.data.requestId);
  if (data?.data?.tripRequestId) return String(data.data.tripRequestId);
  if (data?.data?.trip_request_id) return String(data.data.trip_request_id);
  if (data?.data?.tripRequest?.id) return String(data.data.tripRequest.id);
  if (data?.data?.trip_request?.id) return String(data.data.trip_request.id);
  
  // Log pour déboguer si aucun ID trouvé
  console.log('[notificationNavigation] Aucun ID de trip-request trouvé dans:', data);
  return null;
};

/**
 * Fonction pour déterminer si l'utilisateur connecté est le conducteur du trajet
 */
export const isUserDriverOfTrip = (data: Record<string, any>, currentUser: User | undefined): boolean => {
  if (!currentUser?.id) return false;
  
  // Extraire tripId de différentes variantes
  const tripId = data?.tripId || data?.trip?.id || data?.data?.tripId || data?.data?.trip?.id;
  
  // Vérifier si la notification est destinée à un conducteur via role
  const role = data?.role || data?.data?.role;
  if (role === 'driver') {
    console.log('[notificationNavigation] Notification destinée à un conducteur (role=driver)');
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
    console.log('[notificationNavigation] isUserDriverOfTrip check:', {
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
    console.log('[notificationNavigation] Notification pour conducteur (role=driver) - redirection vers manage');
    return true;
  }
  
  console.log('[notificationNavigation] driverId et role non trouvés dans les données de notification');
  return false;
};

/**
 * Fonction pour détecter si c'est une notification explicitement pour un conducteur
 */
export const isDriverNotification = (type: string): boolean => {
  const driverTypes = [
    'trip_expiring',
    'driver_reminder',
    'booking_pending', // Une nouvelle réservation pour le conducteur
    'trip_starting_soon',
  ];
  return driverTypes.includes(type);
};

/**
 * Fonction pour déterminer l'URL du trajet (manage ou détail)
 */
export const getTripUrl = (tripId: string, data: Record<string, any>, currentUser: User | undefined, type?: string): string => {
  // Vérifier si la notification est destinée à un conducteur via role
  const role = data?.role || data?.data?.role;
  
  // Si role=driver, rediriger vers la page de gestion
  if (role === 'driver') {
    console.log('[notificationNavigation] Notification pour conducteur (role=driver) - redirection vers trip/manage');
    return `/trip/manage/${tripId}`;
  }
  
  // Si l'utilisateur est le conducteur du trajet (vérifié via driverId), rediriger vers la page de gestion
  if (isUserDriverOfTrip(data, currentUser)) {
    console.log('[notificationNavigation] Utilisateur est conducteur - redirection vers trip/manage');
    return `/trip/manage/${tripId}`;
  }
  
  // Si c'est une notification explicitement pour un conducteur, rediriger vers la page de gestion
  // (même si driverId n'est pas dans les données, les notifications pour conducteurs sont envoyées au conducteur)
  if (type && isDriverNotification(type)) {
    console.log('[notificationNavigation] Notification pour conducteur (type) - redirection vers trip/manage');
    return `/trip/manage/${tripId}`;
  }
  
  // Sinon, rediriger vers la page de détail
  console.log('[notificationNavigation] Redirection vers trip/[id] (vue publique)');
  return `/trip/${tripId}`;
};

/**
 * Fonction principale pour naviguer selon le type de notification
 * Cette fonction est utilisée à la fois pour les notifications push (background/foreground) 
 * et pour les notifications in-app
 */
export const handleNotificationNavigation = (
  data: Record<string, any>,
  router: Router,
  currentUser: User | undefined
): void => {
  try {
    const { type, tripId, bookingId, conversationId } = data;
    
    // Extraire l'ID du trip-request de manière robuste
    const requestId = extractTripRequestId(data);
    
    // Log pour déboguer
    console.log('[notificationNavigation] Notification pressée:', { type, tripId, bookingId, conversationId, requestId, data });

    // Attendre que l'app soit prête avant de naviguer (réduit à 100ms pour une réponse plus rapide)
    setTimeout(() => {
      // Gérer les notifications de trajets
      if (type === 'trip' || type === 'trip_update') {
        if (tripId) {
          router.push(getTripUrl(tripId, data, currentUser, type) as any);
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
          router.push(getTripUrl(tripId, data, currentUser, type) as any);
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

      // Gérer les notifications de trajet en cours (notification permanente)
      if (type === 'ongoing_trip') {
        // Utiliser navigateTo si disponible (défini par ongoingTripNotification.ts)
        const navigateTo = data?.navigateTo;
        if (navigateTo) {
          router.push(navigateTo);
          return;
        }
        // Fallback: utiliser tripId et role
        if (tripId) {
          const role = data?.role;
          if (role === 'driver') {
            router.push(`/trip/manage/${tripId}`);
          } else {
            router.push(`/trip/${tripId}`);
          }
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
        console.log('[notificationNavigation] Notification de demande de trajet détectée, requestId:', requestId);
        if (requestId) {
          console.log('[notificationNavigation] Navigation vers /request/' + requestId);
          try {
            router.push({
              pathname: '/request/[id]',
              params: { id: requestId },
            });
          } catch (error) {
            console.error('[notificationNavigation] Erreur lors de la navigation:', error);
            // Fallback avec le format direct
            router.push(`/request/${requestId}`);
          }
          return;
        } else if (tripId) {
          // Si une demande a créé un trajet, naviguer vers le trajet
          console.log('[notificationNavigation] Navigation vers /trip/' + tripId);
          router.push(getTripUrl(tripId, data, currentUser, type) as any);
          return;
        }
        console.warn('[notificationNavigation] Notification de demande de trajet sans requestId ni tripId');
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
        console.log('[notificationNavigation] Fallback: Navigation vers /request/' + fallbackRequestId);
        try {
          router.push({
            pathname: '/request/[id]',
            params: { id: fallbackRequestId },
          });
        } catch (error) {
          console.error('[notificationNavigation] Erreur lors de la navigation (fallback):', error);
          // Fallback avec le format direct
          router.push(`/request/${fallbackRequestId}`);
        }
        return;
      }
      if (tripId) {
        router.push(getTripUrl(tripId, data, currentUser, type) as any);
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
    console.warn('[notificationNavigation] Erreur lors de la navigation depuis la notification:', error);
  }
};

