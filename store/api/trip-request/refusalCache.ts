import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';
import type { baseApi } from '../baseApi';
import type { tripRequestApi } from '../tripRequestApi';

type CacheState = { [tripRequestApi.reducerPath]: ReturnType<typeof tripRequestApi.reducer> };

/** Only called after a confirmed refusal in the same authenticated session. */
export const hideRefusedRequest = (requestId: string, sharedApi: typeof baseApi) => (
  dispatch: ThunkDispatch<CacheState, unknown, UnknownAction>, getState: () => CacheState,
) => {
  // Endpoints share this API; avoid eagerly loading every trip module in a background notification.
  const api = sharedApi as typeof tripRequestApi;
  const state = getState();
  dispatch(api.util.updateQueryData('getAvailableTripRequests', undefined,
    requests => requests.filter(request => request.id !== requestId)));
  for (const args of api.util.selectCachedArgsForQuery(state, 'getAvailableRequestPage')) {
    dispatch(api.util.updateQueryData('getAvailableRequestPage', args, page => {
      const previous = page.data.length;
      page.data = page.data.filter(request => request.id !== requestId);
      if (page.data.length !== previous) page.total = Math.max(0, page.total - 1);
    }));
  }
};
