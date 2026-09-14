import { Colors, Spacing } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileReviewsModal.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { ProfileReviewItem } from './ProfileReviewItem';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'insets'
  | 'reviews'
  | 'reviewsModalVisible'
  | 'setReviewsModalVisible'
>;

export function ProfileReviewsModal({
  insets,
  reviews,
  reviewsModalVisible,
  setReviewsModalVisible,
}: Props) {
  return (<Modal
    visible={reviewsModalVisible}
    transparent
    animationType="fade"
    onRequestClose={() => setReviewsModalVisible(false)}
  >
    <View style={styles.reviewsModalOverlay}>
      <Animated.View
        entering={FadeInDown}
        style={[styles.reviewsModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
      >
        <View style={styles.reviewsModalHeader}>
          <Text style={styles.reviewsModalTitle}>Tous les avis</Text>
          <TouchableOpacity onPress={() => setReviewsModalVisible(false)}>
            <Ionicons name="close" size={22} color={Colors.gray[600]} />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.reviewsModalContent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
        >
          {(reviews ?? []).length === 0 ? (
            <Text style={styles.reviewsEmptyText}>{"Vous n'avez pas encore reçu d'avis."}</Text>
          ) : (
            reviews?.map((review) => (
              <ProfileReviewItem key={review.id} review={review} />
            ))
          )}
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>);
}
