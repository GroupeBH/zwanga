import { useCallback, useRef, useState } from 'react';
import { InteractionManager, Keyboard, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { useRouter } from 'expo-router';
import type { useDialog } from '@/components/ui/DialogProvider';
import type { Trip, TripRequest } from '@/types';
import { trackEvent } from '@/services/analytics';
import { getSafeTripId, getSafeTripRequestId } from '@/features/search/searchModel';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';

interface Params {
  router: ReturnType<typeof useRouter>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
}

export function useSearchNavigation({ router, showDialog }: Params) {
  const [openingTripId, setOpeningTripId] = useState<string | null>(null);
  const [openingRequestId, setOpeningRequestId] = useState<string | null>(null);
  const openingTripIdRef = useRef<string | null>(null);
  const openingRequestIdRef = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      openingTripIdRef.current = null;
      openingRequestIdRef.current = null;
      setOpeningTripId(null);
      setOpeningRequestId(null);
    }, []),
  );

  const handleOpenTrip = useCallback((trip: Trip) => {
    const tripId = getSafeTripId(trip);

    if (openingTripIdRef.current) {
      return;
    }

    if (!tripId) {
      showDialog({
        variant: 'warning',
        title: 'Trajet indisponible',
        message: "Ce trajet n'a pas pu être ouvert. Actualisez la recherche puis réessayez.",
      });
      return;
    }

    openingTripIdRef.current = tripId;
    setOpeningTripId(tripId);
    Keyboard.dismiss();

    void trackEvent('trip_opened_from_search', {
      trip_id: tripId,
      vehicle_type: trip.vehicleType ?? null,
    });

    const navigate = () => {
      try {
        router.push({
          pathname: '/trip/[id]',
          params: { id: tripId },
        });
      } catch (error) {
        console.warn('[Search] Impossible d’ouvrir le trajet:', error);
        openingTripIdRef.current = null;
        setOpeningTripId(null);
        showDialog({
          variant: 'danger',
          title: 'Ouverture impossible',
          message: "Ce trajet n'a pas pu être ouvert. Actualisez la recherche puis réessayez.",
        });
      }
    };

    if (Platform.OS === 'ios') {
      InteractionManager.runAfterInteractions(navigate);
      return;
    }

    navigate();
  }, [router, showDialog]);

  const handleOpenTripRequest = useCallback((request: TripRequest) => {
    const requestId = getSafeTripRequestId(request);

    if (openingRequestIdRef.current) {
      return;
    }

    if (!requestId) {
      showDialog({
        variant: 'warning',
        title: 'Demande indisponible',
        message: "Cette demande n'a pas pu être ouverte. Actualisez la recherche puis réessayez.",
      });
      return;
    }

    openingRequestIdRef.current = requestId;
    setOpeningRequestId(requestId);
    Keyboard.dismiss();

    void trackEvent('trip_request_opened_from_search', {
      trip_request_id: requestId,
      vehicle_type: request.vehicleType ?? null,
    });

    const navigate = () => {
      try {
        router.push(getTripRequestDetailHref(requestId));
      } catch (error) {
        console.warn('[Search] Impossible d’ouvrir la demande:', error);
        openingRequestIdRef.current = null;
        setOpeningRequestId(null);
        showDialog({
          variant: 'danger',
          title: 'Ouverture impossible',
          message: "Cette demande n'a pas pu être ouverte. Actualisez la recherche puis réessayez.",
        });
      }
    };

    if (Platform.OS === 'ios') {
      InteractionManager.runAfterInteractions(navigate);
      return;
    }

    navigate();
  }, [router, showDialog]);

  return { openingTripId, openingRequestId, handleOpenTrip, handleOpenTripRequest };
}
