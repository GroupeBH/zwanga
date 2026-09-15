import { styles } from '../../features/screen-styles/app/requests/index';
import { Colors } from '@/constants/styles';
import type { TripRequest } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';

interface Params {
  handleRequestPress: (requestId: string) => void;
  isDriverAccount: boolean;
}

export function useRequestCards({
  handleRequestPress,
  isDriverAccount,
}: Params) {
  const renderAvailableRequestCard = ({ item, index }: { item: TripRequest; index: number }) => {
    const statusConfigMap: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
      offers_received: { label: 'Offres reçues', color: Colors.info, bg: Colors.info + '15' },
      driver_selected: { label: 'Conducteur sélectionné', color: Colors.success, bg: Colors.success + '15' },
      cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '15' },
      expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200] },
    };
    const statusConfig = statusConfigMap[item.status] || statusConfigMap.pending;
    const hasOffers = item.offers && item.offers.length > 0;

    return (
      <Animated.View entering={FadeInDown.delay(index * 100)}>
        <TouchableOpacity
          style={[styles.requestCard, hasOffers && styles.requestCardWithOffers]}
          onPress={() => handleRequestPress(item.id)}
        >
          <View style={styles.requestHeader}>
            <View style={styles.passengerInfo}>
              {item.passengerAvatar ? (
                <Image source={{ uri: item.passengerAvatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Ionicons name="person" size={20} color={Colors.gray[500]} />
                </View>
              )}
              <View style={styles.passengerDetails}>
                <Text style={styles.passengerLabel}>Publié par</Text>
                <Text style={styles.passengerName}>{item.passengerName}</Text>
                <Text style={styles.requestDate}>
                  {formatDateWithRelativeLabel(item.createdAt, false)}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          <View style={styles.routeContainer}>
            <View style={styles.routeRow}>
              <Ionicons name="location" size={16} color={Colors.success} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.departure.name}
              </Text>
            </View>
            <View style={styles.routeRow}>
              <Ionicons name="navigate" size={16} color={Colors.primary} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.arrival.name}
              </Text>
            </View>
          </View>

          <View style={styles.requestDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
              <Text style={styles.detailText}>
                {formatDateWithRelativeLabel(item.departureDateMin, true)} - {formatDateWithRelativeLabel(item.departureDateMax, true)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={16} color={Colors.gray[600]} />
              <Text style={styles.detailText}>{item.numberOfSeats} place{item.numberOfSeats > 1 ? 's' : ''}</Text>
            </View>
            {item.maxPricePerSeat && (
              <View style={styles.detailRow}>
                <Ionicons name="cash-outline" size={16} color={Colors.gray[600]} />
                <Text style={styles.detailText}>Max: {item.maxPricePerSeat} FC/place</Text>
              </View>
            )}
            {item.offers && item.offers.length > 0 && (
              <View style={styles.offersBadgeContainer}>
                <View style={styles.offersBadge}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                  <Text style={styles.offersBadgeText}>
                    {item.offers.length} offre{item.offers.length > 1 ? 's' : ''} reçue{item.offers.length > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {item.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionText} numberOfLines={2}>
                {item.description}
              </Text>
            </View>
          )}

          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={styles.viewButton}
              onPress={() => handleRequestPress(item.id)}
            >
              <Text style={styles.viewButtonText}>Voir la demande</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
            {isDriverAccount && (
              <TouchableOpacity
                style={styles.makeOfferButton}
                onPress={() => handleRequestPress(item.id)}
              >
                <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                <Text style={styles.makeOfferButtonText}>Accepter</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Rendre une carte de ma demande (pour les passagers)
  const renderMyRequestCard = ({ item, index }: { item: TripRequest; index: number }) => {
    const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
      offers_received: { label: 'Offres reçues', color: Colors.info, bg: Colors.info + '15' },
      driver_selected: { label: 'Conducteur sélectionné', color: Colors.success, bg: Colors.success + '15' },
      cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '15' },
      expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200] },
    };
    const localStatusConfig = {
      ...statusConfig,
      expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200] },
    } as Record<keyof typeof statusConfig | 'expired', { label: string; color: string; bg: string }>;
    const currentStatus = (localStatusConfig as any)[item.status] || statusConfig.pending;

    const offersCount = item.offers?.length ?? 0;
    const pendingOffersCount = item.offers?.filter((o: { status: string }) => o.status === 'pending').length ?? 0;

    const hasOffers = offersCount > 0;
    const hasPendingOffers = pendingOffersCount > 0;

    return (
      <Animated.View entering={FadeInDown.delay(index * 100)}>
        <TouchableOpacity
          style={[
            styles.requestCard,
            hasOffers && styles.requestCardWithOffers,
            hasPendingOffers && styles.requestCardWithPendingOffers,
          ]}
          onPress={() => handleRequestPress(item.id)}
        >
          <View style={styles.requestHeader}>
            <View style={styles.statusBadgeContainer}>
              <View style={styles.ownerRequestPill}>
                <Text style={styles.ownerRequestPillText}>Votre demande</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: currentStatus.bg }]}>
                <Text style={[styles.statusText, { color: currentStatus.color }]}>
                  {currentStatus.label}
                </Text>
              </View>
              {offersCount > 0 && (
                <View style={styles.offersBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.info} />
                  <Text style={styles.offersBadgeText}>
                    {pendingOffersCount} offre{pendingOffersCount > 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.requestDate}>
              {formatDateWithRelativeLabel(item.createdAt, false)}
            </Text>
          </View>

          <View style={styles.routeContainer}>
            <View style={styles.routeRow}>
              <Ionicons name="location" size={16} color={Colors.success} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.departure.name}
              </Text>
            </View>
            <View style={styles.routeRow}>
              <Ionicons name="navigate" size={16} color={Colors.primary} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.arrival.name}
              </Text>
            </View>
          </View>

          <View style={styles.requestDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
              <Text style={styles.detailText}>
                {formatDateWithRelativeLabel(item.departureDateMin, true)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={16} color={Colors.gray[600]} />
              <Text style={styles.detailText}>{item.numberOfSeats} place{item.numberOfSeats > 1 ? 's' : ''}</Text>
            </View>
            {item.maxPricePerSeat && (
              <View style={styles.detailRow}>
                <Ionicons name="cash-outline" size={16} color={Colors.gray[600]} />
                <Text style={styles.detailText}>Max: {item.maxPricePerSeat} FC/place</Text>
              </View>
            )}
          </View>

          {item.selectedDriverId && (
            <View style={styles.selectedDriverContainer}>
              <View style={styles.selectedDriverInfo}>
                {item.selectedDriverAvatar ? (
                  <Image
                    source={{ uri: item.selectedDriverAvatar }}
                    style={styles.selectedDriverAvatar}
                  />
                ) : (
                  <View style={styles.selectedDriverAvatar}>
                    <Ionicons name="person" size={16} color={Colors.gray[500]} />
                  </View>
                )}
                <View>
                  <Text style={styles.selectedDriverLabel}>Conducteur sélectionné</Text>
                  <Text style={styles.selectedDriverName}>{item.selectedDriverName}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={styles.viewButton}
              onPress={() => handleRequestPress(item.id)}
            >
              <Text style={styles.viewButtonText}>
                {item.tripId ? 'Suivre la course' : 'Ouvrir la demande'}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return {
    renderAvailableRequestCard,
    renderMyRequestCard,
  };
}
