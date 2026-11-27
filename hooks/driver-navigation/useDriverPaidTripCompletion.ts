import { usePaidRequestCompletion } from './usePaidRequestCompletion';
import type { useDriverNavigationController } from './useDriverNavigationController';

/** One controller shared by the completion prompt and the navigation options. */
export function useDriverPaidTripCompletion({ model, blocked }: {
  model: ReturnType<typeof useDriverNavigationController>;
  blocked: boolean;
}) {
  const { foundation, completion } = model.session;
  const { data, refs, mapState } = foundation;
  const autoComplete = Boolean(data.trip?.tripRequestId);
  const prompt = usePaidRequestCompletion({
    trip: data.trip, bookings: data.bookings, driverId: data.driverId,
    // Published trips remain a driver's choice, even after the last passenger leaves.
    autoComplete,
    active: data.isScreenActive && data.trip?.id === data.tripId && model.presentation.hasValidTripCoordinates && !data.bookingsLoading,
    blocked: blocked || !data.isOnline || data.navigationReadsFailed || data.offlineTrip || data.offlineBookings ||
      Boolean(mapState.tripEndNotice) || data.isPausingTrip || data.isRestartingTrip ||
      data.isRequestingDriverInterruption || data.isCancellingDriverInterruption ||
      data.isAcceptingBooking || data.isRejectingBooking || data.isCancellingPickupBypassBooking ||
      data.isConfirmingPassengerInterruption || data.isRejectingPassengerInterruption,
    completingRef: refs.autoCompletingTripRef, completeTrip: data.completeTrip,
    reconcileTripStatus: data.reconcileTripStatus, onCompleted: completion.presentCompletedTripFromServerSync,
    refresh: () => { void data.refetchTrip(); void data.refetchBookings(); },
  });
  return { ...prompt, autoComplete };
}
