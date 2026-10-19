import type { KycDocument, ProfileSummary } from '@/types';
import { getProfileStatus } from '@/features/profile/profileStatusModel';
import { getEffectiveKycStatus } from '@/utils/kycStatus';

/** Prefer the most recently confirmed, account-bound server snapshot, never a JWT
 * role or an OR of historical approvals. A revocation must also reach the form. */
export function accountIdentitySnapshot(userId: string | undefined,
  profile: { data?: ProfileSummary; fulfilledTimeStamp?: number },
  kyc: { data?: KycDocument | null; fulfilledTimeStamp?: number }) {
  const status = getProfileStatus(profile.data, userId);
  const document = !userId ? undefined : kyc.data === null ? null : kyc.data?.userId === userId ? kyc.data : undefined;
  const hasKyc = Boolean(userId) && (kyc.data === null || Boolean(document));
  const useProfile = status.isIdentityStatusKnown &&
    (!hasKyc || (profile.fulfilledTimeStamp ?? 0) >= (kyc.fulfilledTimeStamp ?? 0));
  const known = useProfile || hasKyc;
  const effective = useProfile ? getEffectiveKycStatus(status.kycStatus) : getEffectiveKycStatus(document);
  return { known, status: known ? effective : undefined,
    approved: known && effective === 'approved', document };
}
