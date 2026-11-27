import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { formatDateTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import type { Booking, Trip } from '@/types';
import { PassengerTripSummary } from './PassengerTripSummary';
import type { Router } from 'expo-router';
import { RouteLocationDetails } from '@/components/trip/RouteLocationDetails';
import type { RouteLocationLabels } from '@/utils/routeLocationLabels';

export interface TripSummaryProps {
  paymentNotice?: React.ReactNode;
  booking?: Booking | null;
  tripArrivalClockLabel?: string;
  isTripDriver?: boolean;
  config: { color: string; bgColor: string; label: string; };
  routeLabels: RouteLocationLabels;
  tripPriceLabel: string;
  trip: Trip | undefined;
  tripDepartureTimeLabel: string;
  tripArrivalTimeLabel: string;
  tripSeatsLabel: string;
  tripRouteDistanceLabel: string;
  progress: number;
  estimatedArrivalTime: Date | null;
  router: Router;
  driverReviewAverage: number;
  setVehicleDetailModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  tripVehicleIconName: keyof typeof Ionicons.glyphMap;
  tripVehicleLabel: string;
  tripVehicleMetaLabel: string;
  handleContactDriver: () => Promise<void>;
  isOpeningConversation: boolean;
  driverPhone: string | null;
  setContactModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export function TripSummary(props: TripSummaryProps) {
  if (!props.isTripDriver) return <PassengerTripSummary {...props} />;
  return <OwnerTripSummary {...props} />;
}

function OwnerTripSummary({
  isTripDriver = false,
  config,
  routeLabels,
  tripPriceLabel,
  trip,
  tripDepartureTimeLabel,
  tripArrivalTimeLabel,
  tripSeatsLabel,
  tripRouteDistanceLabel,
  progress,
  estimatedArrivalTime,
  router,
  driverReviewAverage,
  setVehicleDetailModalVisible,
  tripVehicleIconName,
  tripVehicleLabel,
  tripVehicleMetaLabel,
  handleContactDriver,
  isOpeningConversation,
  setContactModalVisible,
}: TripSummaryProps) {
  // Une note de 0 signifie « aucun avis » : afficher « 0.0 » laissait croire à une mauvaise note.
  const hasDriverRating = Number.isFinite(driverReviewAverage) && driverReviewAverage > 0;
  return (
    <View style={styles.tripHeroSummary}>
      <View style={styles.tripHeroTopRow}>
        <View style={[styles.tripHeroStatusRow, !!config.bgColor && { backgroundColor: config.bgColor }]}>
          <View style={[styles.tripHeroStatusDot, { backgroundColor: config.color }]} />
          <Text style={styles.tripHeroEyebrow}>{config.label}</Text>
        </View>
        <Text style={styles.tripPriceBadgeText}>
          {tripPriceLabel}
          {trip?.price !== 0 ? <Text style={styles.tripPriceBadgeHint}>{trip?.tripRequestId ? ' pour le trajet' : ' / place'}</Text> : null}
        </Text>
      </View>

      <RouteLocationDetails labels={routeLabels} compact
        departureTimeLabel={tripDepartureTimeLabel} arrivalTimeLabel={tripArrivalTimeLabel} />

      <View style={styles.tripQuickFacts}>
        <View style={styles.tripQuickFact} accessible accessibilityLabel={`Places disponibles : ${tripSeatsLabel}`}>
          <Ionicons name="people-outline" size={16} color={Colors.primaryDark} />
          <Text style={styles.tripQuickFactValue}>{tripSeatsLabel}</Text>
        </View>
        <View style={styles.tripQuickFact} accessible accessibilityLabel={`Distance : ${tripRouteDistanceLabel}`}>
          <Ionicons name="navigate-outline" size={16} color={Colors.primaryDark} />
          <Text style={styles.tripQuickFactValue}>{tripRouteDistanceLabel}</Text>
        </View>
      </View>

      {trip?.status === 'ongoing' && (
        <View style={styles.tripInlineProgress}>
          <View style={styles.tripInlineProgressTop}>
            <Text style={styles.tripInlineProgressLabel}>Progression</Text>
            <Text style={styles.tripInlineProgressValue}>{progress}%</Text>
          </View>
          <View style={styles.tripInlineProgressTrack}>
            <View style={[styles.tripInlineProgressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.tripInlineProgressEta}>
            Arrivée estimée : {estimatedArrivalTime ? formatDateTime(estimatedArrivalTime.toISOString()) : tripArrivalTimeLabel}
          </Text>
        </View>
      )}

      <View style={styles.tripDirectInfoRow}>
        {!isTripDriver && <>
          <TouchableOpacity
            style={styles.tripDriverCompact}
            onPress={() => {
              if (trip?.driverId) {
                router.push({
                  pathname: '/driver/[id]',
                  params: { id: trip.driverId, sourceTripId: trip.id },
                });
              }
            }}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`Voir le profil de ${trip?.driverName || 'votre conducteur'}`}
          >
            {trip?.driverAvatar ? (
              <Image source={{ uri: trip.driverAvatar }} style={styles.tripDriverCompactAvatar} resizeMethod="resize" fadeDuration={0} />
            ) : (
              <View style={styles.tripDriverCompactAvatar}>
                <Ionicons name="person" size={20} color={Colors.gray[500]} />
              </View>
            )}
            <View style={styles.tripDriverCompactCopy}>
              {/* La note partage la ligne du libellé : le nom garde toute la largeur, même en grande police. */}
              <View style={styles.tripDriverCompactHeading}>
                <Text style={styles.tripDriverCompactLabel}>Conducteur</Text>
                <View style={styles.tripDriverCompactMeta}>
                  {hasDriverRating && <Ionicons name="star" size={11} color={Colors.secondaryDark} />}
                  <Text style={styles.tripDriverCompactRating}>
                    {hasDriverRating ? driverReviewAverage.toFixed(1) : 'Nouveau'}
                  </Text>
                </View>
              </View>
              <Text style={styles.tripDriverCompactName} numberOfLines={2}>{trip?.driverName || 'Conducteur'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
          </TouchableOpacity>
          <View style={styles.tripDirectInfoDivider} />
        </>}

        <TouchableOpacity
          style={styles.tripVehicleCompact}
          onPress={() => setVehicleDetailModalVisible(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Voir les détails du véhicule"
        >
          <View style={styles.tripVehicleCompactIcon}>
            <Ionicons
              name={tripVehicleIconName}
              size={20}
              color={Colors.primary}
            />
          </View>
          <View style={styles.tripVehicleCompactCopy}>
            <Text style={styles.tripDriverCompactLabel}>Véhicule</Text>
            <Text style={styles.tripVehicleCompactName} numberOfLines={2}>{tripVehicleLabel}</Text>
            <Text style={styles.tripVehicleCompactMeta} numberOfLines={2}>{tripVehicleMetaLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
        </TouchableOpacity>
      </View>

      {trip?.requiresPassengerKyc ? (
        <View style={styles.passengerKycTripNotice}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primaryDark} />
          <View style={styles.passengerKycTripNoticeCopy}>
            <Text style={styles.passengerKycTripNoticeTitle}>Identité vérifiée requise pour réserver</Text>
          </View>
        </View>
      ) : null}

      {!isTripDriver && <View style={styles.tripInlineActions}>
        <TouchableOpacity
          style={[styles.tripInlineActionButton, styles.tripInlineActionButtonPrimary]}
          onPress={handleContactDriver}
          disabled={isOpeningConversation}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel="Envoyer un message au conducteur"
          accessibilityState={{ disabled: isOpeningConversation, busy: isOpeningConversation }}
        >
          {isOpeningConversation ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.primaryDark} />
              <Text style={[styles.tripInlineActionText, styles.tripInlineActionTextPrimary]}>Message</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tripInlineActionButton}
          onPress={() => setContactModalVisible(true)}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel="Choisir comment contacter le conducteur"
        >
          <Ionicons name="chatbubbles-outline" size={17} color={Colors.primary} />
          <Text style={styles.tripInlineActionText}>Contacter</Text>
        </TouchableOpacity>
      </View>}
    </View>
  );
}
