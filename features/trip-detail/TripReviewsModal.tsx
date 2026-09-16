import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { Trip } from '@/types';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Review } from '@/types';

interface TripReviewsModalProps {
  reviewsModalVisible: boolean;
  setReviewsModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  insets: EdgeInsets;
  trip: Trip | undefined;
  driverReviewCount: number;
  driverReviews: Review[] | undefined;
}

export function TripReviewsModal({
  reviewsModalVisible,
  setReviewsModalVisible,
  insets,
  trip,
  driverReviewCount,
  driverReviews,
}: TripReviewsModalProps) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={reviewsModalVisible}
      onRequestClose={() => setReviewsModalVisible(false)}
    >
      <View style={styles.reviewsModalOverlay}>
        <Animated.View entering={FadeInDown} style={[styles.reviewsModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
          <View style={styles.reviewsModalHeader}>
            <Text style={styles.reviewsModalTitle}>Avis sur {trip?.driverName}</Text>
            <TouchableOpacity onPress={() => setReviewsModalVisible(false)}>
              <Ionicons name="close" size={20} color={Colors.gray[600]} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.reviewsModalContent}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
            showsVerticalScrollIndicator={false}
          >
            {driverReviewCount === 0 ? (
              <Text style={styles.reviewsEmptyText}>Pas encore d&apos;avis pour ce conducteur.</Text>
            ) : (
              driverReviews?.map((review) => (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewItemHeader}>
                    <Text style={styles.reviewAuthor}>{review.fromUserName ?? 'Utilisateur'}</Text>
                    <View style={styles.reviewRating}>
                      <Ionicons name="star" size={16} color={Colors.secondary} />
                      <Text style={styles.reviewRatingText}>{review.rating.toFixed(1)}</Text>
                    </View>
                  </View>
                  <Text style={styles.reviewDate}>
                    {new Date(review.createdAt).toLocaleDateString('fr-FR')}
                  </Text>
                  {review.comment ? (
                    <Text style={styles.reviewComment}>{review.comment}</Text>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
