import { getTokenSessionVersion } from './tokenSession';
import { boundedRideAudio } from './rideAudioDiagnostics';
import type { DriverAlertRecovery } from '@/store/api/driverAlertRecoveryApi';

export async function readDriverAlertRecovery(userId: string, signal: AbortSignal): Promise<DriverAlertRecovery> {
  const session = getTokenSessionVersion();
  const current = () => !signal.aborted && session === getTokenSessionVersion();
  const [{ store }, { driverAlertRecoveryApi }] = await boundedRideAudio(Promise.all([
    import('@/store'), import('@/store/api/driverAlertRecoveryApi'),
  ]), 3000);
  if (!current() || store.getState().auth.user?.id !== userId) throw new Error('RIDE_RECOVERY_CANCELLED');
  const request = store.dispatch(driverAlertRecoveryApi.endpoints.readDriverAlertRecovery.initiate({ userId, session }));
  const abort = () => request.abort();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const result = await boundedRideAudio(request.unwrap(), 8000);
    if (!current()) throw new Error('RIDE_RECOVERY_CANCELLED');
    return result;
  } finally {
    signal.removeEventListener('abort', abort);
    // Private read: no cancellation of shared detail/profile queries.
    request.abort(); request.reset();
  }
}
