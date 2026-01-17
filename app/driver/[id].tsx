import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
import { useGetTripsQuery } from '@/store/api/tripApi';
import { useGetPublicUserInfoQuery } from '@/store/api/userApi';
import { openPhoneCall, openWhatsApp } from '@/utils/phoneHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function DriverDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const driverId = typeof params.id === 'string' ? params.id : '';

  const { data: driver, isLoading: driverLoading, refetch: refetchDriver } = useGetPublicUserInfoQuery(driverId, {
    skip: !driverId,
  });

  const { data: reviews, refetch: refetchReviews } = useGetReviewsQuery(driverId, {
    skip: !driverId,
  });

  const { data: avgRatingData, refetch: refetchAvgRating } = useGetAverageRatingQuery(driverId, {
    skip: !driverId,
  });

  // Récupérer les trajets du driver pour calculer les statistiques
  // Note: L'API peut ne pas supporter le filtre driverId, donc on récupère tous les trajets et on filtre côté client
  // Pour une meilleure performance, on pourrait créer une API dédiée
  const { data: allTrips, refetch: refetchTrips } = useGetTripsQuery(
    {},
    {
      skip: !driverId,
    }
  );

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchDriver(),
        refetchReviews(),
        refetchAvgRating(),
        refetchTrips(),
      ]);
    } catch (error) {
      console.warn('Error refreshing driver data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchDriver, refetchReviews, refetchAvgRating, refetchTrips]);

  const driverTrips = useMemo(() => {
    if (!allTrips) return [];
    return allTrips.filter((trip) => trip.driverId === driverId);
  }, [allTrips, driverId]);

  const stats = useMemo(() => {
    const totalTrips = driver?.totalTrips ?? driverTrips.length;
    const completedTrips = driverTrips.filter((trip) => trip.status === 'completed').length;
    return {
      totalTrips,
      completedTrips,
    };
  }, [driver?.totalTrips, driverTrips]);

  const reviewCount = reviews?.length ?? 0;
  const averageRating = useMemo(() => {
    if (avgRatingData?.averageRating !== undefined) {
      return avgRatingData.averageRating;
    }
    if (reviews && reviews.length > 0) {
      const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
      return sum / reviews.length;
    }
    return driver?.rating ?? 0;
  }, [avgRatingData, reviews, driver?.rating]);

  const driverName = useMemo(() => {
    if (!driver) return '';
    const fullName = [driver.firstName, driver.lastName].filter(Boolean).join(' ').trim();
    return fullName || driver.name || 'Conducteur';
  }, [driver]);

  const driverPhone = driver?.phone ?? null;

  if (driverLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loaderText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!driver) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="person-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyText}>Conducteur non trouvé</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.gray[800]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil du conducteur</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Informations principales */}
        <View style={styles.section}>
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              {driver.profilePicture ? (
                <Image
                  source={{ uri: driver.profilePicture }}
                  style={styles.profileAvatar}
                />
              ) : (
                <View style={styles.profileAvatar}>
                  <Ionicons name="person" size={48} color={Colors.gray[500]} />
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{driverName}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={20} color={Colors.secondary} />
                  <Text style={styles.ratingText}>{averageRating.toFixed(1)}</Text>
                  {reviewCount > 0 && (
                    <>
                      <Text style={styles.ratingSeparator}>•</Text>
                      <Text style={styles.reviewCount}>{reviewCount} avis</Text>
                    </>
                  )}
                </View>
              </View>
            </View>

            {/* Numéro de téléphone */}
            {driverPhone && (
              <View style={styles.phoneSection}>
                <View style={styles.phoneInfo}>
                  <Ionicons name="call-outline" size={20} color={Colors.gray[600]} />
                  <Text style={styles.phoneText}>{driverPhone}</Text>
                </View>
                <View style={styles.phoneActions}>
                  <TouchableOpacity
                    style={[styles.phoneButton, styles.phoneButtonCall]}
                    onPress={() => {
                      openPhoneCall(driverPhone, (errorMsg: string) => {
                        // Gérer l'erreur si nécessaire
                        console.error('Erreur appel:', errorMsg);
                      });
                    }}
                  >
                    <Ionicons name="call" size={18} color={Colors.success} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.phoneButton, styles.phoneButtonWhatsApp]}
                    onPress={() => {
                      openWhatsApp(driverPhone, (errorMsg: string) => {
                        // Gérer l'erreur si nécessaire
                        console.error('Erreur WhatsApp:', errorMsg);
                      });
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Statistiques */}
        <View style={styles.section}>
          <View style={styles.statsCard}>
            <Text style={styles.sectionTitle}>STATISTIQUES</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.totalTrips}</Text>
                <Text style={styles.statLabel}>Trajets publiés</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.completedTrips}</Text>
                <Text style={styles.statLabel}>Trajets complétés</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Véhicules */}
        <View style={styles.section}>
          <View style={styles.vehiclesCard}>
            <Text style={styles.sectionTitle}>VÉHICULES</Text>
            {driverTrips.length > 0 ? (
              <View style={styles.vehiclesList}>
                {Array.from(
                  new Map(
                    driverTrips
                      .filter((trip) => trip.vehicle)
                      .map((trip) => [trip.vehicle!.id, trip.vehicle!])
                  ).values()
                ).map((vehicle) => (
                  <View key={vehicle.id} style={styles.vehicleItem}>
                    <View style={styles.vehicleIcon}>
                      <Ionicons name="car" size={24} color={Colors.primary} />
                    </View>
                    <View style={styles.vehicleInfo}>
                      <Text style={styles.vehicleName}>
                        {vehicle.brand} {vehicle.model}
                      </Text>
                      <Text style={styles.vehicleDetails}>
                        {vehicle.color} • {vehicle.licensePlate}
                      </Text>
                    </View>
                    {vehicle.photoUrl && (
                      <Image
                        source={{ uri: vehicle.photoUrl }}
                        style={styles.vehiclePhoto}
                      />
                    )}
                  </View>
                ))}
                {driverTrips.filter((trip) => trip.vehicle).length === 0 && (
                  <Text style={styles.emptyVehiclesText}>
                    Aucun véhicule enregistré visible publiquement
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.emptyVehiclesText}>
                Aucun véhicule enregistré visible publiquement
              </Text>
            )}
          </View>
        </View>

        {/* Avis */}
        <View style={styles.section}>
          <View style={styles.reviewsCard}>
            <Text style={styles.sectionTitle}>AVIS ({reviewCount})</Text>
            {reviewCount === 0 ? (
              <Text style={styles.emptyReviewsText}>
                Pas encore d'avis pour ce conducteur
              </Text>
            ) : (
              <View style={styles.reviewsList}>
                {reviews?.map((review) => (
                  <View key={review.id} style={styles.reviewItem}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewAuthor}>
                        {review.fromUserName ?? 'Utilisateur'}
                      </Text>
                      <View style={styles.reviewRating}>
                        <Ionicons name="star" size={16} color={Colors.secondary} />
                        <Text style={styles.reviewRatingText}>
                          {review.rating.toFixed(1)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.reviewDate}>
                      {new Date(review.createdAt).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </Text>
                    {review.comment && (
                      <Text style={styles.reviewComment}>{review.comment}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
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
    paddingTop: 50,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: Spacing.xxl,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loaderText: {
    marginTop: Spacing.md,
    color: Colors.gray[600],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.md,
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  profileCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
    marginRight: Spacing.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: FontSizes.xl,
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
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  ratingSeparator: {
    color: Colors.gray[400],
    marginHorizontal: Spacing.xs,
  },
  reviewCount: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  phoneSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  phoneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.md,
  },
  phoneText: {
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    marginLeft: Spacing.sm,
    fontWeight: FontWeights.medium,
  },
  phoneActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  phoneButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  phoneButtonCall: {
    borderColor: Colors.success,
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  phoneButtonWhatsApp: {
    borderColor: '#25D366',
    backgroundColor: 'rgba(37, 211, 102, 0.1)',
  },
  statsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  sectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
  },
  statValue: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  vehiclesCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  vehiclesList: {
    marginTop: Spacing.md,
  },
  vehicleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  vehicleDetails: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  vehiclePhoto: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    marginLeft: Spacing.md,
  },
  emptyVehiclesText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  reviewsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  reviewsList: {
    marginTop: Spacing.md,
  },
  reviewItem: {
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  reviewAuthor: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  reviewRatingText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  reviewDate: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginBottom: Spacing.xs,
  },
  reviewComment: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    lineHeight: 20,
  },
  emptyReviewsText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  backButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    marginTop: Spacing.md,
  },
});

