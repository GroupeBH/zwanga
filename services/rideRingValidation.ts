export type RideRingVerdict = 'allowed' | 'denied' | 'unavailable' | 'expired';
const pending = new Map<string, Promise<RideRingVerdict>>();
const revisions = new Map<string, number>();
const grants = new Map<string, { until: number; request: string; revision: number }>();
export const needsRideRingValidation = (data: Record<string, unknown>) =>
  data.type === 'trip_request_nearby' || data.type === 'driver_dispatch_offer';

/** Invalidate checks already in flight even if the incoming card is not known yet. */
export function invalidateRideRingValidation(requestId: string) {
  revisions.set(requestId, (revisions.get(requestId) ?? 0) + 1);
  if (revisions.size > 256) revisions.delete(revisions.keys().next().value!);
}

/** Short publication lease only, not a cached substitute for an HTTP check. */
export function rideRingValidationIsCurrent(data: Record<string, unknown>): boolean {
  if (!needsRideRingValidation(data)) return true;
  const grant = grants.get(String(data.ringValidationToken ?? ''));
  return !!grant && grant.until > Date.now() &&
    (revisions.get(grant.request) ?? 0) === grant.revision;
}

/** No cached positive verdict: a push is a hint, not permission to ring. */
export async function checkRideRing(data: Record<string, unknown>): Promise<RideRingVerdict> {
  if (!needsRideRingValidation(data)) return 'allowed';
  const token = data.ringValidationToken;
  const deadline = Date.parse(String(data.ringUntil ?? ''));
  if (Number.isFinite(deadline) && deadline <= Date.now()) return 'expired';
  // A legacy inbox row without a transport permit is not a refusal/decision.
  if (typeof token !== 'string' || token.length > 256 || !token || !Number.isFinite(deadline)) return 'unavailable';
  const request = String(data.tripRequestId ?? '');
  const revision = revisions.get(request) ?? 0;
  const key = `${token}:${revision}`;
  const current = pending.get(key);
  if (current) return current;
  if (pending.size >= 8) return 'unavailable';
  let expired = false;
  let operation: { abort(): void; reset(): void } | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const check = (async () => {
    try {
      const network = (async (): Promise<RideRingVerdict> => {
        const [{ store }, { rideRingApi }] = await Promise.all([import('@/store'), import('@/store/api/rideRingApi')]);
        if (expired) return 'unavailable';
        const request = store.dispatch(rideRingApi.endpoints.validateRideRing.initiate(token, { track: false }));
        operation = request;
        const result = await request.unwrap();
        return result?.allowed === true ? 'allowed' : result?.allowed === false ? 'denied' : 'unavailable';
      })();
      const timeout = new Promise<RideRingVerdict>(resolve => {
        timer = setTimeout(() => { expired = true; operation?.abort(); resolve('unavailable'); }, 3000);
      });
      let verdict = await Promise.race([network, timeout]);
      if ((revisions.get(request) ?? 0) !== revision) verdict = 'denied';
      else if (deadline <= Date.now()) verdict = 'expired';
      if (verdict === 'allowed') {
        grants.set(token, { until: Math.min(deadline, Date.now() + 3000), request, revision });
        if (grants.size > 100) grants.delete(grants.keys().next().value!);
      } else grants.delete(token);
      return verdict;
    } catch { grants.delete(token); return 'unavailable' as const; }
    finally { clearTimeout(timer!); operation?.reset(); pending.delete(key); }
  })();
  pending.set(key, check);
  return check;
}

/** Fresh publishers remain fail-closed, without turning network failure into a decision. */
export async function validateRideRing(data: Record<string, unknown>): Promise<boolean> {
  return await checkRideRing(data) === 'allowed';
}

/** Renew only a lease previously granted to this delivery, never a terminal
 * invalidation. Slow native bridges do not extend the business deadline. */
export async function refreshRideRingValidation(data: Record<string, unknown>): Promise<RideRingVerdict> {
  if (rideRingValidationIsCurrent(data)) return 'allowed';
  const grant = grants.get(String(data.ringValidationToken ?? ''));
  if (!grant || (revisions.get(grant.request) ?? 0) !== grant.revision) return 'denied';
  return checkRideRing(data);
}
