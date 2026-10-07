import { skipToken } from '@reduxjs/toolkit/query';
import { useMemo } from 'react';
import { useGetAppUpdateQuery } from '@/store/api/appUpdatesApi';
import { readInstalledApp } from '@/features/app-updates/nativeVersion';
import { isNewerRelease } from '@/features/app-updates/updatePolicy';
import { useScreenIsActive } from './useAppIsActive';

export function useAppUpdate() {
  const installed = useMemo(readInstalledApp, []);
  const active = useScreenIsActive();
  const query = useGetAppUpdateQuery(installed ?? skipToken, {
    skip: !active, refetchOnMountOrArgChange: 3600,
  });
  const release = !query.isError && query.currentData?.enabled && isNewerRelease(query.currentData.release, installed) ? query.currentData.release : null;
  return { ...query, installed, release, active };
}
