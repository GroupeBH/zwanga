import { usablePhone, type NavigationContact } from '@/features/navigation/navigationContacts';
import type { TripRequestPassengerContact } from '@/store/api/trip-request/contracts';

/** The server grants access; guard mismatched responses and use its remaining lifetime. */
export function getRequestContactSelection(response: TripRequestPassengerContact, requestId: string,
  userId: string | undefined, startedAt: number, validUntil?: number) {
  if (response?.requestId !== requestId || !userId || !response.passenger?.id || response.passenger.id === userId) return null;
  const remaining = Date.parse(response.expiresAt) - Date.parse(response.serverNow);
  // Starting before the HTTP call conservatively includes network latency and avoids clock skew.
  const expiresAt = Math.min(startedAt + remaining, validUntil ?? Infinity);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const contact: NavigationContact = { id: response.passenger.id, name: response.passenger.name || 'Passager',
    phone: usablePhone(response.passenger.phone), detail: 'Discutez du prix avant d’accepter.' };
  return { contacts: [contact], expiresAt };
}
