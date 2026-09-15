import { Colors } from '@/constants/styles';
import {
  formatPrice,
  formatTripRequestWindow,
  getInitials,
  getPlaceName,
  getTripRequestVehicleName,
} from '@/features/search/searchModel';
import type { TripRequest } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../features/screen-styles/app/search/index';

export type SearchRequestResultCardProps = {
  request: TripRequest;
  disabled?: boolean;
  onPress: (request: TripRequest) => void;
};

export const SearchRequestResultCard = React.memo(function SearchRequestResultCard({
  request,
  disabled = false,
  onPress,
}: SearchRequestResultCardProps) {
  const passengerName = request.passengerName || 'Passager Zwanga';
  const seatsLabel = `${request.numberOfSeats} place${request.numberOfSeats > 1 ? 's' : ''} demandée${request.numberOfSeats > 1 ? 's' : ''}`;
  const vehicleName = getTripRequestVehicleName(request);
  const budgetLabel = request.maxPricePerSeat ? formatPrice(request.maxPricePerSeat) : 'À proposer';
  const offersCount = request.offers?.length ?? 0;
  const routeAccent =
    request.vehicleType === 'motorcycle_2_wheels'
      ? Colors.primaryDark
      : request.vehicleType === 'motorcycle_3_wheels'
        ? Colors.infoDark
        : Colors.success;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.resultCard, disabled && styles.resultCardDisabled]}
      onPress={() => onPress(request)}
      disabled={disabled}
      accessibilityState={{ disabled }}
    >
      <View style={styles.resultTop}>
        <View style={styles.driverAvatarWrap}>
          {request.passengerAvatar ? (
            <Image source={{ uri: request.passengerAvatar }} style={styles.driverAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.driverAvatar, styles.driverAvatarFallback]}>
              <Text style={styles.driverAvatarText}>{getInitials(passengerName)}</Text>
            </View>
          )}
        </View>

        <View style={styles.driverCopy}>
          <Text style={styles.driverName} numberOfLines={1}>
            {passengerName}
          </Text>
          <View style={styles.driverMetaRow}>
            <Ionicons name="person-outline" size={15} color={Colors.primaryDark} />
            <Text style={styles.driverMetaText}>Demande passager</Text>
          </View>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.resultPrice}>{budgetLabel}</Text>
          <Text style={styles.priceUnit}>
            {request.maxPricePerSeat ? 'budget max' : 'budget libre'}
          </Text>
        </View>
      </View>

      <View style={styles.requestRoutePanel}>
        <View style={[styles.timingAccent, { backgroundColor: routeAccent }]} />
        <View style={styles.requestRouteContent}>
          <View style={styles.requestRouteLine}>
            <Ionicons name="location" size={16} color={Colors.successDark} />
            <Text style={styles.requestRouteText} numberOfLines={1}>
              {getPlaceName(request.departure)}
            </Text>
          </View>
          <View style={styles.requestRouteLine}>
            <Ionicons name="navigate" size={16} color={Colors.primaryDark} />
            <Text style={styles.requestRouteText} numberOfLines={1}>
              {getPlaceName(request.arrival)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.requestMetaGrid}>
        <View style={styles.requestMetaItem}>
          <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
          <Text style={styles.requestMetaText} numberOfLines={2}>
            {formatTripRequestWindow(request)}
          </Text>
        </View>
        <View style={styles.requestMetaItem}>
          <Ionicons name="people-outline" size={16} color={Colors.gray[600]} />
          <Text style={styles.requestMetaText}>{seatsLabel}</Text>
        </View>
        <View style={styles.requestMetaItem}>
          <Ionicons name="car-sport-outline" size={16} color={Colors.gray[600]} />
          <Text style={styles.requestMetaText}>{vehicleName}</Text>
        </View>
      </View>

      {request.description ? (
        <Text style={styles.requestDescription} numberOfLines={2}>
          {request.description}
        </Text>
      ) : null}

      <View style={styles.resultBadges}>
        <View style={styles.instantBadge}>
          <Ionicons name="paper-plane-outline" size={13} color={Colors.primaryDark} />
          <Text style={styles.instantBadgeText}>DEMANDE DISPONIBLE</Text>
        </View>
        {offersCount > 0 ? (
          <View style={styles.greenBadge}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={Colors.successDark} />
            <Text style={styles.greenBadgeText}>
              {offersCount} OFFRE{offersCount > 1 ? 'S' : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});
