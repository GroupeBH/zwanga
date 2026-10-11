import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { useGetTripRequestByIdQuery } from '@/store/api/tripRequestApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { dismissAcceptedRequestContact, type AcceptedRequestContactIntent } from '@/store/slices/rideEntrySlice';
import { ContactModalContent } from '@/features/navigation/NavigationContactModal';
import { getAcceptedRequestContact } from '@/features/request-detail/acceptedRequestContact';
import { ownsTrip } from '@/features/activity/tripParticipation';
import { canResumeRideFromPath, isRideNavigationPath } from '@/features/navigation/activeRideResume';

/** Global overlay survives the acceptance -> guidance transition, without another UIKit modal. */
export function AcceptedRequestContactCoordinator() {
  const authenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(state => state.auth.user?.id);
  const intent = useAppSelector(state => state.rideEntry.pending.find(item => item.userId === userId));
  const active = useAppIsActive();
  const pathname = usePathname();
  // Preserve external/payment flows and allow the incoming native route to close first.
  const allowed = canResumeRideFromPath(pathname) || isRideNavigationPath(pathname);
  return authenticated && active && allowed && intent
    ? <AcceptedContactPrompt key={`${intent.userId}:${intent.requestId}`} intent={intent} /> : null;
}

function AcceptedContactPrompt({ intent }: { intent: AcceptedRequestContactIntent }) {
  const dispatch = useAppDispatch();
  const request = useGetTripRequestByIdQuery(intent.requestId, { refetchOnMountOrArgChange: true, refetchOnReconnect: true });
  const fresh = !request.isFetching && !request.isError && (request.fulfilledTimeStamp ?? 0) >= intent.createdAt;
  const person = fresh ? getAcceptedRequestContact(request.currentData, intent.userId) : null;
  const tripId = person ? request.currentData?.tripId : null;
  const trip = useGetTripByIdQuery(tripId ?? '', { skip: !tripId, refetchOnMountOrArgChange: true });
  const tripReady = !tripId || (!trip.isFetching && !trip.isError && (trip.fulfilledTimeStamp ?? 0) >= intent.createdAt);
  const tripAllowed = !tripId || (ownsTrip(trip.currentData, intent.userId) &&
    ['upcoming', 'ongoing'].includes(trip.currentData?.status ?? ''));
  const close = () => dispatch(dismissAcceptedRequestContact(intent));
  useEffect(() => {
    if ((fresh && request.currentData && !person) || (tripReady && !tripAllowed)) {
      dispatch(dismissAcceptedRequestContact(intent));
    }
  }, [dispatch, fresh, intent, person, request.currentData, tripAllowed, tripReady]);
  const error = request.isError || Boolean(tripId && trip.isError);
  if ((fresh && request.currentData && !person) || (tripReady && !tripAllowed)) return null;
  return <ContactModalContent active contacts={person && tripReady && tripAllowed ? [person] : []}
    role="driver" onClose={close} title="Contactez votre passager"
    hint="Commande acceptée ! Confirmez ensemble le lieu de prise en charge. À utiliser à l’arrêt."
    closeLabel="Plus tard" loading={!error && (!fresh || !tripReady)}
    loadError={error ? 'Contact indisponible pour le moment. Vérifiez votre connexion.' : undefined}
    onRetry={() => { void request.refetch(); if (tripId) void trip.refetch(); }} />;
}
