import {
  hasBookingPickupCompleted,
  hasBookingDropoffCompleted,
  getBookingPickupLabel,
  getBookingDropoffLabel,
  hasFreshBookingPassengerLocation,
} from '../../features/driver-navigation/navigationBooking';
import { isCoordinateAllowedForNavigationRoute } from '../../features/driver-navigation/navigationMap';
import {
  PassengerMapLocation,
  LivePassengerLocation,
  MAX_LIVE_PASSENGER_MARKERS,
} from '../../features/driver-navigation/navigationModel';
import { type PassengerTrackingMarkerStatus } from '@/components/TrackingMapMarkers';
import type { Booking, Trip } from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { isPendingTripInterruption } from '@/utils/tripInterruption';
import React, { useCallback, useMemo } from 'react';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  setLocallyAcceptedBookingIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  setLocallyPickedUpBookingIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  setLocallyCancelledBookingIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  setSkippedPickupBookingIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  skippedPickupBookingIdsRef: React.RefObject<ReadonlySet<string>>;
  bookings: Booking[] | undefined;
  locallyAcceptedBookingIds: ReadonlySet<string>;
  locallyPickedUpBookingIds: ReadonlySet<string>;
  locallyCancelledBookingIds: ReadonlySet<string>;
  livePassengerLocations: Record<string, LivePassengerLocation>;
  isKinshasaNavigationTrip: boolean;
  tripArrivalCoordinate: MapCoordinate | null;
  tripDepartureCoordinate: MapCoordinate | null;
  trip: Trip | undefined;
  processingBookingId: string | null;
}

