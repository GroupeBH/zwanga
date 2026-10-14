import type { KycDocument } from '@/types';
import type { DiditKycSession } from '@/store/api/user/identityContracts';

/** A native expiry report is not permission to create another paid verification. */
export async function checkDiditExpiryRecovery(
  session: DiditKycSession,
  sync: () => Promise<KycDocument | null>,
): Promise<'approved' | 'unavailable'> {
  if (!session.sessionId) return 'unavailable';
  const kyc = await sync();
  if (!kyc || kyc.provider !== 'didit' || kyc.diditSessionId !== session.sessionId) return 'unavailable';
  return kyc.status === 'approved' ? 'approved' : 'unavailable';
}
