import * as Location from 'expo-location';
import { subscribeRideLocation } from './rideLocationStream';

/** Subscribe immediately; the shared watcher obtains the fix without a blocking one-shot GPS read. */
export function subscribeBootstrappedRideLocation(
  key: string,
  options: Location.LocationOptions,
  listener: (location: Location.LocationObject) => void,
  maxAgeMs = 15_000,
  bootstrapTimeoutMs = 2000,
): Location.LocationSubscription {
  let removed = false;
  let bootstrapDone = false;
  let lastTimestamp = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finishBootstrap = () => { bootstrapDone = true; clearTimeout(timer); };
  const deliver = (location: Location.LocationObject) => {
    if (removed || !Number.isFinite(location.timestamp) || location.timestamp <= lastTimestamp) return;
    lastTimestamp = location.timestamp;
    listener(location);
  };
  const subscription = subscribeRideLocation(key, options, location => {
    finishBootstrap();
    deliver(location);
  });
  timer = setTimeout(finishBootstrap, bootstrapTimeoutMs);
  void Promise.resolve().then(() => Location.getLastKnownPositionAsync({
    maxAge: maxAgeMs, requiredAccuracy: 100,
  })).then(location => {
    if (removed || bootstrapDone) return;
    finishBootstrap();
    if (location && Date.now() - location.timestamp <= maxAgeMs && location.timestamp <= Date.now()
      && typeof location.coords.accuracy === 'number' && location.coords.accuracy >= 0
      && location.coords.accuracy <= 100) deliver(location);
  }).catch(finishBootstrap);
  return { remove() { if (removed) return; removed = true; finishBootstrap(); subscription.remove(); } };
}
