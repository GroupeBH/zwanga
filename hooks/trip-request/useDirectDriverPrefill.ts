import { useEffect, useRef, useState } from 'react';
import { useGetPublicUserInfoQuery } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';
import { profileRequestDriver, routeUuid } from '@/features/trip-request/directDriverRequest';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import type { useRequestDraft } from './useRequestDraft';

/** Route params identify the driver, never supply trusted profile or price data. */
export function useDirectDriverPrefill(id: unknown, preferredType: unknown, active: boolean, draft: ReturnType<typeof useRequestDraft>) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const driverId = routeUuid(id);
  const key = `${userId}:${String(id)}`;
  const applied = useRef('');
  const [dismissed, setDismissed] = useState('');
  const wanted = id !== undefined && dismissed !== key;
  const enabled = useDisplayReadsEnabled(active && wanted && !!driverId && applied.current !== key);
  const query = useGetPublicUserInfoQuery(driverId, displayReadOptions(enabled));
  const { setTargetDriver, setSelectedVehicleTypes } = draft;
  useEffect(() => {
    if (!active || !wanted || applied.current === key || query.isError || !query.currentData) return;
    const choice = profileRequestDriver(query.currentData, userId, preferredType);
    if (!choice) return;
    applied.current = key;
    setSelectedVehicleTypes([choice.vehicleType]);
    setTargetDriver(choice);
  }, [active, wanted, key, userId, preferredType, query.currentData, query.isError, setTargetDriver, setSelectedVehicleTypes]);
  const blocked = wanted && applied.current !== key;
  return { blocked, error: blocked && (!driverId || query.isError || (!!query.currentData && !profileRequestDriver(query.currentData, userId, preferredType))),
    retry: () => { if (enabled && !query.isFetching) void query.refetch(); },
    dismiss: () => { setDismissed(key); setTargetDriver(null); },
  };
}
