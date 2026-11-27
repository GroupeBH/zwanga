import { TripShareAction } from '@/components/trip/TripShareAction';
import { useTripDetailData } from '../../hooks/trip-detail/useTripDetailData';
import { useTripDetailBookingState } from '../../hooks/trip-detail/useTripDetailBookingState';
import { useTripDetailAccess } from '../../hooks/trip-detail/useTripDetailAccess';
import { useTripDetailPresentation } from '../../hooks/trip-detail/useTripDetailPresentation';
import { TripSummary } from './TripSummary';
import { TripCoPassengers } from './TripCoPassengers';
import { RidePaymentNotice } from '@/features/ride-payment/RidePaymentNotice';
import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { trackingSocket } from '@/services/trackingSocket';
import type { Booking } from '@/types';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';

// Les sections apparaissaient 460–560 ms après l'ouverture : l'écran semblait lent.
const SECTION_ENTER_DELAY = 120;
const PAYMENT_MODE_LABELS: Record<string, string> = { cash: 'Cash', electronic: 'Électronique', points: 'Jetons' };
const PAYMENT_MODE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline', electronic: 'card-outline', points: 'wallet-outline',
};

interface TripDetailContentSheetProps {
  hasRenderableTripMap: boolean;
  config: { color: string; bgColor: string; label: string; };
  presentation: ReturnType<typeof useTripDetailPresentation>;
  data: ReturnType<typeof useTripDetailData>;
  access: ReturnType<typeof useTripDetailAccess>;
  bookingState: ReturnType<typeof useTripDetailBookingState>;
  activity: { activeBooking: Booking | null; bookingForTrip: Booking | null; canTrackTrip: boolean; refreshBookingLists: () => void; onRefresh: () => Promise<void>; driverReviewAverage: number; driverReviewCount: number; dismissTripGuide: () => void; };
  contact: { handleShareTrip: () => Promise<void>; handleContactDriver: () => Promise<void>; isOpeningConversation: boolean; };
  safety: { openTripSecurityModal: () => void; openSosModal: () => void; closeSosModal: () => void; closeTripSecurityModal: () => void; };
}

