import { TripShareAction } from '@/components/trip/TripShareAction';
import { useManagedTripShare } from '@/hooks/manage-trip/useManagedTripShare';
import { ManageTripBookings } from './ManageTripBookings';
import { ManageTripInterruptionNotice } from './ManageTripInterruptionNotice';
import { ManageTripSummary } from './ManageTripSummary';
import { useManageTripState } from '../../hooks/manage-trip/useManageTripState';
import { styles } from '../screen-styles/app/trip/manage/detail/index';
import { Colors } from '@/constants/styles';
import type { Booking } from '@/types';
import React from 'react';
import { RefreshControl, ScrollView } from 'react-native';

interface ManageTripContentProps {
  state: ReturnType<typeof useManageTripState>;
  refreshAll: () => Promise<void>;
  routeEditor: { openEditRouteModal: () => void; closeEditRouteModal: () => void; handleSaveRouteAddresses: () => Promise<void>; };
  tracking: { visibleBookings: Booking[] | undefined; };
  actions: { handleOpenNavigation: () => void; handleStartTrip: () => Promise<void>; handleOpenTripEdit: () => void; handleCancelTrip: () => void; handlePauseTrip: () => Promise<void>; };
  bookingsActions: { showFeedback: (type: "success" | "error", message: string | string[]) => void; openRejectModal: (booking: Booking) => void; handleAcceptBooking: (bookingId: string) => Promise<void>; handleCancelBookingBeforePickup: (booking: Booking) => void; closeRejectModal: () => void; handleRejectSubmit: () => Promise<void>; };
  openTripSecurityModal: () => void;
}

export function ManageTripContent({
  state,
  refreshAll,
  routeEditor,
  tracking,
  actions,
  bookingsActions,
}: ManageTripContentProps) {
  const share = useManagedTripShare(state.trip);
  const trip = state.trip;
  if (!trip) return null;
  return (
    <ScrollView 
      style={styles.scrollView} 
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={state.refreshing} onRefresh={refreshAll} tintColor={Colors.primary} />
      }
    >
      <ManageTripInterruptionNotice trip={trip} />

      <ManageTripSummary
        trip={trip}
        onEditRoute={trip.status === 'upcoming' ? routeEditor.openEditRouteModal : undefined}
      />

      {/* Liste des passagers */}
      <ManageTripBookings
        tracking={tracking}
        state={state}
        actions={actions}
        bookingsActions={bookingsActions}
      />

      <TripShareAction onShare={share} />
    </ScrollView>
  );
}
