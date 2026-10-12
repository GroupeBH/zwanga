import type { AwsKycSession } from './awsKycContracts';

export function awsKycPollingInterval(session: AwsKycSession | undefined, foreground: boolean, newAttempt: boolean): number {
  if (!foreground || newAttempt || !session || session.status !== 'pending' || session.state === 'failed') return 0;
  return session.state === 'review' ? 30_000 : 5000;
}

// A push is only a signal to fetch /users/me again, never proof of approval or role.
export function isKycDecisionNotification(data: Record<string, unknown>, currentUserId?: string): boolean {
  return Boolean(currentUserId && (data.type === 'kyc_approved' || data.type === 'kyc_rejected') &&
    typeof data.kycId === 'string' && data.kycId && (!data.userId || data.userId === currentUserId));
}
