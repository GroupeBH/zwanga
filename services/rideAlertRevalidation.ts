import { AppState } from 'react-native';
import { parseDriverInvitation } from '@/features/notifications/driverInvitation';
import { parseNearbyPhoneAlert } from '@/features/notifications/rideSound';
import { checkRideRing, needsRideRingValidation } from './rideRingValidation';
import { pendingRideEntryAlerts, pauseRideAlertValidation } from './rideAlertSession';
import { dismissDriverInvitation } from '@/services/driverNotifications';
import { getTokenSessionVersion } from './tokenSession';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';

type Job = { cancel(): void; promise: Promise<void> };
const jobs = new Map<string, Job>();

export function cancelRideAlertRevalidation(userId: string) { jobs.get(userId)?.cancel(); }

/** At most three foreground checks per entry/reconnect, shared by both triggers.
 * An offline/expired sound stays a silent navigation candidate, never a refusal. */
export function revalidatePendingRideAlerts(userId: string): Promise<void> {
  if (AppState.currentState !== 'active') return Promise.resolve();
  const existing = jobs.get(userId);
  if (existing) return existing.promise;
  const session = getTokenSessionVersion();
  let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const current = () => !cancelled && session === getTokenSessionVersion() && AppState.currentState === 'active';
  const job: Job = { promise: Promise.resolve(), cancel: () => {
    cancelled = true; clearTimeout(timer); wake?.();
    if (jobs.get(userId) === job) jobs.delete(userId);
  } };
  jobs.set(userId, job);
  let candidates = pendingRideEntryAlerts(userId).filter(alert => needsRideRingValidation(alert.data));
  for (const alert of candidates) pauseRideAlertValidation(alert.key, true);
  // Start in a microtask so synchronous store notifications cannot start a second job.
  job.promise = Promise.resolve().then(async () => {
    for (let attempt = 0; attempt < 3 && current(); attempt++) {
      let retry = false;
      const latest = new Map(pendingRideEntryAlerts(userId).map(alert => [alert.key, alert]));
      const alerts = candidates.map(alert => latest.get(alert.key)).filter(alert => alert !== undefined);
      candidates = [];
      await Promise.all(alerts.map(async alert => {
        const verdict = await checkRideRing(alert.data);
        if (!current()) return;
        if (verdict === 'allowed') pauseRideAlertValidation(alert.key, false);
        else if (verdict === 'denied') {
          const invitation = parseDriverInvitation(alert.data) ?? parseNearbyPhoneAlert(alert.data);
          if (invitation) await boundedRideAudio(dismissDriverInvitation(invitation));
        } else if (verdict === 'unavailable') { retry = true; candidates.push(alert); }
      }));
      if (!retry || attempt === 2 || !current()) break;
      await new Promise<void>(resolve => { wake = resolve; timer = setTimeout(resolve, 3000 * (attempt + 1)); });
    }
  }).catch(() => reportRideAudioFailure('RING_REVALIDATION_FAILED')).finally(() => {
    clearTimeout(timer);
    if (jobs.get(userId) === job) jobs.delete(userId);
  });
  return job.promise;
}
