import {
  Waypoint,
  PickupNotice,
  PickupBypassConfirmation,
  TripEndNotice,
} from '../../features/driver-navigation/navigationModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { rideOutbox } from '@/services/rideOutbox';
import { useCancelBookingMutation, useGetTripBookingsQuery } from '@/store/api/bookingApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import type { Booking } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import React, { useCallback } from 'react';
import type { Router } from 'expo-router';
import type { useDriverBookingActionGuard } from './useDriverBookingActionGuard';
import type { DriverBookingDecision } from '@/store/api/booking/driverDecisionCache';

interface Params {
  commitBookingDecision: (source: Booking, status: DriverBookingDecision, response?: Booking) => void;
  beginBookingAction: ReturnType<typeof useDriverBookingActionGuard>;
  waypointModalVisibleRef: React.RefObject<boolean>;
  setWaypointModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveWaypoint: React.Dispatch<React.SetStateAction<Waypoint | null>>;
  tripId: string;
  router: Router;
  activeWaypoint: Waypoint | null;
  pickupNoticeRef: React.RefObject<PickupNotice | null>;
  setPickupNotice: React.Dispatch<React.SetStateAction<PickupNotice | null>>;
  setPickupNoticeCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  tripEndNoticeRef: React.RefObject<TripEndNotice | null>;
  setTripEndNotice: React.Dispatch<React.SetStateAction<TripEndNotice | null>>;
  pickupBypassConfirmationRef: React.RefObject<PickupBypassConfirmation | null>;
  setPickupBypassConfirmation: React.Dispatch<React.SetStateAction<PickupBypassConfirmation | null>>;
  setPickupBypassAction: React.Dispatch<React.SetStateAction<"confirm" | "cancel" | null>>;
  lastRouteFetchTimeRef: React.RefObject<number>;
  routeFetchedRef: React.RefObject<boolean>;
  routeSignatureRef: React.RefObject<string>;
  offRouteSampleCountRef: React.RefObject<number>;
  lastOffRouteRerouteAtRef: React.RefObject<number>;
  pickupBypassAction: "confirm" | "cancel" | null;
  speakNavigationMessage: (message: string, options?: { force?: boolean; }) => Promise<void>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  cancelBooking: ReturnType<typeof useCancelBookingMutation>[0];
  rememberCancelledBooking: (bookingId: string) => void;
  setPickupSkipped: (bookingId: string, shouldSkip: boolean) => void;
  refetchBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  reconcileBookingStatus: (error: unknown, bookingId: string, expectedStatuses: readonly string[]) => Promise<Booking | null>;
}

