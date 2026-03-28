import type { Href } from 'expo-router';

export function getTripRequestCreateHref(): Href {
  return {
    pathname: '/request-create',
  };
}

export function getTripRequestDetailHref(requestId: string | number): Href {
  return {
    pathname: '/request-details/[id]',
    params: { id: String(requestId) },
  };
}
