import { styles } from '../features/screen-styles/app/my-requests/index';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { Colors } from '@/constants/styles';
import { useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import type { TripRequest } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { getTripRequestCreateHref, getTripRequestDetailHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MyTripRequestsScreen() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const {
    data: tripRequests = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetMyTripRequestsQuery(undefined, {
    // Polling léger pour mes demandes de trajet
    pollingInterval: isScreenActive ? (60_000) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  console.log('[MyTripRequests] tripRequests:', tripRequests);

  const handleRequestPress = (requestId: string) => {
    router.push(getTripRequestDetailHref(requestId));
  };

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
    offers_received: { label: 'Offres reçues', color: Colors.info, bg: Colors.info + '15' },
    driver_selected: { label: 'Conducteur sélectionné', color: Colors.success, bg: Colors.success + '15' },
    cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '15' },
  };

  const getRequestPriority = (request: TripRequest) => {
    if (request.status === 'driver_selected' && !request.tripId) return 0;
    if (request.status === 'offers_received') return 1;
    if (request.status === 'pending') return 2;
    if (request.status === 'cancelled') return 4;
    if (request.status === 'expired') return 5;
    return 3;
  };

  const sortedTripRequests = useMemo(() => {
    return [...tripRequests].sort((a, b) => {
      const priorityA = getRequestPriority(a);
      const priorityB = getRequestPriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const updatedA = new Date(a.updatedAt || a.createdAt).getTime();
      const updatedB = new Date(b.updatedAt || b.createdAt).getTime();
      return updatedB - updatedA;
    });
  }, [tripRequests]);

  const featuredRequestId = useMemo(() => {
    return (
      sortedTripRequests.find(
        (request) =>
          (request.status === 'pending' ||
            request.status === 'offers_received' ||
            request.status === 'driver_selected') &&
          !request.tripId,
      )?.id ?? null
    );
  }, [sortedTripRequests]);

  const renderTripRequestCard = ({ item, index }: { item: TripRequest; index: number }) => {
    // Merge 'expired' into the local status config
    const localStatusConfig = {
      ...statusConfig,
      expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200] },
      // End of casting hell: make sure item.status is a keyof localStatusConfig
    } as Record<keyof typeof statusConfig | 'expired', { label: string; color: string; bg: string }>;
    const currentStatus = (localStatusConfig as any)[item.status] || statusConfig.pending;

    const offersCount = item.offers?.length ?? 0;
    const pendingOffersCount = item.offers?.filter((o: { status: string }) => o.status === 'pending').length ?? 0;

    const hasOffers = offersCount > 0;
    const hasPendingOffers = pendingOffersCount > 0;
    const isActiveRequest =
      (item.status === 'pending' || item.status === 'offers_received' || item.status === 'driver_selected') &&
      !item.tripId;
    const isFeatured = isActiveRequest && item.id === featuredRequestId;
    const trackingConfig =
      item.status === 'driver_selected'
        ? { icon: 'car-outline' as const, label: 'Prise en charge prête', color: Colors.success, bg: Colors.success + '15' }
        : item.status === 'offers_received' || hasPendingOffers
          ? { icon: 'sparkles-outline' as const, label: 'À comparer', color: Colors.info, bg: Colors.info + '15' }
          : { icon: 'radio-outline' as const, label: 'En suivi', color: Colors.primary, bg: Colors.primary + '15' };

    return (
      <Animated.View entering={FadeInDown.delay(index * 100)}>
        <TouchableOpacity
          style={[
            styles.requestCard,
            hasOffers && styles.requestCardWithOffers,
            hasPendingOffers && styles.requestCardWithPendingOffers,
            isFeatured && styles.requestCardFeatured,
            isFeatured && item.status === 'driver_selected' && styles.requestCardFeaturedConfirmed,
          ]}
          onPress={() => handleRequestPress(item.id)}
        >
          <View style={styles.requestHeader}>
            <View style={styles.statusBadgeContainer}>
              {isFeatured && (
                <View style={[styles.requestTrackingBadge, { backgroundColor: trackingConfig.bg }]}>
                  <Ionicons name={trackingConfig.icon} size={13} color={trackingConfig.color} />
                  <Text style={[styles.requestTrackingBadgeText, { color: trackingConfig.color }]}>
                    {trackingConfig.label}
                  </Text>
                </View>
              )}
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
              <Text style={styles.viewButtonText}>Voir détails</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mes demandes</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Chargement de vos demandes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes demandes</Text>
        <TouchableOpacity
          style={styles.createButton}
              onPress={() => router.push(getTripRequestCreateHref())}
        >
          <Ionicons name="add-circle" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {sortedTripRequests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>Aucune demande</Text>
          <Text style={styles.emptyText}>
            Vous n&apos;avez pas encore créé de demande de trajet. Créez-en une pour que les conducteurs vous proposent leurs services.
          </Text>
          <TouchableOpacity
            style={styles.createRequestButton}
              onPress={() => router.push(getTripRequestCreateHref())}
          >
            <Ionicons name="add-circle" size={20} color={Colors.white} />
            <Text style={styles.createRequestButtonText}>Créer une demande</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sortedTripRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderTripRequestCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}


