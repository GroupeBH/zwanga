import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';

/** Coalesce map UI updates only; arrival/boarding events are never delayed here. */
export function createDriverLocationDisplay(publish: (coordinate: NavigationCoordinate, timestamp: number) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPublished = -Infinity;
  let newestTimestamp = -Infinity;
  let pending: { coordinate: NavigationCoordinate; timestamp: number } | null = null;
  let disposed = false;
  const flush = () => {
    timer = undefined;
    if (disposed || !pending) return;
    const sample = pending;
    pending = null;
    lastPublished = Date.now();
    publish(sample.coordinate, sample.timestamp);
  };
  return {
    push(coordinate: NavigationCoordinate, timestamp: number) {
      if (disposed || timestamp <= newestTimestamp) return;
      newestTimestamp = timestamp;
      pending = { coordinate, timestamp };
      const delay = Math.max(0, 2000 - (Date.now() - lastPublished));
      if (!delay) { if (timer) clearTimeout(timer); flush(); }
      else if (!timer) timer = setTimeout(flush, delay);
    },
    dispose() { disposed = true; pending = null; if (timer) clearTimeout(timer); timer = undefined; },
  };
}