export function TripDetailContentSheet({
  hasRenderableTripMap,
  config,
  presentation,
  data,
  access,
  bookingState,
  activity,
  contact,
  safety,
}: TripDetailContentSheetProps) {
  return (
    <View style={[styles.tripDetailSheet, !hasRenderableTripMap && styles.tripDetailSheetNoMap,
      !data.isTripDriver && !activity.activeBooking && { backgroundColor: '#FFFBF7' }]}>
      <View style={styles.tripSheetHandle} />

      <TripSummary
        paymentNotice={<RidePaymentNotice booking={activity.activeBooking} active={data.isScreenActive} />}
        booking={activity.activeBooking}
        tripArrivalClockLabel={presentation.tripArrivalClockLabel}
        isTripDriver={data.isTripDriver}
        config={config}
        routeLabels={presentation.routeLabels}
        tripPriceLabel={presentation.tripPriceLabel}
        trip={data.trip}
        tripDepartureTimeLabel={presentation.tripDepartureTimeLabel}
        tripArrivalTimeLabel={presentation.tripArrivalTimeLabel}
        tripSeatsLabel={presentation.tripSeatsLabel}
        tripRouteDistanceLabel={presentation.tripRouteDistanceLabel}
        progress={access.progress}
        estimatedArrivalTime={bookingState.estimatedArrivalTime}
        router={data.router}
        driverReviewAverage={activity.driverReviewAverage}
        setVehicleDetailModalVisible={bookingState.setVehicleDetailModalVisible}
        tripVehicleIconName={presentation.tripVehicleIconName}
        tripVehicleLabel={presentation.tripVehicleLabel}
        tripVehicleMetaLabel={presentation.tripVehicleMetaLabel}
        handleContactDriver={contact.handleContactDriver}
        isOpeningConversation={contact.isOpeningConversation}
        driverPhone={data.driverPhone}
        setContactModalVisible={bookingState.setContactModalVisible}
      />

    {!data.isTripDriver && <TripCoPassengers key={`${data.user?.id}:${data.tripId}:${activity.activeBooking?.id}`}
      trip={data.trip} booking={activity.activeBooking} active={data.isScreenActive} />}

    {data.isTripDriver && data.tripExpired && <View style={styles.section}>
      <Text style={styles.trackingSubtitle}>
        {data.trip?.canReprogram
          ? 'Modifiez la date pour republier ce trajet. Les anciennes réservations restent dans l’historique.'
          : 'Ce départ a expiré. Les détails de votre trajet restent consultables.'}
      </Text>
    </View>}

    {(data.isTripDriver || !activity.activeBooking) && !!data.trip?.acceptedPaymentModes?.length && Number(data.trip.price) > 0 && <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">PAIEMENTS ACCEPTÉS</Text>
      <View style={styles.paymentModesRow}>
        {data.trip.acceptedPaymentModes.map(mode => (
          <View key={mode} style={styles.paymentModeChip}>
            <Ionicons name={PAYMENT_MODE_ICONS[mode] ?? 'cash-outline'} size={15} color={Colors.successDark} />
            <Text style={styles.paymentModeChipText}>{PAYMENT_MODE_LABELS[mode] ?? mode}</Text>
          </View>
        ))}
      </View>
    </View>}

    {activity.canTrackTrip && data.trip?.status !== 'ongoing' && (
      <View style={styles.trackingBanner}>
        <View style={styles.trackingBannerLeft}>
          <View
            style={[
              styles.trackingStatusDot,
              data.liveDriverCoordinate ? styles.trackingStatusDotActive : styles.trackingStatusDotIdle,
            ]}
          />
          <View style={styles.trackingBannerCopy}>
            <Text style={styles.trackingTitle}>{access.trackingStatusTitle}</Text>
            <Text style={styles.trackingSubtitle}>{access.trackingStatusSubtitle}</Text>
          </View>
        </View>
        {!data.isTripDriver && (
          <TouchableOpacity
            style={styles.trackingRefreshButton}
            accessibilityRole="button"
            accessibilityLabel="Actualiser la position du conducteur"
            hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
            onPress={() => {
              if (data.trip) {
                trackingSocket.requestDriverLocation(data.trip.id);
              }
            }}
          >
            <Ionicons name="refresh" size={16} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    )}

    {access.showPassengerSecurityAccess && access.isPassengerSecurityLocked && <View style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 14, backgroundColor: '#EDF5F0', padding: 12, flexDirection: 'row', gap: 10 }}>
      <Ionicons name="shield-checkmark-outline" size={20} color="#116E3A" />
      <View style={{ flex: 1 }}><Text style={{ color: '#1E294A', fontWeight: '700', fontSize: 13 }}>Partage du trajet et bouton SOS</Text>
        <Text style={{ color: '#5E697B', fontSize: 12, lineHeight: 18 }}>Activés dès que votre réservation est confirmée.</Text></View>
    </View>}
    {access.showPassengerSecurityAccess && !access.isPassengerSecurityLocked && !hasRenderableTripMap && (
      <Animated.View entering={FadeInDown.delay(SECTION_ENTER_DELAY)} style={styles.section}>
        <View style={[styles.sectionCard, styles.tripSafetyPassengerCard]}>
          <TouchableOpacity
            style={[
              styles.tripSafetyCompactSosButton,
              access.isPassengerSecurityLocked && styles.tripSafetyCompactButtonBlurred,
            ]}
            onPress={safety.openSosModal}
            disabled={access.isPassengerSecurityLocked}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="SOS, contacter les urgences"
            accessibilityState={{ disabled: access.isPassengerSecurityLocked }}
          >
            <Ionicons
              name="call"
              size={18}
              color={access.isPassengerSecurityLocked ? Colors.gray[400] : Colors.white}
            />
            <Text
              style={[
                styles.tripSafetyCompactSosText,
                access.isPassengerSecurityLocked && styles.tripSafetyCompactTextBlurred,
              ]}
            >
              SOS
            </Text>
          </TouchableOpacity>

          <TripShareAction onShare={contact.handleShareTrip} disabled={bookingState.isCreatingTripShareLink || !access.canAccessTripSecurity || access.isPassengerSecurityLocked} />
        </View>
      </Animated.View>
    )}

    {/* Passagers */}
    {data.isTripDriver && data.tripBookings && data.tripBookings.length > 0 && (
      <Animated.View entering={FadeInDown.delay(SECTION_ENTER_DELAY + 40)} style={styles.section}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle} accessibilityRole="header">PASSAGERS</Text>
          <View style={styles.passengersContainer}>
            {data.tripBookings
              .filter((booking) => booking.status === 'accepted')
              .map((booking) => (
                <TouchableOpacity
                  key={booking.id}
                  style={styles.passengerItem}
                  onPress={() => data.router.push(`/passenger/${booking.passengerId}`)}
                  activeOpacity={0.7}
                >
                  {booking.passengerAvatar ? (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        bookingState.setSelectedImageUri(booking.passengerAvatar!);
                        bookingState.setImageModalVisible(true);
                      }}
                    >
                      <Image
                        source={{ uri: booking.passengerAvatar }}
                        style={styles.passengerAvatar}
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.passengerAvatar}>
                      <Ionicons name="person" size={20} color={Colors.gray[500]} />
                    </View>
                  )}
                  <View style={styles.passengerInfo}>
                    <Text style={styles.passengerName}>
                      {booking.passengerName || 'Passager'}
                    </Text>
                    <Text style={styles.passengerSeats}>
                      {booking.numberOfSeats} place{booking.numberOfSeats > 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                </TouchableOpacity>
              ))}
            {data.tripBookings.filter((booking) => booking.status === 'accepted').length === 0 && (
              <Text style={styles.noPassengersText}>Aucun passager confirmé</Text>
            )}
          </View>
        </View>
      </Animated.View>
    )}

    {access.showPassengerVehicleReminder && (
      <Animated.View entering={FadeInDown.delay(SECTION_ENTER_DELAY + 80)} style={styles.section}>
        <View style={[styles.sectionCard, styles.securityReminderCard]}>
          {/* <View style={styles.securityReminderHeader}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.secondary} />
            <Text style={styles.securityReminderTitle}>Vérification avant embarquement</Text>
          </View> */}
          <View style={styles.securityReminderIcon}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.secondaryDark} />
          </View>
          <Text style={styles.securityReminderText}>
            Avant de monter, vérifiez que le véhicule devant vous correspond exactement à celui du trajet.
          </Text>
          {/* <View style={styles.securityReminderVehicleBox}>
            <Text style={styles.securityReminderVehicleLabel}>Véhicule attendu</Text>
            <Text style={styles.securityReminderVehicleValue}>{tripVehicleIdentity}</Text>
          </View> */}
        </View>
      </Animated.View>
    )}

    {access.showDriverVehicleReminder && (
      <Animated.View entering={FadeInDown.delay(SECTION_ENTER_DELAY + 80)} style={styles.section}>
        <View style={[styles.sectionCard, styles.tripSafetyCard]}>
          <View style={styles.tripSafetyHeader}>
            <View style={styles.tripSafetyIconWrap}>
              <Ionicons name="car-sport" size={20} color={Colors.primary} />
            </View>
            <View style={styles.tripSafetyHeaderCopy}>
              <Text style={styles.tripSafetyTitle}>Sécurité du trajet</Text>
              <Text style={styles.tripSafetySubtitle}>
                Utilisez le véhicule prévu et gardez vos proches informés.
              </Text>
            </View>
          </View>

          <View style={styles.tripSafetyNotice}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
            <Text style={styles.tripSafetyNoticeText} numberOfLines={2}>
              Véhicule prévu : {access.tripVehicleIdentity}
            </Text>
          </View>

          <View style={styles.tripSafetyActions}>
            <TouchableOpacity
              style={[styles.tripSafetyActionButton, styles.tripSafetySosButton]}
              onPress={safety.openSosModal}
              activeOpacity={0.9}
            >
              <View style={[styles.tripSafetyActionIcon, styles.tripSafetySosIcon]}>
                <Ionicons name="call" size={18} color={Colors.danger} />
              </View>
              <View style={styles.tripSafetyActionCopy}>
                <Text style={[styles.tripSafetyActionTitle, styles.tripSafetySosTitle]}>SOS</Text>
                <Text style={[styles.tripSafetyActionSubtitle, styles.tripSafetySosSubtitle]} numberOfLines={1}>
                  Police et urgences
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.white} />
            </TouchableOpacity>

            <TripShareAction onShare={contact.handleShareTrip} disabled={bookingState.isCreatingTripShareLink} />
          </View>
        </View>
      </Animated.View>
    )}
    </View>
  );
}
