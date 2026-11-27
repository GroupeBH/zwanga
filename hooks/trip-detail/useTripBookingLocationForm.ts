import type { TrackedLocation } from '@/store/slices/locationSlice';
import { bookingLocationSource, bookingPointLabel } from '@/features/trip-detail/bookingLocationLabels';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';
import { getRouteLocationCoordinates } from '@/utils/routeLocationLabels';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import type { Trip, TripPaymentMode } from '@/types';
import type { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import React, { useMemo } from 'react';

interface Params {
  resetBookingReferences?: () => void;
  bookingModalVisible: boolean;
  lastKnownLocation: TrackedLocation | null;
  trip: Trip | undefined;
  passengerOrigin: MapLocationSelection | null;
  passengerOriginManualAddress: string;
  passengerDestination: MapLocationSelection | null;
  passengerDestinationManualAddress: string;
  isIdentityVerified: boolean;
  checkIdentity: ReturnType<typeof useIdentityCheck>['checkIdentity'];
  setBookingSeats: React.Dispatch<React.SetStateAction<string>>;
  setBookingPaymentMode: React.Dispatch<React.SetStateAction<TripPaymentMode>>;
  setBookingModalError: React.Dispatch<React.SetStateAction<string>>;
  setPassengerOrigin: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setPassengerOriginManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setPassengerDestination: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setPassengerDestinationManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setShouldAutofillPassengerOrigin: React.Dispatch<React.SetStateAction<boolean>>;
  setBookingStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  setBookingModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  requestDriverLocationPermission: () => Promise<void>;
}

export function useTripBookingLocationForm({
  resetBookingReferences,
  bookingModalVisible,
  lastKnownLocation,
  trip,
  passengerOrigin,
  passengerOriginManualAddress,
  passengerDestination,
  passengerDestinationManualAddress,
  isIdentityVerified,
  checkIdentity,
  setBookingSeats,
  setBookingPaymentMode,
  setBookingModalError,
  setPassengerOrigin,
  setPassengerOriginManualAddress,
  setPassengerDestination,
  setPassengerDestinationManualAddress,
  setShouldAutofillPassengerOrigin,
  setBookingStep,
  setBookingModalVisible,
  requestDriverLocationPermission,
}: Params) {
  const defaultPassengerOriginSelection = useMemo<MapLocationSelection | null>(() => {
    const coordinate = normalizeTripMapCoordinate(lastKnownLocation?.coords?.latitude, lastKnownLocation?.coords?.longitude);
    if (!coordinate) {
      return null;
    }
    const { latitude, longitude } = coordinate;
    return {
      title: 'Ma position actuelle',
      address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
    };
  }, [lastKnownLocation?.coords?.latitude, lastKnownLocation?.coords?.longitude]);
  const defaultPassengerDestinationSelection = useMemo<MapLocationSelection | null>(() => {
    const point = getRouteLocationCoordinates({ lat: trip?.arrival?.lat, lng: trip?.arrival?.lng,
      hasCoordinates: trip?.arrival?.hasCoordinates });
    const coordinate = point && normalizeTripMapCoordinate(point.lat, point.lng);
    if (!coordinate) {
      return null;
    }
    return {
      title: trip?.arrival?.name || trip?.arrival?.address || 'Destination',
      address:
        trip?.arrival?.address ||
        `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    };
  }, [trip?.arrival?.address, trip?.arrival?.lat, trip?.arrival?.lng, trip?.arrival?.name, trip?.arrival?.hasCoordinates]);
  const originSource = bookingLocationSource(passengerOrigin, passengerOriginManualAddress, trip?.departure);
  const destinationSource = bookingLocationSource(passengerDestination, passengerDestinationManualAddress, trip?.arrival);
  // Resolve the selected coordinates, not live GPS: a later location update must not move the pickup.
  const resolvedLabels = useRouteLocationLabels({ departure: originSource, arrival: destinationSource }, bookingModalVisible);
  const bookingLocationLabels = {
    origin: bookingPointLabel(originSource, resolvedLabels.departure),
    destination: bookingPointLabel(destinationSource, resolvedLabels.arrival),
  };
  const passengerOriginDisplay = bookingLocationLabels.origin.text;
  const passengerDestinationDisplay = bookingLocationLabels.destination.text;
  const openBookingModal = () => {
    if (trip?.requiresPassengerKyc && !isIdentityVerified) {
      checkIdentity('book');
      return;
    }

    const autoOrigin = defaultPassengerOriginSelection;
    resetBookingReferences?.();
    setBookingSeats('1');
    setBookingPaymentMode('cash');
    setBookingModalError('');
    setPassengerOrigin(autoOrigin);
    setPassengerOriginManualAddress('');
    setPassengerDestination(defaultPassengerDestinationSelection);
    setPassengerDestinationManualAddress('');
    setShouldAutofillPassengerOrigin(!autoOrigin);
    setBookingStep(1);
    setBookingModalVisible(true);
    if (!autoOrigin) {
      void requestDriverLocationPermission();
    }
  };

  return {
    defaultPassengerOriginSelection,
    openBookingModal,
    passengerOriginDisplay,
    passengerDestinationDisplay,
    bookingLocationLabels,
  };
}
