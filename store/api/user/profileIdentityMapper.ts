import type { KycDocument, ProfileSummary } from '@/types';

/** Match backend driverRequirements: latest createdAt, then id descending.
 * Only retain presentation fields, not document URLs or provider metadata.
 */
export function mapProfileIdentity(documents: unknown, userId: string): ProfileSummary['identity'] {
  if (!Array.isArray(documents)) return undefined;
  if (documents.length === 0) return null;
  const valid = documents.every(doc => doc &&
    ['approved', 'pending', 'rejected'].includes(doc.status) &&
    (!doc.userId || doc.userId === userId) &&
    (documents.length === 1 || (Number.isFinite(Date.parse(doc.createdAt)) && typeof doc.id === 'string')));
  if (!valid) return undefined;
  const latest: KycDocument = [...documents].sort((a, b) => {
    const dateDifference = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (dateDifference) return dateDifference;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  })[0];
  return {
    status: latest.status,
    provider: latest.provider,
    diditSessionStatus: latest.diditSessionStatus,
    rejectionReason: latest.rejectionReason,
  };
}
