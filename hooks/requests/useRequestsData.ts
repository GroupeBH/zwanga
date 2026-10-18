import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistoryCursor } from '@/hooks/useHistoryCursor';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDisplayReadData, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useAppSelector } from '@/store/hooks';
import { selectUserCoordinates } from '@/store/selectors';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetAvailableRequestPageQuery, useGetMyRequestPageQuery } from '@/store/api/tripRequestApi';
import { isDriverAccount } from '@/utils/accountRole';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { rankRequestsByProximity } from '@/features/trip-request/requestPriority';
import { EMPTY_REQUESTS, rankOwnRequests, type RequestTab } from '@/features/requests/requestsListModel';

const noCoordinates = () => null;

export function useRequestsData(requestedTab: RequestTab, search = '') {
  const [querySearch, setQuerySearch] = useState(search.trim());
  useEffect(() => {
    if (search.trim() === querySearch) return;
    const timer = setTimeout(() => setQuerySearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search, querySearch]);
  const isActive = useScreenIsActive();
  const readsEnabled = useDisplayReadsEnabled(isActive);
  const profile = useGetCurrentUserQuery(undefined, {
    skip: !readsEnabled, refetchOnMountOrArgChange: 30,
    refetchOnFocus: false, refetchOnReconnect: false,
  });
  const user = profile.data;
  const isDriver = isDriverAccount(user);
  const activeTab: RequestTab = isDriver ? requestedTab : 'my-requests';
  const coordinates = useAppSelector(isActive && activeTab === 'available' ? selectUserCoordinates : noCoordinates);
  const needsProfile = !user?.id;
  const availableEnabled = readsEnabled && isDriver && activeTab === 'available' && !needsProfile;
  const ownEnabled = readsEnabled && activeTab === 'my-requests' && !needsProfile;
  const cursor = useHistoryCursor(`${user?.id}:${activeTab}:${querySearch}`);
  const args = { before: cursor.before, limit: 20, search: querySearch || undefined };
  const available = useGetAvailableRequestPageQuery(args, {
    skip: !availableEnabled, pollingInterval: availableEnabled ? 60_000 : 0,
    refetchOnMountOrArgChange: 30, skipPollingIfUnfocused: true,
    refetchOnFocus: false, refetchOnReconnect: false,
  });
  const own = useGetMyRequestPageQuery(args, {
    skip: !ownEnabled, pollingInterval: ownEnabled ? 60_000 : 0,
    refetchOnMountOrArgChange: 30, skipPollingIfUnfocused: true,
    refetchOnFocus: false, refetchOnReconnect: false,
  });
  const query = activeTab === 'available' ? available : own;
  const profilePending = profile.isLoading || profile.isFetching || profile.isUninitialized;
  const page = useDisplayReadData(`${user?.id}:${activeTab}:${querySearch}:${cursor.before ?? ''}`, query.currentData);
  const records = needsProfile ? EMPTY_REQUESTS : page?.data ?? EMPTY_REQUESTS;
  const requests = useMemo(() => activeTab === 'available'
    ? rankRequestsByProximity(records.filter(request => request.passengerId !== user?.id), coordinates)
    : rankOwnRequests(records.filter(request => request.passengerId === user?.id)), [activeTab, records, user?.id, coordinates]);
  const refresh = useCallback(() => {
    if (!readsEnabled) return;
    if (needsProfile) {
      if (!profile.isFetching && !profile.isUninitialized) void profile.refetch();
    } else if (!query.isFetching && !query.isUninitialized) void query.refetch();
  }, [readsEnabled, needsProfile, profile, query]);

  return {
    requests,
    activeTab,
    isDriver,
    isLoading: readsEnabled && (needsProfile ? profilePending : query.isLoading || query.isUninitialized),
    isFetching: readsEnabled && (needsProfile ? profile.isFetching : query.isFetching),
    isError: (isActive && !readsEnabled) || (needsProfile ? profile.isError || !profilePending : query.isError),
    hasData: !needsProfile && page !== undefined,
    pagination: { page: cursor.page, busy: !readsEnabled || needsProfile || query.isFetching,
      error: query.isError, hasNext: Boolean(page?.nextCursor), onPrevious: cursor.previous,
      onNext: () => cursor.next(page?.nextCursor), onRetry: refresh },
    proximityAvailable: Boolean(coordinates && normalizeTripMapCoordinate(coordinates.latitude, coordinates.longitude)),
    refresh,
  };
}
