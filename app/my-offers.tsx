import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetMyDriverOffersQuery } from '@/store/api/tripRequestApi';
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
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import type { DriverOfferWithTripRequest } from '@/types';

export default function MyDriverOffersScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const {
    data: offers = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetMyDriverOffersQuery();

  const handleOfferPress = (tripRequestId: string) => {
    console.log('[MyOffers] Navigating to trip request:', tripRequestId);
    if (!tripRequestId) {
      console.error('[MyOffers] tripRequestId is empty or undefined');
      return;
    }
    router.push(`/request/${tripRequestId}`);
  };

  const renderOfferCard = ({ item, index }: { item: DriverOfferWithTripRequest; index: number }) => {
    // Utiliser tripRequest.id au lieu de tripRequestId si disponible
    const tripRequestId = item.tripRequest?.id || item.tripRequestId;
    
    const statusConfig = {
      pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15', icon: 'time-outline' },
      accepted: { label: 'Acceptée', color: Colors.success, bg: Colors.success + '15', icon: 'checkmark-circle' },
      rejected: { label: 'Rejetée', color: Colors.danger, bg: Colors.danger + '15', icon: 'close-circle' },
      cancelled: { label: 'Annulée', color: Colors.gray[500], bg: Colors.gray[200], icon: 'ban-outline' },
    }[item.status] || statusConfig.pending;

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
                {item.tripRequest.departureLocation}
              </Text>
            </View>
            <View style={styles.routeRow}>
              <Ionicons name="navigate" size={16} color={Colors.primary} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.tripRequest.arrivalLocation}
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mes offres</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Chargement de vos offres...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pendingOffers = offers.filter((o) => o.status === 'pending').length;
  const acceptedOffers = offers.filter((o) => o.status === 'accepted').length;
  const rejectedOffers = offers.filter((o) => o.status === 'rejected').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes offres</Text>
        <View style={styles.headerSpacer} />
      </View>

      {offers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>Aucune offre</Text>
          <Text style={styles.emptyText}>
            Vous n'avez pas encore fait d'offre. Parcourez les demandes de trajet disponibles et proposez vos services.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.push('/requests')}
          >
            <Ionicons name="search" size={20} color={Colors.white} />
            <Text style={styles.browseButtonText}>Parcourir les demandes</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Statistiques */}
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

          <FlatList
            data={offers}
            keyExtractor={(item) => item.id}
            renderItem={renderOfferCard}
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

