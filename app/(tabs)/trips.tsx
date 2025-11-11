import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppSelector } from '@/store/hooks';
import { selectUpcomingTrips, selectCompletedTrips } from '@/store/selectors';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, CommonStyles } from '@/constants/styles';

type TripTab = 'upcoming' | 'completed';

export default function TripsScreen() {
  const upcomingTrips = useAppSelector(selectUpcomingTrips);
  const completedTrips = useAppSelector(selectCompletedTrips);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TripTab>('upcoming');

  const displayTrips = activeTab === 'upcoming' ? upcomingTrips : completedTrips;

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'upcoming':
        return { bgColor: 'rgba(247, 184, 1, 0.1)', textColor: Colors.secondary, label: 'À venir' };
      case 'ongoing':
        return { bgColor: 'rgba(52, 152, 219, 0.1)', textColor: Colors.info, label: 'En cours' };
      case 'completed':
        return { bgColor: 'rgba(46, 204, 113, 0.1)', textColor: Colors.success, label: 'Terminé' };
      default:
        return { bgColor: Colors.gray[200], textColor: Colors.gray[600], label: status };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes trajets</Text>
        
        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
            onPress={() => setActiveTab('upcoming')}
          >
            <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
              À venir ({upcomingTrips.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
            onPress={() => setActiveTab('completed')}
          >
            <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
              Terminés ({completedTrips.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {displayTrips.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="car-outline" size={48} color={Colors.gray[500]} />
            </View>
            <Text style={styles.emptyTitle}>Aucun trajet</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'upcoming' 
                ? 'Vous n\'avez pas de trajet à venir'
                : 'Vous n\'avez pas encore terminé de trajet'
              }
            </Text>
            {activeTab === 'upcoming' && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/publish')}
              >
                <Text style={styles.emptyButtonText}>Publier un trajet</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          displayTrips.map((trip, index) => {
            const statusConfig = getStatusConfig(trip.status);
            return (
              <Animated.View
                key={trip.id}
                entering={FadeInDown.delay(index * 100)}
                style={styles.tripCard}
              >
                {/* Header */}
                <View style={styles.tripHeader}>
                  <View style={styles.tripDriverInfo}>
                    <View style={styles.avatar} />
                    <View style={styles.tripDriverDetails}>
                      <Text style={styles.driverName}>{trip.driverName}</Text>
                      <View style={styles.driverMeta}>
                        <Ionicons name="star" size={14} color={Colors.secondary} />
                        <Text style={styles.driverRating}>{trip.driverRating}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                    <Text style={[styles.statusText, { color: statusConfig.textColor }]}>
                      {statusConfig.label}
                    </Text>
                  </View>
                </View>

                {/* Route */}
                <View style={styles.routeContainer}>
                  <View style={styles.routeRow}>
                    <Ionicons name="location" size={16} color={Colors.success} />
                    <Text style={styles.routeText}>{trip.departure.name}</Text>
                    <Text style={styles.routeTime}>
                      {trip.departureTime.getHours()}:{trip.departureTime.getMinutes().toString().padStart(2, '0')}
                    </Text>
                  </View>
                  <View style={styles.routeDivider} />
                  <View style={styles.routeRow}>
                    <Ionicons name="navigate" size={16} color={Colors.primary} />
                    <Text style={styles.routeText}>{trip.arrival.name}</Text>
                    <Text style={styles.routeTime}>
                      {trip.arrivalTime.getHours()}:{trip.arrivalTime.getMinutes().toString().padStart(2, '0')}
                    </Text>
                  </View>
                </View>

                {/* Info */}
                <View style={styles.tripFooter}>
                  <View style={styles.tripFooterLeft}>
                    <View style={styles.infoItem}>
                      <Ionicons name="people" size={16} color={Colors.gray[600]} />
                      <Text style={styles.infoText}>{trip.availableSeats} places</Text>
                    </View>
                    <View style={[styles.infoItem, { marginLeft: Spacing.lg }]}>
                      <Ionicons name="cash" size={16} color={Colors.gray[600]} />
                      <Text style={styles.infoText}>{trip.price} FC</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.detailsButton}
                    onPress={() => router.push(`/trip/${trip.id}`)}
                  >
                    <Text style={styles.detailsButtonText}>Détails</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* FAB - Publier un trajet */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/publish')}
      >
        <Ionicons name="add" size={32} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.lg,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: Colors.white,
  },
  tabText: {
    textAlign: 'center',
    fontWeight: FontWeights.semibold,
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  emptyText: {
    color: Colors.gray[600],
    textAlign: 'center',
    marginBottom: Spacing.xl,
    fontSize: FontSizes.base,
  },
  emptyButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  emptyButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  tripCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  tripDriverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
  },
  tripDriverDetails: {
    flex: 1,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  routeContainer: {
    marginBottom: Spacing.md,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  routeText: {
    color: Colors.gray[700],
    marginLeft: Spacing.sm,
    flex: 1,
    fontSize: FontSizes.base,
  },
  routeTime: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  routeDivider: {
    width: 2,
    height: 24,
    backgroundColor: Colors.gray[300],
    marginLeft: 8,
    marginBottom: Spacing.sm,
  },
  tripFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  tripFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  detailsButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    marginRight: Spacing.xs,
    fontSize: FontSizes.sm,
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.xl,
    width: 64,
    height: 64,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowLg,
  },
});
