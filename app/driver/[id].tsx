import { styles } from '../../features/screen-styles/app/driver/detail/index';
import { Colors } from '@/constants/styles';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
import { useGetAllTripsQuery } from '@/store/api/tripApi';
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
  const { data: allTrips, refetch: refetchTrips } = useGetAllTripsQuery(
    {
      skip: !driver?.id,
    }
  );

  const [refreshing, setRefreshing] = useState(false);
  console.log("driver's trips:", allTrips?.length)

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
    const totalTrips = driverTrips?.length;
    const completedTrips = driverTrips?.filter((trip) => trip.status === 'completed').length;
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
                      .filter((trip) => trip?.vehicle?.isActive)
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
                Pas encore d’avis pour ce conducteur
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



