import type { KycDocument, KycStatus } from '@/types';

const normalizeDiditStatus = (status?: string | null) =>
  String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');

/**
 * Didit creates a session before the user submits any identity data. The
 * backend currently persists that new session as `pending`, while its Didit
 * status is still `Not Started`. For the UI, that state must remain unverified
 * rather than being presented as a verification under review.
 */
export const getEffectiveKycStatus = (
  kyc?: Pick<KycDocument, 'status' | 'provider' | 'diditSessionStatus'> | null,
): KycStatus | null => {
  if (!kyc) {
    return null;
  }

  const isUnstartedDiditSession =
    kyc.provider === 'didit' &&
    kyc.status === 'pending' &&
    normalizeDiditStatus(kyc.diditSessionStatus) === 'not started';

  return isUnstartedDiditSession ? null : kyc.status;
};
