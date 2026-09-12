import { styles } from '@/features/profile/ProfileReviewsSection.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import React from 'react';
import {
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { ProfileReviewItem } from './ProfileReviewItem';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'featuredReviews'
  | 'reviewAverage'
  | 'reviewCount'
  | 'setReviewsModalVisible'
>;

export function ProfileReviewsSection({
  featuredReviews,
  reviewAverage,
  reviewCount,
  setReviewsModalVisible,
}: Props) {
  return (<View style={styles.reviewsContainer}>
    <View style={styles.reviewsCard}>
      <View style={styles.reviewsHeader}>
        <View>
          <Text style={styles.reviewsTitle}>Vos avis reçus</Text>
          <Text style={styles.reviewsSubtitle}>
            {reviewCount} avis · note moyenne {reviewAverage.toFixed(1)}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.reviewsLinkButton, reviewCount === 0 && styles.reviewsLinkButtonDisabled]}
          onPress={() => setReviewsModalVisible(true)}
          disabled={reviewCount === 0}
        >
          <Text style={[styles.reviewsLinkText, reviewCount === 0 && styles.reviewsLinkTextDisabled]}>
            Voir tout
          </Text>
        </TouchableOpacity>
      </View>
      {reviewCount === 0 ? (
        <Text style={styles.reviewsEmptyText}>
          {"Vous n'avez pas encore reçu d'avis. Continuez à proposer des trajets sécurisés pour en recevoir."}
        </Text>
      ) : (
        featuredReviews.map((review) => (
          <ProfileReviewItem key={review.id} review={review} />
        ))
      )}
    </View>
  </View>);
}
