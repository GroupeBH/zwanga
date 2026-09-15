import { useRatingData } from '../../hooks/rating/useRatingData';
import { RatingParticipantSelector } from '../../features/rating/RatingParticipantSelector';
import { useRatingActions } from '../../hooks/rating/useRatingActions';
import { styles } from '../../features/screen-styles/app/rate/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RateScreen() {
  const { selectedTags, setSelectedTags, submitInFlightRef, isSubmittingReview, setSubmitSuccessMessage, rating, showDialog, trip, tripId, rateTargetType, selectedPassenger, passengers, comment, createReview, isMountedRef, successReturnTimeoutRef, goBackSafely, reportReason, isTripDriver, isTripPassenger, activeTab, setActiveTab, setRateTargetType, setSelectedPassenger, bookingsLoading, bookingsError, refetchBookings, setRating, rateTags, setComment, submitSuccessMessage, reportReasons, setReportReason } = useRatingData();

  const { getRatingText, toggleTag, handleSubmitRating, handleSubmitReport } = useRatingActions({
    selectedTags,
    setSelectedTags,
    submitInFlightRef,
    isSubmittingReview,
    setSubmitSuccessMessage,
    rating,
    showDialog,
    trip,
    tripId,
    rateTargetType,
    selectedPassenger,
    passengers,
    comment,
    createReview,
    isMountedRef,
    successReturnTimeoutRef,
    goBackSafely,
    reportReason,
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={goBackSafely} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isTripDriver 
              ? 'Évaluer un passager' 
              : isTripPassenger 
              ? 'Évaluer les intervenants'
              : 'Votre avis'}
          </Text>
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
            <RatingParticipantSelector
              isTripDriver={isTripDriver}
              rateTargetType={rateTargetType}
              trip={trip}
              selectedPassenger={selectedPassenger}
              passengers={passengers}
              isTripPassenger={isTripPassenger}
              setRateTargetType={setRateTargetType}
              setSelectedPassenger={setSelectedPassenger}
              bookingsLoading={bookingsLoading}
              bookingsError={bookingsError}
              refetchBookings={refetchBookings}
            />

            {/* Étoiles */}
            <View style={styles.ratingContainer}>
              <Text style={styles.ratingTitle}>
                {rateTargetType === 'driver'
                  ? "Comment s'est passé le trajet avec ce conducteur ?"
                  : "Comment s'est comporté ce passager ?"}
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
                  {rateTargetType === 'driver'
                    ? 'Qu\'avez-vous particulièrement apprécié chez ce conducteur ?'
                    : 'Qu\'avez-vous particulièrement apprécié chez ce passager ?'}
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

            {submitSuccessMessage && (
              <View style={styles.successMessage}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={styles.successMessageText}>{submitSuccessMessage}</Text>
              </View>
            )}

            {/* Bouton Envoyer */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                rating > 0 ? styles.submitButtonActive : styles.submitButtonDisabled,
                (isSubmittingReview || Boolean(submitSuccessMessage)) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitRating}
              disabled={rating === 0 || isSubmittingReview || Boolean(submitSuccessMessage)}
            >
              {isSubmittingReview ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>
                  {submitSuccessMessage ? 'Envoyée' : "Envoyer l'évaluation"}
                </Text>
              )}
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


