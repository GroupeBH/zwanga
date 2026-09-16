import { useTripDetailData } from '../../hooks/trip-detail/useTripDetailData';
import { useTripDetailBookingState } from '../../hooks/trip-detail/useTripDetailBookingState';
import { useTripDetailAccess } from '../../hooks/trip-detail/useTripDetailAccess';
import { useTripDetailPresentation } from '../../hooks/trip-detail/useTripDetailPresentation';
import { TripSummary } from './TripSummary';
import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { trackingSocket } from '@/services/trackingSocket';
import type { Booking } from '@/types';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';

interface TripDetailContentSheetProps {
  hasRenderableTripMap: boolean;
  config: { color: string; bgColor: string; label: string; };
  presentation: ReturnType<typeof useTripDetailPresentation>;
  data: ReturnType<typeof useTripDetailData>;
  access: ReturnType<typeof useTripDetailAccess>;
  bookingState: ReturnType<typeof useTripDetailBookingState>;
  activity: { activeBooking: Booking | null; bookingForTrip: Booking | null; canTrackTrip: boolean; refreshBookingLists: () => void; onRefresh: () => Promise<void>; driverReviewAverage: number; driverReviewCount: number; dismissTripGuide: () => void; };
  contact: { handleShareTrip: () => Promise<void>; handleContactDriver: () => Promise<void>; };
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
    <View style={[styles.tripDetailSheet, !hasRenderableTripMap && styles.tripDetailSheetNoMap]}>
      <View style={styles.tripSheetHandle} />

      <TripSummary
        config={config}
        tripDepartureName={presentation.tripDepartureName}
        tripArrivalName={presentation.tripArrivalName}
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
        isOpeningConversation={bookingState.isOpeningConversation}
        driverPhone={data.driverPhone}
        setContactModalVisible={bookingState.setContactModalVisible}
      />

    {activity.canTrackTrip && data.trip?.status !== 'ongoing' && (
      <View style={styles.trackingBanner}>
        <View style={styles.trackingBannerLeft}>
          <View
            style={[
              styles.trackingStatusDot,
              data.liveDriverCoordinate ? styles.trackingStatusDotActive : styles.trackingStatusDotIdle,
            ]}
          />
          <View>
            <Text style={styles.trackingTitle}>{access.trackingStatusTitle}</Text>
            <Text style={styles.trackingSubtitle}>{access.trackingStatusSubtitle}</Text>
          </View>
        </View>
        {!data.isTripDriver && (
          <TouchableOpacity
            style={styles.trackingRefreshButton}
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

    {access.showPassengerSecurityAccess && (
      <Animated.View entering={FadeInDown.delay(460)} style={styles.section}>
        <View style={[styles.sectionCard, styles.tripSafetyPassengerCard]}>
          <TouchableOpacity
            style={[
              styles.tripSafetyCompactSosButton,
              access.isPassengerSecurityLocked && styles.tripSafetyCompactButtonBlurred,
            ]}
            onPress={safety.openSosModal}
            disabled={access.isPassengerSecurityLocked}
            activeOpacity={0.9}
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

          <TouchableOpacity
            style={[
              styles.tripSafetyCompactTrustedButton,
              (!access.canAccessTripSecurity || access.isPassengerSecurityLocked) &&
                styles.tripSafetyCompactTrustedDisabled,
              access.isPassengerSecurityLocked && styles.tripSafetyCompactButtonBlurred,
            ]}
            onPress={safety.openTripSecurityModal}
            disabled={!access.canAccessTripSecurity || access.isPassengerSecurityLocked}
            activeOpacity={0.9}
          >
            <View style={styles.tripSafetyCompactTrustedIcon}>
              <Ionicons
                name="people-outline"
                size={18}
                color={
                  access.canAccessTripSecurity && !access.isPassengerSecurityLocked
                    ? Colors.primary
                    : Colors.gray[500]
                }
              />
            </View>
            <View style={styles.tripSafetyCompactTrustedCopy}>
              <Text
                style={[
                  styles.tripSafetyCompactTrustedTitle,
                  (!access.canAccessTripSecurity || access.isPassengerSecurityLocked) &&
                    styles.tripSafetyActionTitleDisabled,
                ]}
                numberOfLines={1}
              >
                {access.trustedContactsActionLabel}
              </Text>
              <Text
                style={[
                  styles.tripSafetyCompactTrustedSubtitle,
                  (!access.canAccessTripSecurity || access.isPassengerSecurityLocked) &&
                    styles.tripSafetyActionSubtitleDisabled,
                ]}
                numberOfLines={1}
              >
                {access.canAccessTripSecurity ? access.passengerTrustedContactsHint : 'Connexion requise'}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={
                access.canAccessTripSecurity && !access.isPassengerSecurityLocked
                  ? Colors.primary
                  : Colors.gray[500]
              }
            />
          </TouchableOpacity>
        </View>
      </Animated.View>
    )}

    {/* Passagers */}
    {data.tripBookings && data.tripBookings.length > 0 && (
      <Animated.View entering={FadeInDown.delay(500)} style={styles.section}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>PASSAGERS</Text>
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
      <Animated.View entering={FadeInDown.delay(550)} style={styles.section}>
        <View style={[styles.sectionCard, styles.securityReminderCard]}>
          {/* <View style={styles.securityReminderHeader}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.secondary} />
            <Text style={styles.securityReminderTitle}>Vérification avant embarquement</Text>
          </View> */}
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
      <Animated.View entering={FadeInDown.delay(560)} style={styles.section}>
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

            <TouchableOpacity
              style={[styles.tripSafetyActionButton, styles.tripSafetyTrustedButton]}
              onPress={safety.openTripSecurityModal}
              activeOpacity={0.9}
            >
              <View style={styles.tripSafetyActionIcon}>
                <Ionicons name="people-outline" size={18} color={Colors.primary} />
              </View>
              <View style={styles.tripSafetyActionCopy}>
                <Text style={styles.tripSafetyActionTitle} numberOfLines={2}>
                  Ajouter / notifier mes proches
                </Text>
                <Text style={styles.tripSafetyActionSubtitle} numberOfLines={1}>
                  Choisir qui reçoit les alertes.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    )}
    </View>
  );
}
