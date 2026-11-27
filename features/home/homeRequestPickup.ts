import type { Booking, Trip, TripRequest } from '@/types';
import { hasPassengerFinishedRide, ownsTrip } from '@/features/activity/tripParticipation';
import { pickupMapUrl, pickupSummaryPresentation, type RequestPickupSummary } from '@/features/request-detail/requestPickupSummary';

/** Private participation, not discovery: neither dismissal nor departure time expires an assignment. */
export function selectHomeRequestPickup(requests: readonly TripRequest[], bookings: readonly Booking[] | undefined,
  userId?: string, refreshedTrip?: Trip, occupiedTrip?: Trip | null, now = Date.now()) {
  if (!userId || ownsTrip(occupiedTrip, userId)) return null;
  const personalBookings = new Map(bookings?.filter(item => item.passengerId === userId).map(item => [item.tripId, item]));
  return requests.filter(request => {
    if (request.passengerId !== userId || request.status !== 'driver_selected'
      || !request.selectedDriverId || request.selectedDriverId === userId) return false;
    if (occupiedTrip && occupiedTrip.id !== request.tripId) return false;
    const booking = request.tripId ? personalBookings.get(request.tripId) : undefined;
    // Activity excludes old completed bookings, but requests may remain driver_selected.
    // Only bridge a short hydration race after a NEW assignment; do not resurrect history.
    const assignmentAge = now - Date.parse(request.selectedAt ?? '');
    if (request.tripId && bookings && !booking && !(assignmentAge >= -30_000 && assignmentAge < 120_000)) return false;
    if (booking && (booking.status !== 'accepted' || hasPassengerFinishedRide(booking)
      || booking.pickedUp || booking.pickedUpAt || booking.pickedUpConfirmedByPassenger || booking.pickedUpConfirmedAt)) return false;
    const trip = refreshedTrip?.id === request.tripId ? refreshedTrip : booking?.trip;
    return !trip || (trip.id === request.tripId && ['upcoming', 'ongoing'].includes(trip.status)
      && trip.driverId === request.selectedDriverId);
  }).sort((a, b) => {
    const date = (r: TripRequest) => Date.parse(r.departureDateMin) || 0;
    return date(a) - date(b) || a.id.localeCompare(b.id);
  })[0] ?? null;
}

/** An older response for the same request must not reveal the previous driver's GPS after reassignment. */
export function homeRequestPickupPresentation(data: RequestPickupSummary | undefined, request: TripRequest,
  userId: string | undefined, now: number) {
  if (data?.viewerRole !== 'passenger' || data.driver.id !== request.selectedDriverId
    || data.tripId !== (request.tripId ?? null)) return null;
  const model = pickupSummaryPresentation(data, request.id, userId, now);
  if (!model) return null;
  const position = model.person.position;
  const age = now - Date.parse(position?.updatedAt ?? '');
  const driverPosition = pickupMapUrl(position) && age >= -30_000 && age < 120_000 ? position : null;
  return { ...model, driverPosition, pickupPosition: pickupMapUrl(data.pickup.coordinates) ? data.pickup.coordinates : null,
    // Even a valid cached summary cannot make an expired GPS point current again.
    message: model.status === 'estimated' && !driverPosition ? 'Position du conducteur en attente' : model.message,
    time: driverPosition ? model.time : null, pickup: data.pickup, vehicleDetails: data.vehicle ?? null };
}

export function homePickupRegion(points: ({ latitude: number; longitude: number } | null)[]) {
  const valid = points.filter(point => pickupMapUrl(point)) as { latitude: number; longitude: number }[];
  if (!valid.length) return undefined;
  const lats = valid.map(point => point.latitude), lngs = valid.map(point => point.longitude);
  return { latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(0.008, (Math.max(...lats) - Math.min(...lats)) * 1.6),
    longitudeDelta: Math.max(0.008, (Math.max(...lngs) - Math.min(...lngs)) * 1.6) };
}
