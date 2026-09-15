import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { formatDateTime } from '@/utils/dateHelpers';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import type { Trip } from '@/types';
import type { Router } from 'expo-router';

interface TripSummaryProps {
  config: { color: string; bgColor: string; label: string; };
  tripDepartureName: string;
  tripArrivalName: string;
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

export function TripSummary({
  config,
  tripDepartureName,
  tripArrivalName,
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
  driverPhone,
  setContactModalVisible,
}: TripSummaryProps) {
  return (
    <Animated.View entering={FadeInDown.delay(120)} style={styles.tripHeroSummary}>
      <View style={styles.tripHeroTopRow}>
        <View style={styles.tripHeroTitleBlock}>
          <View style={styles.tripHeroStatusRow}>
            <View style={[styles.tripHeroStatusDot, { backgroundColor: config.color }]} />
            <Text style={styles.tripHeroEyebrow}>{config.label}</Text>
          </View>
          <Text style={styles.tripHeroTitle} numberOfLines={2}>
            {tripDepartureName} vers {tripArrivalName}
          </Text>
        </View>
        <View style={styles.tripPriceBadge}>
          <Text style={styles.tripPriceBadgeText}>{tripPriceLabel}</Text>
          {trip?.price !== 0 ? <Text style={styles.tripPriceBadgeHint}>par place</Text> : null}
        </View>
      </View>

      <View style={styles.tripQuickFacts}>
        <View style={styles.tripQuickFact}>
          <View style={styles.tripQuickFactIcon}>
            <Ionicons name="time-outline" size={16} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.tripQuickFactLabel}>Départ</Text>
            <Text style={styles.tripQuickFactValue}>{tripDepartureTimeLabel}</Text>
          </View>
        </View>
        <View style={styles.tripQuickFact}>
          <View style={styles.tripQuickFactIcon}>
            <Ionicons name="flag-outline" size={16} color={Colors.success} />
          </View>
          <View>
            <Text style={styles.tripQuickFactLabel}>Arrivée estimée</Text>
            <Text style={styles.tripQuickFactValue}>{tripArrivalTimeLabel}</Text>
          </View>
        </View>
        <View style={styles.tripQuickFact}>
          <View style={styles.tripQuickFactIcon}>
            <Ionicons name="people-outline" size={16} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.tripQuickFactLabel}>Places</Text>
            <Text style={styles.tripQuickFactValue}>{tripSeatsLabel}</Text>
          </View>
        </View>
        <View style={styles.tripQuickFact}>
          <View style={styles.tripQuickFactIcon}>
            <Ionicons name="navigate-outline" size={16} color={Colors.info} />
          </View>
          <View>
            <Text style={styles.tripQuickFactLabel}>Distance</Text>
            <Text style={styles.tripQuickFactValue}>{tripRouteDistanceLabel}</Text>
          </View>
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
            Arrivée estimee: {estimatedArrivalTime ? formatDateTime(estimatedArrivalTime.toISOString()) : tripArrivalTimeLabel}
          </Text>
        </View>
      )}

      {/* <View style={styles.tripCompactRoute}>
        <View style={styles.tripCompactRail}>
          <View style={[styles.tripCompactDot, styles.tripCompactStartDot]} />
          <View style={styles.tripCompactLine} />
          <View style={[styles.tripCompactDot, styles.tripCompactEndDot]} />
        </View>
        <View style={styles.tripCompactRouteCopy}>
          <View style={styles.tripCompactStop}>
            <View style={styles.tripCompactStopTop}>
              <Text style={[styles.tripCompactStopLabel, styles.tripCompactDepartureLabel]}>Départ</Text>
              <Text style={styles.tripCompactStopTime}>{tripDepartureTimeLabel}</Text>
            </View>
            <Text style={styles.tripCompactStopName} numberOfLines={1}>{tripDepartureName}</Text>
            <Text style={styles.tripCompactStopAddress} numberOfLines={1}>{tripDepartureAddress}</Text>
          </View>
          <View style={styles.tripCompactStop}>
            <View style={styles.tripCompactStopTop}>
              <Text style={[styles.tripCompactStopLabel, styles.tripCompactArrivalLabel]}>Arrivée estimee</Text>
              <Text style={styles.tripCompactStopTime}>{tripArrivalTimeLabel}</Text>
            </View>
            <Text style={styles.tripCompactStopName} numberOfLines={1}>{tripArrivalName}</Text>
            <Text style={styles.tripCompactStopAddress} numberOfLines={1}>{tripArrivalAddress}</Text>
          </View>
        </View>
      </View> */}

      <View style={styles.tripDirectInfoRow}>
        <TouchableOpacity
          style={styles.tripDriverCompact}
          onPress={() => {
            if (trip?.driverId) {
              router.push({
                pathname: '/driver/[id]',
                params: { id: trip.driverId },
              });
            }
          }}
          activeOpacity={0.82}
        >
          {trip?.driverAvatar ? (
            <Image source={{ uri: trip.driverAvatar }} style={styles.tripDriverCompactAvatar} />
          ) : (
            <View style={styles.tripDriverCompactAvatar}>
              <Ionicons name="person" size={20} color={Colors.gray[500]} />
            </View>
          )}
          <View style={styles.tripDriverCompactCopy}>
            <Text style={styles.tripDriverCompactLabel}>Conducteur</Text>
            <Text style={styles.tripDriverCompactName} numberOfLines={1}>{trip?.driverName || 'Conducteur'}</Text>
            <View style={styles.tripDriverCompactMeta}>
              <Ionicons name="star" size={12} color={Colors.secondary} />
              <Text style={styles.tripDriverCompactRating}>{driverReviewAverage.toFixed(1)}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tripVehicleCompact}
          onPress={() => setVehicleDetailModalVisible(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Voir les details du vehicule"
        >
          <View style={styles.tripVehicleCompactIcon}>
            <Ionicons
              name={tripVehicleIconName}
              size={18}
              color={Colors.primary}
            />
          </View>
          <View style={styles.tripVehicleCompactCopy}>
            <Text style={styles.tripDriverCompactLabel}>Véhicule</Text>
            <Text style={styles.tripVehicleCompactName} numberOfLines={1}>{tripVehicleLabel}</Text>
            <Text style={styles.tripVehicleCompactMeta} numberOfLines={1}>{tripVehicleMetaLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
        </TouchableOpacity>
      </View>

      {trip?.requiresPassengerKyc ? (
        <View style={styles.passengerKycTripNotice}>
          <View style={styles.passengerKycTripNoticeIcon}>
            <Ionicons name="shield-checkmark-outline" size={17} color={Colors.primary} />
          </View>
          <View style={styles.passengerKycTripNoticeCopy}>
            <Text style={styles.passengerKycTripNoticeTitle}>Identité des passagers vérifiée</Text>
            <Text style={styles.passengerKycTripNoticeText}>
              Ce conducteur accepte uniquement les passagers dont l&apos;identité est vérifiée.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.tripInlineActions}>
        <TouchableOpacity
          style={styles.tripInlineActionButton}
          onPress={handleContactDriver}
          disabled={isOpeningConversation}
          activeOpacity={0.86}
        >
          {isOpeningConversation ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <Ionicons name="chatbubble-ellipses-outline" size={17} color={Colors.primary} />
              <Text style={styles.tripInlineActionText}>Message</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tripInlineActionButton, !driverPhone && styles.tripInlineActionButtonDisabled]}
          disabled={!driverPhone}
          onPress={() => setContactModalVisible(true)}
          activeOpacity={0.86}
        >
          <Ionicons name="logo-whatsapp" size={17} color={driverPhone ? '#25D366' : Colors.gray[400]} />
          <Text style={[styles.tripInlineActionText, driverPhone && styles.tripInlineWhatsappText]}>WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
