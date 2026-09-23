import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { useDriverNavigationNotices } from './useDriverNavigationNotices';
import { useDriverCompletionActions } from './useDriverCompletionActions';
import { isFreshLivePassengerLocation } from '../../features/driver-navigation/navigationBooking';
import { isCoordinateAllowedForNavigationRoute } from '../../features/driver-navigation/navigationMap';
import { trackingSocket, type PassengerLocationPayload } from '@/services/trackingSocket';
import { areTripMapCoordinatesSame, normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { useEffect, useRef } from 'react';

interface Params {
  data: ReturnType<typeof useDriverNavigationData>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  completion: ReturnType<typeof useDriverCompletionActions>;
  notices: ReturnType<typeof useDriverNavigationNotices>;
  refs: ReturnType<typeof useDriverNavigationRefs>;
}

export function useDriverTrackingSocket({
  data,
  mapState,
  completion,
  notices,
  refs,
}: Params) {
  const latest = useRef({ data, mapState, completion, notices, refs });
  latest.current = { data, mapState, completion, notices, refs };
  const { isScreenActive, tripId, isTripOngoing } = data;
  useEffect(() => {
    const { data, mapState, refs } = latest.current;
    if (!data.isScreenActive || !data.tripId || !data.isTripOngoing) {
      mapState.setIsSocketConnected(false);
      return;
    }

    let isCancelled = false;
    let requestPending = false;
    const freshPassengerPositions = new Map<string, number>();
    const requestPassengerPositions = () => {
      if (isCancelled || requestPending) return;
      requestPending = true;
      void trackingSocket.requestPassengerLocations(data.tripId)
        .catch(() => undefined)
        .finally(() => { requestPending = false; });
    };
    mapState.setLivePassengerLocations({});
    const unsubscribeConnection = trackingSocket.subscribeToConnectionState((connected) => {
      if (!connected) freshPassengerPositions.clear();
      if (!isCancelled && mapState.isMountedRef.current) mapState.setIsSocketConnected(connected);
    });

    // Rejoindre la room du trip pour le tracking temps réel
    trackingSocket
      .joinTrip(data.tripId)
      .then(() => {
        if (!mapState.isMountedRef.current || isCancelled) return;
        mapState.setIsSocketConnected(true);
        requestPassengerPositions();
        if (__DEV__) {
          console.log('[Navigation] Connecté au suivi en temps réel');
        }
      })
      .catch((error) => {
        if (!mapState.isMountedRef.current || isCancelled) return;
        mapState.setIsSocketConnected(false);
        console.warn('[Navigation] Connexion tracking impossible:', error);
      });

    // Écouter les erreurs WebSocket
    const unsubscribeError = trackingSocket.subscribeToErrors((message) => {
      if (!mapState.isMountedRef.current || isCancelled) return;
      mapState.setIsSocketConnected(false);
      console.warn('[Navigation] Erreur tracking:', message);
    });

    const unsubscribeAutoProgress = trackingSocket.subscribeToBookingAutoProgress((payload) => {
      const { data, mapState, refs, notices, completion } = latest.current;
      if (!mapState.isMountedRef.current || isCancelled || payload.tripId !== data.tripId) return;
      if (payload.events.length > 0) {
        const hasTripDestinationEvent = payload.events.some(
          (event) => event.type === 'driver_arrived_destination',
        );

        payload.events.forEach((event) => {
          if (event.type === 'driver_near_destination' || event.type === 'driver_arrived_destination') {
            completion.presentTripDestinationNotice(event);
            return;
          }

          if (!event.bookingId) {
            return;
          }

          if (event.type === 'passenger_no_show') {
            const passengerName = notices.getPassengerNameForBooking(event.bookingId);
            const currentNotice = mapState.pickupNoticeRef.current;
            const currentBypassConfirmation = mapState.pickupBypassConfirmationRef.current;
            if (currentBypassConfirmation?.waypoint.booking.id === event.bookingId) {
              return;
            }
            if (currentNotice?.waypoint.booking.id === event.bookingId) {
              mapState.pickupNoticeRef.current = null;
              mapState.setPickupNotice(null);
              mapState.setPickupNoticeCountdown(null);
            }
            notices.showInformation({
              variant: 'info',
              icon: 'person-remove',
              title: 'Passager non embarqué',
              message: `${passengerName} n'a pas été détecté à bord après le délai d'attente. La réservation est clôturée sans paiement.`,
            });
            return;
          }

          if (event.type === 'passenger_boarding_uncertain') {
            const passengerName = notices.getPassengerNameForBooking(event.bookingId);
            const currentNotice = mapState.pickupNoticeRef.current;
            const currentBypassConfirmation = mapState.pickupBypassConfirmationRef.current;
            if (currentBypassConfirmation?.waypoint.booking.id === event.bookingId) {
              return;
            }
            if (currentNotice?.waypoint.booking.id === event.bookingId) {
              mapState.pickupNoticeRef.current = null;
              mapState.setPickupNotice(null);
              mapState.setPickupNoticeCountdown(null);
            }
            notices.showInformation({
              variant: 'warning',
              icon: 'help-circle',
              title: 'Embarquement non confirmé',
              message: `Le trajet est arrivé à destination sans preuve GPS suffisante de l'embarquement de ${passengerName}. La réservation est clôturée sans paiement.`,
            });
            return;
          }

          if (
            event.type === 'driver_arrived_pickup' ||
            event.type === 'parties_nearby' ||
            event.type === 'passenger_ready_pickup'
          ) {
            const waypoint = refs.waypointsRef.current.find(
              (item) => item.booking.id === event.bookingId && item.type === 'pickup',
            );
            if (waypoint) {
              notices.presentPickupNotice(event, waypoint);
            }
            return;
          }

          if (event.type === 'pickup_confirmed') {
            const waypoint = refs.waypointsRef.current.find(
              (item) => item.booking.id === event.bookingId && item.type === 'pickup',
            );
            notices.presentPassengerBoardedNotice(event, waypoint ?? null);
            return;
          }

          if (event.type === 'passenger_near_destination') {
            const waypoint = refs.waypointsRef.current.find(
              (item) => item.booking.id === event.bookingId && item.type === 'dropoff',
            );
            notices.presentPassengerDestinationApproachNotice(event, waypoint ?? null);
            return;
          }

          if (event.type === 'dropoff_confirmed') {
            if (hasTripDestinationEvent) {
              return;
            }

            const waypoint = refs.waypointsRef.current.find(
              (item) => item.booking.id === event.bookingId && item.type === 'dropoff',
            );
            notices.presentPassengerDestinationNotice(event, waypoint ?? null);
          }
        });
        data.refetchBookings();
        data.refetchTrip();
      }
    });

    const unsubscribePassengerLocation = trackingSocket.subscribeToPassengerLocation(
      (payload: PassengerLocationPayload) => {
        const { data, mapState } = latest.current;
        if (
          !mapState.isMountedRef.current ||
          isCancelled ||
          payload.tripId !== data.tripId ||
          !payload.bookingId ||
          !payload.coordinates
        ) {
          return;
        }

        const coordinate = normalizeTripMapCoordinate(
          payload.coordinates[1],
          payload.coordinates[0],
        );
        if (!coordinate) return;
        const passengerLiveLocation = {
          coordinate,
          updatedAt: payload.updatedAt,
        };

        if (!isFreshLivePassengerLocation(passengerLiveLocation)) {
          console.warn('[DriverNavigation] Position passager ignoree car trop ancienne:', {
            bookingId: payload.bookingId,
            updatedAt: payload.updatedAt,
          });
          return;
        }

        if (!isCoordinateAllowedForNavigationRoute(coordinate, data.isKinshasaNavigationTrip)) {
          console.warn('[DriverNavigation] Position passager live hors Kinshasa ignoree:', {
            bookingId: payload.bookingId,
            coordinate,
          });
          return;
        }

        const timestamp = Date.parse(payload.updatedAt ?? '');
        if (Number.isFinite(timestamp)) freshPassengerPositions.set(payload.bookingId, timestamp);
        mapState.setLivePassengerLocations((current) => {
          const currentPassengerLocation = current[payload.bookingId!];
          if (
            currentPassengerLocation?.updatedAt === passengerLiveLocation.updatedAt &&
            areTripMapCoordinatesSame(
              currentPassengerLocation?.coordinate,
              passengerLiveLocation.coordinate,
            )
          ) {
            return current;
          }

          return {
            ...current,
            [payload.bookingId!]: passengerLiveLocation,
          };
        });
      },
    );

    const passengerLocationsRefreshInterval = setInterval(() => {
      const bookingIds = new Set(refs.waypointsRef.current.map(waypoint => waypoint.booking.id));
      for (const id of freshPassengerPositions.keys()) {
        if (!bookingIds.has(id)) freshPassengerPositions.delete(id);
      }
      const missingPosition = [...bookingIds].some(id => {
        const timestamp = freshPassengerPositions.get(id);
        return timestamp === undefined || Date.now() - timestamp >= 15_000;
      });
      if (missingPosition) requestPassengerPositions();
    }, 10000);

    return () => {
      isCancelled = true;
      // Quitter le canal et se déconnecter proprement
      trackingSocket.leaveTrip(data.tripId);
      unsubscribeConnection();
      unsubscribeError();
      unsubscribeAutoProgress();
      unsubscribePassengerLocation();
      clearInterval(passengerLocationsRefreshInterval);

      if (__DEV__) {
        console.log('[Navigation] Déconnecté du suivi en temps réel');
      }
    };
  }, [isScreenActive, tripId, isTripOngoing]);

  return {

  };
}
