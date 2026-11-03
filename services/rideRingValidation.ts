const pending = new Map<string, Promise<boolean>>();
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
export async function validateRideRing(data: Record<string, unknown>): Promise<boolean> {
  if (!needsRideRingValidation(data)) return true;
  const token = data.ringValidationToken;
  const deadline = Date.parse(String(data.ringUntil ?? ''));
  if (typeof token !== 'string' || token.length > 256 || !token || !(deadline > Date.now())) return false;
  const request = String(data.tripRequestId ?? '');
  const revision = revisions.get(request) ?? 0;
  const key = `${token}:${revision}`;
  const current = pending.get(key);
  if (current) return current;
  if (pending.size >= 8) return false;
  let expired = false;
  let operation: { abort(): void; reset(): void } | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const check = (async () => {
    try {
      const network = (async () => {
        const [{ store }, { rideRingApi }] = await Promise.all([import('@/store'), import('@/store/api/rideRingApi')]);
        if (expired) return false;
        const request = store.dispatch(rideRingApi.endpoints.validateRideRing.initiate(token, { track: false }));
        operation = request;
        const result = await request.unwrap();
        return result?.allowed === true;
      })();
      const timeout = new Promise<boolean>(resolve => {
        timer = setTimeout(() => { expired = true; operation?.abort(); resolve(false); }, 3000);
      });
      const allowed = await Promise.race([network, timeout]) && deadline > Date.now() &&
        (revisions.get(request) ?? 0) === revision;
      if (allowed) {
        grants.set(token, { until: Math.min(deadline, Date.now() + 3000), request, revision });
        if (grants.size > 100) grants.delete(grants.keys().next().value!);
      } else grants.delete(token);
      return allowed;
    } catch { return false; }
    finally { clearTimeout(timer!); operation?.reset(); pending.delete(key); }
  })();
  pending.set(key, check);
  return check;
}
