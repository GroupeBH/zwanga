import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, CommonStyles } from '@/constants/styles';
import { useDialog } from '@/components/ui/DialogProvider';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useCreateReviewMutation } from '@/store/api/reviewApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { useGetTripBookingsQuery } from '@/store/api/bookingApi';

type TabType = 'rate' | 'report';

export default function RateScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const user = useAppSelector(selectUser);
  const tripId = typeof id === 'string' ? id : '';
  const { data: trip } = useGetTripByIdQuery(tripId, { skip: !tripId });
  const isTripDriver = trip?.driverId === user?.id;
  const { data: tripBookings } = useGetTripBookingsQuery(tripId, {
    skip: !isTripDriver || !tripId,
  });
  const [activeTab, setActiveTab] = useState<TabType>('rate');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [reportReason, setReportReason] = useState('');
  const [selectedPassenger, setSelectedPassenger] = useState<string | null>(null);
  const { showDialog } = useDialog();
  const [createReview, { isLoading: isSubmittingReview }] = useCreateReviewMutation();

  const passengers = useMemo(() => {
    if (!tripBookings) return [];
    return tripBookings
      .filter((booking) => booking.status === 'completed' || booking.status === 'accepted')
      .map((booking) => ({
        id: booking.passengerId,
        name: booking.passengerName ?? 'Passager',
        seats: booking.numberOfSeats,
      }));
  }, [tripBookings]);

  const rateTags = [
    { id: 'punctual', label: 'Ponctuel', icon: 'time' },
    { id: 'friendly', label: 'Sympathique', icon: 'happy' },
    { id: 'clean', label: 'Véhicule propre', icon: 'sparkles' },
    { id: 'safe', label: 'Conduite sûre', icon: 'shield-checkmark' },
    { id: 'respectful', label: 'Respectueux', icon: 'heart' },
    { id: 'professional', label: 'Professionnel', icon: 'briefcase' },
  ];

  const reportReasons = [
    { id: 'dangerous', label: 'Conduite dangereuse', icon: 'warning' },
    { id: 'rude', label: 'Comportement inapproprié', icon: 'alert-circle' },
    { id: 'dirty', label: 'Véhicule sale', icon: 'close-circle' },
    { id: 'late', label: 'Retard important', icon: 'time' },
    { id: 'no-show', label: 'Ne s\'est pas présenté', icon: 'ban' },
    { id: 'overcharge', label: 'Surfacturation', icon: 'cash' },
  ];

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter(t => t !== tagId));
    } else {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      showDialog({
        variant: 'warning',
        title: 'Note requise',
        message: 'Veuillez sélectionner une note avant de soumettre votre avis.',
      });
      return;
    }

    if (!trip || !tripId) {
      showDialog({
        variant: 'danger',
        title: 'Trajet introuvable',
        message: 'Impossible de charger les informations du trajet.',
      });
      return;
    }

    const targetUserId = isTripDriver ? selectedPassenger : trip.driverId;
    if (!targetUserId) {
      showDialog({
        variant: 'warning',
        title: 'Passager requis',
        message: 'Sélectionnez le passager que vous souhaitez évaluer.',
      });
      return;
    }

    try {
      const tagsSummary =
        selectedTags.length > 0 ? `\n\nTags: ${selectedTags.map((tag) => `#${tag}`).join(' ')}` : '';
      await createReview({
        tripId,
        ratedUserId: targetUserId,
        rating,
        comment: `${comment.trim()}${tagsSummary}`.trim(),
      }).unwrap();

      showDialog({
        variant: 'success',
        title: 'Évaluation envoyée',
        message: 'Merci pour votre évaluation !',
        actions: [{ label: 'Retour', variant: 'primary', onPress: () => router.back() }],
      });
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de soumettre votre avis pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const handleSubmitReport = () => {
    if (!reportReason) {
      showDialog({
        variant: 'warning',
        title: 'Raison requise',
        message: 'Veuillez sélectionner une raison avant de signaler ce trajet.',
      });
      return;
    }

    showDialog({
      variant: 'info',
      title: 'Signalement envoyé',
      message:
        'Nous examinerons votre signalement. Merci pour votre contribution à la sécurité de la communauté.',
      actions: [{ label: 'Fermer', variant: 'primary', onPress: () => router.back() }],
    });
  };

  const getRatingText = () => {
    if (rating === 5) return 'Excellent !';
    if (rating === 4) return 'Très bien';
    if (rating === 3) return 'Bien';
    if (rating === 2) return 'Moyen';
    return 'Mauvais';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Votre avis</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'rate' && styles.tabActive]}
            onPress={() => setActiveTab('rate')}
          >
            <Text style={[styles.tabText, activeTab === 'rate' && styles.tabTextActive]}>
              Noter
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'report' && styles.tabActive]}
            onPress={() => setActiveTab('report')}
          >
            <Text style={[styles.tabText, activeTab === 'report' && styles.tabTextActive]}>
              Signaler
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Onglet Notation */}
        {activeTab === 'rate' && (
          <Animated.View entering={FadeInDown}>
            {/* Info conducteur / passager */}
            <View style={styles.driverCard}>
              <View style={styles.driverInfo}>
                <View style={styles.driverAvatar} />
                <View style={styles.driverDetails}>
                  <Text style={styles.driverName}>
                    {isTripDriver ? 'Choisissez un passager' : trip?.driverName ?? 'Conducteur'}
                  </Text>
                  <View style={styles.driverMeta}>
                    <Ionicons name="star" size={16} color={Colors.secondary} />
                    <Text style={styles.driverMetaText}>
                      {isTripDriver
                        ? 'Attribuez une note à vos passagers'
                        : `${trip?.driverRating?.toFixed?.(1) ?? '—'} · ${
                            trip?.vehicleInfo ?? 'Véhicule à confirmer'
                          }`}
                    </Text>
                  </View>
                  {trip && (
                    <Text style={styles.driverTrip}>
                      {trip.departure?.name ?? 'Départ'} → {trip.arrival?.name ?? 'Arrivée'}
                    </Text>
                  )}
                </View>
              </View>
              {isTripDriver && (
                <View style={styles.dropSection}>
                  <Text style={styles.dropLabel}>Sélectionner un passager</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.passengerChips}
                  >
                    {passengers.length === 0 ? (
                      <Text style={styles.emptyPassengerText}>
                        Aucun passager à évaluer pour ce trajet.
                      </Text>
                    ) : (
                      passengers.map((passenger) => {
                        const active = selectedPassenger === passenger.id;
                        return (
                          <TouchableOpacity
                            key={passenger.id}
                            style={[styles.passengerChip, active && styles.passengerChipActive]}
                            onPress={() => setSelectedPassenger(passenger.id)}
                          >
                            <Ionicons
                              name="person"
                              size={16}
                              color={active ? Colors.white : Colors.gray[600]}
                            />
                            <Text
                              style={[
                                styles.passengerChipText,
                                active && styles.passengerChipTextActive,
                              ]}
                            >
                              {passenger.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Étoiles */}
            <View style={styles.ratingContainer}>
              <Text style={styles.ratingTitle}>
                {isTripDriver
                  ? 'Comment s’est comporté ce passager ?'
                  : "Comment s'est passé le trajet ?"}
              </Text>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRating(star)}
                    style={styles.starButton}
                  >
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={40}
                      color={star <= rating ? Colors.secondary : Colors.gray[300]}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              {rating > 0 && (
                <Text style={styles.ratingText}>{getRatingText()}</Text>
              )}
            </View>

            {/* Tags */}
            {rating > 0 && (
              <View style={styles.tagsContainer}>
                <Text style={styles.tagsTitle}>
                  Qu'avez-vous particulièrement apprécié ?
                </Text>
                <View style={styles.tagsList}>
                  {rateTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag.id);
                    return (
                      <TouchableOpacity
                        key={tag.id}
                        style={[
                          styles.tag,
                          isSelected && styles.tagActive,
                          { marginRight: Spacing.sm, marginBottom: Spacing.sm },
                        ]}
                        onPress={() => toggleTag(tag.id)}
                      >
                        <Ionicons
                          name={tag.icon as any}
                          size={16}
                          color={isSelected ? Colors.white : Colors.gray[600]}
                        />
                        <Text style={[styles.tagText, isSelected && styles.tagTextActive]}>
                          {tag.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Commentaire */}
            {rating > 0 && (
              <View style={styles.commentContainer}>
                <Text style={styles.commentTitle}>
                  Commentaire (optionnel)
                </Text>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Partagez votre expérience..."
                  placeholderTextColor={Colors.gray[500]}
                  multiline
                  textAlignVertical="top"
                  value={comment}
                  onChangeText={setComment}
                  maxLength={500}
                />
                <Text style={styles.commentCounter}>
                  {comment.length}/500
                </Text>
              </View>
            )}

            {/* Bouton Envoyer */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                rating > 0 ? styles.submitButtonActive : styles.submitButtonDisabled,
                isSubmittingReview && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitRating}
              disabled={rating === 0 || isSubmittingReview}
            >
              <Text style={styles.submitButtonText}>
                {isSubmittingReview ? 'Envoi…' : "Envoyer l'évaluation"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Onglet Signalement */}
        {activeTab === 'report' && (
          <Animated.View entering={FadeInDown}>
            {/* Avertissement */}
            <View style={styles.warningCard}>
              <View style={styles.warningContent}>
                <Ionicons name="warning" size={24} color={Colors.danger} />
                <View style={styles.warningText}>
                  <Text style={styles.warningTitle}>Signalement sérieux</Text>
                  <Text style={styles.warningMessage}>
                    Les faux signalements peuvent entraîner la suspension de votre compte. Signalez uniquement des problèmes réels et graves.
                  </Text>
                </View>
              </View>
            </View>

            {/* Info conducteur */}
            <View style={styles.driverCard}>
              <View style={styles.driverInfo}>
                <View style={styles.driverAvatar} />
                <View style={styles.driverDetails}>
                  <Text style={styles.driverName}>{trip?.driverName ?? 'Conducteur'}</Text>
                  <Text style={styles.driverTrip}>
                    Trajet: {trip?.departure?.name ?? 'Départ'} → {trip?.arrival?.name ?? 'Arrivée'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Raisons */}
            <View style={styles.reasonsContainer}>
              <Text style={styles.reasonsTitle}>
                Raison du signalement *
              </Text>
              {reportReasons.map((reason) => {
                const isSelected = reportReason === reason.id;
                return (
                  <TouchableOpacity
                    key={reason.id}
                    style={[
                      styles.reasonCard,
                      isSelected && styles.reasonCardActive,
                      { marginBottom: Spacing.md },
                    ]}
                    onPress={() => setReportReason(reason.id)}
                  >
                    <View style={[styles.reasonIcon, isSelected && styles.reasonIconActive]}>
                      <Ionicons
                        name={reason.icon as any}
                        size={24}
                        color={isSelected ? Colors.white : Colors.gray[600]}
                      />
                    </View>
                    <Text style={[styles.reasonText, isSelected && styles.reasonTextActive]}>
                      {reason.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color={Colors.danger} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Détails */}
            {reportReason && (
              <View style={styles.commentContainer}>
                <Text style={styles.commentTitle}>
                  Détails supplémentaires *
                </Text>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Décrivez précisément le problème rencontré..."
                  placeholderTextColor={Colors.gray[500]}
                  multiline
                  textAlignVertical="top"
                  value={comment}
                  onChangeText={setComment}
                  maxLength={500}
                />
                <Text style={styles.commentCounter}>
                  {comment.length}/500
                </Text>
              </View>
            )}

            {/* Bouton Envoyer */}
            <TouchableOpacity
              style={[styles.submitButton, reportReason ? styles.submitButtonDanger : styles.submitButtonDisabled]}
              onPress={handleSubmitReport}
              disabled={!reportReason}
            >
              <Text style={styles.submitButtonText}>Envoyer le signalement</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
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
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  closeButton: {
    marginRight: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
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
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  driverCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    ...CommonStyles.shadowSm,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverAvatar: {
    width: 64,
    height: 64,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.lg,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.lg,
    marginBottom: Spacing.xs,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverMetaText: {
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
    fontSize: FontSizes.base,
  },
  passengerChips: {
    marginTop: Spacing.md,
  },
  passengerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.sm,
    backgroundColor: Colors.white,
  },
  passengerChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  passengerChipText: {
    marginLeft: Spacing.xs,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  passengerChipTextActive: {
    color: Colors.white,
  },
  emptyPassengerText: {
    color: Colors.gray[500],
  },
  driverTrip: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  ratingContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  ratingTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.lg,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  starButton: {
    padding: Spacing.sm,
    marginHorizontal: Spacing.xs,
  },
  ratingText: {
    color: Colors.gray[600],
    marginTop: Spacing.sm,
    fontSize: FontSizes.base,
  },
  tagsContainer: {
    marginBottom: Spacing.xl,
  },
  tagsTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.md,
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  tagActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tagText: {
    marginLeft: Spacing.sm,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  tagTextActive: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  commentContainer: {
    marginBottom: Spacing.xl,
  },
  commentTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  commentInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    minHeight: 100,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  commentCounter: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
    textAlign: 'right',
  },
  dropSection: {
    marginBottom: Spacing.lg,
  },
  dropLabel: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  submitButton: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
  },
  submitButtonActive: {
    backgroundColor: Colors.primary,
  },
  submitButtonDanger: {
    backgroundColor: Colors.danger,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  warningCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  warningTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.dangerDark,
    marginBottom: Spacing.xs,
    fontSize: FontSizes.base,
  },
  warningMessage: {
    fontSize: FontSizes.sm,
    color: Colors.dangerDark,
    opacity: 0.8,
  },
  reasonsContainer: {
    marginBottom: Spacing.xl,
  },
  reasonsTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.md,
  },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  reasonCardActive: {
    borderColor: Colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  reasonIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    backgroundColor: Colors.gray[100],
  },
  reasonIconActive: {
    backgroundColor: Colors.danger,
  },
  reasonText: {
    flex: 1,
    fontWeight: FontWeights.medium,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  reasonTextActive: {
    color: Colors.dangerDark,
  },
});
