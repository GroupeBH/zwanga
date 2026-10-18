import { useGetReviewPageQuery } from '@/store/api/reviewApi';
import { useHistoryCursor } from './useHistoryCursor';
import { displayReadOptions, useDisplayReadData, useDisplayReadsEnabled, useDisplayRefetch } from './useDisplayReads';

export function usePublicReviewPage(userId: string, active: boolean) {
  const enabled = useDisplayReadsEnabled(active && Boolean(userId));
  const cursor = useHistoryCursor(userId);
  const query = useGetReviewPageQuery({ userId, before: cursor.before, limit: 20 }, displayReadOptions(enabled));
  const scope = `${userId}:${cursor.before ?? ''}`;
  const page = useDisplayReadData(scope, query.currentData);
  const refetch = useDisplayRefetch(enabled, scope, query.refetch);
  return { reviews: page?.data, total: page?.total ?? 0, refetch,
    pagination: { page: cursor.page, hasNext: Boolean(page?.nextCursor),
      busy: !enabled || query.isFetching, error: query.isError,
      onPrevious: cursor.previous, onNext: () => cursor.next(page?.nextCursor),
      onRetry: () => { void refetch(); } } };
}
