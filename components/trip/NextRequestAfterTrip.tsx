import { useRouter } from 'expo-router';
import { HomeRequestModal } from '@/components/home/HomeRequestModal';
import { useNextRequestAfterTrip } from '@/hooks/driver-navigation/useNextRequestAfterTrip';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';

/** Lives inside the existing navigation/manage overlay scope, never a new native modal. */
export function NextRequestAfterTrip(props: Parameters<typeof useNextRequestAfterTrip>[0] & {
  onOpenRequestDetail?: (id: string) => void;
}) {
  const decision = useNextRequestAfterTrip(props);
  const router = useRouter();
  return <HomeRequestModal key={`${decision.userId}:${props.trip?.id}`} {...decision} router={router}
    onOpenRequestDetail={props.onOpenRequestDetail}
    priority={RIDE_OVERLAY_PRIORITY.information} />;
}
