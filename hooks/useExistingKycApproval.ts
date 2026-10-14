import { useCallback } from 'react';
import { useDialog } from '@/components/ui/DialogProvider';
import { userApi, useLazyGetCurrentUserQuery, useLazyGetKycStatusQuery } from '@/store/api/userApi';
import { currentUserTag } from '@/store/api/user/identityContracts';
import { useAppDispatch } from '@/store/hooks';
import { getTokenSessionVersion } from '@/services/tokenSession';
import type { DiditKycFlowOutcome, UseDiditKycFlowOptions } from '@/features/identity/diditFlowTypes';

/** Read authoritative identity state before choosing or opening any provider. */
export function useExistingKycApproval({ onStatusRefresh, onApproved, approvedMessage }: UseDiditKycFlowOptions) {
  const [getKycStatus] = useLazyGetKycStatusQuery();
  const [getCurrentUser] = useLazyGetCurrentUserQuery();
  const { showDialog } = useDialog();
  const dispatch = useAppDispatch();

  return useCallback(async (showResultDialog: boolean): Promise<DiditKycFlowOutcome | null> => {
    const sessionVersion = getTokenSessionVersion();
    const assertCurrentSession = () => {
      if (sessionVersion !== getTokenSessionVersion())
        throw { status: 'FETCH_ERROR', error: 'La session a changé. Réessayez depuis votre profil.' };
    };
    const kyc = await getKycStatus(undefined, false).unwrap();
    assertCurrentSession();
    if (kyc?.status !== 'approved') return null;
    // No local role/status promotion: refresh the server profile and its caches.
    dispatch(userApi.util.invalidateTags([currentUserTag]));
    await getCurrentUser(undefined, false).unwrap();
    assertCurrentSession();
    await onStatusRefresh?.();
    assertCurrentSession();
    const outcome: DiditKycFlowOutcome = {
      kyc, status: 'approved', sessionId: kyc.diditSessionId ?? null,
      diditStatus: kyc.diditSessionStatus ?? null,
    };
    await onApproved?.(outcome);
    if (showResultDialog) showDialog({
      variant: 'success', title: 'Identité déjà vérifiée',
      message: approvedMessage ?? 'Votre identité est déjà vérifiée. Vous pouvez continuer.',
    });
    return outcome;
  }, [getKycStatus, getCurrentUser, onStatusRefresh, onApproved, approvedMessage, showDialog, dispatch]);
}
