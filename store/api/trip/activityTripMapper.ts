import type { Trip } from '@/types';
import { buildPaymentNotice, type DriverPaymentNotice } from '@/features/driver-payments/paymentNoticeModel';
import { mapServerBookingToClient } from '../booking/bookingMapper';
import type { ServerBooking } from '../booking/serverTypes';
import type { ServerTrip } from './serverTypes';
import { mapServerTripToClient } from './tripMapper';
import { driverReviewCompletion, type ReviewCompletion } from '@/features/store-review/reviewEligibility';

// The authenticated driver's trip response already contains these bookings. Reuse it
// instead of fetching every trip's bookings again from a global timer.
export type ActivityTrip = Trip & { paymentNotices: DriverPaymentNotice[]; reviewCompletion: ReviewCompletion | null };
export type ServerActivityTrip = Omit<ServerTrip, 'bookings'> & { bookings?: ServerBooking[] };

export function mapActivityTrip(response: ServerActivityTrip): ActivityTrip {
  const trip = mapServerTripToClient(response as ServerTrip);
  const bookings = (response.bookings ?? []).map(booking => mapServerBookingToClient({ ...booking, tripId: trip.id }));
  const paymentNotices = bookings.flatMap(booking => {
    const notice = buildPaymentNotice(booking, trip);
    return notice ? [notice] : [];
  });
  return { ...trip, paymentNotices, reviewCompletion: driverReviewCompletion(trip, bookings) };
}
