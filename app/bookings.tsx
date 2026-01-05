import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import {
  useCancelBookingMutation,
  useConfirmDropoffByPassengerMutation,
  useConfirmPickupByPassengerMutation,
  useGetMyBookingsQuery,
} from '@/store/api/bookingApi';
import type { BookingStatus } from '@/types';
import { formatDateWithRelativeLabel, formatTime } from '@/utils/dateHelpers';
import { openPhoneCall, openWhatsApp } from '@/utils/phoneHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  expired: {
    label: 'Expirée',
    color: Colors.gray[600],
    background: 'rgba(156, 163, 175, 0.2)',
  },
};

export default function BookingsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const [activeTab, setActiveTab] = useState<BookingTab>('active');
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [selectedDriverPhone, setSelectedDriverPhone] = useState<string | null>(null);
  const [selectedDriverName, setSelectedDriverName] = useState<string | null>(null);

  const {
    data: bookings,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetMyBookingsQuery();
  const [cancelBooking, { isLoading: isCancelling }] = useCancelBookingMutation();
  const [confirmPickupByPassenger, { isLoading: isConfirmingPickup }] = useConfirmPickupByPassengerMutation();
  const [confirmDropoffByPassenger, { isLoading: isConfirmingDropoff }] = useConfirmDropoffByPassengerMutation();

  const activeBookings = useMemo(
    () => {
      const now = new Date();
      return (bookings ?? []).filter((booking) => {
        // Les réservations rejetées, annulées ou complétées ne sont pas actives
        if (booking.status === 'rejected' || booking.status === 'cancelled' || booking.status === 'completed') {
          return false;
        }
        
        // Les réservations pending ou accepted sont actives seulement si le trajet n'est pas expiré
        if (booking.status === 'pending' || booking.status === 'accepted') {
          // Vérifier si le trajet associé a une date de départ passée
          if (booking.trip?.departureTime) {
            const departureDate = new Date(booking.trip.departureTime);
            // Si la date de départ est passée, la réservation est expirée
            if (departureDate < now) {
              return false;
            }
          }
          return true;
        }
        
        return false;
      });
    },
    [bookings],
  );

  const historyBookings = useMemo(
    () => {
      const now = new Date();
      return (bookings ?? []).filter((booking) => {
        // Les réservations rejetées, annulées ou complétées sont dans l'historique
        if (booking.status === 'rejected' || booking.status === 'cancelled' || booking.status === 'completed') {
          return true;
        }
        
        // Les réservations pending ou accepted dont le trajet est expiré sont dans l'historique
        if (booking.status === 'pending' || booking.status === 'accepted') {
          if (booking.trip?.departureTime) {
            const departureDate = new Date(booking.trip.departureTime);
            // Si la date de départ est passée, la réservation est expirée et va dans l'historique
            if (departureDate < now) {
              return true;
            }
          }
        }
        
        return false;
      });
    },
    [bookings],
  );

  const displayBookings = activeTab === 'active' ? activeBookings : historyBookings;
  const emptyText =
    activeTab === 'active'
      ? 'Vous n\’avez pas encore de réservation active.'
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
                'Impossible d\'annuler la réservation pour le moment.';
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

  const handleConfirmPickup = async (bookingId: string) => {
    try {
      await confirmPickupByPassenger(bookingId).unwrap();
      showDialog({
        variant: 'success',
        title: 'Confirmation réussie',
        message: 'Vous avez confirmé votre prise en charge.',
      });
      refetch();
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de confirmer la prise en charge pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const handleConfirmDropoff = async (bookingId: string) => {
    try {
      await confirmDropoffByPassenger(bookingId).unwrap();
      showDialog({
        variant: 'success',
        title: 'Confirmation réussie',
        message: 'Vous avez confirmé votre dépose. La réservation est maintenant complétée.',
      });
      refetch();
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de confirmer la dépose pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const renderBookingCard = (bookingId: string, booking: typeof displayBookings[number], index: number) => {
    const BookingCardWithArrival = () => {
      const trip = booking.trip;
      
      // Vérifier si la réservation est expirée (trajet avec date de départ passée)
      const isExpired = trip?.departureTime && new Date(trip.departureTime) < new Date();
      
      // Utiliser le statut "expiré" si applicable, sinon utiliser le statut normal
      const statusConfig = isExpired && (booking.status === 'pending' || booking.status === 'accepted')
        ? {
            label: 'Expirée',
            color: Colors.gray[600],
            background: 'rgba(107, 114, 128, 0.18)',
          }
        : STATUS_CONFIG[booking.status] || {
            label: booking.status || 'Inconnu',
            color: Colors.gray[600],
            background: 'rgba(156, 163, 175, 0.2)',
          };
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
              <View style={styles.bookingHeaderTextContainer}>
                <Text style={styles.bookingTitle} numberOfLines={1} ellipsizeMode="tail">
                  {trip?.departure.name ?? 'Trajet'} → {trip?.arrival.name ?? ''}
                </Text>
                <Text style={styles.bookingSubtitle} numberOfLines={1} ellipsizeMode="tail">
                  {trip ? `${formatDateWithRelativeLabel(trip.departureTime)} → ${arrivalTimeDisplay}` : ''}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.background }]}>
              <Text style={[styles.statusText, { color: statusConfig.color }]} numberOfLines={1}>
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
              {trip && trip.price === 0 ? 'Gratuit' : trip ? `${booking.numberOfSeats * trip.price} FC` : `${booking.numberOfSeats} FC`}
            </Text>
          </View>
        </View>

        {/* Indicateur de confirmation en attente */}
        {activeTab === 'active' && !isExpired && booking.status === 'accepted' && (
          <>
            {booking.pickedUp && !booking.pickedUpConfirmedByPassenger && (
              <View style={styles.confirmationBanner}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                <Text style={styles.confirmationBannerText}>
                  Le conducteur a confirmé votre prise en charge. Veuillez confirmer également.
                </Text>
              </View>
            )}
            {booking.droppedOff && !booking.droppedOffConfirmedByPassenger && (
              <View style={styles.confirmationBanner}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                <Text style={styles.confirmationBannerText}>
                  Le conducteur a confirmé votre dépose. Veuillez confirmer également.
                </Text>
              </View>
            )}
          </>
        )}

        <View style={styles.bookingFooter}>
          {/* Bouton "Voir le trajet" - Toujours accessible, même pour les réservations expirées dans l'historique */}
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push(`/trip/${booking.tripId}`)}
          >
            <Ionicons name="navigate" size={16} color={Colors.primary} />
            <Text style={styles.linkButtonText}>Voir le trajet</Text>
          </TouchableOpacity>

          {/* Bouton "Confirmer la prise en charge" - Quand le driver a confirmé mais pas le passager */}
          {activeTab === 'active' && !isExpired && booking.status === 'accepted' && booking.pickedUp && !booking.pickedUpConfirmedByPassenger && (
            <TouchableOpacity
              style={[styles.linkButton, styles.confirmButton]}
              onPress={() => handleConfirmPickup(booking.id)}
              disabled={isConfirmingPickup}
            >
              {isConfirmingPickup ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.white} />
                  <Text style={[styles.linkButtonText, styles.confirmButtonText]}>Confirmer prise en charge</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Bouton "Confirmer la dépose" - Quand le driver a confirmé mais pas le passager */}
          {activeTab === 'active' && !isExpired && booking.status === 'accepted' && booking.droppedOff && !booking.droppedOffConfirmedByPassenger && (
            <TouchableOpacity
              style={[styles.linkButton, styles.confirmButton]}
              onPress={() => handleConfirmDropoff(booking.id)}
              disabled={isConfirmingDropoff}
            >
              {isConfirmingDropoff ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.white} />
                  <Text style={[styles.linkButtonText, styles.confirmButtonText]}>Confirmer dépose</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Bouton "Noter le conducteur" - Après confirmation de dépose (actif et historique) */}
          {booking.status === 'completed' && booking.droppedOffConfirmedByPassenger && trip?.id && (
            <TouchableOpacity
              style={[styles.linkButton, styles.rateButton]}
              onPress={() => router.push(`/rate/${trip.id}`)}
            >
              <Ionicons name="star" size={16} color={Colors.secondary} />
              <Text style={[styles.linkButtonText, styles.rateButtonText]}>Noter le conducteur</Text>
            </TouchableOpacity>
          )}

          {/* Bouton "Appeler" - Seulement pour les réservations actives acceptées et non expirées */}
          {activeTab === 'active' && !isExpired && booking.status === 'accepted' && trip?.driver?.phone && 
           !(booking.pickedUp && !booking.pickedUpConfirmedByPassenger) &&
           !(booking.droppedOff && !booking.droppedOffConfirmedByPassenger) && (
            <TouchableOpacity
              style={[styles.linkButton, styles.callButton]}
              onPress={() => {
                setSelectedDriverPhone(trip.driver!.phone!);
                setSelectedDriverName(trip.driverName);
                setContactModalVisible(true);
              }}
            >
              <Ionicons name="call" size={16} color={Colors.success} />
              <Text style={[styles.linkButtonText, styles.callButtonText]}>Appeler</Text>
            </TouchableOpacity>
          )}

          {/* Bouton "Annuler" - Seulement pour les réservations actives et non expirées */}
          {activeTab === 'active' && !isExpired && (booking.status === 'pending' || booking.status === 'accepted') && 
           !(booking.pickedUp && !booking.pickedUpConfirmedByPassenger) &&
           !(booking.droppedOff && !booking.droppedOffConfirmedByPassenger) && (
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
                  <Ionicons name="call" size={32} color={Colors.primary} />
                </View>
              </View>
              <Text style={styles.contactModalTitle}>
                Contacter {selectedDriverName || 'le conducteur'}
              </Text>
              <Text style={styles.contactModalSubtitle}>
                Choisissez comment contacter le conducteur
              </Text>
            </View>

            <View style={styles.contactModalActions}>
              <TouchableOpacity
                style={[styles.contactModalButton, styles.contactModalButtonCall]}
                onPress={async () => {
                  setContactModalVisible(false);
                  if (selectedDriverPhone) {
                    await openPhoneCall(selectedDriverPhone, (errorMsg) => {
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
                  <Ionicons name="call" size={24} color={Colors.success} />
                </View>
                <View style={styles.contactModalButtonContent}>
                  <Text style={styles.contactModalButtonTitle}>Appeler</Text>
                  <Text style={styles.contactModalButtonSubtitle}>Ouvrir l'application d'appel</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>

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
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  bookingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
  },
  bookingHeaderTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  bookingTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingSubtitle: {
    color: Colors.gray[500],
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    flexShrink: 0,
    alignSelf: 'flex-start',
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
  callButton: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  callButtonText: {
    color: Colors.success,
  },
  dangerButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  dangerButtonText: {
    color: Colors.danger,
  },
  confirmationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(247, 184, 1, 0.15)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  confirmationBannerText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  confirmButton: {
    backgroundColor: Colors.secondary,
  },
  confirmButtonText: {
    color: Colors.white,
  },
  rateButton: {
    backgroundColor: 'rgba(247, 184, 1, 0.1)',
  },
  rateButtonText: {
    color: Colors.secondary,
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
  contactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  contactModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
  },
  contactModalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  contactModalIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  contactModalIconBadge: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  contactModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  contactModalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  contactModalActions: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  contactModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
  },
  contactModalButtonCall: {
    borderColor: 'rgba(46, 204, 113, 0.3)',
    backgroundColor: 'rgba(46, 204, 113, 0.05)',
  },
  contactModalButtonWhatsApp: {
    borderColor: 'rgba(37, 211, 102, 0.3)',
    backgroundColor: 'rgba(37, 211, 102, 0.05)',
  },
  contactModalButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  contactModalButtonContent: {
    flex: 1,
  },
  contactModalButtonTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 2,
  },
  contactModalButtonSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  contactModalCancelButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  contactModalCancelText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[600],
  },
});

