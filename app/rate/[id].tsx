import { useRatingData } from '../../hooks/rating/useRatingData';
import { RatingParticipantSelector } from '../../features/rating/RatingParticipantSelector';
import { useRatingActions } from '../../hooks/rating/useRatingActions';
import { useRatingReport } from '../../hooks/rating/useRatingReport';
import { styles } from '../../features/screen-styles/app/rate/detail/index';
import { RatingReviewForm } from '../../features/rating/RatingReviewForm';
import { styles as ux } from '../../features/rating/ratingExperience.styles';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RideOverlayScope } from '@/features/navigation/RideOverlayProvider';

export default function RateScreen() {
  const { active, ratingScopeKey, selectedTags, setSelectedTags, submitInFlightRef, isSubmittingReview, setSubmitSuccessMessage, rating, showDialog, trip, tripId, rateTargetType, selectedPassenger, passengers, comment, createReview, captureRatingSession, goHomeAfterRating, goBackSafely, reportReason, isTripDriver, isTripPassenger, activeTab, setActiveTab, setRateTargetType, setSelectedPassenger, bookingsLoading, bookingsError, refetchBookings, setRating, rateTags, setComment, submitSuccessMessage, reportReasons, setReportReason } = useRatingData();

  const { getRatingText, toggleTag, handleSubmitRating } = useRatingActions({
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
    captureRatingSession,
    goHomeAfterRating,
  });
  const { handleSubmitReport, isSendingReport, reportSent } = useRatingReport({
    scopeKey: ratingScopeKey,
    targetId: rateTargetType === 'driver' ? trip?.driverId
      : passengers.find(passenger => passenger.id === selectedPassenger)?.id,
    tripId, reason: reportReason, description: comment, captureRatingSession,
  });

  const targetReady = Boolean(trip && (rateTargetType === 'driver' ? trip.driverId && !isTripDriver
    : passengers.some(passenger => passenger.id === selectedPassenger)));
  const locked = isSubmittingReview || isSendingReport || Boolean(submitSuccessMessage);
  const canSubmit = targetReady && !locked && (activeTab === 'rate' ? rating > 0 : Boolean(!reportSent && reportReason && comment.trim().length >= 10));

  return (
    <RideOverlayScope scopeKey={ratingScopeKey} active={active}>
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer la notation" onPress={goBackSafely} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {activeTab === 'report' ? 'Signaler un problème' : rateTargetType === 'passenger' ? 'Noter le passager' : 'Noter le conducteur'}
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'rate' && styles.tabActive]}
            disabled={locked} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'rate', disabled: locked }} onPress={() => setActiveTab('rate')}
          >
            <Text style={[styles.tabText, activeTab === 'rate' && styles.tabTextActive]}>
              Noter
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'report' && styles.tabActive]}
            disabled={locked} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'report', disabled: locked }} onPress={() => setActiveTab('report')}
          >
            <Text style={[styles.tabText, activeTab === 'report' && styles.tabTextActive]}>
              Signaler
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView 
        testID="rating-content-scroll"
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Onglet Notation */}
        {activeTab === 'rate' && (
          <Animated.View entering={FadeInDown}>
            {/* Info conducteur / passager */}
            <RatingParticipantSelector
              disabled={locked}
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

            {targetReady && <RatingReviewForm key={`${ratingScopeKey}:${rateTargetType}:${selectedPassenger ?? ''}`}
              rating={rating} setRating={setRating} getRatingText={getRatingText}
              selectedTags={selectedTags} toggleTag={toggleTag} rateTags={rateTags}
              comment={comment} setComment={setComment} disabled={locked} />}

            {submitSuccessMessage && (
              <View style={styles.successMessage}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={styles.successMessageText}>{submitSuccessMessage}</Text>
              </View>
            )}

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

            <RatingParticipantSelector
              disabled={locked} reporting
              isTripDriver={isTripDriver} rateTargetType={rateTargetType} trip={trip}
              selectedPassenger={selectedPassenger} passengers={passengers}
              isTripPassenger={isTripPassenger} setRateTargetType={setRateTargetType}
              setSelectedPassenger={setSelectedPassenger} bookingsLoading={bookingsLoading}
              bookingsError={bookingsError} refetchBookings={refetchBookings}
            />

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
                    disabled={locked || !targetReady}
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
            {Boolean(reportReason) && (
              <View style={styles.commentContainer}>
                <Text style={styles.commentTitle}>
                  Décrivez le problème (10 caractères minimum)
                </Text>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Décrivez précisément le problème rencontré..."
                  placeholderTextColor={Colors.gray[500]}
                  multiline
                  textAlignVertical="top"
                  value={comment}
                  onChangeText={setComment}
                  editable={!locked}
                  maxLength={500}
                />
                <Text style={styles.commentCounter}>
                  {comment.length}/500
                </Text>
              </View>
            )}

          </Animated.View>
        )}
      </ScrollView>
      <View testID="rating-submit-footer" style={ux.footer}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !canSubmit, busy: isSubmittingReview || isSendingReport }}
          style={[styles.submitButton, ux.footerButton, canSubmit
            ? activeTab === 'report' ? styles.submitButtonDanger : styles.submitButtonActive : styles.submitButtonDisabled]}
          onPress={activeTab === 'rate' ? handleSubmitRating : handleSubmitReport} disabled={!canSubmit}>
          {isSubmittingReview || isSendingReport ? <ActivityIndicator color={Colors.white} /> :
            <Text style={styles.submitButtonText}>{activeTab === 'report' ? reportSent ? 'Signalement envoyé' : 'Envoyer le signalement'
              : submitSuccessMessage ? 'Note envoyée' : 'Envoyer la note'}</Text>}
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </RideOverlayScope>
  );
}


