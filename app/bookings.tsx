import { styles } from '../features/screen-styles/app/bookings/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { trackEvent } from '@/services/analytics';
import { useCancelBookingMutation, useGetMyBookingsQuery } from '@/store/api/bookingApi';
import type { BookingStatus } from '@/types';
import { formatDateTime } from '@/utils/dateHelpers';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { openWhatsApp } from '@/utils/phoneHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
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
  no_show: {
    label: 'Non embarqué',
    color: Colors.danger,
    background: 'rgba(239, 68, 68, 0.12)',
  },
  boarding_uncertain: {
    label: 'Embarquement non confirmé',
    color: Colors.warning,
    background: 'rgba(245, 158, 11, 0.14)',
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

  const activeBookings = useMemo(
    () => {
      const now = new Date();
      return (bookings ?? []).filter((booking) => {
        // Les réservations rejetées, annulées ou complétées ne sont pas actives
        if (booking.status === 'rejected' || booking.status === 'cancelled' || booking.status === 'no_show' || booking.status === 'boarding_uncertain' || booking.status === 'completed') {
          return false;
        }
        
        // Les réservations pending ou accepted sont actives seulement si le trajet n'est pas expiré
        if (booking.status === 'pending' || booking.status === 'accepted') {
          // Vérifier si le trajet associé a une date de départ passée
          if (booking.trip?.departureTime) {
            const departureDate = new Date(booking.trip.departureTime);
            // Si la date de départ est passée, la réservation est expirée
            if (booking.trip.status !== 'ongoing' && departureDate < now) {
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
        if (booking.status === 'rejected' || booking.status === 'cancelled' || booking.status === 'no_show' || booking.status === 'boarding_uncertain' || booking.status === 'completed') {
          return true;
        }
        
        // Les réservations pending ou accepted dont le trajet est expiré sont dans l'historique
        if (booking.status === 'pending' || booking.status === 'accepted') {
          if (booking.trip?.departureTime) {
            const departureDate = new Date(booking.trip.departureTime);
            // Si la date de départ est passée, la réservation est expirée et va dans l'historique
            if (booking.trip.status !== 'ongoing' && departureDate < now) {
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
      ? 'Vous n&apos;avez pas encore de réservation active.'
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

  const renderBookingCard = (bookingId: string, booking: typeof displayBookings[number], index: number) => {
    const BookingCardWithArrival = () => {
      const trip = booking.trip;
      
      // Vérifier si la réservation est expirée (trajet avec date de départ passée)
      const isExpired =
        trip?.status !== 'ongoing' &&
        trip?.departureTime &&
        new Date(trip.departureTime) < new Date();
      
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
        ? formatDateTime(calculatedArrivalTime.toISOString())
        : trip?.arrivalTime
        ? formatDateTime(trip.arrivalTime)
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
                  {trip?.departure?.name ?? 'Trajet'} → {trip?.arrival?.name ?? ''}
                </Text>
                <Text style={styles.bookingSubtitle} numberOfLines={1} ellipsizeMode="tail">
                  {trip ? `${formatDateTime(trip.departureTime)} -> arrivée estimee ${arrivalTimeDisplay}` : ''}
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
                  Prise en charge détectée. Synchronisation en cours.
                </Text>
              </View>
            )}
            {booking.droppedOffConfirmedByPassenger && !booking.droppedOff && (
              <View style={styles.confirmationBanner}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                <Text style={styles.confirmationBannerText}>
                  Arrivée détectée. Finalisation en cours.
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

          {/* Statut de prise en charge automatique */}
          {activeTab === 'active' && !isExpired && booking.status === 'accepted' && booking.pickedUp && !booking.pickedUpConfirmedByPassenger && (
            <View style={[styles.linkButton, styles.confirmButton]}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.white} />
              <Text style={[styles.linkButtonText, styles.confirmButtonText]}>À bord</Text>
            </View>
          )}

          {/* Statut d'arrivée automatique */}
          {activeTab === 'active' && !isExpired && booking.status === 'accepted' && booking.pickedUp && booking.pickedUpConfirmedByPassenger && !booking.droppedOffConfirmedByPassenger && !booking.droppedOff && (
            <View style={[styles.linkButton, styles.confirmButton]}>
              <Ionicons name="flag" size={16} color={Colors.white} />
              <Text style={[styles.linkButtonText, styles.confirmButtonText]}>Arrivée en cours</Text>
            </View>
          )}

          {/* Bouton "Noter le conducteur" - Après confirmation de l'arrivée (actif et historique) */}
          {booking.status === 'completed' && booking.droppedOffConfirmedByPassenger && trip?.id && (
            <TouchableOpacity
              style={[styles.linkButton, styles.rateButton]}
              onPress={() => router.push(`/rate/${trip.id}`)}
            >
              <Ionicons name="star" size={16} color={Colors.secondary} />
              <Text style={[styles.linkButtonText, styles.rateButtonText]}>Noter le conducteur</Text>
            </TouchableOpacity>
          )}

          {/* Bouton "Suivre le trajet" - Pour les réservations acceptées avec trajet en cours */}
          {activeTab === 'active' && !isExpired && booking.status === 'accepted' && trip?.status === 'ongoing' && (
            <TouchableOpacity
              style={[styles.linkButton, styles.navigationButton]}
              onPress={() => router.push(`/booking/navigate/${booking.id}`)}
            >
              <Ionicons name="navigate" size={16} color={Colors.white} />
              <Text style={[styles.linkButtonText, styles.navigationButtonText]}>Suivre le trajet</Text>
            </TouchableOpacity>
          )}

          {/* Bouton WhatsApp - Seulement pour les réservations actives acceptées et non expirées */}
          {activeTab === 'active' && !isExpired && booking.status === 'accepted' && trip?.driver?.phone && 
           !(booking.pickedUp && !booking.pickedUpConfirmedByPassenger) &&
           !(booking.droppedOffConfirmedByPassenger && !booking.droppedOff) && (
            <TouchableOpacity
              style={[styles.linkButton, styles.callButton]}
              onPress={() => {
                setSelectedDriverPhone(trip.driver!.phone!);
                setSelectedDriverName(trip.driverName);
                setContactModalVisible(true);
              }}
            >
              <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
              <Text style={[styles.linkButtonText, styles.callButtonText]}>WhatsApp</Text>
            </TouchableOpacity>
          )}

          {/* Bouton "Annuler" - Seulement pour les réservations actives et non expirées */}
          {activeTab === 'active' && !isExpired && (booking.status === 'pending' || booking.status === 'accepted') && 
           !(booking.pickedUp && !booking.pickedUpConfirmedByPassenger) &&
           !(booking.droppedOffConfirmedByPassenger && !booking.droppedOff) && (
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


