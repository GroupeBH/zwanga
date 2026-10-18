import { useTripsScreenState } from './useTripsScreenState';
import { useTripEditorNavigation } from './useTripEditorNavigation';
import { useTripsManagementActions } from './useTripsManagementActions';
import { useTripEditSchedule } from './useTripEditSchedule';
import { useTripsListData } from './useTripsListData';
import {
  canManagePublishedTrip,
  getTripStatusBadge,
  getBookingStatusBadge,
  PublishedTripCard,
  BookingTripCard,
} from '../../features/trips/TripListCards';
import { TripListItem } from '../../features/trips/tripsModel';
import type { Trip } from '@/types';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';



export function useTripsController() {
  const state = useTripsScreenState();

  useEffect(() => {
    if (state.shouldShowTripsGuide) {
      state.setTripsGuideVisible(true);
    }
  }, [state.shouldShowTripsGuide]);

  const dismissTripsGuide = () => {
    state.setTripsGuideVisible(false);
    state.completeTripsGuide();
  };

  const list = useTripsListData({
    pagedHistory: state.feeds.history,
    myTrips: state.myTrips,
    recurringTemplates: state.recurringTemplates,
    setIsRefreshing: state.setIsRefreshing,
    refetchTrips: state.refetchTrips,
    refetchBookings: state.refetchBookings,
    myBookings: state.myBookings,
    subTab: state.subTab,
    searchQuery: state.searchQuery,
    mainTab: state.mainTab,
    tripsLoading: state.tripsLoading,
    bookingsLoading: state.bookingsLoading,
    tripsError: state.tripsError,
    bookingsError: state.bookingsError,
    tripsFetching: state.tripsFetching,
    bookingsFetching: state.bookingsFetching,
  });

  const schedule = useTripEditSchedule({
    editDateTime: state.editDateTime,
    setEditDateTime: state.setEditDateTime,
    setIosPickerMode: state.setIosPickerMode,
    iosPickerMode: state.iosPickerMode,
  });

  const showFeedback = (type: 'success' | 'error', message: string | string[]) => {
    state.setFeedback({
      type,
      message: Array.isArray(message) ? message.join('\n') : message,
    });
  };

  const editor = useTripEditorNavigation({
    setEditingTrip: state.setEditingTrip,
    setEditSeats: state.setEditSeats,
    setEditPrice: state.setEditPrice,
    setEditDateTime: state.setEditDateTime,
    setEditDepartureSelection: state.setEditDepartureSelection,
    setEditArrivalSelection: state.setEditArrivalSelection,
    setEditDepartureManualAddress: state.setEditDepartureManualAddress,
    setEditArrivalManualAddress: state.setEditArrivalManualAddress,
    setEditRouteMode: state.setEditRouteMode,
    setEditRoutePickerTarget: state.setEditRoutePickerTarget,
    setEditVehicleId: state.setEditVehicleId,
    setEditStep: state.setEditStep,
    setIosPickerMode: state.setIosPickerMode,
    setEditModalSuspended: state.setEditModalSuspended,
    editArrivalSelection: state.editArrivalSelection,
    editDepartureSelection: state.editDepartureSelection,
    editArrivalManualAddress: state.editArrivalManualAddress,
    editDepartureManualAddress: state.editDepartureManualAddress,
    editRouteMode: state.editRouteMode,
    showFeedback,
  });

  const openDeleteModal = useCallback((trip: Trip) => state.setDeleteTarget(trip), []);
  const closeDeleteModal = () => state.setDeleteTarget(null);

  const formattedEditDate = useMemo(() => {
    if (!state.editDateTime) {
      return 'Choisir la date';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(state.editDateTime);
  }, [state.editDateTime]);

  const formattedEditTime = useMemo(() => {
    if (!state.editDateTime) {
      return 'Choisir l\'heure';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(state.editDateTime);
  }, [state.editDateTime]);

  const editDepartureDisplay = useMemo(() => {
    if (state.editRouteMode === 'manual') {
      return state.editDepartureManualAddress.trim() || 'Renseigner le départ';
    }
    return (
      state.editDepartureSelection?.title ||
      state.editDepartureSelection?.address ||
      state.editDepartureManualAddress.trim() ||
      'Choisir le point de départ'
    );
  }, [state.editDepartureManualAddress, state.editDepartureSelection, state.editRouteMode]);

  const editArrivalDisplay = useMemo(() => {
    if (state.editRouteMode === 'manual') {
      return state.editArrivalManualAddress.trim() || "Renseigner l'arrivée";
    }
    return (
      state.editArrivalSelection?.title ||
      state.editArrivalSelection?.address ||
      state.editArrivalManualAddress.trim() ||
      "Choisir le point d'arrivée"
    );
  }, [state.editArrivalManualAddress, state.editArrivalSelection, state.editRouteMode]);

  const editModalBottomPadding = Platform.OS === 'android' ? 16 : Math.max(state.insets.bottom, 16) + 8;

  const actions = useTripsManagementActions({
    showFeedback,
    editingTrip: state.editingTrip,
    editDateTime: state.editDateTime,
    editVehicleId: state.editVehicleId,
    editSeats: state.editSeats,
    editPrice: state.editPrice,
    editRouteMode: state.editRouteMode,
    editDepartureManualAddress: state.editDepartureManualAddress,
    editDepartureSelection: state.editDepartureSelection,
    editArrivalManualAddress: state.editArrivalManualAddress,
    editArrivalSelection: state.editArrivalSelection,
    updateTripMutation: state.updateTripMutation,
    closeEditModal: editor.closeEditModal,
    deleteTarget: state.deleteTarget,
    deleteTripMutation: state.deleteTripMutation,
    closeDeleteModal,
    refetchTrips: state.refetchTrips,
  });

  const openPublishedTripDetails = useCallback(
    (selectedTripId: string) => state.router.push(`/trip/manage/${selectedTripId}`),
    [state.router],
  );
  const openBookingTripDetails = useCallback(
    (selectedTripId: string) => state.router.push(`/trip/${selectedTripId}`),
    [state.router],
  );
  const renderTripListItem = useCallback(
    ({ item }: { item: TripListItem }) => {
      if (item.kind === 'published') {
        return (
          <PublishedTripCard
            trip={item.trip}
            status={getTripStatusBadge(item.trip)}
            canManage={canManagePublishedTrip(item.trip)}
            onDetails={openPublishedTripDetails}
            onEdit={editor.openEditModal}
            onDelete={openDeleteModal}
          />
        );
      }

      return (
        <BookingTripCard
          booking={item.booking}
          status={getBookingStatusBadge(item.booking)}
          onDetails={openBookingTripDetails}
        />
      );
    },
    [openBookingTripDetails, openDeleteModal, editor.openEditModal, openPublishedTripDetails],
  );

  return {
    state,
    list,
    renderTripListItem,
    editor,
    editModalBottomPadding,
    editDepartureDisplay,
    editArrivalDisplay,
    schedule,
    formattedEditDate,
    formattedEditTime,
    actions,
    closeDeleteModal,
    dismissTripsGuide,
  };
}
