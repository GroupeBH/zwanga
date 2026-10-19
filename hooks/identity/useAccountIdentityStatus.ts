import { useCallback, useMemo } from 'react';
import { useGetKycStatusQuery, useGetProfileSummaryQuery } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';
import { selectHasAuthenticatedSession, selectUser } from '@/store/selectors';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useDisplayRefetch } from '@/hooks/useDisplayReads';
import { screenReadOptions } from '@/features/performance/screenReadPolicy';
import { accountIdentitySnapshot } from '@/features/identity/accountIdentitySnapshot';

/** One shared pair of reads at authenticated entry/resume, no polling. RTK Query
 * coalesces concurrent screen subscriptions; quick returns reuse a 30s snapshot. */
export function useAccountIdentityStatus() {
  const user = useAppSelector(selectUser);
  const authenticated = useAppSelector(selectHasAuthenticatedSession);
  const active = useAppIsActive();
  const enabled = Boolean(authenticated && user?.id && active);
  const options = { ...screenReadOptions(enabled), refetchOnReconnect: true };
  const profile = useGetProfileSummaryQuery(undefined, options);
  const kyc = useGetKycStatusQuery(undefined, options);
  const identity = accountIdentitySnapshot(authenticated ? user?.id : undefined, profile, kyc);
  const refreshProfile = useDisplayRefetch(enabled, `identity-profile:${user?.id}`, profile.refetch);
  const refreshDocument = useDisplayRefetch(enabled, `identity-document:${user?.id}`, kyc.refetch);
  const refreshKycStatus = useCallback(async () => {
    await Promise.all([refreshProfile(), refreshDocument()]);
  }, [refreshProfile, refreshDocument]);
  const isChecking = enabled && (profile.isFetching || kyc.isFetching || profile.isUninitialized || kyc.isUninitialized);
  const hasIdentityReadError = Boolean(!identity.approved && (profile.isError || kyc.isError));
  return useMemo(() => ({
    isIdentityVerified: identity.approved,
    isIdentityStatusKnown: identity.known,
    kycStatus: identity.status ?? undefined,
    kycDocument: identity.document,
    isChecking,
    hasIdentityReadError,
    refreshKycStatus,
  }), [identity.approved, identity.known, identity.status, identity.document, isChecking, hasIdentityReadError, refreshKycStatus]);
}
