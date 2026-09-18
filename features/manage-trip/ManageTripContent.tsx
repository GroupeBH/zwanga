import { ManageTripBookings } from './ManageTripBookings';
import { ManageTripInterruptionNotice } from './ManageTripInterruptionNotice';
import { ManageTripSummary } from './ManageTripSummary';
import { useManageTripState } from '../../hooks/manage-trip/useManageTripState';
import { styles } from '../screen-styles/app/trip/manage/detail/index';
import { Colors } from '@/constants/styles';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';

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
  openTripSecurityModal,
}: ManageTripContentProps) {
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

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Sécurité du trajet</Text>
            <Text style={styles.sectionSubtitle}>
              Choisissez clairement les proches à notifier pour ce trajet.
            </Text>
          </View>
          <View style={styles.sectionIconBadge}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
          </View>
        </View>
        <TouchableOpacity
          style={styles.securityQuickButton}
          onPress={openTripSecurityModal}
          activeOpacity={0.9}
        >
          <Ionicons name="people" size={18} color={Colors.white} />
          <Text style={styles.securityQuickButtonText}>Choisir qui notifier</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.securitySecondaryButton}
          onPress={() => state.router.push('/security')}
          activeOpacity={0.9}
        >
          <Ionicons name="settings-outline" size={16} color={Colors.primary} />
          <Text style={styles.securitySecondaryButtonText}>
            {"Ajouter ou gérer mes contacts d'urgence"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
