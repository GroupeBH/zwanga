import { FETCH_TIMEOUT_MS } from './passengerTrackingPolicy';
import { getRtkErrorStatus } from './passengerTrackingErrors';
import { handle401Error } from '@/services/tokenRefresh';
import { store } from '@/store';
import { bookingApi } from '@/store/api/bookingApi';
import { tripApi } from '@/store/api/tripApi';

export const getBookingSnapshot = async (bookingId: string) => {
  const dispatchRequest = async () => {
    const request = store.dispatch(
      bookingApi.endpoints.getBookingById.initiate(bookingId, {
        forceRefetch: true,
        subscribe: false,
      }),
    );
    const timeout = setTimeout(() => request.abort(), FETCH_TIMEOUT_MS);

    try {
      return await request;
    } finally {
      clearTimeout(timeout);
      request.unsubscribe();
    }
  };

  let result = await dispatchRequest();
  if (getRtkErrorStatus(result.error) === 401 && (await handle401Error())) {
    result = await dispatchRequest();
  }

  return result;
};

export const getTripSnapshot = async (tripId: string) => {
  const dispatchRequest = async () => {
    const request = store.dispatch(
      tripApi.endpoints.getTripById.initiate(tripId, {
        forceRefetch: true,
        subscribe: false,
      }),
    );
    const timeout = setTimeout(() => request.abort(), FETCH_TIMEOUT_MS);

    try {
      return await request;
    } finally {
      clearTimeout(timeout);
      request.unsubscribe();
    }
  };

  let result = await dispatchRequest();
  if (getRtkErrorStatus(result.error) === 401 && (await handle401Error())) {
    result = await dispatchRequest();
  }

  return result;
};
