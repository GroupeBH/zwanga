import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, CommonStyles } from '@/constants/styles';
import {
  useCancelBookingMutation,
  useGetMyBookingsQuery,
} from '@/store/api/bookingApi';
import type { BookingStatus } from '@/types';
import { formatTime } from '@/utils/dateHelpers';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';

type BookingTab = 'active' | 'history';

const STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; background: string }
> = {
  pending: {
    label: 'En attente',
    color: Colors.secondary,
    background: 'rgba(247, 184, 1, 0.2)',
  },
  accepted: {
    label: 'Confirmée',
    color: Colors.success,
    background: 'rgba(46, 204, 113, 0.18)',
  },
  rejected: {
    label: 'Refusée',
    color: Colors.danger,
    background: 'rgba(239, 68, 68, 0.16)',
  },
  cancelled: {
    label: 'Annulée',
    color: Colors.gray[600],
    background: 'rgba(156, 163, 175, 0.2)',
  },
  completed: {
    label: 'Terminée',
    color: Colors.gray[600],
    background: 'rgba(107, 114, 128, 0.18)',
  },
};

export default function BookingsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const [activeTab, setActiveTab] = useState<BookingTab>('active');

  const {
    data: bookings,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetMyBookingsQuery();
  const [cancelBooking, { isLoading: isCancelling }] = useCancelBookingMutation();

  const activeBookings = useMemo(
    () => (bookings ?? []).filter((booking) => booking.status === 'pending' || booking.status === 'accepted'),
    [bookings],
  );

  const historyBookings = useMemo(
    () => (bookings ?? []).filter((booking) => booking.status === 'rejected' || booking.status === 'cancelled' || booking.status === 'completed'),
    [bookings],
  );

  const displayBookings = activeTab === 'active' ? activeBookings : historyBookings;
  const emptyText =
    activeTab === 'active'
      ? 'Vous n’avez pas encore de réservation active.'
      : 'Aucune réservation passée pour le moment.';

  const handleCancel = (bookingId: string) => {
    showDialog({
      variant: 'warning',
      title: 'Annuler la réservation',
      message: 'Souhaitez-vous annuler cette réservation ? Le conducteur en sera informé.',
      actions: [
        { label: 'Garder', variant: 'ghost' },
        {
          label: 'Oui, annuler',
          variant: 'primary',
          onPress: async () => {
            try {
              await cancelBooking(bookingId).unwrap();
              refetch();
            } catch (error: any) {
              const message =
                error?.data?.message ??
                error?.error ??
                'Impossible d’annuler la réservation pour le moment.';
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: Array.isArray(message) ? message.join('\n') : message,
              });
            }
          },
        },
      ],
    });
  };

  const renderBookingCard = (bookingId: string, booking: typeof displayBookings[number], index: number) => {
    const BookingCardWithArrival = () => {
      const statusConfig = STATUS_CONFIG[booking.status];
      const trip = booking.trip;
      const calculatedArrivalTime = useTripArrivalTime(trip || null);
      const arrivalTimeDisplay = calculatedArrivalTime && trip
        ? formatTime(calculatedArrivalTime.toISOString())
        : trip?.arrivalTime
        ? formatTime(trip.arrivalTime)
        : '';

      return (
        <Animated.View
          key={bookingId}
          entering={FadeInDown.delay(index * 80)}
          style={styles.bookingCard}
        >
          <View style={styles.bookingHeader}>
            <View style={styles.bookingHeaderLeft}>
              {trip?.driverAvatar ? (
                <Image
                  source={{ uri: trip.driverAvatar }}
                  style={styles.bookingDriverAvatar}
                />
              ) : (
                <View style={styles.bookingDriverAvatar}>
                  <Ionicons name="person" size={20} color={Colors.gray[500]} />
                </View>
              )}
              <View>
                <Text style={styles.bookingTitle}>
                  {trip?.departure.name ?? 'Trajet'} → {trip?.arrival.name ?? ''}
                </Text>
                <Text style={styles.bookingSubtitle}>
                  {trip ? `${formatTime(trip.departureTime)} → ${arrivalTimeDisplay}` : ''}
                </Text>
              </View>
            </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.background }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        <View style={styles.bookingMeta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Places</Text>
            <Text style={styles.metaValue}>{booking.numberOfSeats}</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Montant estimé</Text>
            <Text style={[styles.metaValue, { color: Colors.success }]}>
              {trip ? booking.numberOfSeats * trip.price : booking.numberOfSeats} FC
            </Text>
          </View>
        </View>

        <View style={styles.bookingFooter}>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push(`/trip/${booking.tripId}`)}
          >
            <Ionicons name="navigate" size={16} color={Colors.primary} />
            <Text style={styles.linkButtonText}>Voir le trajet</Text>
          </TouchableOpacity>

          {activeTab === 'active' && (booking.status === 'pending' || booking.status === 'accepted') && (
            <TouchableOpacity
              style={[styles.linkButton, styles.dangerButton]}
              onPress={() => handleCancel(booking.id)}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color={Colors.danger} />
              ) : (
                <>
                  <Ionicons name="close-circle" size={16} color={Colors.danger} />
                  <Text style={[styles.linkButtonText, styles.dangerButtonText]}>Annuler</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
      );
    };

    return <BookingCardWithArrival key={bookingId} />;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Mes réservations</Text>
            <Text style={styles.headerSubtitle}>Suivez vos demandes en temps réel</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerIcon} onPress={() => refetch()}>
          <Ionicons name="refresh" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'active' && styles.tabButtonActive]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
            Actives ({activeBookings.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            Historique ({historyBookings.length})
          </Text>
        </TouchableOpacity>
      </View>

      {isError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={16} color={Colors.white} />
          <Text style={styles.errorText}>Impossible de charger les réservations.</Text>
          <TouchableOpacity onPress={refetch}>
            <Text style={styles.errorAction}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading && displayBookings.length === 0 ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loaderText}>Chargement de vos réservations…</Text>
          </View>
        ) : displayBookings.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name={activeTab === 'active' ? 'calendar-outline' : 'albums-outline'}
                size={40}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>Pas encore de réservation</Text>
            <Text style={styles.emptySubtitle}>{emptyText}</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/search')}
            >
              <Ionicons name="search" size={18} color={Colors.white} />
              <Text style={styles.primaryButtonText}>Rechercher un trajet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          displayBookings.map((booking, index) => renderBookingCard(booking.id, booking, index))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    ...CommonStyles.shadowSm,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    padding: 4,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  tabButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
  },
  tabTextActive: {
    color: Colors.white,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.danger,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    ...CommonStyles.shadowSm,
  },
  errorText: {
    flex: 1,
    color: Colors.white,
    marginLeft: Spacing.sm,
  },
  errorAction: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  scrollViewContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  loaderContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  loaderText: {
    marginTop: Spacing.sm,
    color: Colors.gray[500],
  },
  bookingCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bookingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bookingDriverAvatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingSubtitle: {
    color: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  bookingMeta: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  metaDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.gray[200],
    marginHorizontal: Spacing.md,
  },
  bookingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    marginRight: Spacing.sm,
  },
  linkButtonText: {
    marginLeft: Spacing.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  dangerButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  dangerButtonText: {
    color: Colors.danger,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    color: Colors.gray[500],
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    marginLeft: Spacing.sm,
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
});

