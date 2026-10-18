import { isDriverAccount } from '@/utils/accountRole';

type Recipient = { id?: string; role?: unknown } | null | undefined;

export function canShowRequestNotification(data: Record<string, unknown> | null | undefined, user: Recipient): boolean {
  if (!['trip_request', 'new_trip_request', 'trip_request_nearby', 'driver_dispatch_offer'].includes(String(data?.type))) return true;
  return isDriverAccount(user) && Boolean(user?.id) && (!data?.driverId || data.driverId === user?.id);
}

// Translate old inbox entries as well, without changing API types or unrelated requests (withdrawals, support...).
export function orderNotificationText(text: string, data: Record<string, unknown> | null): string {
  const type = String(data?.type ?? '');
  if (!type.startsWith('trip_request') && !['new_trip_request', 'driver_dispatch_offer', 'driver_offer', 'offer_accepted'].includes(type)) return text;
  return text.replace(/\b(Demande|demande)(s?)\b/g, (_, word: string, plural: string) =>
    `${word[0] === 'D' ? 'Commande' : 'commande'}${plural}`);
}
