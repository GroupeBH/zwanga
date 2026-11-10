import { useEffect, useRef, useState } from 'react';
import type { useTripDetailController } from './useTripDetailController';
import { useManageTripActions } from '@/hooks/manage-trip/useManageTripActions';
import { useManageTripBookingActions } from '@/hooks/manage-trip/useManageTripBookingActions';
import { useAcceptBookingMutation, useRejectBookingMutation } from '@/store/api/bookingApi';
import { useStartTripMutation, usePauseTripMutation, useRequestDriverTripInterruptionMutation, useUpdateTripMutation } from '@/store/api/tripApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { applyDriverBookingDecision } from '@/store/api/booking/driverDecisionCache';
import { reconcileAmbiguousMutation } from '@/utils/mutationReconciliation';
import { reconcileTripMutation } from '@/utils/tripStartReconciliation';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useRideEntryAnnouncement } from '@/hooks/notifications/useRideEntryAnnouncement';
import { buildManageTripEntry } from '@/features/notifications/detailEntryAnnouncement';
import type { FeedbackState } from '@/features/manage-trip/manageTripModel';
import type { useDialog } from '@/components/ui/DialogProvider';

/** Owner-only component: reuse detail reads/tracking, not a second management controller. */
export function useDriverTripWorkspace(model: ReturnType<typeof useTripDetailController>) {
  const { data, bookingState } = model;
  const dispatch = useAppDispatch();
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const [startTrip, { isLoading: isStartingTrip }] = useStartTripMutation();
  const [pauseTrip, { isLoading: isPausingTrip }] = usePauseTripMutation();
  const [requestDriverTripInterruption, { isLoading: isRequestingDriverInterruption }] = useRequestDriverTripInterruptionMutation();
  const [updateTripStatus, { isLoading: isUpdatingTripStatus }] = useUpdateTripMutation();
  const [acceptBooking, { isLoading: isAccepting }] = useAcceptBookingMutation();
  const [rejectBooking, { isLoading: isRejecting }] = useRejectBookingMutation();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [contactBookingId, setContactBookingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmationLock = useRef(false), network = useRef(online);
  network.current = online;
  const mounted = useRef(true), version = useRef(getTokenSessionVersion()), latest = useRef(data);
  latest.current = data;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!data.isScreenActive) setContactBookingId(null); }, [data.isScreenActive]);
  const isCurrent = () => mounted.current && version.current === getTokenSessionVersion() &&
    latest.current.isScreenActive && latest.current.isTripDriver && latest.current.tripId === data.tripId &&
    latest.current.user?.id === data.user?.id;
  const showDialog: ReturnType<typeof useDialog>['showDialog'] = dialog => {
    if (!isCurrent()) return;
    const status = data.trip?.status, reservations = data.tripBookings;
    data.showDialog({ ...dialog, actions: dialog.actions?.map(action => ({ ...action,
      onPress: action.onPress ? async () => {
        if (!isCurrent() || !network.current || confirmationLock.current || latest.current.trip?.status !== status ||
          latest.current.tripBookings !== reservations || latest.current.bookingsError || latest.current.bookingsFetching) return;
        confirmationLock.current = true;
        setConfirming(true);
        try { await action.onPress?.(); }
        finally { confirmationLock.current = false; if (mounted.current) setConfirming(false); }
      } : undefined,
    })) });
  };
  const refreshAll = async () => {
    if (!isCurrent()) return;
    await Promise.all([data.refetchTrip(), data.refetchTripBookings()]);
  };
  const bookingsActions = useManageTripBookingActions({
    setFeedback: value => { if (isCurrent()) setFeedback(value); }, userId: data.user?.id,
    isScreenActive: data.isScreenActive && data.isTripDriver && online && !data.bookingsError, bookings: data.tripBookings,
    commitBookingDecision: (booking, status, response) => {
      if (isCurrent() && data.user?.id) dispatch(applyDriverBookingDecision(booking, status, data.user.id, response));
    },
    setProcessingBookingId, acceptBooking, rejectBooking, cancelBooking: bookingState.cancelBookingMutation,
    rememberAcceptedBooking: () => {}, trip: data.trip, refreshAll, showDialog,
    reconcileBookingStatus: (error, bookingId, expectedStatuses) => reconcileAmbiguousMutation({ error,
      loadSnapshot: async () => {
        if (!isCurrent()) return null;
        const result = await data.refetchTripBookings();
        if (!isCurrent() || result?.error) return null;
        return result?.data?.find(booking => booking.id === bookingId && booking.tripId === data.tripId);
      },
      isApplied: booking => expectedStatuses.includes(booking.status),
    }),
  });
  const actions = useManageTripActions({ trip: data.trip, showDialog, startTrip, pauseTrip, requestDriverTripInterruption,
    showFeedback: bookingsActions.showFeedback, refreshAll,
    reconcileTripStatus: (error, expectedStatuses) => reconcileTripMutation({ error, tripId: data.tripId, expectedStatuses, refetch: data.refetchTrip }),
    lastKnownLocation: data.lastKnownLocation, visibleBookings: data.tripBookings, router: data.router,
    updateTripStatus, goHome: () => { if (isCurrent()) data.goHome(); },
  });
  useRideEntryAnnouncement(data.user?.id, data.isScreenActive, Boolean(data.trip && data.tripBookings &&
    !data.tripFetching && !data.bookingsFetching && !data.bookingsError),
  buildManageTripEntry(data.user?.id, data.trip, data.tripBookings));
  const busy = confirming || isStartingTrip || isPausingTrip || isRequestingDriverInterruption || isUpdatingTripStatus ||
    isAccepting || isRejecting || bookingState.isCancellingBooking || model.editing.edit.isSavingTrip;
  const ready = isCurrent() && online && !data.tripFetching && !data.bookingsError && !data.bookingsFetching && data.tripBookings !== undefined;
  return { feedback, dismissFeedback: () => setFeedback(null), busy, ready, isStartingTrip,
    actions: { ...actions, handleOpenTripEdit: () => { if (isCurrent()) model.editing.editor.openEditModal(); } },
    bookingsActions,
    state: { trip: data.trip, bookings: data.tripBookings, isOwner: data.isTripDriver, userId: data.user?.id,
      isScreenActive: data.isScreenActive, router: data.router, focusBookingId: data.focusBookingId,
      processingBookingId, isAccepting, isRejecting, isCancellingBooking: bookingState.isCancellingBooking,
      contactBookingId, setContactBookingId, bookingsPartial: false, bookingsFetching: data.bookingsFetching,
      bookingsLoading: !data.tripBookings && !data.bookingsError && online, bookingsError: data.bookingsError,
      bookingsOffline: !online, canRetryBookings: data.isScreenActive && online && !data.bookingsFetching,
      refetchBookings: data.refetchTripBookings },
  };
}
