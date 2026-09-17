import type { Trip } from '@/types';
import { buildPaymentNotice, type DriverPaymentNotice } from '@/features/driver-payments/paymentNoticeModel';
import { mapServerBookingToClient } from '../booking/bookingMapper';
import type { ServerBooking } from '../booking/serverTypes';
import type { ServerTrip } from './serverTypes';
import { mapServerTripToClient } from './tripMapper';

// The authenticated driver's trip response already contains these bookings. Reuse it
// instead of fetching every trip's bookings again from a global timer.
export type ActivityTrip = Trip & { paymentNotices: DriverPaymentNotice[] };
export type ServerActivityTrip = Omit<ServerTrip, 'bookings'> & { bookings?: ServerBooking[] };

export function mapActivityTrip(response: ServerActivityTrip): ActivityTrip {
  const trip = mapServerTripToClient(response as ServerTrip);
  const paymentNotices = (response.bookings ?? []).flatMap(booking => {
    const notice = buildPaymentNotice(mapServerBookingToClient({ ...booking, tripId: trip.id }), trip);
    return notice ? [notice] : [];
  });
  return { ...trip, paymentNotices };
}
