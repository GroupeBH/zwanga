import type { ProfileState, ProfileSummary } from '@/types';
import { readProfileState } from './profileStateContract';
import { isDriverAccount } from '@/utils/accountRole';
import { getEffectiveKycStatus } from '@/utils/kycStatus';

/** All profile status decisions share one account-bound /users/me response.
 * Missing data is not a passenger role, an empty vehicle list or rejected KYC.
 */
export function getProfileStatus(summary: ProfileSummary | undefined, accountId?: string) {
  const snapshot = accountId && summary?.user.id === accountId ? summary : undefined;
  const currentUser = snapshot?.user;
  const profileState = readProfileState(snapshot?.profileState, accountId);
  const kycStatus = profileState
    ? profileState.identity.status === 'not_started' ? null : { ...profileState.identity, status: profileState.identity.status }
    : snapshot?.identity;
  const isProfileStatusKnown = Boolean(currentUser);
  const isIdentityStatusKnown = isProfileStatusKnown && kycStatus !== undefined;
  const effectiveKycStatus = getEffectiveKycStatus(kycStatus);
  const isDriver = isDriverAccount(currentUser);
  const isKycApproved = effectiveKycStatus === 'approved';
  const count = profileState?.driver.activeVehicleCount ?? snapshot?.stats?.vehicles;
  const profileVehicleCount = typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : undefined;

  return {
    currentUser,
    profileState,
    profileRoleLabel: profileState?.driver.status === 'restricted' ? 'Compte limité'
      : isDriver && !profileState ? 'Profil conducteur'
      : isDriver && !profileState?.driver.canPublish ? 'Profil conducteur à compléter'
      : isDriver ? 'Conducteur' : 'Passager',
    stats: snapshot?.stats,
    kycStatus,
    isProfileStatusKnown,
    isIdentityStatusKnown,
    profileVehicleCount,
    isDriver,
    displaysDriverRole: isDriver,
    isKycApproved,
    isKycPending: effectiveKycStatus === 'pending',
    isKycRejected: effectiveKycStatus === 'rejected',
    needsDriverOnboarding: Boolean(profileState && !profileState.driver.canPublish),
  };
}

export function getProfilePriorityAction(status: {
  isPremiumActive: boolean;
  profileState?: ProfileState;
}): 'refresh' | 'onboarding' | 'support' | 'pro' | 'wallet' {
  if (!status.profileState) return 'refresh';
  if (status.profileState.driver.nextAction === 'contact_support') return 'support';
  if (status.profileState.driver.nextAction !== 'none') return 'onboarding';
  return status.isPremiumActive ? 'wallet' : 'pro';
}
