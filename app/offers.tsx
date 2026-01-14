import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  useGetMyDriverOffersQuery,
  useGetMyTripRequestsQuery,
} from '@/store/api/tripRequestApi';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import type { DriverOffer, DriverOfferWithTripRequest, TripRequest } from '@/types';

type OfferTab = 'my-offers' | 'received';

export default function OffersScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const [activeTab, setActiveTab] = useState<OfferTab>('my-offers');

  // Query pour mes offres (pour les drivers)
  const {
    data: myOffers = [],
    isLoading: isLoadingMyOffers,
    isFetching: isFetchingMyOffers,
    refetch: refetchMyOffers,
  } = useGetMyDriverOffersQuery(undefined, {
    skip: activeTab !== 'my-offers',
  });

  // Query pour mes demandes (pour extraire les offres reçues)
  const {
    data: myRequests = [],
    isLoading: isLoadingReceived,
    isFetching: isFetchingReceived,
    refetch: refetchReceived,
  } = useGetMyTripRequestsQuery(undefined, {
    skip: activeTab !== 'received',
  });

  // Extraire toutes les offres reçues de toutes mes demandes
  const receivedOffers = useMemo(() => {
    if (activeTab !== 'received') return [];
    const allOffers: Array<DriverOffer & { tripRequest: TripRequest }> = [];
    myRequests.forEach((request) => {
      if (request.offers && request.offers.length > 0) {
        request.offers.forEach((offer) => {
          allOffers.push({
            ...offer,
            tripRequest: request,
          });
        });
      }
    });
    // Trier par date de création (plus récentes en premier)
    return allOffers.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [myRequests, activeTab]);

  const handleOfferPress = (tripRequestId: string) => {
    if (!tripRequestId) {
      console.error('[Offers] tripRequestId is empty or undefined');
      return;
    }
    router.push(`/request/${tripRequestId}`);
  };

  // Rendre une carte de mon offre (pour les drivers)
  const renderMyOfferCard = ({ item, index }: { item: DriverOfferWithTripRequest; index: number }) => {
    const tripRequestId = item.tripRequest?.id || item.tripRequestId;
    
    const statusConfigMap: Record<string, { label: string; color: string; bg: string; icon: string }> = {
      pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15', icon: 'time-outline' },
      accepted: { label: 'Acceptée', color: Colors.success, bg: Colors.success + '15', icon: 'checkmark-circle' },
      rejected: { label: 'Rejetée', color: Colors.danger, bg: Colors.danger + '15', icon: 'close-circle' },
      cancelled: { label: 'Annulée', color: Colors.gray[500], bg: Colors.gray[200], icon: 'ban-outline' },
    };
    const statusConfig = statusConfigMap[item.status] || statusConfigMap.pending;

    const isPending = item.status === 'pending';
    const isAccepted = item.status === 'accepted';
    const isRejected = item.status === 'rejected';

    return (
      <Animated.View entering={FadeInDown.delay(index * 100)}>
        <TouchableOpacity
          style={[
            styles.offerCard,
            isPending && styles.offerCardPending,
            isAccepted && styles.offerCardAccepted,
            isRejected && styles.offerCardRejected,
          ]}
          onPress={() => handleOfferPress(tripRequestId)}
        >
          <View style={styles.offerHeader}>
            <View style={styles.statusBadgeContainer}>
              <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                  {statusConfig.label}
                </Text>
              </View>
            </View>
            <Text style={styles.offerDate}>
              {formatDateWithRelativeLabel(item.createdAt, false)}
            </Text>
          </View>

          <View style={styles.routeContainer}>
            <View style={styles.routeRow}>
              <Ionicons name="location" size={16} color={Colors.success} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.tripRequest?.departure?.name || item.tripRequest?.departureLocation || 'N/A'}
              </Text>
            </View>
            <View style={styles.routeRow}>
              <Ionicons name="navigate" size={16} color={Colors.primary} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.tripRequest?.arrival?.name || item.tripRequest?.arrivalLocation || 'N/A'}
              </Text>
            </View>
          </View>

          <View style={styles.offerDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
              <Text style={styles.detailText}>
                Départ proposé: {formatDateWithRelativeLabel(item.proposedDepartureDate, true)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={16} color={Colors.gray[600]} />
              <Text style={styles.detailText}>
                {item.pricePerSeat} FC/place ({item.availableSeats} places)
              </Text>
            </View>
            {item.vehicleInfo && (
              <View style={styles.detailRow}>
                <Ionicons name="car-outline" size={16} color={Colors.gray[600]} />
                <Text style={styles.detailText} numberOfLines={1}>
                  {item.vehicleInfo}
                </Text>
              </View>
            )}
          </View>

          {item.message && (
            <View style={styles.messageContainer}>
              <Text style={styles.messageText} numberOfLines={2}>
                {item.message}
              </Text>
            </View>
          )}

          {item.status === 'accepted' && (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={styles.successText}>
                Félicitations ! Votre offre a été acceptée. Le passager vous contactera bientôt.
              </Text>
            </View>
          )}

          {item.status === 'rejected' && item.rejectionReason && (
            <View style={styles.rejectionContainer}>
              <Ionicons name="information-circle" size={20} color={Colors.danger} />
              <Text style={styles.rejectionText}>
                Raison: {item.rejectionReason}
              </Text>
            </View>
          )}

          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={styles.viewButton}
              onPress={() => handleOfferPress(tripRequestId)}
            >
              <Text style={styles.viewButtonText}>Voir la demande</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Rendre une carte d'offre reçue (pour les passagers)
  const renderReceivedOfferCard = ({ item, index }: { item: DriverOffer & { tripRequest: TripRequest }; index: number }) => {
    const statusConfigMap: Record<string, { label: string; color: string; bg: string; icon: string }> = {
      pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15', icon: 'time-outline' },
      accepted: { label: 'Acceptée', color: Colors.success, bg: Colors.success + '15', icon: 'checkmark-circle' },
      rejected: { label: 'Rejetée', color: Colors.danger, bg: Colors.danger + '15', icon: 'close-circle' },
      cancelled: { label: 'Annulée', color: Colors.gray[500], bg: Colors.gray[200], icon: 'ban-outline' },
    };
    const statusConfig = statusConfigMap[item.status] || statusConfigMap.pending;

    const isPending = item.status === 'pending';
    const isAccepted = item.status === 'accepted';

    return (
      <Animated.View entering={FadeInDown.delay(index * 100)}>
        <TouchableOpacity
          style={[
            styles.offerCard,
            isPending && styles.offerCardPending,
            isAccepted && styles.offerCardAccepted,
          ]}
          onPress={() => handleOfferPress(item.tripRequest.id)}
        >
          <View style={styles.offerHeader}>
            <View style={styles.driverInfo}>
              {item.driverAvatar ? (
                <Image source={{ uri: item.driverAvatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Ionicons name="person" size={20} color={Colors.gray[500]} />
                </View>
              )}
              <View>
                <Text style={styles.driverName}>{item.driverName}</Text>
                {item.driverRating !== undefined && item.driverRating > 0 && (
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color={Colors.secondary} />
                    <Text style={styles.ratingText}>{item.driverRating.toFixed(1)}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          <View style={styles.routeContainer}>
            <View style={styles.routeRow}>
              <Ionicons name="location" size={16} color={Colors.success} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.tripRequest.departure.name}
              </Text>
            </View>
            <View style={styles.routeRow}>
              <Ionicons name="navigate" size={16} color={Colors.primary} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.tripRequest.arrival.name}
              </Text>
            </View>
          </View>

          <View style={styles.offerDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
              <Text style={styles.detailText}>
                Départ proposé: {formatDateWithRelativeLabel(item.proposedDepartureDate, true)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={16} color={Colors.gray[600]} />
              <Text style={styles.detailText}>
                {item.pricePerSeat} FC/place ({item.availableSeats} places)
              </Text>
            </View>
            {item.vehicleInfo && (
              <View style={styles.detailRow}>
                <Ionicons name="car-outline" size={16} color={Colors.gray[600]} />
                <Text style={styles.detailText} numberOfLines={1}>
                  {item.vehicleInfo}
                </Text>
              </View>
            )}
          </View>

          {item.message && (
            <View style={styles.messageContainer}>
              <Text style={styles.messageText} numberOfLines={2}>
                {item.message}
              </Text>
            </View>
          )}

          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={styles.viewButton}
              onPress={() => handleOfferPress(item.tripRequest.id)}
            >
              <Text style={styles.viewButtonText}>Voir la demande</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const isLoading = activeTab === 'my-offers' ? isLoadingMyOffers : isLoadingReceived;
  const isFetching = activeTab === 'my-offers' ? isFetchingMyOffers : isFetchingReceived;
  const currentData = activeTab === 'my-offers' ? myOffers : receivedOffers;
  const refetch = activeTab === 'my-offers' ? refetchMyOffers : refetchReceived;

  // Statistiques pour mes offres
  const pendingOffers = useMemo(() => myOffers.filter((o) => o.status === 'pending').length, [myOffers]);
  const acceptedOffers = useMemo(() => myOffers.filter((o) => o.status === 'accepted').length, [myOffers]);
  const rejectedOffers = useMemo(() => myOffers.filter((o) => o.status === 'rejected').length, [myOffers]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>
            {activeTab === 'my-offers' ? 'Chargement de vos offres...' : 'Chargement des offres reçues...'}
          </Text>
        </View>
      );
    }

    if (currentData.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>
            {activeTab === 'my-offers' ? 'Aucune offre' : 'Aucune offre reçue'}
          </Text>
          <Text style={styles.emptyText}>
            {activeTab === 'my-offers'
              ? "Vous n'avez pas encore fait d'offre. Parcourez les demandes de trajet disponibles et proposez vos services."
              : "Vous n'avez pas encore reçu d'offre sur vos demandes de trajet."}
          </Text>
          {activeTab === 'my-offers' && (
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => router.push('/requests')}
            >
              <Ionicons name="search" size={20} color={Colors.white} />
              <Text style={styles.browseButtonText}>Parcourir les demandes</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <>
        {/* Statistiques pour mes offres uniquement */}
        {activeTab === 'my-offers' && myOffers.length > 0 && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{pendingOffers}</Text>
              <Text style={styles.statLabel}>En attente</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.success }]}>{acceptedOffers}</Text>
              <Text style={styles.statLabel}>Acceptées</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.danger }]}>{rejectedOffers}</Text>
              <Text style={styles.statLabel}>Rejetées</Text>
            </View>
          </View>
        )}

        <FlatList
          data={currentData}
          keyExtractor={(item) => item.id}
          renderItem={activeTab === 'my-offers' ? renderMyOfferCard : renderReceivedOfferCard}
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
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Offres</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Onglets */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'my-offers' && styles.tabActive]}
          onPress={() => setActiveTab('my-offers')}
        >
          <Text style={[styles.tabText, activeTab === 'my-offers' && styles.tabTextActive]}>
            Mes offres
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.tabActive]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' && styles.tabTextActive]}>
            Reçues
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
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    textTransform: 'uppercase',
  },
  listContent: {
    padding: Spacing.lg,
  },
  offerCard: {
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
  offerCardPending: {
    borderWidth: 2,
    borderColor: Colors.warning,
    backgroundColor: Colors.warning + '08',
    shadowColor: Colors.warning,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  offerCardAccepted: {
    borderWidth: 2,
    borderColor: Colors.success,
    backgroundColor: Colors.success + '08',
    shadowColor: Colors.success,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  offerCardRejected: {
    borderWidth: 1,
    borderColor: Colors.danger + '40',
    backgroundColor: Colors.gray[50],
    opacity: 0.7,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  driverInfo: {
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
  driverName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  ratingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  statusBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  statusText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  offerDate: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
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
  offerDetails: {
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
    flex: 1,
  },
  messageContainer: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
  },
  messageText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontStyle: 'italic',
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  successText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.success,
    fontWeight: FontWeights.medium,
  },
  rejectionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.danger + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  rejectionText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.danger,
    fontWeight: FontWeights.medium,
  },
  cardFooter: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  viewButton: {
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
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  browseButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
});

