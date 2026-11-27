import { skipToken } from '@reduxjs/toolkit/query';
import { useMemo } from 'react';
import { useGetAppUpdateQuery } from '@/store/api/appUpdatesApi';
import { readInstalledApp } from '@/features/app-updates/nativeVersion';
import { isNewerRelease } from '@/features/app-updates/updatePolicy';
import { useScreenIsActive } from './useAppIsActive';

export function useAppUpdate(enabled = true) {
  const installed = useMemo(readInstalledApp, []);
  const screenActive = useScreenIsActive();
  const active = screenActive && enabled;
  const query = useGetAppUpdateQuery(installed ?? skipToken, {
    skip: !active, refetchOnMountOrArgChange: 60,
    pollingInterval: active ? 300000 : 0,
    refetchOnReconnect: true,
  });
  const release = active && !query.isFetching && !query.isError && query.currentData?.enabled && isNewerRelease(query.currentData.release, installed) ? query.currentData.release : null;
  return { ...query, installed, release, active };
}
