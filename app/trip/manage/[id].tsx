import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { DriverTripAccessGuard } from '@/components/trip/DriverTripAccessGuard';
import { useScreenIsActive } from '@/hooks/useAppIsActive';

/** Compatibility for saved links and notifications from older builds. Keep the
 * ownership guard, but never mount the former management controller or screen. */
export default function ManageTripScreen() {
  return <DriverTripAccessGuard><CanonicalTripDetail /></DriverTripAccessGuard>;
}

function CanonicalTripDetail() {
  const params = useLocalSearchParams();
  const active = useScreenIsActive();
  if (!active || typeof params.id !== 'string') return null;
  const forwarded: Record<string, string> & { id: string } = { id: params.id };
  for (const key of ['bookingId', 'section', 'openEdit', 'track']) {
    if (typeof params[key] === 'string') forwarded[key] = params[key];
  }
  return <Redirect href={{ pathname: '/trip/[id]', params: forwarded }} />;
}
