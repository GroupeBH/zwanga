import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
import { useGetPublicUserInfoQuery } from '@/store/api/userApi';
import { openPhoneCall, openWhatsApp } from '@/utils/phoneHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function PassengerDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const passengerId = typeof params.id === 'string' ? params.id : '';

  const { data: passenger, isLoading: passengerLoading } = useGetPublicUserInfoQuery(passengerId, {
    skip: !passengerId,
  });

  const { data: reviews } = useGetReviewsQuery(passengerId, {
    skip: !passengerId,
  });

  const { data: avgRatingData } = useGetAverageRatingQuery(passengerId, {
    skip: !passengerId,
  });

  // Récupérer les réservations du passager pour calculer les statistiques
  // Note: On utilise getMyBookings pour l'utilisateur connecté, mais pour un autre passager,
  // on devrait idéalement avoir une API dédiée. Pour l'instant, on utilise les données disponibles.
  const { data: myBookings } = useGetMyBookingsQuery(undefined, {
    skip: !passengerId,
  });

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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
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
                Pas encore d'avis pour ce passager
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
    paddingTop: Spacing.lg,
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


