import { Colors, Spacing } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileReviewsModal.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import { HistoryPagination } from '@/components/ui/HistoryPagination';
import { useHistoryCursor } from '@/hooks/useHistoryCursor';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled, useDisplayReadData, useDisplayRefetch } from '@/hooks/useDisplayReads';
import { useGetReviewPageQuery } from '@/store/api/reviewApi';
import {
  FlatList,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { ProfileReviewItem } from './ProfileReviewItem';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'insets'
  | 'reviewsModalVisible'
  | 'setReviewsModalVisible'
> & { userId?: string };

export function ProfileReviewsModal({
  insets,
  userId,
  reviewsModalVisible,
  setReviewsModalVisible,
}: Props) {
  const active = useScreenIsActive();
  const enabled = useDisplayReadsEnabled(active && reviewsModalVisible && Boolean(userId));
  const cursor = useHistoryCursor(userId ?? '');
  const query = useGetReviewPageQuery({ userId: userId ?? '', before: cursor.before, limit: 20 }, displayReadOptions(enabled));
  const scope = `${userId}:${cursor.before ?? ''}`;
  const page = useDisplayReadData(scope, query.currentData);
  const retry = useDisplayRefetch(enabled, scope, query.refetch);
  return (<Modal
    inApp
    visible={active && reviewsModalVisible}
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
        <FlatList
          style={styles.reviewsModalContent}
          data={page?.data ?? []}
          keyExtractor={review => review.id}
          renderItem={({ item }) => <ProfileReviewItem review={item} />}
          initialNumToRender={6} maxToRenderPerBatch={6} windowSize={3}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
          ListEmptyComponent={<Text style={styles.reviewsEmptyText}>{!enabled ? 'Connectez-vous à Internet pour charger les avis.' :
            query.isFetching ? 'Chargement des avis…' : query.isError ? 'Avis indisponibles pour le moment.' : "Vous n'avez pas encore reçu d'avis."}</Text>}
          ListFooterComponent={<HistoryPagination page={cursor.page} hasNext={Boolean(page?.nextCursor)}
            busy={!enabled || query.isFetching} error={query.isError} onPrevious={cursor.previous}
            onNext={() => cursor.next(page?.nextCursor)} onRetry={() => { void retry(); }} />}
        />
      </Animated.View>
    </View>
  </Modal>);
}
