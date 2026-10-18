import { useBookingCards } from '../hooks/bookings/useBookingCards';
import { useBookingsFeed } from '@/hooks/bookings/useBookingsFeed';
import { HistoryPaginationFooter } from '@/components/ui/HistoryPaginationFooter';
import { BookingTab } from '../features/bookings/bookingsModel';
import { styles } from '../features/screen-styles/app/bookings/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import { trackEvent } from '@/services/analytics';
import { useCancelBookingMutation } from '@/store/api/bookingApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { NavigationContactModal } from '@/features/navigation/NavigationContactModal';
import { getNavigationContacts } from '@/features/navigation/navigationContacts';
import { useAppSelector } from '@/store/hooks';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BookingsScreen() {
  const router = useRouter();
  const leavingRef = useRef(false);
  useFocusEffect(useCallback(() => {
    leavingRef.current = false;
    return () => { leavingRef.current = true; };
  }, []));
  const handleBack = useCallback(() => {
    // Router actions are queued: a second tap must not pop the previous screen too.
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);
  const { showDialog } = useDialog();
  const [activeTab, setActiveTab] = useState<BookingTab>('active');
  const [contactBookingId, setContactBookingId] = useState<string | null>(null);
  const userId = useAppSelector(state => state.auth.user?.id);
  const onContact = useCallback((booking: Booking) => setContactBookingId(booking.id), []);

  const feed = useBookingsFeed(activeTab);
  const { activeBookings, displayBookings, isLoading, isFetching, isError, refetch } = feed;
  const contactBooking = activeBookings.find(booking => booking.id === contactBookingId && booking.status === 'accepted');
  const contacts = getNavigationContacts({ role: 'passenger', userId, booking: contactBooking, trip: contactBooking?.trip });
  const [cancelBooking, { isLoading: isCancelling }] = useCancelBookingMutation();

  const emptyText =
    activeTab === 'active'
      ? "Vous n'avez pas encore de réservation active."
      : 'Aucune réservation passée pour le moment.';

  const handleCancel = useCallback((bookingId: string) => {
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
              void trackEvent('booking_cancelled', {
                booking_id: bookingId,
                source_screen: 'bookings',
              });
              refetch();
            } catch (error: any) {
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: getApiErrorMessage(error, 'Impossible d\'annuler la réservation pour le moment.'),
              });
            }
          },
        },
      ],
    });
  }, [cancelBooking, refetch, showDialog]);

  const { renderBookingListItem } = useBookingCards({
    activeTab,
    router,
    onContact,
    handleCancel,
    isCancelling,
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Mes réservations</Text>
            <Text style={styles.headerSubtitle}>Suivez vos réservations en temps réel</Text>
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
            Historique
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

      <FlatList
        data={displayBookings}
        keyExtractor={booking => booking.id}
        renderItem={renderBookingListItem}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl refreshing={isFetching && !feed.loadingMore} onRefresh={refetch} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        ListFooterComponent={activeTab === 'history' ? <HistoryPaginationFooter
          hasMore={feed.hasMore} loading={feed.loadingMore} error={isError}
          loaded={displayBookings.length} onLoad={feed.loadMore} /> : null}
        ListEmptyComponent={isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loaderText}>Chargement de vos réservations…</Text>
          </View>
        ) : isError ? null : (
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
        )}
      />

      {contactBookingId && <NavigationContactModal contacts={contacts} role="passenger"
        onClose={() => setContactBookingId(null)} />}
    </SafeAreaView>
  );
}
