import type { AccountActivity, ActivityCategory } from '@/store/api/accountActivityApi';
import type { ReconciledActivity } from '@/services/activityReadiness';

interface ListRead { data?: readonly unknown[]; isSuccess: boolean; isFetching?: boolean; isError?: boolean; fulfilledTimeStamp?: number }

/** An unchanged fresh summary can validate an earlier reconciled list. Its HTTP
 * completion time alone does not mean the lists must be fetched all over again. */
export function isEntryActivityListReady(category: ActivityCategory, list: ListRead, options: {
  userId: string; since: number; summary?: AccountActivity; summaryTime?: number; reconciled?: ReconciledActivity | null;
}) {
  const { summary, reconciled, userId, since, summaryTime } = options;
  if (summary?.userId === userId && summary[category]?.count === 0) return true;
  if (!list.isSuccess || list.isFetching || list.isError || !Array.isArray(list.data)) return false;
  const timestamp = list.fulfilledTimeStamp;
  if (timestamp === undefined || !Number.isFinite(timestamp)) return false;
  const receipt = reconciled?.userId === userId ? reconciled.reads[category] : undefined;
  if (summary?.userId === userId && receipt && receipt.revision === summary[category]?.revision &&
    receipt.fulfilledTimeStamp === timestamp) return true;
  // Compatibility with the existing lists-only discovery on older backends.
  return timestamp >= Math.max(since, summary ? summaryTime ?? since : since);
}
