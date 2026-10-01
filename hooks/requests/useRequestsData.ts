import { useCallback, useMemo } from 'react';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { selectUserCoordinates } from '@/store/selectors';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetAvailableTripRequestsQuery, useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import { isDriverAccount } from '@/utils/accountRole';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { rankRequestsByProximity } from '@/features/trip-request/requestPriority';
import { EMPTY_REQUESTS, rankOwnRequests, type RequestTab } from '@/features/requests/requestsListModel';

const noCoordinates = () => null;

export function useRequestsData(activeTab: RequestTab) {
  const isActive = useScreenIsActive();
  const profile = useGetCurrentUserQuery(undefined, {
    skip: !isActive, refetchOnMountOrArgChange: 30,
    refetchOnFocus: isActive, refetchOnReconnect: false,
  });
  const user = profile.data;
  const coordinates = useAppSelector(isActive && activeTab === 'available' ? selectUserCoordinates : noCoordinates);
  const needsProfile = activeTab === 'available' && !user?.id;
  const availableEnabled = isActive && activeTab === 'available' && !needsProfile;
  const ownEnabled = isActive && activeTab === 'my-requests';
  const available = useGetAvailableTripRequestsQuery(undefined, {
    skip: !availableEnabled, pollingInterval: availableEnabled ? 60_000 : 0,
    refetchOnMountOrArgChange: 30, skipPollingIfUnfocused: true,
    refetchOnFocus: availableEnabled, refetchOnReconnect: false,
  });
  const own = useGetMyTripRequestsQuery(undefined, {
    skip: !ownEnabled, pollingInterval: ownEnabled ? 60_000 : 0,
    refetchOnMountOrArgChange: 30, skipPollingIfUnfocused: true,
    refetchOnFocus: ownEnabled, refetchOnReconnect: false,
  });
  const query = activeTab === 'available' ? available : own;
  const profilePending = profile.isLoading || profile.isFetching || profile.isUninitialized;
  const records = needsProfile ? EMPTY_REQUESTS : query.data ?? EMPTY_REQUESTS;
  const requests = useMemo(() => activeTab === 'available'
    ? rankRequestsByProximity(records.filter(request => request.passengerId !== user?.id), coordinates)
    : rankOwnRequests(records), [activeTab, records, user?.id, coordinates]);
  const refresh = useCallback(() => {
    if (!isActive) return;
    if (needsProfile) {
      if (!profile.isFetching && !profile.isUninitialized) void profile.refetch();
    } else if (!query.isFetching && !query.isUninitialized) void query.refetch();
  }, [isActive, needsProfile, profile, query]);

  return {
    requests,
    isDriver: isDriverAccount(user),
    isLoading: needsProfile ? profilePending : query.isLoading || (query.isUninitialized && isActive),
    isFetching: needsProfile ? profile.isFetching : query.isFetching,
    isError: needsProfile ? profile.isError || !profilePending : query.isError,
    hasData: !needsProfile && query.data !== undefined,
    proximityAvailable: Boolean(coordinates && normalizeTripMapCoordinate(coordinates.latitude, coordinates.longitude)),
    refresh,
  };
}
