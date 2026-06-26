import type { Href } from 'expo-router';

type TripRequestCreateParams = {
  arrival?: string;
  departure?: string;
};

export function getTripRequestCreateHref(params?: TripRequestCreateParams): Href {
  const cleanParams = {
    ...(params?.departure?.trim() ? { departure: params.departure.trim() } : {}),
    ...(params?.arrival?.trim() ? { arrival: params.arrival.trim() } : {}),
  };

  return {
    pathname: '/request-create',
    ...(Object.keys(cleanParams).length > 0 ? { params: cleanParams } : {}),
  };
}

export function getTripRequestDetailHref(requestId: string | number): Href {
  return {
    pathname: '/request-details/[id]',
    params: { id: String(requestId) },
  };
}
