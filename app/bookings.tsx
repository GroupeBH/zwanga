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
import { openWhatsApp } from '@/utils/phoneHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BookingsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const [activeTab, setActiveTab] = useState<BookingTab>('active');
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [selectedDriverPhone, setSelectedDriverPhone] = useState<string | null>(null);
  const [selectedDriverName, setSelectedDriverName] = useState<string | null>(null);

  const feed = useBookingsFeed(activeTab);
  const { activeBookings, displayBookings, isLoading, isFetching, isError, refetch } = feed;
  const [cancelBooking, { isLoading: isCancelling }] = useCancelBookingMutation();

  const emptyText =
    activeTab === 'active'
      ? "Vous n'avez pas encore de réservation active."
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
  };

  const { renderBookingCard } = useBookingCards({
    activeTab,
    router,
    setSelectedDriverPhone,
    setSelectedDriverName,
    setContactModalVisible,
    handleCancel,
    isCancelling,
  });

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
        renderItem={({ item }) => renderBookingCard(item.id, item)}
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
        ) : (
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

      {/* Contact Modal */}
      <Modal
        visible={contactModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setContactModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.contactModalOverlay}
          activeOpacity={1}
          onPress={() => setContactModalVisible(false)}
        >
          <Animated.View entering={FadeInDown} style={styles.contactModalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.contactModalHeader}>
              <View style={styles.contactModalIconWrapper}>
                <View style={styles.contactModalIconBadge}>
                  <Ionicons name="logo-whatsapp" size={32} color="#25D366" />
                </View>
              </View>
              <Text style={styles.contactModalTitle}>
                Contacter {selectedDriverName || 'le conducteur'}
              </Text>
              <Text style={styles.contactModalSubtitle}>
                Contact via WhatsApp uniquement
              </Text>
            </View>

            <View style={styles.contactModalActions}>
              <TouchableOpacity
                style={[styles.contactModalButton, styles.contactModalButtonWhatsApp]}
                onPress={async () => {
                  setContactModalVisible(false);
                  if (selectedDriverPhone) {
                    await openWhatsApp(selectedDriverPhone, (errorMsg) => {
                      showDialog({
                        variant: 'danger',
                        title: 'Erreur',
                        message: errorMsg,
                      });
                    });
                  }
                }}
              >
                <View style={styles.contactModalButtonIcon}>
                  <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                </View>
                <View style={styles.contactModalButtonContent}>
                  <Text style={styles.contactModalButtonTitle}>WhatsApp</Text>
                  <Text style={styles.contactModalButtonSubtitle}>Envoyer un message WhatsApp</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.contactModalCancelButton}
              onPress={() => setContactModalVisible(false)}
            >
              <Text style={styles.contactModalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
