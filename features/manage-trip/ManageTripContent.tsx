import { ManageTripBookings } from './ManageTripBookings';
import { ManageTripInterruptionNotice } from './ManageTripInterruptionNotice';
import { useManageTripState } from '../../hooks/manage-trip/useManageTripState';
import { labelStatus, statusColor } from './manageTripStatus';
import { styles } from '../screen-styles/app/trip/manage/detail/index';
import { Colors } from '@/constants/styles';
import type { Booking } from '@/types';
import { formatDateTime } from '@/utils/dateHelpers';
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

      {/* Résumé du trajet */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.timeContainer}>
            <Ionicons name="time-outline" size={20} color={Colors.gray[600]} />
            <Text style={styles.timeText} numberOfLines={2}>
              Départ {formatDateTime(trip.departureTime)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor(trip.status).color + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor(trip.status).color }]}>
              {labelStatus(trip.status).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.itineraryContainer}>
          <View style={styles.itineraryTimeline}>
            <View style={[styles.timelineDot, { backgroundColor: Colors.primary }]} />
            <View style={styles.timelineLine} />
            <View style={[styles.timelineDot, { backgroundColor: Colors.secondary }]} />
          </View>
          <View style={styles.itineraryDetails}>
            <View style={styles.itineraryPoint}>
              <Text style={styles.itineraryLabel}>Départ</Text>
              <Text style={styles.itineraryValue} numberOfLines={2}>{trip.departure.address}</Text>
            </View>
            <View style={styles.itineraryPoint}>
              <Text style={styles.itineraryLabel}>Arrivée</Text>
              <Text style={styles.itineraryValue} numberOfLines={2}>{trip.arrival.address}</Text>
            </View>
          </View>
        </View>

        {trip.status === 'upcoming' && (
          <TouchableOpacity style={styles.editRouteButton} onPress={routeEditor.openEditRouteModal} activeOpacity={0.9}>
            <Ionicons name="create-outline" size={16} color={Colors.primary} />
            <Text style={styles.editRouteButtonText}>Modifier les adresses</Text>
          </TouchableOpacity>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <View style={styles.statIconContainer}>
              <Ionicons name="people" size={18} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.statLabel}>Places</Text>
              <Text style={styles.statValue}>{trip.availableSeats} / {trip.totalSeats}</Text>
            </View>
          </View>
          <View style={styles.statItem}>
            <View style={styles.statIconContainer}>
              <Ionicons name="cash" size={18} color={Colors.success} />
            </View>
            <View>
              <Text style={styles.statLabel}>Prix</Text>
              <Text style={styles.statValue}>{trip.price} FC</Text>
            </View>
          </View>
        </View>

      </View>

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
