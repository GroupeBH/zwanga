import React from 'react';
import { HistoryPagination } from '@/components/ui/HistoryPagination';
import type { useHistoryCursor } from '@/hooks/useHistoryCursor';

export function ReferralPageControls({ cursor, query, active }: {
  cursor: ReturnType<typeof useHistoryCursor>;
  query: { currentData?: { nextCursor: string | null }; isFetching: boolean; isError: boolean; refetch: () => unknown };
  active: boolean;
}) {
  return <HistoryPagination page={cursor.page} hasNext={Boolean(query.currentData?.nextCursor)}
    busy={!active || query.isFetching} error={query.isError}
    onPrevious={() => { if (active) cursor.previous(); }}
    onNext={() => { if (active) cursor.next(query.currentData?.nextCursor); }}
    onRetry={() => { if (active) query.refetch(); }} />;
}
