import type { Waypoint } from './navigationModel';

export type PassengerPanelItem = {
  id: string;
  name: string;
  seats: number;
  status: 'waiting' | 'onboard' | 'droppedOff';
  waypoint: Waypoint;
  isNext: boolean;
};

/** Presentation only: never reorder navigation waypoints or merge booking holders. */
export function buildPassengerPanelItems(waypoints: Waypoint[], currentWaypointIndex: number): PassengerPanelItem[] {
  const groups = new Map<string, { pickup?: Waypoint; dropoff?: Waypoint }>();
  for (const waypoint of waypoints) {
    const group = groups.get(waypoint.booking.id) ?? {};
    group[waypoint.type] = waypoint;
    groups.set(waypoint.booking.id, group);
  }
  const active: PassengerPanelItem[] = [];
  const completed: PassengerPanelItem[] = [];
  let next: PassengerPanelItem | undefined;
  const currentId = waypoints[currentWaypointIndex]?.id;
  for (const [id, { pickup, dropoff }] of groups) {
    const status = dropoff?.completed ? 'droppedOff' : pickup?.completed ? 'onboard' : 'waiting';
    const waypoint = status === 'waiting' ? pickup ?? dropoff : dropoff ?? pickup;
    if (!waypoint) continue;
    const seatCount = Number(waypoint.booking.numberOfSeats);
    const item: PassengerPanelItem = {
      id, name: waypoint.passenger.name || 'Passager',
      seats: Number.isInteger(seatCount) && seatCount > 0 ? seatCount : 1,
      status, waypoint, isNext: !waypoint.completed && waypoint.id === currentId,
    };
    if (item.isNext) next = item;
    else if (status === 'droppedOff') completed.push(item);
    else active.push(item);
  }
  return [...(next ? [next] : []), ...active, ...completed];
}

export function passengerPanelLabels(item: PassengerPanelItem) {
  return {
    status: item.status === 'waiting' ? 'À récupérer' : item.status === 'onboard' ? 'À bord' : 'Déposé',
    seats: `${item.seats} ${item.seats > 1 ? 'places' : 'place'}`,
    location: item.waypoint.type === 'pickup' ? 'Point de récupération' : 'Point de dépose',
  };
}
