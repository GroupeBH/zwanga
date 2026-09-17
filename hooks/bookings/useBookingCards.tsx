import { BookingTab, STATUS_CONFIG } from '../../features/bookings/bookingsModel';
import { styles } from '../../features/screen-styles/app/bookings/index';
import { Colors } from '@/constants/styles';
import { useTripArrivalTime } from '@/hooks/useTripArrivalTime';
import { isApproximateArrival } from '@/utils/tripArrivalPreview';
import { formatDateTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import type { Booking } from '@/types';
import type { Router } from 'expo-router';

interface Params {
  activeTab: BookingTab;
  router: Router;
  setSelectedDriverPhone: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedDriverName: React.Dispatch<React.SetStateAction<string | null>>;
  setContactModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  handleCancel: (bookingId: string) => void;
  isCancelling: boolean;
}

export function useBookingCards(params: Params) {
  const renderBookingCard = (bookingId: string, booking: Booking) =>
    <BookingCardWithArrival key={bookingId} {...params} booking={booking} />;
  return { renderBookingCard };
}

const BookingCardWithArrival = React.memo(function BookingCardWithArrival({
  booking,
  activeTab,
  router,
  setSelectedDriverPhone,
  setSelectedDriverName,
  setContactModalVisible,
  handleCancel,
  isCancelling,
}: Params & { booking: Booking }) {
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
        : 'non disponible';

      return (
        <View
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
                  {trip ? `${formatDateTime(trip.departureTime)} → arrivée ${isApproximateArrival(trip) ? 'approx.' : 'estimée'} ${arrivalTimeDisplay}` : ''}
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
      </View>
      );
});
