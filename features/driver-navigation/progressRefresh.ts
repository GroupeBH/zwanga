import type { BookingAutoProgressEvent } from '@/services/trackingSocket.types';

const PROXIMITY_EVENTS = new Set<BookingAutoProgressEvent['type']>([
  'driver_near_pickup', 'driver_arrived_pickup', 'parties_nearby',
  'passenger_ready_pickup', 'passenger_near_destination', 'driver_near_destination',
]);

/** Notices consume every sample; REST only needs business changes. The periodic
 * booking read remains the fallback for a missed socket event. */
export function createDriverProgressRefresh(refresh: () => Promise<unknown>) {
  let disposed = false, running = false, dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (disposed || running || timer || !dirty) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed) return;
      dirty = false;
      running = true;
      void Promise.resolve().then(refresh).catch(() => undefined).finally(() => {
        running = false;
        schedule(); // A change received during the read needs a fresh snapshot.
      });
    }, 1000);
  };
  return {
    receive(events: BookingAutoProgressEvent[]) {
      if (disposed || !events.some(event => !PROXIMITY_EVENTS.has(event.type))) return;
      dirty = true;
      schedule();
    },
    dispose() { disposed = true; dirty = false; if (timer) clearTimeout(timer); },
  };
}
