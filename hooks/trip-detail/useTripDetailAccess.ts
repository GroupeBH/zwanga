import { BOOKING_STATUS_CONFIG } from '../../features/trip-detail/tripDetailModel';
import type { Booking } from '@/types';
import { usePassengerIdentityVerification } from '@/hooks/usePassengerIdentityVerification';
import React, { useMemo } from 'react';
import type { Trip, User } from '@/types';

interface Params {
  trip: Trip | undefined;
  setBookingModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  liveDriverCoordinate: { latitude: number; longitude: number; } | null;
  trackingError: string | null;
  isTripDriver: boolean;
  liveDriverUpdatedAt: string | null;
  activeBooking: Booking | null;
  user: User | null;
  bookingForTrip: Booking | null;
}

export function useTripDetailAccess({
  trip,
  setBookingModalVisible,
  liveDriverCoordinate,
  trackingError,
  isTripDriver,
  liveDriverUpdatedAt,
  activeBooking,
  user,
  bookingForTrip,
}: Params) {
  const availableSeats = trip && Number.isFinite(trip.availableSeats) ? Math.max(0, Math.floor(trip.availableSeats)) : 0;
  const seatLimit = availableSeats;
  const openPassengerIdentityVerification = usePassengerIdentityVerification(
    () => setBookingModalVisible(false),
    () => setBookingModalVisible(true),
  );
  const progress = trip?.progress || 0;
  const trackingStatusTitle = liveDriverCoordinate ? 'Suivi en direct' : 'Position estimée';
  const trackingStatusSubtitle = useMemo(() => {
    if (trackingError) {
      return trackingError;
    }
    if (!liveDriverCoordinate) {
      return isTripDriver
        ? 'Partage automatique activé dès que la localisation est disponible.'
        : "Le conducteur n’a pas encore partagé sa position.";
    }
    if (!liveDriverUpdatedAt) {
      return 'Mise à jour en cours...';
    }
    const timestamp = new Date(liveDriverUpdatedAt).getTime();
    if (Number.isNaN(timestamp)) {
      return `Mise à jour à ${new Date(liveDriverUpdatedAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
    const diffMs = Date.now() - timestamp;
    if (diffMs < 60 * 1000) {
      return 'Mis à jour il y a quelques secondes';
    }
    if (diffMs < 60 * 60 * 1000) {
      const mins = Math.floor(diffMs / (60 * 1000));
      return `Mis à jour il y a ${mins} min`;
    }
    return `Mis à jour à ${new Date(liveDriverUpdatedAt).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }, [isTripDriver, liveDriverCoordinate, liveDriverUpdatedAt, trackingError]);
  const activeBookingStatus = activeBooking && activeBooking.status in BOOKING_STATUS_CONFIG
    ? BOOKING_STATUS_CONFIG[activeBooking.status as keyof typeof BOOKING_STATUS_CONFIG]
    : null;
  const canAccessTripSecurity = Boolean(trip && user);
  const tripSecurityRole: 'driver' | 'passenger' = isTripDriver ? 'driver' : 'passenger';
  const tripSecurityBookingId = isTripDriver ? undefined : (activeBooking?.id ?? bookingForTrip?.id);
  const tripVehicleIdentity = useMemo(() => {
    if (!trip) return 'Informations véhicule indisponibles.';
    if (trip.vehicle) {
      const parts = [`${trip.vehicle.brand} ${trip.vehicle.model}`.trim()];
      if (trip.vehicle.color) {
        parts.push(trip.vehicle.color);
      }
      if (trip.vehicle.licensePlate) {
        parts.push(`Plaque ${trip.vehicle.licensePlate}`);
      }
      return parts.filter(Boolean).join(' • ');
    }
    return trip.vehicleInfo || 'Informations véhicule indisponibles.';
  }, [trip]);
  const showPassengerVehicleReminder =
    !isTripDriver &&
    Boolean(activeBooking && (activeBooking.status === 'pending' || activeBooking.status === 'accepted'));
  const showDriverVehicleReminder = isTripDriver && (trip?.status === 'upcoming' || trip?.status === 'ongoing');
  const showPassengerSecurityAccess = !isTripDriver;
  const isPassengerSecurityLocked = showPassengerSecurityAccess && !activeBooking;
  const passengerTrustedContactsHint = !activeBooking
    ? 'Après réservation'
    : activeBooking.status === 'pending'
      ? 'Après acceptation'
      : activeBooking.status === 'accepted'
        ? 'Ajouter ou choisir'
        : 'Modifier la liste';
  const trustedContactsActionLabel = canAccessTripSecurity
    ? 'Ajouter / notifier mes proches'
    : 'Connectez-vous';

  return {
    canAccessTripSecurity,
    seatLimit,
    openPassengerIdentityVerification,
    progress,
    availableSeats,
    trackingStatusTitle,
    trackingStatusSubtitle,
    showPassengerSecurityAccess,
    isPassengerSecurityLocked,
    trustedContactsActionLabel,
    passengerTrustedContactsHint,
    showPassengerVehicleReminder,
    showDriverVehicleReminder,
    tripVehicleIdentity,
    activeBookingStatus,
    tripSecurityRole,
    tripSecurityBookingId,
  };
}
