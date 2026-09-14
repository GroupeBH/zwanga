import { isAction, type Middleware, type ThunkDispatch, type UnknownAction } from '@reduxjs/toolkit';
import { getTripRequestExpirationAt, hasTripRequestExpired } from '@/features/trip-request/requestExpiration';
import { tripRequestApi } from '../api/tripRequestApi';

const requestEndpoints = [
  'getAvailableTripRequests', 'getMyTripRequests', 'getTripRequestById',
];
type ExpirationState = { [tripRequestApi.reducerPath]: ReturnType<typeof tripRequestApi.reducer> };
// A single local wake-up for all cached screens, without any HTTP polling.
// The bound also rechecks the clock after a device time change or a delayed timer.
const MAX_RECHECK_MS = 30_000;

export function createTripRequestExpirationMiddleware(): Middleware<
  object, ExpirationState, ThunkDispatch<ExpirationState, unknown, UnknownAction>
> {
  return store => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reconciling = false;
    const api = tripRequestApi;
    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const reconcile = () => {
      clearTimer();
      const state = store.getState();
      if (!state[api.reducerPath]?.config.focused || reconciling) return;
      reconciling = true;
      let nextDeadline = Infinity;
      const now = Date.now();
      const inspect = (request: Parameters<typeof getTripRequestExpirationAt>[0]) => {
        const deadline = getTripRequestExpirationAt(request);
        if (deadline !== null && deadline > now) nextDeadline = Math.min(nextDeadline, deadline);
        return hasTripRequestExpired(request, now);
      };
      try {
        const available = api.endpoints.getAvailableTripRequests.select()(state).data;
        if (available) {
          const expiredIds = new Set(available.filter(inspect).map(request => request.id));
          if (expiredIds.size) {
            store.dispatch(api.util.updateQueryData('getAvailableTripRequests', undefined,
              draft => draft.filter(request => !expiredIds.has(request.id))));
          }
        }

        const mine = api.endpoints.getMyTripRequests.select()(state).data;
        if (mine) {
          const expiredIds = new Set(mine.filter(request => inspect(request) && request.status !== 'expired')
            .map(request => request.id));
          if (expiredIds.size) {
            store.dispatch(api.util.updateQueryData('getMyTripRequests', undefined, draft => {
              for (const request of draft) {
                if (expiredIds.has(request.id)) request.status = 'expired';
              }
            }));
          }
        }

        for (const id of api.util.selectCachedArgsForQuery(state, 'getTripRequestById')) {
          const request = api.endpoints.getTripRequestById.select(id)(state).data;
          if (request && inspect(request) && request.status !== 'expired') {
            store.dispatch(api.util.updateQueryData('getTripRequestById', id, draft => {
              draft.status = 'expired';
            }));
          }
        }
      } finally {
        reconciling = false;
      }
      if (Number.isFinite(nextDeadline)) {
        timer = setTimeout(reconcile, Math.min(MAX_RECHECK_MS, Math.max(1, nextDeadline - now)));
      }
    };

    return next => action => {
      const result = next(action);
      if (!isAction(action) || reconciling) return result;
      if (api.util.resetApiState.match(action) || api.internalActions.onFocusLost.match(action)) {
        clearTimer();
        return result;
      }
      const endpointName = (action as { meta?: { arg?: { endpointName?: string } } }).meta?.arg?.endpointName;
      const requestLoaded = action.type === `${api.reducerPath}/executeQuery/fulfilled`
        && endpointName && requestEndpoints.includes(endpointName);
      const requestPatched = api.internalActions.queryResultPatched.match(action)
        && requestEndpoints.some(name => action.payload.queryCacheKey.startsWith(`${name}(`));
      if (requestLoaded || requestPatched || api.internalActions.onFocus.match(action)
        || api.internalActions.removeQueryResult.match(action)) {
        reconcile();
      }
      return result;
    };
  };
}
