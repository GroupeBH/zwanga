import { useEffect } from 'react';
import type { TripRequest } from '@/types';
import { passengerOfferAlerts } from '@/features/request-detail/passengerOfferAlert';
import { driverOfferAcceptanceAlert } from '@/features/request-detail/driverOfferAcceptanceAlert';
import { rememberRideAlert } from '@/services/rideAlertSession';

/** REST fallback uses the existing detail read, not another poll or notification. */
export function usePassengerOfferNotice(request: TripRequest | undefined, userId: string | undefined,
  enabled: boolean, readStartedAt: number | undefined) {
  useEffect(() => {
    if (!enabled || !request || !userId || readStartedAt === undefined) return;
    for (const alert of passengerOfferAlerts(request, userId, readStartedAt)) rememberRideAlert(alert);
    const accepted = driverOfferAcceptanceAlert(request, userId);
    if (accepted) rememberRideAlert(accepted);
  }, [request, userId, enabled, readStartedAt]);
}
