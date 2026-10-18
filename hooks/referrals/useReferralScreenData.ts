import { useRef } from 'react';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useHistoryCursor } from '@/hooks/useHistoryCursor';
import { useAppSelector } from '@/store/hooks';
import { useGetMyReferralSummaryQuery, useGetMyReferralPageQuery,
  useGetMyReferralRewardPageQuery, useGetMyReferralWithdrawalPageQuery } from '@/store/api/referralApi';

export function useReferralScreenData() {
  const active = useScreenIsActive();
  const userId = useAppSelector(state => state.auth.user?.id);
  const enabled = active && Boolean(userId);
  const latestScope = useRef({ enabled, userId }); latestScope.current = { enabled, userId };
  const peopleCursor = useHistoryCursor(`referrals:${userId}`);
  const rewardsCursor = useHistoryCursor(`rewards:${userId}`);
  const withdrawalsCursor = useHistoryCursor(`withdrawals:${userId}`);
  const options = { skip: !enabled, refetchOnFocus: false, refetchOnReconnect: true,
    refetchOnMountOrArgChange: 30, pollingInterval: 0 };
  const summaryQuery = useGetMyReferralSummaryQuery(undefined, options);
  const peopleQuery = useGetMyReferralPageQuery({ before: peopleCursor.before, limit: 20 }, options);
  const rewardsQuery = useGetMyReferralRewardPageQuery({ before: rewardsCursor.before, limit: 8 }, options);
  const withdrawalsQuery = useGetMyReferralWithdrawalPageQuery({ before: withdrawalsCursor.before, limit: 5 }, options);
  const refreshAll = async () => {
    if (!latestScope.current.enabled || latestScope.current.userId !== userId) return;
    await Promise.allSettled([summaryQuery.refetch(), peopleQuery.refetch(), rewardsQuery.refetch(), withdrawalsQuery.refetch()]);
  };
  return { active: enabled, summary: summaryQuery.data, isLoading: summaryQuery.isLoading,
    summaryError: summaryQuery.isError, refetchSummary: summaryQuery.refetch, refreshAll,
    refreshing: [summaryQuery, peopleQuery, rewardsQuery, withdrawalsQuery].some(query => query.isFetching),
    peopleQuery, rewardsQuery, withdrawalsQuery, peopleCursor, rewardsCursor, withdrawalsCursor };
}
