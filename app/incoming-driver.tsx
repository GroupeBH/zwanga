import { useLocalSearchParams } from 'expo-router';
import { IncomingBookingRedirect } from '@/features/notifications/IncomingBookingRedirect';
import { IncomingDispatchRedirect } from '@/features/notifications/IncomingDispatchRedirect';

/** Keep existing notification links, but use the regular detail screens to answer. */
export default function IncomingDriverScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: string; driverId?: string }>();
  const key = `${params.kind}:${params.id}:${params.driverId}`;
  if (params.kind === 'booking') return <IncomingBookingRedirect key={key} />;
  return <IncomingDispatchRedirect key={key} />;
}
