import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetAvailableTripRequestsQuery,
  useGetMyTripRequestsQuery,
} from '@/store/api/tripRequestApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import type { TripRequest } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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

type RequestTab = 'available' | 'my-requests';

export default function TripRequestsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const { data: currentUser } = useGetCurrentUserQuery();
  const [activeTab, setActiveTab] = useState<RequestTab>('available');

  // Query pour les demandes disponibles (pour les drivers)
  const {
    data: availableRequests = [],
    isLoading: isLoadingAvailable,
    isFetching: isFetchingAvailable,
    refetch: refetchAvailable,
  } = useGetAvailableTripRequestsQuery(undefined, {
    skip: activeTab !== 'available',
  });

  // Query pour mes demandes (pour les passagers)
  const {
    data: myRequests = [],
    isLoading: isLoadingMyRequests,
    isFetching: isFetchingMyRequests,
    refetch: refetchMyRequests,
  } = useGetMyTripRequestsQuery(undefined, {
    skip: activeTab !== 'my-requests',
  });

  const handleRequestPress = (requestId: string) => {
    router.push(`/request/${requestId}`);
  };

  // Rendre une carte de demande disponible (pour les drivers)
  const renderAvailableRequestCard = ({ item, index }: { item: TripRequest; index: number }) => {
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

  // Rendre une carte de ma demande (pour les passagers)
  const renderMyRequestCard = ({ item, index }: { item: TripRequest; index: number }) => {
    const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
      offers_received: { label: 'Offres reçues', color: Colors.info, bg: Colors.info + '15' },
      driver_selected: { label: 'Driver sélectionné', color: Colors.success, bg: Colors.success + '15' },
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
                  <Text style={styles.selectedDriverLabel}>Driver sélectionné</Text>
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

  const isLoading = activeTab === 'available' ? isLoadingAvailable : isLoadingMyRequests;
  const isFetching = activeTab === 'available' ? isFetchingAvailable : isFetchingMyRequests;
  const currentData = activeTab === 'available' ? availableRequests : myRequests;
  const refetch = activeTab === 'available' ? refetchAvailable : refetchMyRequests;

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>
            {activeTab === 'available' ? 'Chargement des demandes...' : 'Chargement de vos demandes...'}
          </Text>
        </View>
      );
    }

    if (currentData.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>
            {activeTab === 'available' ? 'Aucune demande disponible' : 'Aucune demande'}
          </Text>
          <Text style={styles.emptyText}>
            {activeTab === 'available'
              ? "Il n'y a actuellement aucune demande de trajet en attente d'offres."
              : "Vous n'avez pas encore créé de demande de trajet. Créez-en une pour que les drivers vous proposent leurs services."}
          </Text>
          {activeTab === 'my-requests' && (
            <TouchableOpacity
              style={styles.createRequestButton}
              onPress={() => router.push('/request')}
            >
              <Ionicons name="add-circle" size={20} color={Colors.white} />
              <Text style={styles.createRequestButtonText}>Créer une demande</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <FlatList
        data={currentData}
        keyExtractor={(item) => item.id}
        renderItem={activeTab === 'available' ? renderAvailableRequestCard : renderMyRequestCard}
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
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Demandes</Text>
        {activeTab === 'my-requests' && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/request')}
          >
            <Ionicons name="add-circle" size={24} color={Colors.primary} />
          </TouchableOpacity>
        )}
        {activeTab === 'available' && <View style={styles.headerSpacer} />}
      </View>

      {/* Onglets */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'available' && styles.tabActive]}
          onPress={() => setActiveTab('available')}
        >
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
            Disponibles
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'my-requests' && styles.tabActive]}
          onPress={() => setActiveTab('my-requests')}
        >
          <Text style={[styles.tabText, activeTab === 'my-requests' && styles.tabTextActive]}>
            Mes demandes
          </Text>
        </TouchableOpacity>
      </View>

      {renderContent()}
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
  createButton: {
    padding: Spacing.xs,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
    paddingHorizontal: Spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
    color: Colors.gray[600],
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
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
  requestCardWithPendingOffers: {
    borderColor: Colors.warning,
    backgroundColor: Colors.warning + '08',
    shadowColor: Colors.warning,
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
  statusBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
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
  offersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.info + '15',
    borderRadius: BorderRadius.sm,
  },
  offersBadgeText: {
    fontSize: FontSizes.xs,
    color: Colors.info,
    fontWeight: FontWeights.medium,
  },
  offersBadgeContainer: {
    marginTop: Spacing.xs,
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
  selectedDriverContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  selectedDriverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedDriverAvatar: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectedDriverLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    marginBottom: 2,
  },
  selectedDriverName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
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
    marginBottom: Spacing.lg,
  },
  createRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  createRequestButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
});
