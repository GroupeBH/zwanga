/** Incoming work for a driver, not responses to an order placed as a passenger.
 * Missing ownership on legacy pushes is unknown, never guessed from account role. */
export function isSelfDriverAlert(
  data: Record<string, unknown> | null | undefined,
  recipientId: unknown = data?.driverId,
): boolean {
  if (!data || !['trip_request', 'new_trip_request', 'trip_request_nearby',
    'driver_dispatch_offer', 'new_booking'].includes(String(data.type))) return false;
  return typeof recipientId === 'string' && recipientId.length > 0 &&
    typeof data.passengerId === 'string' && data.passengerId.toLowerCase() === recipientId.toLowerCase();
}
