import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetAvailableTripRequestsQuery,
} from '@/store/api/tripRequestApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import type { TripRequest } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TripRequestsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const { data: currentUser } = useGetCurrentUserQuery();
  const {
    data: tripRequests = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetAvailableTripRequestsQuery();

  const handleRequestPress = (requestId: string) => {
    router.push(`/request/${requestId}`);
  };

  const renderTripRequestCard = ({ item, index }: { item: TripRequest; index: number }) => {
    const statusConfigMap: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
      offers_received: { label: 'Offres reçues', color: Colors.info, bg: Colors.info + '15' },
      driver_selected: { label: 'Driver sélectionné', color: Colors.success, bg: Colors.success + '15' },
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
              <Text style={styles.viewButtonText}>Voir détails</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
            {(currentUser?.role === 'driver' || currentUser?.role === 'both') && (
              <TouchableOpacity
                style={styles.makeOfferButton}
                onPress={() => handleRequestPress(item.id)}
              >
                <Ionicons name="add-circle" size={18} color={Colors.white} />
                <Text style={styles.makeOfferButtonText}>Faire une offre</Text>
              </TouchableOpacity>
            )}
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
          <Text style={styles.headerTitle}>Demandes de trajet</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Chargement des demandes...</Text>
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
        <Text style={styles.headerTitle}>Demandes de trajet</Text>
        <View style={styles.headerSpacer} />
      </View>

      {tripRequests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>Aucune demande disponible</Text>
          <Text style={styles.emptyText}>
            Il n'y a actuellement aucune demande de trajet en attente d'offres.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tripRequests}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
  },
  listContent: {
    padding: Spacing.lg,
  },
  requestCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestCardWithOffers: {
    borderColor: Colors.info,
    borderWidth: 2,
    backgroundColor: Colors.info + '05',
    shadowColor: Colors.info,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  passengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  passengerDetails: {
    flex: 1,
  },
  passengerName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  requestDate: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  statusText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  routeContainer: {
    marginBottom: Spacing.md,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  routeText: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  requestDetails: {
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  detailText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  offersBadgeContainer: {
    marginTop: Spacing.xs,
  },
  offersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    alignSelf: 'flex-start',
  },
  offersBadgeText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  descriptionContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  descriptionText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontStyle: 'italic',
  },
  cardFooter: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  viewButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  makeOfferButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  makeOfferButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 24,
  },
});

