import type { KycDocument } from '@/types';
import type { DiditKycSession } from '@/store/api/user/identityContracts';

/** A native expiry report is not permission to create another paid verification. */
export async function checkDiditExpiryRecovery(
  session: DiditKycSession,
  sync: () => Promise<KycDocument | null>,
): Promise<'browser' | 'approved' | 'unavailable'> {
  if (!session.sessionId) return 'unavailable';
  const kyc = await sync();
  if (!kyc || kyc.provider !== 'didit' || kyc.diditSessionId !== session.sessionId) return 'unavailable';
  if (kyc.status === 'approved') return 'approved';
  if (kyc.status !== 'pending') return 'unavailable';
  const providerStatus = kyc.diditSessionStatus?.trim().toLowerCase();
  if (!providerStatus || !['not started', 'in progress', 'resubmitted'].includes(providerStatus)) return 'unavailable';
  if (session.expiresAt && (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now())) return 'unavailable';
  try {
    const url = new URL(session.url);
    // Only the original Didit flow, never a token in an arbitrary external URL.
    return url.protocol === 'https:' && url.hostname === 'verify.didit.me' &&
      !url.username && !url.password && (!url.port || url.port === '443') &&
      /^\/(?:[a-z]{2}\/)?session\/[^/]+\/?$/.test(url.pathname) ? 'browser' : 'unavailable';
  } catch { return 'unavailable'; }
}
