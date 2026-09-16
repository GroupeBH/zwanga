import { styles } from '../../features/screen-styles/app/passenger/detail/index';
import { Colors } from '@/constants/styles';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
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

export default function PassengerDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const passengerId = typeof params.id === 'string' ? params.id : '';

  const { data: passenger, isLoading: passengerLoading, refetch: refetchPassenger } = useGetPublicUserInfoQuery(passengerId, {
    skip: !passengerId,
  });

  const { data: reviews, refetch: refetchReviews } = useGetReviewsQuery(passengerId, {
    skip: !passengerId,
  });

  const { data: avgRatingData, refetch: refetchAvgRating } = useGetAverageRatingQuery(passengerId, {
    skip: !passengerId,
  });

  // Récupérer les réservations du passager pour calculer les statistiques
  // Note: On utilise getMyBookings pour l'utilisateur connecté, mais pour un autre passager,
  // on devrait idéalement avoir une API dédiée. Pour l'instant, on utilise les données disponibles.
  const { data: myBookings, refetch: refetchBookings } = useGetMyBookingsQuery(undefined, {
    skip: !passengerId,
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchPassenger(),
        refetchReviews(),
        refetchAvgRating(),
        refetchBookings(),
      ]);
    } catch (error) {
      console.warn('Error refreshing passenger data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchPassenger, refetchReviews, refetchAvgRating, refetchBookings]);

  // Filtrer les réservations de ce passager spécifique
  const passengerBookings = useMemo(() => {
    if (!myBookings) return [];
    // Si c'est l'utilisateur connecté, on affiche toutes ses réservations
    // Sinon, on devrait avoir une API pour récupérer les réservations d'un passager spécifique
    // Pour l'instant, on retourne un tableau vide si ce n'est pas l'utilisateur connecté
    return myBookings.filter((booking) => booking.passengerId === passengerId);
  }, [myBookings, passengerId]);

  const stats = useMemo(() => {
    const totalBookings = passengerBookings.length;
    const completedBookings = passengerBookings.filter((booking) => booking.status === 'completed').length;
    const acceptedBookings = passengerBookings.filter((booking) => booking.status === 'accepted').length;
    return {
      totalBookings,
      completedBookings,
      acceptedBookings,
    };
  }, [passengerBookings]);

  const reviewCount = reviews?.length ?? 0;
  const averageRating = useMemo(() => {
    if (avgRatingData?.averageRating !== undefined) {
      return avgRatingData.averageRating;
    }
    if (reviews && reviews.length > 0) {
      const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
      return sum / reviews.length;
    }
    return passenger?.rating ?? 0;
  }, [avgRatingData, reviews, passenger?.rating]);

  const passengerName = useMemo(() => {
    if (!passenger) return '';
    const fullName = [passenger.firstName, passenger.lastName].filter(Boolean).join(' ').trim();
    return fullName || passenger.name || 'Passager';
  }, [passenger]);

  const passengerPhone = passenger?.phone ?? null;

  if (passengerLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loaderText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!passenger) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="person-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyText}>Passager non trouvé</Text>
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
        <Text style={styles.headerTitle}>Profil du passager</Text>
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
              {passenger.profilePicture ? (
                <Image
                  source={{ uri: passenger.profilePicture }}
                  style={styles.profileAvatar}
                />
              ) : (
                <View style={styles.profileAvatar}>
                  <Ionicons name="person" size={48} color={Colors.gray[500]} />
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{passengerName}</Text>
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
            {passengerPhone && (
              <View style={styles.phoneSection}>
                <View style={styles.phoneInfo}>
                  <Ionicons name="call-outline" size={20} color={Colors.gray[600]} />
                  <Text style={styles.phoneText}>{passengerPhone}</Text>
                </View>
                <View style={styles.phoneActions}>
                  <TouchableOpacity
                    style={[styles.phoneButton, styles.phoneButtonCall]}
                    onPress={() => {
                      openPhoneCall(passengerPhone, (errorMsg: string) => {
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
                      openWhatsApp(passengerPhone, (errorMsg: string) => {
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
                <Text style={styles.statValue}>{stats.totalBookings}</Text>
                <Text style={styles.statLabel}>Réservations</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.acceptedBookings}</Text>
                <Text style={styles.statLabel}>Acceptées</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.completedBookings}</Text>
                <Text style={styles.statLabel}>Complétées</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Avis */}
        <View style={styles.section}>
          <View style={styles.reviewsCard}>
            <Text style={styles.sectionTitle}>AVIS ({reviewCount})</Text>
            {reviewCount === 0 ? (
              <Text style={styles.emptyReviewsText}>
                Pas encore d’avis pour ce passager
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




