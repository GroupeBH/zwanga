import { Colors } from '@/constants/styles';
import { formatPrice, getInitials, getTripRequestStatusMeta, HOME_COLORS, placeName } from '@/features/home/homeModel';
import type { TripRequestPreviewCardProps } from '@/features/home/homeTypes';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Image,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { styles } from '@/features/home/TripRequestPreviewCard.styles';
export const TripRequestPreviewCard = React.memo(function TripRequestPreviewCard({
  cardWidth,
  onOpen,
  request,
}: TripRequestPreviewCardProps) {
  const passengerName = request.passengerName || 'Passager Zwanga';
  const statusMeta = getTripRequestStatusMeta(request.status);
  const pendingOffersCount = request.offers?.filter((offer) => offer.status === 'pending').length ?? 0;
  const maxPrice = Number(request.maxPricePerSeat ?? 0);
  const hasMaxPrice = Number.isFinite(maxPrice) && maxPrice > 0;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Voir la demande de ${placeName(request.departure)} à ${placeName(request.arrival)}`}
      onPress={() => onOpen(request.id)}
      style={[styles.requestPreviewCard, { width: cardWidth }]}
    >
      <View style={styles.requestPreviewTopRow}>
        <View style={styles.requestPassengerInline}>
          {request.passengerAvatar ? (
            <Image source={{ uri: request.passengerAvatar }} style={styles.requestPreviewAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.requestPreviewAvatar, styles.requestPreviewAvatarFallback]}>
              <Text style={styles.requestPreviewAvatarText}>{getInitials(passengerName)}</Text>
            </View>
          )}
          <View style={styles.requestPreviewPassengerCopy}>
            <Text style={styles.requestPreviewPassengerName} numberOfLines={1}>
              {passengerName}
            </Text>
            <Text style={styles.requestPreviewDate} numberOfLines={1}>
              {formatDateWithRelativeLabel(request.createdAt, false)}
            </Text>
          </View>
        </View>
        <View style={[styles.requestPreviewStatusBadge, { backgroundColor: statusMeta.bg }]}>
          <Ionicons name={statusMeta.icon} size={13} color={statusMeta.color} />
          <Text style={[styles.requestPreviewStatusText, { color: statusMeta.color }]} numberOfLines={1}>
            {statusMeta.label}
          </Text>
        </View>
      </View>

      <View style={styles.requestPreviewRoute}>
        <View style={styles.requestPreviewRail}>
          <View style={[styles.requestPreviewRouteDot, styles.requestPreviewStartDot]} />
          <View style={styles.requestPreviewRouteLine} />
          <View style={[styles.requestPreviewRouteDot, styles.requestPreviewEndDot]} />
        </View>
        <View style={styles.requestPreviewRouteCopy}>
          <View>
            <Text style={styles.requestPreviewRouteLabel}>
              DÉPART - {formatDateWithRelativeLabel(request.departureDateMin, true)}
            </Text>
            <Text style={styles.requestPreviewRouteText} numberOfLines={1}>
              {placeName(request.departure)}
            </Text>
          </View>
          <View>
            <Text style={styles.requestPreviewRouteLabel}>
              DESTINATION - limite {formatDateWithRelativeLabel(request.departureDateMax, true)}
            </Text>
            <Text style={styles.requestPreviewRouteText} numberOfLines={1}>
              {placeName(request.arrival)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.requestPreviewFooter}>
        <View style={styles.requestPreviewChips}>
          <View style={styles.requestPreviewChip}>
            <Ionicons name="people-outline" size={13} color={HOME_COLORS.navy} />
            <Text style={styles.requestPreviewChipText} numberOfLines={1}>
              {request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''}
            </Text>
          </View>
          {hasMaxPrice && (
            <View style={styles.requestPreviewBudgetChip}>
              <Text style={styles.requestPreviewBudgetText} numberOfLines={1}>
                Max {formatPrice(maxPrice)}
              </Text>
            </View>
          )}
          {pendingOffersCount > 0 && (
            <View style={styles.requestPreviewOffersChip}>
              <Text style={styles.requestPreviewOffersText} numberOfLines={1}>
                {pendingOffersCount} offre{pendingOffersCount > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.requestPreviewOpenButton}>
          <Ionicons name="chevron-forward" size={22} color={Colors.white} />
        </View>
      </View>
    </TouchableOpacity>
  );
});
