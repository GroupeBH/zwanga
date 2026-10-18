import { normalizeReferralShareLink } from '@/utils/shareReferralLink';

/** Encode the server's invitation URL, never a user ID or a guessed registration URL. */
export function referralQrLink(value?: string | null): string | null {
  const link = normalizeReferralShareLink(value);
  if (!link || link.length > 512) return null;
  const url = new URL(link);
  return url.username || url.password ? null : link;
}

export type ReferralQrState =
  | { phase: 'loading' }
  | { phase: 'ready'; link: string; code: string }
  | { phase: 'error' };

export const REFERRAL_QR_ERROR = 'Impossible de préparer votre QR code. Vérifiez votre connexion puis réessayez.';
