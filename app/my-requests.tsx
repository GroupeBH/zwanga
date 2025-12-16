import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
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
import { formatTime, formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import type { TripRequest } from '@/types';

export default function MyTripRequestsScreen() {
  const router = useRouter();
  const { showDialog } = useDialog();
  const {
    data: tripRequests = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetMyTripRequestsQuery();

  const handleRequestPress = (requestId: string) => {
    router.push(`/request/${requestId}`);
  };

  const renderTripRequestCard = ({ item, index }: { item: TripRequest; index: number }) => {
    const statusConfig = {
      pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
      offers_received: { label: 'Offres reçues', color: Colors.info, bg: Colors.info + '15' },
      driver_selected: { label: 'Driver sélectionné', color: Colors.success, bg: Colors.success + '15' },
      cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '15' },
      expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200] },
    }[item.status] || statusConfig.pending;

    const offersCount = item.driverOffers?.length || 0;
    const pendingOffersCount = item.driverOffers?.filter((o) => o.status === 'pending').length || 0;

    return (
      <Animated.View entering={FadeInDown.delay(index * 100)}>
        <TouchableOpacity
          style={styles.requestCard}
          onPress={() => handleRequestPress(item.id)}
        >
          <View style={styles.requestHeader}>
            <View style={styles.statusBadgeContainer}>
              <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                  {statusConfig.label}
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

          {item.selectedDriver && (
            <View style={styles.selectedDriverContainer}>
              <View style={styles.selectedDriverInfo}>
                {item.selectedDriver.avatar ? (
                  <Image
                    source={{ uri: item.selectedDriver.avatar }}
                    style={styles.selectedDriverAvatar}
                  />
                ) : (
                  <View style={styles.selectedDriverAvatar}>
                    <Ionicons name="person" size={16} color={Colors.gray[500]} />
                  </View>
                )}
                <View>
                  <Text style={styles.selectedDriverLabel}>Driver sélectionné</Text>
                  <Text style={styles.selectedDriverName}>{item.selectedDriver.name}</Text>
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
          onPress={() => router.push('/request')}
        >
          <Ionicons name="add-circle" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {tripRequests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>Aucune demande</Text>
          <Text style={styles.emptyText}>
            Vous n'avez pas encore créé de demande de trajet. Créez-en une pour que les drivers vous proposent leurs services.
          </Text>
          <TouchableOpacity
            style={styles.createRequestButton}
            onPress={() => router.push('/request')}
          >
            <Ionicons name="add-circle" size={20} color={Colors.white} />
            <Text style={styles.createRequestButtonText}>Créer une demande</Text>
          </TouchableOpacity>
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
  createButton: {
    padding: Spacing.xs,
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
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestHeader: {
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
  requestDate: {
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

