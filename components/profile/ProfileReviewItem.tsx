import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import type { Review } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** The same review presentation in the profile preview and the complete list. */
export const ProfileReviewItem = memo(function ProfileReviewItem({ review }: { review: Review }) {
  return (
    <View style={styles.reviewItem}>
      <View style={styles.reviewItemHeader}>
        <View>
          <Text style={styles.reviewAuthor}>{review.fromUserName ?? 'Utilisateur'}</Text>
          <Text style={styles.reviewDate}>{new Date(review.createdAt).toLocaleDateString('fr-FR')}</Text>
        </View>
        <View style={styles.reviewRating}>
          <Ionicons name="star" size={16} color={Colors.secondary} />
          <Text style={styles.reviewRatingText}>{review.rating.toFixed(1)}</Text>
        </View>
      </View>
      {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  reviewItem: {
    backgroundColor: Colors.gray[50], borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  reviewItemHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  reviewAuthor: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  reviewDate: { fontSize: 10, color: Colors.gray[500] },
  reviewRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reviewRatingText: { fontSize: 12, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  reviewComment: { fontSize: FontSizes.sm, color: Colors.gray[700], lineHeight: 18 },
});