export function useDriverPickupActions({
  commitBookingDecision,
  beginBookingAction,
  waypointModalVisibleRef,
  setWaypointModalVisible,
  setActiveWaypoint,
  tripId,
  router,
  activeWaypoint,
  pickupNoticeRef,
  setPickupNotice,
  setPickupNoticeCountdown,
  tripEndNoticeRef,
  setTripEndNotice,
  pickupBypassConfirmationRef,
  setPickupBypassConfirmation,
  setPickupBypassAction,
  lastRouteFetchTimeRef,
  routeFetchedRef,
  routeSignatureRef,
  offRouteSampleCountRef,
  lastOffRouteRerouteAtRef,
  pickupBypassAction,
  speakNavigationMessage,
  showDialog,
  cancelBooking,
  rememberCancelledBooking,
  setPickupSkipped,
  refetchBookings,
  refetchTrip,
  reconcileBookingStatus,
}: Params) {
  const refreshInBackground = useCallback(() => {
    void Promise.allSettled([Promise.resolve().then(() => refetchBookings()), Promise.resolve().then(() => refetchTrip())]);
  }, [refetchBookings, refetchTrip]);
  const handleDismissWaypointModal = () => {
    waypointModalVisibleRef.current = false;
    setWaypointModalVisible(false);
    setActiveWaypoint(null);
  };


  const openReportForWaypoint = (waypoint: Waypoint) => {
    if (!tripId) return;

    router.push({
      pathname: '/report',
      params: {
        tripId,
        bookingId: waypoint.booking.id,
        reportedUserId: waypoint.passenger.id,
        reportedUserName: waypoint.passenger.name || 'Passager',
      },
    });
  };

  const handleReportPassenger = () => {
    if (!activeWaypoint) return;
    openReportForWaypoint(activeWaypoint);
  };

  const dismissPickupNotice = useCallback(() => {
    pickupNoticeRef.current = null;
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
  }, [pickupNoticeRef, setPickupNotice, setPickupNoticeCountdown]);

  const dismissTripEndNotice = useCallback(() => {
    tripEndNoticeRef.current = null;
    setTripEndNotice(null);
  }, [tripEndNoticeRef, setTripEndNotice]);

  const dismissPickupBypassConfirmation = useCallback(() => {
    pickupBypassConfirmationRef.current = null;
    setPickupBypassConfirmation(null);
    setPickupBypassAction(null);
  }, [pickupBypassConfirmationRef, setPickupBypassConfirmation, setPickupBypassAction]);

  const dismissPickupNoticeForBooking = useCallback((bookingId: string) => {
    const currentNotice = pickupNoticeRef.current;
    if (currentNotice?.waypoint.booking.id !== bookingId) {
      return;
    }

    pickupNoticeRef.current = null;
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
  }, [pickupNoticeRef, setPickupNotice, setPickupNoticeCountdown]);

  const markNavigationRouteDirty = useCallback(() => {
    lastRouteFetchTimeRef.current = 0;
    routeFetchedRef.current = false;
    routeSignatureRef.current = '';
    offRouteSampleCountRef.current = 0;
    lastOffRouteRerouteAtRef.current = 0;
  }, [lastRouteFetchTimeRef, routeFetchedRef, routeSignatureRef, offRouteSampleCountRef, lastOffRouteRerouteAtRef]);

  const handleConfirmBypassedPickup = useCallback(async () => {
    const confirmation = pickupBypassConfirmationRef.current;
    if (!confirmation || pickupBypassAction) {
      return;
    }

    const bookingId = confirmation.waypoint.booking.id;
    const action = beginBookingAction(confirmation.waypoint.booking, 'pickup-confirm');
    if (!action) return;
    const passengerName = confirmation.waypoint.passenger.name || 'Le passager';
    setPickupBypassAction('confirm');

    try {
      await rideOutbox.enqueue({ bookingId, tripId, stage: 'pickup', decision: 'confirm' });
      if (!action.isCurrent()) return;
      dismissPickupNoticeForBooking(bookingId);
      if (pickupBypassConfirmationRef.current === confirmation) dismissPickupBypassConfirmation();
      void speakNavigationMessage(
        `Votre confirmation pour ${passengerName} est enregistrée. En attente de validation.`,
        { force: true },
      );
    } catch (error: any) {
      if (!action.isCurrent()) return;
      showDialog({
        variant: 'danger',
        icon: 'alert-circle',
        title: 'Confirmation impossible',
        message: getApiErrorMessage(error, "Impossible de confirmer la prise en charge pour le moment."),
      });
    } finally {
      action.finish();
      if (action.isCurrent()) setPickupBypassAction(null);
    }
  }, [
    tripId,
    beginBookingAction,
    dismissPickupBypassConfirmation,
    dismissPickupNoticeForBooking,
    pickupBypassAction,
    pickupBypassConfirmationRef,
    setPickupBypassAction,
    showDialog,
    speakNavigationMessage,
  ]);

  const handleCancelBypassedPickup = useCallback(async () => {
    const confirmation = pickupBypassConfirmationRef.current;
    if (!confirmation || pickupBypassAction) {
      return;
    }

    const bookingId = confirmation.waypoint.booking.id;
    const action = beginBookingAction(confirmation.waypoint.booking, 'pickup-cancel');
    if (!action) return;
    const passengerName = confirmation.waypoint.passenger.name || 'Le passager';
    setPickupBypassAction('cancel');

    try {
      await cancelBooking(bookingId).unwrap();
      if (!action.isCurrent()) return;
      commitBookingDecision(action.booking, 'cancelled');
      action.complete();
      rememberCancelledBooking(bookingId);
      setPickupSkipped(bookingId, true);
      dismissPickupNoticeForBooking(bookingId);
      if (pickupBypassConfirmationRef.current === confirmation) dismissPickupBypassConfirmation();
      markNavigationRouteDirty();
      refreshInBackground();
      if (!action.isCurrent()) return;
      void speakNavigationMessage(
        `La réservation de ${passengerName} est annulée. L’itinéraire continue.`,
        { force: true },
      );
    } catch (error: any) {
      if (!action.isCurrent()) return;
      const cancelledBooking = await reconcileBookingStatus(error, bookingId, ['cancelled']);
      if (!action.isCurrent()) return;
      if (cancelledBooking) {
        commitBookingDecision(action.booking, 'cancelled', cancelledBooking);
        action.complete();
        rememberCancelledBooking(bookingId);
        setPickupSkipped(bookingId, true);
        dismissPickupNoticeForBooking(bookingId);
        if (pickupBypassConfirmationRef.current === confirmation) dismissPickupBypassConfirmation();
        markNavigationRouteDirty();
        refreshInBackground();
        return;
      }
      showDialog({
        variant: 'danger',
        icon: 'alert-circle',
        title: 'Annulation impossible',
        message: getApiErrorMessage(error, "Impossible d'annuler cette réservation pour le moment."),
      });
    } finally {
      action.finish();
      if (action.isCurrent()) setPickupBypassAction(null);
    }
  }, [
    cancelBooking,
    commitBookingDecision,
    refreshInBackground,
    beginBookingAction,
    dismissPickupBypassConfirmation,
    dismissPickupNoticeForBooking,
    markNavigationRouteDirty,
    pickupBypassAction,
    pickupBypassConfirmationRef,
    setPickupBypassAction,
    reconcileBookingStatus,
    rememberCancelledBooking,
    setPickupSkipped,
    showDialog,
    speakNavigationMessage,
  ]);

  return {
    dismissTripEndNotice,
    handleCancelBypassedPickup,
    handleConfirmBypassedPickup,
    dismissPickupNotice,
    handleDismissWaypointModal,
    handleReportPassenger,
    openReportForWaypoint,
  };
}