export function useDriverNavigationBookings({
  setLocallyAcceptedBookingIds,
  setLocallyPickedUpBookingIds,
  setLocallyCancelledBookingIds,
  setSkippedPickupBookingIds,
  skippedPickupBookingIdsRef,
  bookings,
  locallyAcceptedBookingIds,
  locallyPickedUpBookingIds,
  locallyCancelledBookingIds,
  livePassengerLocations,
  isKinshasaNavigationTrip,
  tripArrivalCoordinate,
  tripDepartureCoordinate,
  trip,
  processingBookingId,
}: Params) {
  const rememberAcceptedBooking = useCallback((bookingId: string) => {
    setLocallyAcceptedBookingIds((current) => {
      if (current.has(bookingId)) return current;

      const next = new Set(current);
      next.add(bookingId);
      return next;
    });
  }, []);

  const rememberPickedUpBooking = useCallback((bookingId: string) => {
    setLocallyPickedUpBookingIds((current) => {
      if (current.has(bookingId)) return current;

      const next = new Set(current);
      next.add(bookingId);
      return next;
    });
  }, []);

  const rememberCancelledBooking = useCallback((bookingId: string) => {
    setLocallyCancelledBookingIds((current) => {
      if (current.has(bookingId)) return current;

      const next = new Set(current);
      next.add(bookingId);
      return next;
    });
  }, []);

  const setPickupSkipped = useCallback((bookingId: string, shouldSkip: boolean) => {
    setSkippedPickupBookingIds((current) => {
      if (current.has(bookingId) === shouldSkip) {
        return current;
      }

      const next = new Set(current);
      if (shouldSkip) {
        next.add(bookingId);
      } else {
        next.delete(bookingId);
      }
      skippedPickupBookingIdsRef.current = next;
      return next;
    });
  }, []);

  const visibleBookings = useMemo(() => {
    if (
      !bookings ||
      (locallyAcceptedBookingIds.size === 0 &&
        locallyPickedUpBookingIds.size === 0 &&
        locallyCancelledBookingIds.size === 0)
    ) {
      return bookings;
    }

    return bookings.map((booking) => {
      const updatedAt = new Date().toISOString();
      let nextBooking = booking;

      if (locallyAcceptedBookingIds.has(booking.id) && nextBooking.status === 'pending') {
        nextBooking = {
          ...nextBooking,
          status: 'accepted' as const,
          acceptedAt: nextBooking.acceptedAt ?? updatedAt,
          updatedAt: nextBooking.updatedAt ?? updatedAt,
        };
      }

      if (locallyPickedUpBookingIds.has(booking.id)) {
        nextBooking = {
          ...nextBooking,
          status: nextBooking.status === 'pending' ? 'accepted' as const : nextBooking.status,
          pickedUp: true,
          pickedUpAt: nextBooking.pickedUpAt ?? updatedAt,
          pickupDetectionMethod: nextBooking.pickupDetectionMethod ?? 'driver_manual_bypass',
          updatedAt: nextBooking.updatedAt ?? updatedAt,
        };
      }

      if (locallyCancelledBookingIds.has(booking.id)) {
        nextBooking = {
          ...nextBooking,
          status: 'cancelled' as const,
          cancelledAt: nextBooking.cancelledAt ?? updatedAt,
          updatedAt: nextBooking.updatedAt ?? updatedAt,
        };
      }

      return nextBooking;
    });
  }, [bookings, locallyAcceptedBookingIds, locallyCancelledBookingIds, locallyPickedUpBookingIds]);

  const passengerMapLocations = useMemo<PassengerMapLocation[]>(() => {
    const locations: PassengerMapLocation[] = [];

    (visibleBookings ?? [])
      .filter((booking) => {
        if (booking.status !== 'accepted' && booking.status !== 'completed') {
          return false;
        }

        const isPassengerDroppedOff = hasBookingDropoffCompleted(booking);
        return !(hasBookingPickupCompleted(booking) && !isPassengerDroppedOff);
      })
      .slice(0, MAX_LIVE_PASSENGER_MARKERS)
      .forEach((booking) => {
        const isPassengerDroppedOff = hasBookingDropoffCompleted(booking);
        const liveLocation = livePassengerLocations[booking.id];
        const liveLocationCoordinate = liveLocation?.coordinate ?? null;
        const rawApiLocationCoordinate = normalizeTripMapCoordinate(
          booking.passengerLocationCoordinates?.latitude,
          booking.passengerLocationCoordinates?.longitude,
        );
        const apiLocationCoordinate = hasFreshBookingPassengerLocation(booking)
          ? rawApiLocationCoordinate
          : null;
        const passengerPickupCoordinate = normalizeTripMapCoordinate(
          booking.passengerOriginCoordinates?.latitude,
          booking.passengerOriginCoordinates?.longitude,
        );
        const passengerDropoffCoordinate = normalizeTripMapCoordinate(
          booking.passengerDestinationCoordinates?.latitude,
          booking.passengerDestinationCoordinates?.longitude,
        );
        const liveCoordinate = isCoordinateAllowedForNavigationRoute(
          liveLocationCoordinate,
          isKinshasaNavigationTrip,
        )
          ? liveLocationCoordinate
          : null;
        const apiLocation = isCoordinateAllowedForNavigationRoute(
          apiLocationCoordinate,
          isKinshasaNavigationTrip,
        )
          ? apiLocationCoordinate
          : null;
        const pickupLocation = isCoordinateAllowedForNavigationRoute(
          passengerPickupCoordinate,
          isKinshasaNavigationTrip,
        )
          ? passengerPickupCoordinate
          : null;
        const safePassengerDropoffCoordinate = isCoordinateAllowedForNavigationRoute(
          passengerDropoffCoordinate,
          isKinshasaNavigationTrip,
        )
          ? passengerDropoffCoordinate
          : null;
        const dropoffLocation = safePassengerDropoffCoordinate ?? tripArrivalCoordinate;

        if (isKinshasaNavigationTrip && liveLocationCoordinate && !liveCoordinate) {
          console.warn('[DriverNavigation] Position live passager hors Kinshasa ignorée:', {
            bookingId: booking.id,
            coordinate: liveLocationCoordinate,
          });
        }
        if (rawApiLocationCoordinate && !apiLocationCoordinate) {
          console.warn('[DriverNavigation] Position API passager trop ancienne ignorée:', {
            bookingId: booking.id,
            updatedAt: booking.passengerLocationUpdatedAt,
          });
        }
        if (isKinshasaNavigationTrip && apiLocationCoordinate && !apiLocation) {
          console.warn('[DriverNavigation] Position API passager hors Kinshasa ignorée:', {
            bookingId: booking.id,
            coordinate: apiLocationCoordinate,
          });
        }
        if (isKinshasaNavigationTrip && passengerPickupCoordinate && !pickupLocation) {
          console.warn('[DriverNavigation] Pickup passager hors Kinshasa ignore:', {
            bookingId: booking.id,
            coordinate: passengerPickupCoordinate,
          });
        }
        if (
          isKinshasaNavigationTrip &&
          passengerDropoffCoordinate &&
          !safePassengerDropoffCoordinate
        ) {
          console.warn('[DriverNavigation] Dropoff passager hors Kinshasa ignore:', {
            bookingId: booking.id,
            coordinate: passengerDropoffCoordinate,
            destination: booking.passengerDestination,
          });
        }

        const status: PassengerTrackingMarkerStatus =
          isPassengerDroppedOff
            ? 'arrived'
            : 'pickup';
        const coordinate =
          status === 'arrived'
            ? dropoffLocation ?? liveCoordinate ?? apiLocation ?? pickupLocation ?? tripDepartureCoordinate
            : liveCoordinate ?? apiLocation ?? pickupLocation ?? tripDepartureCoordinate;

        if (!coordinate) return;

        locations.push({
          bookingId: booking.id,
          coordinate,
          isLive: Boolean(liveCoordinate || apiLocation),
          passengerId: booking.passengerId,
          passengerName: booking.passengerName || 'Passager',
          status,
        });
      });

    return locations;
  }, [
    isKinshasaNavigationTrip,
    livePassengerLocations,
    tripArrivalCoordinate,
    tripDepartureCoordinate,
    visibleBookings,
  ]);

  // Refs pour éviter les re-rendus excessifs
  const pendingNavigationBookings = useMemo(
    () => (visibleBookings ?? []).filter((booking) => booking.status === 'pending'),
    [visibleBookings],
  );
  const activePendingBooking = pendingNavigationBookings[0] ?? null;
  const activePendingBookingPickupLabel = getBookingPickupLabel(activePendingBooking, trip);
  const activePendingBookingDropoffLabel = getBookingDropoffLabel(activePendingBooking, trip);
  const pendingBookingQueueCount = Math.max(0, pendingNavigationBookings.length - 1);
  const isProcessingPendingBooking = Boolean(
    activePendingBooking && processingBookingId === activePendingBooking.id,
  );
  const passengerInterruptionRequests = useMemo(
    () =>
      (visibleBookings ?? []).filter((booking) =>
        isPendingTripInterruption(booking.interruptionRequest?.status),
      ),
    [visibleBookings],
  );
  const activePassengerInterruptionBooking = passengerInterruptionRequests[0] ?? null;
  const pendingPassengerInterruptionQueueCount = Math.max(
    0,
    passengerInterruptionRequests.length - 1,
  );
  const activeDriverInterruptionRequest = isPendingTripInterruption(
    trip?.interruptionRequest?.status,
  )
    ? trip?.interruptionRequest ?? null
    : null;
  const activeDriverInterruptionRequiredCount =
    activeDriverInterruptionRequest?.requiredPassengerCount ??
    activeDriverInterruptionRequest?.confirmations.length ??
    0;
  const activeDriverInterruptionConfirmedCount =
    activeDriverInterruptionRequest?.confirmedPassengerCount ??
    activeDriverInterruptionRequest?.confirmations.filter(
      (confirmation) => confirmation.status === 'confirmed',
    ).length ??
    0;

  return {
    visibleBookings,
    setPickupSkipped,
    rememberAcceptedBooking,
    passengerMapLocations,
    rememberCancelledBooking,
    activeDriverInterruptionRequest,
    activeDriverInterruptionConfirmedCount,
    activeDriverInterruptionRequiredCount,
    activePendingBooking,
    pendingBookingQueueCount,
    activePendingBookingPickupLabel,
    activePendingBookingDropoffLabel,
    isProcessingPendingBooking,
    activePassengerInterruptionBooking,
    pendingPassengerInterruptionQueueCount,
  };
}
