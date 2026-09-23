import { hasBookingDropoffCompleted, hasBookingPickupCompleted } from '@/features/driver-navigation/navigationBooking';
import type { BookingAutoProgressEvent, PickupNotice, Waypoint } from '@/features/driver-navigation/navigationModel';
import { PICKUP_NOTICE_PRIORITY } from '@/features/driver-navigation/pickupNoticePriority';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import { useCallback, useEffect, useRef } from 'react';
import type { useDriverNavigationNotices } from './useDriverNavigationNotices';

type Params = Pick<Parameters<typeof useDriverNavigationNotices>[0], 'tripId' | 'isScreenActive' | 'pickupNotice' |
  'pickupBypassConfirmation' | 'isMountedRef' | 'pickupBypassConfirmationRef' | 'pickupNoticeRef' |
  'setPickupNotice' | 'setPickupNoticeCountdown' | 'visibleBookings' | 'presentedPickupNoticeKeysRef' | 'highestPickupNoticePriorityRef'>;

/** One entry per booking; a second passenger never replaces the currently read notice. */
export function useDriverPickupNoticeQueue(params: Params) {
  const latest = useRef(params);
  latest.current = params;
  const pending = useRef(new Map<string, PickupNotice>());
  const eligible = useCallback((notice: PickupNotice) => {
    const p = latest.current;
    const booking = p.visibleBookings?.find(item => item.id === notice.waypoint.booking.id);
    return booking?.tripId === p.tripId && booking.status === 'accepted' &&
      !hasBookingPickupCompleted(booking) && !hasBookingDropoffCompleted(booking);
  }, []);
  const publish = useCallback((notice: PickupNotice) => {
    const p = latest.current;
    if (!p.isScreenActive || !p.isMountedRef.current) return;
    p.pickupNoticeRef.current = notice;
    p.setPickupNoticeCountdown(null);
    p.setPickupNotice(notice);
    const name = notice.waypoint.passenger.name || 'Le passager';
    const speech = notice.type === 'passenger_ready_pickup' ? `${name} s'est signalé au point de récupération.` :
      notice.type === 'parties_nearby' ? `${name} est là et prêt à être embarqué.` : `Vous êtes arrivé au point de récupération de ${name}.`;
    void Speech.stop().then(() => {
      const current = latest.current;
      if (current.isScreenActive && current.isMountedRef.current && current.pickupNoticeRef.current === notice)
        Speech.speak(speech, { language: 'fr-FR', rate: 0.95 });
    }).catch(() => { /* Voice is optional; the booking notice stays available. */ });
  }, []);
  const presentPickupNotice = useCallback((event: BookingAutoProgressEvent, waypoint: Waypoint) => {
    const p = latest.current;
    if (!p.isScreenActive || !p.isMountedRef.current || event.bookingId !== waypoint.booking.id ||
      !['driver_arrived_pickup', 'parties_nearby', 'passenger_ready_pickup'].includes(event.type)) return;
    const type = event.type as PickupNotice['type'];
    const notice: PickupNotice = { type, waypoint, distanceMeters: event.distanceMeters, detectedAt: event.detectedAt,
      expiresAt: event.expiresAt, pickupWaitSeconds: event.pickupWaitSeconds };
    if (waypoint.completed || !eligible(notice)) return;
    const key = `${type}:${event.bookingId}`;
    const priority = PICKUP_NOTICE_PRIORITY[type];
    if (p.presentedPickupNoticeKeysRef.current.has(key) || (p.highestPickupNoticePriorityRef.current.get(event.bookingId!) ?? -1) >= priority) return;
    p.presentedPickupNoticeKeysRef.current.add(key);
    p.highestPickupNoticePriorityRef.current.set(event.bookingId!, priority);
    if (!p.pickupBypassConfirmationRef.current && (!p.pickupNoticeRef.current || p.pickupNoticeRef.current.waypoint.booking.id === event.bookingId)) publish(notice);
    else pending.current.set(event.bookingId!, notice);
  }, [eligible, publish]);
  useEffect(() => {
    const p = latest.current;
    for (const [id, notice] of pending.current) if (!eligible(notice)) pending.current.delete(id);
    if (!p.isScreenActive || p.pickupNotice || p.pickupBypassConfirmation) return;
    const next = pending.current.entries().next().value;
    if (next) { pending.current.delete(next[0]); publish(next[1]); }
  }, [params.isScreenActive, params.pickupNotice, params.pickupBypassConfirmation, params.visibleBookings, eligible, publish]);
  useEffect(() => () => { pending.current.clear(); }, [params.tripId, params.isScreenActive]);
  return presentPickupNotice;
}
