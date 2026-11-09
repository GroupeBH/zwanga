import { useContext } from 'react';
import { RideOverlayVisibilityContext } from '@/features/navigation/rideOverlayContext';
import { usePaymentAnnouncement } from '@/hooks/notifications/usePaymentAnnouncement';
import type { RideEntryMessage } from '@/services/rideEntryAnnouncement';

/** Render inside the modal: its producer must not subscribe to its own JSX entry. */
export function PaymentModalAnnouncement({ message, enabled }: { message: RideEntryMessage | null; enabled: boolean }) {
  const shown = useContext(RideOverlayVisibilityContext);
  usePaymentAnnouncement(message, enabled && shown);
  return null;
}
