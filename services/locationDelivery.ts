/** Share recent confirmed deliveries across foreground and native task senders. */
import { BoundedCache } from '@/utils/boundedCache';

type DeliverySource = 'rest' | 'socket';
const deliveries = new BoundedCache<{ at: number; source: DeliverySource }>(16);
export function wasLocationDeliveredRecently(key: string, intervalMs: number, sender: DeliverySource) {
  const delivery = deliveries.get(key);
  // Preserve each sender's configured cadence. The longer window is cross-transport only.
  const windowMs = delivery?.source === sender ? Math.min(1000, intervalMs) : intervalMs;
  return delivery !== undefined && Date.now() - delivery.at < windowMs;
}
export function recordLocationDelivery(key: string, source: DeliverySource = 'rest') {
  deliveries.set(key, { at: Date.now(), source }, 60_000);
}
export function clearLocationDeliveries() { deliveries.clear(); }
