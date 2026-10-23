import type { Href } from 'expo-router';

type Tag = 'AccountActivity' | 'Wallet' | 'Referral' | 'DriverSettlement' | 'PaymentHistory' |
  'Subscription' | 'Booking' | 'User' | 'KycStatus' | 'Vehicle' | 'AppUpdate' |
  { type: 'Message' | 'Conversation'; id: string };

/** Push payloads are hints, never balances or identity authority. Reload REST
 * data for foreground delivery and taps using the same policy as inbox routing. */
export function notificationEffects(input: Record<string, unknown> | null | undefined): { tags: Tag[]; href: Href | null } {
  const nested = input?.data && typeof input.data === 'object' ? input.data : {};
  const data = { ...nested, ...input } as Record<string, unknown>;
  const type = typeof data.type === 'string' ? data.type.toLowerCase().replace(/-/g, '_') : '';
  const tags: Tag[] = ['AccountActivity'];
  let href: Href | null = null;
  if (type.startsWith('wallet_') || ['cash_commission_debt', 'cash_commission_low_balance', 'driver_pro_trial_started'].includes(type)) {
    tags.push('Wallet');
    if (type !== 'wallet_loyalty_reward' || data.relatedEntityType === 'welcome_bonus') href = '/wallet';
  }
  if (type.startsWith('referral_')) { tags.push('Referral'); href = '/referrals'; }
  if (type.startsWith('driver_withdrawal_') || ['driver_trip_revenue', 'driver_booking_earning_confirmed'].includes(type)) {
    tags.push('DriverSettlement'); href = '/driver-earnings';
  }
  if (['kyc_approved', 'kyc_rejected'].includes(type)) {
    tags.push('User', 'KycStatus', 'Vehicle', 'Subscription', 'Wallet', 'Referral', 'DriverSettlement');
    href = '/(tabs)/profile';
  }
  if (['payment_succeeded', 'payment_failed', 'payment_cancelled'].includes(type)) {
    tags.push('PaymentHistory');
    switch (data.purpose) {
      case 'subscription_pro': tags.push('Subscription', 'User'); href = '/(tabs)/profile'; break;
      case 'trip_booking': tags.push('Booking', 'DriverSettlement'); href = '/bookings'; break;
      case 'wallet_top_up': case 'wallet_payout': tags.push('Wallet'); href = '/wallet'; break;
      case 'referral_payout': tags.push('Referral'); href = '/referrals'; break;
      case 'driver_payout': tags.push('DriverSettlement'); href = '/driver-earnings'; break;
    }
  }
  if (type === 'app_update') { tags.push('AppUpdate'); href = '/app-update'; }
  const conversationId = data.conversationId;
  if (typeof conversationId === 'string' && /^[a-zA-Z0-9_-]+$/.test(conversationId)) {
    tags.push({ type: 'Message', id: conversationId }, { type: 'Conversation', id: conversationId }, { type: 'Conversation', id: 'LIST' });
    if (!href) href = { pathname: '/chat/[id]', params: { id: conversationId } };
  }
  return { tags, href };
}
