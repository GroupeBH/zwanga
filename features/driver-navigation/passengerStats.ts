import type { Waypoint } from './navigationModel';

/** A booking may represent a group: count seats, never merge different bookings by user id. */
export function getNavigationPassengerStats(waypoints: Waypoint[]) {
  const bookings = new Map<string, { id: string; name: string; seats: number; pickedUp: boolean; droppedOff: boolean }>();
  for (const waypoint of waypoints) {
    const seats = Number(waypoint.booking.numberOfSeats);
    const value = bookings.get(waypoint.booking.id) ?? { id: waypoint.booking.id, name: waypoint.passenger.name,
      seats: Number.isInteger(seats) && seats > 0 ? seats : 1, pickedUp: false, droppedOff: false };
    if (waypoint.type === 'pickup') value.pickedUp = waypoint.completed;
    else value.droppedOff = waypoint.completed;
    bookings.set(value.id, value);
  }
  const passengers = [...bookings.values()];
  const sum = (predicate: (item: typeof passengers[number]) => boolean) => passengers.reduce((total, item) => total + (predicate(item) ? item.seats : 0), 0);
  return {
    totalPassengers: sum(() => true), pendingPickups: sum(item => !item.pickedUp && !item.droppedOff),
    completedPickups: sum(item => item.pickedUp), pendingDropoffs: sum(item => !item.droppedOff),
    completedDropoffs: sum(item => item.droppedOff), inVehicle: sum(item => item.pickedUp && !item.droppedOff), passengers,
  };
}
