import type { User } from '@/types';

export type AccountPhoneGate = 'off' | 'checking' | 'required' | 'verified' | 'unavailable';

export function accountPhoneGate(input: {
  enabled: boolean;
  authenticated: boolean;
  userId?: string;
  profile?: Pick<User, 'id' | 'phone' | 'isPhoneVerified'>;
}): AccountPhoneGate {
  if (!input.enabled || !input.authenticated) return 'off';
  const { profile, userId } = input;
  if (!userId || !profile || profile.id !== userId) return 'checking';
  if (profile.isPhoneVerified === true) return 'verified';
  if (profile.isPhoneVerified === false && profile.phone?.trim()) return 'required';
  // Unknown schema / missing number is not proof of either verification or failure.
  return 'unavailable';
}
