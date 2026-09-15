import type { TrackedLocation } from '@/store/slices/locationSlice';
import { getLocationText } from '../../features/trip-detail/tripDetailModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import type { TripPaymentMode } from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import React, { useMemo } from 'react';
import type { Trip } from '@/types';

interface Params {
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
    const latitude = Number(lastKnownLocation?.coords?.latitude);
    const longitude = Number(lastKnownLocation?.coords?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      title: 'Ma position actuelle',
      address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
    };
  }, [lastKnownLocation?.coords?.latitude, lastKnownLocation?.coords?.longitude]);
  const defaultPassengerDestinationSelection = useMemo<MapLocationSelection | null>(() => {
    const coordinate = normalizeTripMapCoordinate(trip?.arrival?.lat, trip?.arrival?.lng);
    if (!coordinate) {
      return null;
    }
    return {
      title: trip?.arrival?.name || trip?.arrival?.address || 'Arrivée du trajet',
      address:
        trip?.arrival?.address ||
        `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    };
  }, [trip?.arrival?.address, trip?.arrival?.lat, trip?.arrival?.lng, trip?.arrival?.name]);
  const passengerOriginDisplay = useMemo(
    () =>
      getLocationText(passengerOrigin, passengerOriginManualAddress) ||
      trip?.departure?.address ||
      trip?.departure?.name ||
      '',
    [passengerOrigin, passengerOriginManualAddress, trip?.departure?.address, trip?.departure?.name],
  );
  const passengerDestinationDisplay = useMemo(
    () =>
      getLocationText(passengerDestination, passengerDestinationManualAddress) ||
      trip?.arrival?.address ||
      trip?.arrival?.name ||
      '',
    [passengerDestination, passengerDestinationManualAddress, trip?.arrival?.address, trip?.arrival?.name],
  );
  const openBookingModal = () => {
    if (trip?.requiresPassengerKyc && !isIdentityVerified) {
      checkIdentity('book');
      return;
    }

    const autoOrigin = defaultPassengerOriginSelection;
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
  };
}
import type { useIdentityCheck } from '@/hooks/useIdentityCheck';
