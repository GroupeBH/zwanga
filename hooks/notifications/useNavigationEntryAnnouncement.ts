import type { useDriverNavigationFoundation } from '@/hooks/driver-navigation/useDriverNavigationFoundation';
import type { usePassengerNavigationData } from '@/hooks/passenger-navigation/usePassengerNavigationData';
import type { usePassengerNavigationInterruption } from '@/hooks/passenger-navigation/usePassengerNavigationInterruption';
import { buildDriverEntryAnnouncement, buildPassengerEntryAnnouncement } from '@/features/notifications/navigationEntryAnnouncement';
import { useRideEntryAnnouncement } from './useRideEntryAnnouncement';

export function useDriverEntryAnnouncement(foundation: ReturnType<typeof useDriverNavigationFoundation>) {
  const { data, passengers, mapState } = foundation;
  useRideEntryAnnouncement(data.driverId, data.isScreenActive,
    Boolean(data.trip && data.bookings && !data.isLoading && !data.isTripFetching && !data.bookingsLoading &&
      !data.bookingsFetching && !data.offlineTrip && !data.offlineBookings),
    mapState.isVoiceGuidanceEnabled ? buildDriverEntryAnnouncement({ userId: data.driverId, trip: data.trip,
      interruption: passengers.activePassengerInterruptionBooking, pending: passengers.activePendingBooking,
      stopping: Boolean(passengers.activeDriverInterruptionRequest), next: mapState.waypoints[mapState.currentWaypointIndex] }) : null);
}
export function usePassengerEntryAnnouncement(data: ReturnType<typeof usePassengerNavigationData>, interruption: ReturnType<typeof usePassengerNavigationInterruption>) {
  useRideEntryAnnouncement(data.passengerId, data.isScreenActive,
    Boolean(data.booking && data.trip && !data.bookingLoading && !data.tripLoading && !data.bookingFetching && !data.tripFetching &&
      !data.offlineBooking && !data.offlineTrip),
    buildPassengerEntryAnnouncement({ userId: data.passengerId, booking: data.booking, trip: data.trip,
      canRespondToStop: interruption.canRespondToDriverInterruption, stopRequested: Boolean(interruption.pendingPassengerInterruptionRequest) }));
}
